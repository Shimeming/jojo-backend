import { db, pgp } from "../lib/db.js";
import { loadEnv } from "../lib/env.js";
import { faker } from "@faker-js/faker";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

loadEnv();

// Seed script for EVENT table using meetup data
// Schema: jojo.EVENT(event_id, owner_id, group_id, type_name, need_book, title, content, capacity, location_desc, start_time, end_time, status, created_at)

const args = process.argv.slice(2);
const COUNT = args.includes("--count")
  ? Number(args[args.indexOf("--count") + 1])
  : 10000;
const DRY_RUN = args.includes("--dry");
const INSERT = args.includes("--insert");

// prettier-ignore
// Event types from seed_event_types.csv
const EVENT_TYPES = ['運動', '出遊', '共煮', '宵夜', '讀書', '練舞', '其他'];

// prettier-ignore
// Keywords mapping to classify meetup events into our event types
const TYPE_KEYWORDS = {
  '運動': [
    'sport', 'run', 'running', 'hike', 'hiking', 'bike', 'biking', 'cycling', 'yoga', 'fitness',
    'gym', 'workout', 'basketball', 'soccer', 'football', 'tennis', 'badminton', 'swimming',
    'volleyball', 'golf', 'martial', 'boxing', 'climbing', 'outdoor', 'adventure', 'trail',
    'walk', 'walking', 'exercise', 'training', 'marathon', 'triathlon', 'crossfit', 'pilates',
    'stretch', 'ski', 'snowboard', 'surf', 'kayak', 'paddle', 'frisbee', 'baseball', 'softball'
  ],
  '出遊': [
    'trip', 'travel', 'tour', 'explore', 'sightseeing', 'excursion', 'outing', 'getaway',
    'road trip', 'adventure', 'weekend', 'day trip', 'visit', 'museum', 'gallery', 'park',
    'beach', 'mountain', 'nature', 'camping', 'picnic', 'festival', 'fair', 'carnival',
    'concert', 'show', 'movie', 'theater', 'performance', 'exhibition', 'event'
  ],
  '共煮': [
    'cook', 'cooking', 'potluck', 'bake', 'baking', 'recipe', 'kitchen', 'culinary',
    'chef', 'food prep', 'meal prep', 'bbq', 'barbecue', 'grill', 'homemade'
  ],
  '宵夜': [
    'dinner', 'lunch', 'brunch', 'breakfast', 'food', 'eat', 'restaurant', 'cafe', 'coffee',
    'drinks', 'happy hour', 'bar', 'pub', 'nightlife', 'supper', 'meal', 'dine', 'dining',
    'foodie', 'tasting', 'wine', 'beer', 'cocktail', 'snack', 'late night', 'midnight'
  ],
  '讀書': [
    'book', 'read', 'reading', 'study', 'learning', 'education', 'class', 'course', 'workshop',
    'seminar', 'lecture', 'talk', 'discussion', 'library', 'literature', 'writing', 'language',
    'programming', 'coding', 'tech', 'technology', 'data', 'science', 'math', 'business',
    'professional', 'career', 'networking', 'meetup', 'conference', 'hackathon'
  ],
  '練舞': [
    'dance', 'dancing', 'salsa', 'bachata', 'tango', 'swing', 'ballroom', 'hip hop', 'ballet',
    'contemporary', 'jazz', 'zumba', 'line dance', 'latin', 'choreography', 'movement'
  ]
};

// prettier-ignore
// Chinese title templates for each event type
const TITLE_TEMPLATES = {
  '運動': [
    '一起來{activity}！', '{activity}揪團', '週末{activity}活動', '{activity}同好會',
    '假日{activity}團', '下班後{activity}', '早起{activity}團', '{activity}新手入門',
    '輕鬆{activity}局', '來運動吧！{activity}'
  ],
  '出遊': [
    '{location}一日遊', '週末{activity}去', '探索{location}', '{activity}出遊團',
    '假日{activity}行', '一起去{location}', '{location}之旅', '說走就走{activity}',
    '{activity}踏青團', '輕旅行：{location}'
  ],
  '共煮': [
    '一起來做{food}', '{food}料理教室', '週末共煮：{food}', '手作{food}',
    '{food}烹飪團', '來學做{food}', '共煮之夜：{food}', '{food}DIY',
    '今晚我們煮{food}', '廚藝交流：{food}'
  ],
  '宵夜': [
    '{food}團', '深夜{food}', '宵夜{food}揪', '一起吃{food}',
    '來份{food}吧', '今晚吃{food}', '{food}聚餐', '美食團：{food}',
    '下班後{food}', '週末{food}聚'
  ],
  '讀書': [
    '{topic}讀書會', '一起學{topic}', '{topic}研討會', '{topic}學習團',
    '期中{topic}衝刺', '{topic}共學小組', '{topic}討論會', '進修：{topic}',
    '{topic}分享會', '考前{topic}讀書團'
  ],
  '練舞': [
    '{style}舞蹈練習', '一起跳{style}', '{style}練舞團', '週末{style}',
    '{style}舞蹈班', '來跳{style}吧', '{style}舞聚', '舞動夜晚：{style}',
    '{style}初學者班', '{style}進階練習'
  ],
  '其他': [
    '週末活動揪團', '有人要一起嗎？', '休閒活動團', '來玩吧！',
    '輕鬆聚會', '假日活動', '社交聚會', '同好交流',
    '週末小聚', '一起來玩'
  ]
};

// prettier-ignore
// Activity/topic words for templates
const TEMPLATE_FILLS = {
  '運動': {
    activity: [
      '打球', '跑步', '健身', '瑜珈', '游泳', '騎車', '爬山', '羽球', '籃球', '桌球',
      '排球', '網球', '足球', '攀岩', '重訓'
    ]
  },
  '出遊': {
    activity: ['踏青', '郊遊', '爬山', '看展', '逛街', '野餐', '露營', '看海', '賞花', '拍照'],
    location: [
      '陽明山', '九份', '淡水', '北投', '象山', '貓空', '烏來', '平溪', '三峽', '鶯歌',
      '故宮', '美術館', '動物園', '植物園'
    ]
  },
  '共煮': {
    food: [
      '義大利麵', '咖哩', '壽司', '韓式料理', '泰式料理', '披薩', '蛋糕', '餅乾',
      '滷肉', '火鍋', '麻辣燙', '水餃', '蔥油餅', '炒飯', '燉湯'
    ]
  },
  '宵夜': {
    food: [
      '滷味', '鹹酥雞', '燒烤', '火鍋', '拉麵', '小火鍋', '熱炒', '居酒屋',
      '串燒', '雞排', '豆花', '珍奶', '鍋貼', '水餃', '炸物'
    ]
  },
  '讀書': {
    topic: [
      '微積分', '程式設計', '資料結構', '演算法', '經濟學', '統計學', '物理',
      '化學', '英文', '日文', '機器學習', '資料庫', '作業系統', '計算機網路', '離散數學'
    ]
  },
  '練舞': {
    style: [
      '街舞', 'K-pop', '現代舞', '爵士舞', '拉丁舞', '國標舞', '芭蕾', '嘻哈',
      'Popping', 'Locking', 'Breaking', 'Waacking', '肚皮舞', '踢踏舞'
    ]
  }
};

// prettier-ignore
// NTU location descriptions
const NTU_LOCATIONS = [
  '台大校門口集合', '小福廣場', '椰林大道', '醉月湖畔', '總圖前', '活大門口',
  '二活門口', '新生教學館', '博雅教學館', '綜合體育館', '舊體育館', '操場',
  '籃球場', '排球場', '舟山路', '長興街', '公館站2號出口', '台電大樓站',
  '118巷口', '水源市場', '公館夜市', '溫州街', '羅斯福路', '台大正門口',
  '社科院', '法學院', '管院', '工綜', '電機系館', '資工系館', '數學系館'
];

function loadMeetupEvents(csvPath) {
  const raw = fs.readFileSync(csvPath, "utf-8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });
  return records;
}

// Classify event based on name and description
function classifyEvent(eventName, description) {
  const text = `${eventName} ${description}`.toLowerCase();
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        return type;
      }
    }
  }
  return "其他";
}

function generateChineseTitle(eventType, originalTitle) {
  const templates = TITLE_TEMPLATES[eventType];
  const template = faker.helpers.arrayElement(templates);
  const fills = TEMPLATE_FILLS[eventType] || {};

  let title = template;
  for (const [key, values] of Object.entries(fills)) {
    if (title.includes(`{${key}}`)) {
      title = title.replace(`{${key}}`, faker.helpers.arrayElement(values));
    }
  }

  return title;
}

function generateContent(meetupDescription, eventType) {
  let content = meetupDescription
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  if (content.length > 500) {
    content = content.substring(0, 497) + "...";
  }

  if (content.length < 10) {
    const placeholders = {
      運動: "一起來運動，流流汗，認識新朋友！歡迎各種程度的同學參加。",
      出遊: "一起出去走走，探索新地方，拍拍照，放鬆一下！",
      共煮: "大家一起下廚，分享料理心得，享受美食！材料費AA制。",
      宵夜: "深夜肚子餓？一起來吃宵夜聊聊天吧！",
      讀書: "一起讀書，互相討論，準備考試！歡迎一起來衝刺。",
      練舞: "一起練舞，不管是新手還是老手都歡迎！",
      其他: "有興趣的同學歡迎報名參加，一起來玩！",
    };
    content = placeholders[eventType] || placeholders["其他"];
  }

  return content;
}

function adjustToRecentYear(date) {
  const d = new Date(date);
  const currentYear = new Date().getFullYear();
  const useLastYear = faker.datatype.boolean({ probability: 0.4 });
  d.setFullYear(useLastYear ? currentYear - 1 : currentYear);
  if (d > new Date()) {
    d.setFullYear(d.getFullYear() - 1);
  }
  return d;
}

// Derive event times from meetup created + duration
function getEventTimesFromMeetup(meetupEvent) {
  const createdStr = meetupEvent.created;
  const durationStr = meetupEvent.duration;

  // Parse created timestamp
  let start = createdStr ? new Date(createdStr.replace(" ", "T")) : new Date();
  start = adjustToRecentYear(start);

  // Duration in seconds (fallback to 1-4 hours)
  const durationSec = Number(durationStr);
  const fallbackHours = faker.number.int({ min: 1, max: 4 });
  const end = new Date(
    start.getTime() +
      (durationSec > 0 ? durationSec * 1000 : fallbackHours * 3600 * 1000),
  );

  return { startTime: start, endTime: end };
}

// Derive created_at from meetup created, adjusted to recent year
function getCreatedAtFromMeetup(meetupEvent) {
  const createdStr = meetupEvent.created;
  let created = createdStr
    ? new Date(createdStr.replace(" ", "T"))
    : new Date();
  created = adjustToRecentYear(created);
  return created;
}

// Main function to generate events
async function generateEvents(meetupEvents, userCount, groupCount, venueCount) {
  const events = [];
  const usedTitles = new Set();
  
  // Preload existing groups and venues for stable mappings
  const groupNameToId = new Map();
  const venueList = await db.manyOrNone('SELECT venue_id, name, building, location FROM jojo.venue');
  const venueCountActual = venueList.length;
  
  // Load existing groups into map
  const existingGroups = await db.manyOrNone('SELECT group_id, name FROM jojo."group"');
  for (const g of existingGroups) groupNameToId.set(g.name, g.group_id);
  
  async function ensureGroupIdByName(name) {
    if (groupNameToId.has(name)) return groupNameToId.get(name);
    // Default category: 'club'
    const inserted = await db.one(
      'INSERT INTO jojo."group" (name, category) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING group_id',
      [name, 'club']
    );
    groupNameToId.set(name, inserted.group_id);
    return inserted.group_id;
  }

  // Sample with replacement to allow COUNT > dataset size
  const max = meetupEvents.length;
  for (let i = 0; i < COUNT; i++) {
    const idx = faker.number.int({ min: 0, max: Math.max(max - 1, 0) });
    const meetupEvent = meetupEvents[idx];
    const eventName = meetupEvent.event_name || meetupEvent.name || "";
    const description = meetupEvent.description || "";

    // Skip if no event name
    if (!eventName) continue;

    // Classify event type
    const eventType = classifyEvent(eventName, description);

    // Generate Chinese title
    let title = generateChineseTitle(eventType, eventName);

    // Ensure unique title by appending number if needed
    let uniqueTitle = title;
    let counter = 1;
    while (usedTitles.has(uniqueTitle)) {
      uniqueTitle = `${title} #${counter}`;
      counter++;
    }
    usedTitles.add(uniqueTitle);
    title = uniqueTitle;

    // Generate content
    const content = generateContent(description, eventType);

    // Generate times based on meetup created + duration, adjusted to recent year
    const { startTime, endTime } = getEventTimesFromMeetup(meetupEvent);
    const createdAt = getCreatedAtFromMeetup(meetupEvent);

    // Random owner (user_id from 1 to userCount)
    const ownerId = faker.number.int({ min: 1, max: userCount });

    // Group mapping: use group.who; if 'Members' => public
    const who = (meetupEvent["group.who"] || meetupEvent.group_who || '').trim();
    let groupId = null;
    if (who && who.toLowerCase() !== 'members') {
      groupId = await ensureGroupIdByName(who);
    }

    // Capacity (2-30 people)
    const capacity = faker.number.int({ min: 2, max: 30 });

    // Location: map meetup venue_id deterministically to our venue list
    let locationDesc = faker.helpers.arrayElement(NTU_LOCATIONS);
    const meetupVenueIdStr = meetupEvent.venue_id || meetupEvent["venue_id"];
    const meetupVenueIdNum = Number(meetupVenueIdStr);
    if (!Number.isNaN(meetupVenueIdNum) && venueCountActual > 0) {
      const mappedIndex = Math.abs(meetupVenueIdNum) % venueCountActual;
      const v = venueList[mappedIndex];
      if (v) {
        locationDesc = `${v.name}${v.location ? ' ' + v.location : ''}`.substring(0, 255);
      }
    }

    // Need book (20% of events need venue booking)
    const needBook = faker.datatype.boolean({ probability: 0.2 });

    // Status derived from time: past => Closed, upcoming/ongoing => Open with small chance Cancelled
    const now = new Date();
    let status = 'Open';
    if (endTime <= now) {
      status = 'Closed';
    } else {
      const cancelChance = faker.number.float({ min: 0, max: 1 });
      if (cancelChance < 0.05) status = 'Cancelled';
    }

    events.push({
      owner_id: ownerId,
      group_id: groupId,
      type_name: eventType,
      need_book: needBook,
      title: title.substring(0, 100), // Ensure title fits VARCHAR(100)
      content,
      capacity,
      location_desc: locationDesc,
      start_time: startTime,
      end_time: endTime,
      status,
      created_at: createdAt,
    });
  }

  return events;
}

async function getTableCounts() {
  try {
    const userResult = await db.one('SELECT COUNT(*) FROM jojo."user"');
    const groupResult = await db.one('SELECT COUNT(*) FROM jojo."group"');
    const venueResult = await db.one("SELECT COUNT(*) FROM jojo.venue");
    return {
      userCount: parseInt(userResult.count),
      groupCount: parseInt(groupResult.count),
      venueCount: parseInt(venueResult.count),
    };
  } catch (error) {
    console.warn("Could not get table counts, using defaults:", error.message);
    return { userCount: 10000, groupCount: 200, venueCount: 100 };
  }
}

async function insertEvents(events) {
  const cs = new pgp.helpers.ColumnSet(
    [
      "owner_id",
      "group_id",
      "type_name",
      "need_book",
      "title",
      "content",
      "capacity",
      "location_desc",
      "start_time",
      "end_time",
      "status",
      "created_at",
    ],
    { table: { table: "event", schema: "jojo" } },
  );

  // Insert in batches of 1000
  const batchSize = 1000;
  let inserted = 0;

  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    const query = pgp.helpers.insert(batch, cs);
    await db.none(query);
    inserted += batch.length;
    console.log(`Inserted ${inserted}/${events.length} events...`);
  }

  return inserted;
}

async function insertEventTypes() {
  const csvPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "./seed_event_types.csv",
  );
  const raw = fs.readFileSync(csvPath, "utf-8");
  const lines = raw.trim().split(/\r?\n/);
  lines.shift(); // Remove header

  const types = lines.filter((line) => line.trim());

  for (const typeName of types) {
    try {
      await db.none(
        "INSERT INTO jojo.event_type (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
        [typeName],
      );
    } catch (error) {
      console.warn(`Could not insert event type ${typeName}:`, error.message);
    }
  }

  console.log(`Inserted ${types.length} event types`);
}

async function main() {
  console.log(`Generating ${COUNT} events from meetup data...`);

  // Load meetup events
  const meetupCsvPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "./meetup_data/events.csv",
  );

  console.log("Loading meetup events from CSV...");
  const meetupEvents = loadMeetupEvents(meetupCsvPath, COUNT + 5000);
  console.log(`Loaded ${meetupEvents.length} meetup events`);

  // Get counts for foreign keys
  const { userCount, groupCount, venueCount } = await getTableCounts();
  console.log(
    `User count: ${userCount}, Group count: ${groupCount}, Venue count: ${venueCount}`,
  );

  // Generate events
  console.log("Generating event records...");
  const events = await generateEvents(
    meetupEvents,
    userCount,
    groupCount,
    venueCount,
  );
  console.log(`Generated ${events.length} event records`);

  if (DRY_RUN && !INSERT) {
    console.log(
      `[dry] Generated ${events.length} EVENT records (not inserting):`,
    );
    console.log("Sample events:");
    console.table(
      events.slice(0, 10).map((e) => {
        const { content, ...rest } = e;
        content.length > 50 && (e.content = content.substring(0, 47) + "...");
        return {...rest, content: e.content};
      }),
    );

    // Show type distribution
    const typeCounts = {};
    for (const event of events) {
      typeCounts[event.type_name] = (typeCounts[event.type_name] || 0) + 1;
    }
    console.log("\nEvent type distribution:");
    console.table(typeCounts);
    return;
  }

  if (INSERT) {
    try {
      // First insert event types
      console.log("Inserting event types...");
      await insertEventTypes();

      // Then insert events
      console.log("Inserting events...");
      const inserted = await insertEvents(events);
      console.log(
        `Successfully inserted ${inserted} EVENT records into jojo.event`,
      );
    } catch (error) {
      console.error("Error inserting events:", error);
      throw error;
    } finally {
      await db.$pool.end();
    }
    return;
  }

  // Default: just show stats
  console.log(`Generated ${events.length} EVENT records`);
  console.log(
    "Use --dry to see sample records, or --insert to insert into database",
  );
  await db.$pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
