import express from 'express';
import { db } from '../lib/db.js';

const router = express.Router();

// ==========================================
// 管理者 API Routes
// ==========================================

// --- 登入 ---
router.post('/login', async (req, res) => {
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

// --- 活動類型管理 ---
router.get('/event-types', async (req, res) => {
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

router.post('/event-types', async (req, res) => {
    const { typeName } = req.body;
    
    if (!typeName || !typeName.trim()) {
        return res.status(400).json({ error: '類型名稱不可為空' });
    }
    
    try {
        const exists = await db.oneOrNone(
            'SELECT 1 FROM "EVENT" WHERE "Type_name" = $1 LIMIT 1',
            [typeName]
        );
        
        if (exists) {
            return res.status(400).json({ error: '此類型已存在' });
        }
        
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

router.delete('/event-types/:name', async (req, res) => {
    const typeName = decodeURIComponent(req.params.name);
    
    try {
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

// --- 群組管理 ---
router.get('/groups', async (req, res) => {
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

router.post('/groups', async (req, res) => {
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

router.delete('/groups/:id', async (req, res) => {
    const groupId = req.params.id;
    
    try {
        const eventCount = await db.one(
            'SELECT COUNT(*) as count FROM "EVENT" WHERE "Group_id" = $1',
            [groupId]
        );
        
        if (parseInt(eventCount.count) > 0) {
            return res.status(400).json({ 
                error: `無法刪除：尚有 ${eventCount.count} 個活動限定此群組` 
            });
        }
        
        await db.none('DELETE FROM "USER_GROUP" WHERE "Group_id" = $1', [groupId]);
        await db.none('DELETE FROM "GROUP" WHERE "Group_id" = $1', [groupId]);
        
        res.json({ success: true, message: '群組已刪除' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete group' });
    }
});

// --- 使用者管理 ---
router.get('/users', async (req, res) => {
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

router.delete('/users/:id', async (req, res) => {
    const userId = req.params.id;
    
    try {
        await db.none('DELETE FROM "JOIN_RECORD" WHERE "User_id" = $1', [userId]);
        await db.none('DELETE FROM "USER_GROUP" WHERE "User_id" = $1', [userId]);
        await db.none('DELETE FROM "PREFERENCE" WHERE "User_id" = $1', [userId]);
        await db.none('UPDATE "EVENT" SET "Owner_id" = NULL WHERE "Owner_id" = $1', [userId]);
        await db.none('DELETE FROM "USER" WHERE "User_id" = $1', [userId]);
        
        res.json({ success: true, message: '使用者已刪除' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// --- 活動管理 ---
router.get('/events', async (req, res) => {
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

router.delete('/events/:id', async (req, res) => {
    const eventId = req.params.id;
    
    try {
        await db.none('DELETE FROM "JOIN_RECORD" WHERE "Event_id" = $1', [eventId]);
        await db.none('DELETE FROM "VENUE_BOOKING" WHERE "Event_id" = $1', [eventId]);
        await db.none('DELETE FROM "EVENT" WHERE "Event_id" = $1', [eventId]);
        
        res.json({ success: true, message: '活動已刪除' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete event' });
    }
});

// --- 數據分析 ---
router.get('/analytics/overview', async (req, res) => {
    try {
        const userCount = await db.one('SELECT COUNT(*) as count FROM "USER"');
        const eventCount = await db.one('SELECT COUNT(*) as count FROM "EVENT"');
        const groupCount = await db.one('SELECT COUNT(*) as count FROM "GROUP"');
        const participationCount = await db.one('SELECT COUNT(*) as count FROM "JOIN_RECORD"');
        const thisMonthEvents = await db.one(`
            SELECT COUNT(*) as count FROM "EVENT" 
            WHERE DATE_TRUNC('month', "Start_time") = DATE_TRUNC('month', CURRENT_DATE)
        `);
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

router.get('/analytics/events-by-type', async (req, res) => {
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

router.get('/analytics/group-participation', async (req, res) => {
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

router.get('/analytics/user-activity', async (req, res) => {
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

router.get('/analytics/capacity-stats', async (req, res) => {
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

router.get('/analytics/top-hosts', async (req, res) => {
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

export default router;
