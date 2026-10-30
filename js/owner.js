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

  // Ensure page is firmly anchored at the top on initial load & prevent auto-scrolling
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

  function anchorToTop() {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      });
    }
    setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, 50);
    setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, 200);
  }

  // State
  let csrfToken = null;
  let currentUser = null;
  let mustChangePassword = false;
  let currentPage = 1;
  const pageLimit = 25;
  let currentTotalRecords = 0;
  let searchDebounceTimer = null;
  let deleteTargetId = null;
  let currentTab = 'content'; // 'content' or 'media'
  let securityAuditList = [];
  let sessionToken = null;

  try {
    sessionToken = sessionStorage.getItem('pmi_owner_token') || null;
    csrfToken = sessionStorage.getItem('pmi_owner_csrf') || null;
  } catch (e) {}

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
  const tabContentReqsBtn = document.getElementById('tabContentReqsBtn');
  const tabMediaReqsBtn = document.getElementById('tabMediaReqsBtn');
  const countContentBadge = document.getElementById('countContentBadge');
  const countMediaBadge = document.getElementById('countMediaBadge');
  const requestsTableThead = document.querySelector('#requestsTable thead tr');

  const tableSearchInput = document.getElementById('tableSearchInput');
  const filterPortfolio = document.getElementById('filterPortfolio');
  const refreshBtn = document.getElementById('refreshBtn');
  const downloadExcelBtn = document.getElementById('downloadExcelBtn');
  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  const securityAuditBtn = document.getElementById('securityAuditBtn');
  const clearDatabaseBtn = document.getElementById('clearDatabaseBtn');
  const activeFiltersRow = document.getElementById('activeFiltersRow');
  const activeFilterText = document.getElementById('activeFilterText');
  const clearFilterBtn = document.getElementById('clearFilterBtn');

  // Table & Cards
  const requisitionsTableCard = document.getElementById('requisitionsTableCard');
  const viewModeTableBtn = document.getElementById('viewModeTableBtn');
  const viewModeCardsBtn = document.getElementById('viewModeCardsBtn');
  let userForcedViewMode = null; // null ('auto'), 'table', or 'cards'
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

  const securityModal = document.getElementById('securityModal');
  const closeSecurityModalBtn = document.getElementById('closeSecurityModalBtn');
  const closeSecurityModalFooterBtn = document.getElementById('closeSecurityModalFooterBtn');
  const securitySearchInput = document.getElementById('securitySearchInput');
  const refreshSecurityBtn = document.getElementById('refreshSecurityBtn');
  const exportSecurityCsvBtn = document.getElementById('exportSecurityCsvBtn');
  const securityTableBody = document.getElementById('securityTableBody');
  const securityKpiTotal = document.getElementById('securityKpiTotal');
  const securityKpiUniqueIps = document.getElementById('securityKpiUniqueIps');
  const securityEmptyState = document.getElementById('securityEmptyState');

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
  // CORE AUTHENTICATED FETCH & MODAL MANAGEMENT HELPERS
  // =========================================================================

  /**
   * Centralized Authenticated Fetch Helper
   * Guarantees Bearer Authorization, X-Session-Token, X-CSRF-Token, and ?token query parameter
   * fallback across desktop, laptop, and mobile browsers where cookies may be restricted.
   */
  async function authFetch(url, options = {}) {
    const opts = Object.assign({}, options);
    opts.headers = Object.assign({}, opts.headers);
    opts.credentials = 'same-origin';

    if (sessionToken) {
      opts.headers['Authorization'] = `Bearer ${sessionToken}`;
      opts.headers['X-Session-Token'] = sessionToken;
    }
    if (csrfToken && !opts.headers['X-CSRF-Token']) {
      opts.headers['X-CSRF-Token'] = csrfToken;
    }

    let fetchUrl = url;
    if (sessionToken && !fetchUrl.includes('token=')) {
      const sep = fetchUrl.includes('?') ? '&' : '?';
      fetchUrl = `${fetchUrl}${sep}token=${encodeURIComponent(sessionToken)}`;
    }

    return fetch(fetchUrl, opts);
  }

  /**
   * Unified Modal Opener with Body Scroll Lock
   */
  function openModal(modalElem) {
    if (!modalElem) return;
    modalElem.classList.add('is-open');
    document.body.classList.add('modal-open');
  }

  /**
   * Unified Modal Closer with Body Scroll Release
   */
  function closeModal(modalElem) {
    if (!modalElem) return;
    modalElem.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) {
      document.body.classList.remove('modal-open');
    }
  }

  /**
   * View Mode Switcher (Desktop Table View vs Mobile Touch Cards)
   */
  function setViewMode(mode) {
    userForcedViewMode = mode;
    if (!requisitionsTableCard) return;

    if (mode === 'table') {
      requisitionsTableCard.classList.add('force-table-view');
      requisitionsTableCard.classList.remove('force-cards-view');
      if (viewModeTableBtn) viewModeTableBtn.classList.add('active');
      if (viewModeCardsBtn) viewModeCardsBtn.classList.remove('active');
    } else if (mode === 'cards') {
      requisitionsTableCard.classList.add('force-cards-view');
      requisitionsTableCard.classList.remove('force-table-view');
      if (viewModeCardsBtn) viewModeCardsBtn.classList.add('active');
      if (viewModeTableBtn) viewModeTableBtn.classList.remove('active');
    } else {
      requisitionsTableCard.classList.remove('force-table-view');
      requisitionsTableCard.classList.remove('force-cards-view');
      const isMobile = window.innerWidth <= 860;
      if (viewModeTableBtn) viewModeTableBtn.classList.toggle('active', !isMobile);
      if (viewModeCardsBtn) viewModeCardsBtn.classList.toggle('active', isMobile);
    }
  }

  // =========================================================================
  // INITIALIZATION & SESSION CHECK
  // =========================================================================
  function init() {
    anchorToTop();
    bindEvents();
    setViewMode(null);
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
    // Ensure viewport stays anchored strictly at the top without moving or scrolling down
    anchorToTop();
  }

  function showDashboard() {
    authCard.style.display = 'none';
    dashboardContainer.style.display = 'flex';
    changePasswordNavBtn.style.display = 'inline-flex';
    logoutBtn.style.display = 'inline-flex';
    setViewMode(userForcedViewMode);
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

    // Navigation Tab Switching (Content Requisitions vs Image & Video Requests)
    if (tabContentReqsBtn) {
      tabContentReqsBtn.addEventListener('click', () => {
        if (currentTab === 'content') return;
        currentTab = 'content';
        tabContentReqsBtn.className = 'btn btn-primary';
        tabMediaReqsBtn.className = 'btn btn-secondary';
        if (countContentBadge) {
          countContentBadge.style.background = 'rgba(255,255,255,0.25)';
          countContentBadge.style.color = '#fff';
        }
        if (countMediaBadge) {
          countMediaBadge.style.background = '#e2e8f0';
          countMediaBadge.style.color = '#1e293b';
        }
        updateTableHeaders();
        currentPage = 1;
        loadRequests(1);
      });
    }

    if (tabMediaReqsBtn) {
      tabMediaReqsBtn.addEventListener('click', () => {
        if (currentTab === 'media') return;
        currentTab = 'media';
        tabMediaReqsBtn.className = 'btn btn-primary';
        tabContentReqsBtn.className = 'btn btn-secondary';
        if (countMediaBadge) {
          countMediaBadge.style.background = 'rgba(255,255,255,0.25)';
          countMediaBadge.style.color = '#fff';
        }
        if (countContentBadge) {
          countContentBadge.style.background = '#e2e8f0';
          countContentBadge.style.color = '#1e293b';
        }
        updateTableHeaders();
        currentPage = 1;
        loadRequests(1);
      });
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

    // Security & Submitter IP Audit Modal
    if (securityAuditBtn) {
      securityAuditBtn.addEventListener('click', openSecurityModal);
    }

    if (closeSecurityModalBtn) {
      closeSecurityModalBtn.addEventListener('click', closeSecurityModal);
    }

    if (closeSecurityModalFooterBtn) {
      closeSecurityModalFooterBtn.addEventListener('click', closeSecurityModal);
    }

    if (exportSecurityCsvBtn) {
      exportSecurityCsvBtn.addEventListener('click', handleExportSecurityCsv);
    }

    if (refreshSecurityBtn) {
      refreshSecurityBtn.addEventListener('click', loadSecurityAudit);
    }

    if (securitySearchInput) {
      securitySearchInput.addEventListener('input', () => renderSecurityTable(securityAuditList));
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

    // View Mode Toggle (Table View vs Card View)
    if (viewModeTableBtn) {
      viewModeTableBtn.addEventListener('click', () => setViewMode('table'));
    }
    if (viewModeCardsBtn) {
      viewModeCardsBtn.addEventListener('click', () => setViewMode('cards'));
    }
    window.addEventListener('resize', () => {
      if (!userForcedViewMode) {
        setViewMode(null);
      }
    });

    // Keyboard Escape Key to Close Open Modals
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const openBackdrop = document.querySelector('.modal-backdrop.is-open');
        if (openBackdrop) closeModal(openBackdrop);
      }
    });

    // Backdrop Click for all modals
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', e => {
        if (e.target === backdrop) {
          closeModal(backdrop);
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
        sessionToken = data.token || sessionToken;
        currentUser = data.username;
        mustChangePassword = data.mustChangePassword;
        try {
          if (sessionToken) sessionStorage.setItem('pmi_owner_token', sessionToken);
          if (csrfToken) sessionStorage.setItem('pmi_owner_csrf', csrfToken);
        } catch (e) {}
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
        sessionToken = data.token || sessionToken;
        currentUser = data.username;
        mustChangePassword = data.mustChangePassword;
        try {
          if (sessionToken) sessionStorage.setItem('pmi_owner_token', sessionToken);
          if (csrfToken) sessionStorage.setItem('pmi_owner_csrf', csrfToken);
        } catch (e) {}
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
      const headers = { 'X-CSRF-Token': csrfToken || '' };
      if (sessionToken) headers['X-Session-Token'] = sessionToken;
      await fetch('/api/owner/logout', { method: 'POST', headers: headers });
    } catch (e) {}
    csrfToken = null;
    sessionToken = null;
    currentUser = null;
    try {
      sessionStorage.removeItem('pmi_owner_token');
      sessionStorage.removeItem('pmi_owner_csrf');
    } catch (e) {}
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
    openModal(changePasswordModal);
    currentPassInput.focus();
  }

  function closeChangePasswordModal() {
    closeModal(changePasswordModal);
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
      const response = await authFetch('/api/owner/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
  function updateTableHeaders() {
    if (!requestsTableThead) return;
    if (currentTab === 'content') {
      requestsTableThead.innerHTML = `
        <th scope="col">Record ID</th>
        <th scope="col">Date (UTC)</th>
        <th scope="col">Portfolio</th>
        <th scope="col">Request Title</th>
        <th scope="col">Submitter</th>
        <th scope="col">Channel</th>
        <th scope="col">Delivery Date</th>
        <th scope="col">Attachments</th>
        <th scope="col">Actions</th>
      `;
    } else {
      requestsTableThead.innerHTML = `
        <th scope="col">Record ID</th>
        <th scope="col">Date (UTC)</th>
        <th scope="col">Portfolio</th>
        <th scope="col">Project Title</th>
        <th scope="col">Submitter</th>
        <th scope="col">Asset Type</th>
        <th scope="col">Delivery Date</th>
        <th scope="col">Hosting Status</th>
        <th scope="col">Actions</th>
      `;
    }
  }

  async function updateOtherTabCount() {
    try {
      const otherEndpoint = currentTab === 'content' ? '/api/owner/media-requests?limit=1' : '/api/owner/requests?limit=1';
      const res = await authFetch(otherEndpoint);
      if (res.ok) {
        const d = await res.json();
        if (d.success) {
          if (currentTab === 'content' && countMediaBadge) countMediaBadge.textContent = d.total;
          if (currentTab === 'media' && countContentBadge) countContentBadge.textContent = d.total;
        }
      }
    } catch (e) {}
  }

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

    const endpoint = currentTab === 'content' ? '/api/owner/requests' : '/api/owner/media-requests';

    try {
      const response = await authFetch(`${endpoint}?${params.toString()}`);
      if (response.status === 401 || response.status === 403) {
        showAuthScreen();
        return;
      }

      const data = await response.json();
      if (data.success) {
        currentTotalRecords = data.total;
        if (currentTab === 'content' && countContentBadge) countContentBadge.textContent = data.total;
        if (currentTab === 'media' && countMediaBadge) countMediaBadge.textContent = data.total;
        renderTableAndCards(data.requests);
        updatePagination(data.total);
        updateKPIs(data.requests, data.total);
      }
      updateOtherTabCount();
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
      const tr = document.createElement('tr');
      const attCount = (r.attachments && r.attachments.length) || (r.mediaFiles && r.mediaFiles.length) || 0;
      const formattedDate = formatDateTime(r.createdAt);

      if (currentTab === 'content') {
        // 1. Content Requisition Row
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

        // 2. Mobile Touch Card (Content)
        const card = document.createElement('div');
        card.className = 'req-mobile-card';
        card.innerHTML = `
          <div class="req-mobile-header">
            <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
              <span class="table-code-badge">${escapeHtml(r.id)}</span>
              <span class="portfolio-badge">${escapeHtml(r.portfolio)}</span>
            </div>
            <span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(formattedDate)}</span>
          </div>
          <div class="req-mobile-title">${escapeHtml(r.requestTitle)}</div>
          <div class="req-mobile-meta">
            <div style="background: var(--surface-canvas); padding: 0.6rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-light);">
              <div style="font-weight: 700; color: var(--pmi-dark);">${escapeHtml(r.submitterName)} ${r.submitterRole && r.submitterRole !== 'NA' ? `<span style="font-weight: 400; color: var(--text-muted);">(${escapeHtml(r.submitterRole)})</span>` : ''}</div>
              <div style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.15rem;">
                <a href="mailto:${escapeHtml(r.submitterEmail)}" style="color: var(--pmi-blue);">${escapeHtml(r.submitterEmail)}</a>
                ${r.submitterPhone && r.submitterPhone !== 'NA' ? ` &bull; <span>${escapeHtml(r.submitterPhone)}</span>` : ''}
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.25rem; font-size: 0.8rem;">
              <div><span style="color: var(--text-muted);">Channel:</span> <strong>${escapeHtml(r.publishingChannel)}</strong></div>
              <div><span style="color: var(--text-muted);">Delivery:</span> <strong>${escapeHtml(r.deliveryDate)} ${r.deliveryTime ? `(${escapeHtml(r.deliveryTime)})` : ''}</strong></div>
              <div><span style="color: var(--text-muted);">Image Req:</span> <strong>${escapeHtml(r.imageRequirement || (r.noMediaCheckbox ? 'Create Image' : 'No Image Needed'))}</strong></div>
              <div><span style="color: var(--text-muted);">Attachments:</span> <strong>${attCount > 0 ? `📎 ${attCount} file(s)` : 'None'}</strong></div>
            </div>
          </div>
          <div class="req-mobile-actions">
            <button type="button" class="btn btn-primary btn-sm mobile-view-btn" style="flex: 2; min-height: 44px; padding: 0.5rem;" data-id="${escapeHtml(r.id)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span>Inspect Details</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm mobile-del-btn" style="flex: 1; min-height: 44px; color: var(--color-danger); border-color: var(--color-danger-border); padding: 0.5rem;" data-id="${escapeHtml(r.id)}" title="Delete Requisition">
              <span>Delete</span>
            </button>
          </div>
        `;

        card.querySelector('.mobile-view-btn').addEventListener('click', () => viewRequestDetails(r.id));
        card.querySelector('.mobile-del-btn').addEventListener('click', () => openDeleteSingleModal(r.id));
        mobileCardsList.appendChild(card);

      } else {
        // Creative Media Request Row
        const hostingBadge = r.hostingStatus === 'Hosted & Published' ? 'background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;' :
                             r.hostingStatus === 'Hosting Details Provided' ? 'background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;' :
                             r.hostingStatus === 'Hosting Details Requested' ? 'background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa;' :
                             'background: #f8fafc; color: #64748b; border: 1px solid #cbd5e1;';

        tr.innerHTML = `
          <td><span class="table-code-badge" style="background: #fff7ed; color: #c2410c; border-color: #fed7aa;">${escapeHtml(r.id)}</span></td>
          <td style="white-space: nowrap; font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(formattedDate)}</td>
          <td><span class="portfolio-badge">${escapeHtml(r.portfolio)}</span></td>
          <td style="font-weight: 600; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(r.projectTitle)}">
            ${escapeHtml(r.projectTitle)}
          </td>
          <td style="font-size: 0.85rem;">
            <div style="font-weight: 600;">${escapeHtml(r.submitterName)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(r.submitterEmail)}</div>
          </td>
          <td><span style="font-size: 0.8rem; font-weight: 700; color: #ea580c;">${escapeHtml(r.requestType)}</span></td>
          <td style="white-space: nowrap; font-size: 0.825rem; font-weight: 600;">
            ${escapeHtml(r.deliveryDate)}
          </td>
          <td style="font-size: 0.775rem;">
            <span class="portfolio-badge" style="${hostingBadge}">${escapeHtml(r.hostingStatus || 'Pending Creation')}</span>
          </td>
          <td>
            <div class="table-actions">
              <button type="button" class="action-btn-sm view-btn" data-id="${escapeHtml(r.id)}">
                <span>Inspect</span>
              </button>
              <button type="button" class="action-btn-sm delete delete-btn" data-id="${escapeHtml(r.id)}" title="Delete Creative Requisition">
                <span>Delete</span>
              </button>
            </div>
          </td>
        `;

        // Mobile Card for Media
        const card = document.createElement('div');
        card.className = 'req-mobile-card';
        card.innerHTML = `
          <div class="req-mobile-header">
            <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
              <span class="table-code-badge" style="background: #fff7ed; color: #c2410c; border-color: #fed7aa;">${escapeHtml(r.id)}</span>
              <span class="portfolio-badge">${escapeHtml(r.portfolio)}</span>
            </div>
            <span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(formattedDate)}</span>
          </div>
          <div class="req-mobile-title">${escapeHtml(r.projectTitle)}</div>
          <div class="req-mobile-meta">
            <div style="background: var(--surface-canvas); padding: 0.6rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-light);">
              <div style="font-weight: 700; color: var(--pmi-dark);">${escapeHtml(r.submitterName)} ${r.submitterRole && r.submitterRole !== 'NA' ? `<span style="font-weight: 400; color: var(--text-muted);">(${escapeHtml(r.submitterRole)})</span>` : ''}</div>
              <div style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.15rem;">
                <a href="mailto:${escapeHtml(r.submitterEmail)}" style="color: var(--pmi-blue);">${escapeHtml(r.submitterEmail)}</a>
                ${r.submitterPhone && r.submitterPhone !== 'NA' ? ` &bull; <span>${escapeHtml(r.submitterPhone)}</span>` : ''}
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.25rem; font-size: 0.8rem;">
              <div><span style="color: var(--text-muted);">Asset Type:</span> <strong style="color: #ea580c;">${escapeHtml(r.requestType)}</strong></div>
              <div><span style="color: var(--text-muted);">Delivery:</span> <strong>${escapeHtml(r.deliveryDate)}</strong></div>
              <div><span style="color: var(--text-muted);">Hosting:</span> <span class="portfolio-badge" style="${hostingBadge}; padding: 0.15rem 0.45rem; font-size: 0.725rem;">${escapeHtml(r.hostingStatus || 'Pending Creation')}</span></div>
              <div><span style="color: var(--text-muted);">Attachments:</span> <strong>${attCount > 0 ? `📎 ${attCount} file(s)` : 'None'}</strong></div>
            </div>
          </div>
          <div class="req-mobile-actions">
            <button type="button" class="btn btn-primary btn-sm mobile-view-btn" style="flex: 2; min-height: 44px; padding: 0.5rem;" data-id="${escapeHtml(r.id)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span>Inspect Details</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm mobile-del-btn" style="flex: 1; min-height: 44px; color: var(--color-danger); border-color: var(--color-danger-border); padding: 0.5rem;" data-id="${escapeHtml(r.id)}" title="Delete Creative Requisition">
              <span>Delete</span>
            </button>
          </div>
        `;
        card.querySelector('.mobile-view-btn').addEventListener('click', () => viewRequestDetails(r.id));
        card.querySelector('.mobile-del-btn').addEventListener('click', () => openDeleteSingleModal(r.id));
        mobileCardsList.appendChild(card);
      }

      tr.querySelector('.view-btn').addEventListener('click', () => viewRequestDetails(r.id));
      tr.querySelector('.delete-btn').addEventListener('click', () => openDeleteSingleModal(r.id));
      requestsTableBody.appendChild(tr);
    });
  }

  // =========================================================================
  // REQUISITION INSPECTION MODAL (FULL DETAILS)
  // =========================================================================
  async function viewRequestDetails(id) {
    if (!inspectModal) return;
    modalRecordId.textContent = id;
    if (inspectModalBody) {
      inspectModalBody.innerHTML = `
        <div style="text-align: center; padding: 3rem 1.5rem; color: #64748b;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite; margin-bottom: 0.75rem;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
          <div style="font-weight: 600;">Loading requisition details...</div>
        </div>
      `;
    }
    openModal(inspectModal);

    try {
      const endpoint = currentTab === 'content' ? `/api/owner/requests/${id}` : `/api/owner/media-requests/${id}`;
      const response = await authFetch(endpoint);
      if (!response.ok) {
        if (inspectModalBody) {
          inspectModalBody.innerHTML = `
            <div style="text-align: center; padding: 2.5rem 1rem; color: #ef4444;">
              <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 0.5rem;">⚠️ Unable to Load Details</div>
              <p style="color: #64748b; font-size: 0.875rem; margin-bottom: 1.25rem;">Server responded with status ${response.status}. Please check your connection or re-authenticate.</p>
              <button type="button" class="btn btn-secondary btn-sm" id="retryInspectBtn">🔄 Retry</button>
            </div>
          `;
          const retryBtn = document.getElementById('retryInspectBtn');
          if (retryBtn) retryBtn.addEventListener('click', () => viewRequestDetails(id));
        }
        showToast('Unable to load requisition details.', 'danger');
        return;
      }

      const data = await response.json();
      const r = data.request;
      if (!r) {
        if (inspectModalBody) {
          inspectModalBody.innerHTML = `<p style="padding: 2rem; text-align: center; color: #ef4444;">Requisition record not found.</p>`;
        }
        return;
      }

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

      if (currentTab === 'content') {
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

            <div class="details-row">
              <span class="details-label">Submitter IP Address</span>
              <span class="details-value"><code style="background: #e0f2fe; color: #0369a1; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 700; font-family: var(--font-mono); border: 1px solid #bae6fd;">${escapeHtml(r.ipAddress || '127.0.0.1')}</code></span>
            </div>

            <div class="details-row full">
              <span class="details-label">Attached Media &amp; Documents</span>
              <div class="attachment-preview-box">${attachmentsHtml}</div>
            </div>
          </div>
        `;
      } else {
        // Media Request Inspection View (Creative Brief + Hosting Details)
        let videoLinkHtml = 'None';
        if (r.referenceLink) {
          videoLinkHtml = `
            <a href="${escapeHtml(r.referenceLink)}" target="_blank" rel="noopener noreferrer" style="color: var(--pmi-blue-primary); word-break: break-all; display: inline-flex; align-items: center; gap: 0.35rem;">
              <span>${escapeHtml(r.referenceLink)}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </a>
          `;
        }

        const emailSubject = encodeURIComponent(`PMI Pearl City Chapter: Creative Asset Ready - Hosting Details Required (${r.id})`);
        const emailBody = encodeURIComponent(`Dear ${r.submitterName},\n\nYour creative asset for "${r.projectTitle}" (${r.id}) has been created by the MARCOM creative team.\n\nPlease provide or confirm the hosting and publishing details (target website link, social channel tags, and preferred go-live date) so we can proceed with publication.\n\nThank you,\nPMI Pearl City Chapter`);
        const mailtoUrl = `mailto:${encodeURIComponent(r.submitterEmail)}?subject=${emailSubject}&body=${emailBody}`;

        inspectModalBody.innerHTML = `
          <div class="details-grid">
            <div class="details-row">
              <span class="details-label">Portfolio</span>
              <span class="details-value"><strong>${escapeHtml(r.portfolio)}</strong></span>
            </div>

            <div class="details-row">
              <span class="details-label">Associated Content Requisition</span>
              <span class="details-value"><strong>${escapeHtml(r.contentReqId || 'None (Standalone)')}</strong></span>
            </div>

            <div class="details-row">
              <span class="details-label">Asset Type Requested</span>
              <span class="details-value" style="color: #ea580c; font-weight: 700;">${escapeHtml(r.requestType)}</span>
            </div>

            <div class="details-row">
              <span class="details-label">Category &amp; Dimensions</span>
              <span class="details-value">${escapeHtml(r.assetCategory || 'Event Promotion')} &bull; ${escapeHtml(r.dimensions || 'Square 1:1')} ${r.customDimensions ? `(${escapeHtml(r.customDimensions)})` : ''}</span>
            </div>

            <div class="details-row">
              <span class="details-label">Submitter Full Name</span>
              <span class="details-value">${escapeHtml(r.submitterName)}</span>
            </div>

            <div class="details-row">
              <span class="details-label">Role / Designation</span>
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
              <span class="details-label">Project / Asset Title</span>
              <span class="details-value" style="font-size: 1rem; font-weight: 700;">${escapeHtml(r.projectTitle)}</span>
            </div>

            <div class="details-row full">
              <span class="details-label">Primary Headline / Text on Visual</span>
              <div class="details-content-box" style="font-weight: 600; color: var(--pmi-dark);">${escapeHtml(r.headlineText || 'NA')}</div>
            </div>

            <div class="details-row full">
              <span class="details-label">Supporting Content &amp; Event Details</span>
              <div class="details-content-box">${escapeHtml(r.supportingText || 'None')}</div>
            </div>

            <div class="details-row full">
              <span class="details-label">Design Guidance &amp; Visual Tone</span>
              <div class="details-content-box">${escapeHtml(r.designGuidance || 'None')}</div>
            </div>

            <div class="details-row full">
              <span class="details-label">Reference Video / Sample Link</span>
              <span class="details-value">${videoLinkHtml}</span>
            </div>

            <div class="details-row">
              <span class="details-label">Delivery Date &amp; Urgency</span>
              <span class="details-value"><strong>${escapeHtml(r.deliveryDate || 'NA')} &bull; Priority: ${escapeHtml(r.priority || 'Standard')}</strong></span>
            </div>

            <div class="details-row">
              <span class="details-label">Submission Date (UTC)</span>
              <span class="details-value">${escapeHtml(formatDateTime(r.createdAt))}</span>
            </div>

            <div class="details-row">
              <span class="details-label">Submitter IP Address</span>
              <span class="details-value"><code style="background: #e0f2fe; color: #0369a1; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 700; font-family: var(--font-mono); border: 1px solid #bae6fd;">${escapeHtml(r.ipAddress || '127.0.0.1')}</code></span>
            </div>

            <div class="details-row full">
              <span class="details-label">Attached Reference Files (${r.attachments ? r.attachments.length : 0})</span>
              <div class="attachments-list" style="margin-top: 0.5rem;">${attachmentsHtml}</div>
            </div>

            <!-- POST-CREATION HOSTING DETAILS SECTION -->
            <div class="details-row full" style="margin-top: 0.75rem; padding: 1.15rem; border: 2px dashed #fed7aa; background: #fffdfa; border-radius: var(--radius-md);">
              <div style="font-size: 1rem; font-weight: 700; color: #9a3412; margin-bottom: 0.65rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
                <span>🚀 Hosting &amp; Deployment Specification (Once Created)</span>
                <span class="portfolio-badge" style="background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;">${escapeHtml(r.hostingStatus || 'Pending Creation')}</span>
              </div>

              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; font-size: 0.85rem; margin-bottom: 0.75rem;">
                <div><strong>Channels:</strong> ${escapeHtml(r.hostingChannels || 'Official Website, Social Media')}</div>
                <div><strong>Target Link:</strong> ${r.hostingTargetUrl ? `<a href="${escapeHtml(r.hostingTargetUrl)}" target="_blank" rel="noopener" style="color: var(--pmi-blue);">${escapeHtml(r.hostingTargetUrl)}</a>` : 'Not specified yet'}</div>
                <div><strong>Go-Live Date:</strong> ${escapeHtml(r.hostingLiveDate || 'Upon completion')}</div>
                <div><strong>Workflow:</strong> ${escapeHtml(r.hostingWorkflow || 'Publish Automatically')}</div>
              </div>

              ${r.hostingNotes ? `<div style="font-size: 0.825rem; color: #475569; margin-bottom: 0.75rem; background: #ffffff; padding: 0.5rem; border-radius: 4px; border: 1px solid #e2e8f0;"><strong>Notes:</strong> ${escapeHtml(r.hostingNotes)}</div>` : ''}

              <!-- Status & Hosting Manager Bar -->
              <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #fed7aa;">
                <div style="display: flex; align-items: center; gap: 0.35rem;">
                  <label style="font-size: 0.8rem; font-weight: 600;">Status:</label>
                  <select id="modalStatusSelect" style="padding: 0.35rem 0.5rem; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 0.825rem;">
                    <option value="Pending Review" ${r.status === 'Pending Review' ? 'selected' : ''}>Pending Review</option>
                    <option value="In Design" ${r.status === 'In Design' ? 'selected' : ''}>In Design</option>
                    <option value="Image Created" ${r.status === 'Image Created' ? 'selected' : ''}>Image Created</option>
                    <option value="Completed" ${r.status === 'Completed' ? 'selected' : ''}>Completed</option>
                  </select>
                </div>

                <div style="display: flex; align-items: center; gap: 0.35rem;">
                  <label style="font-size: 0.8rem; font-weight: 600;">Hosting Status:</label>
                  <select id="modalHostingStatusSelect" style="padding: 0.35rem 0.5rem; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 0.825rem;">
                    <option value="Pending Creation" ${r.hostingStatus === 'Pending Creation' ? 'selected' : ''}>Pending Creation</option>
                    <option value="Hosting Details Requested" ${r.hostingStatus === 'Hosting Details Requested' ? 'selected' : ''}>Image Created - Hosting Details Requested</option>
                    <option value="Hosting Details Provided" ${r.hostingStatus === 'Hosting Details Provided' ? 'selected' : ''}>Hosting Details Provided</option>
                    <option value="Hosted &amp; Published" ${r.hostingStatus === 'Hosted & Published' ? 'selected' : ''}>Hosted &amp; Published</option>
                  </select>
                </div>

                <button type="button" class="btn btn-primary btn-sm" id="saveMediaStatusBtn" style="padding: 0.4rem 0.85rem; font-size: 0.8rem;">
                  <span>Update Status</span>
                </button>

                <a href="${mailtoUrl}" class="btn btn-secondary btn-sm" style="text-decoration: none; padding: 0.4rem 0.85rem; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                  <span>Request Hosting Details</span>
                </a>
              </div>
            </div>
          </div>
        `;

        const saveBtn = document.getElementById('saveMediaStatusBtn');
        if (saveBtn) {
          saveBtn.addEventListener('click', async () => {
            const statusVal = document.getElementById('modalStatusSelect').value;
            const hostingVal = document.getElementById('modalHostingStatusSelect').value;
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            try {
              const updRes = await authFetch(`/api/owner/media-requests/${r.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: statusVal, hostingStatus: hostingVal })
              });
              if (updRes.ok) {
                showToast('Status and hosting details updated.', 'success');
                loadRequests(currentPage);
              } else {
                showToast('Failed to update status.', 'danger');
              }
            } catch (e) {
              showToast('Network error updating status.', 'danger');
            } finally {
              saveBtn.disabled = false;
              saveBtn.textContent = 'Update Status';
            }
          });
        }
      }

      openModal(inspectModal);
    } catch (e) {
      showToast('Error inspecting requisition.', 'danger');
    }
  }

  function closeInspectModal() {
    closeModal(inspectModal);
  }

  // =========================================================================
  // SINGLE RECORD DELETION
  // =========================================================================
  function openDeleteSingleModal(id) {
    deleteTargetId = id;
    if (deleteTargetIdDisplay) deleteTargetIdDisplay.textContent = id;
    openModal(deleteSingleModal);
  }

  function closeDeleteSingleModal() {
    deleteTargetId = null;
    closeModal(deleteSingleModal);
  }

  async function handleDeleteSingleSubmit() {
    if (!deleteTargetId) return;

    try {
      const endpoint = currentTab === 'content' ? `/api/owner/requests/${deleteTargetId}` : `/api/owner/media-requests/${deleteTargetId}`;
      const response = await authFetch(endpoint, {
        method: 'DELETE'
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
    openModal(clearDatabaseModal);
  }

  function closeClearDatabaseModal() {
    closeModal(clearDatabaseModal);
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
      const response = await authFetch('/api/owner/clear-database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
      const response = await authFetch('/api/owner/export/excel-data');
      if (!response.ok) {
        // Fallback to CSV if unauthorized or failed
        const tokenQuery = sessionToken ? `?token=${encodeURIComponent(sessionToken)}` : '';
        window.location.href = `/api/owner/export/csv${tokenQuery}`;
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
        const tokenQuery = sessionToken ? `?token=${encodeURIComponent(sessionToken)}` : '';
        window.location.href = `/api/owner/export/csv${tokenQuery}`;
      }
    } catch (err) {
      console.error('Excel export error:', err);
      // Fallback
      const tokenQuery = sessionToken ? `?token=${encodeURIComponent(sessionToken)}` : '';
      window.location.href = `/api/owner/export/csv${tokenQuery}`;
    }
  }

  function handleCsvExport() {
    showToast('Downloading CSV export...', 'info');
    const tokenQuery = sessionToken ? `?token=${encodeURIComponent(sessionToken)}` : '';
    window.location.href = `/api/owner/export/csv${tokenQuery}`;
  }

  // =========================================================================
  // SECURITY & SUBMITTER IP AUDIT
  // =========================================================================
  function openSecurityModal() {
    openModal(securityModal);
    if (securitySearchInput) securitySearchInput.value = '';
    loadSecurityAudit();
  }

  function closeSecurityModal() {
    closeModal(securityModal);
  }

  async function loadSecurityAudit() {
    if (!securityTableBody) return;
    securityTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #64748b;"><div style="display: inline-flex; align-items: center; gap: 0.5rem;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg><span>Loading security audit records...</span></div></td></tr>';

    try {
      const res = await authFetch('/api/owner/security-audit', {
        headers: { 'Accept': 'application/json' }
      });

      if (res.status === 401 || res.status === 403) {
        showToast('Owner session expired or unauthorized. Please re-authenticate.', 'danger');
        showAuthScreen();
        return;
      }

      if (!res.ok) {
        let errMessage = `Server responded with HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson && errJson.error) errMessage = errJson.error;
        } catch (_) {
          try {
            const rawText = await res.text();
            if (rawText && rawText.length < 150 && !rawText.includes('<html')) errMessage = rawText;
          } catch (_) {}
        }
        showToast(errMessage, 'danger');
        securityTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #ef4444; font-weight: 600;">⚠️ ${escapeHtml(errMessage)}</td></tr>`;
        return;
      }

      const data = await res.json().catch(() => null);
      if (data && data.success) {
        securityAuditList = Array.isArray(data.submissions) ? data.submissions : [];
        if (securityKpiTotal) securityKpiTotal.textContent = data.total || securityAuditList.length;
        if (securityKpiUniqueIps) securityKpiUniqueIps.textContent = data.uniqueIps || new Set(securityAuditList.map(s => s.ipAddress).filter(Boolean)).size;
        renderSecurityTable(securityAuditList);
      } else {
        const errorText = (data && data.error) || 'Failed to load security audit log.';
        showToast(errorText, 'danger');
        securityTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #ef4444; font-weight: 600;">⚠️ ${escapeHtml(errorText)}</td></tr>`;
      }
    } catch (e) {
      console.error('Security audit load error:', e);
      const isConnectionRefused = e.message && (e.message.includes('Failed to fetch') || e.message.includes('NetworkError') || e.message.includes('ECONNREFUSED'));
      const friendlyMsg = isConnectionRefused
        ? 'Unable to connect to backend server. Please verify the Node.js server is running.'
        : `Network error loading security audit data: ${e.message || 'Connection lost'}`;
      showToast(friendlyMsg, 'danger');
      securityTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2.5rem; color: #b91c1c;">
            <div style="font-weight: 800; font-size: 1rem; margin-bottom: 0.5rem;">⚠️ Unable to Connect to Security Service</div>
            <div style="font-size: 0.85rem; color: #64748b; max-width: 500px; margin: 0 auto 1.25rem;">
              The browser could not reach <code>/api/owner/security-audit</code>. Please ensure the Express server is actively running (e.g. <code>npm start</code> or <code>node server.js</code>).
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="retrySecurityLoadBtn" style="font-weight: 700; border-color: #0284c7; color: #0369a1;">
              🔄 Retry Connection
            </button>
          </td>
        </tr>
      `;
      const retryBtn = document.getElementById('retrySecurityLoadBtn');
      if (retryBtn) {
        retryBtn.addEventListener('click', loadSecurityAudit);
      }
    }
  }

  function renderSecurityTable(list) {
    if (!securityTableBody) return;
    const query = securitySearchInput ? securitySearchInput.value.trim().toLowerCase() : '';
    const filtered = query
      ? list.filter(item =>
          (item.ipAddress && item.ipAddress.toLowerCase().includes(query)) ||
          (item.id && item.id.toLowerCase().includes(query)) ||
          (item.submitterName && item.submitterName.toLowerCase().includes(query)) ||
          (item.submitterEmail && item.submitterEmail.toLowerCase().includes(query)) ||
          (item.portfolio && item.portfolio.toLowerCase().includes(query)) ||
          (item.formType && item.formType.toLowerCase().includes(query))
        )
      : list;

    if (filtered.length === 0) {
      securityTableBody.innerHTML = '';
      if (securityEmptyState) securityEmptyState.style.display = 'block';
      return;
    }

    if (securityEmptyState) securityEmptyState.style.display = 'none';

    securityTableBody.innerHTML = filtered.map(item => `
      <tr>
        <td style="font-size: 0.775rem; white-space: nowrap; font-family: var(--font-mono); color: #64748b;">${escapeHtml(formatDateTime(item.createdAt))}</td>
        <td style="font-size: 0.8rem; white-space: nowrap;">
          <code style="background: #e0f2fe; color: #0369a1; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 700; font-family: var(--font-mono); border: 1px solid #bae6fd;">
            ${escapeHtml(item.ipAddress || '127.0.0.1')}
          </code>
        </td>
        <td style="font-size: 0.8rem; font-family: var(--font-mono); font-weight: 700; color: #0f172a;">${escapeHtml(item.id)}</td>
        <td style="font-size: 0.8rem;">
          <span style="display: inline-block; padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.725rem; font-weight: 700; background: ${item.formType && item.formType.includes('Media') ? '#ffedd5; color: #c2410c;' : '#dbeafe; color: #1e40af;'}">
            ${escapeHtml(item.formType)}
          </span>
        </td>
        <td style="font-size: 0.8rem;">
          <div style="font-weight: 600; color: #1e293b;">${escapeHtml(item.submitterName || 'Unknown')}</div>
          <div style="font-size: 0.725rem; color: #64748b;">${escapeHtml(item.submitterEmail || '')}</div>
        </td>
        <td style="font-size: 0.8rem; color: #475569;">${escapeHtml(item.portfolio || '')}</td>
      </tr>
    `).join('');
  }

  function handleExportSecurityCsv() {
    showToast('Downloading Security IP Log...', 'info');
    const tokenQuery = sessionToken ? `?token=${encodeURIComponent(sessionToken)}` : '';
    window.location.href = `/api/owner/security-audit/csv${tokenQuery}`;
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

  // Anchor to top on full window load and pageshow (back/forward or refresh)
  window.addEventListener('load', anchorToTop);
  window.addEventListener('pageshow', anchorToTop);

})();

