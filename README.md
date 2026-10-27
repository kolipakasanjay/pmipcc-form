# PMI Portfolio Content Request Management System
## Enterprise Multi-Channel Editorial Requisition & Secure Owner Administration

An enterprise-grade, accessibility-focused, production-ready portfolio content management system inspired by the visual restraint, professional identity, and clarity of the **Project Management Institute (PMI)**.

---

## 📋 Table of Contents
1. [System Architecture & Features](#system-architecture--features)
2. [Prerequisites & Runtime Environment](#prerequisites--runtime-environment)
3. [Quick Start & Running the Server](#quick-start--running-the-server)
4. [Public Submission Portal](#public-submission-portal)
5. [Owner Administration Portal](#owner-administration-portal)
6. [Security Architecture & Defense-in-Depth](#security-architecture--defense-in-depth)
7. [Permanent SQLite Data Layer](#permanent-sqlite-data-layer)
8. [Private File & Attachment Storage](#private-file--attachment-storage)
9. [Excel & CSV Export Specifications](#excel--csv-export-specifications)
10. [Automated Acceptance Testing](#automated-acceptance-testing)
11. [Backup & Disaster Recovery](#backup--disaster-recovery)
12. [Troubleshooting & FAQ](#troubleshooting--faq)

---

## 1. System Architecture & Features

Built with **native Node.js** (zero external npm dependencies required for runtime):
* **Public Requisition Portal (`index.html`)**: Strict confidentiality design. Stakeholders submit multi-channel content requests across all 12 organizational portfolios. Upon submission, only a private reference ID (`REQ-YYYYMMDD-XXXX`) is displayed in an accessible modal dialog. No submitted form data or database records are ever leaked to public clients.
* **Owner Administration Portal (`owner.html`)**: Authenticated executive dashboard for reviewing, filtering, searching, and managing submissions. Includes live metric KPIs, attachment inspection, validated external video links, single deletion, double-confirmed database clearing, and one-click data exports.
* **Backend Security Gateway (`server.js`)**: Native HTTP server enforcing Content Security Policy (CSP), rate limiting, HTTP-only session cookies, anti-CSRF token verification, and magic-byte file signature validation.
* **Data Layer (`database.js`)**: Native Node.js SQLite (`node:sqlite`) using Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) for transactional durability, crash safety, and instant disk persistence.

---

## 2. Prerequisites & Runtime Environment

* **Node.js**: Version **22.0.0** or higher (Tested and certified on **Node.js v24.18.0** on Windows).
* **Operating System**: Windows 10/11, macOS, or Linux.
* **Browser Support**: Chromium-based browsers (Edge, Chrome, Brave), Mozilla Firefox, Apple Safari (Desktop & Mobile).

---

## 3. Quick Start & Running the Server

### Option A — Using the Windows 1-Click Launcher (Recommended for Windows)
Double-click:
```cmd
START_SYSTEM.bat
```
This launcher connects to `database.sqlite`, starts the Node.js server, and automatically initializes Cloudflare tunnel integration for remote/mobile testing.

### Option B — Using Terminal / VS Code Terminal
1. Open your terminal in the project directory:
   ```powershell
   cd "C:\Users\Sanjay\OneDrive\Desktop\New folder\assesment1"
   ```
2. Start the application:
   ```powershell
   npm start
   ```
   *(or run `node server.js`)*

3. Access the portals in your web browser:
   * **Public Submission Portal**: [http://localhost:3000/](http://localhost:3000/)
   * **Owner Administration Portal**: [http://localhost:3000/owner.html](http://localhost:3000/owner.html)

---

## 4. Public Submission Portal

Accessible at `http://localhost:3000/`. Form sections adhere strictly to PMI Pearl City Chapter organizational requirements and are organized into 8 distinct sections:

* **Section A — Request Information**:
  * **Designated Portfolios (Exact 12 Choices)**:
    1. President
    2. Governance Team
    3. Events Team
    4. General Secretary
    5. MARCOM Team
    6. Finance Team
    7. Volunteers Team
    8. Membership
    9. Social Impact
    10. Academia
    11. Corporate Team
    12. Academy
* **Section B — Submitter Information**:
  * Title / Topic (Required requisition headline)
  * Full Name (Required), Role / Designation, Email Address (Validated with RFC 5322), Phone Number.
* **Section C — Publishing Channel**:
  * Accessible radio cards: **Social Media**, **Email**, or **Both**.
* **Section D — Content Details**:
  * **Suggested Headline / Hook**: Attention hook for social media / email copy.
  * **Main Content Copy**: Editorial briefing copy with real-time word counter badge:
    * `< 100 words`: Below Recommended (Guidance: 100–250)
    * `100–250 words`: Optimal Range (PMI Guidance)
    * `> 250 words`: Above Recommended
* **Section E — Event Information**:
  * **Event Name**: Official title of the event.
  * **Event Date**: Native date picker restricting past, today, and tomorrow dates (enforces minimum 2-day advance window; `NA` permitted).
  * **Event Time**: Event schedule window.
  * **Time Zone**: Designator such as IST, UTC, EST.
* **Section F — Social Media Mentions**:
  * **Hashtags**: Recommended hashtags (e.g., `#PMIPCC #ProjectManagement #Leadership`).
  * **@Mentions (Dynamic Dropdown)**: Dropdown selector (0–10 mentions) that dynamically renders indexed paired LinkedIn Profile and Instagram Handle fields.
* **Section G — Media and Attachments**:
  * Drag-and-drop upload zone and standard file picker accepting `PNG, JPG, WEBP, PDF` up to 15MB.
  * Visual file chips with filename, formatted size badge, and clickable remove control.
  * **Public Video Link**: Inline live validation for YouTube, Vimeo, Loom, public Google Drive, and MP4/WebM URLs.
  * **Image Requirement**: Accessible radio cards for **Create Image** or **No Image Needed**.
* **Section H — Delivery Requirements**:
  * **Processing Window Notice**:
    > *“Please allow at least two days for processing. Actual delivery depends on current workload and content completeness.”*
  * **Preferred Delivery Date**: Optional field. If specified, client and server-side validation enforce the 48-hour processing window boundary.
  * **Preferred Delivery Time**: Target delivery hour (default: `09:00`).
  * **Comments & Repost Schedule**: Textarea to specify reposting frequency and preferred recurrence dates.
* **Private Tracking Receipt Dialog**:
  * Displays unique reference ID (`REQ-YYYYMMDD-XXXX`).
  * One-click **Copy Reference ID** button with animated clipboard confirmation.
  * Reassures user that submitted content is securely recorded and confidential.

---

## 5. Owner Administration Portal

Accessible at `http://localhost:3000/owner.html`.

### First-Run Bootstrap Credentials
* **Username**: `admin`
* **Bootstrap Password**: `owner@pmi2026`

> [!IMPORTANT]
> The initial password `owner@pmi2026` is a bootstrap credential. Upon first authentication, the system flags `must_change: 1` and prompts you to establish a secure personal password. Passwords are never stored in plain text; they are hashed with cryptographically unique salts via Node's native `scryptSync`.

### Administrative Capabilities
1. **Authenticated Requisition Listing**: Real-time tabular view with responsive card fallback for mobile viewports (zero horizontal overflow).
2. **Search & Filter Toolbar**: Real-time debounced search across Reference ID, Title, Submitter Name, Email, and Content Copy. Filterable by all 12 portfolios.
3. **Requisition Inspector**: Complete modal review of all submitted fields, contact notes, scheduling timestamps, and social handles.
4. **Secure Attachment Streaming**: Thumbnails and direct download links streamed via authenticated endpoint `/api/owner/attachments/:id`. Direct public access to the storage directory is blocked.
5. **Data Export**:
   * **📥 Download Excel (.xlsx)**: Produces `PMI_Database_Requisitions_YYYY-MM-DD.xlsx` with freeze panes, auto-fitted column widths, and formula injection mitigation.
   * **📄 Download CSV**: Generates RFC 4180 compliant `PMI_Database_Requisitions_YYYY-MM-DD.csv` with UTF-8 BOM (`\uFEFF`) for native Microsoft Excel compatibility.
6. **Destructive Safety Controls**:
   * Single Requisition Deletion with modal confirmation.
   * Clear All Database requires explicit entry of the phrase `PERMANENTLY CLEAR DATABASE` plus owner password re-authentication.

---

## 6. Security Architecture & Defense-in-Depth

* **Content Security Policy (CSP)**: Restricts scripts to trusted origins and version-pinned SheetJS; blocks unauthorized iframes and active content.
* **File Signature Verification**: Inspects magic bytes (PNG `89 50 4E 47`, JPEG `FF D8 FF`, GIF `47 49 46 38`, WEBP `52 49 46 46`, PDF `25 50 44 46`). Rejects executable binaries, PHP, HTML, and SVG active scripts.
* **CSRF Protection**: State-changing requests (`POST`, `DELETE`) require a cryptographically unique `X-CSRF-Token` bound to the active session.
* **Rate Limiting**: Protects against brute-force attacks by locking out client IPs for 15 minutes after 5 failed login attempts.
* **Spreadsheet Formula Injection Mitigation**: Any exported cell value starting with `=`, `+`, `-`, `@`, `\t`, or `\r` is automatically sanitized by prepending a single quote (`'`).
* **Path Traversal Protection**: Static and attachment routing normalizes paths and forbids access to `.env`, `database.sqlite`, `database.js`, or system files.

---

## 7. Permanent SQLite Data Layer

* **Location**: `./database.sqlite`
* **Driver**: Node.js 24 native `node:sqlite` (`DatabaseSync`). Zero third-party npm binary dependencies.
* **Concurrency & Durability**: Configured with `PRAGMA journal_mode = WAL;` (Write-Ahead Logging) and `PRAGMA synchronous = NORMAL;`.
* **Automatic Migrations**: Safe schema initialization checks existing tables and indexes on boot, ensuring all historical records remain intact across restarts.

### Database Tables:
* `content_requests`: Primary requisition store with unique reference IDs and indexed timestamp, portfolio, and delivery columns.
* `request_attachments`: Metadata linking private files in `uploads/` to specific requisitions.
* `owner_auth`: Salted scrypt password hashes and bootstrap state.
* `owner_sessions`: 24-hour expiring session tokens and CSRF keys.
* `audit_log`: System audit trails for administrative operations.

---

## 8. Private File & Attachment Storage

* **Location**: `./uploads/` (Excluded from public web root).
* **Storage Model**: Files are assigned cryptographically random UUID identifiers (e.g., `4c3b88e1-954f-4d92-bf39-38b812f81a70.png`).
* **Streaming**: Files are streamed only through the authenticated endpoint `GET /api/owner/attachments/:id` with strict `Content-Disposition` and verified `Content-Type`.

---

## 9. Excel & CSV Export Specifications

* **Excel File Naming**: `PMI_Database_Requisitions_YYYY-MM-DD.xlsx`
* **CSV File Naming**: `PMI_Database_Requisitions_YYYY-MM-DD.csv`
* **Column Coverage**:
  * Record ID, Submission Date (UTC), Portfolio, Request Title, Submitter Name, Role / Designation, Email Address, Phone Number, Publishing Channel, Suggested Headline, Main Content, Word Count, Key Highlights, Hashtags, @Mentions, LinkedIn IDs, Instagram IDs, Event Name, Event Date, Event Time, Time Zone, Public Video Link, Create Image Flag, Preferred Delivery Date, Status, Attached Files.

---

## 10. Automated Acceptance Testing

A comprehensive automated test suite verifies all system constraints, validations, and security boundaries.

Run the test suite:
```powershell
npm test
```
*(or run `node test/suite.js`)*

### Tested & Verified Scenarios (33/33 Passing):
1. Database preserves existing historical records (verified intact).
2. Public portal confidentiality (unauthorized access to owner APIs blocked with 403).
3. Attachment streaming privacy (unauthenticated file access blocked with 403).
4. Export endpoint protection (unauthenticated CSV export blocked with 403).
5. 12-portfolio constraint enforcement.
6. Required publishing channel validation.
7. Required image requirement selection validation.
8. 48-hour delivery date minimum boundary enforcement when specified.
9. Accepts requisition when main content is omitted or empty (normal optional field).
10. Accepts requisition when preferred delivery date is omitted (normal optional field).
11. Rejects event date when it is today, tomorrow, or yesterday.
12. Accepts event date when it is at least 2 days in the future.
13. Exact invalid video link error messaging.
14. Rejection of restricted Google Drive links (`usp=drive_link` or folders).
15. Valid YouTube, Vimeo, Loom, Drive share links accepted.
16. `/api/validate-video-link` rejects empty or NA video links.
17. `/api/validate-video-link` validates YouTube link successfully.
18. `/api/validate-video-link` rejects restricted Google Drive links.
19. Executable and active script file signature rejection via magic bytes.
20. Valid requisition submission & `REQ-YYYYMMDD-XXXX` receipt generation.
21. Receipt response confidentiality (zero form fields returned in response).
22. Owner login credential verification & incorrect password rejection (401).
23. Salted scrypt authentication with bootstrap credential (`owner@pmi2026`).
24. Active session check returns authenticated status and user details.
25. Authenticated owner credential verification with secondary credential (`PMI2026`).
26. Authenticated requisition listing & attachment metadata linkage.
27. Portfolio filtering across all 12 options.
28. Search query matching across title, submitter, and content.
29. Secure attachment streaming with authenticated headers.
30. RFC 4180 CSV export with UTF-8 BOM.
31. Excel export data sanitization & formula injection mitigation.
32. CSRF token enforcement on record deletion (403 without token).
33. Owner session invalidation upon logout.

---

## 11. Backup & Disaster Recovery

### Manual Hot Backup
To create a safe snapshot of your database while the server is active:
```powershell
Copy-Item database.sqlite -Destination "backups/database_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sqlite"
```

### Full Disaster Recovery
1. Stop the application server (`Ctrl+C`).
2. Restore your target `.sqlite` backup to `database.sqlite`.
3. Restore the `uploads/` folder from your backup repository.
4. Restart the server (`npm start`).

---

## 12. Troubleshooting & FAQ

* **Port 3000 is already in use (`EADDRINUSE`)**:
  Specify an alternate port in your terminal:
  ```powershell
  $env:PORT="3005"; node server.js
  ```
* **Cloudflare Tunnel is showing 502 Bad Gateway**:
  A 502 error occurs when Cloudflare cannot reach `http://localhost:3000`. Ensure `node server.js` is running in your terminal before accessing the trycloudflare URL.
* **Forgot Owner Password**:
  To reset the owner account back to initial bootstrap state, remove the `owner_auth` row in SQLite:
  ```powershell
  node -e "const { db } = require('./database.js'); db.prepare('DELETE FROM owner_auth').run(); console.log('Reset complete. Restart server to re-bootstrap admin / owner@pmi2026.');"
  ```
  Restart the server to re-enable `admin / owner@pmi2026`.

#   p m i p c c - f o r m  
 