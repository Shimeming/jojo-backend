import { db } from '../lib/db.js';
import { loadEnv } from '../lib/env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

loadEnv();

const args = process.argv.slice(2);
const CLEAR_AND_GENERATE = args.includes('--clear-and-generate');
const CLEAR_ONLY = args.includes('--clear-only');
const GENERATE_ONLY = args.includes('--generate-only');
const FORCE = args.includes('--force');
const COUNT_ARG = args.includes('--count') ? Number(args[args.indexOf('--count') + 1]) : undefined;

const ROOT = path.dirname(fileURLToPath(import.meta.url));

async function runSQLFromFile(fileName) {
  const sqlPath = path.resolve(ROOT, fileName);
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  await db.none(sql);
}

async function hasExistingData() {
  const tables = [
    'jojo.user',
    'jojo.group',
    'jojo.event_type',
    'jojo.venue',
    'jojo.event',
    'jojo.user_group',
  ];
  for (const tbl of tables) {
    try {
      const { count } = await db.one(`SELECT COUNT(*)::int AS count FROM ${tbl}`);
      if (count > 0) return true;
    } catch (err) {
      // table may not exist yet; ignore
    }
  }
  return false;
}

function runNodeScript(relPath, extraArgs = []) {
  const fullPath = path.resolve(ROOT, relPath);
  return new Promise((resolve, reject) => {
    const child = spawn('node', [fullPath, ...extraArgs], { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${relPath} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function clearDatabase() {
  await runSQLFromFile('./drop_schema.sql');
  await runSQLFromFile('./create_tables.sql');
}

async function generateAll() {
  // Seed event types first
  await runNodeScript('./seed_event_types.js', ['--insert']);
  // Seed core entities
  await runNodeScript('./seed_users.js');
  await runNodeScript('./seed_groups.js');
  await runNodeScript('./seed_venues.js', ['--insert']);
  // Link users to groups
  await runNodeScript('./seed_user_groups.js');
  // Seed user preferences
  await runNodeScript('./seed_preferences.js', ['--insert']);
  // Seed events; pass count if provided
  const eventArgs = ['--count', String(COUNT_ARG ?? 10000)];
  await runNodeScript('./seed_events.js', eventArgs);
}

async function main() {
  const dataExists = await hasExistingData();

  if (!CLEAR_AND_GENERATE && !CLEAR_ONLY && !GENERATE_ONLY && dataExists && !FORCE) {
    console.error('Target tables contain data. Aborting. Use --force or choose an operation.');
    process.exit(1);
  }

  if (CLEAR_AND_GENERATE) {
    console.log('Clearing database, then generating dummy data...');
    await clearDatabase();
    await generateAll();
    console.log('Done.');
    return;
  }

  if (CLEAR_ONLY) {
    console.log('Clearing database only...');
    await clearDatabase();
    console.log('Done.');
    return;
  }

  if (GENERATE_ONLY) {
    console.log('Generating dummy data only...');
    await generateAll();
    console.log('Done.');
    return;
  }

  // Default behavior: if no data, create tables and generate; if data exists and FORCE provided, proceed
  if (!dataExists) {
    console.log('No existing data detected. Creating tables and generating...');
    await runSQLFromFile('./create_tables.sql');
    await generateAll();
    console.log('Done.');
    return;
  }

  if (FORCE) {
    console.log('Data exists but --force specified. Proceeding to generate without clearing...');
    await generateAll();
    console.log('Done.');
    return;
  }
}

main().then(() => db.$pool.end()).catch(async (err) => {
  console.error('Fatal error:', err);
  try { await db.$pool.end(); } catch {}
  process.exit(1);
});
