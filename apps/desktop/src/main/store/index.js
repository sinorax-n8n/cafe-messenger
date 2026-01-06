// SQLite 데이터 저장소
// better-sqlite3를 사용한 영구 데이터 저장

// 주의: better-sqlite3는 lazy loading으로 로드됨 (Vite 번들링 호환성)
let Database = null
const path = require('path')
const { app } = require('electron')
const { SCHEMAS, TABLE_COLUMNS } = require('./schema')

/**
 * better-sqlite3 네이티브 바인딩 경로 찾기
 * Electron 패키징 후 Windows용 prebuild 바이너리를 찾음
 *
 * 우선순위:
 * 1. 패키징된 앱의 prebuilds 폴더 (Windows용 prebuild)
 * 2. extraResource로 복사된 prebuilds 폴더
 * 3. 개발 모드의 prebuilds 폴더
 * 4. 기본 build/Release 폴더 (fallback)
 */
function findNativeBinding() {
  const fs = require('fs')

  // 플랫폼 정보
  const platform = process.platform // 'win32'
  const arch = process.arch // 'x64'
  const prebuildFolder = `${platform}-${arch}`

  console.log(`[Store] Looking for native binding for ${prebuildFolder}`)

  // 가능한 경로들 (우선순위 순)
  const possiblePaths = [
    // 1. 패키징된 앱 - asar.unpacked의 prebuilds (Forge hook으로 복사됨)
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules', 'better-sqlite3', 'prebuilds', prebuildFolder, 'better_sqlite3.node'),

    // 2. 패키징된 앱 - extraResource로 복사된 prebuilds
    path.join(process.resourcesPath || '', 'prebuilds', prebuildFolder, 'better_sqlite3.node'),

    // 3. 개발 모드 - 프로젝트 루트의 prebuilds 폴더 (download-prebuild.js로 다운로드)
    path.join(__dirname, '..', '..', '..', 'prebuilds', prebuildFolder, 'better_sqlite3.node'),

    // 4. 개발 모드 - node_modules 내 prebuilds
    path.join(__dirname, '..', '..', '..', 'node_modules', 'better-sqlite3', 'prebuilds', prebuildFolder, 'better_sqlite3.node'),

    // 5. Fallback - 기존 build/Release 경로 (asar.unpacked)
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),

    // 6. Fallback - 개발 모드 build/Release
    path.join(__dirname, '..', '..', '..', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
  ]

  for (const bindingPath of possiblePaths) {
    console.log('[Store] Checking native binding path:', bindingPath)
    if (fs.existsSync(bindingPath)) {
      console.log('[Store] Found native binding at:', bindingPath)
      return bindingPath
    }
  }

  console.log('[Store] No native binding found, will use default require')
  return null
}

class DataStore {
  constructor() {
    this.db = null
    this.initialized = false
  }

  /**
   * 데이터베이스 초기화
   * app.whenReady() 이후에 호출해야 함
   */
  initialize() {
    if (this.initialized) {
      console.log('[Store] Already initialized, skipping')
      return
    }

    try {
      // better-sqlite3 지연 로딩 (Vite 번들링 시 최상위 require 문제 방지)
      if (!Database) {
        console.log('[Store] Loading better-sqlite3...')

        // 네이티브 바인딩 경로 찾기
        const nativeBinding = findNativeBinding()

        if (nativeBinding) {
          // nativeBinding 옵션으로 경로 명시
          Database = require('better-sqlite3')
          console.log('[Store] better-sqlite3 loaded with native binding')
        } else {
          // 기본 require 사용 (개발 모드)
          Database = require('better-sqlite3')
          console.log('[Store] better-sqlite3 loaded with default require')
        }
      }

      // 앱 데이터 디렉토리에 DB 파일 생성
      const dbPath = path.join(app.getPath('userData'), 'cafe-messenger.db')
      console.log('[Store] Database path:', dbPath)

      // 네이티브 바인딩 경로를 옵션으로 전달
      const nativeBinding = findNativeBinding()
      const dbOptions = nativeBinding ? { nativeBinding } : {}

      this.db = new Database(dbPath, dbOptions)
      console.log('[Store] Database connection created')

      this.db.pragma('journal_mode = WAL') // 성능 향상
      console.log('[Store] WAL mode enabled')
      
      // 테이블 생성
      this.initTables()
      this.initialized = true

      console.log('[Store] Database initialized successfully')
    } catch (error) {
      console.error('[Store] Failed to initialize database:', error)
      throw error
    }
  }

  /**
   * 테이블 생성
   */
  initTables() {
    for (const [tableName, schema] of Object.entries(SCHEMAS)) {
      this.db.exec(schema)
      console.log(`[Store] Table '${tableName}' ready`)
    }

    // 마이그레이션 실행
    this.runMigrations()
  }

  /**
   * 데이터베이스 마이그레이션
   * 기존 테이블에 새 컬럼 추가
   */
  runMigrations() {
    console.log('[Store] Running migrations...')

    // members 테이블에 write_date 컬럼 추가 (없는 경우)
    this.addColumnIfNotExists('members', 'write_date', 'TEXT')

    // members 테이블에 member_key 컬럼 추가 (없는 경우)
    this.addColumnIfNotExists('members', 'member_key', 'TEXT')

    // accounts 테이블에 today_sent_count 컬럼 추가 (없는 경우)
    this.addColumnIfNotExists('accounts', 'today_sent_count', 'INTEGER DEFAULT 0')

    // accounts 테이블에 sent_count_date 컬럼 추가 (없는 경우)
    this.addColumnIfNotExists('accounts', 'sent_count_date', 'TEXT')

    console.log('[Store] Migrations completed')
  }

  /**
   * 컬럼이 없으면 추가
   * @param {string} table - 테이블 이름
   * @param {string} column - 컬럼 이름
   * @param {string} type - 컬럼 타입 (예: 'TEXT', 'INTEGER')
   */
  addColumnIfNotExists(table, column, type) {
    try {
      // 테이블 정보 조회
      const tableInfo = this.db.prepare(`PRAGMA table_info(${table})`).all()
      const columnExists = tableInfo.some(col => col.name === column)

      if (!columnExists) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
        console.log(`[Store] Added column '${column}' to table '${table}'`)
      }
    } catch (error) {
      console.error(`[Store] Migration error for ${table}.${column}:`, error)
    }
  }

  /**
   * DB 초기화 여부 확인
   */
  ensureInitialized() {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.')
    }
  }

  /**
   * 데이터 생성
   * @param {string} table - 테이블 이름
   * @param {object} data - 생성할 데이터
   * @returns {object} 생성된 데이터 (id 포함)
   */
  create(table, data) {
    this.ensureInitialized()
    const columns = TABLE_COLUMNS[table]
    if (!columns) {
      throw new Error(`Unknown table: ${table}`)
    }

    // 데이터에서 해당 테이블의 컬럼만 추출
    const values = {}
    for (const col of columns) {
      if (data[col] !== undefined) {
        values[col] = data[col]
      }
    }

    // created_at 추가
    values.created_at = new Date().toISOString()

    const cols = Object.keys(values)
    const placeholders = cols.map(c => `@${c}`).join(', ')
    const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`

    const stmt = this.db.prepare(sql)
    const result = stmt.run(values)

    // 생성된 레코드 반환
    return this.getById(table, result.lastInsertRowid)
  }

  /**
   * 모든 데이터 조회
   * @param {string} table - 테이블 이름
   * @returns {array} 모든 레코드
   */
  getAll(table) {
    this.ensureInitialized()
    const stmt = this.db.prepare(`SELECT * FROM ${table} ORDER BY id DESC`)
    return stmt.all()
  }

  /**
   * ID로 데이터 조회
   * @param {string} table - 테이블 이름
   * @param {number} id - 레코드 ID
   * @returns {object|null} 레코드 또는 null
   */
  getById(table, id) {
    this.ensureInitialized()
    const stmt = this.db.prepare(`SELECT * FROM ${table} WHERE id = ?`)
    return stmt.get(id) || null
  }

  /**
   * 조건으로 데이터 조회
   * @param {string} table - 테이블 이름
   * @param {function} predicate - 필터 함수
   * @returns {array} 필터링된 레코드들
   */
  find(table, predicate) {
    // 모든 데이터를 가져와서 JS로 필터링
    // (기존 인터페이스 호환성 유지)
    const all = this.getAll(table)
    return all.filter(predicate)
  }

  /**
   * 조건으로 단일 데이터 조회
   * @param {string} table - 테이블 이름
   * @param {object} where - 조건 객체 (예: { naver_id: 'test' })
   * @returns {object|null} 레코드 또는 null
   */
  findOne(table, where) {
    this.ensureInitialized()
    const conditions = Object.keys(where).map(k => `${k} = @${k}`).join(' AND ')
    const sql = `SELECT * FROM ${table} WHERE ${conditions} LIMIT 1`
    const stmt = this.db.prepare(sql)
    return stmt.get(where) || null
  }

  /**
   * 데이터 업데이트
   * @param {string} table - 테이블 이름
   * @param {number} id - 레코드 ID
   * @param {object} updates - 업데이트할 필드
   * @returns {object|null} 업데이트된 레코드 또는 null
   */
  update(table, id, updates) {
    this.ensureInitialized()
    // 기존 레코드 확인
    const existing = this.getById(table, id)
    if (!existing) return null

    // updated_at 추가
    updates.updated_at = new Date().toISOString()

    const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ')
    const sql = `UPDATE ${table} SET ${setClauses} WHERE id = @id`

    const stmt = this.db.prepare(sql)
    stmt.run({ ...updates, id })

    return this.getById(table, id)
  }

  /**
   * 데이터 삭제
   * @param {string} table - 테이블 이름
   * @param {number} id - 레코드 ID
   * @returns {boolean} 삭제 성공 여부
   */
  delete(table, id) {
    this.ensureInitialized()
    const stmt = this.db.prepare(`DELETE FROM ${table} WHERE id = ?`)
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * 모든 데이터 초기화
   */
  clear() {
    this.ensureInitialized()
    for (const tableName of Object.keys(SCHEMAS)) {
      this.db.exec(`DELETE FROM ${tableName}`)
    }
    console.log('[Store] All tables cleared')
  }

  /**
   * 데이터베이스 연결 종료
   */
  close() {
    if (this.db) {
      this.db.close()
      this.db = null
      this.initialized = false
      console.log('[Store] Database closed')
    }
  }

  /**
   * 일일 발송 카운트 리셋
   * 날짜가 바뀐 계정의 today_sent_count를 0으로 초기화
   */
  resetDailySentCount() {
    this.ensureInitialized()

    // 오늘 날짜 (YYYY-MM-DD 형식)
    const today = new Date().toISOString().split('T')[0]

    // sent_count_date가 오늘과 다른 계정들 업데이트
    const stmt = this.db.prepare(`
      UPDATE accounts
      SET today_sent_count = 0, sent_count_date = @today, updated_at = @updatedAt
      WHERE sent_count_date IS NULL OR sent_count_date != @today
    `)

    const result = stmt.run({
      today,
      updatedAt: new Date().toISOString()
    })

    if (result.changes > 0) {
      console.log(`[Store] Reset daily sent count for ${result.changes} account(s)`)
    } else {
      console.log('[Store] No accounts needed daily reset')
    }

    return result.changes
  }

  /**
   * 계정의 일일 발송 카운트 증가
   * @param {number} accountId - 계정 ID
   * @returns {object|null} 업데이트된 계정 정보
   */
  incrementSentCount(accountId) {
    this.ensureInitialized()

    const today = new Date().toISOString().split('T')[0]

    // 기존 계정 조회
    const account = this.getById('accounts', accountId)
    if (!account) return null

    if (account.sent_count_date !== today) {
      // 날짜가 바뀌었으면 카운트 리셋 후 1로 설정
      const stmt = this.db.prepare(`
        UPDATE accounts
        SET today_sent_count = 1, sent_count_date = @today, updated_at = @updatedAt
        WHERE id = @id
      `)
      stmt.run({ id: accountId, today, updatedAt: new Date().toISOString() })
      console.log(`[Store] 계정 ${accountId} 일일 발송 카운트 리셋 및 1로 설정 (날짜 변경)`)
    } else {
      // 같은 날이면 카운트 증가
      const stmt = this.db.prepare(`
        UPDATE accounts
        SET today_sent_count = today_sent_count + 1, updated_at = @updatedAt
        WHERE id = @id
      `)
      stmt.run({ id: accountId, updatedAt: new Date().toISOString() })
      console.log(`[Store] 계정 ${accountId} 일일 발송 카운트 증가: ${account.today_sent_count + 1}`)
    }

    return this.getById('accounts', accountId)
  }

  /**
   * 계정의 일일 발송 카운트를 특정 값으로 설정 (네이버 서버 값으로 동기화)
   * @param {number} accountId - 계정 ID
   * @param {number} count - 발송 건수
   * @returns {object|null} 업데이트된 계정 정보
   */
  setSentCount(accountId, count) {
    this.ensureInitialized()

    const today = new Date().toISOString().split('T')[0]

    const stmt = this.db.prepare(`
      UPDATE accounts
      SET today_sent_count = @count, sent_count_date = @today, updated_at = @updatedAt
      WHERE id = @id
    `)
    stmt.run({ id: accountId, count, today, updatedAt: new Date().toISOString() })
    console.log(`[Store] 계정 ${accountId} 발송 현황 동기화: ${count}건`)

    return this.getById('accounts', accountId)
  }
}

// 싱글톤 인스턴스
const store = new DataStore()

module.exports = store
