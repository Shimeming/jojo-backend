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
  const groups = await db.any('SELECT group_id, category FROM jojo.group ORDER BY group_id');
  return {
    departments: groups.filter(g => g.category === 'department').map(g => g.group_id),
    dorms: groups.filter(g => g.category === 'dorm').map(g => g.group_id),
    clubs: groups.filter(g => g.category === 'club').map(g => g.group_id),
  };
}

function makeUserGroups(userIds, groupPools) {
  const rows = [];
  const { departments, dorms, clubs } = groupPools;

  const P_EXTRA_DEPT = 0.1;
  const P_HAS_DORM = 0.35;
  const P_HAS_CLUB = 0.5;

  function pickClubCount(maxClubsAvailable) {
    const maxK = Math.max(1, Math.min(3, maxClubsAvailable));
    // Unnormalized weights w_k = p^(k-1)
    const weights = Array.from({ length: maxK }, (_, i) => Math.pow(CLUB_GEOM_P, i));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const r = faker.number.float({ min: 0, max: 1 });
    let acc = 0;
    for (let k = 1; k <= maxK; k++) {
      acc += weights[k - 1] / sumW;
      if (r <= acc) return k;
    }
    return maxK;
  }

  for (const uid of userIds) {
    // Ensure at least one department
    if (departments.length > 0) {
      const dept1 = faker.helpers.arrayElement(departments);
      rows.push({ user_id: uid, group_id: dept1 });

      // Small chance for a second distinct department
      if (departments.length > 1 && faker.number.float({ min: 0, max: 1 }) < P_EXTRA_DEPT) {
        // pick another different department
        const deptCandidates = departments.filter(gid => gid !== dept1);
        const dept2 = faker.helpers.arrayElement(deptCandidates);
        rows.push({ user_id: uid, group_id: dept2 });
      }
    }

    // With probability, add at most one dorm
    if (dorms.length > 0 && faker.number.float({ min: 0, max: 1 }) < P_HAS_DORM) {
      const dorm = faker.helpers.arrayElement(dorms);
      rows.push({ user_id: uid, group_id: dorm });
    }

    // With probability, add some clubs (0..MAX_CLUBS)
    if (clubs.length > 0) {
      let clubCount = 0;
      for (let k = 1; k <= Math.min(3, clubs.length); k++) {
        if (faker.number.float({ min: 0, max: 1 }) < P_HAS_CLUB) {
          clubCount++;
        }
      }
      const selectedClubs = faker.helpers.arrayElements(clubs, clubCount);
      for (const gid of selectedClubs) {
        rows.push({ user_id: uid, group_id: gid });
      }
    }
  }

  // Deduplicate just in case
  const seen = new Set();
  const unique = [];
  for (const r of rows) {
    const key = `${r.user_id}-${r.group_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }
  return unique;
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
    const [userIds, groupPools] = await Promise.all([getAllUsers(), getAllGroups()]);

    const totalGroups = groupPools.departments.length + groupPools.dorms.length + groupPools.clubs.length;
    if (totalGroups === 0) {
      console.error('Error: GROUP table is empty. Please run seed_groups first.');
      process.exitCode = 1;
      return;
    }
    if (userIds.length === 0) {
      console.error('Warning: USER table is empty. No USER_GROUP rows generated.');
      return;
    }

    const rows = makeUserGroups(userIds, groupPools);

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
