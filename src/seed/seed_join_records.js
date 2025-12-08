import { db, pgp } from "../lib/db.js";
import { loadEnv } from "../lib/env.js";
import { faker } from "@faker-js/faker";

loadEnv();

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry");
const MAX_PER_EVENT = args.includes("--max-per-event") ? Number(args[args.indexOf("--max-per-event") + 1]) : 20;

async function fetchEventsAndUsers() {
  const events = await db.manyOrNone(`
    SELECT event_id, owner_id, capacity, start_time, end_time, status, created_at
    FROM jojo.event
    ORDER BY event_id
  `);
  const users = await db.manyOrNone('SELECT user_id FROM jojo.user ORDER BY user_id');
  return { events, users: users.map(u => u.user_id) };
}

function decideJoinCount(capacity, eventStatus) {
  const cap = capacity ?? MAX_PER_EVENT;
  if (cap <= 0) return 0;
  // Target realistic fill ratios by status
  let minRatio, maxRatio;
  switch (eventStatus) {
    case 'Cancelled':
      minRatio = 0.0; maxRatio = 0.2; break;
    case 'Open':
      minRatio = 0.5; maxRatio = 0.9; break;
    case 'Closed':
      minRatio = 0.6; maxRatio = 1.0; break;
    default:
      minRatio = 0.4; maxRatio = 0.9; break;
  }
  const ratio = faker.number.float({ min: minRatio, max: maxRatio });
  // Add a small random fluctuation
  const jitter = faker.number.float({ min: -0.05, max: 0.05 });
  const target = Math.floor(cap * Math.max(0, Math.min(1, ratio + jitter)));
  // Ensure not exceeding capacity and allow some zero-fill cases
  return Math.max(0, Math.min(target, cap));
}

function pickParticipants(users, count, ownerId) {
  const set = new Set();
  // avoid owner duplicate; owner can also join implicitly but we will include them
  while (set.size < count && set.size < users.length) {
    set.add(faker.helpers.arrayElement(users));
  }
  // ensure owner is included when possible
  if (ownerId && !set.has(ownerId)) {
    set.delete(faker.helpers.arrayElement([...set]));
    set.add(ownerId);
  }
  return [...set];
}

function statusForJoin(eventStatus) {
  if (eventStatus === 'Cancelled') return 'cancelled';
  // small rejected rate, mostly confirmed
  const r = Math.random();
  if (r < 0.1) return 'rejected';
  if (r < 0.2) return 'pending';
  return 'confirmed';
}

function buildJoinRows(events, users) {
  const rows = [];
  for (const ev of events) {
    const cap = ev.capacity ?? MAX_PER_EVENT;
    const targetCount = decideJoinCount(cap, ev.status);
    const participants = pickParticipants(users, targetCount, undefined);
    const created = new Date(ev.created_at);
    const start = new Date(ev.start_time);
    const now = new Date();
    const toTime = start < now ? start : now;
    // If created is after toTime (edge case), nudge toTime forward by 1 minute
    const fromTime = created;
    const safeToTime = fromTime > toTime ? new Date(fromTime.getTime() + 60 * 1000) : toTime;
    for (const uid of participants.slice(0, cap)) {
      const joinTime = faker.date.between({ from: fromTime, to: safeToTime });
      const status = statusForJoin(ev.status);
      rows.push({ event_id: ev.event_id, user_id: uid, join_time: joinTime, status });
    }
  }
  return rows;
}

async function insertJoinRows(rows) {
  const cs = new pgp.helpers.ColumnSet([
    'event_id',
    'user_id',
    'join_time',
    'status',
  ], { table: { table: 'join_record', schema: 'jojo' } });

  const onConflict = ' ON CONFLICT (event_id, user_id) DO UPDATE SET join_time = EXCLUDED.join_time, status = EXCLUDED.status';
  const batchSize = 5000;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const query = pgp.helpers.insert(batch, cs) + onConflict;
    await db.none(query);
    console.log(`Upserted ${Math.min(i + batch.length, rows.length)}/${rows.length} join records...`);
  }
}

async function main() {
  console.log('Generating JOIN_RECORD data...');
  const { events, users } = await fetchEventsAndUsers();
  if (events.length === 0 || users.length === 0) {
    console.log('No events or users found; nothing to generate.');
    return;
  }
  const rows = buildJoinRows(events, users);
  console.log(`Prepared ${rows.length} join records for ${events.length} events.`);

  if (DRY_RUN) {
    console.table(rows.slice(0, 10));
    return;
  }
  await insertJoinRows(rows);
  console.log('Done inserting join records.');
}

main().then(() => db.$pool.end()).catch(async (err) => {
  console.error('Fatal error:', err);
  try { await db.$pool.end(); } catch {}
  process.exit(1);
});
