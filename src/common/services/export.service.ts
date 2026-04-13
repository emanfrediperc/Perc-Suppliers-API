import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export type ExportColumnType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'cuit'
  | 'percent'
  | 'boolean';

export interface ExportColumn {
  /** Header label shown in the spreadsheet */
  header: string;
  /** Dot-notation path into the data object (e.g. "empresaProveedora.razonSocial") */
  key: string;
  /** Column data type — drives default alignment, numFmt, cell type */
  type?: ExportColumnType;
  /** Column width in Excel units. Defaults based on type if omitted. */
  width?: number;
  /** Override the default numFmt for the column type */
  numFmt?: string;
  /** Override the default alignment for the column type */
  align?: 'left' | 'center' | 'right';
  /** Escape hatch: runs before type-based coercion, e.g. to look up related data */
  format?: (value: any, item: any) => any;
}

export interface WorkbookSheetConfig {
  /** Tab label shown in Excel */
  name: string;
  columns: ExportColumn[];
  data: any[];
  /**
   * Optional totals row (rendered bold with top border).
   * Keys correspond to column keys; only numeric columns are typically filled,
   * and the first text column can have a "TOTAL" label.
   */
  totalsRow?: Record<string, string | number>;
  /** Optional per-sheet title override (defaults to workbook.title) */
  sheetTitle?: string;
  /** Optional per-sheet filter summary line */
  filterSummary?: string;
}

export interface WorkbookConfig {
  /** Report name, used as default title for all sheets */
  title: string;
  /** Defaults to new Date() at generation time */
  generatedAt?: Date;
  /** Global filter summary shown in each sheet's title row (unless overridden) */
  filterSummary?: string;
  /** One or more sheets to generate */
  sheets: WorkbookSheetConfig[];
}

// Styling constants
const HEADER_FILL_COLOR = 'FF4A90D9'; // brand blue
const HEADER_FONT_COLOR = 'FFFFFFFF';
const TITLE_FILL_COLOR = 'FFE5E7EB'; // light gray
const ZEBRA_FILL_COLOR = 'FFFAFAFA'; // very light gray
const BORDER_COLOR = 'FFD1D5DB'; // gray-300

// Row positions (1-indexed, ExcelJS convention)
const TITLE_ROW = 1;
const SPACER_ROW = 2;
const HEADER_ROW = 3;
const DATA_START_ROW = 4;

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: BORDER_COLOR } },
  left: { style: 'thin', color: { argb: BORDER_COLOR } },
  bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
  right: { style: 'thin', color: { argb: BORDER_COLOR } },
};

@Injectable()
export class ExportService {
  /**
   * Generate a multi-sheet Excel workbook with polished formatting.
   * Used directly for reports that need multiple tabs (e.g. préstamos, estado de cuenta).
   */
  async generateWorkbook(config: WorkbookConfig): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Perc Suppliers';
    workbook.created = config.generatedAt ?? new Date();
    workbook.title = config.title;

    for (const sheetConfig of config.sheets) {
      this.buildSheet(workbook, config, sheetConfig);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Generate a single-sheet Excel file.
   * Backward-compatible with the original signature — preserves existing callers
   * while automatically applying the new polish.
   */
  async generateExcel(
    data: any[],
    columns: ExportColumn[],
    sheetName = 'Datos',
    options: { title?: string; filterSummary?: string; totalsRow?: Record<string, string | number> } = {},
  ): Promise<Buffer> {
    return this.generateWorkbook({
      title: options.title ?? sheetName,
      filterSummary: options.filterSummary,
      sheets: [
        {
          name: sheetName,
          columns,
          data,
          totalsRow: options.totalsRow,
        },
      ],
    });
  }

  async generatePdf(
    data: any[],
    columns: ExportColumn[],
    title: string,
    options?: { filterSummary?: string; totalsRow?: Record<string, string | number> },
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 40,
        autoFirstPage: true,
        bufferPages: true,
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('error', reject);

      // ---- layout constants ----
      const MARGIN = 40;
      const pageWidth = doc.page.width - MARGIN * 2;

      // Compute column widths (Excel chars * 6 → points, proportionally capped to pageWidth)
      const rawWidths = columns.map((col) => (col.width ?? this.defaultWidthForType(col.type)) * 6);
      const totalRaw = rawWidths.reduce((s, w) => s + w, 0);
      const scale = totalRaw > pageWidth ? pageWidth / totalRaw : 1;
      const colWidths = rawWidths.map((w) => w * scale);

      const ROW_HEIGHT = 18;
      const HEADER_HEIGHT = 20;
      const GRAY_BG = '#F3F4F6';
      const DARK = '#1F2937';
      const BRAND = '#4A90D9';

      let y = MARGIN;

      // ---- helpers ----
      const formatCellValue = (raw: any, col: ExportColumn): string => {
        const preformatted = col.format ? col.format(raw, {}) : raw;
        if (preformatted === null || preformatted === undefined || preformatted === '') return '';
        switch (col.type) {
          case 'currency': {
            const n = this.toNumber(preformatted);
            return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          }
          case 'number':
            return this.toNumber(preformatted).toLocaleString('es-AR');
          case 'percent':
            return `${this.toNumber(preformatted).toFixed(2)} %`;
          case 'date': {
            const d = this.toDate(preformatted);
            return d ? this.formatDateShort(d) : String(preformatted);
          }
          case 'datetime': {
            const d = this.toDate(preformatted);
            return d ? this.formatDateTime(d) : String(preformatted);
          }
          case 'cuit':
            return this.formatCuit(String(preformatted));
          case 'boolean':
            return preformatted ? 'Sí' : 'No';
          default:
            return typeof preformatted === 'object' ? JSON.stringify(preformatted) : String(preformatted);
        }
      };

      const drawRow = (
        rowY: number,
        rowData: string[],
        opts: { bold?: boolean; bgColor?: string; topBorder?: boolean } = {},
      ) => {
        if (opts.bgColor) {
          doc.rect(MARGIN, rowY, pageWidth, ROW_HEIGHT).fill(opts.bgColor).fillColor(DARK);
        }
        if (opts.topBorder) {
          doc.moveTo(MARGIN, rowY).lineTo(MARGIN + pageWidth, rowY).lineWidth(1).strokeColor(DARK).stroke();
        }
        let x = MARGIN;
        columns.forEach((col, i) => {
          doc
            .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(8)
            .fillColor(DARK)
            .text(rowData[i] ?? '', x + 2, rowY + 4, {
              width: colWidths[i] - 4,
              height: ROW_HEIGHT,
              align: this.defaultAlignForType(col.type),
              ellipsis: true,
              lineBreak: false,
            });
          x += colWidths[i];
        });
      };

      const ensureSpace = (needed: number) => {
        if (y + needed > doc.page.height - MARGIN - 30) {
          doc.addPage();
          y = MARGIN;
        }
      };

      // ---- Title ----
      doc.font('Helvetica-Bold').fontSize(16).fillColor(DARK).text(title, MARGIN, y, { width: pageWidth });
      y = doc.y + 4;

      if (options?.filterSummary) {
        doc.font('Helvetica').fontSize(10).fillColor('#6B7280').text(options.filterSummary, MARGIN, y, { width: pageWidth });
        y = doc.y + 4;
      }

      doc.font('Helvetica').fontSize(9).fillColor('#6B7280').text(
        `Generado: ${this.formatDateTime(new Date())}`,
        MARGIN, y, { width: pageWidth },
      );
      y = doc.y + 10;

      // ---- Header row ----
      ensureSpace(HEADER_HEIGHT);
      doc.rect(MARGIN, y, pageWidth, HEADER_HEIGHT).fill(BRAND);
      let hx = MARGIN;
      columns.forEach((col, i) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor('#FFFFFF')
          .text(col.header, hx + 2, y + 4, {
            width: colWidths[i] - 4,
            height: HEADER_HEIGHT,
            align: 'center',
            ellipsis: true,
            lineBreak: false,
          });
        hx += colWidths[i];
      });
      y += HEADER_HEIGHT;

      // ---- Data rows ----
      data.forEach((item, rowIdx) => {
        ensureSpace(ROW_HEIGHT);
        const rowValues = columns.map((col) => formatCellValue(this.getNestedValue(item, col.key), col));
        drawRow(y, rowValues, { bgColor: rowIdx % 2 === 1 ? GRAY_BG : undefined });
        y += ROW_HEIGHT;
      });

      // ---- Totals row ----
      if (options?.totalsRow) {
        ensureSpace(ROW_HEIGHT + 2);
        const totalsValues = columns.map((col) => {
          const val = options.totalsRow![col.key];
          return val !== undefined && val !== null ? formatCellValue(val, col) : '';
        });
        drawRow(y, totalsValues, { bold: true, bgColor: '#F9FAFB', topBorder: true });
      }

      // ---- Page numbers (bufferPages: true allows post-render writes) ----
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#9CA3AF')
          .text(`Página ${i + 1}`, MARGIN, doc.page.height - 30, { width: pageWidth, align: 'right' });
      }

      doc.end();
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  async generateCsv(data: any[], columns: ExportColumn[]): Promise<string> {
    const headers = columns.map((c) => `"${c.header}"`).join(',');
    const rows = data.map((item) =>
      columns
        .map((col) => {
          const raw = this.getNestedValue(item, col.key);
          const preformatted = col.format ? col.format(raw, item) : raw;
          const coerced = this.coerceForCsv(preformatted, col.type);
          const str = coerced == null ? '' : String(coerced);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(','),
    );
    return [headers, ...rows].join('\n');
  }

  // -------------------- private helpers --------------------

  private buildSheet(
    workbook: ExcelJS.Workbook,
    config: WorkbookConfig,
    sheetConfig: WorkbookSheetConfig,
  ): ExcelJS.Worksheet {
    const ws = workbook.addWorksheet(sheetConfig.name, {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      headerFooter: {
        oddHeader: '&LPerc Suppliers&R&D',
        oddFooter: '&C&P / &N',
      },
      views: [{ state: 'frozen', ySplit: HEADER_ROW, xSplit: 0 }],
    });

    const { columns, data, totalsRow } = sheetConfig;

    // Column widths (smart defaults based on type)
    ws.columns = columns.map((col) => ({
      key: col.key,
      width: col.width ?? this.defaultWidthForType(col.type),
    }));

    const colCount = columns.length;
    const lastColLetter = ws.getColumn(colCount).letter;

    // Row 1: title (merged across all columns)
    this.writeTitleRow(
      ws,
      sheetConfig.sheetTitle ?? config.title,
      config.generatedAt ?? new Date(),
      sheetConfig.filterSummary ?? config.filterSummary,
      lastColLetter,
    );

    // Row 2: spacer (intentionally blank, no formatting)
    ws.getRow(SPACER_ROW).height = 4;

    // Row 3: header
    this.writeHeaderRow(ws, columns);

    // Row 4+: data rows
    let rowIdx = DATA_START_ROW;
    for (const item of data) {
      const zebra = (rowIdx - DATA_START_ROW) % 2 === 1;
      this.writeDataRow(ws, columns, item, rowIdx, zebra);
      rowIdx += 1;
    }

    // Totals row (optional)
    if (totalsRow) {
      this.writeTotalsRow(ws, columns, totalsRow, rowIdx);
    }

    return ws;
  }

  private writeTitleRow(
    ws: ExcelJS.Worksheet,
    title: string,
    generatedAt: Date,
    filterSummary: string | undefined,
    lastColLetter: string,
  ) {
    const row = ws.getRow(TITLE_ROW);
    row.height = 28;
    ws.mergeCells(`A${TITLE_ROW}:${lastColLetter}${TITLE_ROW}`);
    const cell = ws.getCell(`A${TITLE_ROW}`);
    const parts = [title];
    if (filterSummary) parts.push(filterSummary);
    parts.push(`Generado: ${this.formatDateForTitle(generatedAt)}`);
    cell.value = parts.join('  ·  ');
    cell.font = { bold: true, size: 13, color: { argb: 'FF1F2937' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: TITLE_FILL_COLOR },
    };
  }

  private writeHeaderRow(ws: ExcelJS.Worksheet, columns: ExportColumn[]) {
    const row = ws.getRow(HEADER_ROW);
    row.height = 22;
    columns.forEach((col, idx) => {
      const cell = row.getCell(idx + 1);
      cell.value = col.header;
      cell.font = { bold: true, color: { argb: HEADER_FONT_COLOR }, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: HEADER_FILL_COLOR },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = thinBorder;
    });
    row.commit();
  }

  private writeDataRow(
    ws: ExcelJS.Worksheet,
    columns: ExportColumn[],
    item: any,
    rowIdx: number,
    zebra: boolean,
  ) {
    const row = ws.getRow(rowIdx);
    columns.forEach((col, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      const raw = this.getNestedValue(item, col.key);
      const preformatted = col.format ? col.format(raw, item) : raw;
      this.applyCellValue(cell, col, preformatted);
      cell.border = thinBorder;
      if (zebra) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: ZEBRA_FILL_COLOR },
        };
      }
    });
  }

  private writeTotalsRow(
    ws: ExcelJS.Worksheet,
    columns: ExportColumn[],
    totals: Record<string, string | number>,
    rowIdx: number,
  ) {
    const row = ws.getRow(rowIdx);
    row.height = 22;
    columns.forEach((col, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      const val = totals[col.key];
      if (val !== undefined && val !== null) {
        this.applyCellValue(cell, col, val);
      }
      cell.font = { bold: true };
      cell.border = {
        ...thinBorder,
        top: { style: 'medium', color: { argb: 'FF1F2937' } },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F4F6' },
      };
    });
  }

  /**
   * Apply a typed value to a cell: sets the value with the right JS type
   * (Date object for dates, number for currency/number/percent, string for text),
   * applies numFmt, and aligns.
   */
  private applyCellValue(cell: ExcelJS.Cell, col: ExportColumn, value: any) {
    const type = col.type ?? 'text';
    const align = col.align ?? this.defaultAlignForType(type);
    cell.alignment = { vertical: 'middle', horizontal: align, wrapText: false };

    if (value === null || value === undefined || value === '') {
      cell.value = '';
      return;
    }

    switch (type) {
      case 'number': {
        const n = this.toNumber(value);
        cell.value = n;
        cell.numFmt = col.numFmt ?? '#,##0';
        return;
      }
      case 'currency': {
        const n = this.toNumber(value);
        cell.value = n;
        cell.numFmt = col.numFmt ?? '#,##0.00';
        return;
      }
      case 'percent': {
        const n = this.toNumber(value);
        cell.value = n;
        // Use quoted % so the value stays as-is (e.g. 5 displays as "5.00 %")
        cell.numFmt = col.numFmt ?? '#,##0.00" %"';
        return;
      }
      case 'date': {
        const d = this.toDate(value);
        if (d) {
          cell.value = d;
          cell.numFmt = col.numFmt ?? 'dd/mm/yyyy';
        } else {
          cell.value = String(value);
        }
        return;
      }
      case 'datetime': {
        const d = this.toDate(value);
        if (d) {
          cell.value = d;
          cell.numFmt = col.numFmt ?? 'dd/mm/yyyy hh:mm';
        } else {
          cell.value = String(value);
        }
        return;
      }
      case 'cuit': {
        cell.value = this.formatCuit(String(value));
        return;
      }
      case 'boolean': {
        cell.value = value ? 'Sí' : 'No';
        return;
      }
      case 'text':
      default: {
        cell.value = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return;
      }
    }
  }

  private coerceForCsv(value: any, type?: ExportColumnType): string | number | null {
    if (value === null || value === undefined) return null;
    switch (type) {
      case 'date': {
        const d = this.toDate(value);
        return d ? this.formatDateShort(d) : String(value);
      }
      case 'datetime': {
        const d = this.toDate(value);
        return d ? this.formatDateTime(d) : String(value);
      }
      case 'cuit':
        return this.formatCuit(String(value));
      case 'boolean':
        return value ? 'Sí' : 'No';
      case 'number':
      case 'currency':
      case 'percent':
        return this.toNumber(value);
      default:
        return String(value);
    }
  }

  private toNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private formatCuit(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 11) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
    }
    return raw; // leave as-is if not a standard CUIT length
  }

  private formatDateShort(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  private formatDateTime(d: Date): string {
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${this.formatDateShort(d)} ${hh}:${mi}`;
  }

  private formatDateForTitle(d: Date): string {
    return this.formatDateTime(d);
  }

  private defaultWidthForType(type?: ExportColumnType): number {
    switch (type) {
      case 'currency':
      case 'number':
        return 18;
      case 'date':
        return 14;
      case 'datetime':
        return 18;
      case 'cuit':
        return 18;
      case 'percent':
        return 12;
      case 'boolean':
        return 10;
      case 'text':
      default:
        return 25;
    }
  }

  private defaultAlignForType(type?: ExportColumnType): 'left' | 'center' | 'right' {
    switch (type) {
      case 'number':
      case 'currency':
      case 'percent':
        return 'right';
      case 'date':
      case 'datetime':
      case 'boolean':
        return 'center';
      case 'text':
      case 'cuit':
      default:
        return 'left';
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((curr, key) => curr?.[key], obj);
  }
}
