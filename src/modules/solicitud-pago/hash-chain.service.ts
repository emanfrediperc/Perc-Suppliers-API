import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export interface HistorialEntryLike {
  accion: string;
  usuario: any;
  motivo?: string;
  estadoAnterior?: string;
  estadoNuevo?: string;
  fechaAnterior?: Date | string;
  fechaNueva?: Date | string;
  fecha: Date | string;
  hash?: string;
  tsaToken?: string;
  tsaError?: string;
}

@Injectable()
export class HashChainService {
  /**
   * Hash de una entry: sha256(prevHash + canonical(entry sin hash/tsaToken/tsaError))
   * El canonical es JSON con keys ordenadas alfabéticamente para que el hash sea determinístico.
   */
  computeHash(prevHash: string, entry: HistorialEntryLike): string {
    const payload = this.canonical(entry);
    return createHash('sha256').update(prevHash + payload).digest('hex');
  }

  /**
   * Verifica integridad de la cadena. Devuelve índice de la primera entry rota,
   * o null si toda la cadena está consistente.
   */
  verifyChain(historial: HistorialEntryLike[]): { valid: boolean; brokenAt: number | null } {
    let prev = '';
    for (let i = 0; i < historial.length; i++) {
      const entry = historial[i];
      const expected = this.computeHash(prev, entry);
      if (entry.hash !== expected) return { valid: false, brokenAt: i };
      prev = entry.hash;
    }
    return { valid: true, brokenAt: null };
  }

  private canonical(entry: HistorialEntryLike): string {
    const stripped: Record<string, any> = {
      accion: entry.accion,
      usuario: String(entry.usuario),
      motivo: entry.motivo ?? null,
      estadoAnterior: entry.estadoAnterior ?? null,
      estadoNuevo: entry.estadoNuevo ?? null,
      fechaAnterior: entry.fechaAnterior ? new Date(entry.fechaAnterior).toISOString() : null,
      fechaNueva: entry.fechaNueva ? new Date(entry.fechaNueva).toISOString() : null,
      fecha: new Date(entry.fecha).toISOString(),
    };
    const sorted = Object.keys(stripped)
      .sort()
      .reduce<Record<string, any>>((acc, k) => {
        acc[k] = stripped[k];
        return acc;
      }, {});
    return JSON.stringify(sorted);
  }
}
