/**
 * Media Creation Requisition & Post-Creation Hosting Test Suite
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');
const { requestHandler } = require('../server');
const { db } = require('../database');

async function runTestSuite() {
  console.log('=====================================================================');
  console.log('🧪 Testing Media Creation & Hosting Requirements System...');
  console.log('=====================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    }
  }

  // 1. Verify index.html contains button beside owner login
  test('index.html contains "Image / Video Request" button beside owner login', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('href="media-request.html"'), 'index.html has link to media-request.html');
    assert.ok(html.includes('Image / Video Request'), 'Button label is "Image / Video Request"');
    assert.ok(html.includes('owner.html'), 'Owner portal link is present beside it');
    assert.ok(html.includes('nav-button-media'), 'Styled with nav-button-media class');
  });

  // 2. Verify index.html contains post-submission prompt for image creation
  test('index.html receipt modal contains creative action prompt for image requesters', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('id="receiptImageReqNotice"'), 'receiptImageReqNotice container exists');
    assert.ok(html.includes('id="receiptFillMediaFormBtn"'), 'receiptFillMediaFormBtn button exists');
    assert.ok(html.includes('Please Fill Another Form'), 'Notice mentions filling another form');
  });

  // 3. Verify owner.html contains button beside owner portal navigation
  test('owner.html contains "Image / Video Request" button in header navigation', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'owner.html'), 'utf8');
    assert.ok(html.includes('href="media-request.html"'), 'owner.html has link to media-request.html');
    assert.ok(html.includes('Image / Video Request'), 'Button text present in owner.html');
    assert.ok(html.includes('id="tabMediaReqsBtn"'), 'owner.html has tab for Image & Video Requests');
  });

  // 4. Verify media-request.html form structure and all required fields
  test('media-request.html exists and contains image/video request and hosting details sections', () => {
    const htmlPath = path.join(__dirname, '..', 'media-request.html');
    assert.ok(fs.existsSync(htmlPath), 'media-request.html exists');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Branding & Portfolios
    assert.ok(html.includes('assets/pmi-logo-color.svg'), 'PMI color logo present');
    assert.ok(html.includes('value="MARCOM Team"'), 'PMI Portfolios present in dropdown');

    // Creative Request options (Image, Video, Both)
    assert.ok(html.includes('value="Image Creation"'), 'Image Creation option present');
    assert.ok(html.includes('value="Video Creation"'), 'Video Creation option present');
    assert.ok(html.includes('value="Both"'), 'Both (Image & Video) option present');

    // Brief & Upload
    assert.ok(html.includes('id="projectTitle"'), 'projectTitle input present');
    assert.ok(html.includes('id="headlineText"'), 'headlineText input present');
    assert.ok(html.includes('id="fileDropzone"'), 'File upload dropzone present');

    // Hosting Details Section
    assert.ok(html.includes('Hosting &amp; Deployment Details (Once Created)'), 'Hosting details section present');
    assert.ok(html.includes('name="hostingChannel"'), 'Hosting channels checkboxes present');
    assert.ok(html.includes('id="hostingTargetUrl"'), 'Target hosting URL input present');
    assert.ok(html.includes('id="hostingLiveDate"'), 'Hosting go-live date input present');
    assert.ok(html.includes('id="hostingWorkflow"'), 'Hosting workflow preference dropdown present');
    assert.ok(html.includes('id="mediaReceiptModal"'), 'Creative receipt modal present');
  });

  // 5. Test Live HTTP API endpoints
  const server = http.createServer(requestHandler);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;

      async function postJson(endpoint, data, headers = {}) {
        return new Promise((res, rej) => {
          const bodyStr = JSON.stringify(data);
          const req = http.request(`${baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(bodyStr),
              ...headers
            }
          }, (r) => {
            let resBody = '';
            r.on('data', chunk => resBody += chunk);
            r.on('end', () => {
              try {
                res({ status: r.statusCode, headers: r.headers, body: JSON.parse(resBody) });
              } catch (e) {
                res({ status: r.statusCode, headers: r.headers, body: resBody });
              }
            });
          });
          req.on('error', rej);
          req.write(bodyStr);
          req.end();
        });
      }

      async function getJson(endpoint, headers = {}) {
        return new Promise((res, rej) => {
          const req = http.request(`${baseUrl}${endpoint}`, {
            method: 'GET',
            headers: headers
          }, (r) => {
            let resBody = '';
            r.on('data', chunk => resBody += chunk);
            r.on('end', () => {
              try {
                res({ status: r.statusCode, headers: r.headers, body: JSON.parse(resBody) });
              } catch (e) {
                res({ status: r.statusCode, headers: r.headers, body: resBody });
              }
            });
          });
          req.on('error', rej);
          req.end();
        });
      }

      async function patchJson(endpoint, data, headers = {}) {
        return new Promise((res, rej) => {
          const bodyStr = JSON.stringify(data);
          const req = http.request(`${baseUrl}${endpoint}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(bodyStr),
              ...headers
            }
          }, (r) => {
            let resBody = '';
            r.on('data', chunk => resBody += chunk);
            r.on('end', () => {
              try {
                res({ status: r.statusCode, headers: r.headers, body: JSON.parse(resBody) });
              } catch (e) {
                res({ status: r.statusCode, headers: r.headers, body: resBody });
              }
            });
          });
          req.on('error', rej);
          req.write(bodyStr);
          req.end();
        });
      }

      // Test 5: Submit Content Request with Create Image
      let initialRefId = '';
      try {
        const contentRes = await postJson('/api/requests', {
          portfolio: 'MARCOM Team',
          requestTitle: 'Brand Awareness Campaign 2026',
          submitterName: 'Ravi Kumar',
          submitterRole: 'Creative Director',
          submitterEmail: 'ravi.marcom@pmi-pcc.org',
          submitterPhone: '+91 99887 76655',
          publishingChannel: 'Both',
          imageRequirement: 'Create Image',
          mainContent: 'Detailed campaign brief for Chapter social media and email announcements.'
        });

        test('POST /api/requests accepts requisition requiring image creation', () => {
          assert.strictEqual(contentRes.status, 201);
          assert.strictEqual(contentRes.body.success, true);
          assert.ok(contentRes.body.referenceId.startsWith('REQ-'));
          initialRefId = contentRes.body.referenceId;
        });
      } catch (e) {
        console.error('FAIL in POST /api/requests:', e);
      }

      // Test 6: Submit Media Request with Image creation and hosting details
      let mediaRefId = '';
      try {
        // 1x1 10-byte PNG sample dataUrl
        const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const mediaRes = await postJson('/api/media-requests', {
          contentReqId: initialRefId,
          portfolio: 'MARCOM Team',
          submitterName: 'Ravi Kumar',
          submitterRole: 'Creative Director',
          submitterEmail: 'ravi.marcom@pmi-pcc.org',
          submitterPhone: '+91 99887 76655',
          requestType: 'Image Creation',
          assetCategory: 'Event Announcement',
          dimensions: 'Square (1:1)',
          projectTitle: 'Brand Awareness Banner Design',
          headlineText: 'Lead with Impact: PMI Hyderabad 2026',
          supportingText: 'Join us on 15th Nov at HICC. Registration open.',
          designGuidance: 'PMI Blue background with vibrant orange accents.',
          hostingChannels: ['Official Website', 'LinkedIn', 'Instagram'],
          hostingTargetUrl: 'https://pmi-pcc.org/events/brand-2026',
          hostingLiveDate: '2026-11-10',
          hostingNotes: 'Embed in hero section with CTA button linking to registration.',
          hostingWorkflow: 'Publish Automatically',
          mediaFiles: [
            {
              name: 'speaker_logo.png',
              dataUrl: `data:image/png;base64,${pngBase64}`
            }
          ]
        });

        test('POST /api/media-requests creates image creation requisition with hosting details', () => {
          assert.strictEqual(mediaRes.status, 201);
          assert.strictEqual(mediaRes.body.success, true);
          assert.ok(mediaRes.body.referenceId.startsWith('MED-'));
          mediaRefId = mediaRes.body.referenceId;
        });
      } catch (e) {
        console.error('FAIL in POST /api/media-requests:', e);
      }

      // Test 7: Post-creation hosting details update endpoint
      try {
        const hostingRes = await postJson(`/api/media-requests/${mediaRefId}/hosting-details`, {
          hostingChannels: ['Official Website', 'LinkedIn', 'Instagram', 'YouTube'],
          hostingTargetUrl: 'https://pmi-pcc.org/events/brand-2026-final',
          hostingLiveDate: '2026-11-12',
          hostingNotes: 'Verified with Chapter Webmaster. Alt text: PMI PCC Leadership Summit 2026.'
        });

        test('POST /api/media-requests/:id/hosting-details updates hosting specifications once asset is ready', () => {
          assert.strictEqual(hostingRes.status, 200);
          assert.strictEqual(hostingRes.body.success, true);
        });
      } catch (e) {
        console.error('FAIL in hosting-details update:', e);
      }

      // Test 8: Owner Authentication & Media Requests Management
      try {
        const loginRes = await postJson('/api/owner/login', {
          username: 'admin',
          password: 'owner@pmi2026'
        });

        assert.strictEqual(loginRes.status, 200);
        const ownerSessionToken = loginRes.body.token;
        const ownerCsrfToken = loginRes.body.csrfToken;

        // List media requests
        const listRes = await getJson('/api/owner/media-requests', {
          'Authorization': `Bearer ${ownerSessionToken}`
        });

        test('GET /api/owner/media-requests retrieves creative requisitions with hosting status', () => {
          assert.strictEqual(listRes.status, 200);
          assert.strictEqual(listRes.body.success, true);
          assert.ok(listRes.body.requests.length >= 1);
          const item = listRes.body.requests.find(r => r.id === mediaRefId);
          assert.ok(item, 'Submitted media request is found in owner listing');
          assert.strictEqual(item.submitterName, 'Ravi Kumar');
          assert.strictEqual(item.requestType, 'Image Creation');
          assert.ok(item.hostingChannels.includes('Official Website'));
          assert.strictEqual(item.attachments.length, 1);
        });

        // Inspect single media request
        const getOneRes = await getJson(`/api/owner/media-requests/${mediaRefId}`, {
          'Authorization': `Bearer ${ownerSessionToken}`
        });

        test('GET /api/owner/media-requests/:id returns complete creative brief and hosting details', () => {
          assert.strictEqual(getOneRes.status, 200);
          const req = getOneRes.body.request;
          assert.strictEqual(req.id, mediaRefId);
          assert.strictEqual(req.headlineText, 'Lead with Impact: PMI Hyderabad 2026');
          assert.strictEqual(req.hostingTargetUrl, 'https://pmi-pcc.org/events/brand-2026-final');
        });

        // Update status: Asset Created -> Requesting Hosting Confirmation
        const statusRes = await patchJson(`/api/owner/media-requests/${mediaRefId}/status`, {
          status: 'Image Created',
          hostingStatus: 'Hosting Details Requested'
        }, {
          'Authorization': `Bearer ${ownerSessionToken}`
        });

        test('PATCH /api/owner/media-requests/:id/status marks asset as Image Created & requests hosting confirmation', () => {
          assert.strictEqual(statusRes.status, 200);
          assert.strictEqual(statusRes.body.success, true);
        });

        // Test 9: Direct Hosting Only Request Submission (When image is not needed)
        const directHostingRes = await postJson('/api/media-requests', {
          contentReqId: 'REQ-20261030-NOMG',
          portfolio: 'Events Team',
          submitterName: 'Priya Sharma',
          submitterRole: 'Program Manager',
          submitterEmail: 'priya.events@pmi-pcc.org',
          submitterPhone: '+91 91234 56789',
          requestType: 'Hosting Only (No Image Creation)',
          assetCategory: 'Direct Hosting / Publishing',
          projectTitle: 'PMI Annual Symposium Hosting',
          headlineText: 'NA',
          hostingChannels: ['Official Website', 'LinkedIn', 'Event Platform'],
          hostingTargetUrl: 'https://pmi-pcc.org/events/symposium-2026',
          hostingLiveDate: '2026-11-20',
          hostingWorkflow: 'Publish Automatically',
          hostingNotes: 'Please publish directly to website and event calendar.'
        });

        test('POST /api/media-requests accepts direct hosting requisition with status "Approved / Hosting Ready"', () => {
          assert.strictEqual(directHostingRes.status, 201);
          assert.strictEqual(directHostingRes.body.success, true);
          assert.ok(directHostingRes.body.referenceId.startsWith('MED-'));

          const rec = db.prepare('SELECT request_type, status, hosting_status FROM media_requests WHERE id = ?').get(directHostingRes.body.referenceId);
          assert.strictEqual(rec.request_type, 'Hosting Only (No Image Creation)');
          assert.strictEqual(rec.status, 'Approved / Hosting Ready');
          assert.strictEqual(rec.hosting_status, 'Hosting Details Provided');
        });

      } catch (e) {
        console.error('FAIL in Owner Media workflow:', e);
      }

      // Test 10: Client redirection architecture in index.html & js/app.js
      test('index.html & js/app.js direct submitters not needing image creation to hosting details', () => {
        const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
        const appJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

        assert.ok(indexHtml.includes('id="receiptHostingReqNotice"'), 'index.html has receiptHostingReqNotice');
        assert.ok(indexHtml.includes('id="receiptFillHostingFormBtn"'), 'index.html has receiptFillHostingFormBtn');
        assert.ok(indexHtml.includes('id="hostingRedirectCountdown"'), 'index.html has countdown display');

        assert.ok(appJs.includes('mode=hosting') || appJs.includes("'mode', 'hosting'"), 'app.js builds hosting URL with mode=hosting');
        assert.ok(appJs.includes('#section-hosting') || appJs.includes("'section-hosting'"), 'app.js sets hash to section-hosting');
        assert.ok(appJs.includes('needsImageCreated'), 'app.js determines if submitter needs image created');
      });

      // Test 11: media-request.html structure for direct hosting mode
      test('media-request.html supports direct hosting mode with section-hosting and bypass notices', () => {
        const mediaHtml = fs.readFileSync(path.join(__dirname, '..', 'media-request.html'), 'utf8');
        const mediaJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'media-request.js'), 'utf8');

        assert.ok(mediaHtml.includes('id="section-hosting"'), 'media-request.html contains id="section-hosting"');
        assert.ok(mediaHtml.includes('id="hostingModeBanner"'), 'media-request.html contains id="hostingModeBanner"');
        assert.ok(mediaHtml.includes('id="hostingBypassNotice"'), 'media-request.html contains id="hostingBypassNotice"');
        assert.ok(mediaHtml.includes('id="toggleCreativeSectionsBtn"'), 'media-request.html contains toggle button');

        assert.ok(mediaJs.includes('activateHostingMode'), 'media-request.js implements activateHostingMode');
        assert.ok(mediaJs.includes('sectionHosting.scrollIntoView'), 'media-request.js automatically scrolls to section-hosting');
        assert.ok(mediaJs.includes('Hosting Only (No Image Creation)'), 'media-request.js sets requestType to Hosting Only');
      });

      // Test 12: owner.html & owner.js prevent auto-scroll down on open
      test('owner.html and owner.js prevent page moving down automatically on open', () => {
        const ownerHtml = fs.readFileSync(path.join(__dirname, '..', 'owner.html'), 'utf8');
        const ownerJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'owner.js'), 'utf8');

        assert.ok(ownerHtml.includes('scroll-behavior: auto !important'), 'owner.html overrides scroll-behavior to auto');
        assert.ok(ownerJs.includes("scrollRestoration = 'manual'"), 'owner.js sets scrollRestoration to manual');
        assert.ok(ownerJs.includes('anchorToTop'), 'owner.js implements anchorToTop to keep viewport at top 0');
        assert.ok(!ownerJs.includes('ownerPasswordInput.focus()'), 'owner.js does NOT autofocus password input on load');
      });

      // Test 13: Section B creative request specification mobile adjustability & down-by-down layout
      test('media-request.html Section B radio buttons are stacked down by down and responsive without text cut-off', () => {
        const mediaHtml = fs.readFileSync(path.join(__dirname, '..', 'media-request.html'), 'utf8');
        const stylesCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');

        assert.ok(!mediaHtml.includes('grid-template-columns: repeat(3, 1fr)'), 'No hardcoded 3-column inline style');
        assert.ok(mediaHtml.includes('radio-group-stacked'), 'Radio group has radio-group-stacked class');
        assert.ok(stylesCss.includes('.radio-group-stacked'), 'styles.css defines .radio-group-stacked');
        assert.ok(stylesCss.includes('flex-direction: column'), 'styles.css specifies down-by-down vertical column layout');
      });

      server.close(resolve);
    });
  });

  console.log('\n=====================================================================');
  console.log(`🏁 Test Suite Finished: ${passed}/${total} Passed, ${total - passed} Failed`);
  console.log('=====================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

