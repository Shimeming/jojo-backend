import { db, pgp } from "../lib/db.js";
import { loadEnv } from "../lib/env.js";
import { faker } from "@faker-js/faker";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";

loadEnv();

// Seed script for EVENT table using meetup data
// Schema: jojo.EVENT(event_id, owner_id, group_id, type_name, title, content, capacity, location_desc, venue_id, start_time, end_time, status, created_at)

const args = process.argv.slice(2);
const COUNT = args.includes("--count")
  ? Number(args[args.indexOf("--count") + 1])
  : 10000;
const DRY_RUN = args.includes("--dry");

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

function generateContentFromTitle(
  eventType,
  title,
  { locationDesc, startTime, endTime },
) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const fmt = (d) =>
    `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const baseIntro =
    {
      運動: `本活動主題為「${title}」。一起流汗、放鬆身心，歡迎各種程度的同學參加！`,
      出遊: `本次「${title}」將一起外出走走、探索新景點，拍照打卡，放鬆充電！`,
      共煮: `「${title}」活動中大家會分工合作，一起備料、烹調，最後共享美味！`,
      宵夜: `一起吃宵夜聊聊天，認識新朋友，享受美食與輕鬆時光！`,
      讀書: `「${title}」為共學活動，將以重點整理、互助討論的方式提升學習效率。`,
      練舞: `主要進行分段練習與排舞，不論新手或老手皆可加入！`,
      其他: `「${title}」休閒交流活動，輕鬆參與、自在互動，歡迎有興趣的同學加入！`,
    }[eventType] || `「${title}」聚會，歡迎一起參加！`;

  const placeText = locationDesc
    ? `集合地點：${locationDesc}。`
    : `地點：報名後公告或以場地資訊為準。`;
  const timeText = `時間：${fmt(start)} 至 ${fmt(end)}。`;
  const prepText =
    {
      共煮: "食材與器具由大家分工準備，材料費AA制；若不方便準備也可一起協助分工。",
      讀書: "現場提供重點講義與題目練習，歡迎攜帶自己的筆記與題庫。",
      運動: "請穿著輕便服裝與運動鞋，攜帶水壺及毛巾。",
      練舞: "建議穿著便於活動的服裝與鞋子，活動中會進行暖身。",
      宵夜: "餐點以現場討論為主，若有素食需求請提前告知。",
      出遊: "請自行攜帶水與簡易防曬用品，路線以當日狀況彈性調整。",
      其他: "活動細節將於群組公告，歡迎提出建議與想法。",
    }[eventType] || "細節以當日公告為準。";

  const signupText =
    "報名後請準時出席，臨時無法參加請提前告知，以利人數與場地安排。";

  const content = [baseIntro, placeText, timeText, prepText, signupText].join(
    "\n",
  );
  return content.length > 1000 ? content.slice(0, 997) + "..." : content;
}

function adjustToRecentYear(date) {
  const d = new Date(date);
  const currentYear = new Date().getFullYear();
  d.setFullYear(
    faker.helpers.weightedArrayElement(
      Array.from({ length: 4 }, (_, i) => {
        const year = i + currentYear - 3;
        const weight = [0.1, 0.2, 0.3, 0.4][i];
        return { value: year, weight };
      }),
    ),
  );
  return d;
}

// Derive created_at, start_time, end_time preserving original offsets
function deriveTimesFromMeetup(meetupEvent) {
  const createdStr = meetupEvent.created;
  const eventTimeStr = meetupEvent.event_time;
  const durationStr = meetupEvent.duration;

  const originalCreated = createdStr
    ? new Date(createdStr.replace(" ", "T"))
    : new Date();
  const originalEventTime = eventTimeStr
    ? new Date(eventTimeStr.replace(" ", "T"))
    : new Date(originalCreated.getTime() + 24 * 3600 * 1000);

  const offsetMs = originalEventTime.getTime() - originalCreated.getTime();

  let createdAt = adjustToRecentYear(originalCreated);

  // Clamp start offset to within 2 months from createdAt
  const maxOffsetMs = 35 * 24 * 3600 * 1000; // ~35 days
  const clampedOffset = Math.min(Math.max(0, offsetMs), maxOffsetMs);
  let startTime = new Date(createdAt.getTime() + clampedOffset);

  // Apply small random shifts (< 7 days) to createdAt and startTime
  const maxShiftMs = 7 * 24 * 3600 * 1000 - 1; // strictly less than 7 days
  const createdShift = faker.number.int({ min: -maxShiftMs, max: maxShiftMs });
  const startShift = faker.number.int({ min: -maxShiftMs, max: maxShiftMs });
  createdAt = new Date(createdAt.getTime() + createdShift);
  startTime = new Date(startTime.getTime() + startShift);
  while (startTime.getTime() <= createdAt.getTime()) {
    startTime = new Date(
      startTime.getTime() + faker.number.int({ min: 0, max: maxShiftMs }),
    );
  }

  const durationSec = Number(durationStr);
  const fallbackHours = faker.number.int({ min: 1, max: 4 });
  const endTime = new Date(
    startTime.getTime() +
      (durationSec > 0 ? durationSec * 1000 : fallbackHours * 3600 * 1000),
  );

  return { createdAt, startTime, endTime };
}

// Main function to generate events
async function generateEvents(meetupEvents, userCount, groupCount, venueCount) {
  const events = [];
  const usedTitles = new Set();

  const groupNameToId = new Map();
  const venueNameToId = new Map();
  
  // console.log(`sample event: ${JSON.stringify(meetupEvents[0])}`);

  for (let i = 0; i < COUNT; i++) {
    const idx = faker.number.int({
      min: 0,
      max: Math.max(meetupEvents.length - 1, 0),
    });
    const meetupEvent = meetupEvents[idx];
    const eventName = meetupEvent.event_name;
    const description = meetupEvent.description;

    if (!eventName) continue;

    const eventType = classifyEvent(eventName, description);
    let title = generateChineseTitle(eventType, eventName);
    let uniqueTitle = title;
    let counter = 1;
    while (usedTitles.has(uniqueTitle)) {
      uniqueTitle = `${title} #${counter}`;
      counter++;
    }
    usedTitles.add(uniqueTitle);
    title = uniqueTitle;

    const { startTime, endTime, createdAt } =
      deriveTimesFromMeetup(meetupEvent);

    // Venue mapping: if venue.state == 'not_found' => no venue, keep text location; else assign venue_id and set location_desc NULL
    const venueState = (meetupEvent["venue.state"] || "").toLowerCase();
    const meetupVenueIdNum = Number(meetupEvent.venue_id);
    let locationDesc = "";
    let venueId = null;
    if (
      venueState &&
      venueState !== "not_found" &&
      !Number.isNaN(meetupVenueIdNum)
    ) {
      if (venueNameToId.has(meetupVenueIdNum)) {
        venueId = venueNameToId.get(meetupVenueIdNum);
      } else {
        venueId = faker.number.int({ min: 1, max: venueCount });
        venueNameToId.set(meetupVenueIdNum, venueId);
      }
      locationDesc = null;
    } else {
      locationDesc = faker.helpers.arrayElement(NTU_LOCATIONS);
      venueId = null;
    }

    const content = generateContentFromTitle(eventType, title, {
      locationDesc,
      startTime,
      endTime,
    });

    const ownerId = faker.number.int({ min: 1, max: userCount });

    // Group mapping: use group.who; if 'Members' => public
    const who = (meetupEvent["group.who"] || "").trim();
    let groupId = null;
    if (who && who.toLowerCase() !== "members") {
      // Only use existing group id if present; otherwise keep null
      groupId = groupNameToId.get(who) || null;
      if (!groupId) {
        groupId = faker.number.int({ min: 1, max: groupCount });
        groupNameToId.set(who, groupId);
      }
    }
    const capacity = faker.number.int({ min: 2, max: 30 });

    // Status derived from time: past => Closed, upcoming/ongoing => Open with small chance Cancelled
    const now = new Date();
    let status = "Open";
    if (endTime <= now) {
      status = "Closed";
    } else {
      const cancelChance = faker.number.float({ min: 0, max: 1 });
      if (cancelChance < 0.05) status = "Cancelled";
    }

    events.push({
      owner_id: ownerId,
      group_id: groupId,
      type_name: eventType,
      title: title.substring(0, 100), // Ensure title fits VARCHAR(100)
      content,
      capacity,
      location_desc: locationDesc,
      venue_id: venueId,
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
    const userResult = await db.one("SELECT COUNT(*) FROM jojo.user");
    const groupResult = await db.one("SELECT COUNT(*) FROM jojo.group");
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
      "title",
      "content",
      "capacity",
      "location_desc",
      "venue_id",
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
  const csvPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
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
  const meetupCsvPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
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

  if (DRY_RUN) {
    console.log(
      `[dry] Generated ${events.length} EVENT records (not inserting):`,
    );
    console.log("Sample events:");
    console.table(
      events.slice(0, 10).map((e) => {
        const { content, ...rest } = e;
        content.length > 50 && (e.content = content.substring(0, 47) + "...");
        return { ...rest, content: e.content };
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

  try {
    // First insert event types
    console.log("Inserting event types...");
    await insertEventTypes();

    console.log("Inserting events...");
    events.sort((a, b) => a.start_time.getTime() - b.start_time.getTime());
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

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
