import express from 'express';
import crypto from 'crypto';
import { db } from '../lib/db.js';

const router = express.Router();

// Hash password using SHA-256
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// 註冊新用戶
router.post('/register', async (req, res) => {
    const { name, email, sex, password, phone } = req.body;
    
    try {
        // 驗證必填欄位
        if (!name || !email || !sex || !password || !phone) {
            return res.status(400).json({ error: '所有欄位都是必填的' });
        }
        
        // 驗證 email 格式 (必須是 ntu.edu.tw 結尾)
        if (!email.endsWith('@ntu.edu.tw')) {
            return res.status(400).json({ error: 'Email 必須是 ntu.edu.tw 結尾' });
        }
        
        // 檢查 email 是否已被註冊
        const existingUser = await db.oneOrNone(
            'SELECT user_id FROM jojo.USER WHERE email = $1',
            [email]
        );
        
        if (existingUser) {
            return res.status(400).json({ error: '此 Email 已經被註冊' });
        }
        
        // Hash 密碼
        const hashedPassword = hashPassword(password);
        
        // 新增用戶到資料庫
        const result = await db.one(
            `INSERT INTO jojo.USER (name, email, sex, password_hash, phone, register_time) 
             VALUES ($1, $2, $3, $4, $5, NOW()) 
             RETURNING user_id, name, email, sex, phone, register_time`,
            [name, email, sex, hashedPassword, phone]
        );
        
        res.json({ 
            success: true, 
            message: '註冊成功',
            user: {
                id: result.user_id,
                name: result.name,
                email: result.email,
                sex: result.sex,
                phone: result.phone,
                registerTime: result.register_time
            }
        });
    } catch (err) {
        console.error('Register Error:', err);
        res.status(500).json({ error: '註冊失敗，請稍後再試' });
    }
});

// 用戶登入
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        // 驗證必填欄位
        if (!email || !password) {
            return res.status(400).json({ error: 'Email 和密碼都是必填的' });
        }
        
        // Hash 密碼
        const hashedPassword = hashPassword(password);
        
        // 查詢用戶
        const user = await db.oneOrNone(
            `SELECT user_id, name, email, sex, phone, register_time 
             FROM jojo.USER 
             WHERE email = $1 AND password_hash = $2`,
            [email, hashedPassword]
        );
        
        if (!user) {
            return res.status(401).json({ error: 'Email 或密碼錯誤' });
        }
        
        res.json({ 
            success: true,
            user: {
                id: user.user_id,
                name: user.name,
                email: user.email,
                sex: user.sex,
                phone: user.phone,
                role: 'student',
                registerTime: user.register_time
            }
        });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: '登入失敗，請稍後再試' });
    }
});

export default router;
