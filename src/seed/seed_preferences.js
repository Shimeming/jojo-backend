import { db, pgp } from "../lib/db.js";
import { loadEnv } from "../lib/env.js";
import { faker } from "@faker-js/faker";

loadEnv();

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry");
const MIN_PER_USER = args.includes("--min") ? Number(args[args.indexOf("--min") + 1]) : 0;
const MAX_PER_USER = args.includes("--max") ? Number(args[args.indexOf("--max") + 1]) : 3;

async function getUsersAndTypes() {
  const users = await db.manyOrNone('SELECT user_id FROM jojo.user ORDER BY user_id');
  const types = await db.manyOrNone("SELECT name FROM jojo.event_type ORDER BY name");
  return { users: users.map(u => u.user_id), types: types.map(t => t.name) };
}

function weightedSample(types, k) {
  if (k <= 0) return [];
  // Heuristic weights to favor common interests
  const baseWeights = {
    '運動': 1.3,
    '宵夜': 1.2,
    '讀書': 1.1,
    '出遊': 1.0,
    '共煮': 0.9,
    '練舞': 0.8,
    '其他': 0.0,
  };
  const pool = types.map((t) => ({ t, w: baseWeights[t] ?? 1.0 }));
  const chosen = [];
  k = Math.max(1, Math.min(k, pool.length));
  for (let i = 0; i < k; i++) {
    const sum = pool.reduce((acc, x) => acc + x.w, 0);
    let r = Math.random() * sum;
    let idx = 0;
    while (idx < pool.length) {
      r -= pool[idx].w;
      if (r <= 0) break;
      idx++;
    }
    const picked = pool.splice(Math.min(idx, pool.length - 1), 1)[0];
    chosen.push(picked.t);
  }
  return chosen;
}

function buildPreferenceRows(users, types) {
  const rows = [];
  for (const userId of users) {
    const k = faker.number.int({ min: MIN_PER_USER, max: Math.max(MIN_PER_USER, MAX_PER_USER) });
    const prefs = weightedSample(types, k);
    prefs.forEach((typeName) => {
      rows.push({ user_id: userId, type_name: typeName });
    });
  }
  return rows;
}

async function insertPreferences(rows) {
  const cs = new pgp.helpers.ColumnSet([
    'user_id',
    'type_name',
  ], { table: { table: 'preference', schema: 'jojo' } });

  const onConflict = ' ON CONFLICT (user_id, type_name) DO NOTHING';
  const batchSize = 5000;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const query = pgp.helpers.insert(batch, cs) + onConflict;
    await db.none(query);
    console.log(`Upserted ${Math.min(i + batch.length, rows.length)}/${rows.length} preferences...`);
  }
}

async function main() {
  console.log('Generating user preferences...');
  const { users, types } = await getUsersAndTypes();
  if (types.length === 0 || users.length === 0) {
    console.log('No users or event types found; nothing to generate.');
    return;
  }

  const rows = buildPreferenceRows(users, types);
  console.log(`Prepared ${rows.length} preference rows for ${users.length} users (types: ${types.length}).`);

  if (DRY_RUN) {
    const sample = rows.slice(0, 10);
    console.table(sample);
    const perUserAvg = (rows.length / users.length).toFixed(2);
    const typeCounts = {};
    for (const r of rows) typeCounts[r.type_name] = (typeCounts[r.type_name] || 0) + 1;
    console.log('Average preferences per user:', perUserAvg);
    console.table(typeCounts);
    return;
  }

  await insertPreferences(rows);
  console.log('Done inserting preferences.');
}

main().then(() => db.$pool.end()).catch(async (err) => {
  console.error('Fatal error:', err);
  try { await db.$pool.end(); } catch {}
  process.exit(1);
});
