import { db } from '../lib/db.js';
import { loadEnv } from '../lib/env.js';
import fs from 'fs';
import path from 'path';

loadEnv();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry');

async function insertEventTypesFromCSV() {
  const csvPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    './seed_event_types.csv'
  );
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.trim().split(/\r?\n/);
  const header = lines.shift();
  if (!/^name$/i.test(header)) {
    console.warn('Unexpected CSV header for seed_event_types.csv:', header);
  }

  const types = lines.map((l) => l.trim()).filter(Boolean);
  if (DRY_RUN) {
    console.log(`[dry] Would seed ${types.length} event types:`);
    console.table(types.map((name) => ({ name })));
    return;
  }
  let inserted = 0;
  for (const name of types) {
    try {
      await db.none(
        'INSERT INTO jojo.event_type (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
        [name]
      );
      inserted++;
    } catch (err) {
      console.warn(`Failed to insert event type ${name}:`, err.message);
    }
  }
  console.log(`Seeded ${inserted} event types (from ${types.length} entries).`);
}

insertEventTypesFromCSV()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error seeding event types:', err);
    process.exit(1);
  });
