import { db, pgp } from '../lib/db.js';
import { loadEnv } from '../lib/env.js';
import { faker } from '@faker-js/faker';

loadEnv();

// EVENT schema (from prototype):
// PK: Event_id (serial in DB)
// FK: Owner_id -> USER(User_id)
// FK: Type_name -> TYPE(name)
// Attrs: Need_book, Title, Content, Capacity, Location_desc, Start_time, End_time, Status, Created_at
// NOTE: EVENT.group_id is removed in the enhanced schema.

const args = process.argv.slice(2);
const COUNT = args.includes('--count') ? Number(args[args.indexOf('--count') + 1]) : 50;
const DRY_RUN = args.includes('--dry');
const INSERT = args.includes('--insert');

const ACTIVITY_TYPES = ['運動', '出遊', '共煮', '宵夜', '讀書', '練舞', '其他'];

// Titles by type for more realistic data
const TITLE_TEMPLATES = {
    '運動': ['籃球揪團', '羽球快打', '晨跑台大', '健身房互相Spot', '足球鬥牛'],
    '出遊': ['象山看夜景', '淡水老街走走', '陽明山看芒花', '台北美食踩點'],
    '共煮': ['男一廚房咖哩飯', '一起煮火鍋', '宿舍烘焙小聚', '便當交換日'],
    '宵夜': ['夜唱前宵夜', '溫州街滷味', '師大雞排快閃', '永康街豆花'],
    '讀書': ['工數期中衝刺團', '資料結構複習', '計概刷題', '統計作業討論'],
    '練舞': ['嘻哈練習', 'Breaking 基本動作', 'K-Pop 排舞', 'Jazz 排練'],
    '其他': ['桌遊交流', '攝影散步', '語言交換', '卡拉OK小聚']
};

// --- Venue Data Simulation ---
// Dummy venue data including the mandatory Open/Close times
const DUMMY_VENUES = [
    { Venue_id: 1, Name: '二活 303', Capacity: 10, Open_time: 8, Close_time: 21 },
    { Venue_id: 2, Name: '圖書館討論室 A', Capacity: 6, Open_time: 9, Close_time: 18 },
    { Venue_id: 3, Name: '新體籃球場', Capacity: 20, Open_time: 7, Close_time: 22 },
    { Venue_id: 4, Name: '博雅館 103', Capacity: 50, Open_time: 8, Close_time: 21 },
];
// --- End Venue Data Simulation ---

function pick(array) {
    return faker.helpers.arrayElement(array);
}

function randomChineseSentence(min = 10, max = 25) {
    // Uses faker.lorem as a placeholder for Chinese content
    return faker.lorem
        .sentences({ min: 2, max: 4 })
        .replace(/\b\w/g, (c) => c) + ' ' + faker.lorem.sentence({ min: min, max: max });
}

function randomCapacity(type) {
    // smaller groups for 共煮/宵夜/讀書, larger for 運動/出遊
    if (['共煮', '宵夜', '讀書'].includes(type)) return faker.number.int({ min: 2, max: 8 });
    if (['運動', '出遊'].includes(type)) return faker.number.int({ min: 4, max: 16 });
    return faker.number.int({ min: 2, max: 12 });
}

function randomNeedBook(type) {
    // Some types likely need a venue booking
    return ['讀書', '運動', '練舞'].includes(type) ? faker.datatype.boolean(0.7) : faker.datatype.boolean(0.3);
}

function randomStatus(start, end) {
    const now = new Date();
    if (end < now) return 'completed';
    if (start <= now && end >= now) return 'ongoing';
    return 'scheduled';
}

async function getExistingIds() {
    // Fetch candidate IDs for FKs
    const users = await db.manyOrNone('SELECT user_id as id FROM jojo.user LIMIT 1000');
    const groups = await db.manyOrNone('SELECT group_id as id FROM jojo.group LIMIT 1000');
    const types = await db.manyOrNone('SELECT name FROM jojo.type');

    return {
        userIds: users.map((u) => u.id),
        groupIds: groups.map((g) => g.id),
        typeNames: types.length ? types.map((t) => t.name) : ACTIVITY_TYPES,
        // In a real app, VENUE IDs would be fetched from DB, but we use DUMMY_VENUES here
        venueIds: DUMMY_VENUES.map(v => v.Venue_id)
    };
}

/**
 * Builds a record for EVENT, and related records for VENUE_BOOKING and EVENT_GROUP_RESTRICTION
 */
function buildOneEvent(eventId, ids, windowDays = 21) {
    const ownerId = pick(ids.userIds);
    const typeName = ids.typeNames && ids.typeNames.length ? pick(ids.typeNames) : pick(ACTIVITY_TYPES);
    const type = typeName;

    // --- Time Generation ---
    const needBook = randomNeedBook(type);
    const today = new Date();

    // Determine the Start Time (20% past, 80% future)
    let start;
    if (faker.datatype.boolean(0.2)) {
        start = faker.date.recent({ days: windowDays, refDate: today }); // Past event
    } else {
        start = faker.date.soon({ days: windowDays, refDate: today }); // Future event
    }

    // Enforce 1-3 hour duration
    const durationHours = faker.number.int({ min: 1, max: 3 });
    const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
    const status = randomStatus(start, end);

    // --- Location/Booking Logic ---
    let location_desc;
    let venue_booking_record = null;
    let capacity = randomCapacity(type);

    if (needBook) {
        // Choose a venue and enforce constraints
        const venue = pick(DUMMY_VENUES);
        const venueId = venue.Venue_id;
        location_desc = venue.Name;

        // Ensure event time is within venue open/close times
        start.setHours(faker.number.int({ min: venue.Open_time, max: venue.Close_time - durationHours }));
        end.setTime(start.getTime() + durationHours * 60 * 60 * 1000);

        capacity = faker.number.int({ min: 2, max: venue.Capacity });

        venue_booking_record = {
            event_id: eventId,
            venue_id: venueId,
        };
    } else {
        // General location
        const places = ['溫州街', '師大夜市', '公館捷運站', '醉月湖旁', '女九下', '活動中心前'];
        location_desc = pick(places);
    }

    // --- Group Restriction Logic ---
    const isGroupRestricted = faker.datatype.boolean(0.4);
    const restriction_records = [];

    if (isGroupRestricted && ids.groupIds.length) {
        // Randomly select 1 to 3 groups for restriction
        const restrictedGroups = faker.helpers.arrayElements(ids.groupIds, { min: 1, max: 3 });
        for (const groupId of restrictedGroups) {
            restriction_records.push({
                event_id: eventId,
                group_id: groupId,
            });
        }
    }

    // --- Final EVENT Record ---
    const event_record = {
        event_id: eventId, // PK will be ignored by pg-promise if using serial, but useful for relational data.
        owner_id: ownerId,
        type_name: type,
        need_book: needBook,
        title: pick(TITLE_TEMPLATES[type]),
        content: content,
        capacity: capacity,
        location_desc: location_desc,
        start_time: start,
        end_time: end,
        status: status,
        created_at: faker.date.between({
            from: new Date(start.getTime() - 30 * 24 * 3600 * 1000), // Up to 30 days before start
            to: start,
        }),
    };

    return {
        event: event_record,
        venue_booking: venue_booking_record,
        restrictions: restriction_records,
    };
}

function buildAllRecords(n, ids) {
    const events = [];
    const venueBookings = [];
    const groupRestrictions = [];

    // Start Event_id counter from 1 (assuming the table is empty or we manage the serial ourselves)
    for (let i = 1; i <= n; i++) {
        const records = buildOneEvent(i, ids);

        events.push(records.event);

        if (records.venue_booking) {
            venueBookings.push(records.venue_booking);
        }

        groupRestrictions.push(...records.restrictions);
    }

    return { events, venueBookings, groupRestrictions };
}


// --- Insertion Functions ---

async function insertEvents(events) {
    const cs = new pgp.helpers.ColumnSet(
        [
            // Note: Removed 'group_id'
            'event_id', 'owner_id', 'type_name', 'need_book', 'title', 'content',
            'capacity', 'location_desc', 'start_time', 'end_time', 'status', 'created_at'
        ],
        { table: { table: 'event', schema: 'jojo' } }
    );
    const query = pgp.helpers.insert(events, cs) + ' ON CONFLICT (event_id) DO NOTHING';
    return db.none(query);
}

async function insertVenueBookings(bookings) {
    const cs = new pgp.helpers.ColumnSet(
        ['event_id', 'venue_id'],
        { table: { table: 'venue_booking', schema: 'jojo' } }
    );
    const query = pgp.helpers.insert(bookings, cs);
    return db.none(query);
}

async function insertGroupRestrictions(restrictions) {
    const cs = new pgp.helpers.ColumnSet(
        ['event_id', 'group_id'],
        { table: { table: 'event_group_restriction', schema: 'jojo' } }
    );
    const query = pgp.helpers.insert(restrictions, cs);
    return db.none(query);
}

// --- Main Execution ---

async function main() {
    const ids = await getExistingIds();
    if (!ids.userIds.length) {
        console.error('No users found. Seed users before seeding events.');
        process.exit(1);
    }

    const { events, venueBookings, groupRestrictions } = buildAllRecords(COUNT, ids);

    if (DRY_RUN && !INSERT) {
        console.log(`[dry] Generated ${events.length} EVENT records.`);
        console.log(`[dry] Generated ${venueBookings.length} VENUE_BOOKING records.`);
        console.log(`[dry] Generated ${groupRestrictions.length} EVENT_GROUP_RESTRICTION records.`);

        console.log('\n--- Sample EVENT Records ---');
        console.table(events.slice(0, Math.min(10, events.length)).map((e) => ({
            ID: e.event_id,
            Title: e.title,
            Type: e.type_name,
            NeedBook: e.need_book,
            Location: e.location_desc,
            Owner: e.owner_id,
            Start: e.start_time.toISOString().substring(0, 16),
            Status: e.status,
            Restrictions: groupRestrictions.filter(r => r.event_id === e.event_id).map(r => r.group_id).join(', ')
        })));

    }

    if (INSERT) {
        try {
            // Note: Order of insertion matters (EVENT must be first)
            await insertEvents(events);
            console.log(`Inserted ${events.length} EVENT records.`);

            if (venueBookings.length) {
                await insertVenueBookings(venueBookings);
                console.log(`Inserted ${venueBookings.length} VENUE_BOOKING records.`);
            }

            if (groupRestrictions.length) {
                await insertGroupRestrictions(groupRestrictions);
                console.log(`Inserted ${groupRestrictions.length} EVENT_GROUP_RESTRICTION records.`);
            }

        } catch (err) {
            console.error('Failed to insert records:', err);
            process.exitCode = 1;
        } finally {
            pgp.end();
        }
    } else {
        pgp.end();
    }
}

main();
