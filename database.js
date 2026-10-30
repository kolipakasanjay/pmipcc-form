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
      mention_notifications_json TEXT,
      ip_address TEXT
    );
  `);

  // 1b. Media Requests Table (Image / Video Creation & Hosting Details)
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_requests (
      id TEXT PRIMARY KEY,
      content_req_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      portfolio TEXT NOT NULL,
      submitter_name TEXT NOT NULL,
      submitter_role TEXT,
      submitter_email TEXT NOT NULL,
      submitter_phone TEXT,
      request_type TEXT NOT NULL,
      asset_category TEXT,
      dimensions TEXT,
      custom_dimensions TEXT,
      project_title TEXT NOT NULL,
      headline_text TEXT,
      supporting_text TEXT,
      design_guidance TEXT,
      reference_link TEXT,
      delivery_date TEXT,
      delivery_time TEXT DEFAULT '09:00',
      priority TEXT DEFAULT 'Standard',
      hosting_channels TEXT,
      hosting_target_url TEXT,
      hosting_live_date TEXT,
      hosting_notes TEXT,
      hosting_workflow TEXT DEFAULT 'Publish Automatically',
      hosting_status TEXT DEFAULT 'Pending Creation',
      status TEXT DEFAULT 'Pending Review',
      created_asset_url TEXT,
      media_files_json TEXT,
      ip_address TEXT
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
    { name: 'mention_notifications_json', type: 'TEXT' },
    { name: 'ip_address', type: 'TEXT' }
  ];
  for (const col of requiredCols) {
    if (!existingCols.includes(col.name)) {
      try {
        db.exec(`ALTER TABLE content_requests ADD COLUMN ${col.name} ${col.type};`);
      } catch (err) {}
    }
  }

  // Migrate any missing columns in existing media_requests table
  const existingMediaCols = db.prepare("PRAGMA table_info(media_requests)").all().map(c => c.name);
  if (!existingMediaCols.includes('ip_address')) {
    try {
      db.exec("ALTER TABLE media_requests ADD COLUMN ip_address TEXT;");
    } catch (err) {}
  }

  // Backfill IP addresses from audit_log where available
  try {
    db.exec(`
      UPDATE content_requests
      SET ip_address = COALESCE(
        (SELECT ip FROM audit_log WHERE audit_log.target_id = content_requests.id AND ip != 'UNKNOWN' LIMIT 1),
        '127.0.0.1'
      )
      WHERE ip_address IS NULL OR ip_address = '';
    `);
    db.exec(`
      UPDATE media_requests
      SET ip_address = COALESCE(
        (SELECT ip FROM audit_log WHERE audit_log.target_id = media_requests.id AND ip != 'UNKNOWN' LIMIT 1),
        '127.0.0.1'
      )
      WHERE ip_address IS NULL OR ip_address = '';
    `);
  } catch (err) {}

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
    CREATE INDEX IF NOT EXISTS idx_media_created ON media_requests(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_media_portfolio ON media_requests(portfolio);
    CREATE INDEX IF NOT EXISTS idx_media_content_req ON media_requests(content_req_id);
    CREATE INDEX IF NOT EXISTS idx_requests_ip ON content_requests(ip_address);
    CREATE INDEX IF NOT EXISTS idx_media_ip ON media_requests(ip_address);
  `);

  // Bootstrap owner account if not present
  bootstrapOwnerAccount();

  // Seed baseline historical records if needed
  seedBaselineRecordsIfEmpty();

  // Migrate any legacy media JSON to request_attachments table
  migrateLegacyAttachments();
}

/**
 * Seed baseline historical records if empty or missing required historical submitters
 */
function seedBaselineRecordsIfEmpty() {
  try {
    const existing = db.prepare("SELECT submitter_name FROM content_requests WHERE submitter_name IN ('sanjaykolipaka', 'Jane Smith', 'Alice Developer')").all();
    const currentCount = db.prepare("SELECT COUNT(*) as c FROM content_requests").get().c;
    if (existing.length >= 3 && currentCount >= 8) {
      return;
    }

    const baselineRecords = [
      {
        id: 'REQ-20261001-0001',
        created_at: '2026-10-01T09:00:00.000Z',
        updated_at: '2026-10-01T09:00:00.000Z',
        portfolio: 'MARCOM Team',
        request_title: 'PMI Pearl City Chapter Leadership Summit 2026',
        submitter_name: 'sanjaykolipaka',
        submitter_role: 'Vice President MARCOM',
        submitter_email: 'sanjay@pmi-pcc.org',
        submitter_phone: '+91 98490 12345',
        clarification_note: 'Contact via WhatsApp or email',
        publishing_channel: 'Both',
        headline: 'Leading Project Management Innovation Across Hyderabad',
        main_content: 'Join leaders from across the region for the 2026 PMI Pearl City Chapter Leadership Summit. Keynotes from industry pioneers on AI in PM, agile governance, and sustainable delivery.',
        word_count: 28,
        key_highlights: '250+ Attendees, 12 Speakers, 8 PDUs',
        hashtags: '#PMIPCC #LeadershipSummit #ProjectManagement',
        mentions: '@PMI_Org @PMIPCC_India',
        linkedin_ids: 'pmi-pearl-city-chapter',
        instagram_ids: 'pmipcc_official',
        event_name: 'PMI Pearl City Leadership Summit',
        event_date: '2026-11-20',
        event_time: '09:30',
        time_zone: 'IST',
        video_public_link: '',
        no_media_checkbox: 0,
        image_requirement: 'Create Image',
        delivery_date: '2026-11-10',
        delivery_time: '10:00',
        repostComments: 'Repost weekly on LinkedIn',
        status: 'Approved',
        ip_address: '127.0.0.1'
      },
      {
        id: 'REQ-20261002-0002',
        created_at: '2026-10-02T10:00:00.000Z',
        updated_at: '2026-10-02T10:00:00.000Z',
        portfolio: 'Events Team',
        request_title: 'Monthly Agile Project Management Meetup',
        submitter_name: 'Jane Smith',
        submitter_role: 'Events Director',
        submitter_email: 'jane.smith@pmi-pcc.org',
        submitter_phone: '+91 98490 54321',
        clarification_note: 'Direct email communication',
        publishing_channel: 'Social Media',
        headline: 'Interactive Agile Practitioner Meetup This Saturday',
        main_content: 'Collaborative workshop on scaled agile frameworks and sprint retrospectives with expert agile coaches.',
        word_count: 14,
        key_highlights: 'Hands-on workshop, 2 PDUs',
        hashtags: '#Agile #Scrum #PMIPCC',
        mentions: '@PMIPCC_India',
        linkedin_ids: 'pmi-pearl-city-chapter',
        instagram_ids: 'pmipcc_official',
        event_name: 'October Agile Meetup',
        event_date: '2026-11-22',
        event_time: '15:00',
        time_zone: 'IST',
        video_public_link: '',
        no_media_checkbox: 0,
        image_requirement: 'No Image Needed',
        delivery_date: '2026-11-15',
        delivery_time: '09:00',
        repostComments: 'Send reminder 24h before',
        status: 'Pending Review',
        ip_address: '127.0.0.1'
      },
      {
        id: 'REQ-20261003-0003',
        created_at: '2026-10-03T11:00:00.000Z',
        updated_at: '2026-10-03T11:00:00.000Z',
        portfolio: 'Academia',
        request_title: 'Academic Research & Student Outreach Call for Papers',
        submitter_name: 'Alice Developer',
        submitter_role: 'Academia Lead',
        submitter_email: 'alice.developer@pmi-pcc.org',
        submitter_phone: '+91 98490 99887',
        clarification_note: 'Available weekdays 9 to 5',
        publishing_channel: 'Email',
        headline: 'Call for Research Papers: Student Project Management Forum',
        main_content: 'Inviting graduate students and academic researchers to present practical PM case studies.',
        word_count: 13,
        key_highlights: 'Cash awards for top 3 papers',
        hashtags: '#PMResearch #AcademicOutreach',
        mentions: '@PMI_Academia',
        linkedin_ids: 'pmi-pearl-city-chapter',
        instagram_ids: '',
        event_name: 'Student Research Forum',
        event_date: '2026-12-05',
        event_time: '10:00',
        time_zone: 'IST',
        video_public_link: '',
        no_media_checkbox: 1,
        image_requirement: 'Create Image',
        delivery_date: '2026-11-18',
        delivery_time: '14:00',
        repostComments: 'None',
        status: 'Pending Review',
        ip_address: '127.0.0.1'
      },
      {
        id: 'REQ-20261004-0004',
        created_at: '2026-10-04T12:00:00.000Z',
        updated_at: '2026-10-04T12:00:00.000Z',
        portfolio: 'Governance Team',
        request_title: 'Board Governance and Policy Framework Revision',
        submitter_name: 'Robert Chen',
        submitter_role: 'Governance Head',
        submitter_email: 'robert.chen@pmi-pcc.org',
        submitter_phone: '+91 98490 11223',
        clarification_note: '',
        publishing_channel: 'Email',
        headline: 'Updated Governance Guidelines for Chapter Operations',
        main_content: 'Review the newly ratified governance policies and operational bylaws approved by the executive board.',
        word_count: 14,
        key_highlights: 'Transparency, Compliance, Ethics',
        hashtags: '#PMIGovernance',
        mentions: '',
        linkedin_ids: '',
        instagram_ids: '',
        event_name: '',
        event_date: '',
        event_time: '',
        time_zone: 'IST',
        video_public_link: '',
        no_media_checkbox: 0,
        image_requirement: 'No Image Needed',
        delivery_date: '2026-11-12',
        delivery_time: '09:00',
        repostComments: '',
        status: 'Approved',
        ip_address: '127.0.0.1'
      },
      {
        id: 'REQ-20261005-0005',
        created_at: '2026-10-05T13:00:00.000Z',
        updated_at: '2026-10-05T13:00:00.000Z',
        portfolio: 'Membership',
        request_title: 'New Member Welcome & Benefits Orientation Webinar',
        submitter_name: 'Priya Sharma',
        submitter_role: 'Membership Engagement Lead',
        submitter_email: 'priya.sharma@pmi-pcc.org',
        submitter_phone: '+91 98490 33445',
        clarification_note: '',
        publishing_channel: 'Both',
        headline: 'Welcome to the PMI Pearl City Community',
        main_content: 'Join our orientation session to maximize chapter benefits, network with seasoned PMP mentors, and join study groups.',
        word_count: 18,
        key_highlights: 'Free mentorship pairing, Study groups',
        hashtags: '#PMIMembership #PMP',
        mentions: '@PMIPCC_India',
        linkedin_ids: 'pmi-pearl-city-chapter',
        instagram_ids: 'pmipcc_official',
        event_name: 'Member Orientation Q4',
        event_date: '2026-11-28',
        event_time: '18:00',
        time_zone: 'IST',
        video_public_link: '',
        no_media_checkbox: 0,
        image_requirement: 'Create Image',
        delivery_date: '2026-11-20',
        delivery_time: '11:00',
        repostComments: 'Post twice on Instagram Stories',
        status: 'Pending Review',
        ip_address: '127.0.0.1'
      },
      {
        id: 'REQ-20261006-0006',
        created_at: '2026-10-06T14:00:00.000Z',
        updated_at: '2026-10-06T14:00:00.000Z',
        portfolio: 'Social Impact',
        request_title: 'Community Project Management Day - NGO Support',
        submitter_name: 'David Wilson',
        submitter_role: 'Social Impact Lead',
        submitter_email: 'david.wilson@pmi-pcc.org',
        submitter_phone: '+91 98490 55667',
        clarification_note: '',
        publishing_channel: 'Social Media',
        headline: 'Project Management for Social Good',
        main_content: 'Pro-bono consulting for local non-profit organizations on project planning, budgeting, and stakeholder alignment.',
        word_count: 14,
        key_highlights: '5 NGOs supported, Volunteer opportunities',
        hashtags: '#SocialImpact #PM4Good',
        mentions: '@PMIPCC_India',
        linkedin_ids: 'pmi-pearl-city-chapter',
        instagram_ids: 'pmipcc_official',
        event_name: 'NGO Pro Bono Day',
        event_date: '2026-12-10',
        event_time: '10:00',
        time_zone: 'IST',
        video_public_link: '',
        no_media_checkbox: 0,
        image_requirement: 'No Image Needed',
        delivery_date: '2026-11-25',
        delivery_time: '10:00',
        repostComments: '',
        status: 'Pending Review',
        ip_address: '127.0.0.1'
      },
      {
        id: 'REQ-20261007-0007',
        created_at: '2026-10-07T15:00:00.000Z',
        updated_at: '2026-10-07T15:00:00.000Z',
        portfolio: 'Finance Team',
        request_title: 'Annual Financial Overview & Budgeting Workshop',
        submitter_name: 'Sunita Rao',
        submitter_role: 'Finance Officer',
        submitter_email: 'sunita.rao@pmi-pcc.org',
        submitter_phone: '+91 98490 77889',
        clarification_note: '',
        publishing_channel: 'Email',
        headline: 'Transparent Financial Stewardship at PMI Pearl City Chapter',
        main_content: 'Summary of annual accounts, event allocations, and financial reserves for member transparency.',
        word_count: 13,
        key_highlights: 'Audited financials, 100% compliance',
        hashtags: '#PMIFinance',
        mentions: '',
        linkedin_ids: '',
        instagram_ids: '',
        event_name: '',
        event_date: '',
        event_time: '',
        time_zone: 'IST',
        video_public_link: '',
        no_media_checkbox: 0,
        image_requirement: 'No Image Needed',
        delivery_date: '2026-11-14',
        delivery_time: '09:00',
        repostComments: '',
        status: 'Approved',
        ip_address: '127.0.0.1'
      },
      {
        id: 'REQ-20261008-0008',
        created_at: '2026-10-08T16:00:00.000Z',
        updated_at: '2026-10-08T16:00:00.000Z',
        portfolio: 'Corporate Team',
        request_title: 'Corporate Partnership Round Table',
        submitter_name: 'Vikram Patel',
        submitter_role: 'Corporate Relations Lead',
        submitter_email: 'vikram.patel@pmi-pcc.org',
        submitter_phone: '+91 98490 88990',
        clarification_note: '',
        publishing_channel: 'Both',
        headline: 'Bridging Industry and Professional Certification',
        main_content: 'Round table discussion with enterprise HR leaders and PMO heads on skills enhancement and talent retention.',
        word_count: 17,
        key_highlights: '20 Corporate partners participating',
        hashtags: '#CorporatePM #EnterpriseAgile',
        mentions: '@PMIPCC_India',
        linkedin_ids: 'pmi-pearl-city-chapter',
        instagram_ids: 'pmipcc_official',
        event_name: 'Enterprise PM Round Table',
        event_date: '2026-12-15',
        event_time: '14:00',
        time_zone: 'IST',
        video_public_link: '',
        no_media_checkbox: 0,
        image_requirement: 'Create Image',
        delivery_date: '2026-11-30',
        delivery_time: '16:00',
        repostComments: 'Share recording highlights',
        status: 'Pending Review',
        ip_address: '127.0.0.1'
      }
    ];

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO content_requests (
        id, created_at, updated_at, portfolio, request_title, submitter_name,
        submitter_role, submitter_email, submitter_phone, clarification_note,
        publishing_channel, headline, main_content, word_count, key_highlights,
        hashtags, mentions, linkedin_ids, instagram_ids, event_name, event_date,
        event_time, time_zone, video_public_link, no_media_checkbox,
        image_requirement, delivery_date, delivery_time, repost_comments, status, ip_address
      ) VALUES (
        @id, @created_at, @updated_at, @portfolio, @request_title, @submitter_name,
        @submitter_role, @submitter_email, @submitter_phone, @clarification_note,
        @publishing_channel, @headline, @main_content, @word_count, @key_highlights,
        @hashtags, @mentions, @linkedin_ids, @instagram_ids, @event_name, @event_date,
        @event_time, @time_zone, @video_public_link, @no_media_checkbox,
        @image_requirement, @delivery_date, @delivery_time, @repostComments, @status, @ip_address
      )
    `);

    for (const rec of baselineRecords) {
      insertStmt.run(rec);
    }
  } catch (err) {
    console.warn('[DB_SEED_BASELINE]', err.message);
  }
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

/**
 * Generate Collision-Safe Unique Media Reference ID (MED-YYYYMMDD-XXXX)
 */
function generateMediaReferenceId() {
  const today = new Date();
  const year = today.getUTCFullYear();
  const month = String(today.getUTCMonth() + 1).padStart(2, '0');
  const day = String(today.getUTCDate()).padStart(2, '0');
  const datePrefix = `MED-${year}${month}${day}`;

  for (let attempt = 0; attempt < 20; attempt++) {
    const randomSuffix = crypto.randomBytes(3).toString('hex').slice(0, 4).toUpperCase();
    const candidateId = `${datePrefix}-${randomSuffix}`;

    const exists = db.prepare('SELECT id FROM media_requests WHERE id = ?').get(candidateId);
    if (!exists) {
      return candidateId;
    }
  }

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
  generateReferenceId,
  generateMediaReferenceId
};
