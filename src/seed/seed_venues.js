import { db, pgp } from '../lib/db.js';
import { loadEnv } from '../lib/env.js';
import { faker } from '@faker-js/faker';

loadEnv();

// VENUE schema:
// PK: Venue_id (serial in DB)
// Attrs: Name, Building, Floor, Capacity, Open_time, Close_time, Status

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry');
const INSERT = args.includes('--insert');

// --- Real NTU Spaces Mapping ---
// This map defines the base properties and potential naming conventions for each type of space.
const SPACES_MAP = [
    // 1. Activity Centers (可預約教室/空間)
    { Building: '第二學生活動中心', Floors: [3, 4], NamePrefixes: ['教室', '會議室', '排練室'], Open: 8, Close: 22, Status: 'Available' },
    { Building: '第二學生活動中心', Floors: [3], NamePrefixes: ['沃思空間'], Open: 8, Close: 22, Status: 'Available' },
    { Building: '第一學生活動中心', Floors: ['B1'], NamePrefixes: ['文藝展示室'], Open: 8, Close: 22, Status: 'Available' },
    { Building: '第一學生活動中心', Floors: [1], NamePrefixes: ['樓梯口旁空間', '樹木木椅區', '二手流浪書區'], Open: 9, Close: 17, Status: 'Available' },
    
    // 2. Classrooms/Lecture Halls (教學館)
    { Building: '新生教學館', Floors: [1, 2, 3], NamePrefixes: ['教室'], Open: 8, Close: 21, Status: 'Available' },
    { Building: '博雅教學館', Floors: [1, 2, 3, 4], NamePrefixes: ['教室'], Open: 8, Close: 21, Status: 'Available' },
    { Building: '博雅教學館', Floors: [1], NamePrefixes: ['藝文空間'], Open: 9, Close: 17, Status: 'Available' },
    
    // 3. Dormitories (宿舍 - 公共空間)
    { Building: '男一舍', Floors: ['B1', 1], NamePrefixes: ['交誼廳', '簡易廚房'], Open: 0, Close: 24, Status: 'Available' },
    { Building: '女九舍', Floors: [1], NamePrefixes: ['交誼廳', '簡易廚房'], Open: 0, Close: 24, Status: 'Available' },
    { Building: '長興舍區', Floors: [1], NamePrefixes: ['會議室'], Open: 8, Close: 22, Status: 'Available' },

    // 4. Libraries (討論室)
    { Building: '總圖書館', Floors: [2, 3, 4], NamePrefixes: ['討論室', '研究小間'], Open: 9, Close: 21, Status: 'Available' },
    { Building: '社科圖書館', Floors: [1, 2], NamePrefixes: ['討論室'], Open: 9, Close: 18, Status: 'Available' },
    { Building: '醫圖書館', Floors: [3], NamePrefixes: ['討論室'], Open: 9, Close: 18, Status: 'Available' },
    
    // 5. Sports Facilities (可預約時段)
    { Building: '綜合體育館', Floors: [1, 3], NamePrefixes: ['羽球場', '體育館'], Open: 7, Close: 23, Status: 'Available' },
    { Building: '舊體育館', Floors: [2], NamePrefixes: ['體操室', '桌球室'], Open: 8, Close: 21, Status: 'Available' },
    
    // 6. Outdoor Courts/Fields (通常不需預約，但作為地點)
    { Building: '操場', Floors: ['戶外'], NamePrefixes: ['田徑場'], Open: 0, Close: 24, Status: 'Available' },
    { Building: '露天籃球場', Floors: ['戶外'], NamePrefixes: ['球場'], Open: 6, Close: 23, Status: 'Available' },
    { Building: '排球場', Floors: ['戶外'], NamePrefixes: ['球場'], Open: 6, Close: 23, Status: 'Available' },
];

function pick(array) {
    return faker.helpers.arrayElement(array);
}

/**
 * Generates a single VENUE record with realistic NTU details.
 * @param {number} venueId - Unique ID for the venue.
 */
function buildOneVenue(venueId) {
    const base = pick(SPACES_MAP);
    
    let floor = pick(base.Floors);
    let name = pick(base.NamePrefixes);

    // 1. Generate Room Number/Identifier
    let finalName;
    let roomNumber = null;

    if (typeof floor === 'number' && (name.includes('教室') || name.includes('討論室') || name.includes('會議室'))) {
        // Room number starts with the floor number (e.g., 2F -> Room 2xx)
        roomNumber = faker.number.int({ min: floor * 100 + 1, max: floor * 100 + 50 });
        finalName = `${name} ${roomNumber}`;
    } else if (name.includes('排練室') || name.includes('籃球場') || name.includes('羽球場')) {
        // Simple numbered space
        finalName = `${name} ${faker.number.int({ min: 1, max: 3 })}`;
    } else {
        // Fixed name (e.g., 文藝展示室, 沃思空間)
        finalName = name;
    }

    // 2. Set Capacity based on type
    let capacity;
    if (finalName.includes('教室') || finalName.includes('體育館')) {
        capacity = faker.number.int({ min: 15, max: 60 });
    } else if (finalName.includes('討論室') || finalName.includes('簡易廚房') || finalName.includes('排練室')) {
        capacity = faker.number.int({ min: 4, max: 12 });
    } else if (finalName.includes('球場') || finalName.includes('操場')) {
        capacity = faker.number.int({ min: 20, max: 50 });
    } else {
        capacity = faker.number.int({ min: 2, max: 15 });
    }

    // 3. Set Status (95% available, 5% maintenance)
    let status = base.Status;
    if (faker.datatype.boolean(0.05)) {
        status = 'Maintenance';
    }

    return {
        venue_id: venueId,
        // The common NTU format is "Building/Space Name (e.g., 二活 303)"
        name: `${base.Building} ${finalName}`, 
        building: base.Building,
        floor: typeof floor === 'number' ? `${floor}F` : String(floor), // Convert 1 to '1F'
        capacity: capacity,
        open_time: base.Open,
        close_time: base.Close,
        status: status,
    };
}

function buildVenues(n) {
    const venues = [];
    for (let i = 1; i <= n; i++) {
        venues.push(buildOneVenue(i));
    }
    return venues;
}

async function insertVenues(venues) {
    const cs = new pgp.helpers.ColumnSet(
        [
            'venue_id', 'name', 'building', 'floor', 'capacity', 
            'open_time', 'close_time', 'status'
        ],
        { table: { table: 'VENUE', schema: 'public' } }
    );
    // Use ON CONFLICT DO NOTHING to allow multiple runs without failing on PK
    const query = pgp.helpers.insert(venues, cs) + ' ON CONFLICT (venue_id) DO NOTHING';
    return db.none(query);
}

async function main() {
    // Generate a sufficient number of unique spaces
    const VENUE_COUNT = 75; 
    const venues = buildVenues(VENUE_COUNT);

    if (DRY_RUN && !INSERT) {
        console.log(`[dry] Generated ${venues.length} VENUE records (not inserting):`);
        console.table(
            venues.slice(0, Math.min(20, venues.length)).map((v) => ({
                ID: v.venue_id,
                Name: v.name,
                Building: v.building,
                Floor: v.floor,
                Capacity: v.capacity,
                Hours: `${v.open_time}:00 - ${v.close_time}:00`,
                Status: v.status,
            }))
        );
        return;
    }

    if (INSERT) {
        try {
            await insertVenues(venues);
            console.log(`Inserted ${venues.length} VENUE records into public."VENUE"`);
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
