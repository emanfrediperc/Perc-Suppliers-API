/**
 * Migration 002 — cifra los CBU (datosBancarios.cbu) existentes en reposo.
 *
 * Idempotente: sólo cifra los CBU que todavía están en texto plano (cifrarCbu
 * no re-cifra un valor ya cifrado). Seguro de rerun.
 *
 * Requiere CBU_ENC_KEY seteada (la misma que usará la app para descifrar).
 *
 * Usage:
 *   CBU_ENC_KEY=<hex64> MONGODB_URI=mongodb://host/db npm run migrate:cifrar-cbu
 */

import { MongoClient } from 'mongodb';
import { cifrarCbu } from '../../src/common/utils/datos-bancarios.util';

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI no está seteada. Abortando.');
    process.exit(1);
  }
  if (!process.env.CBU_ENC_KEY) {
    console.error(
      'CBU_ENC_KEY no está seteada. Sin key no se cifra nada. Abortando.',
    );
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    const col = db.collection('empresas_proveedoras');

    const empresas = await col
      .find({ 'datosBancarios.cbu': { $exists: true, $nin: [null, ''] } })
      .toArray();
    console.log(`Encontradas ${empresas.length} empresas con CBU.`);

    let cifrados = 0;
    let yaCifrados = 0;
    for (const emp of empresas) {
      const cbu: string = emp.datosBancarios?.cbu;
      if (!cbu) continue;
      const nuevo = cifrarCbu(cbu); // idempotente: devuelve igual si ya está cifrado
      if (nuevo === cbu) {
        yaCifrados++;
        continue;
      }
      await col.updateOne(
        { _id: emp._id },
        { $set: { 'datosBancarios.cbu': nuevo } },
      );
      cifrados++;
    }
    console.log(
      `Cifrados ${cifrados} CBU. Ya cifrados/sin cambio: ${yaCifrados}.`,
    );
  } finally {
    await client.close();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
