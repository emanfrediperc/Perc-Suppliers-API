import { Injectable } from '@nestjs/common';
import { PrestamosService } from './prestamos.service';
import { PrestamoStatus } from './enums/prestamo-status.enum';
import { EmpresaKind } from './enums/empresa-kind.enum';
import { DashboardFilterDto } from './dto/dashboard-filter.dto';
import { calculateInterest } from './helpers/interest-calculator';

export interface CurrencyCard {
  currency: string;
  count: number;
  totalCapital: number;
  totalInterest: number;
  totalAmount: number;
}

export interface EntityPosition {
  empresaId: string;
  empresaKind: EmpresaKind;
  name: string;
  lent: number;
  borrowed: number;
  net: number;
}

export interface CurrencyPosition {
  currency: string;
  entities: EntityPosition[];
}

@Injectable()
export class PrestamosDashboardService {
  constructor(private readonly prestamosService: PrestamosService) {}

  async getSummary(filters?: DashboardFilterDto): Promise<{ cards: CurrencyCard[] }> {
    const prestamos = await this.prestamosService.findAll({
      status: PrestamoStatus.ACTIVE,
      currency: filters?.currency,
    });

    const cardMap = new Map<
      string,
      { count: number; totalCapital: number; totalInterest: number; totalAmount: number }
    >();

    for (const p of prestamos) {
      const { interest, total } = calculateInterest(p);
      const currency = p.currency;

      if (!cardMap.has(currency)) {
        cardMap.set(currency, { count: 0, totalCapital: 0, totalInterest: 0, totalAmount: 0 });
      }

      const entry = cardMap.get(currency)!;
      entry.count += 1;
      entry.totalCapital += p.capital;
      entry.totalInterest += interest;
      entry.totalAmount += total;
    }

    const cards: CurrencyCard[] = Array.from(cardMap.entries()).map(([currency, data]) => ({
      currency,
      ...data,
    }));

    return { cards };
  }

  async getNetPosition(filters?: DashboardFilterDto): Promise<{ positions: CurrencyPosition[] }> {
    const prestamos = await this.prestamosService.findAll({
      status: PrestamoStatus.ACTIVE,
      currency: filters?.currency,
    });

    // currency -> empresaId -> entity position
    const positionMap = new Map<
      string,
      Map<
        string,
        { empresaId: string; empresaKind: EmpresaKind; name: string; lent: number; borrowed: number }
      >
    >();

    for (const p of prestamos) {
      const { total } = calculateInterest(p);
      const currency = p.currency;

      if (!positionMap.has(currency)) {
        positionMap.set(currency, new Map());
      }
      const entityMap = positionMap.get(currency)!;

      const lenderKey = p.lender.empresaId.toString();
      if (!entityMap.has(lenderKey)) {
        entityMap.set(lenderKey, {
          empresaId: lenderKey,
          empresaKind: p.lender.empresaKind,
          name: p.lender.razonSocialCache,
          lent: 0,
          borrowed: 0,
        });
      }
      entityMap.get(lenderKey)!.lent += total;

      const borrowerKey = p.borrower.empresaId.toString();
      if (!entityMap.has(borrowerKey)) {
        entityMap.set(borrowerKey, {
          empresaId: borrowerKey,
          empresaKind: p.borrower.empresaKind,
          name: p.borrower.razonSocialCache,
          lent: 0,
          borrowed: 0,
        });
      }
      entityMap.get(borrowerKey)!.borrowed += total;
    }

    const positions: CurrencyPosition[] = Array.from(positionMap.entries()).map(
      ([currency, entityMap]) => ({
        currency,
        entities: Array.from(entityMap.values()).map(
          ({ empresaId, empresaKind, name, lent, borrowed }) => ({
            empresaId,
            empresaKind,
            name,
            lent,
            borrowed,
            net: lent - borrowed,
          }),
        ),
      }),
    );

    return { positions };
  }
}
