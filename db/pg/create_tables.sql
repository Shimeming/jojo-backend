-- USER
CREATE TABLE IF NOT EXISTS "USER" (
  "user_id" BIGSERIAL PRIMARY KEY,
  "name" VARCHAR(100) NOT NULL,
  "email" VARCHAR(255) NOT NULL UNIQUE,
  "sex" ENUM('Male', 'Female', 'Other'),
  "password_hash" VARCHAR(255) NOT NULL,
  "phone" VARCHAR(20) UNIQUE,
  "register_time" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT email_ntu_check CHECK (
    "email" LIKE '%@ntu.edu.tw'
    OR "email" LIKE '%@g.ntu.edu.tw'
  )
);
-- ADMIN_USER
CREATE TABLE IF NOT EXISTS "ADMIN_USER" (
  "user_id" INTEGER PRIMARY KEY,
  FOREIGN KEY ("user_id") REFERENCES "USER"("user_id") ON DELETE CASCADE
);
-- GROUP
CREATE TABLE IF NOT EXISTS "GROUP" (
  "group_id" BIGSERIAL PRIMARY KEY,
  "name" VARCHAR(100) NOT NULL UNIQUE,
);
-- USER_GROUP
CREATE TABLE IF NOT EXISTS "USER_GROUP" (
  "user_id" INTEGER NOT NULL,
  "group_id" INTEGER NOT NULL,
  PRIMARY KEY ("user_id", "group_id"),
  FOREIGN KEY ("user_id") REFERENCES "USER"("user_id") ON DELETE CASCADE,
  FOREIGN KEY ("group_id") REFERENCES "GROUP"("group_id") ON DELETE CASCADE
);
-- TYPE
CREATE TABLE IF NOT EXISTS "TYPE" ("name" VARCHAR(50) PRIMARY KEY);
-- EVENT
CREATE TABLE IF NOT EXISTS "EVENT" (
  "event_id" BIGSERIAL PRIMARY KEY,
  "owner_id" BIGINT NOT NULL,
  "group_id" BIGINT DEFAULT NULL,
  "type_name" VARCHAR(50) NOT NULL,
  "need_book" BOOLEAN DEFAULT FALSE,
  "title" VARCHAR(100) NOT NULL,
  "content" TEXT,
  "capacity" INTEGER,
  "location_desc" VARCHAR(255),
  "start_time" TIMESTAMP NOT NULL,
  "end_time" TIMESTAMP NOT NULL,
  "status" ENUM('Open', 'Closed', 'Cancelled') DEFAULT 'Open',
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("owner_id") REFERENCES "USER"("user_id") ON DELETE CASCADE,
  FOREIGN KEY ("group_id") REFERENCES "GROUP"("group_id") ON DELETE
  SET NULL,
    FOREIGN KEY ("type_name") REFERENCES "TYPE"("name") ON DELETE CASCADE,
    CONSTRAINT time_check CHECK ("end_time" > "start_time"),
    CONSTRAINT capacity_check CHECK ("capacity" IS NULL OR "capacity" > 0)
);
-- JOIN_RECORD
CREATE TABLE IF NOT EXISTS "JOIN_RECORD" (
  "event_id" BIGINT NOT NULL,
  "user_id" BIGINT NOT NULL,
  "join_time" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "status" ENUM('confirmed', 'pending', 'rejected', 'cancelled') DEFAULT 'confirmed',
  PRIMARY KEY ("event_id", "user_id"),
  FOREIGN KEY ("event_id") REFERENCES "EVENT"("event_id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "USER"("user_id") ON DELETE CASCADE
);
-- VENUE
CREATE TABLE IF NOT EXISTS "VENUE" (
  "venue_id" BIGSERIAL PRIMARY KEY,
  "name" VARCHAR(100) NOT NULL,
  "building" VARCHAR(100),
  "location" VARCHAR(100),
);
-- VENUE_BOOKING
CREATE TABLE IF NOT EXISTS "VENUE_BOOKING" (
  "event_id" BIGINT PRIMARY KEY,
  "venue_id" BIGINT NOT NULL,
  "book_datetime" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("event_id") REFERENCES "EVENT"("event_id") ON DELETE CASCADE,
  FOREIGN KEY ("venue_id") REFERENCES "VENUE"("venue_id") ON DELETE CASCADE
);
-- PREFERENCE
CREATE TABLE IF NOT EXISTS "PREFERENCE" (
  "user_id" INTEGER NOT NULL,
  "priority" INTEGER NOT NULL,
  "type_name" VARCHAR(50) NOT NULL,
  PRIMARY KEY ("user_id", "priority"),
  FOREIGN KEY ("user_id") REFERENCES "USER"("user_id") ON DELETE CASCADE,
  FOREIGN KEY ("type_name") REFERENCES "TYPE"("name") ON DELETE CASCADE,
  CONSTRAINT priority_check CHECK ("priority" > 0)
);