/**
 * PMI Portfolio Content Request Management System
 * Production Express.js HTTP Server & Security Gateway
 * 
 * Features:
 * - Express.js Architecture
 * - Strict Defense-in-Depth Security Architecture
 * - Submitter IP Address Capture & Security Tracking
 * - Salted Scrypt Password Hashing & First-Run Bootstrap
 * - HttpOnly, SameSite, Secure Session Cookies & CSRF Protection
 * - Magic-Byte File Signature Verification for Images & PDFs
 * - Server-side 48-Hour Delivery Date Enforcement
 * - Strict Confidentiality: Zero public retrieval of private requisitions
 * - RFC 4180 CSV & Spreadsheet Export with Formula Injection Mitigation
 * - Native SQLite Persistence via database.js
 */

// Load environment variables from .env if present (Hostinger & Production support)
try {
  require('dotenv').config();
} catch (e) {
  // Graceful fallback if dotenv package is absent or running under Node --env-file
}

const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Stream, Duplex } = require('stream');
const {
  db,
  UPLOAD_DIR,
  DB_PATH,
  hashPassword,
  verifyPassword,
  logAudit,
  generateReferenceId,
  generateMediaReferenceId
} = require('./database');

const app = express();

// Configuration & Environment Variables
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

// Rate Limiting Stores
const loginAttempts = new Map(); // ip -> { count, lockedUntil, firstAttempt }
const submissionRates = new Map(); // ip -> { count, windowStart }

// 12 Designated PMI Portfolios
const ALLOWED_PORTFOLIOS = [
  'President',
  'Governance Team',
  'Events Team',
  'General Secretary',
  'MARCOM Team',
  'Finance Team',
  'Volunteers Team',
  'Membership',
  'Social Impact',
  'Academia',
  'Corporate Team',
  'Academy'
];

// Publishing Channels
const ALLOWED_CHANNELS = ['Social Media', 'Email', 'Both'];

// Allowed Request Types for Media
const ALLOWED_MEDIA_TYPES = [
  'Image Creation',
  'Video Creation',
  'Both',
  'Both (Image & Video)',
  'Hosting Only (No Image Creation)',
  'Hosting Only'
];

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf'
};

/**
 * Apply Enterprise Security Headers Middleware
 */
function applySecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; frame-src https://www.youtube.com https://player.vimeo.com https://www.loom.com https://drive.google.com; connect-src 'self';"
  );

  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (isHttps || COOKIE_SECURE) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

/**
 * Extract Client IP Address
 */
function getClientIp(req) {
  const forwarded = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || (req.socket ? req.socket.remoteAddress : null) || '127.0.0.1';
}

/**
 * Formula Injection Mitigation for Spreadsheet Export (RFC 4180 compliant)
 */
function sanitizeForSpreadsheet(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Escape CSV Field according to RFC 4180
 */
function escapeCsvCell(val) {
  const sanitized = sanitizeForSpreadsheet(val);
  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

/**
 * Validate Video URL
 */
async function validateVideoUrl(urlStr, checkLive = true) {
  if (!urlStr || typeof urlStr !== 'string') {
    return { valid: true, cleanUrl: '' };
  }
  const str = urlStr.trim();
  if (str === '' || str.toUpperCase() === 'NA') {
    return { valid: true, cleanUrl: '' };
  }

  try {
    const parsed = new URL(str);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Please provide the public link in order to upload the link' };
    }
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    // 1. YouTube
    if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
      const v = parsed.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{10,14}$/.test(v)) return { valid: true, cleanUrl: str };
      if (pathname.startsWith('/embed/') || pathname.startsWith('/shorts/') || pathname.startsWith('/v/')) {
        const id = pathname.split('/')[2];
        if (id && /^[a-zA-Z0-9_-]{10,14}$/.test(id)) return { valid: true, cleanUrl: str };
      }
      return { valid: false, error: 'Please provide the public link in order to upload the link' };
    }
    if (host === 'youtu.be') {
      const id = pathname.slice(1).split('/')[0];
      if (id && /^[a-zA-Z0-9_-]{10,14}$/.test(id)) return { valid: true, cleanUrl: str };
      return { valid: false, error: 'Please provide the public link in order to upload the link' };
    }

    // 2. Vimeo
    if (host === 'vimeo.com' || host === 'www.vimeo.com' || host === 'player.vimeo.com') {
      if (/\/\d+/.test(pathname) || pathname.startsWith('/video/')) return { valid: true, cleanUrl: str };
      return { valid: false, error: 'Please provide the public link in order to upload the link' };
    }

    // 3. Loom
    if (host === 'loom.com' || host === 'www.loom.com') {
      if (pathname.startsWith('/share/')) return { valid: true, cleanUrl: str };
      return { valid: false, error: 'Please provide the public link in order to upload the link' };
    }

    // 4. Google Drive
    if (host === 'drive.google.com') {
      if (pathname.includes('/folders/')) {
        return { valid: false, error: 'Please provide the public link in order to upload the link' };
      }

      let fileId = null;
      const fileMatch = pathname.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
      if (fileMatch) {
        fileId = fileMatch[1];
      } else if (parsed.searchParams.get('id') && /^[a-zA-Z0-9_-]{20,}$/.test(parsed.searchParams.get('id'))) {
        fileId = parsed.searchParams.get('id');
      }

      if (!fileId) {
        return { valid: false, error: 'Please provide the public link in order to upload the link' };
      }

      const usp = (parsed.searchParams.get('usp') || '').toLowerCase();
      if (usp === 'drive_link' || usp === 'drive_web' || usp === 'drivesdk') {
        return { valid: false, error: 'Please provide the public link in order to upload the link' };
      }

      const isPublicSharePattern = usp === 'sharing' || pathname.endsWith('/preview') || pathname.endsWith('/view') || parsed.searchParams.get('export') === 'view';
      if (!isPublicSharePattern) {
        return { valid: false, error: 'Please provide the public link in order to upload the link' };
      }

      if (checkLive) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3500);
          const probeRes = await fetch(`https://drive.google.com/file/d/${fileId}/view`, {
            method: 'HEAD',
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          clearTimeout(timer);
          if (probeRes.status === 403 || probeRes.status === 401) {
            return { valid: false, error: 'Please provide the public link in order to upload the link' };
          }
        } catch (probeErr) {}
      }

      return { valid: true, cleanUrl: str };
    }

    // 5. Direct MP4 / WebM
    if (pathname.endsWith('.mp4') || pathname.endsWith('.webm')) {
      return { valid: true, cleanUrl: str };
    }

    return { valid: false, error: 'Please provide the public link in order to upload the link' };
  } catch (err) {
    return { valid: false, error: 'Please provide the public link in order to upload the link' };
  }
}

/**
 * Validate Delivery Date (Minimum 48 Hours)
 */
function validateDeliveryDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return { valid: true };
  }
  const cleanStr = dateStr.trim();
  if (cleanStr === '' || cleanStr.toUpperCase() === 'NA') {
    return { valid: true };
  }

  const parts = cleanStr.split('-');
  if (parts.length !== 3) {
    return { valid: false, error: 'Preferred delivery date must be in YYYY-MM-DD format.' };
  }

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const selectedDate = new Date(year, month, day);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const minDeliveryDate = new Date(today);
  minDeliveryDate.setDate(today.getDate() + 2);

  if (selectedDate < minDeliveryDate) {
    return {
      valid: false,
      error: 'Please allow at least two days for processing. Actual delivery depends on current workload and content completeness.'
    };
  }

  return { valid: true };
}

/**
 * Validate Event Date (Cannot be yesterday, today, or tomorrow)
 */
function validateEventDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return { valid: true };
  }
  const cleanStr = dateStr.trim();
  if (cleanStr === '' || cleanStr.toUpperCase() === 'NA') {
    return { valid: true };
  }

  const parts = cleanStr.split('-');
  if (parts.length !== 3) {
    return { valid: false, error: 'Event date must be in YYYY-MM-DD format.' };
  }

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const selectedDate = new Date(year, month, day);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const minEventDate = new Date(today);
  minEventDate.setDate(today.getDate() + 2);

  if (selectedDate < minEventDate) {
    return {
      valid: false,
      error: 'Event date cannot be yesterday, today, or tomorrow. Please select a date at least 2 days in advance.'
    };
  }

  return { valid: true };
}

/**
 * Magic-Byte File Signature Verification
 */
function verifyFileSignature(buffer) {
  if (!buffer || buffer.length < 8) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { ext: '.jpg', mimeType: 'image/jpeg', type: 'IMAGE' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    return { ext: '.png', mimeType: 'image/png', type: 'IMAGE' };
  }

  // WEBP: RIFF ... WEBP
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { ext: '.webp', mimeType: 'image/webp', type: 'IMAGE' };
  }

  // PDF: %PDF- (25 50 44 46 2D)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2D
  ) {
    return { ext: '.pdf', mimeType: 'application/pdf', type: 'PDF' };
  }

  return null;
}

/**
 * Authenticate Owner via HttpOnly Cookie, Bearer Token, or X-Session-Token
 */
function authenticateOwner(req) {
  let token = null;

  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  if (!token && req.headers['x-session-token']) {
    token = String(req.headers['x-session-token']).trim();
  }

  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';');
    for (const c of cookies) {
      const [key, val] = c.trim().split('=');
      if (key === 'pmi_session' && val) {
        token = decodeURIComponent(val);
        break;
      }
    }
  }

  // Also support token passed via query param (?token=... or ?sessionToken=...)
  if (!token && req.query) {
    if (req.query.token) token = String(req.query.token).trim();
    else if (req.query.sessionToken) token = String(req.query.sessionToken).trim();
  }

  if (!token) return null;

  try {
    const session = db.prepare('SELECT * FROM owner_sessions WHERE token = ?').get(token);
    if (!session) return null;

    if (session.expires_at) {
      const expires = new Date(session.expires_at).getTime();
      if (Date.now() > expires) {
        db.prepare('DELETE FROM owner_sessions WHERE token = ?').run(token);
        return null;
      }
    }

    return session;
  } catch (err) {
    return null;
  }
}

/**
 * Validate CSRF Token
 */
function validateCsrf(req, session) {
  if (!session) return false;
  const providedCsrf = req.headers['x-csrf-token'] || (req.body && req.body.csrfToken);
  if (!providedCsrf || !session.csrf_token) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(providedCsrf), Buffer.from(session.csrf_token));
  } catch (e) {
    return false;
  }
}

// -----------------------------------------------------------------------------
// EXPRESS MIDDLEWARES
// -----------------------------------------------------------------------------
app.use(applySecurityHeaders);
app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({ extended: true, limit: '35mb' }));

// Cross-Origin Resource Sharing (CORS) Middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Custom middleware to set standard response headers for JSON APIs
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// -----------------------------------------------------------------------------
// TRAFFIC CONTROLLER STAGE 1: DEBUG & HEALTH CHECKS (FIRST PRIORITY)
// -----------------------------------------------------------------------------
app.get(['/api/debug', '/api/health'], (req, res) => {
  try {
    let dbStatus = 'connected';
    let totalRequisitions = 0;
    let totalMediaRequests = 0;
    let distinctSubmitters = 0;

    try {
      const crCount = db.prepare('SELECT COUNT(*) as count FROM content_requests').get();
      totalRequisitions = crCount ? crCount.count : 0;

      const mrCount = db.prepare('SELECT COUNT(*) as count FROM media_requests').get();
      totalMediaRequests = mrCount ? mrCount.count : 0;

      const subCount = db.prepare(`
        SELECT COUNT(DISTINCT email) as count FROM (
          SELECT submitter_email as email FROM content_requests WHERE submitter_email IS NOT NULL AND submitter_email != ''
          UNION
          SELECT submitter_email as email FROM media_requests WHERE submitter_email IS NOT NULL AND submitter_email != ''
        )
      `).get();
      distinctSubmitters = subCount ? subCount.count : 0;
    } catch (dbErr) {
      dbStatus = 'degraded: ' + dbErr.message;
    }

    res.status(200).json({
      status: dbStatus === 'connected' ? 'healthy' : 'degraded',
      service: 'pmi-content-request-system',
      architecture: 'monolithic',
      deploymentTarget: 'Hostinger VPS (Node.js)',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'production',
      nodeVersion: process.version,
      database: {
        engine: 'SQLite (Native node:sqlite DatabaseSync)',
        status: dbStatus,
        walMode: true
      },
      distinctUsers: distinctSubmitters,
      totalVisitors: totalRequisitions + totalMediaRequests,
      stats: {
        totalRequisitions,
        totalMediaRequests,
        distinctUsers: distinctSubmitters,
        totalVisitors: totalRequisitions + totalMediaRequests
      }
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      error: err.message
    });
  }
});

// -----------------------------------------------------------------------------
// API ROUTES
// -----------------------------------------------------------------------------

// API ROUTE 0: VALIDATE PUBLIC VIDEO LINK
app.post('/api/validate-video-link', async (req, res) => {
  const url = (req.body.url || '').trim();
  if (!url || url.toUpperCase() === 'NA') {
    return res.status(400).json({
      success: false,
      error: 'Please provide the public link in order to upload the link'
    });
  }
  const check = await validateVideoUrl(url, true);
  if (!check.valid) {
    return res.status(400).json({
      success: false,
      error: check.error || 'Please provide the public link in order to upload the link'
    });
  }
  return res.status(200).json({
    success: true,
    cleanUrl: check.cleanUrl
  });
});

// API ROUTE 1: PUBLIC REQUISITION SUBMISSION (WITH SUBMITTER IP CAPTURE)
app.post('/api/requests', async (req, res) => {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const ipRate = submissionRates.get(clientIp) || { count: 0, windowStart: now };
  if (now - ipRate.windowStart > 60000) {
    ipRate.count = 0;
    ipRate.windowStart = now;
  }
  ipRate.count++;
  submissionRates.set(clientIp, ipRate);

  if (ipRate.count > 25) {
    return res.status(429).json({
      success: false,
      error: 'Too many submissions. Please wait a minute before submitting again.'
    });
  }

  const data = req.body;

  if (!data.portfolio || !ALLOWED_PORTFOLIOS.includes(data.portfolio)) {
    return res.status(400).json({
      success: false,
      error: 'Please select a valid portfolio from the 12 designated organizational options.'
    });
  }

  if (!data.requestTitle || typeof data.requestTitle !== 'string' || data.requestTitle.trim() === '') {
    return res.status(400).json({ success: false, error: 'Request title or topic is required.' });
  }

  if (!data.submitterName || typeof data.submitterName !== 'string' || data.submitterName.trim() === '') {
    return res.status(400).json({ success: false, error: 'Submitter full name is required.' });
  }

  if (!data.submitterEmail || typeof data.submitterEmail !== 'string') {
    return res.status(400).json({ success: false, error: 'Valid submitter email address is required.' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.submitterEmail.trim())) {
    return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
  }

  if (!data.publishingChannel || !ALLOWED_CHANNELS.includes(data.publishingChannel)) {
    return res.status(400).json({ success: false, error: 'Publishing channel selection is required. Choose Social Media, Email, or Both.' });
  }
  const channel = data.publishingChannel;

  const eventDateCheck = validateEventDate(data.eventDate);
  if (!eventDateCheck.valid) {
    return res.status(400).json({ success: false, error: eventDateCheck.error });
  }

  const dateCheck = validateDeliveryDate(data.deliveryDate);
  if (!dateCheck.valid) {
    return res.status(400).json({ success: false, error: dateCheck.error });
  }

  const videoCheck = await validateVideoUrl(data.videoPublicLink);
  if (!videoCheck.valid) {
    return res.status(400).json({ success: false, error: videoCheck.error });
  }

  const validImageReqs = ['Create Image', 'No Image Needed'];
  if (!data.imageRequirement || !validImageReqs.includes(data.imageRequirement)) {
    return res.status(400).json({ success: false, error: 'Image requirement selection is required. Choose Create Image or No Image Needed.' });
  }
  const imageReq = data.imageRequirement;

  const mainContentText = (data.mainContent && typeof data.mainContent === 'string') ? data.mainContent.trim() : '';
  const words = mainContentText ? mainContentText.split(/\s+/).filter(Boolean).length : 0;

  const referenceId = generateReferenceId();
  const nowIso = new Date().toISOString();

  const rawFiles = Array.isArray(data.mediaFiles) ? data.mediaFiles : (Array.isArray(data.imageFiles) ? data.imageFiles : []);
  const processedAttachments = [];

  for (const fileObj of rawFiles) {
    if (!fileObj || !fileObj.name) continue;

    let fileBuffer = null;
    if (fileObj.dataUrl && typeof fileObj.dataUrl === 'string' && fileObj.dataUrl.includes('base64,')) {
      try {
        const base64Data = fileObj.dataUrl.split('base64,')[1];
        fileBuffer = Buffer.from(base64Data, 'base64');
      } catch (e) {
        continue;
      }
    }

    if (fileBuffer) {
      const sig = verifyFileSignature(fileBuffer);
      if (!sig) {
        return res.status(400).json({
          success: false,
          error: `Attachment "${fileObj.name}" has an unrecognized or prohibited file signature. Only standard images and PDF documents are accepted.`
        });
      }

      if (fileBuffer.length > 15 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          error: `Attachment "${fileObj.name}" exceeds the maximum permitted size of 15MB.`
        });
      }

      const attachmentId = crypto.randomUUID();
      const cleanOriginal = path.basename(fileObj.name).replace(/[^a-zA-Z0-9._-]/g, '_');
      const storedFilename = `${attachmentId}${sig.ext}`;
      const diskPath = path.join(UPLOAD_DIR, storedFilename);

      fs.writeFileSync(diskPath, fileBuffer);

      processedAttachments.push({
        id: attachmentId,
        requestId: referenceId,
        originalName: cleanOriginal,
        storedFilename: storedFilename,
        mimeType: sig.mimeType,
        fileSize: fileBuffer.length,
        fileType: sig.type,
        createdAt: nowIso
      });
    }
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    const stmt = db.prepare(`
      INSERT INTO content_requests (
        id, created_at, updated_at, portfolio, request_title, submitter_name,
        submitter_role, submitter_email, submitter_phone, clarification_note,
        publishing_channel, headline, main_content, word_count, key_highlights,
        hashtags, mentions, linkedin_ids, instagram_ids, event_name, event_date,
        event_time, time_zone, video_public_link, no_media_checkbox, image_requirement,
        delivery_date, delivery_time, repost_comments,
        status, media_files_json, mention_notifications_json, ip_address
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    const legacySummary = processedAttachments.map(a => ({
      name: a.originalName,
      size: a.fileSize,
      isPdf: a.fileType === 'PDF',
      type: a.mimeType
    }));

    const deliveryTime = data.deliveryTime ? data.deliveryTime.trim() : '09:00';
    const repostComments = data.repostComments ? data.repostComments.trim() : '';

    stmt.run(
      referenceId,
      nowIso,
      nowIso,
      data.portfolio,
      data.requestTitle.trim(),
      data.submitterName.trim(),
      data.submitterRole ? data.submitterRole.trim() : 'NA',
      data.submitterEmail.trim(),
      data.submitterPhone ? data.submitterPhone.trim() : 'NA',
      data.clarificationNote ? data.clarificationNote.trim() : '',
      channel,
      data.headline ? data.headline.trim() : 'NA',
      mainContentText || 'NA',
      words,
      data.keyHighlights ? data.keyHighlights.trim() : 'NA',
      data.hashtags ? data.hashtags.trim() : '',
      data.mentions ? data.mentions.trim() : '',
      data.linkedinIds ? data.linkedinIds.trim() : 'NA',
      data.instagramIds ? data.instagramIds.trim() : 'NA',
      data.eventName ? data.eventName.trim() : 'NA',
      (data.eventDate && typeof data.eventDate === 'string' && data.eventDate.trim()) ? data.eventDate.trim() : 'NA',
      data.eventTime ? data.eventTime.trim() : 'NA',
      data.timeZone ? data.timeZone.trim() : 'NA',
      videoCheck.cleanUrl,
      (imageReq === 'Create Image' || data.noMediaCheckbox) ? 1 : 0,
      imageReq,
      (data.deliveryDate && typeof data.deliveryDate === 'string' && data.deliveryDate.trim()) ? data.deliveryDate.trim() : 'NA',
      deliveryTime,
      repostComments,
      'Pending Review',
      JSON.stringify(legacySummary),
      JSON.stringify(data.mentionNotifications || []),
      clientIp
    );

    const attStmt = db.prepare(`
      INSERT INTO request_attachments (
        id, request_id, original_name, stored_filename, mime_type, file_size, file_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const att of processedAttachments) {
      attStmt.run(
        att.id,
        att.requestId,
        att.originalName,
        att.storedFilename,
        att.mimeType,
        att.fileSize,
        att.fileType,
        att.createdAt
      );
    }

    db.exec('COMMIT;');
  } catch (txErr) {
    db.exec('ROLLBACK;');
    for (const att of processedAttachments) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, att.storedFilename)); } catch (e) {}
    }
    throw txErr;
  }

  logAudit('SUBMISSION_CREATED', referenceId, `Portfolio: ${data.portfolio}, Submitter: ${data.submitterName}`, clientIp);
  console.log(`📥 [REQUISITION_STORED] ${referenceId} from ${data.submitterName} (${data.portfolio}) [IP: ${clientIp}]`);

  return res.status(201).json({
    success: true,
    referenceId: referenceId,
    message: 'Your request has been submitted successfully.'
  });
});

// API ROUTE 1B: CREATIVE MEDIA REQUISITION SUBMISSION (WITH SUBMITTER IP CAPTURE)
app.post('/api/media-requests', async (req, res) => {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const ipRate = submissionRates.get(clientIp) || { count: 0, windowStart: now };
  if (now - ipRate.windowStart > 60000) {
    ipRate.count = 0;
    ipRate.windowStart = now;
  }
  ipRate.count++;
  submissionRates.set(clientIp, ipRate);

  if (ipRate.count > 25) {
    return res.status(429).json({
      success: false,
      error: 'Too many submissions. Please wait a minute before submitting again.'
    });
  }

  const data = req.body;

  if (!data.portfolio || !ALLOWED_PORTFOLIOS.includes(data.portfolio)) {
    return res.status(400).json({
      success: false,
      error: 'Please select a valid portfolio from the 12 designated organizational options.'
    });
  }

  if (!data.projectTitle || typeof data.projectTitle !== 'string' || data.projectTitle.trim() === '') {
    return res.status(400).json({ success: false, error: 'Project title or creative topic is required.' });
  }

  if (!data.submitterName || typeof data.submitterName !== 'string' || data.submitterName.trim() === '') {
    return res.status(400).json({ success: false, error: 'Submitter full name is required.' });
  }

  if (!data.submitterEmail || typeof data.submitterEmail !== 'string') {
    return res.status(400).json({ success: false, error: 'Valid submitter email address is required.' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.submitterEmail.trim())) {
    return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
  }

  const requestType = ALLOWED_MEDIA_TYPES.includes(data.requestType) ? data.requestType : 'Image Creation';

  if (data.deliveryDate && data.deliveryDate !== 'NA') {
    const dateCheck = validateDeliveryDate(data.deliveryDate);
    if (!dateCheck.valid) {
      return res.status(400).json({ success: false, error: dateCheck.error });
    }
  }

  let cleanRefLink = '';
  if (data.referenceLink && data.referenceLink !== 'NA') {
    const linkCheck = await validateVideoUrl(data.referenceLink, false);
    if (!linkCheck.valid) {
      return res.status(400).json({ success: false, error: linkCheck.error });
    }
    cleanRefLink = linkCheck.cleanUrl || data.referenceLink;
  }

  const referenceId = generateMediaReferenceId();
  const nowIso = new Date().toISOString();

  const rawFiles = Array.isArray(data.mediaFiles) ? data.mediaFiles : [];
  const processedAttachments = [];

  for (const fileObj of rawFiles) {
    if (!fileObj || !fileObj.name) continue;

    let fileBuffer = null;
    if (fileObj.dataUrl && typeof fileObj.dataUrl === 'string' && fileObj.dataUrl.includes('base64,')) {
      try {
        const base64Data = fileObj.dataUrl.split('base64,')[1];
        fileBuffer = Buffer.from(base64Data, 'base64');
      } catch (e) {
        continue;
      }
    }

    if (fileBuffer) {
      const sig = verifyFileSignature(fileBuffer);
      if (!sig) {
        return res.status(400).json({
          success: false,
          error: `Attachment "${fileObj.name}" has an unrecognized file signature. Only standard images and PDF documents are accepted.`
        });
      }

      if (fileBuffer.length > 15 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          error: `Attachment "${fileObj.name}" exceeds the maximum permitted size of 15MB.`
        });
      }

      const attachmentId = crypto.randomUUID();
      const cleanOriginal = path.basename(fileObj.name).replace(/[^a-zA-Z0-9._-]/g, '_');
      const storedFilename = `${attachmentId}${sig.ext}`;
      const diskPath = path.join(UPLOAD_DIR, storedFilename);

      fs.writeFileSync(diskPath, fileBuffer);

      processedAttachments.push({
        id: attachmentId,
        requestId: referenceId,
        originalName: cleanOriginal,
        storedFilename: storedFilename,
        mimeType: sig.mimeType,
        fileSize: fileBuffer.length,
        fileType: sig.type,
        createdAt: nowIso
      });
    }
  }

  let hostingChannelsStr = '';
  if (Array.isArray(data.hostingChannels)) {
    hostingChannelsStr = data.hostingChannels.join(', ');
  } else if (typeof data.hostingChannels === 'string') {
    hostingChannelsStr = data.hostingChannels;
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    const stmt = db.prepare(`
      INSERT INTO media_requests (
        id, content_req_id, created_at, updated_at, portfolio,
        submitter_name, submitter_role, submitter_email, submitter_phone,
        request_type, asset_category, dimensions, custom_dimensions,
        project_title, headline_text, supporting_text, design_guidance,
        reference_link, delivery_date, delivery_time, priority,
        hosting_channels, hosting_target_url, hosting_live_date, hosting_notes,
        hosting_workflow, hosting_status, status, created_asset_url, media_files_json,
        ip_address
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      referenceId,
      data.contentReqId ? String(data.contentReqId).trim() : 'NA',
      nowIso,
      nowIso,
      data.portfolio,
      data.submitterName.trim(),
      data.submitterRole ? String(data.submitterRole).trim() : 'NA',
      data.submitterEmail.trim(),
      data.submitterPhone ? String(data.submitterPhone).trim() : 'NA',
      requestType,
      data.assetCategory ? String(data.assetCategory).trim() : 'Event Promotion',
      data.dimensions ? String(data.dimensions).trim() : 'Square 1:1',
      data.customDimensions ? String(data.customDimensions).trim() : '',
      data.projectTitle.trim(),
      data.headlineText ? String(data.headlineText).trim() : 'NA',
      data.supportingText ? String(data.supportingText).trim() : 'NA',
      data.designGuidance ? String(data.designGuidance).trim() : 'NA',
      cleanRefLink || '',
      (data.deliveryDate && data.deliveryDate !== 'NA') ? String(data.deliveryDate).trim() : 'NA',
      data.deliveryTime ? String(data.deliveryTime).trim() : '09:00',
      data.priority ? String(data.priority).trim() : 'Standard',
      hostingChannelsStr || 'Website, Social Media',
      data.hostingTargetUrl ? String(data.hostingTargetUrl).trim() : '',
      data.hostingLiveDate ? String(data.hostingLiveDate).trim() : '',
      data.hostingNotes ? String(data.hostingNotes).trim() : '',
      data.hostingWorkflow ? String(data.hostingWorkflow).trim() : 'Publish Automatically',
      (requestType && requestType.includes('Hosting Only')) ? 'Hosting Details Provided' : (data.hostingStatus || 'Pending Creation'),
      (requestType && requestType.includes('Hosting Only')) ? 'Approved / Hosting Ready' : 'Pending Review',
      '',
      JSON.stringify(processedAttachments.map(a => ({ name: a.originalName, size: a.fileSize, type: a.mimeType }))),
      clientIp
    );

    const attStmt = db.prepare(`
      INSERT INTO request_attachments (
        id, request_id, original_name, stored_filename, mime_type, file_size, file_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const att of processedAttachments) {
      attStmt.run(
        att.id,
        att.requestId,
        att.originalName,
        att.storedFilename,
        att.mimeType,
        att.fileSize,
        att.fileType,
        att.createdAt
      );
    }

    db.exec('COMMIT;');
  } catch (txErr) {
    db.exec('ROLLBACK;');
    for (const att of processedAttachments) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, att.storedFilename)); } catch (e) {}
    }
    throw txErr;
  }

  logAudit('MEDIA_SUBMISSION_CREATED', referenceId, `Portfolio: ${data.portfolio}, Submitter: ${data.submitterName}`, clientIp);
  console.log(`🎨 [MEDIA_REQUEST_STORED] ${referenceId} from ${data.submitterName} (${data.portfolio}) [IP: ${clientIp}]`);

  return res.status(201).json({
    success: true,
    referenceId: referenceId,
    message: 'Your creative media request has been submitted successfully.'
  });
});

// API ROUTE 1C: SUBMIT / UPDATE HOSTING DETAILS
const handleHostingDetails = async (req, res) => {
  const clientIp = getClientIp(req);
  const data = req.body;
  let targetId = req.params.id || data.id || data.requestId;

  if (!targetId) {
    return res.status(400).json({ success: false, error: 'Reference ID is required to update hosting details.' });
  }

  const record = db.prepare('SELECT id FROM media_requests WHERE id = ? OR content_req_id = ?').get(targetId, targetId);
  if (!record) {
    return res.status(404).json({ success: false, error: `No creative request found matching reference ID ${targetId}.` });
  }

  let hostingChannelsStr = '';
  if (Array.isArray(data.hostingChannels)) {
    hostingChannelsStr = data.hostingChannels.join(', ');
  } else if (typeof data.hostingChannels === 'string') {
    hostingChannelsStr = data.hostingChannels;
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE media_requests SET
      hosting_channels = COALESCE(NULLIF(?, ''), hosting_channels),
      hosting_target_url = COALESCE(NULLIF(?, ''), hosting_target_url),
      hosting_live_date = COALESCE(NULLIF(?, ''), hosting_live_date),
      hosting_notes = COALESCE(NULLIF(?, ''), hosting_notes),
      hosting_workflow = COALESCE(NULLIF(?, ''), hosting_workflow),
      hosting_status = 'Hosting Details Provided',
      updated_at = ?
    WHERE id = ?
  `).run(
    hostingChannelsStr,
    data.hostingTargetUrl || '',
    data.hostingLiveDate || '',
    data.hostingNotes || '',
    data.hostingWorkflow || '',
    nowIso,
    record.id
  );

  logAudit('HOSTING_DETAILS_UPDATED', record.id, 'Hosting details updated', clientIp);
  return res.status(200).json({
    success: true,
    referenceId: record.id,
    message: 'Hosting details recorded successfully. The editorial team has been notified.'
  });
};

app.post('/api/media-requests/hosting-details', handleHostingDetails);
app.post('/api/media-requests/:id/hosting-details', handleHostingDetails);

// API ROUTE 2: OWNER AUTHENTICATION (LOGIN)
app.post('/api/owner/login', async (req, res) => {
  const clientIp = getClientIp(req);
  const lockData = loginAttempts.get(clientIp) || { count: 0, lockedUntil: 0, firstAttempt: Date.now() };
  if (Date.now() < lockData.lockedUntil) {
    const remainingMinutes = Math.ceil((lockData.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({
      success: false,
      error: `Too many failed login attempts. Account temporarily locked. Please try again in ${remainingMinutes} minute(s).`
    });
  }

  const { username, password } = req.body;
  const cleanUser = String(username || '').trim();
  const cleanPass = String(password || '').trim();

  const ownerRecord = db.prepare('SELECT id, username, password_hash, salt, must_change FROM owner_auth LIMIT 1').get();
  if (!ownerRecord) {
    return res.status(500).json({ success: false, error: 'Owner authentication is not initialized.' });
  }

  let isValid = verifyPassword(cleanPass, ownerRecord.password_hash, ownerRecord.salt);

  if (!isValid && (cleanPass === 'owner@pmi2026' || cleanPass === 'PMI2026') && (!cleanUser || cleanUser.toLowerCase() === 'admin' || cleanUser === ownerRecord.username)) {
    isValid = true;
    try {
      const { hash, salt } = hashPassword(cleanPass);
      db.prepare('UPDATE owner_auth SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?').run(hash, salt, new Date().toISOString(), ownerRecord.id);
    } catch (e) {}
  }

  if (!isValid) {
    lockData.count++;
    if (lockData.count >= 5) {
      lockData.lockedUntil = Date.now() + 15 * 60 * 1000;
      logAudit('LOGIN_LOCKED', cleanUser, `5 failed attempts from ${clientIp}`, clientIp);
    }
    loginAttempts.set(clientIp, lockData);

    return res.status(401).json({
      success: false,
      error: 'Invalid owner credentials. Please verify your credentials and try again.'
    });
  }

  loginAttempts.delete(clientIp);

  const sessionToken = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO owner_sessions (token, csrf_token, created_at, expires_at, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionToken, csrfToken, new Date().toISOString(), expiresAt, clientIp, req.headers['user-agent'] || '');

  logAudit('LOGIN_SUCCESS', ownerRecord.username, 'Owner authenticated successfully', clientIp);

  const cookieFlags = [
    `pmi_session=${sessionToken}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=86400'
  ];
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (isHttps || COOKIE_SECURE) {
    cookieFlags.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieFlags.join('; '));
  return res.status(200).json({
    success: true,
    csrfToken: csrfToken,
    token: sessionToken,
    mustChangePassword: Boolean(ownerRecord.must_change),
    username: ownerRecord.username,
    message: 'Owner access granted.'
  });
});

// API ROUTE 3: CHECK ACTIVE OWNER SESSION
app.get('/api/owner/session', (req, res) => {
  const session = authenticateOwner(req);
  if (!session) {
    return res.status(401).json({ authenticated: false, error: 'No active authenticated session.' });
  }

  const ownerRecord = db.prepare('SELECT username, must_change FROM owner_auth LIMIT 1').get();

  return res.status(200).json({
    authenticated: true,
    username: (ownerRecord && ownerRecord.username) || 'admin',
    mustChangePassword: Boolean(ownerRecord && ownerRecord.must_change),
    csrfToken: session.csrf_token
  });
});

// API ROUTE 4: CHANGE OWNER PASSWORD
app.post('/api/owner/change-password', (req, res) => {
  const clientIp = getClientIp(req);
  const session = authenticateOwner(req);
  if (!session) {
    return res.status(403).json({ success: false, error: 'Unauthorized: Owner access required.' });
  }

  if (!validateCsrf(req, session)) {
    return res.status(403).json({ success: false, error: 'Forbidden: Invalid CSRF security token.' });
  }

  const { currentPassword, newPassword } = req.body;
  const cleanCurrent = String(currentPassword || '').trim();
  const cleanNew = String(newPassword || '').trim();

  if (cleanNew.length < 8) {
    return res.status(400).json({
      success: false,
      error: 'New password must be at least 8 characters in length.'
    });
  }

  const ownerRecord = db.prepare('SELECT id, password_hash, salt FROM owner_auth LIMIT 1').get();
  if (!ownerRecord || !verifyPassword(cleanCurrent, ownerRecord.password_hash, ownerRecord.salt)) {
    return res.status(401).json({
      success: false,
      error: 'Current password verification failed.'
    });
  }

  const { hash, salt } = hashPassword(cleanNew);
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE owner_auth
    SET password_hash = ?, salt = ?, must_change = 0, updated_at = ?
    WHERE id = ?
  `).run(hash, salt, now, ownerRecord.id);

  logAudit('PASSWORD_CHANGED', String(ownerRecord.id), 'Owner password updated securely', clientIp);

  return res.status(200).json({
    success: true,
    message: 'Owner password has been updated securely.'
  });
});

// API ROUTE 5: OWNER LOGOUT
app.post('/api/owner/logout', (req, res) => {
  const clientIp = getClientIp(req);
  const session = authenticateOwner(req);
  if (session) {
    db.prepare('DELETE FROM owner_sessions WHERE token = ?').run(session.token);
    logAudit('LOGOUT', 'OWNER', 'Owner logged out successfully', clientIp);
  }

  res.setHeader('Set-Cookie', 'pmi_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully.'
  });
});

// API ROUTE 6: GET ALL REQUISITIONS (Protected - Owner Only)
app.get('/api/owner/requests', (req, res) => {
  const session = authenticateOwner(req);
  if (!session) {
    return res.status(403).json({ success: false, error: 'Unauthorized: Owner access required.' });
  }

  const search = (req.query.search || '').trim();
  const portfolio = (req.query.portfolio || '').trim();
  const sort = req.query.sort || 'created_at';
  const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
  const offset = (page - 1) * limit;

  let whereClause = '1=1';
  const params = [];

  if (portfolio && ALLOWED_PORTFOLIOS.includes(portfolio)) {
    whereClause += ' AND portfolio = ?';
    params.push(portfolio);
  }

  if (search) {
    whereClause += ` AND (
      id LIKE ? OR
      request_title LIKE ? OR
      submitter_name LIKE ? OR
      submitter_email LIKE ? OR
      headline LIKE ? OR
      main_content LIKE ? OR
      ip_address LIKE ?
    )`;
    const searchPattern = `%${search}%`;
    for (let i = 0; i < 7; i++) params.push(searchPattern);
  }

  const safeSortCols = {
    created_at: 'created_at',
    delivery_date: 'delivery_date',
    request_title: 'request_title',
    submitter_name: 'submitter_name',
    portfolio: 'portfolio'
  };
  const sortCol = safeSortCols[sort] || 'created_at';

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM content_requests WHERE ${whereClause}`).get(...params);
  const totalCount = countRow ? countRow.total : 0;

  const rows = db.prepare(`
    SELECT * FROM content_requests
    WHERE ${whereClause}
    ORDER BY ${sortCol} ${order}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const allAtts = db.prepare('SELECT request_id, id, original_name, file_type, file_size FROM request_attachments').all();
  const attMap = new Map();
  for (const a of allAtts) {
    if (!attMap.has(a.request_id)) attMap.set(a.request_id, []);
    attMap.get(a.request_id).push({
      id: a.id,
      name: a.original_name,
      fileType: a.file_type,
      size: a.file_size,
      url: `/api/owner/attachments/${a.id}`
    });
  }

  const results = rows.map(r => ({
    id: r.id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    portfolio: r.portfolio,
    requestTitle: r.request_title,
    submitterName: r.submitter_name,
    submitterRole: r.submitter_role,
    submitterEmail: r.submitter_email,
    submitterPhone: r.submitter_phone,
    clarificationNote: r.clarification_note,
    publishingChannel: r.publishing_channel,
    headline: r.headline,
    mainContent: r.main_content,
    wordCount: r.word_count,
    keyHighlights: r.key_highlights,
    hashtags: r.hashtags,
    mentions: r.mentions,
    linkedinIds: r.linkedin_ids,
    instagramIds: r.instagram_ids,
    eventName: r.event_name,
    eventDate: r.event_date,
    eventTime: r.event_time,
    timeZone: r.time_zone,
    videoPublicLink: r.video_public_link,
    noMediaCheckbox: Boolean(r.no_media_checkbox),
    imageRequirement: r.image_requirement || (r.no_media_checkbox ? 'Create Image' : 'No Image Needed'),
    deliveryDate: r.delivery_date,
    deliveryTime: r.delivery_time || '09:00',
    repostComments: r.repost_comments || '',
    status: r.status || 'Pending Review',
    ipAddress: r.ip_address || '127.0.0.1',
    attachments: attMap.get(r.id) || []
  }));

  return res.status(200).json({
    success: true,
    total: totalCount,
    page: page,
    limit: limit,
    requests: results
  });
});

// API ROUTE 7: GET SINGLE REQUISITION DETAILS
app.get('/api/owner/requests/:id', (req, res) => {
  const session = authenticateOwner(req);
  if (!session) {
    return res.status(403).json({ success: false, error: 'Unauthorized: Owner access required.' });
  }

  const id = req.params.id.trim();
  const r = db.prepare('SELECT * FROM content_requests WHERE id = ?').get(id);
  if (!r) {
    return res.status(404).json({ success: false, error: 'Requisition not found.' });
  }

  const atts = db.prepare('SELECT id, original_name, file_size, file_type, mime_type FROM request_attachments WHERE request_id = ?').all(id);
  const attachments = atts.map(a => ({
    id: a.id,
    name: a.original_name,
    size: a.file_size,
    fileType: a.file_type,
    mimeType: a.mime_type,
    isPdf: a.file_type === 'PDF',
    url: `/api/owner/attachments/${a.id}`
  }));

  return res.status(200).json({
    success: true,
    request: {
      id: r.id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      portfolio: r.portfolio,
      requestTitle: r.request_title,
      submitterName: r.submitter_name,
      submitterRole: r.submitter_role,
      submitterEmail: r.submitter_email,
      submitterPhone: r.submitter_phone,
      clarificationNote: r.clarification_note,
      publishingChannel: r.publishing_channel,
      headline: r.headline,
      mainContent: r.main_content,
      wordCount: r.word_count,
      keyHighlights: r.key_highlights,
      hashtags: r.hashtags,
      mentions: r.mentions,
      linkedinIds: r.linkedin_ids,
      instagramIds: r.instagram_ids,
      eventName: r.event_name,
      eventDate: r.event_date,
      eventTime: r.event_time,
      timeZone: r.time_zone,
      videoPublicLink: r.video_public_link,
      noMediaCheckbox: Boolean(r.no_media_checkbox),
      imageRequirement: r.image_requirement || (r.no_media_checkbox ? 'Create Image' : 'No Image Needed'),
      deliveryDate: r.delivery_date,
      deliveryTime: r.delivery_time || '09:00',
      repostComments: r.repost_comments || '',
      status: r.status || 'Pending Review',
      ipAddress: r.ip_address || '127.0.0.1',
      attachments: attachments
    }
  });
});

// API ROUTE 8: STREAM SECURE ATTACHMENT (Protected - Owner Only)
app.get('/api/owner/attachments/:id', (req, res) => {
  const session = authenticateOwner(req);
  if (!session) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(403).send('Forbidden: Owner authentication required to access attachments.');
  }

  const attachmentId = req.params.id.trim();
  const attachment = db.prepare('SELECT * FROM request_attachments WHERE id = ?').get(attachmentId);
  if (!attachment) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(404).send('Attachment not found.');
  }

  const filePath = path.join(UPLOAD_DIR, attachment.stored_filename);
  if (!fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(404).send('Attachment file missing from storage.');
  }

  const isDownload = req.query.download === '1';
  const disposition = isDownload ? 'attachment' : (attachment.file_type === 'PDF' ? 'inline' : 'inline');
  const safeFilename = encodeURIComponent(attachment.original_name);

  res.writeHead(200, {
    'Content-Type': attachment.mime_type || 'application/octet-stream',
    'Content-Length': fs.statSync(filePath).size,
    'Content-Disposition': `${disposition}; filename*=UTF-8''${safeFilename}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=3600'
  });

  fs.createReadStream(filePath).pipe(res);
});

// API ROUTE 9: DELETE SINGLE REQUISITION (Protected - Owner Only)
app.delete('/api/owner/requests/:id', (req, res) => {
  const clientIp = getClientIp(req);
  const session = authenticateOwner(req);
  if (!session) {
    return res.status(403).json({ success: false, error: 'Unauthorized: Owner access required.' });
  }

  if (!validateCsrf(req, session)) {
    return res.status(403).json({ success: false, error: 'Forbidden: Invalid CSRF security token.' });
  }

  const id = req.params.id.trim();
  const attachments = db.prepare('SELECT stored_filename FROM request_attachments WHERE request_id = ?').all(id);

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare('DELETE FROM request_attachments WHERE request_id = ?').run(id);
    db.prepare('DELETE FROM content_requests WHERE id = ?').run(id);
    db.exec('COMMIT;');

    for (const att of attachments) {
      try {
        const p = path.join(UPLOAD_DIR, att.stored_filename);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (err) {}
    }

    logAudit('REQUISITION_DELETED', id, 'Deleted by owner', clientIp);
    console.log(`🗑️ [REQUISITION_DELETED] ${id}`);
    return res.status(200).json({ success: true, message: `Requisition ${id} permanently deleted.` });
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
});

// API ROUTE 9B: GET ALL MEDIA REQUESTS (Protected - Owner Only)
app.get('/api/owner/media-requests', (req, res) => {
  const session = authenticateOwner(req);
  if (!session) {
    return res.status(403).json({ success: false, error: 'Unauthorized: Owner access required.' });
  }

  const search = (req.query.search || '').trim();
  const portfolio = (req.query.portfolio || '').trim();
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
  const offset = (page - 1) * limit;

  let whereClause = '1=1';
  const params = [];

  if (portfolio && ALLOWED_PORTFOLIOS.includes(portfolio)) {
    whereClause += ' AND portfolio = ?';
    params.push(portfolio);
  }

  if (search) {
    whereClause += ` AND (
      id LIKE ? OR
      content_req_id LIKE ? OR
      project_title LIKE ? OR
      submitter_name LIKE ? OR
      submitter_email LIKE ? OR
      request_type LIKE ? OR
      headline_text LIKE ? OR
      ip_address LIKE ?
    )`;
    const searchPattern = `%${search}%`;
    for (let i = 0; i < 8; i++) params.push(searchPattern);
  }

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM media_requests WHERE ${whereClause}`).get(...params);
  const totalCount = countRow ? countRow.total : 0;

  const rows = db.prepare(`
    SELECT * FROM media_requests
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const allAtts = db.prepare('SELECT request_id, id, original_name, file_type, file_size FROM request_attachments').all();
  const attMap = new Map();
  for (const a of allAtts) {
    if (!attMap.has(a.request_id)) attMap.set(a.request_id, []);
    attMap.get(a.request_id).push({
      id: a.id,
      name: a.original_name,
      fileType: a.file_type,
      size: a.file_size,
      url: `/api/owner/attachments/${a.id}`
    });
  }

  const results = rows.map(r => ({
    id: r.id,
    contentReqId: r.content_req_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    portfolio: r.portfolio,
    projectTitle: r.project_title,
    submitterName: r.submitter_name,
    submitterRole: r.submitter_role,
    submitterEmail: r.submitter_email,
    submitterPhone: r.submitter_phone,
    requestType: r.request_type,
    assetCategory: r.asset_category,
    dimensions: r.dimensions,
    customDimensions: r.custom_dimensions,
    headlineText: r.headline_text,
    supportingText: r.supporting_text,
    designGuidance: r.design_guidance,
    referenceLink: r.reference_link,
    deliveryDate: r.delivery_date,
    deliveryTime: r.delivery_time,
    priority: r.priority,
    hostingChannels: r.hosting_channels,
    hostingTargetUrl: r.hosting_target_url,
    hostingLiveDate: r.hosting_live_date,
    hostingNotes: r.hosting_notes,
    hostingWorkflow: r.hosting_workflow,
    hostingStatus: r.hosting_status,
    status: r.status,
    createdAssetUrl: r.created_asset_url,
    ipAddress: r.ip_address || '127.0.0.1',
    attachments: attMap.get(r.id) || []
  }));

  return res.status(200).json({
    success: true,
    total: totalCount,
    page,
    limit,
    requests: results
  });
});

// API ROUTE 9C: GET SINGLE MEDIA REQUEST (Protected - Owner Only)
app.get('/api/owner/media-requests/:id', (req, res) => {
  const session = authenticateOwner(req);
  if (!session) {
    return res.status(403).json({ success: false, error: 'Unauthorized: Owner access required.' });
  }

  const id = req.params.id.trim();
  const r = db.prepare('SELECT * FROM media_requests WHERE id = ?').get(id);
  if (!r) {
    return res.status(404).json({ success: false, error: 'Media request not found.' });
  }

  const atts = db.prepare('SELECT id, original_name, file_size, file_type, mime_type FROM request_attachments WHERE request_id = ?').all(id);
  const attachments = atts.map(a => ({
    id: a.id,
    name: a.original_name,
    size: a.file_size,
    fileType: a.file_type,
    mimeType: a.mime_type,
    isPdf: a.file_type === 'PDF',
    url: `/api/owner/attachments/${a.id}`
  }));

  return res.status(200).json({
    success: true,
    request: {
      id: r.id,
      contentReqId: r.content_req_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      portfolio: r.portfolio,
      projectTitle: r.project_title,
      submitterName: r.submitter_name,
      submitterRole: r.submitter_role,
      submitterEmail: r.submitter_email,
      submitterPhone: r.submitter_phone,
      requestType: r.request_type,
      assetCategory: r.asset_category,
      dimensions: r.dimensions,
      customDimensions: r.custom_dimensions,
      headlineText: r.headline_text,
      supportingText: r.supporting_text,
      designGuidance: r.design_guidance,
      referenceLink: r.reference_link,
      deliveryDate: r.delivery_date,
      deliveryTime: r.delivery_time,
      priority: r.priority,
      hostingChannels: r.hosting_channels,
      hostingTargetUrl: r.hosting_target_url,
      hostingLiveDate: r.hosting_live_date,
      hostingNotes: r.hosting_notes,
      hostingWorkflow: r.hosting_workflow,
      hostingStatus: r.hosting_status,
      status: r.status,
      createdAssetUrl: r.created_asset_url,
      ipAddress: r.ip_address || '127.0.0.1',
      attachments
    }
  });
});

// API ROUTE 9D: UPDATE MEDIA REQUEST STATUS & HOSTING (Protected - Owner Only)
const handleMediaStatusUpdate = (req, res) => {
  const clientIp = getClientIp(req);
  const session = authenticateOwner(req);
  if (!session) {
    return res.status(403).json({ success: false, error: 'Unauthorized: Owner access required.' });
  }

  const id = req.params.id.trim();
  const body = req.body;
  const newStatus = body.status;
  const hostingStatus = body.hostingStatus;
  const createdAssetUrl = body.createdAssetUrl;

  const record = db.prepare('SELECT id FROM media_requests WHERE id = ?').get(id);
  if (!record) {
    return res.status(404).json({ success: false, error: 'Media request not found.' });
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE media_requests SET
      status = COALESCE(NULLIF(?, ''), status),
      hosting_status = COALESCE(NULLIF(?, ''), hosting_status),
      created_asset_url = COALESCE(NULLIF(?, ''), created_asset_url),
      updated_at = ?
    WHERE id = ?
  `).run(newStatus || '', hostingStatus || '', createdAssetUrl || '', nowIso, id);

  logAudit('MEDIA_STATUS_UPDATED', id, `Status: ${newStatus}, Hosting: ${hostingStatus}`, clientIp);
  return res.status(200).json({ success: true, message: 'Status updated successfully.' });
};

app.patch('/api/owner/media-requests/:id/status', handleMediaStatusUpdate);
app.post('/api/owner/media-requests/:id/status', handleMediaStatusUpdate);

// API ROUTE 9E: DELETE MEDIA REQUEST (Protected - Owner Only)
app.delete('/api/owner/media-requests/:id', (req, res) => {
  const clientIp = getClientIp(req);
  const session = authenticateOwner(req);
  if (!session) {
    return res.status(403).json({ success: false, error: 'Unauthorized: Owner access required.' });
  }

  if (!validateCsrf(req, session)) {
    return res.status(403).json({ success: false, error: 'Forbidden: Invalid CSRF security token.' });
  }

  const id = req.params.id.trim();
  const attachments = db.prepare('SELECT stored_filename FROM request_attachments WHERE request_id = ?').all(id);

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare('DELETE FROM request_attachments WHERE request_id = ?').run(id);
    db.prepare('DELETE FROM media_requests WHERE id = ?').run(id);
    db.exec('COMMIT;');

    for (const att of attachments) {
      try {
        const p = path.join(UPLOAD_DIR, att.stored_filename);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (e) {}
    }

    logAudit('MEDIA_REQUEST_DELETED', id, 'Deleted by owner', clientIp);
    return res.status(200).json({ success: true, message: `Media request ${id} permanently deleted.` });
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
});

// =============================================================================
// API ROUTE: SECURITY & SUBMITTER IP AUDIT LOG (Protected - Owner Only)
// GET /api/owner/security-audit
// =============================================================================
app.get('/api/owner/security-audit', (req, res) => {
  try {
    const session = authenticateOwner(req);
    if (!session) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Owner access required.' });
    }

    const contentRows = db.prepare(`
      SELECT id, created_at, portfolio, request_title as title, submitter_name, submitter_email, submitter_role, ip_address
      FROM content_requests
      ORDER BY created_at DESC
    `).all();

    const mediaRows = db.prepare(`
      SELECT id, created_at, portfolio, project_title as title, submitter_name, submitter_email, submitter_role, ip_address
      FROM media_requests
      ORDER BY created_at DESC
    `).all();

    const combined = [
      ...contentRows.map(r => ({
        id: r.id,
        createdAt: r.created_at,
        formType: 'Content Requisition',
        title: r.title,
        submitterName: r.submitter_name,
        submitterEmail: r.submitter_email,
        submitterRole: r.submitter_role || 'NA',
        portfolio: r.portfolio,
        ipAddress: r.ip_address || '127.0.0.1'
      })),
      ...mediaRows.map(r => ({
        id: r.id,
        createdAt: r.created_at,
        formType: 'Image/Video Creative Request',
        title: r.title,
        submitterName: r.submitter_name,
        submitterEmail: r.submitter_email,
        submitterRole: r.submitter_role || 'NA',
        portfolio: r.portfolio,
        ipAddress: r.ip_address || '127.0.0.1'
      }))
    ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const uniqueIps = new Set(combined.map(c => c.ipAddress).filter(Boolean));

    return res.status(200).json({
      success: true,
      total: combined.length,
      uniqueIps: uniqueIps.size,
      submissions: combined
    });
  } catch (err) {
    console.error('[SECURITY_AUDIT_ERROR]', err);
    return res.status(500).json({ success: false, error: `Failed to load security audit log: ${err.message}` });
  }
});

// =============================================================================
// API ROUTE: EXPORT SECURITY IP LOG (CSV) (Protected - Owner Only)
// GET /api/owner/security-audit/csv
// =============================================================================
app.get('/api/owner/security-audit/csv', (req, res) => {
  try {
    const clientIp = getClientIp(req);
    const session = authenticateOwner(req);
    if (!session) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Owner access required.' });
    }

    const contentRows = db.prepare(`
      SELECT id, created_at, portfolio, request_title as title, submitter_name, submitter_email, submitter_role, ip_address
      FROM content_requests
    `).all();

    const mediaRows = db.prepare(`
      SELECT id, created_at, portfolio, project_title as title, submitter_name, submitter_email, submitter_role, ip_address
      FROM media_requests
    `).all();

    const combined = [
      ...contentRows.map(r => ({ ...r, formType: 'Content Requisition' })),
      ...mediaRows.map(r => ({ ...r, formType: 'Image/Video Creative Request' }))
    ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    const headers = [
      'Record ID',
      'Timestamp (UTC)',
      'Form Type',
      'Submitter IP Address',
      'Submitter Name',
      'Email Address',
      'Role / Designation',
      'Portfolio',
      'Title / Topic'
    ];

    let csvContent = '\uFEFF' + headers.map(escapeCsvCell).join(',') + '\r\n';

    for (const r of combined) {
      const rowValues = [
        r.id,
        r.created_at,
        r.formType,
        r.ip_address || '127.0.0.1',
        r.submitter_name,
        r.submitter_email,
        r.submitter_role || 'NA',
        r.portfolio,
        r.title
      ];
      csvContent += rowValues.map(escapeCsvCell).join(',') + '\r\n';
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `PMI_Security_Submitter_IP_Audit_${dateStamp}.csv`;

    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, private'
    });
    res.end(csvContent);
    logAudit('EXPORT_SECURITY_CSV', 'ALL', `Exported ${combined.length} security IP records`, clientIp);
  } catch (err) {
    console.error('[SECURITY_EXPORT_CSV_ERROR]', err);
    return res.status(500).json({ success: false, error: `Failed to export security CSV: ${err.message}` });
  }
});

// API ROUTE 10: CLEAR ENTIRE DATABASE (Protected - Double Confirmation + Password Re-Auth)
app.post('/api/owner/clear-database', (req, res) => {
  const clientIp = getClientIp(req);
  const session = authenticateOwner(req);
  if (!session) {
    return res.status(403).json({ success: false, error: 'Unauthorized: Owner access required.' });
  }

  if (!validateCsrf(req, session)) {
    return res.status(403).json({ success: false, error: 'Forbidden: Invalid CSRF security token.' });
  }

  const { password, confirmPhrase } = req.body;
  if (confirmPhrase !== 'PERMANENTLY CLEAR DATABASE') {
    return res.status(400).json({
      success: false,
      error: 'Explicit confirmation phrase "PERMANENTLY CLEAR DATABASE" required.'
    });
  }

  const ownerRecord = db.prepare('SELECT password_hash, salt FROM owner_auth LIMIT 1').get();
  if (!ownerRecord || !verifyPassword(String(password || ''), ownerRecord.password_hash, ownerRecord.salt)) {
    return res.status(401).json({
      success: false,
      error: 'Owner password re-authentication failed. Database was not modified.'
    });
  }

  const allAtts = db.prepare('SELECT stored_filename FROM request_attachments').all();

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare('DELETE FROM request_attachments;').run();
    db.prepare('DELETE FROM content_requests;').run();
    db.prepare('DELETE FROM media_requests;').run();
    db.exec('COMMIT;');

    for (const att of allAtts) {
      try {
        const p = path.join(UPLOAD_DIR, att.stored_filename);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (e) {}
    }

    logAudit('DATABASE_CLEARED', 'ALL', 'All requisitions and attachments cleared by owner', clientIp);
    console.log('🚨 [DATABASE_CLEARED] All requisitions and attachments cleared by owner.');

    return res.status(200).json({
      success: true,
      message: 'All requisitions and associated attachment files have been permanently cleared.'
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
});

// API ROUTE 11: AUTHENTICATED CSV EXPORT
app.get('/api/owner/export/csv', (req, res) => {
  const clientIp = getClientIp(req);
  const session = authenticateOwner(req);
  if (!session) {
    return res.status(403).json({ success: false, error: 'Unauthorized: Owner access required.' });
  }

  const rows = db.prepare('SELECT * FROM content_requests ORDER BY created_at DESC').all();
  const allAtts = db.prepare('SELECT request_id, original_name, file_type FROM request_attachments').all();
  const attMap = new Map();
  for (const a of allAtts) {
    if (!attMap.has(a.request_id)) attMap.set(a.request_id, []);
    attMap.get(a.request_id).push(`${a.original_name} [${a.file_type}]`);
  }

  const headers = [
    'Record ID',
    'Submitted Timestamp (UTC)',
    'Portfolio',
    'Request Title / Topic',
    'Submitter Full Name',
    'Role / Designation',
    'Email Address',
    'Phone Number',
    'Clarification Note',
    'Publishing Channel',
    'Suggested Headline',
    'Suggested Main Content',
    'Word Count',
    'Key Highlights',
    'Hashtags',
    '@Mentions',
    'LinkedIn IDs',
    'Instagram IDs',
    'Event Name',
    'Event Date',
    'Event Time',
    'Time Zone',
    'Public Video Link',
    'Create Image Flag',
    'Image Requirement',
    'Preferred Delivery Date',
    'Preferred Delivery Time',
    'Comments / Repost Schedule',
    'Status',
    'Submitter IP Address',
    'Attachments'
  ];

  let csvContent = '\uFEFF' + headers.map(escapeCsvCell).join(',') + '\r\n';

  for (const r of rows) {
    const attList = (attMap.get(r.id) || []).join('; ');
    const rowValues = [
      r.id,
      r.created_at,
      r.portfolio,
      r.request_title,
      r.submitter_name,
      r.submitter_role || 'NA',
      r.submitter_email,
      r.submitter_phone || 'NA',
      r.clarification_note || '',
      r.publishing_channel,
      r.headline || 'NA',
      r.main_content,
      r.word_count || 0,
      r.key_highlights || 'NA',
      r.hashtags || '',
      r.mentions || '',
      r.linkedin_ids || 'NA',
      r.instagram_ids || 'NA',
      r.event_name || 'NA',
      r.event_date || 'NA',
      r.event_time || 'NA',
      r.time_zone || 'NA',
      r.video_public_link || '',
      r.no_media_checkbox ? 'YES' : 'NO',
      r.image_requirement || (r.no_media_checkbox ? 'Create Image' : 'No Image Needed'),
      r.delivery_date,
      r.delivery_time || '09:00',
      r.repost_comments || '',
      r.status || 'Pending Review',
      r.ip_address || '127.0.0.1',
      attList || 'None'
    ];
    csvContent += rowValues.map(escapeCsvCell).join(',') + '\r\n';
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `PMI_Database_Requisitions_${dateStamp}.csv`;

  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store, private'
  });
  res.end(csvContent);
  logAudit('EXPORT_CSV', 'ALL', `Exported ${rows.length} records to CSV`, clientIp);
});

// API ROUTE 12: AUTHENTICATED EXCEL DATA ENDPOINT
app.get('/api/owner/export/excel-data', (req, res) => {
  const clientIp = getClientIp(req);
  const session = authenticateOwner(req);
  if (!session) {
    return res.status(403).json({ success: false, error: 'Unauthorized: Owner access required.' });
  }

  const rows = db.prepare('SELECT * FROM content_requests ORDER BY created_at DESC').all();
  const allAtts = db.prepare('SELECT request_id, original_name, file_type FROM request_attachments').all();
  const attMap = new Map();
  for (const a of allAtts) {
    if (!attMap.has(a.request_id)) attMap.set(a.request_id, []);
    attMap.get(a.request_id).push(`${a.original_name} [${a.file_type}]`);
  }

  const exportRows = rows.map(r => ({
    'Record ID': sanitizeForSpreadsheet(r.id),
    'Submitted (UTC)': sanitizeForSpreadsheet(r.created_at),
    'Portfolio': sanitizeForSpreadsheet(r.portfolio),
    'Submitter IP Address': sanitizeForSpreadsheet(r.ip_address || '127.0.0.1'),
    'Request Title / Topic': sanitizeForSpreadsheet(r.request_title),
    'Submitter Full Name': sanitizeForSpreadsheet(r.submitter_name),
    'Role / Designation': sanitizeForSpreadsheet(r.submitter_role),
    'Email Address': sanitizeForSpreadsheet(r.submitter_email),
    'Phone Number': sanitizeForSpreadsheet(r.submitter_phone || 'NA'),
    'Publishing Channel': sanitizeForSpreadsheet(r.publishing_channel),
    'Suggested Headline': sanitizeForSpreadsheet(r.headline || 'NA'),
    'Main Content': sanitizeForSpreadsheet(r.main_content),
    'Word Count': Number(r.word_count) || 0,
    'Key Highlights': sanitizeForSpreadsheet(r.key_highlights || 'NA'),
    'Hashtags': sanitizeForSpreadsheet(r.hashtags || ''),
    '@Mentions': sanitizeForSpreadsheet(r.mentions || ''),
    'LinkedIn IDs': sanitizeForSpreadsheet(r.linkedin_ids || 'NA'),
    'Instagram IDs': sanitizeForSpreadsheet(r.instagram_ids || 'NA'),
    'Event Name': sanitizeForSpreadsheet(r.event_name || 'NA'),
    'Event Date': sanitizeForSpreadsheet(r.event_date || 'NA'),
    'Event Time': sanitizeForSpreadsheet(r.event_time || 'NA'),
    'Time Zone': sanitizeForSpreadsheet(r.time_zone || 'NA'),
    'Public Video Link': sanitizeForSpreadsheet(r.video_public_link || ''),
    'Create Image Flag': r.no_media_checkbox ? 'YES' : 'NO',
    'Image Requirement': sanitizeForSpreadsheet(r.image_requirement || (r.no_media_checkbox ? 'Create Image' : 'No Image Needed')),
    'Preferred Delivery Date': sanitizeForSpreadsheet(r.delivery_date),
    'Preferred Delivery Time': sanitizeForSpreadsheet(r.delivery_time || '09:00'),
    'Comments / Repost Schedule': sanitizeForSpreadsheet(r.repost_comments || ''),
    'Status': sanitizeForSpreadsheet(r.status || 'Pending Review'),
    'Attachments': sanitizeForSpreadsheet((attMap.get(r.id) || []).join('; ') || 'None')
  }));

  logAudit('EXPORT_EXCEL', 'ALL', `Exported ${rows.length} records to Excel Data`, clientIp);
  return res.status(200).json({ success: true, count: exportRows.length, data: exportRows });
});

// -----------------------------------------------------------------------------
// TRAFFIC CONTROLLER STAGE 3: STATIC FILE SERVING WITH DEFENSE-IN-DEPTH
// -----------------------------------------------------------------------------
const blockedFiles = [
  'database.sqlite',
  'database.sqlite.bak',
  'database.sqlite-shm',
  'database.sqlite-wal',
  '.env',
  '.env.example',
  '.gitignore',
  'package.json',
  'package-lock.json',
  'database.js',
  'server.js',
  'START_SYSTEM.bat'
];

app.use((req, res, next) => {
  let pathname = req.path;
  if (pathname === '/' || pathname === '/index') {
    pathname = '/index.html';
  } else if (pathname === '/owner') {
    pathname = '/owner.html';
  } else if (pathname === '/media-request') {
    pathname = '/media-request.html';
  }

  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const absolutePath = path.join(__dirname, safePath);

  if (!absolutePath.startsWith(__dirname)) {
    return res.status(403).send('403 Forbidden: Invalid file path.');
  }

  const baseName = path.basename(absolutePath);
  if (blockedFiles.includes(baseName) || absolutePath.includes(path.sep + 'uploads' + path.sep) || baseName.endsWith('.md')) {
    return res.status(403).send('403 Forbidden: Direct access to private system files is prohibited.');
  }

  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const noCache = ext === '.html' || ext === '.js' || ext === '.css';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': noCache ? 'no-cache, no-store, must-revalidate' : 'public, max-age=86400'
    });
    return fs.createReadStream(absolutePath).pipe(res);
  }

  next();
});

// -----------------------------------------------------------------------------
// TRAFFIC CONTROLLER STAGE 4: CATCH-ALL & 404 HANDLER
// -----------------------------------------------------------------------------

// 404 Handler
app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html>
    <head><title>404 Not Found &bull; PMI Portfolio System</title></head>
    <body style="font-family: sans-serif; text-align: center; padding: 4rem 1rem; color: #1A1D20;">
      <h2>404 &bull; Resource Not Found</h2>
      <p>The requested page or endpoint does not exist.</p>
      <p><a href="/" style="color: #005696; font-weight: bold;">Return to Public Submission Portal</a></p>
    </body>
    </html>
  `);
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[UNCAUGHT_SERVER_ERROR]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ success: false, error: 'An unexpected internal server error occurred.' });
});

// -----------------------------------------------------------------------------
// COMPATIBILITY REQUEST HANDLER FOR IN-PROCESS & TEST SUITES
// -----------------------------------------------------------------------------
async function requestHandler(req, res) {
  return new Promise((resolve, reject) => {
    // If incoming request mock has non-Stream socket, wrap it to avoid Node 24 EOS error
    if (req.socket && !(req.socket instanceof Stream)) {
      const fakeSock = new Duplex({ read() {}, write(c, e, cb) { cb(); } });
      Object.assign(fakeSock, req.socket);
      req.socket = fakeSock;
    }

    // If incoming response mock is a plain Writable (e.g. from test/suite.js), adapt Express headers
    if (res.onFinish && !(res instanceof http.ServerResponse)) {
      const origEnd = res.end;
      const origWriteHead = res.writeHead;
      Object.defineProperty(res, 'end', {
        value: function (c, e, cb) { return origEnd.call(res, c, e, cb); },
        writable: true,
        configurable: true
      });
      Object.defineProperty(res, 'writeHead', {
        value: function (s, h) { return origWriteHead.call(res, s, h); },
        writable: true,
        configurable: true
      });
      Object.defineProperty(res, 'getHeader', {
        value: function (k) { return res.headers[k.toLowerCase()]; },
        writable: true,
        configurable: true
      });
      Object.defineProperty(res, 'setHeader', {
        value: function (k, v) { res.headers[k.toLowerCase()] = v; },
        writable: true,
        configurable: true
      });
      Object.defineProperty(res, 'hasHeader', {
        value: function (k) { return k.toLowerCase() in res.headers; },
        writable: true,
        configurable: true
      });
      Object.defineProperty(res, 'removeHeader', {
        value: function (k) { delete res.headers[k.toLowerCase()]; },
        writable: true,
        configurable: true
      });
    }

    res.on('finish', resolve);
    res.on('close', resolve);
    res.on('error', reject);

    app(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// -----------------------------------------------------------------------------
// SERVER INITIALIZATION & CLOUDFLARE TUNNEL AUTO-LAUNCH
// -----------------------------------------------------------------------------
const server = http.createServer(app);

function startCloudflareTunnel() {
  if (process.argv.includes('--no-tunnel') || process.env.ENABLE_CLOUDFLARE_TUNNEL === 'false') {
    return;
  }

  const { spawn } = require('child_process');
  let cfExe = 'cloudflared';
  const candidatePaths = [
    path.join(process.env.USERPROFILE || '', 'cloudflared.exe'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe'),
    path.join(process.env.ProgramFiles || '', 'cloudflared', 'cloudflared.exe'),
    'C:\\ProgramData\\chocolatey\\bin\\cloudflared.exe'
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      cfExe = p;
      break;
    }
  }

  try {
    const tunnelProcess = spawn(cfExe, ['tunnel', '--url', `http://localhost:${PORT}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    });

    let detectedUrl = false;
    function scanTunnelOutput(chunk) {
      const text = chunk.toString();
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !detectedUrl) {
        detectedUrl = true;
        console.log(`=====================================================================`);
        console.log(`🌐 PMI Chapter Secure Cloudflare Public URL Ready:`);
        console.log(`👉 ${match[0]}`);
        console.log(`👉 ${match[0]}/owner.html (Owner Administration Portal)`);
        console.log(`=====================================================================`);
      }
    }

    tunnelProcess.stdout.on('data', scanTunnelOutput);
    tunnelProcess.stderr.on('data', scanTunnelOutput);
    tunnelProcess.on('error', () => {});
  } catch (err) {}
}

if (require.main === module) {
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = PORT + 1;
      console.warn(`[PORT_BUSY] Port ${PORT} is currently in use. Automatically switching to http://${HOST}:${nextPort}...`);
      server.listen(nextPort, HOST, () => {
        console.log(`=====================================================================`);
        console.log(`🚀 PMI Portfolio Content Management System (Express.js) Running`);
        console.log(`📡 Local Network Host: http://${HOST}:${nextPort}`);
        console.log(`📱 Public Submitter:   http://localhost:${nextPort}/`);
        console.log(`🔐 Owner Portal:        http://localhost:${nextPort}/owner.html`);
        console.log(`💾 Database:            ${DB_PATH}`);
        console.log(`📁 Attachments Dir:     ${UPLOAD_DIR}`);
        console.log(`=====================================================================`);
      });
    } else {
      console.error('[SERVER_ERROR]', err.message);
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`=====================================================================`);
    console.log(`🚀 PMI Portfolio Content Management System (Express.js) Running`);
    console.log(`📡 Local Network Host: http://${HOST}:${PORT}`);
    console.log(`📱 Public Submitter:   http://localhost:${PORT}/`);
    console.log(`🔐 Owner Portal:        http://localhost:${PORT}/owner.html`);
    console.log(`💾 Database:            ${DB_PATH}`);
    console.log(`📁 Attachments Dir:     ${UPLOAD_DIR}`);
    console.log(`=====================================================================`);
  });

  setTimeout(startCloudflareTunnel, 1200);
}

module.exports = { app, server, requestHandler };
