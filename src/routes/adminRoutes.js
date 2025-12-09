import express from 'express';
import crypto from 'crypto';
import { db, mongoDb } from '../lib/db.js';

const router = express.Router();

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// ==========================================
// 管理者 API Routes
// ==========================================

// --- 註冊 ---
router.post('/register', async (req, res) => {
    const { name, password } = req.body;
    
    try {
        if (!name || !password) {
            return res.status(400).json({ error: '帳號和密碼都是必填的' });
        }
        
        if (name.length > 10) {
            return res.status(400).json({ error: '帳號長度不能超過 10 個字元' });
        }
        
        const hashedPassword = hashPassword(password);
        
        const maxId = await db.oneOrNone('SELECT MAX(user_id) as max_id FROM jojo.ADMIN_USER');
        const nextId = (maxId?.max_id || 0) + 1;
        
        const result = await db.one(
            `INSERT INTO jojo.ADMIN_USER (user_id, name, password_hash) 
             VALUES ($1, $2, $3) 
             RETURNING user_id, name`,
            [nextId, name, hashedPassword]
        );
        
        res.json({ 
            success: true, 
            message: '註冊成功',
            admin: {
                id: result.user_id,
                name: result.name,
                role: 'admin'
            }
        });
    } catch (err) {
        console.error('Admin Register Error:', err);
        res.status(500).json({ error: '註冊失敗，請稍後再試' });
    }
});

// --- 登入 ---
router.post('/login', async (req, res) => {
    const { name, password } = req.body;
    
    try {
        if (!name || !password) {
            return res.status(400).json({ error: '帳號和密碼都是必填的' });
        }
        
        const hashedPassword = hashPassword(password);
        
        const admin = await db.oneOrNone(
            'SELECT user_id, name FROM jojo.ADMIN_USER WHERE name = $1 AND password_hash = $2',
            [name, hashedPassword]
        );
        
        if (!admin) {
            return res.status(401).json({ error: '帳號或密碼錯誤' });
        }
        
        res.json({ 
            success: true,
            admin: {
                id: admin.user_id,
                name: admin.name,
                role: 'admin'
            }
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
            SELECT 
                et.name as type_name, 
                COUNT(e.event_id) as event_count 
            FROM jojo.EVENT_TYPE et
            LEFT JOIN jojo.EVENT e ON et.name = e.type_name
            GROUP BY et.name
            ORDER BY event_count DESC, et.name ASC
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
            'SELECT 1 FROM jojo.EVENT_TYPE WHERE name = $1 LIMIT 1',
            [typeName]
        );
        
        if (exists) {
            return res.status(400).json({ error: '此類型已存在' });
        }
        
        await db.none(
            `INSERT INTO jojo.EVENT_TYPE (name) VALUES ($1)`,
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
            'SELECT COUNT(*) as count FROM jojo.EVENT WHERE type_name = $1',
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
                COUNT(DISTINCT ug.user_id) as member_count,
                COUNT(DISTINCT e.event_id) as event_count
            FROM jojo.GROUP g
            LEFT JOIN jojo.USER_GROUP ug ON g.group_id = ug.group_id
            LEFT JOIN jojo.EVENT e ON g.group_id = e.group_id
            GROUP BY g.group_id
            ORDER BY g.name
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
            `INSERT INTO jojo.GROUP (name, category) 
             VALUES ($1, 'club') RETURNING group_id`,
            [groupName]
        );
        
        res.json({ 
            success: true, 
            groupId: result.group_id,
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
            'SELECT COUNT(*) as count FROM jojo.EVENT WHERE group_id = $1',
            [groupId]
        );
        
        if (parseInt(eventCount.count) > 0) {
            return res.status(400).json({ 
                error: `無法刪除：尚有 ${eventCount.count} 個活動限定此群組` 
            });
        }
        
        await db.none('DELETE FROM jojo.USER_GROUP WHERE group_id = $1', [groupId]);
        await db.none('DELETE FROM jojo.GROUP WHERE group_id = $1', [groupId]);
        
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
                COUNT(DISTINCT e.event_id) as hosted_count,
                COUNT(DISTINCT jr.event_id) as joined_count
            FROM jojo.USER u
            LEFT JOIN jojo.EVENT e ON u.user_id = e.owner_id
            LEFT JOIN jojo.JOIN_RECORD jr ON u.user_id = jr.user_id
            GROUP BY u.user_id
            ORDER BY u.user_id
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
        await db.none('DELETE FROM jojo.JOIN_RECORD WHERE user_id = $1', [userId]);
        await db.none('DELETE FROM jojo.USER_GROUP WHERE user_id = $1', [userId]);
        await db.none('DELETE FROM jojo.PREFERENCE WHERE user_id = $1', [userId]);
        await db.none('UPDATE jojo.EVENT SET owner_id = NULL WHERE owner_id = $1', [userId]);
        await db.none('DELETE FROM jojo.USER WHERE user_id = $1', [userId]);
        
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
                COALESCE(e.location_desc, v.name) as location,
                u.name as owner_name,
                g.name as group_name,
                COUNT(jr.user_id) as participant_count
            FROM jojo.EVENT e
            LEFT JOIN jojo.USER u ON e.owner_id = u.user_id
            LEFT JOIN jojo.GROUP g ON e.group_id = g.group_id
            LEFT JOIN jojo.VENUE v ON e.venue_id = v.venue_id
            LEFT JOIN jojo.JOIN_RECORD jr ON e.event_id = jr.event_id
            GROUP BY e.event_id, e.location_desc, v.name, u.name, g.name
            ORDER BY e.start_time DESC
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
        await db.tx(async t => {
            await t.none('DELETE FROM jojo.JOIN_RECORD WHERE event_id = $1', [eventId]);
            const result = await t.result('DELETE FROM jojo.EVENT WHERE event_id = $1', [eventId]);
            if (result.rowCount === 0) {
                throw new Error('Event not found');
            }
        });
        
        res.json({ success: true, message: '活動已刪除' });
    } catch (err) {
        console.error('Delete event error:', err);
        if (err.message === 'Event not found') {
            return res.status(404).json({ error: '找不到此活動' });
        }
        res.status(500).json({ error: 'Failed to delete event' });
    }
});

// --- 數據分析 ---
router.get('/analytics/overview', async (req, res) => {
    try {
        const userCount = await db.one('SELECT COUNT(*) as count FROM jojo.USER');
        const eventCount = await db.one('SELECT COUNT(*) as count FROM jojo.EVENT');
        const groupCount = await db.one('SELECT COUNT(*) as count FROM jojo.GROUP');
        const groupEventCount = await db.one('SELECT COUNT(*) as count FROM jojo.EVENT WHERE group_id IS NOT NULL');
        const participationCount = await db.one('SELECT COUNT(*) as count FROM jojo.JOIN_RECORD');
        const totalCapacity = await db.one('SELECT COALESCE(SUM(capacity), 0) as total FROM jojo.EVENT');
        const thisMonthEvents = await db.one(`
            SELECT COUNT(*) as count FROM jojo.EVENT 
            WHERE DATE_TRUNC('month', start_time) = DATE_TRUNC('month', CURRENT_DATE)
        `);
        const thisMonthActiveUsers = await db.one(`
            SELECT COUNT(DISTINCT user_id) as count FROM jojo.JOIN_RECORD 
            WHERE DATE_TRUNC('month', join_time) = DATE_TRUNC('month', CURRENT_DATE)
        `);
        
        const avgParticipationRate = parseInt(totalCapacity.total) > 0 
            ? (parseInt(participationCount.count) / parseInt(totalCapacity.total)) * 100
            : 0;
        
        res.json({
            totalUsers: parseInt(userCount.count),
            totalEvents: parseInt(eventCount.count),
            totalGroups: parseInt(groupCount.count),
            groupEvents: parseInt(groupEventCount.count),
            totalParticipations: parseInt(participationCount.count),
            totalCapacity: parseInt(totalCapacity.total),
            avgParticipationRate: parseFloat(avgParticipationRate.toFixed(1)),
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
                type_name as type,
                COUNT(*) as event_count,
                SUM(capacity) as total_capacity,
                COUNT(DISTINCT owner_id) as unique_hosts,
                ROUND(AVG(capacity)::numeric, 2) as avg_capacity
            FROM jojo.EVENT
            WHERE 1=1
        `;
        
        const params = [];
        if (startDate) {
            params.push(startDate);
            query += ` AND start_time >= $${params.length}::timestamp`;
        }
        if (endDate) {
            params.push(endDate);
            query += ` AND start_time <= $${params.length}::timestamp`;
        }
        
        query += ' GROUP BY type_name ORDER BY event_count DESC';
        
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
                g.name as group_name,
                g.group_id as group_id,
                COUNT(DISTINCT e.event_id) as event_count,
                COUNT(DISTINCT ug.user_id) as member_count,
                COUNT(DISTINCT jr.user_id) as active_members
            FROM jojo.GROUP g
            LEFT JOIN jojo.EVENT e ON g.group_id = e.group_id
            LEFT JOIN jojo.USER_GROUP ug ON g.group_id = ug.group_id
            LEFT JOIN jojo.JOIN_RECORD jr ON e.event_id = jr.event_id
            GROUP BY g.group_id, g.name
            HAVING COUNT(DISTINCT e.event_id) > 0 OR COUNT(DISTINCT ug.user_id) > 0
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
                DATE(join_time) as date,
                COUNT(DISTINCT user_id) as active_users,
                COUNT(*) as total_joins
            FROM jojo.JOIN_RECORD
            WHERE join_time >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
            GROUP BY DATE(join_time)
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
        const totalEvents = await db.one('SELECT COUNT(*) as count FROM jojo.EVENT');
        const total = parseInt(totalEvents.count);
        
        const data = await db.manyOrNone(`
            SELECT 
                v.venue_id,
                v.name as venue_name,
                v.building,
                v.location,
                COUNT(e.event_id) as booking_count,
                ROUND((COUNT(e.event_id)::numeric / NULLIF($1, 0)) * 100, 2) as usage_rate
            FROM jojo.VENUE v
            LEFT JOIN jojo.EVENT e ON v.venue_id = e.venue_id
            GROUP BY v.venue_id, v.name, v.building, v.location
            ORDER BY booking_count DESC
            LIMIT 20
        `, [total]);
        
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch venue stats' });
    }
});

router.get('/analytics/top-hosts', async (req, res) => {
    try {
        const data = await db.manyOrNone(`
            SELECT 
                u.user_id as user_id,
                u.name as name,
                COUNT(DISTINCT e.event_id) as events_hosted,
                COUNT(DISTINCT jr.user_id) as total_participants,
                ROUND(AVG(e.capacity)::numeric, 2) as avg_capacity
            FROM jojo.USER u
            JOIN jojo.EVENT e ON u.user_id = e.owner_id
            LEFT JOIN jojo.JOIN_RECORD jr ON e.event_id = jr.event_id
            GROUP BY u.user_id, u.name
            ORDER BY events_hosted DESC
            LIMIT 10
        `);
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch top hosts' });
    }
});

router.get('/analytics/click-events', async (req, res) => {
    try {
        const collection = mongoDb.collection('click_events');
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const data = await collection.aggregate([
            {
                $match: {
                    timestamp: { $gte: thirtyDaysAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    date: '$_id',
                    clicks: '$count',
                    _id: 0
                }
            },
            {
                $sort: {
                    date: 1
                }
            }
        ]).toArray();
        
        res.json(data);
    } catch (err) {
        console.error('Fetch Click Events Error:', err);
        res.status(500).json({ error: 'Failed to fetch click events' });
    }
});

export default router;
