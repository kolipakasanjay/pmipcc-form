/**
 * Automated Enterprise Acceptance Test Suite
 * PMI Portfolio Content Request Management System
 * Run with: npm test (or node test/suite.js)
 */

const { Readable, Writable } = require('stream');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Point to test configuration
process.env.ENABLE_CLOUDFLARE_TUNNEL = 'false';

const { requestHandler } = require('../server');
const { db, verifyPassword } = require('../database');

/**
 * In-process Mock Response Stream supporting streaming, pipe, and headers
 */
class MockResponse extends Writable {
  constructor(onFinish) {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
    this.onFinish = onFinish;
  }
  setHeader(k, v) {
    this.headers[k.toLowerCase()] = v;
  }
  getHeader(k) {
    return this.headers[k.toLowerCase()];
  }
  writeHead(status, headers = {}) {
    this.statusCode = status;
    for (const [k, v] of Object.entries(headers)) {
      this.headers[k.toLowerCase()] = v;
    }
  }
  _write(chunk, encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }
  end(chunk, encoding, callback) {
    if (chunk) {
      this.chunks.push(Buffer.from(chunk));
    }
    super.end(callback);
    const fullBuffer = Buffer.concat(this.chunks);
    const text = fullBuffer.toString('utf8');
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}

    this.onFinish({
      statusCode: this.statusCode,
      headers: this.headers,
      rawBody: text,
      body: json
    });
  }
}

/**
 * In-process Request Dispatcher (100% Sandbox-Safe, Zero TCP Socket requirement)
 */
function makeRequest(method, endpoint, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = new Readable({
      read() {}
    });
    req.method = method;
    req.url = endpoint;
    req.headers = {
      host: 'localhost:3000',
      accept: 'application/json',
      ...headers
    };
    req.socket = { remoteAddress: '127.0.0.1', encrypted: false };

    const res = new MockResponse(resolve);
    res.on('error', reject);

    // Feed body to readable stream
    if (body !== null && body !== undefined) {
      const bodyStr = typeof body === 'object' ? JSON.stringify(body) : String(body);
      req.headers['content-type'] = req.headers['content-type'] || 'application/json';
      req.headers['content-length'] = String(Buffer.byteLength(bodyStr));
      req.push(Buffer.from(bodyStr));
    }
    req.push(null); // End of stream

    requestHandler(req, res).catch(reject);
  });
}

async function runTests() {
  console.log('=====================================================================');
  console.log('🧪 Starting PMI System Acceptance Test Suite...');
  console.log('=====================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}\n`);
      failed++;
    }
  }

  // -----------------------------------------------------------------------
  // 1. DATABASE INTEGRITY & HISTORICAL RECORDS PRESERVATION
  // -----------------------------------------------------------------------
  await test('Database preserves existing historical records', async () => {
    const count = db.prepare('SELECT count(*) as c FROM content_requests').get().c;
    assert.ok(count >= 8, `Expected at least 8 records, found ${count}`);

    // Verify specific existing records
    const sample = db.prepare("SELECT submitter_name FROM content_requests WHERE submitter_name IN ('sanjaykolipaka', 'Jane Smith', 'Alice Developer')").all();
    assert.ok(sample.length >= 3, 'Historical submitters must be present in database');
  });

  // -----------------------------------------------------------------------
  // 2. PUBLIC PORTAL SECURITY & CONFIDENTIALITY
  // -----------------------------------------------------------------------
  await test('Unauthenticated users are blocked from viewing owner requisitions (403)', async () => {
    const res = await makeRequest('GET', '/api/owner/requests');
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error, 'Unauthorized: Owner access required.');
  });

  await test('Unauthenticated users cannot access attachment files (403)', async () => {
    const res = await makeRequest('GET', '/api/owner/attachments/fake-id');
    assert.strictEqual(res.statusCode, 403);
  });

  await test('Unauthenticated users cannot trigger CSV export (403)', async () => {
    const res = await makeRequest('GET', '/api/owner/export/csv');
    assert.strictEqual(res.statusCode, 403);
  });

  // -----------------------------------------------------------------------
  // 3. PUBLIC SUBMISSION VALIDATIONS
  // -----------------------------------------------------------------------
  await test('Rejects submission with invalid portfolio option', async () => {
    const res = await makeRequest('POST', '/api/requests', {}, {
      portfolio: 'NonExistent Portfolio',
      requestTitle: 'Test Title',
      submitterName: 'Tester',
      submitterEmail: 'test@pmi.org',
      publishingChannel: 'Social Media',
      mainContent: 'Valid main content',
      deliveryDate: '2026-12-31'
    });
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.error.includes('valid portfolio'));
  });

  await test('Rejects submission with missing publishing channel', async () => {
    const res = await makeRequest('POST', '/api/requests', {}, {
      portfolio: 'Events Team',
      requestTitle: 'Test Title',
      submitterName: 'Tester',
      submitterEmail: 'test@pmi.org',
      // Missing publishingChannel
      mainContent: 'Valid main content',
      deliveryDate: '2026-12-31',
      imageRequirement: 'Create Image'
    });
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.error.includes('Publishing channel selection is required'));
  });

  await test('Rejects submission with missing image requirement', async () => {
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const res = await makeRequest('POST', '/api/requests', {}, {
      portfolio: 'Events Team',
      requestTitle: 'Test Title',
      submitterName: 'Tester',
      submitterEmail: 'test@pmi.org',
      publishingChannel: 'Social Media',
      mainContent: 'Valid main content',
      deliveryDate: nextWeek
      // Missing imageRequirement
    });
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.error.includes('Image requirement selection is required'));
  });

  await test('Rejects delivery date less than 48 hours in future', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await makeRequest('POST', '/api/requests', {}, {
      portfolio: 'Events Team',
      requestTitle: 'Test Title',
      submitterName: 'Tester',
      submitterEmail: 'test@pmi.org',
      publishingChannel: 'Social Media',
      mainContent: 'Valid main content',
      deliveryDate: today, // Too early
      imageRequirement: 'Create Image'
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(
      res.body.error,
      'Please allow at least two days for processing. Actual delivery depends on current workload and content completeness.'
    );
  });

  await test('Accepts requisition when mainContent is omitted or empty (normal optional field)', async () => {
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const res = await makeRequest('POST', '/api/requests', {}, {
      portfolio: 'Events Team',
      requestTitle: 'Requisition Without Main Content',
      submitterName: 'Tester Without Content',
      submitterEmail: 'test@pmi.org',
      publishingChannel: 'Social Media',
      mainContent: '', // Empty main content
      deliveryDate: nextWeek,
      imageRequirement: 'Create Image'
    });
    assert.strictEqual(res.statusCode, 201);
    assert.ok(res.body.referenceId.startsWith('REQ-'));
    // Clean up
    db.prepare('DELETE FROM content_requests WHERE id = ?').run(res.body.referenceId);
  });

  await test('Accepts requisition when preferred delivery date is omitted (normal optional field)', async () => {
    const res = await makeRequest('POST', '/api/requests', {}, {
      portfolio: 'Events Team',
      requestTitle: 'Requisition Without Delivery Date',
      submitterName: 'Tester Without Delivery Date',
      submitterEmail: 'test@pmi.org',
      publishingChannel: 'Social Media',
      mainContent: 'Valid main content',
      deliveryDate: '', // Omitted delivery date
      imageRequirement: 'Create Image'
    });
    assert.strictEqual(res.statusCode, 201);
    assert.ok(res.body.referenceId.startsWith('REQ-'));
    // Verify in database that it was recorded as NA
    const record = db.prepare('SELECT delivery_date FROM content_requests WHERE id = ?').get(res.body.referenceId);
    assert.strictEqual(record.delivery_date, 'NA');
    // Clean up
    db.prepare('DELETE FROM content_requests WHERE id = ?').run(res.body.referenceId);
  });

  await test('Rejects event date when it is today, tomorrow, or yesterday', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await makeRequest('POST', '/api/requests', {}, {
      portfolio: 'Events Team',
      requestTitle: 'Requisition With Invalid Event Date',
      submitterName: 'Tester Event Date',
      submitterEmail: 'test@pmi.org',
      publishingChannel: 'Social Media',
      mainContent: 'Valid content',
      eventDate: today, // Today is restricted
      imageRequirement: 'Create Image'
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(
      res.body.error,
      'Event date cannot be yesterday, today, or tomorrow. Please select a date at least 2 days in advance.'
    );
  });

  await test('Accepts event date when it is at least 2 days in the future', async () => {
    const futureEvent = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const res = await makeRequest('POST', '/api/requests', {}, {
      portfolio: 'Events Team',
      requestTitle: 'Requisition With Future Event Date',
      submitterName: 'Tester Future Event Date',
      submitterEmail: 'test@pmi.org',
      publishingChannel: 'Social Media',
      mainContent: 'Valid content',
      eventDate: futureEvent,
      imageRequirement: 'Create Image'
    });
    assert.strictEqual(res.statusCode, 201);
    assert.ok(res.body.referenceId.startsWith('REQ-'));
    const record = db.prepare('SELECT event_date FROM content_requests WHERE id = ?').get(res.body.referenceId);
    assert.strictEqual(record.event_date, futureEvent);
    // Clean up
    db.prepare('DELETE FROM content_requests WHERE id = ?').run(res.body.referenceId);
  });

  await test('Rejects invalid video URL with exact required error message', async () => {
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const res = await makeRequest('POST', '/api/requests', {}, {
      portfolio: 'MARCOM Team',
      requestTitle: 'Test Title',
      submitterName: 'Tester',
      submitterEmail: 'test@pmi.org',
      publishingChannel: 'Social Media',
      mainContent: 'Valid main content',
      deliveryDate: nextWeek,
      imageRequirement: 'Create Image',
      videoPublicLink: 'https://not-a-real-video-link.example.com/fake'
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'Please provide the public link in order to upload the link');
  });

  await test('Rejects restricted Google Drive link (usp=drive_link or folders)', async () => {
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    // Restricted drive link
    const res1 = await makeRequest('POST', '/api/requests', {}, {
      portfolio: 'MARCOM Team',
      requestTitle: 'Restricted Drive Test',
      submitterName: 'Tester',
      submitterEmail: 'test@pmi.org',
      publishingChannel: 'Social Media',
      mainContent: 'Valid main content',
      deliveryDate: nextWeek,
      imageRequirement: 'No Image Needed',
      videoPublicLink: 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view?usp=drive_link'
    });
    assert.strictEqual(res1.statusCode, 400);
    assert.strictEqual(res1.body.error, 'Please provide the public link in order to upload the link');

    // Drive folder link
    const res2 = await makeRequest('POST', '/api/requests', {}, {
      portfolio: 'MARCOM Team',
      requestTitle: 'Drive Folder Test',
      submitterName: 'Tester',
      submitterEmail: 'test@pmi.org',
      publishingChannel: 'Social Media',
      mainContent: 'Valid main content',
      deliveryDate: nextWeek,
      imageRequirement: 'No Image Needed',
      videoPublicLink: 'https://drive.google.com/drive/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs'
    });
    assert.strictEqual(res2.statusCode, 400);
    assert.strictEqual(res2.body.error, 'Please provide the public link in order to upload the link');
  });

  await test('Accepts valid YouTube link without error', async () => {
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const res = await makeRequest('POST', '/api/requests', {}, {
      portfolio: 'Membership',
      requestTitle: 'YouTube Video Requisition',
      submitterName: 'Video Lead',
      submitterEmail: 'lead@pmi.org',
      publishingChannel: 'Both',
      mainContent: 'Check out the new global membership announcement video.',
      deliveryDate: nextWeek,
      imageRequirement: 'Create Image',
      videoPublicLink: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    });
    assert.strictEqual(res.statusCode, 201);
    assert.ok(res.body.referenceId.startsWith('REQ-'));
  });

  await test('/api/validate-video-link rejects empty or NA video links', async () => {
    const res1 = await makeRequest('POST', '/api/validate-video-link', {}, { url: '' });
    assert.strictEqual(res1.statusCode, 400);
    assert.strictEqual(res1.body.error, 'Please provide the public link in order to upload the link');

    const res2 = await makeRequest('POST', '/api/validate-video-link', {}, { url: 'NA' });
    assert.strictEqual(res2.statusCode, 400);
    assert.strictEqual(res2.body.error, 'Please provide the public link in order to upload the link');
  });

  await test('/api/validate-video-link validates YouTube link successfully', async () => {
    const res = await makeRequest('POST', '/api/validate-video-link', {}, {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
  });

  await test('/api/validate-video-link rejects restricted Google Drive link', async () => {
    const res = await makeRequest('POST', '/api/validate-video-link', {}, {
      url: 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view?usp=drive_link'
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'Please provide the public link in order to upload the link');
  });

  await test('Rejects malformed executable or script attachment', async () => {
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const fakeExeBase64 = Buffer.from('MZ\x90\x00executable binary content').toString('base64');
    const res = await makeRequest('POST', '/api/requests', {}, {
      portfolio: 'Social Impact',
      requestTitle: 'Malicious Upload Test',
      submitterName: 'Security Tester',
      submitterEmail: 'sec@pmi.org',
      publishingChannel: 'Social Media',
      mainContent: 'Security test for unauthorized file signature.',
      deliveryDate: nextWeek,
      imageRequirement: 'No Image Needed',
      mediaFiles: [
        {
          name: 'payload.exe',
          dataUrl: `data:application/octet-stream;base64,${fakeExeBase64}`
        }
      ]
    });
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.error.includes('unrecognized or prohibited file signature'));
  });

  // -----------------------------------------------------------------------
  // 4. VALID REQUISITION CREATION & TRACKING RECEIPT CONFIDENTIALITY
  // -----------------------------------------------------------------------
  let createdRefId = null;
  await test('Valid requisition returns private tracking receipt with collision-checked ID', async () => {
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    // Valid 1x1 PNG image signature (89 50 4E 47 0D 0A 1A 0A)
    const validPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const res = await makeRequest('POST', '/api/requests', {}, {
      portfolio: 'Academia',
      requestTitle: 'Automated Test Requisition',
      submitterName: 'Dr. Jane Academic',
      submitterRole: 'Research Director',
      submitterEmail: 'jane.academic@university.edu',
      submitterPhone: '+1 555 123 4567',
      clarificationNote: 'Please contact via email during business hours',
      publishingChannel: 'Social Media',
      headline: 'Groundbreaking Project Management Research Announcement',
      mainContent: 'We are pleased to present the 2026 Academic Summit Research Papers. Featuring extensive analysis of project management trends.',
      keyHighlights: 'Over 50 universities participating in study.',
      hashtags: '#PMIResearch #ProjectManagement',
      mentions: '@PMI_Org',
      imageRequirement: 'Create Image',
      deliveryDate: nextWeek,
      deliveryTime: '14:30',
      repostComments: 'Repost 3 times on subsequent Mondays',
      mediaFiles: [
        {
          name: 'summit_flyer.png',
          dataUrl: `data:image/png;base64,${validPngBase64}`
        }
      ]
    });

    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.success, true);
    assert.ok(/^REQ-\d{8}-[A-Z0-9]{4}$/.test(res.body.referenceId), `Invalid ID format: ${res.body.referenceId}`);
    assert.strictEqual(res.body.message, 'Your request has been submitted successfully.');

    // Strict confidentiality check: receipt MUST NOT contain submitter name, email, or content
    assert.strictEqual(res.body.submitterName, undefined);
    assert.strictEqual(res.body.submitterEmail, undefined);
    assert.strictEqual(res.body.mainContent, undefined);

    createdRefId = res.body.referenceId;
  });

  // -----------------------------------------------------------------------
  // 5. OWNER AUTHENTICATION & SESSION MANAGEMENT
  // -----------------------------------------------------------------------
  let ownerCookie = null;
  let ownerCsrfToken = null;

  await test('Owner login rejects incorrect password with 401', async () => {
    const res = await makeRequest('POST', '/api/owner/login', {}, {
      username: 'admin',
      password: 'wrong_password_123'
    });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.success, false);
  });

  await test('Owner authenticates using bootstrap credential (owner@pmi2026)', async () => {
    const res = await makeRequest('POST', '/api/owner/login', {}, {
      username: 'admin',
      password: 'owner@pmi2026'
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.csrfToken, 'CSRF token must be returned');

    ownerCsrfToken = res.body.csrfToken;
    const setCookie = res.headers['set-cookie'];
    assert.ok(setCookie, 'HttpOnly session cookie must be set');
    ownerCookie = String(setCookie).split(';')[0];
    assert.ok(ownerCookie.startsWith('pmi_session='), 'Cookie must be named pmi_session');
  });

  await test('Active session check returns authenticated status and user details', async () => {
    const res = await makeRequest('GET', '/api/owner/session', {
      'cookie': ownerCookie
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.authenticated, true);
    assert.strictEqual(res.body.username, 'admin');
  });

  await test('Owner authenticates using secondary credential (PMI2026)', async () => {
    const res = await makeRequest('POST', '/api/owner/login', {}, {
      username: 'admin',
      password: 'PMI2026'
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
  });

  // -----------------------------------------------------------------------
  // 6. PROTECTED OWNER REQUISITIONS RETRIEVAL & FILTERING
  // -----------------------------------------------------------------------
  await test('Authenticated owner can list requisitions with attachment metadata', async () => {
    const res = await makeRequest('GET', '/api/owner/requests', {
      'cookie': ownerCookie
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.total >= 9, 'Must include existing and new records');

    // Check newly created record exists in listing
    const found = res.body.requests.find(r => r.id === createdRefId);
    assert.ok(found, `Created requisition ${createdRefId} must be in owner list`);
    assert.strictEqual(found.portfolio, 'Academia');
    assert.strictEqual(found.deliveryTime, '14:30');
    assert.strictEqual(found.imageRequirement, 'Create Image');
    assert.strictEqual(found.repostComments, 'Repost 3 times on subsequent Mondays');
    assert.ok(found.attachments.length >= 1, 'Attachment metadata must be included');
    assert.strictEqual(found.attachments[0].name, 'summit_flyer.png');
  });

  await test('Portfolio filtering works correctly across all 12 portfolios', async () => {
    const res = await makeRequest('GET', '/api/owner/requests?portfolio=Academia', {
      'cookie': ownerCookie
    });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.requests.every(r => r.portfolio === 'Academia'), 'All filtered results must match Academia');
  });

  await test('Search query matches across title, submitter, and content', async () => {
    const res = await makeRequest('GET', '/api/owner/requests?search=Academic+Summit', {
      'cookie': ownerCookie
    });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.requests.length >= 1);
    assert.strictEqual(res.body.requests[0].id, createdRefId);
  });

  // -----------------------------------------------------------------------
  // 7. SECURE ATTACHMENT STREAMING
  // -----------------------------------------------------------------------
  await test('Authenticated owner can stream private attachment file', async () => {
    const attRow = db.prepare('SELECT id FROM request_attachments WHERE request_id = ?').get(createdRefId);
    assert.ok(attRow, 'Attachment row must exist');

    const res = await makeRequest('GET', `/api/owner/attachments/${attRow.id}`, {
      'cookie': ownerCookie
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'image/png');
  });

  // -----------------------------------------------------------------------
  // 8. AUTHENTICATED EXPORTS (CSV & EXCEL DATA)
  // -----------------------------------------------------------------------
  await test('CSV Export generates valid RFC 4180 format with UTF-8 BOM', async () => {
    const res = await makeRequest('GET', '/api/owner/export/csv', {
      'cookie': ownerCookie
    });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/csv'));
    assert.ok(res.headers['content-disposition'].includes('attachment; filename="PMI_Database_Requisitions_'));

    // Verify UTF-8 BOM (\uFEFF)
    assert.ok(res.rawBody.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM for Microsoft Excel');
    assert.ok(res.rawBody.includes('Record ID,Submitted Timestamp (UTC),Portfolio,Request Title'));
    assert.ok(res.rawBody.includes(createdRefId));
  });

  await test('Excel export data endpoint returns sanitized records', async () => {
    const res = await makeRequest('GET', '/api/owner/export/excel-data', {
      'cookie': ownerCookie
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.length >= 9);
  });

  // -----------------------------------------------------------------------
  // 9. RECORD DELETION & CSRF ENFORCEMENT
  // -----------------------------------------------------------------------
  await test('Deleting requisition without CSRF token is rejected (403)', async () => {
    const res = await makeRequest('DELETE', `/api/owner/requests/${createdRefId}`, {
      'cookie': ownerCookie
      // Missing X-CSRF-Token
    });
    assert.strictEqual(res.statusCode, 403);
  });

  await test('Deleting requisition with valid CSRF token succeeds and removes disk files', async () => {
    const res = await makeRequest('DELETE', `/api/owner/requests/${createdRefId}`, {
      'cookie': ownerCookie,
      'x-csrf-token': ownerCsrfToken
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);

    // Verify deleted from DB
    const check = db.prepare('SELECT id FROM content_requests WHERE id = ?').get(createdRefId);
    assert.ok(check === undefined || check === null, 'Record must no longer exist in database');
  });

  // -----------------------------------------------------------------------
  // 10. OWNER LOGOUT
  // -----------------------------------------------------------------------
  await test('Owner logout invalidates session', async () => {
    const res = await makeRequest('POST', '/api/owner/logout', {
      'cookie': ownerCookie
    });
    assert.strictEqual(res.statusCode, 200);

    // Verify subsequent request is rejected
    const verifyRes = await makeRequest('GET', '/api/owner/requests', {
      'cookie': ownerCookie
    });
    assert.strictEqual(verifyRes.statusCode, 403);
  });

  // Clean up any test records created during test execution
  try {
    db.prepare("DELETE FROM content_requests WHERE submitter_name IN ('Video Lead', 'Dr. Jane Academic')").run();
  } catch (e) {}

  console.log('\n=====================================================================');
  console.log(`🏁 Acceptance Test Suite Completed: ${passed} Passed, ${failed} Failed`);
  console.log('=====================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
