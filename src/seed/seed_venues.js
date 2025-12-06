import { db, pgp } from '../lib/db.js';
import { loadEnv } from '../lib/env.js';
import { faker } from '@faker-js/faker';

loadEnv();

// Seed script for VENUE table
// Schema: public."VENUE"(Venue_id serial PK, Name text, Building text, Location text)
// Generates venues by enumerating known NTU buildings/spaces with concise room/location labels

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry');
const INSERT = args.includes('--insert');

const SPACES_MAP = [
  { Building: '第二學生活動中心', Floors: [3, 4], NamePrefixes: ['教室'] },
  { Building: '第二學生活動中心', Floors: [3], NamePrefixes: ['沃思空間'] },
  { Building: '第一學生活動中心', Floors: ['B1'], NamePrefixes: ['文藝展示室'] },
  { Building: '第一學生活動中心', Floors: [1], NamePrefixes: ['樓梯口旁空間', '樹木木椅區', '二手流浪書區'] },

  { Building: '新生教學館', Floors: [1, 2, 3], NamePrefixes: ['教室'] },
  { Building: '博雅教學館', Floors: [1, 2, 3, 4], NamePrefixes: ['教室'] },
  { Building: '博雅教學館', Floors: [1], NamePrefixes: ['藝文空間'] },

  { Building: '男一舍', Floors: ['B1', 1], NamePrefixes: ['交誼廳', '簡易廚房'] },
  { Building: '女九舍', Floors: [1], NamePrefixes: ['交誼廳', '簡易廚房'] },
  { Building: '長興舍區', Floors: [1], NamePrefixes: ['會議室'] },

  { Building: '總圖書館', Floors: [2, 3, 4], NamePrefixes: ['討論室', '研究小間'] },
  { Building: '社科圖書館', Floors: [1, 2], NamePrefixes: ['討論室'] },
  { Building: '醫圖書館', Floors: [3], NamePrefixes: ['討論室'] },

  { Building: '綜合體育館', Floors: [1, 3], NamePrefixes: ['羽球場', '體育館'] },
  { Building: '舊體育館', Floors: [2], NamePrefixes: ['體操室', '桌球室'] },

  { Building: '操場', Floors: ['戶外'], NamePrefixes: ['田徑場'] },
  { Building: '露天籃球場', Floors: ['戶外'], NamePrefixes: ['球場'] },
  { Building: '排球場', Floors: ['戶外'], NamePrefixes: ['球場'] },
];

function enumerateVenues() {
  const venues = [];
  for (const base of SPACES_MAP) {
    for (const floor of base.Floors) {
      for (const prefix of base.NamePrefixes) {
        const isRoomNumbered = typeof floor === 'number' && /教室|討論室|會議室/.test(prefix);
        if (isRoomNumbered) {
          const upper = faker.number.int({ min: 1, max: 24 });
          for (let r = 1; r <= upper; r++) {
            const location = String(floor * 100 + r);
            venues.push({
              name: `${base.Building} ${prefix}`,
              building: base.Building,
              location,
            });
          }
        } else {
          const location = (typeof floor === 'string' && floor.toUpperCase() === 'B1')
            ? 'B1'
            : (typeof floor === 'string' && floor === '戶外')
              ? '戶外'
              : prefix;
          venues.push({
            name: `${base.Building} ${prefix}`,
            building: base.Building,
            location,
          });
        }
      }
    }
  }
  return venues;
}

async function insertVenues(venues) {
  const cs = new pgp.helpers.ColumnSet(
    ['name', 'building', 'location'],
    { table: { table: 'venue', schema: 'jojo' } }
  );
  const query = pgp.helpers.insert(venues, cs);
  return db.none(query);
}

async function main() {
  const venues = enumerateVenues();

  if (DRY_RUN && !INSERT) {
    console.log(`[dry] Generated ${venues.length} VENUE records (not inserting):`);
    console.table(
      venues.map(
        (v) => ({ Name: v.name, Building: v.building, Location: v.location })
      )
    );
    return;
  }

  if (INSERT) {
    try {
      await insertVenues(venues);
      console.log(`Inserted ${venues.length} VENUE records into jojo.venue`);
    } catch (err) {
      console.error('Failed to insert venues:', err);
      process.exitCode = 1;
    } finally {
      pgp.end();
    }
  } else {
    pgp.end();
  }
}

main();
