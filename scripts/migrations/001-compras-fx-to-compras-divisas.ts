/**
 * Migration 001 — rename Aprobacion.entidad slug from 'compras-fx' to
 * 'compras-divisas'.
 *
 * Runs idempotently: updates only documents whose entidad is still the old
 * slug and reports the count. Safe to rerun (second run will match 0 docs).
 *
 * Usage:
 *   MONGODB_URI=mongodb://localhost:27017/perc-suppliers npx ts-node scripts/migrations/001-compras-fx-to-compras-divisas.ts
 *   # o con el script de npm añadido en package.json:
 *   #   npm run migrate -- 001-compras-fx-to-compras-divisas
 *
 * Contexto: cuando se renombró el slug interno de la entidad compras (ver
 * commit 0c8849c en la API) el enum de Aprobacion.entidad pasó a aceptar
 * solo 'compras-divisas'. Documentos existentes con 'compras-fx' leen bien
 * pero cualquier update posterior falla el enum validator. Este script
 * hace el update masivo para dejar todo en el slug nuevo.
 */

import { MongoClient } from 'mongodb';

const OLD_SLUG = 'compras-fx';
const NEW_SLUG = 'compras-divisas';

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI no está seteada. Abortando.');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    const col = db.collection('aprobaciones');

    const before = await col.countDocuments({ entidad: OLD_SLUG });
    console.log(`Encontrados ${before} documentos con entidad='${OLD_SLUG}'.`);

    if (before === 0) {
      console.log('No hay nada que migrar. Listo.');
      return;
    }

    const res = await col.updateMany(
      { entidad: OLD_SLUG },
      { $set: { entidad: NEW_SLUG } },
    );
    console.log(`Migrados ${res.modifiedCount} documentos a entidad='${NEW_SLUG}'.`);

    const after = await col.countDocuments({ entidad: OLD_SLUG });
    if (after > 0) {
      console.error(`ADVERTENCIA: todavía quedan ${after} documentos con el slug viejo.`);
      process.exit(2);
    }
    console.log('Verificación OK: 0 documentos con el slug viejo.');
  } finally {
    await client.close();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
