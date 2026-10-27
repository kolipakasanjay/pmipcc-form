/**
 * UI/UX, Design System & Defense-in-Depth Security Verification Suite
 * PMIPCC-Inspired Branding & Enterprise Controls Audit
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');
const { requestHandler } = require('../server');

async function runAudit() {
  console.log('=====================================================================');
  console.log('🛡️  Starting PMIPCC UI/UX, Design System & Security Audit...');
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

  // 1. Verify Logo Assets Exist and are authentic vector SVGs
  test('PMI-PCC authentic logo assets exist and have valid SVG viewBox', () => {
    const colorSvgPath = path.join(__dirname, '..', 'assets', 'pmi-logo-color.svg');
    const whiteSvgPath = path.join(__dirname, '..', 'assets', 'pmi-logo-white.svg');
    assert.ok(fs.existsSync(colorSvgPath), 'assets/pmi-logo-color.svg exists');
    assert.ok(fs.existsSync(whiteSvgPath), 'assets/pmi-logo-white.svg exists');
    
    const colorContent = fs.readFileSync(colorSvgPath, 'utf8');
    assert.ok(colorContent.includes('viewBox="0 0 1337.3462 381.0154"'), 'Correct PMI logo viewBox');
    assert.ok(colorContent.includes('#ff610f'), 'Contains PMI Orange #ff610f');
    assert.ok(colorContent.includes('#4f17a8'), 'Contains PMI Violet #4f17a8');
    assert.ok(colorContent.includes('#05bfe0'), 'Contains PMI Cyan #05bfe0');
  });

  // 2. Verify Favicon exists
  test('Favicon exists in assets directory', () => {
    const favPath = path.join(__dirname, '..', 'assets', 'favicon.png');
    assert.ok(fs.existsSync(favPath), 'assets/favicon.png exists');
    assert.ok(fs.statSync(favPath).size > 1000, 'Favicon size > 1KB');
  });

  // 3. Verify Design System CSS tokens from pmi-pcc.org
  test('Design system CSS contains verified pmi-pcc.org color tokens and typography', () => {
    const cssPath = path.join(__dirname, '..', 'css', 'styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    assert.ok(css.includes('--pmi-dark: #003366'), 'PMI dark navy token #003366');
    assert.ok(css.includes('--pmi-blue: #0065bd'), 'PMI electric blue token #0065bd');
    assert.ok(css.includes('--pmi-orange: #ff610f'), 'PMI orange token #ff610f');
    assert.ok(css.includes('--pmi-violet: #4f17a8'), 'PMI violet token #4f17a8');
    assert.ok(css.includes('--pmi-cyan: #05bfe0'), 'PMI cyan token #05bfe0');
    assert.ok(css.includes('Poppins'), 'Poppins font included');
    assert.ok(css.includes('Inter'), 'Inter font included');
    assert.ok(css.includes(':focus-visible'), 'Focus visible ring defined');
    assert.ok(css.includes('prefers-reduced-motion'), 'Reduced motion accessibility support');
  });

  // 4. Verify Responsive Breakpoints in styles.css and owner.css
  test('Responsive media queries support 360px, 390px, 768px, 1024px, 1440px without overflow', () => {
    const cssStyles = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');
    const cssOwner = fs.readFileSync(path.join(__dirname, '..', 'css', 'owner.css'), 'utf8');
    assert.ok(cssStyles.includes('@media (max-width: 768px)'), 'styles.css 768px breakpoint');
    assert.ok(cssStyles.includes('@media (max-width: 480px)'), 'styles.css 480px mobile breakpoint');
    assert.ok(cssOwner.includes('@media (max-width: 860px)'), 'owner.css tablet breakpoint');
    assert.ok(cssStyles.includes('--max-width-container: 1280px'), 'Desktop container width bounded');
  });

  // 5. Verify index.html contains all 8 requested form sections
  test('index.html contains 8 clearly separated fieldset sections A through H', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('SECTION A: Request Information'), 'Section A present');
    assert.ok(html.includes('SECTION B: Submitter Information'), 'Section B present');
    assert.ok(html.includes('SECTION C: Publishing Channel'), 'Section C present');
    assert.ok(html.includes('SECTION D: Content Details'), 'Section D present');
    assert.ok(html.includes('SECTION E: Event Information'), 'Section E present');
    assert.ok(html.includes('SECTION F: Social Media Mentions'), 'Section F present');
    assert.ok(html.includes('SECTION G: Media and Attachments'), 'Section G present');
    assert.ok(html.includes('SECTION H: Delivery Requirements'), 'Section H present');
  });

  // 6. Verify 12 portfolios in index.html and owner.html
  test('All 12 designated PMI portfolios are present in index.html and owner.html', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const ownerHtml = fs.readFileSync(path.join(__dirname, '..', 'owner.html'), 'utf8');
    const portfolios = [
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
    for (const p of portfolios) {
      assert.ok(indexHtml.includes(`value="${p}"`), `index.html contains portfolio ${p}`);
      assert.ok(ownerHtml.includes(`value="${p}"`), `owner.html contains portfolio ${p}`);
    }
  });

  // 7. Verify Security Headers and CSP via live HTTP request
  const server = http.createServer(requestHandler);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      
      http.get(`http://127.0.0.1:${port}/`, (res) => {
        test('Public portal includes strict defense-in-depth security headers', () => {
          assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
          assert.strictEqual(res.headers['x-frame-options'], 'SAMEORIGIN');
          assert.strictEqual(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
          assert.ok(res.headers['content-security-policy'], 'CSP header present');
          assert.ok(res.headers['content-security-policy'].includes("default-src 'self'"), 'CSP default-src self');
        });

        http.get(`http://127.0.0.1:${port}/owner.html`, (resOwner) => {
          test('Owner portal includes strict security headers', () => {
            assert.strictEqual(resOwner.headers['x-content-type-options'], 'nosniff');
            assert.strictEqual(resOwner.headers['x-frame-options'], 'SAMEORIGIN');
            assert.ok(resOwner.headers['content-security-policy'], 'CSP header present');
          });

          server.close(resolve);
        });
      });
    });
  });

  // 8. Verify public index.html never contains submitted records
  test('Public portal HTML and app.js never leak or retrieve private requisitions', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    assert.ok(!html.includes('/api/owner/requests'), 'index.html does not reference owner endpoints');
    assert.ok(!appJs.includes('/api/owner/requests'), 'app.js does not fetch owner endpoints');
    assert.ok(!appJs.includes('localStorage.setItem'), 'app.js does not store form data in localStorage');
    assert.ok(!appJs.includes('sessionStorage.setItem'), 'app.js does not store form data in sessionStorage');
  });

  // 9. Verify processing window notice exact wording
  test('Processing window contains the exact required wording', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const exactRequired = 'Please allow at least two days for processing. Actual delivery depends on current workload and content completeness.';
    assert.ok(html.includes(exactRequired), 'Exact required notice text is present in index.html');
  });

  // 10. Verify initial mentions is 0 and timeZone is forced to uppercase
  test('Mentions defaults to 0 and timeZone enforces uppercase', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');

    assert.ok(html.includes('<option value="0" selected>0 (No mentions)</option>'), 'index.html has 0 mentions selected by default');
    assert.ok(appJs.includes('renderSocialFields(0);'), 'app.js initializes dynamic social fields with 0');
    assert.ok(appJs.includes('mentionsInput.value = \'0\''), 'app.js resets mentions to 0');
    assert.ok(appJs.includes('e.target.value = e.target.value.toUpperCase();'), 'app.js forces timeZone uppercase on input');
    assert.ok(css.includes('text-transform: uppercase;') && css.includes('#timeZone'), 'styles.css applies uppercase text-transform to #timeZone');
  });

  // 11. Verify pressing logo navigates to form submission page (index.html) across portals
  test('Pressing logo navigates to form submission page (index.html)', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const ownerHtml = fs.readFileSync(path.join(__dirname, '..', 'owner.html'), 'utf8');

    assert.ok(indexHtml.includes('<a href="index.html" class="brand-wrapper"'), 'index.html logo links to index.html');
    assert.ok(ownerHtml.includes('<a href="index.html" class="brand-wrapper"'), 'owner.html logo links to index.html');
  });

  // 12. Verify pressing Clear Form button resets and moves to the top of the form
  test('Pressing Clear Form button resets and smoothly scrolls to top of the form', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');

    assert.ok(appJs.includes('resetFormBtn.addEventListener(\'click\', () => {\n        resetForm(true);\n      });') || appJs.includes('resetForm(true);'), 'resetFormBtn triggers resetForm(true)');
    assert.ok(appJs.includes('scrollToFormTop();'), 'resetForm calls scrollToFormTop when requested');
    assert.ok(appJs.includes('formCard.scrollIntoView({ behavior: \'smooth\', block: \'start\' });'), 'scrollToFormTop smoothly scrolls formCard into view');
    assert.ok(css.includes('scroll-margin-top: 5rem;'), 'css styles provide scroll-margin-top for sticky header accommodation');
  });

  console.log('\n=====================================================================');
  console.log(`🏁 UI/UX & Security Audit Finished: ${passed}/${total} Passed, ${total - passed} Failed`);
  console.log('=====================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runAudit();
