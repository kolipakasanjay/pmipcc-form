/**
 * PMI Portfolio Content Request Management System
 * SQLite Data Layer & Security Persistence Manager
 * Uses Node.js 24 Native node:sqlite (DatabaseSync)
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'database.sqlite');
const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Initialize SQLite database instance
const db = new DatabaseSync(DB_PATH);

// Configure high-performance, robust WAL mode and foreign key constraints
try {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');
} catch (e) {
  console.warn('[DB] Notice on PRAGMA configuration:', e.message);
}

/**
 * Initialize Tables, Columns, and Indexes
 */
function initSchema() {
  // 1. Content Requests Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_requests (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      portfolio TEXT NOT NULL,
      request_title TEXT NOT NULL,
      submitter_name TEXT NOT NULL,
      submitter_role TEXT NOT NULL,
      submitter_email TEXT NOT NULL,
      submitter_phone TEXT,
      clarification_note TEXT,
      publishing_channel TEXT NOT NULL,
      headline TEXT,
      main_content TEXT NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 0,
      key_highlights TEXT,
      hashtags TEXT,
      mentions TEXT,
      linkedin_ids TEXT,
      instagram_ids TEXT,
      event_name TEXT,
      event_date TEXT,
      event_time TEXT,
      time_zone TEXT,
      video_public_link TEXT,
      no_media_checkbox INTEGER DEFAULT 0,
      image_requirement TEXT DEFAULT 'Create Image',
      delivery_date TEXT NOT NULL,
      delivery_time TEXT DEFAULT '09:00',
      repost_comments TEXT,
      status TEXT DEFAULT 'Pending Review',
      media_files_json TEXT,
      mention_notifications_json TEXT
    );
  `);

  // Migrate any missing columns in existing content_requests table
  const existingCols = db.prepare("PRAGMA table_info(content_requests)").all().map(c => c.name);
  const requiredCols = [
    { name: 'clarification_note', type: 'TEXT' },
    { name: 'delivery_time', type: 'TEXT DEFAULT \'09:00\'' },
    { name: 'repost_comments', type: 'TEXT' },
    { name: 'image_requirement', type: 'TEXT DEFAULT \'Create Image\'' },
    { name: 'status', type: 'TEXT DEFAULT \'Pending Review\'' },
    { name: 'media_files_json', type: 'TEXT' },
    { name: 'mention_notifications_json', type: 'TEXT' }
  ];
  for (const col of requiredCols) {
    if (!existingCols.includes(col.name)) {
      try {
        db.exec(`ALTER TABLE content_requests ADD COLUMN ${col.name} ${col.type};`);
      } catch (err) {}
    }
  }

  // 2. Request Attachments Table (Private File Storage Metadata)
  db.exec(`
    CREATE TABLE IF NOT EXISTS request_attachments (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // 3. Owner Authentication Table (Salted Scrypt Hashes)
  db.exec(`
    CREATE TABLE IF NOT EXISTS owner_auth (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      must_change INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 4. Owner Sessions Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS owner_sessions (
      token TEXT PRIMARY KEY,
      csrf_token TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      ip TEXT,
      user_agent TEXT
    );
  `);

  // Migrate existing owner_sessions columns if needed
  const sessionCols = db.prepare("PRAGMA table_info(owner_sessions)").all().map(c => c.name);
  if (!sessionCols.includes('csrf_token')) {
    try { db.exec("ALTER TABLE owner_sessions ADD COLUMN csrf_token TEXT;"); } catch (e) {}
  }
  if (!sessionCols.includes('expires_at')) {
    try { db.exec("ALTER TABLE owner_sessions ADD COLUMN expires_at TEXT;"); } catch (e) {}
  }
  if (!sessionCols.includes('ip')) {
    try { db.exec("ALTER TABLE owner_sessions ADD COLUMN ip TEXT;"); } catch (e) {}
  }
  if (!sessionCols.includes('user_agent')) {
    try { db.exec("ALTER TABLE owner_sessions ADD COLUMN user_agent TEXT;"); } catch (e) {}
  }

  // 5. Audit Log Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      target_id TEXT,
      details TEXT,
      ip TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // 6. Rate Limiting Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      attempts INTEGER DEFAULT 0,
      first_attempt INTEGER NOT NULL,
      locked_until INTEGER DEFAULT 0
    );
  `);

  // 7. Performance Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_requests_created ON content_requests(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_requests_portfolio ON content_requests(portfolio);
    CREATE INDEX IF NOT EXISTS idx_requests_delivery ON content_requests(delivery_date);
    CREATE INDEX IF NOT EXISTS idx_attachments_req ON request_attachments(request_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON owner_sessions(expires_at);
  `);

  // Bootstrap owner account if not present
  bootstrapOwnerAccount();

  // Migrate any legacy media JSON to request_attachments table
  migrateLegacyAttachments();
}

/**
 * Migrate legacy media JSON into private uploads & request_attachments table
 */
function migrateLegacyAttachments() {
  try {
    const existingCount = db.prepare('SELECT COUNT(*) as c FROM request_attachments').get().c;
    if (existingCount > 0) return;

    const rows = db.prepare('SELECT id, media_files_json, created_at FROM content_requests').all();
    for (const r of rows) {
      if (!r.media_files_json) continue;
      try {
        const files = JSON.parse(r.media_files_json || '[]');
        if (!Array.isArray(files)) continue;

        for (const f of files) {
          if (!f || !f.name) continue;
          const attId = crypto.randomUUID();
          const isPdf = Boolean(f.isPdf || (f.name && f.name.toLowerCase().endsWith('.pdf')));
          const ext = isPdf ? '.pdf' : (path.extname(f.name) || '.png');
          const storedName = `${attId}${ext}`;
          const storedPath = path.join(UPLOAD_DIR, storedName);

          if (f.dataUrl && f.dataUrl.includes('base64,')) {
            const b64 = f.dataUrl.split('base64,')[1];
            fs.writeFileSync(storedPath, Buffer.from(b64, 'base64'));
          } else {
            fs.writeFileSync(storedPath, Buffer.from(`Legacy archived attachment: ${f.name}`));
          }

          db.prepare(`
            INSERT INTO request_attachments (
              id, request_id, original_name, stored_filename, mime_type, file_size, file_type, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            attId,
            r.id,
            f.name,
            storedName,
            isPdf ? 'application/pdf' : 'image/png',
            Number(f.size) || 1024,
            isPdf ? 'PDF' : 'IMAGE',
            r.created_at || new Date().toISOString()
          );
        }
      } catch (err) {}
    }
  } catch (e) {
    console.warn('[DB_MIGRATE_ATTACHMENTS]', e.message);
  }
}

/**
 * Hash password using Node crypto scrypt
 */
function hashPassword(password, salt = null) {
  const effectiveSalt = salt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, effectiveSalt, 64);
  return {
    hash: derivedKey.toString('hex'),
    salt: effectiveSalt
  };
}

/**
 * Verify password with constant-time equality
 */
function verifyPassword(password, storedHash, salt) {
  try {
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (derivedKey.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derivedKey, storedBuf);
  } catch (e) {
    return false;
  }
}

/**
 * Bootstrap default owner account if empty
 */
function bootstrapOwnerAccount() {
  const existing = db.prepare('SELECT id, username, must_change FROM owner_auth LIMIT 1').get();
  if (!existing) {
    const defaultPass = process.env.INITIAL_OWNER_PASSWORD || 'owner@pmi2026';
    const defaultUser = process.env.INITIAL_OWNER_USERNAME || 'admin';
    const { hash, salt } = hashPassword(defaultPass);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO owner_auth (id, username, password_hash, salt, must_change, created_at, updated_at)
      VALUES (1, ?, ?, ?, 1, ?, ?)
    `).run(defaultUser, hash, salt, now, now);

    logAudit('SYSTEM_BOOTSTRAP', '1', `Initialized bootstrap owner account: ${defaultUser}`, '127.0.0.1');
  }
}

/**
 * Audit Logger
 */
function logAudit(action, targetId, details, ip) {
  try {
    db.prepare(`
      INSERT INTO audit_log (action, target_id, details, ip, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(action, targetId || null, details || null, ip || 'UNKNOWN', new Date().toISOString());
  } catch (e) {
    console.error('[AUDIT_ERROR]', e.message);
  }
}

/**
 * Generate Collision-Safe Unique Reference ID (REQ-YYYYMMDD-XXXX)
 */
function generateReferenceId() {
  const today = new Date();
  const year = today.getUTCFullYear();
  const month = String(today.getUTCMonth() + 1).padStart(2, '0');
  const day = String(today.getUTCDate()).padStart(2, '0');
  const datePrefix = `REQ-${year}${month}${day}`;

  for (let attempt = 0; attempt < 20; attempt++) {
    // 4-character cryptographically secure alphanumeric uppercase suffix
    const randomSuffix = crypto.randomBytes(3).toString('hex').slice(0, 4).toUpperCase();
    const candidateId = `${datePrefix}-${randomSuffix}`;

    const exists = db.prepare('SELECT id FROM content_requests WHERE id = ?').get(candidateId);
    if (!exists) {
      return candidateId;
    }
  }

  // Fallback with timestamp micro-entropy
  const fallbackSuffix = String(Math.floor(1000 + Math.random() * 9000));
  return `${datePrefix}-${fallbackSuffix}`;
}

// Run schema initialization
initSchema();

module.exports = {
  db,
  UPLOAD_DIR,
  DB_PATH,
  hashPassword,
  verifyPassword,
  logAudit,
  generateReferenceId
};
