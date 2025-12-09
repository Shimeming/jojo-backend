import { db } from "../lib/db.js";
import { mongoDb } from "../lib/db.js";
import { loadEnv } from "../lib/env.js";
import { faker } from "@faker-js/faker";

loadEnv();

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry");
// trackingLabel is fixed to "recommend_button_click" per requirement

async function fetchEventsWithParticipants() {
  // Fetch events and their joiners
  const events = await db.manyOrNone(`
    SELECT e.event_id, e.created_at, e.end_time
    FROM jojo.event e
    ORDER BY e.event_id
  `);
  const joins = await db.manyOrNone(`
    SELECT event_id, user_id
    FROM jojo.join_record
    ORDER BY event_id, user_id
  `);
  const participantsByEvent = new Map();
  for (const j of joins) {
    const arr = participantsByEvent.get(j.event_id) || [];
    arr.push(j.user_id);
    participantsByEvent.set(j.event_id, arr);
  }
  return { events, participantsByEvent };
}

function buildClicksPerEvent(events, participantsByEvent) {
  const docs = [];
  const now = new Date();
  for (const ev of events) {
    const from = new Date(ev.created_at);
    const to = new Date(ev.end_time);
    const upper = to > now ? now : to;
    if (!(from < upper)) continue; // invalid interval

    const participants = participantsByEvent.get(ev.event_id) || [];
    if (participants.length === 0) continue;

    // Number of active users roughly proportional to participants
    const activeUsers = Math.max(1, Math.floor(participants.length * faker.number.float({ min: 0.3, max: 0.8 })));
    // Sample unique users from participants
    const shuffled = faker.helpers.shuffle(participants);
    const selectedUsers = shuffled.slice(0, activeUsers);

    for (const uid of selectedUsers) {
      // Each user contributes 0..5 clicks across the interval
      const clicks = faker.number.int({ min: 0, max: 5 });
      for (let i = 0; i < clicks; i++) {
        const ts = faker.date.between({ from, to: upper });
        docs.push({
          userId: String(uid),
          timestamp: ts,
          eventType: 'click',
          trackingLabel: 'recommend_button_click',
        });
      }
    }
  }
  return docs;
}

async function insertClicks(docs) {
  if (docs.length === 0) return;
  const collection = mongoDb.collection('click_events');
  // Insert in batches to avoid large payloads
  const batchSize = 5000;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    await collection.insertMany(batch, { ordered: false });
    console.log(`Inserted ${Math.min(i + batch.length, docs.length)}/${docs.length} click events...`);
  }
}

async function main() {
  console.log('Synthesizing clicks based on join records per event...');

  const { events, participantsByEvent } = await fetchEventsWithParticipants();
  if (events.length === 0) {
    console.log('No events present; aborting.');
    return;
  }

  const docs = buildClicksPerEvent(events, participantsByEvent);
  console.log(`Prepared ${docs.length} click docs for ${events.length} events.`);

  if (DRY_RUN) {
    console.table(docs.slice(0, 10));
    const byLabel = {};
    for (const d of docs) byLabel[d.trackingLabel] = (byLabel[d.trackingLabel] || 0) + 1;
    console.table(byLabel);
    return;
  }

  await insertClicks(docs);
  console.log('Done inserting click events.');
  return;
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
}).finally(async () => {
  try { await db.$pool.end(); } catch {}
  try { await mongoDb.client.close(); } catch {}
});
