import { db, pgp } from '../lib/db.js';
import { loadEnv } from '../lib/env.js';
import { faker } from '@faker-js/faker';

loadEnv();

// Seed script for USER_GROUP table
// Schema: public."USER_GROUP"(User_id int FK, Group_id int FK)
// Assumptions:
// - `USER` and `GROUP` tables are already populated by their seeders.
// - If `GROUP` is empty, exit with an error as instructed.

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry');

async function getAllUsers() {
  const users = await db.any('SELECT user_id FROM jojo.user ORDER BY user_id');
  return users.map((u) => u.user_id);
}

async function getAllGroups() {
  const groups = await db.any('SELECT group_id FROM jojo.group ORDER BY group_id');
  return groups.map((g) => g.group_id);
}

function makeUserGroups(userIds, groupIds) {
  // Each user belongs to 0-3 groups, sampled without replacement
  const rows = [];
  for (const uid of userIds) {
    const count = faker.number.int({ min: 0, max: 3 });
    const selected = faker.helpers.arrayElements(groupIds, count);
    for (const gid of selected) {
      rows.push({ user_id: uid, group_id: gid });
    }
  }
  return rows;
}

async function insertUserGroups(rows) {
  const cs = new pgp.helpers.ColumnSet(['user_id', 'group_id'], {
    table: { table: 'user_group', schema: 'jojo' },
  });
  const query = pgp.helpers.insert(rows, cs);
  return db.none(query);
}

async function main() {
  try {
    const [userIds, groupIds] = await Promise.all([getAllUsers(), getAllGroups()]);

    if (groupIds.length === 0) {
      console.error('Error: GROUP table is empty. Please run seed_groups first.');
      process.exitCode = 1;
      return;
    }
    if (userIds.length === 0) {
      console.error('Warning: USER table is empty. No USER_GROUP rows generated.');
      return;
    }

    const rows = makeUserGroups(userIds, groupIds);

    if (DRY_RUN) {
      console.log(`[dry] Generated ${rows.length} USER_GROUP rows`);
      console.table(rows.slice(0, 20));
      console.log('...');
      return;
    } else {
      await insertUserGroups(rows);
      console.log(`Inserted ${rows.length} USER_GROUP rows into jojo.user_group`);
    }
  } catch (err) {
    console.error('Failed to seed USER_GROUP:', err);
    process.exitCode = 1;
  } finally {
    pgp.end();
  }
}

main();
