import express from 'express';
import { db, connectMongo, mongoDb } from './lib/db.js';
import { loadEnv } from './lib/env.js';

loadEnv();

// 建議使用 3010 以配合你的前端 Proxy 設定
const PORT = process.env.PORT || 3010;

const app = express();

// ==========================================
// 1. 中間件 (Middleware)
// ==========================================
app.use(express.json());


// ==========================================
// 2. API 
// ==========================================

// --- A. 取得活動列表 (包含: 搜尋、篩選、推薦) ---
app.get('/api/events', async (req, res) => {
    // 取得前端傳來的篩選條件
    const { type, groupId, recommend, userId } = req.query;

    try {
        // 基礎查詢：撈取活動 + 主辦人名字 + 群組名字
        let query = `
            SELECT e.*, u."Name" as "Owner_name", g."Name" as "Group_name"
            FROM "EVENT" e
            JOIN "USER" u ON e."Owner_id" = u."User_id"
            LEFT JOIN "GROUP" g ON e."Group_id" = g."Group_id"
            WHERE 1=1 
        `; 
        
        const params = [];
        let paramIndex = 1;

        // 1. 類型篩選
        if (type && type !== '全部') {
            query += ` AND e."Type_name" = $${paramIndex}`;
            params.push(type);
            paramIndex++;
        }

        // 2. 群組/系所篩選
        if (groupId && groupId !== 'all') {
            query += ` AND e."Group_id" = $${paramIndex}`;
            params.push(groupId);
            paramIndex++;
        }

        // 3. 一鍵推薦 (查詢 PREFERENCE 表)
        if (recommend === 'true' && userId) {
            query += ` AND e."Type_name" IN (
                SELECT "Type_name" FROM "PREFERENCE" WHERE "User_id" = $${paramIndex}
            )`;
            params.push(userId);
            paramIndex++;
        }

        // 排序：依時間排序
        query += ` ORDER BY e."Start_time" ASC`;

        const events = await db.manyOrNone(query, params);
        res.json(events);

    } catch (err) {
        console.error('Fetch Events Error:', err);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

// --- B. 取得個人頁面資料 (Profile) ---
app.get('/api/users/:id/profile', async (req, res) => {
    const userId = req.params.id;
    try {
        // 1. 基本資料
        const user = await db.oneOrNone('SELECT * FROM "USER" WHERE "User_id" = $1', [userId]);
        
        if (!user) return res.status(404).json({ error: 'User not found' });

        // 2. 所屬群組 (JOIN 查詢)
        const groups = await db.manyOrNone(`
            SELECT g.* FROM "GROUP" g 
            JOIN "USER_GROUP" ug ON g."Group_id" = ug."Group_id" 
            WHERE ug."User_id" = $1
        `, [userId]);
        
        // 3. 主辦過的活動
        const hosted = await db.manyOrNone(`
            SELECT * FROM "EVENT" WHERE "Owner_id" = $1
        `, [userId]);

        // 4. 興趣 (用於推薦)
        const interests = await db.manyOrNone(`
            SELECT "Type_name" FROM "PREFERENCE" WHERE "User_id" = $1
        `, [userId]);

        res.json({
            ...user,
            groups: groups || [],
            hostedEvents: hosted || [],
            joinedEvents: [], // 暫時留空或自行實作 JOIN_RECORD 查詢
            interests: interests || []
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'DB Error on Profile Fetch' });
    }
});

// --- C. 取得場地列表 (建立活動用) ---
app.get('/api/venues', async (req, res) => {
    try {
        const venues = await db.manyOrNone('SELECT * FROM "VENUE"');
        res.json(venues);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch venues' });
    }
});

// --- D. 建立新活動 (POST) ---
app.post('/api/events', async (req, res) => {
    // 從 req.body 拿資料 (這就是為什麼要有 express.json())
    const { title, typeId, content, capacity, date, Group_id, groupId } = req.body;
    const finalGroupId = Group_id || groupId || null;
    try {
        // 這裡 Owner_id 先寫死為 1 (趙仲文 Demo)
        const result = await db.one(
            `INSERT INTO "EVENT" 
                ("Owner_id", "Type_name", "Title", "Content", "Capacity", "Start_time", "End_time", "Group_id") 
             VALUES 
                ($1, $2, $3, $4, $5, $6, $7, $8) 
             RETURNING "Event_id"`,
             [
                1,                        // $1
                typeId || '其他',          // $2
                title,                    // $3
                content,                  // $4
                capacity,                 // $5
                `${date} 10:00:00`,       // $6
                `${date} 12:00:00`,       // $7
                finalGroupId              // 
            ]
        );
        res.json({ success: true, eventId: result.Event_id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Create failed' });
    }
});

// --- E. 加入活動 (POST) ---
app.post('/api/events/:id/join', async (req, res) => {
    const eventId = req.params.id;
    const { userId } = req.body;
    try {
        await db.none(
            `INSERT INTO "JOIN_RECORD" ("Event_id", "User_id", "Status", "Join_time") 
             VALUES ($1, $2, 'confirmed', NOW())`,
            [eventId, userId]
        );
        res.json({ success: true });
    } catch (err) {
        if (err.code === '23505') { // 重複 Key 錯誤
            return res.status(400).json({ error: '你已經報名過這個活動囉！' });
        }
        console.error(err);
        res.status(500).json({ error: 'Join failed' });
    }
});


app.get('/', (_req, res) => {
  res.send('JoJo Backend is Running!');
});

app.get('/test', async (_req, res) => {
  try {
    const result = await db.manyOrNone(`SELECT * FROM test_table;`);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('/test-mongo', async (req, res) => {
  try {
    const collection = mongoDb.collection('test_collection');
    await collection.insertOne({ name: 'test_name' });
    const result = await collection.findOne({ name: 'test_name' });
    // cleanup
    await collection.deleteOne({ name: 'test_name' });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).send('mongo db error');
  }
});

app.get('/tables/:name', async (req, res) => {
  const tableName = req.params.name;
  try {
    const rows = await db.manyOrNone('SELECT * FROM $1:name LIMIT 100', [tableName]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed' });
  }
});

async function main() {
  await connectMongo();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

main();