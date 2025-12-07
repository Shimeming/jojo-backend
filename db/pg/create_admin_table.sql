-- 建立管理者表
CREATE TABLE IF NOT EXISTS "ADMIN" (
    "Admin_id" SERIAL PRIMARY KEY,
    "Username" VARCHAR(50) UNIQUE NOT NULL,
    "Password" VARCHAR(255) NOT NULL,
    "Name" VARCHAR(100) NOT NULL,
    "Email" VARCHAR(100),
    "Created_at" TIMESTAMP DEFAULT NOW()
);

-- 插入預設管理者帳號
-- Username: admin
-- Password: admin123
INSERT INTO "ADMIN" ("Username", "Password", "Name", "Email") 
VALUES ('admin', 'admin123', '系統管理員', 'admin@jojo.com')
ON CONFLICT ("Username") DO NOTHING;

-- 查詢確認
SELECT * FROM "ADMIN";
