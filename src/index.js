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

// ==========================================
// 3. 管理者 API (Admin)
// ==========================================

// --- A. 管理者登入 ---
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const admin = await db.oneOrNone(
            'SELECT * FROM "ADMIN" WHERE "Username" = $1 AND "Password" = $2',
            [username, password]
        );
        
        if (!admin) {
            return res.status(401).json({ error: '帳號或密碼錯誤' });
        }
        
        res.json({ 
            success: true, 
            adminId: admin.Admin_id,
            name: admin.Name 
        });
    } catch (err) {
        console.error('Admin Login Error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// --- B. 活動類型管理 ---

// B1. 取得所有活動類型
app.get('/api/admin/event-types', async (req, res) => {
    try {
        const types = await db.manyOrNone(`
            SELECT "Type_name", COUNT(*) as event_count 
            FROM "EVENT" 
            GROUP BY "Type_name"
            ORDER BY event_count DESC
        `);
        res.json(types);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch types' });
    }
});

// B2. 新增活動類型
app.post('/api/admin/event-types', async (req, res) => {
    const { typeName } = req.body;
    
    if (!typeName || !typeName.trim()) {
        return res.status(400).json({ error: '類型名稱不可為空' });
    }
    
    try {
        // 檢查是否已存在
        const exists = await db.oneOrNone(
            'SELECT 1 FROM "EVENT" WHERE "Type_name" = $1 LIMIT 1',
            [typeName]
        );
        
        if (exists) {
            return res.status(400).json({ error: '此類型已存在' });
        }
        
        // 插入一筆範例活動來建立新類型
        await db.none(
            `INSERT INTO "EVENT" ("Owner_id", "Type_name", "Title", "Content", "Capacity", "Start_time", "End_time") 
             VALUES (1, $1, '範例活動', '此為系統建立的範例活動', 999, NOW(), NOW())`,
            [typeName]
        );
        
        res.json({ success: true, message: `類型「${typeName}」已新增` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add type' });
    }
});

// B3. 刪除活動類型
app.delete('/api/admin/event-types/:name', async (req, res) => {
    const typeName = decodeURIComponent(req.params.name);
    
    try {
        // 檢查是否有活動使用此類型
        const count = await db.one(
            'SELECT COUNT(*) as count FROM "EVENT" WHERE "Type_name" = $1',
            [typeName]
        );
        
        if (parseInt(count.count) > 0) {
            return res.status(400).json({ 
                error: `無法刪除：尚有 ${count.count} 個活動使用此類型` 
            });
        }
        
        res.json({ success: true, message: '類型已刪除' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete type' });
    }
});

// --- C. 群組管理 ---

// C1. 取得所有群組
app.get('/api/admin/groups', async (req, res) => {
    try {
        const groups = await db.manyOrNone(`
            SELECT 
                g.*,
                COUNT(DISTINCT ug."User_id") as member_count,
                COUNT(DISTINCT e."Event_id") as event_count
            FROM "GROUP" g
            LEFT JOIN "USER_GROUP" ug ON g."Group_id" = ug."Group_id"
            LEFT JOIN "EVENT" e ON g."Group_id" = e."Group_id"
            GROUP BY g."Group_id"
            ORDER BY g."Name"
        `);
        res.json(groups);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

// C2. 新增群組
app.post('/api/admin/groups', async (req, res) => {
    const { groupName, description } = req.body;
    
    if (!groupName || !groupName.trim()) {
        return res.status(400).json({ error: '群組名稱不可為空' });
    }
    
    try {
        const result = await db.one(
            `INSERT INTO "GROUP" ("Name", "Description") 
             VALUES ($1, $2) RETURNING "Group_id"`,
            [groupName, description || '']
        );
        
        res.json({ 
            success: true, 
            groupId: result.Group_id,
            message: `群組「${groupName}」已建立` 
        });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: '群組名稱已存在' });
        }
        console.error(err);
        res.status(500).json({ error: 'Failed to create group' });
    }
});

// C3. 刪除群組
app.delete('/api/admin/groups/:id', async (req, res) => {
    const groupId = req.params.id;
    
    try {
        // 檢查是否有活動使用此群組
        const eventCount = await db.one(
            'SELECT COUNT(*) as count FROM "EVENT" WHERE "Group_id" = $1',
            [groupId]
        );
        
        if (parseInt(eventCount.count) > 0) {
            return res.status(400).json({ 
                error: `無法刪除：尚有 ${eventCount.count} 個活動限定此群組` 
            });
        }
        
        // 先刪除成員關聯
        await db.none('DELETE FROM "USER_GROUP" WHERE "Group_id" = $1', [groupId]);
        
        // 刪除群組
        await db.none('DELETE FROM "GROUP" WHERE "Group_id" = $1', [groupId]);
        
        res.json({ success: true, message: '群組已刪除' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete group' });
    }
});

// --- D. 使用者管理 ---

// D1. 取得所有使用者（含統計）
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await db.manyOrNone(`
            SELECT 
                u.*,
                COUNT(DISTINCT e."Event_id") as hosted_count,
                COUNT(DISTINCT jr."Event_id") as joined_count
            FROM "USER" u
            LEFT JOIN "EVENT" e ON u."User_id" = e."Owner_id"
            LEFT JOIN "JOIN_RECORD" jr ON u."User_id" = jr."User_id"
            GROUP BY u."User_id"
            ORDER BY u."User_id"
        `);
        res.json(users);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// D2. 刪除使用者
app.delete('/api/admin/users/:id', async (req, res) => {
    const userId = req.params.id;
    
    try {
        // 先刪除相關記錄（外鍵約束）
        await db.none('DELETE FROM "JOIN_RECORD" WHERE "User_id" = $1', [userId]);
        await db.none('DELETE FROM "USER_GROUP" WHERE "User_id" = $1', [userId]);
        await db.none('DELETE FROM "PREFERENCE" WHERE "User_id" = $1', [userId]);
        
        // 活動的擁有者設為 NULL（或可選擇刪除活動）
        await db.none('UPDATE "EVENT" SET "Owner_id" = NULL WHERE "Owner_id" = $1', [userId]);
        
        // 刪除使用者
        await db.none('DELETE FROM "USER" WHERE "User_id" = $1', [userId]);
        
        res.json({ success: true, message: '使用者已刪除' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// --- E. 活動管理 ---

// E1. 取得所有活動（含詳細資訊）
app.get('/api/admin/events', async (req, res) => {
    try {
        const events = await db.manyOrNone(`
            SELECT 
                e.*,
                u."Name" as owner_name,
                g."Name" as group_name,
                COUNT(jr."User_id") as participant_count
            FROM "EVENT" e
            LEFT JOIN "USER" u ON e."Owner_id" = u."User_id"
            LEFT JOIN "GROUP" g ON e."Group_id" = g."Group_id"
            LEFT JOIN "JOIN_RECORD" jr ON e."Event_id" = jr."Event_id"
            GROUP BY e."Event_id", u."Name", g."Name"
            ORDER BY e."Start_time" DESC
        `);
        res.json(events);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

// E2. 刪除活動
app.delete('/api/admin/events/:id', async (req, res) => {
    const eventId = req.params.id;
    
    try {
        // 先刪除相關記錄
        await db.none('DELETE FROM "JOIN_RECORD" WHERE "Event_id" = $1', [eventId]);
        await db.none('DELETE FROM "VENUE_BOOKING" WHERE "Event_id" = $1', [eventId]);
        
        // 刪除活動
        await db.none('DELETE FROM "EVENT" WHERE "Event_id" = $1', [eventId]);
        
        res.json({ success: true, message: '活動已刪除' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete event' });
    }
});

// ==========================================
// 4. 數據分析 API (Analytics)
// ==========================================

// --- A. 整體統計概覽 ---
app.get('/api/admin/analytics/overview', async (req, res) => {
    try {
        // 總使用者數
        const userCount = await db.one('SELECT COUNT(*) as count FROM "USER"');
        
        // 總活動數
        const eventCount = await db.one('SELECT COUNT(*) as count FROM "EVENT"');
        
        // 總群組數
        const groupCount = await db.one('SELECT COUNT(*) as count FROM "GROUP"');
        
        // 總參與次數
        const participationCount = await db.one('SELECT COUNT(*) as count FROM "JOIN_RECORD"');
        
        // 本月新增活動
        const thisMonthEvents = await db.one(`
            SELECT COUNT(*) as count FROM "EVENT" 
            WHERE DATE_TRUNC('month', "Start_time") = DATE_TRUNC('month', CURRENT_DATE)
        `);
        
        // 本月活躍使用者
        const thisMonthActiveUsers = await db.one(`
            SELECT COUNT(DISTINCT "User_id") as count FROM "JOIN_RECORD" 
            WHERE DATE_TRUNC('month', "Join_time") = DATE_TRUNC('month', CURRENT_DATE)
        `);
        
        res.json({
            totalUsers: parseInt(userCount.count),
            totalEvents: parseInt(eventCount.count),
            totalGroups: parseInt(groupCount.count),
            totalParticipations: parseInt(participationCount.count),
            thisMonthEvents: parseInt(thisMonthEvents.count),
            thisMonthActiveUsers: parseInt(thisMonthActiveUsers.count)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch overview' });
    }
});

// --- B. 活動類型分析 ---
app.get('/api/admin/analytics/events-by-type', async (req, res) => {
    const { startDate, endDate } = req.query;
    
    try {
        let query = `
            SELECT 
                "Type_name" as type,
                COUNT(*) as event_count,
                SUM("Capacity") as total_capacity,
                COUNT(DISTINCT "Owner_id") as unique_hosts,
                ROUND(AVG("Capacity"), 2) as avg_capacity
            FROM "EVENT"
            WHERE 1=1
        `;
        
        const params = [];
        if (startDate) {
            params.push(startDate);
            query += ` AND "Start_time" >= $${params.length}::timestamp`;
        }
        if (endDate) {
            params.push(endDate);
            query += ` AND "Start_time" <= $${params.length}::timestamp`;
        }
        
        query += ' GROUP BY "Type_name" ORDER BY event_count DESC';
        
        const data = await db.manyOrNone(query, params);
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch events by type' });
    }
});

// --- C. 群組參與度分析 ---
app.get('/api/admin/analytics/group-participation', async (req, res) => {
    try {
        const data = await db.manyOrNone(`
            SELECT 
                g."Name" as group_name,
                g."Group_id" as group_id,
                COUNT(DISTINCT e."Event_id") as event_count,
                COUNT(DISTINCT ug."User_id") as member_count,
                COUNT(DISTINCT jr."User_id") as active_members
            FROM "GROUP" g
            LEFT JOIN "EVENT" e ON g."Group_id" = e."Group_id"
            LEFT JOIN "USER_GROUP" ug ON g."Group_id" = ug."Group_id"
            LEFT JOIN "JOIN_RECORD" jr ON e."Event_id" = jr."Event_id"
            GROUP BY g."Group_id", g."Name"
            HAVING COUNT(DISTINCT e."Event_id") > 0 OR COUNT(DISTINCT ug."User_id") > 0
            ORDER BY event_count DESC
        `);
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch group participation' });
    }
});

// --- D. 使用者活躍度（時間序列）---
app.get('/api/admin/analytics/user-activity', async (req, res) => {
    const { days = 30 } = req.query;
    
    try {
        const data = await db.manyOrNone(`
            SELECT 
                DATE("Join_time") as date,
                COUNT(DISTINCT "User_id") as active_users,
                COUNT(*) as total_joins
            FROM "JOIN_RECORD"
            WHERE "Join_time" >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
            GROUP BY DATE("Join_time")
            ORDER BY date DESC
        `);
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch user activity' });
    }
});

// --- E. 活動容量分析 ---
app.get('/api/admin/analytics/capacity-stats', async (req, res) => {
    try {
        const data = await db.manyOrNone(`
            SELECT 
                e."Type_name" as type,
                e."Event_id" as event_id,
                e."Title" as title,
                e."Capacity" as capacity,
                COUNT(jr."User_id") as current_participants,
                ROUND((COUNT(jr."User_id")::float / NULLIF(e."Capacity", 0)) * 100, 2) as fill_rate
            FROM "EVENT" e
            LEFT JOIN "JOIN_RECORD" jr ON e."Event_id" = jr."Event_id"
            GROUP BY e."Event_id", e."Title", e."Type_name", e."Capacity"
            HAVING e."Capacity" > 0
            ORDER BY fill_rate DESC
            LIMIT 20
        `);
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch capacity stats' });
    }
});

// --- F. 熱門主辦者排行 ---
app.get('/api/admin/analytics/top-hosts', async (req, res) => {
    try {
        const data = await db.manyOrNone(`
            SELECT 
                u."User_id" as user_id,
                u."Name" as name,
                COUNT(DISTINCT e."Event_id") as events_hosted,
                COUNT(DISTINCT jr."User_id") as total_participants,
                ROUND(AVG(e."Capacity"), 2) as avg_capacity
            FROM "USER" u
            JOIN "EVENT" e ON u."User_id" = e."Owner_id"
            LEFT JOIN "JOIN_RECORD" jr ON e."Event_id" = jr."Event_id"
            GROUP BY u."User_id", u."Name"
            ORDER BY events_hosted DESC
            LIMIT 10
        `);
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch top hosts' });
    }
});

// --- G. 取得所有標準興趣標籤 (GET) ---
app.get('/api/preferences/list', (req, res) => {
    // 假設這是推薦系統預設的標準標籤清單
    const standardTags = [
        "運動", "讀書", "電影", "宵夜", "戶外", "桌遊", "Coding", "攝影", "音樂", "美食"
    ];
    res.json(standardTags);
});
// --- H. 新增使用者偏好標籤 (POST) ---
app.post('/api/users/:id/preferences', async (req, res) => {
    const userId = req.params.id;
    const { typeName } = req.body; // typeName 就是使用者選擇的標籤 (例如 "Coding")
    // 新增一個預設的 Priority 值
    const defaultPriority = 1;
    try {
        await db.none(
            //  修正 SQL 語法：在欄位清單中加入 "Priority"
            `INSERT INTO "PREFERENCE" ("User_id", "Type_name", "Priority") 
             VALUES ($1, $2, $3) ON CONFLICT ("User_id", "Type_name") DO NOTHING`, // $3 是 Priority
            
            //  修正參數陣列：加入第三個參數 (Priority)
            [userId, typeName, defaultPriority]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Add Preference Error:', err);
        res.status(500).json({ error: 'Failed to add preference' });
    }
});
// --- I. 移除使用者偏好標籤 (DELETE) ---
app.delete('/api/users/:userId/preferences/:typeName', async (req, res) => {
    const { userId, typeName } = req.params; // 從 URL 參數獲取 User ID 和 Type Name

    try {
        // SQL 邏輯：從 PREFERENCE 表中刪除該使用者的該標籤
        const result = await db.result(
            `DELETE FROM "PREFERENCE" WHERE "User_id" = $1 AND "Type_name" = $2`,
            [userId, typeName]
        );

        // 檢查是否有刪除任何行
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Preference not found or already deleted.' });
        }
        
        res.json({ success: true, message: 'Preference deleted.' });

    } catch (err) {
        console.error('Delete Preference Error:', err);
        res.status(500).json({ error: 'Failed to delete preference.' });
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

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
async function main() {
  await connectMongo();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

main();
