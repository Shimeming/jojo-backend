import express from 'express';
import cors from 'cors';
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
app.use(cors());
app.use(express.json());

// ==========================================
// 2. Routes
// ==========================================
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/track', trackRoutes);

// ==========================================
// 3. Event APIs
// ==========================================

// 取得活動列表 (搜尋、篩選、推薦)
app.get('/api/events', async (req, res) => {
    const { type, groupId, recommend, userId } = req.query;

    try {

        let query = `
            SELECT 
                e.event_id,
                e.title,
                e.content,
                e.type_name,
                e.start_time,
                e.end_time,
                e.capacity,
                e.status,
                COALESCE(e.location_desc, v.name) as location,
                e.owner_id,
                e.group_id,
                u.name as owner_name,
                g.name as group_name,
                COUNT(jr.user_id) FILTER (WHERE jr.status = 'confirmed') as current_people
            FROM jojo.EVENT e
            JOIN jojo.USER u ON e.owner_id = u.user_id
            LEFT JOIN jojo.GROUP g ON e.group_id = g.group_id
            LEFT JOIN jojo.VENUE v ON e.venue_id = v.venue_id
            LEFT JOIN jojo.JOIN_RECORD jr ON e.event_id = jr.event_id
            WHERE e.status = 'Open'
        `;
        
        const params = [];
        let paramIndex = 1;

        if (recommend === 'true' && userId) {
            query += ` AND (
                e.group_id IN (SELECT group_id FROM jojo.USER_GROUP WHERE user_id = $${paramIndex})
                OR (e.type_name IN (SELECT type_name FROM jojo.PREFERENCE WHERE user_id = $${paramIndex}) 
                    AND (e.group_id IS NULL OR e.group_id IN (SELECT group_id FROM jojo.USER_GROUP WHERE user_id = $${paramIndex})))
            )`;
            params.push(userId);
            paramIndex++;
        }

        if (type && type !== '全部') {
            query += ` AND e.type_name = $${paramIndex}`;
            params.push(type);
            paramIndex++;
        }

        if (groupId && groupId !== 'all') {
            query += ` AND e.group_id = $${paramIndex}`;
            params.push(groupId);
            paramIndex++;
        }

        query += ` GROUP BY e.event_id, e.location_desc, u.name, g.name, v.name ORDER BY e.start_time ASC`;

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
        
        // 3. 主辦過的活動（加入時間、類別、群組資訊）
        const hosted = await db.manyOrNone(`
            SELECT 
                e.event_id, 
                e.title, 
                e.start_time, 
                e.end_time, 
                e.capacity, 
                e.status,
                COALESCE(e.location_desc, v.name) as location,
                COUNT(jr.user_id) FILTER (WHERE jr.status = 'confirmed') as current_people,
                e.type_name,
                g.name as group_name
            FROM jojo.EVENT e
            LEFT JOIN jojo.GROUP g ON e.group_id = g.group_id
            LEFT JOIN jojo.VENUE v ON e.venue_id = v.venue_id
            LEFT JOIN jojo.JOIN_RECORD jr ON e.event_id = jr.event_id
            WHERE e.owner_id = $1
            GROUP BY e.event_id, e.title, e.start_time, e.end_time, e.capacity, e.status, e.location_desc, v.name, e.type_name, g.name
            ORDER BY e.start_time DESC
        `, [userId]);

        // 4. 參加過的活動（從 JOIN_RECORD 查詢）
        const joined = await db.manyOrNone(`
            SELECT 
                e.event_id, 
                e.title, 
                e.start_time, 
                e.end_time,
                e.status,
                COALESCE(e.location_desc, v.name) as location,
                e.type_name,
                g.name as group_name
            FROM jojo.JOIN_RECORD jr
            JOIN jojo.EVENT e ON jr.event_id = e.event_id
            LEFT JOIN jojo.GROUP g ON e.group_id = g.group_id
            LEFT JOIN jojo.VENUE v ON e.venue_id = v.venue_id
            WHERE jr.user_id = $1
            ORDER BY e.start_time DESC
        `, [userId]);

        // 5. 興趣 (用於推薦)
        const interests = await db.manyOrNone(`
            SELECT type_name FROM jojo.PREFERENCE WHERE user_id = $1
        `, [userId]);

        res.json({
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            sex: user.sex,
            avatar: '👤',
            groups: groups || [],
            hostedEvents: hosted || [],
            joinedEvents: joined || [],
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

// --- D. 加入群組 ---
app.post('/api/users/:id/groups', async (req, res) => {
    const userId = req.params.id;
    const { groupId } = req.body;
    
    try {
        await db.none(
            `INSERT INTO jojo.USER_GROUP (user_id, group_id) 
             VALUES ($1, $2) 
             ON CONFLICT (user_id, group_id) DO NOTHING`,
            [userId, groupId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Join group error:', err);
        res.status(500).json({ error: 'Failed to join group' });
    }
});

// --- E. 離開群組 ---
app.delete('/api/users/:id/groups/:groupId', async (req, res) => {
    const { id: userId, groupId } = req.params;
    
    try {
        const result = await db.result(
            `DELETE FROM jojo.USER_GROUP WHERE user_id = $1 AND group_id = $2`,
            [userId, groupId]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'User is not in this group' });
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Leave group error:', err);
        res.status(500).json({ error: 'Failed to leave group' });
    }
});

// --- F. 取得所有群組列表 (供用戶瀏覽) ---
app.get('/api/groups', async (req, res) => {
    try {
        const groups = await db.manyOrNone(`
            SELECT 
                g.group_id, 
                g.name, 
                g.category,
                COUNT(DISTINCT ug.user_id) as member_count
            FROM jojo.GROUP g
            LEFT JOIN jojo.USER_GROUP ug ON g.group_id = ug.group_id
            GROUP BY g.group_id, g.name, g.category
            ORDER BY g.category, g.name
        `);
        res.json(groups);
    } catch (err) {
        console.error('Fetch groups error:', err);
        res.status(500).json({ error: 'Failed to fetch groups' });
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
        
        // 使用事務確保活動創建和創辦者加入同時成功
        const result = await db.tx(async t => {
            // 1. 創建活動
            const event = await t.one(
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
            
            // 2. 創辦者自動加入活動
            await t.none(
                `INSERT INTO jojo.JOIN_RECORD (event_id, user_id, status, join_time) 
                 VALUES ($1, $2, 'confirmed', NOW())`,
                [event.event_id, userId]
            );
            
            return event;
        });
        
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
        // 1. 檢查活動是否存在並取得資訊
        const event = await db.oneOrNone(
            'SELECT event_id, capacity, status, group_id FROM jojo.EVENT WHERE event_id = $1',
            [eventId]
        );
        
        if (!event) {
            return res.status(404).json({ error: '活動不存在' });
        }
        
        // 2. 檢查活動狀態
        if (event.status !== 'Open') {
            return res.status(400).json({ error: '活動已關閉，無法報名' });
        }
        
        // 3. 檢查是否已報名
        const existingJoin = await db.oneOrNone(
            'SELECT * FROM jojo.JOIN_RECORD WHERE event_id = $1 AND user_id = $2',
            [eventId, userId]
        );
        
        if (existingJoin) {
            return res.status(400).json({ error: '你已經報名過這個活動囉！' });
        }
        
        // 4. 檢查活動容量
        const currentCount = await db.one(
            'SELECT COUNT(*) as count FROM jojo.JOIN_RECORD WHERE event_id = $1 AND status = \'confirmed\'',
            [eventId]
        );
        
        if (parseInt(currentCount.count) >= event.capacity) {
            return res.status(400).json({ error: '活動已額滿，無法報名' });
        }
        
        // 5. 檢查限定群組
        if (event.group_id) {
            const userInGroup = await db.oneOrNone(
                'SELECT * FROM jojo.USER_GROUP WHERE user_id = $1 AND group_id = $2',
                [userId, event.group_id]
            );
            
            if (!userInGroup) {
                return res.status(403).json({ error: '此活動限定群組成員，你不在該群組中' });
            }
        }
        
        // 6. 新增報名紀錄
        await db.none(
            `INSERT INTO jojo.JOIN_RECORD (event_id, user_id, status, join_time) 
             VALUES ($1, $2, 'confirmed', NOW())`,
            [eventId, userId]
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error('Join event error:', err);
        res.status(500).json({ error: 'Join failed' });
    }
});

app.patch('/api/events/:id/cancel', async (req, res) => {
    const eventId = req.params.id;
    
    try {
        // 檢查活動是否存在
        const event = await db.oneOrNone('SELECT * FROM jojo.EVENT WHERE event_id = $1', [eventId]);
        
        if (!event) {
            return res.status(404).json({ error: '活動不存在' });
        }
        
        // 統計受影響的報名人數
        const participantCount = await db.one(
            'SELECT COUNT(*) as count FROM jojo.JOIN_RECORD WHERE event_id = $1 AND status = \'confirmed\'',
            [eventId]
        );
        
        // 更新活動狀態為 Cancelled
        await db.none('UPDATE jojo.EVENT SET status = $1 WHERE event_id = $2', ['Cancelled', eventId]);
        
        // 注意：JOIN_RECORD 保留不刪除，以保存歷史記錄
        // 如需通知用戶，可以查詢 JOIN_RECORD 獲取所有報名用戶的資訊
        
        res.json({ 
            success: true, 
            message: '活動已取消',
            affectedParticipants: parseInt(participantCount.count)
        });
    } catch (err) {
        console.error('Cancel event error:', err);
        res.status(500).json({ error: 'Failed to cancel event' });
    }
});

app.get('/api/venues', async (req, res) => {
    try {
        const venues = await db.manyOrNone('SELECT venue_id AS id, name, building, location FROM jojo.VENUE ORDER BY name, location');
        res.json(venues);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch venues' });
    }
});

// ==========================================
// 6. Preference APIs
// ==========================================

app.get('/api/preferences/list', async (req, res) => {
    try {
        const types = await db.manyOrNone('SELECT name FROM jojo.EVENT_TYPE ORDER BY name');
        const typeNames = types.map(t => t.name);
        res.json(typeNames);
    } catch (err) {
        console.error('Fetch event types error:', err);
        res.status(500).json({ error: 'Failed to fetch event types' });
    }
});

app.post('/api/users/:id/preferences', async (req, res) => {
    const userId = req.params.id;
    const { type_name } = req.body;
    
    try {
        await db.none(
            `INSERT INTO jojo.PREFERENCE (user_id, type_name) 
             VALUES ($1, $2) 
             ON CONFLICT (user_id, type_name) DO NOTHING`,
            [userId, type_name]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Add Preference Error:', err);
        res.status(500).json({ error: 'Failed to add preference' });
    }
});

app.delete('/api/users/:userId/preferences/:typeName', async (req, res) => {
    const { userId, typeName } = req.params;

    try {
        const result = await db.result(
            `DELETE FROM jojo.PREFERENCE WHERE user_id = $1 AND type_name = $2`,
            [userId, typeName]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Preference not found' });
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Delete Preference Error:', err);
        res.status(500).json({ error: 'Failed to delete preference' });
    }
});

// ==========================================
// 7. Testing & Utilities
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
// 8. Server Start
// ==========================================

async function main() {
  await connectMongo();
  app.listen(PORT, () => {
    console.log(`✅ JoJo Backend Server running on port ${PORT}`);
  });
}

main();
