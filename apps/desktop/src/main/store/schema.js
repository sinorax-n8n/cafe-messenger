// SQLite 테이블 스키마 정의
// 각 테이블의 CREATE TABLE SQL 문

const SCHEMAS = {
  accounts: `
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_name TEXT NOT NULL,
      naver_id TEXT NOT NULL UNIQUE,
      naver_password TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      today_sent_count INTEGER DEFAULT 0,
      sent_count_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `,

  cafes: `
    CREATE TABLE IF NOT EXISTS cafes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cafe_name TEXT NOT NULL,
      cafe_url TEXT NOT NULL,
      cafe_id TEXT,
      is_active INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `,

  templates: `
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `,

  members: `
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cafe_id INTEGER,
      nickname TEXT NOT NULL,
      member_key TEXT NOT NULL UNIQUE,
      write_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `
}

// 테이블별 컬럼 목록 (INSERT 시 사용)
const TABLE_COLUMNS = {
  accounts: ['account_name', 'naver_id', 'naver_password', 'is_active', 'today_sent_count', 'sent_count_date'],
  cafes: ['cafe_name', 'cafe_url', 'cafe_id', 'is_active'],
  templates: ['name', 'content'],
  members: ['cafe_id', 'nickname', 'member_key', 'write_date']
}

module.exports = {
  SCHEMAS,
  TABLE_COLUMNS
}
