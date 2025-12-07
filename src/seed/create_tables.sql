CREATE SCHEMA IF NOT EXISTS jojo;
-- Enum types
CREATE TYPE sex_enum AS ENUM ('Male', 'Female', 'Other');
CREATE TYPE event_status_enum AS ENUM ('Open', 'Closed', 'Cancelled');
CREATE TYPE join_status_enum AS ENUM ('confirmed', 'pending', 'rejected', 'cancelled');
CREATE TYPE group_category_enum AS ENUM ('department','dorm','club');

CREATE TABLE IF NOT EXISTS jojo.USER (
  user_id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  sex sex_enum,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE,
  register_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT email_ntu_check CHECK (
    email LIKE '%@ntu.edu.tw'
    OR email LIKE '%@g.ntu.edu.tw'
  )
);
-- ADMIN_USER
CREATE TABLE IF NOT EXISTS jojo.ADMIN_USER (
  user_id INTEGER PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL
);
-- GROUP
CREATE TABLE IF NOT EXISTS jojo.GROUP (
  group_id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  category group_category_enum NOT NULL
);
-- USER_GROUP
CREATE TABLE IF NOT EXISTS jojo.USER_GROUP (
  user_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, group_id),
  FOREIGN KEY (user_id) REFERENCES jojo.USER(user_id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES jojo.GROUP(group_id) ON DELETE CASCADE
);
-- EVENT_TYPE
CREATE TABLE IF NOT EXISTS jojo.EVENT_TYPE (name VARCHAR(50) PRIMARY KEY);
-- EVENT
CREATE TABLE IF NOT EXISTS jojo.EVENT (
  event_id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL,
  group_id BIGINT DEFAULT NULL,
  type_name VARCHAR(50) NOT NULL,
  title VARCHAR(100) NOT NULL,
  content TEXT,
  capacity INTEGER,
  location_desc VARCHAR(255),
  venue_id BIGINT,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  status event_status_enum DEFAULT 'Open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES jojo.USER(user_id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES jojo.GROUP(group_id) ON DELETE SET NULL,
  FOREIGN KEY (type_name) REFERENCES jojo.EVENT_TYPE(name) ON DELETE CASCADE,
  CONSTRAINT time_check CHECK (end_time > start_time),
  CONSTRAINT capacity_check CHECK (capacity IS NULL OR capacity > 0)
);
-- JOIN_RECORD
CREATE TABLE IF NOT EXISTS jojo.JOIN_RECORD (
  event_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  join_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status join_status_enum DEFAULT 'confirmed',
  PRIMARY KEY (event_id, user_id),
  FOREIGN KEY (event_id) REFERENCES jojo.EVENT(event_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES jojo.USER(user_id) ON DELETE CASCADE
);
-- VENUE
CREATE TABLE IF NOT EXISTS jojo.VENUE (
  venue_id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  building VARCHAR(100),
  location VARCHAR(100)
);
-- PREFERENCE
CREATE TABLE IF NOT EXISTS jojo.PREFERENCE (
  user_id INTEGER NOT NULL,
  type_name VARCHAR(50) NOT NULL,
  PRIMARY KEY (user_id, type_name),
  FOREIGN KEY (user_id) REFERENCES jojo.USER(user_id) ON DELETE CASCADE,
  FOREIGN KEY (type_name) REFERENCES jojo.EVENT_TYPE(name) ON DELETE CASCADE
);
