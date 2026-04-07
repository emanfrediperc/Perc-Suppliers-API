import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
  format?: (value: any) => any;
}

@Injectable()
export class ExportService {
  async generateExcel(
    data: any[],
    columns: ExportColumn[],
    sheetName = 'Datos',
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);

    sheet.columns = columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || 20,
    }));

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4A90D9' },
    };
    headerRow.alignment = { horizontal: 'center' };

    for (const item of data) {
      const row: Record<string, any> = {};
      for (const col of columns) {
        const value = this.getNestedValue(item, col.key);
        row[col.key] = col.format ? col.format(value) : value;
      }
      sheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async generateCsv(data: any[], columns: ExportColumn[]): Promise<string> {
    const headers = columns.map((c) => `"${c.header}"`).join(',');
    const rows = data.map((item) =>
      columns
        .map((col) => {
          const value = this.getNestedValue(item, col.key);
          const formatted = col.format ? col.format(value) : value;
          const str = formatted == null ? '' : String(formatted);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(','),
    );
    return [headers, ...rows].join('\n');
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((curr, key) => curr?.[key], obj);
  }
}
