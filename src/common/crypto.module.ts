import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HashChainService } from './services/hash-chain.service';
import { TsaClient } from './services/tsa.client';

/**
 * Provee los servicios criptográficos compartidos (cadena de hash + sello TSA RFC 3161)
 * para los módulos que necesitan trazabilidad tamper-evident y no-repudio
 * (solicitud-pago, aprobacion). Antes vivían dentro de solicitud-pago.
 */
@Module({
  imports: [ConfigModule],
  providers: [HashChainService, TsaClient],
  exports: [HashChainService, TsaClient],
})
export class CryptoModule {}
