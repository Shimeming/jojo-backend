import express from 'express';
import { db, connectMongo, mongoDb } from './lib/db.js';
import { loadEnv } from './lib/env.js';
import adminRoutes from './routes/adminRoutes.js';
import authRoutes from './routes/authRoutes.js';
import trackRoutes from './routes/trackRoutes.js';

loadEnv();

const PORT = process.env.PORT || 3010;
const app = express();

// ==========================================
// 1. Middleware
// ==========================================
app.use(express.json());

// ==========================================
// 2. Routes
// ==========================================
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/', trackRoutes);

// ==========================================
// 3. Event APIs
// ==========================================

// 取得活動列表 (搜尋、篩選、推薦)
app.get('/api/events', async (req, res) => {
    // 取得前端傳來的篩選條件
    const { type, groupId, recommend, userId } = req.query;

    try {
        // 基礎查詢：撈取活動 + 主辦人名字 + 群組名字
        let query = `
            SELECT e.*, u.name as owner_name, g.name as group_name
            FROM jojo.EVENT e
            JOIN jojo.USER u ON e.owner_id = u.user_id
            LEFT JOIN jojo.GROUP g ON e.group_id = g.group_id
            WHERE 1=1 
        `; 
        
        const params = [];
        let paramIndex = 1;

        // 1. 類型篩選
        if (type && type !== '全部') {
            query += ` AND e.type_name = $${paramIndex}`;
            params.push(type);
            paramIndex++;
        }

        // 2. 群組/系所篩選
        if (groupId && groupId !== 'all') {
            query += ` AND e.group_id = $${paramIndex}`;
            params.push(groupId);
            paramIndex++;
        }

        // 3. 一鍵推薦 (查詢 PREFERENCE 表)
        if (recommend === 'true' && userId) {
            query += ` AND e.type_name IN (
                SELECT type_name FROM jojo.PREFERENCE WHERE user_id = $${paramIndex}
            )`;
            params.push(userId);
            paramIndex++;
        }

        // 排序：依時間排序
        query += ` ORDER BY e.start_time ASC`;

        const events = await db.manyOrNone(query, params);
        res.json(events);

    } catch (err) {
        console.error('Fetch Events Error:', err);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

// ==========================================
// 4. User APIs
// ==========================================

// 取得個人頁面資料
app.get('/api/users/:id/profile', async (req, res) => {
    const userId = req.params.id;
    try {
        // 1. 基本資料
        const user = await db.oneOrNone('SELECT * FROM jojo.USER WHERE user_id = $1', [userId]);
        
        if (!user) return res.status(404).json({ error: 'User not found' });

        // 2. 所屬群組 (JOIN 查詢)
        const groups = await db.manyOrNone(`
            SELECT g.group_id as id, g.name, g.category as type 
            FROM jojo.GROUP g 
            JOIN jojo.USER_GROUP ug ON g.group_id = ug.group_id 
            WHERE ug.user_id = $1
        `, [userId]);
        
        // 3. 主辦過的活動
        const hosted = await db.manyOrNone(`
            SELECT * FROM jojo.EVENT WHERE owner_id = $1
        `, [userId]);

        // 4. 興趣 (用於推薦)
        const interests = await db.manyOrNone(`
            SELECT type_name FROM jojo.PREFERENCE WHERE user_id = $1
        `, [userId]);

        res.json({
            name: user.name,
            email: user.email,
            avatar: '👤',
            groups: groups || [],
            hostedEvents: hosted || [],
            joinedEvents: [], // 暫時留空或自行實作 JOIN_RECORD 查詢
            interests: interests.map(i => i.type_name) || []
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'DB Error on Profile Fetch' });
    }
});

// --- C. 取得用戶所屬群組 (建立活動用) ---
app.get('/api/users/:id/groups', async (req, res) => {
    const userId = req.params.id;
    try {
        const groups = await db.manyOrNone(`
            SELECT g.group_id, g.name as group_name, g.category
            FROM jojo.GROUP g
            JOIN jojo.USER_GROUP ug ON g.group_id = ug.group_id
            WHERE ug.user_id = $1
            ORDER BY g.name
        `, [userId]);
        
        res.json(groups);
    } catch (err) {
        console.error('Fetch user groups error:', err);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

// --- D. 取得場地列表 (建立活動用) ---
app.get('/api/venues', async (req, res) => {
    try {
        const venues = await db.manyOrNone('SELECT * FROM jojo.VENUE');
        res.json(venues);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch venues' });
    }
});

// 建立活動
app.post('/api/events', async (req, res) => {
    // 從 req.body 拿資料
    const { userId, title, typeId, content, capacity, startTime, endTime, Group_id, groupId, locationName, venueId } = req.body;
    const finalGroupId = Group_id || groupId || null;
    
    try {
        // 驗證 userId
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }
        
        // 驗證時間格式
        if (!startTime || !endTime) {
            return res.status(400).json({ error: 'startTime and endTime are required' });
        }
        
        // 驗證結束時間必須大於開始時間
        if (new Date(endTime) <= new Date(startTime)) {
            return res.status(400).json({ error: 'endTime must be after startTime' });
        }
        
        // 驗證 userId 是否存在於資料庫
        const userExists = await db.oneOrNone(
            'SELECT user_id FROM jojo.USER WHERE user_id = $1',
            [userId]
        );
        
        if (!userExists) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const result = await db.one(
            `INSERT INTO jojo.EVENT 
                (owner_id, type_name, title, content, capacity, start_time, end_time, group_id, location_desc, venue_id) 
             VALUES 
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
             RETURNING event_id`,
             [
                userId,                               // $1 owner_id (使用實際登入的 user_id)
                typeId || '其他',                      // $2 type_name
                title,                                // $3 title
                content,                              // $4 content
                capacity,                             // $5 capacity
                startTime,                            // $6 start_time (TIMESTAMP)
                endTime,                              // $7 end_time (TIMESTAMP)
                finalGroupId,                         // $8 group_id
                locationName || null,                 // $9 location_desc
                venueId ? parseInt(venueId) : null    // $10 venue_id
            ]
        );
        res.json({ success: true, eventId: result.event_id });
    } catch (err) {
        console.error('Create event error:', err);
        res.status(500).json({ error: 'Create failed', details: err.message });
    }
});

// 加入活動
app.post('/api/events/:id/join', async (req, res) => {
    const eventId = req.params.id;
    const { userId } = req.body;
    try {
        await db.none(
            `INSERT INTO jojo.JOIN_RECORD (event_id, user_id, status, join_time) 
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

// ==========================================
// 6. Testing & Utilities
// ==========================================

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

// ==========================================
// 7. Server Start
// ==========================================

async function main() {
  await connectMongo();
  app.listen(PORT, () => {
    console.log(`✅ JoJo Backend Server running on port ${PORT}`);
  });
}

main();
