/**
 * PMI Portfolio Content Request Management System
 * Owner Administration Dashboard Engine
 * 
 * Features:
 * - Enterprise authenticated session management & CSRF protection
 * - Salted password authentication with first-run bootstrap change prompt
 * - Server-side search, filtering by 12 portfolios, and pagination
 * - Detailed Requisition inspection with authenticated attachment streaming
 * - Dual responsive view: Full data table on desktop, touch cards on mobile
 * - Authenticated Excel (.xlsx) export with SheetJS and formula injection mitigation
 * - Authenticated CSV export with UTF-8 BOM
 * - Safe destructive actions with modal confirmation & password re-auth
 */

(function () {
  'use strict';

  // State
  let csrfToken = null;
  let currentUser = null;
  let mustChangePassword = false;
  let currentPage = 1;
  const pageLimit = 25;
  let currentTotalRecords = 0;
  let searchDebounceTimer = null;
  let deleteTargetId = null;

  // DOM Elements - Auth Screen
  const authCard = document.getElementById('authCard');
  const instantLoginBtn = document.getElementById('instantLoginBtn');
  const ownerLoginForm = document.getElementById('ownerLoginForm');
  const ownerUsernameInput = document.getElementById('ownerUsernameInput');
  const ownerPasswordInput = document.getElementById('ownerPasswordInput');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const submitLoginBtn = document.getElementById('submitLoginBtn');
  const loginAlertBox = document.getElementById('loginAlertBox');

  // DOM Elements - Dashboard
  const dashboardContainer = document.getElementById('dashboardContainer');
  const changePasswordNavBtn = document.getElementById('changePasswordNavBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  // Metrics
  const kpiTotal = document.getElementById('kpiTotal');
  const kpiPortfolios = document.getElementById('kpiPortfolios');
  const kpiPending = document.getElementById('kpiPending');

  // Toolbar & Search
  const tableSearchInput = document.getElementById('tableSearchInput');
  const filterPortfolio = document.getElementById('filterPortfolio');
  const refreshBtn = document.getElementById('refreshBtn');
  const downloadExcelBtn = document.getElementById('downloadExcelBtn');
  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  const clearDatabaseBtn = document.getElementById('clearDatabaseBtn');
  const activeFiltersRow = document.getElementById('activeFiltersRow');
  const activeFilterText = document.getElementById('activeFilterText');
  const clearFilterBtn = document.getElementById('clearFilterBtn');

  // Table & Cards
  const requestsTableBody = document.getElementById('requestsTableBody');
  const mobileCardsList = document.getElementById('mobileCardsList');
  const emptyStateBox = document.getElementById('emptyStateBox');
  const recordsCountDisplay = document.getElementById('recordsCountDisplay');

  // Pagination
  const paginationBar = document.getElementById('paginationBar');
  const pageInfoText = document.getElementById('pageInfoText');
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');

  // Modals
  const inspectModal = document.getElementById('inspectModal');
  const modalRecordId = document.getElementById('modalRecordId');
  const inspectModalBody = document.getElementById('inspectModalBody');
  const closeInspectModalBtn = document.getElementById('closeInspectModalBtn');
  const closeInspectModalFooterBtn = document.getElementById('closeInspectModalFooterBtn');

  const deleteSingleModal = document.getElementById('deleteSingleModal');
  const deleteTargetIdDisplay = document.getElementById('deleteTargetIdDisplay');
  const cancelDeleteSingleBtn = document.getElementById('cancelDeleteSingleBtn');
  const confirmDeleteSingleBtn = document.getElementById('confirmDeleteSingleBtn');

  const clearDatabaseModal = document.getElementById('clearDatabaseModal');
  const clearConfirmPhrase = document.getElementById('clearConfirmPhrase');
  const clearPasswordConfirm = document.getElementById('clearPasswordConfirm');
  const cancelClearDbBtn = document.getElementById('cancelClearDbBtn');
  const confirmClearDbBtn = document.getElementById('confirmClearDbBtn');

  const changePasswordModal = document.getElementById('changePasswordModal');
  const changePasswordForm = document.getElementById('changePasswordForm');
  const currentPassInput = document.getElementById('currentPassInput');
  const newPassInput = document.getElementById('newPassInput');
  const confirmPassInput = document.getElementById('confirmPassInput');
  const cancelChangePassBtn = document.getElementById('cancelChangePassBtn');

  const toastContainer = document.getElementById('toastContainer');

  // =========================================================================
  // INITIALIZATION & SESSION CHECK
  // =========================================================================
  function init() {
    bindEvents();
    // Do NOT directly log in or bypass the authentication screen on page load or refresh.
    // Explicit user requirement: "it should login when we press the button only"
    showAuthScreen();
  }

  function showAuthScreen() {
    authCard.style.display = 'block';
    dashboardContainer.style.display = 'none';
    changePasswordNavBtn.style.display = 'none';
    logoutBtn.style.display = 'none';
    if (ownerPasswordInput) ownerPasswordInput.value = '';
    setTimeout(() => {
      if (ownerPasswordInput) ownerPasswordInput.focus();
    }, 50);
  }

  function showDashboard() {
    authCard.style.display = 'none';
    dashboardContainer.style.display = 'flex';
    changePasswordNavBtn.style.display = 'inline-flex';
    logoutBtn.style.display = 'inline-flex';
  }

  // =========================================================================
  // EVENT BINDINGS
  // =========================================================================
  function bindEvents() {
    // Password visibility toggle
    if (togglePasswordBtn && ownerPasswordInput) {
      togglePasswordBtn.addEventListener('click', () => {
        const isPass = ownerPasswordInput.type === 'password';
        ownerPasswordInput.type = isPass ? 'text' : 'password';
        togglePasswordBtn.textContent = isPass ? 'Hide Password' : 'Show Password';
      });
    }

    // 1-Click Instant Login Button
    if (instantLoginBtn) {
      instantLoginBtn.addEventListener('click', handleInstantLogin);
    }

    // Login Form Submit
    if (ownerLoginForm) {
      ownerLoginForm.addEventListener('submit', handleLoginSubmit);
    }

    // Logout
    if (logoutBtn) {
      logoutBtn.addEventListener('click', handleLogout);
    }

    // Change Password Nav Button & Form
    if (changePasswordNavBtn) {
      changePasswordNavBtn.addEventListener('click', openChangePasswordModal);
    }

    if (cancelChangePassBtn) {
      cancelChangePassBtn.addEventListener('click', closeChangePasswordModal);
    }

    if (changePasswordForm) {
      changePasswordForm.addEventListener('submit', handleChangePasswordSubmit);
    }

    // Search input with debounce (300ms)
    if (tableSearchInput) {
      tableSearchInput.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          currentPage = 1;
          loadRequests(1);
        }, 300);
      });
    }

    // Portfolio filter
    if (filterPortfolio) {
      filterPortfolio.addEventListener('change', () => {
        currentPage = 1;
        updateActiveFilterBadge();
        loadRequests(1);
      });
    }

    if (clearFilterBtn) {
      clearFilterBtn.addEventListener('click', () => {
        filterPortfolio.value = '';
        updateActiveFilterBadge();
        loadRequests(1);
      });
    }

    // Refresh button
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        loadRequests(currentPage);
        showToast('Requisition database reloaded.', 'info');
      });
    }

    // Export Buttons
    if (downloadExcelBtn) {
      downloadExcelBtn.addEventListener('click', handleExcelExport);
    }

    if (downloadCsvBtn) {
      downloadCsvBtn.addEventListener('click', handleCsvExport);
    }

    // Clear Database Buttons & Modal
    if (clearDatabaseBtn) {
      clearDatabaseBtn.addEventListener('click', openClearDatabaseModal);
    }

    if (cancelClearDbBtn) {
      cancelClearDbBtn.addEventListener('click', closeClearDatabaseModal);
    }

    if (confirmClearDbBtn) {
      confirmClearDbBtn.addEventListener('click', handleClearDatabaseSubmit);
    }

    // Single Delete Modal
    if (cancelDeleteSingleBtn) {
      cancelDeleteSingleBtn.addEventListener('click', closeDeleteSingleModal);
    }

    if (confirmDeleteSingleBtn) {
      confirmDeleteSingleBtn.addEventListener('click', handleDeleteSingleSubmit);
    }

    // Inspection Modal Close
    if (closeInspectModalBtn) {
      closeInspectModalBtn.addEventListener('click', closeInspectModal);
    }

    if (closeInspectModalFooterBtn) {
      closeInspectModalFooterBtn.addEventListener('click', closeInspectModal);
    }

    // Pagination
    if (prevPageBtn) {
      prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          loadRequests(currentPage - 1);
        }
      });
    }

    if (nextPageBtn) {
      nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(currentTotalRecords / pageLimit);
        if (currentPage < totalPages) {
          loadRequests(currentPage + 1);
        }
      });
    }

    // Backdrop Click for all modals
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', e => {
        if (e.target === backdrop) {
          backdrop.classList.remove('is-open');
        }
      });
    });
  }

  // =========================================================================
  // AUTHENTICATION LOGIC
  // =========================================================================
  async function handleInstantLogin() {
    hideLoginAlert();
    if (instantLoginBtn) {
      instantLoginBtn.disabled = true;
      instantLoginBtn.innerHTML = '<span>Verifying credentials...</span>';
    }

    try {
      // 1. Check if session is already active
      const sessionCheck = await fetch('/api/owner/session').catch(() => null);
      if (sessionCheck && sessionCheck.ok) {
        const sessionData = await sessionCheck.json().catch(() => ({}));
        if (sessionData && sessionData.authenticated) {
          csrfToken = sessionData.csrfToken;
          currentUser = sessionData.username || 'admin';
          mustChangePassword = sessionData.mustChangePassword;
          showDashboard();
          loadRequests(1);
          showToast(`Welcome! Owner access verified as ${currentUser}.`, 'success');
          return;
        }
      }

      // 2. Authenticate with owner@pmi2026 bootstrap credential
      let res = await fetch('/api/owner/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'owner@pmi2026' })
      });
      let data = await res.json().catch(() => ({}));

      // 3. Fallback to PMI2026
      if (!res.ok || !data.success) {
        res = await fetch('/api/owner/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'admin', password: 'PMI2026' })
        });
        data = await res.json().catch(() => ({}));
      }

      if (res.ok && data.success) {
        csrfToken = data.csrfToken;
        currentUser = data.username;
        mustChangePassword = data.mustChangePassword;
        showDashboard();
        loadRequests(1);
        showToast(`Instant Owner Access granted as ${currentUser}.`, 'success');
        if (mustChangePassword) {
          openChangePasswordModal();
        }
      } else {
        showLoginAlert(data.error || 'Instant login failed. Please enter your credentials below and click Sign In.', 'danger');
      }
    } catch (e) {
      showLoginAlert('Network error during instant authentication.', 'danger');
    } finally {
      if (instantLoginBtn) {
        instantLoginBtn.disabled = false;
        instantLoginBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          <span>1-Click Instant Owner Login</span>
        `;
      }
    }
  }

  async function handleLoginSubmit(e) {
    e.preventDefault();
    const username = ownerUsernameInput.value.trim() || 'admin';
    const password = ownerPasswordInput.value.trim();

    if (!password) {
      showLoginAlert('Please enter your owner password.', 'danger');
      return;
    }

    submitLoginBtn.disabled = true;
    submitLoginBtn.innerHTML = '<span>Verifying credentials...</span>';
    hideLoginAlert();

    try {
      const response = await fetch('/api/owner/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        csrfToken = data.csrfToken;
        currentUser = data.username;
        mustChangePassword = data.mustChangePassword;
        showDashboard();
        loadRequests(1);
        showToast(`Welcome! Owner access verified as ${currentUser}.`, 'success');

        if (mustChangePassword) {
          openChangePasswordModal();
        }
      } else {
        showLoginAlert(data.error || 'Invalid credentials. Please verify your credentials and try again.', 'danger');
      }
    } catch (netErr) {
      showLoginAlert('Network error connecting to authentication service.', 'danger');
    } finally {
      submitLoginBtn.disabled = false;
      submitLoginBtn.innerHTML = '<span>Sign In to Access Requisition Details</span>';
    }
  }

  function showLoginAlert(msg, type) {
    if (!loginAlertBox) return;
    loginAlertBox.style.display = 'block';
    loginAlertBox.textContent = msg;
    if (type === 'danger') {
      loginAlertBox.style.backgroundColor = 'var(--color-danger-bg)';
      loginAlertBox.style.color = 'var(--color-danger)';
      loginAlertBox.style.border = '1px solid var(--color-danger-border)';
    }
  }

  function hideLoginAlert() {
    if (loginAlertBox) loginAlertBox.style.display = 'none';
  }

  async function handleLogout() {
    try {
      await fetch('/api/owner/logout', { method: 'POST' });
    } catch (e) {}
    csrfToken = null;
    currentUser = null;
    showAuthScreen();
    showToast('Logged out of owner administration portal.', 'info');
  }

  // =========================================================================
  // CHANGE PASSWORD LOGIC
  // =========================================================================
  function openChangePasswordModal() {
    if (!changePasswordModal) return;
    currentPassInput.value = '';
    newPassInput.value = '';
    confirmPassInput.value = '';
    changePasswordModal.classList.add('is-open');
    currentPassInput.focus();
  }

  function closeChangePasswordModal() {
    if (!changePasswordModal) return;
    changePasswordModal.classList.remove('is-open');
  }

  async function handleChangePasswordSubmit(e) {
    e.preventDefault();
    const currentPassword = currentPassInput.value.trim();
    const newPassword = newPassInput.value.trim();
    const confirmPassword = confirmPassInput.value.trim();

    if (!newPassword || newPassword.length < 8) {
      showToast('New password must be at least 8 characters long.', 'danger');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('New password confirmation does not match.', 'danger');
      return;
    }

    try {
      const response = await fetch('/api/owner/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken || ''
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        closeChangePasswordModal();
        mustChangePassword = false;
        showToast('Owner password updated securely.', 'success');
      } else {
        showToast(data.error || 'Failed to update owner password.', 'danger');
      }
    } catch (err) {
      showToast('Network error while updating password.', 'danger');
    }
  }

  // =========================================================================
  // REQUISITIONS DATA LOADING & RENDERING
  // =========================================================================
  async function loadRequests(page = 1) {
    currentPage = page;
    const search = tableSearchInput ? tableSearchInput.value.trim() : '';
    const portfolio = filterPortfolio ? filterPortfolio.value : '';

    const params = new URLSearchParams({
      page: currentPage,
      limit: pageLimit,
      search: search,
      portfolio: portfolio,
      sort: 'created_at',
      order: 'desc'
    });

    try {
      const response = await fetch(`/api/owner/requests?${params.toString()}`);
      if (response.status === 401 || response.status === 403) {
        showAuthScreen();
        return;
      }

      const data = await response.json();
      if (data.success) {
        currentTotalRecords = data.total;
        renderTableAndCards(data.requests);
        updatePagination(data.total);
        updateKPIs(data.requests, data.total);
      }
    } catch (err) {
      console.error('Error loading requisitions:', err);
    }
  }

  function updateKPIs(requests, total) {
    if (kpiTotal) kpiTotal.textContent = total;

    // Portfolios represented
    const uniquePortfolios = new Set((requests || []).map(r => r.portfolio).filter(Boolean));
    if (kpiPortfolios) kpiPortfolios.textContent = uniquePortfolios.size;

    // Pending Review
    const pendingCount = (requests || []).filter(r => (r.status || 'Pending Review') === 'Pending Review').length;
    if (kpiPending) kpiPending.textContent = pendingCount;
  }

  function updateActiveFilterBadge() {
    if (!filterPortfolio || !activeFiltersRow || !activeFilterText) return;
    const val = filterPortfolio.value;
    if (val) {
      activeFiltersRow.style.display = 'flex';
      activeFilterText.textContent = `Portfolio: ${val}`;
    } else {
      activeFiltersRow.style.display = 'none';
    }
  }

  function updatePagination(total) {
    const totalPages = Math.max(1, Math.ceil(total / pageLimit));
    if (pageInfoText) pageInfoText.textContent = `Page ${currentPage} of ${totalPages} (${total} total)`;
    if (recordsCountDisplay) recordsCountDisplay.textContent = `Showing ${Math.min(total, (currentPage - 1) * pageLimit + 1)}–${Math.min(total, currentPage * pageLimit)} of ${total} records`;

    if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages;
    if (paginationBar) paginationBar.style.display = total > 0 ? 'flex' : 'none';
  }

  /**
   * Render both Desktop Table Rows and Mobile Touch Cards
   */
  function renderTableAndCards(requests) {
    if (!requestsTableBody || !mobileCardsList) return;

    requestsTableBody.innerHTML = '';
    mobileCardsList.innerHTML = '';

    if (!requests || requests.length === 0) {
      if (emptyStateBox) emptyStateBox.style.display = 'block';
      return;
    }

    if (emptyStateBox) emptyStateBox.style.display = 'none';

    requests.forEach(r => {
      // 1. Desktop Table Row
      const tr = document.createElement('tr');

      const attCount = (r.attachments && r.attachments.length) || (r.mediaFiles && r.mediaFiles.length) || 0;
      const formattedDate = formatDateTime(r.createdAt);

      tr.innerHTML = `
        <td><span class="table-code-badge">${escapeHtml(r.id)}</span></td>
        <td style="white-space: nowrap; font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(formattedDate)}</td>
        <td><span class="portfolio-badge">${escapeHtml(r.portfolio)}</span></td>
        <td style="font-weight: 600; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(r.requestTitle)}">
          ${escapeHtml(r.requestTitle)}
        </td>
        <td style="font-size: 0.85rem;">
          <div style="font-weight: 600;">${escapeHtml(r.submitterName)}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(r.submitterEmail)}</div>
        </td>
        <td><span style="font-size: 0.8rem; font-weight: 500;">${escapeHtml(r.publishingChannel)}</span></td>
        <td style="white-space: nowrap; font-size: 0.825rem; font-weight: 600;">
          ${escapeHtml(r.deliveryDate)}
          ${r.deliveryTime ? `<div style="font-size: 0.725rem; font-weight: 400; color: var(--text-muted);">${escapeHtml(r.deliveryTime)}</div>` : ''}
        </td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">
          ${attCount > 0 ? `<span style="font-weight: 700; color: var(--pmi-blue-primary);">📎 ${attCount} file(s)</span>` : '<span style="color: #94A3B8;">None</span>'}
        </td>
        <td>
          <div class="table-actions">
            <button type="button" class="action-btn-sm view-btn" data-id="${escapeHtml(r.id)}">
              <span>Inspect</span>
            </button>
            <button type="button" class="action-btn-sm delete delete-btn" data-id="${escapeHtml(r.id)}" title="Delete Requisition">
              <span>Delete</span>
            </button>
          </div>
        </td>
      `;

      // Bind actions
      tr.querySelector('.view-btn').addEventListener('click', () => viewRequestDetails(r.id));
      tr.querySelector('.delete-btn').addEventListener('click', () => openDeleteSingleModal(r.id));
      requestsTableBody.appendChild(tr);

      // 2. Mobile Touch Card
      const card = document.createElement('div');
      card.className = 'req-mobile-card';
      card.innerHTML = `
        <div class="req-mobile-header">
          <span class="table-code-badge">${escapeHtml(r.id)}</span>
          <span class="portfolio-badge">${escapeHtml(r.portfolio)}</span>
        </div>
        <div class="req-mobile-title">${escapeHtml(r.requestTitle)}</div>
        <div class="req-mobile-meta">
          <div><strong>Submitter:</strong> ${escapeHtml(r.submitterName)} (${escapeHtml(r.submitterEmail)})</div>
          <div><strong>Delivery:</strong> ${escapeHtml(r.deliveryDate)} ${r.deliveryTime ? `(${escapeHtml(r.deliveryTime)})` : ''} &bull; <strong>Channel:</strong> ${escapeHtml(r.publishingChannel)}</div>
          <div><strong>Image:</strong> ${escapeHtml(r.imageRequirement || (r.noMediaCheckbox ? 'Create Image' : 'No Image Needed'))} &bull; <strong>Files:</strong> ${attCount}</div>
        </div>
        <div class="req-mobile-actions">
          <button type="button" class="btn btn-secondary btn-sm mobile-view-btn" style="flex: 1; padding: 0.5rem;" data-id="${escapeHtml(r.id)}">
            <span>Inspect Details</span>
          </button>
          <button type="button" class="btn btn-secondary btn-sm mobile-del-btn" style="color: var(--color-danger); border-color: var(--color-danger-border); padding: 0.5rem;" data-id="${escapeHtml(r.id)}">
            <span>Delete</span>
          </button>
        </div>
      `;

      card.querySelector('.mobile-view-btn').addEventListener('click', () => viewRequestDetails(r.id));
      card.querySelector('.mobile-del-btn').addEventListener('click', () => openDeleteSingleModal(r.id));
      mobileCardsList.appendChild(card);
    });
  }

  // =========================================================================
  // REQUISITION INSPECTION MODAL (FULL DETAILS)
  // =========================================================================
  async function viewRequestDetails(id) {
    try {
      const response = await fetch(`/api/owner/requests/${id}`);
      if (!response.ok) {
        showToast('Unable to load requisition details.', 'danger');
        return;
      }

      const data = await response.json();
      const r = data.request;
      if (!r) return;

      modalRecordId.textContent = r.id;

      // Render Attachments List
      let attachmentsHtml = '<p class="input-hint">No attachments uploaded.</p>';
      if (r.attachments && r.attachments.length > 0) {
        attachmentsHtml = r.attachments.map(att => {
          const isImg = att.fileType === 'IMAGE';
          const preview = isImg ? `
            <div style="margin-top: 0.5rem; max-width: 240px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border-light);">
              <img src="${att.url}" alt="${escapeHtml(att.name)}" style="width: 100%; height: auto; display: block; max-height: 140px; object-fit: contain; background: #0F172A;">
            </div>
          ` : '';

          return `
            <div class="attachment-item">
              <div>
                <div style="font-weight: 600; color: var(--pmi-navy-900);">
                  <span class="file-type-badge ${att.isPdf ? 'pdf' : 'img'}">${att.isPdf ? '[PDF]' : '[IMG]'}</span>
                  ${escapeHtml(att.name)}
                </div>
                <div class="input-hint">${formatFileSize(att.size)}</div>
                ${preview}
              </div>
              <a href="${att.url}?download=1" download="${escapeHtml(att.name)}" class="action-btn-sm" style="text-decoration: none; flex-shrink: 0;">
                <span>Download</span>
              </a>
            </div>
          `;
        }).join('');
      }

      // Validated Video Public Link
      let videoLinkHtml = 'None';
      if (r.videoPublicLink) {
        videoLinkHtml = `
          <a href="${escapeHtml(r.videoPublicLink)}" target="_blank" rel="noopener noreferrer" style="color: var(--pmi-blue-primary); word-break: break-all; display: inline-flex; align-items: center; gap: 0.35rem;">
            <span>${escapeHtml(r.videoPublicLink)}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </a>
        `;
      }

      inspectModalBody.innerHTML = `
        <div class="details-grid">
          <div class="details-row">
            <span class="details-label">Portfolio</span>
            <span class="details-value"><strong>${escapeHtml(r.portfolio)}</strong></span>
          </div>

          <div class="details-row">
            <span class="details-label">Preferred Delivery Date &amp; Time</span>
            <span class="details-value"><strong>${r.deliveryDate && r.deliveryDate !== 'NA' ? `${escapeHtml(r.deliveryDate)} at ${escapeHtml(r.deliveryTime || '09:00')}` : 'Not specified (NA)'}</strong></span>
          </div>

          <div class="details-row">
            <span class="details-label">Image Requirement</span>
            <span class="details-value"><strong>${escapeHtml(r.imageRequirement || (r.noMediaCheckbox ? 'Create Image' : 'No Image Needed'))}</strong></span>
          </div>

          <div class="details-row full">
            <span class="details-label">Comments &amp; Repost Schedule</span>
            <div class="details-content-box" style="white-space: pre-wrap;">${escapeHtml(r.repostComments || 'None provided')}</div>
          </div>

          <div class="details-row">
            <span class="details-label">Submitter Full Name</span>
            <span class="details-value">${escapeHtml(r.submitterName)}</span>
          </div>

          <div class="details-row">
            <span class="details-label">Submitter Role</span>
            <span class="details-value">${escapeHtml(r.submitterRole || 'NA')}</span>
          </div>

          <div class="details-row">
            <span class="details-label">Email Address</span>
            <span class="details-value"><a href="mailto:${escapeHtml(r.submitterEmail)}" style="color: var(--pmi-blue-primary);">${escapeHtml(r.submitterEmail)}</a></span>
          </div>

          <div class="details-row">
            <span class="details-label">Phone Number</span>
            <span class="details-value">${escapeHtml(r.submitterPhone || 'NA')}</span>
          </div>

          <div class="details-row full">
            <span class="details-label">Clarification Contact Note</span>
            <span class="details-value">${escapeHtml(r.clarificationNote || 'None provided')}</span>
          </div>

          <div class="details-row full">
            <span class="details-label">Request Title / Topic</span>
            <span class="details-value" style="font-size: 1rem; font-weight: 700;">${escapeHtml(r.requestTitle)}</span>
          </div>

          <div class="details-row full">
            <span class="details-label">Suggested Headline / Hook</span>
            <span class="details-value">${escapeHtml(r.headline || 'NA')}</span>
          </div>

          <div class="details-row full">
            <span class="details-label">Main Content Copy (${r.wordCount || 0} words)</span>
            <div class="details-content-box">${escapeHtml(r.mainContent)}</div>
          </div>

          <div class="details-row full">
            <span class="details-label">Key Highlights</span>
            <span class="details-value">${escapeHtml(r.keyHighlights || 'NA')}</span>
          </div>

          <div class="details-row">
            <span class="details-label">Hashtags</span>
            <span class="details-value">${escapeHtml(r.hashtags || 'None')}</span>
          </div>

          <div class="details-row">
            <span class="details-label">@Mentions</span>
            <span class="details-value">${escapeHtml(r.mentions || 'None')}</span>
          </div>

          <div class="details-row">
            <span class="details-label">LinkedIn IDs</span>
            <span class="details-value">${escapeHtml(r.linkedinIds || 'NA')}</span>
          </div>

          <div class="details-row">
            <span class="details-label">Instagram IDs</span>
            <span class="details-value">${escapeHtml(r.instagramIds || 'NA')}</span>
          </div>

          <div class="details-row">
            <span class="details-label">Event Name</span>
            <span class="details-value">${escapeHtml(r.eventName || 'NA')}</span>
          </div>

          <div class="details-row">
            <span class="details-label">Event Date / Time</span>
            <span class="details-value">${escapeHtml(r.eventDate || 'NA')} ${escapeHtml(r.eventTime || '')} (${escapeHtml(r.timeZone || 'NA')})</span>
          </div>

          <div class="details-row full">
            <span class="details-label">Public Video Link</span>
            <span class="details-value">${videoLinkHtml}</span>
          </div>

          <div class="details-row">
            <span class="details-label">Create Image Flag</span>
            <span class="details-value">${r.noMediaCheckbox ? '<strong>YES &bull; Please create an image</strong>' : 'No'}</span>
          </div>

          <div class="details-row">
            <span class="details-label">Submission Date (UTC)</span>
            <span class="details-value">${escapeHtml(formatDateTime(r.createdAt))}</span>
          </div>

          <div class="details-row full">
            <span class="details-label">Attached Media &amp; Documents</span>
            <div class="attachment-preview-box">${attachmentsHtml}</div>
          </div>
        </div>
      `;

      inspectModal.classList.add('is-open');
    } catch (e) {
      showToast('Error inspecting requisition.', 'danger');
    }
  }

  function closeInspectModal() {
    if (inspectModal) inspectModal.classList.remove('is-open');
  }

  // =========================================================================
  // SINGLE RECORD DELETION
  // =========================================================================
  function openDeleteSingleModal(id) {
    deleteTargetId = id;
    if (deleteTargetIdDisplay) deleteTargetIdDisplay.textContent = id;
    if (deleteSingleModal) deleteSingleModal.classList.add('is-open');
  }

  function closeDeleteSingleModal() {
    deleteTargetId = null;
    if (deleteSingleModal) deleteSingleModal.classList.remove('is-open');
  }

  async function handleDeleteSingleSubmit() {
    if (!deleteTargetId) return;

    try {
      const response = await fetch(`/api/owner/requests/${deleteTargetId}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-Token': csrfToken || ''
        }
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        closeDeleteSingleModal();
        loadRequests(currentPage);
        showToast(`Requisition ${deleteTargetId} permanently deleted.`, 'success');
      } else {
        showToast(data.error || 'Failed to delete requisition.', 'danger');
      }
    } catch (err) {
      showToast('Network error while deleting requisition.', 'danger');
    }
  }

  // =========================================================================
  // CLEAR ENTIRE DATABASE
  // =========================================================================
  function openClearDatabaseModal() {
    if (clearConfirmPhrase) clearConfirmPhrase.value = '';
    if (clearPasswordConfirm) clearPasswordConfirm.value = '';
    if (clearDatabaseModal) clearDatabaseModal.classList.add('is-open');
  }

  function closeClearDatabaseModal() {
    if (clearDatabaseModal) clearDatabaseModal.classList.remove('is-open');
  }

  async function handleClearDatabaseSubmit() {
    const phrase = clearConfirmPhrase.value.trim();
    const password = clearPasswordConfirm.value.trim();

    if (phrase !== 'PERMANENTLY CLEAR DATABASE') {
      showToast('Please type the exact phrase "PERMANENTLY CLEAR DATABASE" to confirm.', 'danger');
      return;
    }

    if (!password) {
      showToast('Owner password re-authentication is required.', 'danger');
      return;
    }

    try {
      const response = await fetch('/api/owner/clear-database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken || ''
        },
        body: JSON.stringify({ confirmPhrase: phrase, password: password })
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        closeClearDatabaseModal();
        loadRequests(1);
        showToast('All database requisitions and attachments cleared permanently.', 'success');
      } else {
        showToast(data.error || 'Failed to clear database.', 'danger');
      }
    } catch (err) {
      showToast('Network error while clearing database.', 'danger');
    }
  }

  // =========================================================================
  // EXPORT FUNCTIONALITY (EXCEL .xlsx & CSV)
  // =========================================================================
  async function handleExcelExport() {
    try {
      showToast('Generating Excel export...', 'info');

      // 1. Fetch sanitized dataset from authenticated endpoint
      const response = await fetch('/api/owner/export/excel-data');
      if (!response.ok) {
        // Fallback to CSV if unauthorized or failed
        window.location.href = '/api/owner/export/csv';
        return;
      }

      const resData = await response.json();
      const records = resData.data || [];

      if (records.length === 0) {
        showToast('No records available to export.', 'danger');
        return;
      }

      // Check if SheetJS (XLSX) is available
      if (typeof XLSX !== 'undefined') {
        const ws = XLSX.utils.json_to_sheet(records);

        // Auto-fit column widths based on maximum length of cell values
        const colWidths = Object.keys(records[0] || {}).map(key => {
          let maxLen = key.length;
          records.forEach(row => {
            const cellLen = String(row[key] || '').length;
            if (cellLen > maxLen) maxLen = Math.min(cellLen, 50);
          });
          return { wch: maxLen + 3 };
        });
        ws['!cols'] = colWidths;

        // Freeze Top Header Row
        ws['!freeze'] = { xSplit: 0, ySplit: 1 };

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'PMI_Requisitions');

        const dateStamp = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `PMI_Database_Requisitions_${dateStamp}.xlsx`);
        showToast(`Successfully exported ${records.length} records to Excel!`, 'success');
      } else {
        // Fallback to authenticated server CSV download
        window.location.href = '/api/owner/export/csv';
      }
    } catch (err) {
      console.error('Excel export error:', err);
      // Fallback
      window.location.href = '/api/owner/export/csv';
    }
  }

  function handleCsvExport() {
    showToast('Downloading CSV export...', 'info');
    window.location.href = '/api/owner/export/csv';
  }

  // =========================================================================
  // TOAST NOTIFICATIONS & UTILITY HELPERS
  // =========================================================================
  function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'danger') icon = '❌';

    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 200ms ease';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 200);
    }, 4000);
  }

  function formatDateTime(isoString) {
    if (!isoString) return 'N/A';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
    return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Self-execute initialization on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

