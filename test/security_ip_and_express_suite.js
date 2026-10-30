/**
 * Test Suite: Express.js Engine & Submitter IP Address Security Audit
 * Verifies Express migration, Security button beside Download CSV,
 * Client IP address tracking, Security modal, and IP audit export.
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { app } = require('../server');
const { db } = require('../database');

const PORT = 4055;
let serverInstance;

function request(method, pathStr, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: pathStr,
      method: method,
      headers: headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json: json
        });
      });
    });

    req.on('error', reject);

    if (body) {
      if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

async function runTests() {
  console.log('=====================================================================');
  console.log('🛡️ Testing Express.js & Submitter IP Security Audit System...');
  console.log('=====================================================================\n');

  let passed = 0;
  let failed = 0;

  function pass(msg) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  }

  function fail(msg, err) {
    console.error(`  ❌ FAIL: ${msg}`);
    if (err) console.error(err);
    failed++;
  }

  // 1. Verify Express.js engine in server.js
  try {
    const serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    assert(serverCode.includes("require('express')"), 'server.js must require express');
    assert(serverCode.includes("const app = express();"), 'server.js must initialize express app');
    assert(typeof app === 'function' && typeof app.use === 'function', 'app must be an Express application');
    pass('server.js is fully migrated to Express.js framework');
  } catch (e) {
    fail('server.js Express migration check failed', e);
  }

  // 2. Verify Security button beside Download CSV in owner.html
  try {
    const ownerHtml = fs.readFileSync(path.join(__dirname, '../owner.html'), 'utf8');
    assert(ownerHtml.includes('id="downloadCsvBtn"'), 'owner.html must contain downloadCsvBtn');
    assert(ownerHtml.includes('id="securityAuditBtn"'), 'owner.html must contain securityAuditBtn');
    
    // Check that securityAuditBtn is right beside downloadCsvBtn
    const csvPos = ownerHtml.indexOf('id="downloadCsvBtn"');
    const secPos = ownerHtml.indexOf('id="securityAuditBtn"');
    assert(secPos > csvPos && (secPos - csvPos) < 400, 'Security button must be positioned right beside Download CSV');
    assert(ownerHtml.includes('🛡️ Security') || ownerHtml.includes('Security'), 'Security button must display "Security"');
    pass('owner.html contains Security button right beside Download CSV');
  } catch (e) {
    fail('Security button beside Download CSV check failed', e);
  }

  // 3. Verify Security Audit Modal in owner.html
  try {
    const ownerHtml = fs.readFileSync(path.join(__dirname, '../owner.html'), 'utf8');
    assert(ownerHtml.includes('id="securityModal"'), 'owner.html must contain securityModal');
    assert(ownerHtml.includes('id="securityTableBody"'), 'securityModal must contain securityTableBody');
    assert(ownerHtml.includes('id="securityKpiTotal"'), 'securityModal must contain securityKpiTotal');
    assert(ownerHtml.includes('id="securityKpiUniqueIps"'), 'securityModal must contain securityKpiUniqueIps');
    assert(ownerHtml.includes('id="securitySearchInput"'), 'securityModal must contain securitySearchInput');
    assert(ownerHtml.includes('id="exportSecurityCsvBtn"'), 'securityModal must contain exportSecurityCsvBtn');
    pass('owner.html contains complete Security & Submitter IP Audit Modal');
  } catch (e) {
    fail('Security modal structure check failed', e);
  }

  // 4. Verify owner.js implements Security modal and displays Submitter IP
  try {
    const ownerJs = fs.readFileSync(path.join(__dirname, '../js/owner.js'), 'utf8');
    assert(ownerJs.includes('securityAuditBtn'), 'owner.js must bind securityAuditBtn');
    assert(ownerJs.includes('openSecurityModal'), 'owner.js must define openSecurityModal');
    assert(ownerJs.includes('/api/owner/security-audit'), 'owner.js must query security-audit endpoint');
    assert(ownerJs.includes('/api/owner/security-audit/csv'), 'owner.js must support exporting security CSV');
    assert(ownerJs.includes('Submitter IP Address'), 'owner.js must render Submitter IP in Requisition details');
    pass('owner.js wires Security modal, CSV export, and displays Submitter IP');
  } catch (e) {
    fail('owner.js security logic check failed', e);
  }

  // Start Express server for HTTP API testing
  await new Promise((resolve) => {
    serverInstance = app.listen(PORT, '127.0.0.1', () => {
      resolve();
    });
  });

  try {
    // 5. Test IP address capture in POST /api/requests
    const testIp = '198.51.100.42';
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const eventDate = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const postPayload = {
      portfolio: 'Events Team',
      requestTitle: 'Security IP Tracking Verification Post',
      submitterName: 'Security Tester',
      submitterRole: 'Security Auditor',
      submitterEmail: 'security@pmi-pcc.org',
      submitterPhone: '+91 98765 43210',
      clarificationNote: 'Audit note',
      publishingChannel: 'Social Media',
      headline: 'Cyber Security in PM',
      mainContent: 'Detailed content for testing submitter IP address capture and security audit log.',
      keyHighlights: 'IP tracking, Anti-abuse, Audit trail',
      hashtags: '#PMI #Security',
      mentions: '@pmipcc',
      linkedinIds: 'in/sec-tester',
      instagramIds: 'pmipcc_sec',
      eventName: 'Security Summit',
      eventDate: eventDate,
      eventTime: '10:00',
      timeZone: 'IST',
      videoPublicLink: '',
      noMediaCheckbox: false,
      imageRequirement: 'No Image Needed',
      deliveryDate: futureDate,
      deliveryTime: '10:00',
      repostComments: 'None'
    };

    const submitRes = await request('POST', '/api/requests', {
      'Content-Type': 'application/json',
      'X-Forwarded-For': testIp
    }, postPayload);

    assert.strictEqual(submitRes.statusCode, 201, 'POST /api/requests should return 201');
    assert(submitRes.json && submitRes.json.success, 'Submission should succeed');
    const createdReqId = submitRes.json.referenceId;

    // Verify stored IP in database
    const dbRecord = db.prepare('SELECT ip_address FROM content_requests WHERE id = ?').get(createdReqId);
    assert.strictEqual(dbRecord.ip_address, testIp, 'Stored IP address must match X-Forwarded-For header');
    pass(`POST /api/requests captures submitter IP (${testIp}) correctly`);

    // 6. Test IP address capture in POST /api/media-requests
    const mediaTestIp = '203.0.113.88';
    const mediaPayload = {
      contentReqId: createdReqId,
      portfolio: 'MARCOM Team',
      projectTitle: 'Visual Poster for Security Summit',
      submitterName: 'Media Requester',
      submitterRole: 'Creative Lead',
      submitterEmail: 'creative@pmi-pcc.org',
      submitterPhone: '+91 91234 56789',
      requestType: 'Custom Image Creation',
      assetCategory: 'Event Promotion',
      dimensions: 'Square 1:1 (1080x1080)',
      headlineText: 'Security Summit 2026',
      supportingText: 'Venue: HICC Hyderabad',
      designGuidance: 'PMI navy blue palette with vibrant accents',
      referenceLink: '',
      deliveryDate: futureDate,
      deliveryTime: '14:00',
      priority: 'Standard (48+ hrs)',
      hostingChannels: 'Official Website, Social Media',
      hostingTargetUrl: 'https://pmi-pcc.org/events/security',
      hostingLiveDate: futureDate,
      hostingNotes: 'Publish simultaneously on social channels',
      hostingWorkflow: 'Notify Submitter for Final Approval'
    };

    const mediaRes = await request('POST', '/api/media-requests', {
      'Content-Type': 'application/json',
      'X-Forwarded-For': mediaTestIp
    }, mediaPayload);

    assert.strictEqual(mediaRes.statusCode, 201, 'POST /api/media-requests should return 201');
    const createdMediaId = mediaRes.json.referenceId;

    const dbMediaRecord = db.prepare('SELECT ip_address FROM media_requests WHERE id = ?').get(createdMediaId);
    assert.strictEqual(dbMediaRecord.ip_address, mediaTestIp, 'Stored media request IP must match client IP');
    pass(`POST /api/media-requests captures submitter IP (${mediaTestIp}) correctly`);

    // 7. Verify security endpoints require authentication
    const unauthAudit = await request('GET', '/api/owner/security-audit');
    assert.strictEqual(unauthAudit.statusCode, 403, 'GET /api/owner/security-audit must require owner authentication');

    const unauthCsv = await request('GET', '/api/owner/security-audit/csv');
    assert.strictEqual(unauthCsv.statusCode, 403, 'GET /api/owner/security-audit/csv must require owner authentication');
    pass('Security audit endpoints strictly reject unauthorized requests (403)');

    // 8. Authenticate as owner and test /api/owner/security-audit
    const loginRes = await request('POST', '/api/owner/login', {
      'Content-Type': 'application/json'
    }, { username: 'admin', password: 'owner@pmi2026' });

    assert.strictEqual(loginRes.statusCode, 200, 'Owner login must succeed');
    const sessionCookie = loginRes.headers['set-cookie'] ? loginRes.headers['set-cookie'][0].split(';')[0] : '';
    assert(sessionCookie.startsWith('pmi_session='), 'Owner login must set pmi_session cookie');

    const authAudit = await request('GET', '/api/owner/security-audit', {
      'Cookie': sessionCookie
    });

    assert.strictEqual(authAudit.statusCode, 200, 'Authenticated GET /api/owner/security-audit must return 200');
    assert(authAudit.json && authAudit.json.success, 'Response must indicate success');
    assert(authAudit.json.total >= 2, 'Total submissions must be >= 2');
    assert(authAudit.json.uniqueIps >= 2, 'Unique IPs must be >= 2');

    const foundReq = authAudit.json.submissions.find(s => s.id === createdReqId);
    assert(foundReq, 'Submitted content request must be in security audit log');
    assert.strictEqual(foundReq.ipAddress, testIp, 'Submission in audit log must have correct IP');

    const foundMedia = authAudit.json.submissions.find(s => s.id === createdMediaId);
    assert(foundMedia, 'Submitted media request must be in security audit log');
    assert.strictEqual(foundMedia.ipAddress, mediaTestIp, 'Media request in audit log must have correct IP');
    pass('GET /api/owner/security-audit returns full IP audit log with KPIs and submissions');

    // 9. Test /api/owner/security-audit/csv
    const authCsv = await request('GET', '/api/owner/security-audit/csv', {
      'Cookie': sessionCookie
    });

    assert.strictEqual(authCsv.statusCode, 200, 'GET /api/owner/security-audit/csv must return 200');
    assert(authCsv.headers['content-type'].includes('text/csv'), 'Content-Type must be text/csv');
    assert(authCsv.body.includes('Submitter IP Address'), 'CSV must contain "Submitter IP Address" header');
    assert(authCsv.body.includes(testIp), `CSV must contain submitter IP ${testIp}`);
    assert(authCsv.body.includes(mediaTestIp), `CSV must contain media requester IP ${mediaTestIp}`);
    pass('GET /api/owner/security-audit/csv generates downloadable CSV with Submitter IP addresses');

    // 10. Test Owner Portal Screen Fitting & View Mode Toggle
    const ownerHtml = fs.readFileSync(path.join(__dirname, '../owner.html'), 'utf8');
    const ownerCss = fs.readFileSync(path.join(__dirname, '../css/owner.css'), 'utf8');
    const stylesCss = fs.readFileSync(path.join(__dirname, '../css/styles.css'), 'utf8');

    assert(ownerHtml.includes('owner-main-wrapper'), 'owner.html must contain owner-main-wrapper');
    assert(ownerHtml.includes('id="viewModeTableBtn"'), 'owner.html must have viewModeTableBtn');
    assert(ownerHtml.includes('id="viewModeCardsBtn"'), 'owner.html must have viewModeCardsBtn');
    assert(ownerCss.includes('.owner-main-wrapper'), 'owner.css must style .owner-main-wrapper');
    assert(ownerCss.includes('max-width: 1560px'), 'owner.css must configure generous max-width for laptop screens');
    assert(ownerCss.includes('.view-mode-toggle'), 'owner.css must style .view-mode-toggle');
    assert(ownerCss.includes('.force-table-view') && ownerCss.includes('.force-cards-view'), 'owner.css must support forced view switching');
    assert(ownerCss.includes('display: grid !important') && ownerCss.includes('grid-template-columns: 1fr 1fr !important'), 'owner.css must arrange tabs in 2-column grid on mobile');
    pass('Owner portal screen fitting, fluid max-width, view mode toggle, and mobile tabs configured');

    // 11. Test Modal Popups Visibility, Scroll Locks, and authFetch Engine
    const ownerJs = fs.readFileSync(path.join(__dirname, '../js/owner.js'), 'utf8');
    const rootOwnerJs = fs.readFileSync(path.join(__dirname, '../owner.js'), 'utf8');

    assert.strictEqual(ownerJs, rootOwnerJs, 'js/owner.js and root owner.js must be identical');
    assert(ownerJs.includes('async function authFetch'), 'owner.js must implement authFetch');
    assert(ownerJs.includes('openModal(inspectModal)'), 'viewRequestDetails must open modal reliably');
    assert(ownerJs.includes('document.body.classList.add(\'modal-open\')'), 'owner.js must lock body scroll when modal opens');
    assert(ownerJs.includes('document.body.classList.remove(\'modal-open\')'), 'owner.js must release body scroll when modal closes');
    assert(ownerCss.includes('body.modal-open'), 'owner.css must style body.modal-open');
    assert(ownerCss.includes('z-index: 99999 !important'), 'owner.css must enforce high z-index for modals');
    assert(ownerCss.includes('overflow-y: auto !important'), 'owner.css must permit backdrop vertical scrolling');
    assert(ownerCss.includes('align-items: flex-start !important'), 'owner.css must align modals to top on mobile to prevent clipping');
    pass('Modal popups visibility, scroll locks, mobile top alignment, and authFetch engine verified');

    // 12. Test Traffic Controller /api/debug & /api/health (Hostinger VPS Specification)
    const debugRes = await request('GET', '/api/debug');
    assert.strictEqual(debugRes.statusCode, 200, '/api/debug must return 200 OK');
    assert(debugRes.json, '/api/debug must return valid JSON');
    assert.strictEqual(debugRes.json.status, 'healthy', 'Status must be healthy');
    assert.strictEqual(debugRes.json.architecture, 'monolithic', 'Architecture must be monolithic');
    assert.strictEqual(debugRes.json.database.status, 'connected', 'Database must report connected');
    assert(typeof debugRes.json.distinctUsers === 'number', 'distinctUsers must be a number');
    assert(typeof debugRes.json.totalVisitors === 'number', 'totalVisitors must be a number');
    assert(debugRes.json.stats && typeof debugRes.json.stats.totalRequisitions === 'number', 'stats.totalRequisitions must be present');

    const healthRes = await request('GET', '/api/health');
    assert.strictEqual(healthRes.statusCode, 200, '/api/health must return 200 OK');
    assert.strictEqual(healthRes.json.status, 'healthy', 'Health check must report healthy');
    pass('Traffic Controller /api/debug & /api/health endpoints operational and compliant');

    // 13. Test Route Aliases & Direct File Protection
    const ownerRouteRes = await request('GET', '/owner');
    assert.strictEqual(ownerRouteRes.statusCode, 200, '/owner must serve owner.html directly');
    assert(ownerRouteRes.body.includes('PMI'), '/owner body must contain PMI portal markup');

    const mediaRouteRes = await request('GET', '/media-request');
    assert.strictEqual(mediaRouteRes.statusCode, 200, '/media-request must serve media-request.html directly');
    assert(mediaRouteRes.body.includes('PMI'), '/media-request body must contain PMI portal markup');

    const envRes = await request('GET', '/.env');
    assert.strictEqual(envRes.statusCode, 403, 'Direct access to /.env must be strictly forbidden (403)');

    const pkgRes = await request('GET', '/package.json');
    assert.strictEqual(pkgRes.statusCode, 403, 'Direct access to /package.json must be strictly forbidden (403)');

    const mdRes = await request('GET', '/README.md');
    assert.strictEqual(mdRes.statusCode, 403, 'Direct access to markdown documentation must be strictly forbidden (403)');
    pass('Route aliases (/owner, /media-request) and security blocked-file protection verified');

  } catch (err) {
    fail('Runtime API test error', err);
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
  }

  console.log('\n=====================================================================');
  console.log(`🏁 Test Suite Finished: ${passed}/${passed + failed} Passed, ${failed} Failed`);
  console.log('=====================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
