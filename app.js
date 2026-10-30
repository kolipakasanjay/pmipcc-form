/**
 * PMI Portfolio Content Request Management System
 * Public Submission Client Application Engine
 * 
 * Features:
 * - Real-time accessible form validation
 * - Live word counter with recommendation range indicators (100–250 words)
 * - Drag-and-drop & conventional file picker for Images & PDFs
 * - Strict provider validation for public video links
 * - 48-hour delivery date boundary validation
 * - Private tracking receipt dialog with 1-click Reference ID copying
 * - Zero storage of sensitive submission content in browser storage
 */

(function () {
  'use strict';

  // DOM Elements
  const form = document.getElementById('contentRequestForm');
  const portfolioSelect = document.getElementById('portfolio');
  const requestTitleInput = document.getElementById('requestTitle');
  const submitterNameInput = document.getElementById('submitterName');
  const submitterRoleInput = document.getElementById('submitterRole');
  const submitterEmailInput = document.getElementById('submitterEmail');
  const submitterPhoneInput = document.getElementById('submitterPhone');
  // Submitter clarification contact note removed per requirements
  const headlineInput = document.getElementById('headline');
  const mainContentTextarea = document.getElementById('mainContent');
  const wordCountDisplay = document.getElementById('wordCountDisplay');
  const wordCountBadge = document.getElementById('wordCountBadge');
  const keyHighlightsInput = document.getElementById('keyHighlights');
  const hashtagsInput = document.getElementById('hashtags');
  const mentionsInput = document.getElementById('mentions');
  // LinkedIn and Instagram fields are dynamically generated based on mentions
  const eventNameInput = document.getElementById('eventName');
  const eventDateInput = document.getElementById('eventDate');
  const eventTimeInput = document.getElementById('eventTime');
  const timeZoneInput = document.getElementById('timeZone');
  const videoPublicLinkInput = document.getElementById('videoPublicLink');
  const validateVideoLinkBtn = document.getElementById('validateVideoLinkBtn');
  const videoSuccessMsg = document.getElementById('video-success-msg');
  const deliveryDateInput = document.getElementById('deliveryDate');
  const deliveryTimeInput = document.getElementById('deliveryTime');
  const repostCommentsTextarea = document.getElementById('repostComments');
  const submitRequestBtn = document.getElementById('submitRequestBtn');
  const submitBtnText = document.getElementById('submitBtnText');
  const resetFormBtn = document.getElementById('resetFormBtn');

  // File Upload Elements
  const dropzone = document.getElementById('fileDropzone');
  const fileInput = document.getElementById('mediaFileInput');
  const fileChipsContainer = document.getElementById('fileChipsContainer');

  // Receipt Modal Elements
  const receiptModal = document.getElementById('receiptModal');
  const receiptReferenceId = document.getElementById('receiptReferenceId');
  const copyReferenceIdBtn = document.getElementById('copyReferenceIdBtn');
  const copyBtnText = document.getElementById('copyBtnText');
  const closeReceiptBtn = document.getElementById('closeReceiptBtn');
  const receiptImageReqNotice = document.getElementById('receiptImageReqNotice');
  const receiptFillMediaFormBtn = document.getElementById('receiptFillMediaFormBtn');
  const receiptHostingReqNotice = document.getElementById('receiptHostingReqNotice');
  const receiptFillHostingFormBtn = document.getElementById('receiptFillHostingFormBtn');
  const hostingRedirectCountdown = document.getElementById('hostingRedirectCountdown');

  // State
  let selectedFiles = []; // Array of { name, size, type, isPdf, dataUrl }
  let isSubmitting = false;

  // Initialize
  function init() {
    setupDeliveryDateMin();
    setupEventDateMin();
    bindEvents();
    updateWordCounter();
    renderSocialFields(0);
  }

  /**
   * Set minimum delivery date to 48 hours (2 calendar days) from today
   */
  function setupDeliveryDateMin() {
    if (!deliveryDateInput) return;
    const now = new Date();
    // Advance by 2 days
    const minDate = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const yyyy = minDate.getFullYear();
    const mm = String(minDate.getMonth() + 1).padStart(2, '0');
    const dd = String(minDate.getDate()).padStart(2, '0');
    deliveryDateInput.min = `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Set minimum event date to 2 calendar days from today
   * (Prevents selecting yesterday, today, and tomorrow in the date picker)
   */
  function setupEventDateMin() {
    if (!eventDateInput) return;
    const now = new Date();
    // Advance by 2 calendar days from today so yesterday, today, and tomorrow are disabled
    const minDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
    const yyyy = minDate.getFullYear();
    const mm = String(minDate.getMonth() + 1).padStart(2, '0');
    const dd = String(minDate.getDate()).padStart(2, '0');
    eventDateInput.min = `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Helper: check if a date value is yesterday, today, or tomorrow (or older)
   */
  function isRestrictedEventDate(dateVal) {
    if (!dateVal || dateVal.toUpperCase() === 'NA') return false;
    const now = new Date();
    const formatYMD = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const yesterdayStr = formatYMD(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    const todayStr = formatYMD(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    const tomorrowStr = formatYMD(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const minAllowedStr = formatYMD(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));

    return (dateVal === yesterdayStr || dateVal === todayStr || dateVal === tomorrowStr || dateVal < minAllowedStr);
  }

  function validateEventDateInput() {
    const groupEventDate = document.getElementById('group-eventDate');
    const eventDateError = document.getElementById('eventDate-error');
    if (!eventDateInput) return true;
    const val = eventDateInput.value.trim();

    if (!val || val.toUpperCase() === 'NA') {
      eventDateInput.classList.remove('is-invalid');
      if (groupEventDate) groupEventDate.classList.remove('has-error');
      if (eventDateError) eventDateError.style.display = 'none';
      return true;
    }

    if (isRestrictedEventDate(val)) {
      eventDateInput.classList.add('is-invalid');
      if (groupEventDate) groupEventDate.classList.add('has-error');
      if (eventDateError) {
        eventDateError.textContent = 'Event date cannot be yesterday, today, or tomorrow. Please select a date at least 2 days ahead.';
        eventDateError.style.display = 'block';
      }
      return false;
    }

    eventDateInput.classList.remove('is-invalid');
    if (groupEventDate) groupEventDate.classList.remove('has-error');
    if (eventDateError) eventDateError.style.display = 'none';
    return true;
  }

  function validateDeliveryDateInput() {
    const groupDate = document.getElementById('group-deliveryDate');
    const deliveryDateError = document.getElementById('deliveryDate-error');
    if (!deliveryDateInput) return true;
    const dateVal = deliveryDateInput.value.trim();

    if (!dateVal || dateVal.toUpperCase() === 'NA') {
      deliveryDateInput.classList.remove('is-invalid');
      if (groupDate) groupDate.classList.remove('has-error');
      if (deliveryDateError) deliveryDateError.style.display = 'none';
      return true;
    }

    const selectedTime = new Date(`${dateVal}T23:59:59Z`).getTime();
    const minAllowed = new Date(Date.now() + 48 * 60 * 60 * 1000);
    minAllowed.setHours(0, 0, 0, 0);

    if (selectedTime < minAllowed.getTime()) {
      deliveryDateInput.classList.add('is-invalid');
      if (groupDate) groupDate.classList.add('has-error');
      if (deliveryDateError) deliveryDateError.style.display = 'block';
      return false;
    }

    deliveryDateInput.classList.remove('is-invalid');
    if (groupDate) groupDate.classList.remove('has-error');
    if (deliveryDateError) deliveryDateError.style.display = 'none';
    return true;
  }

  /**
   * Bind DOM Events
   */
  function bindEvents() {
    // Word counter on main content
    if (mainContentTextarea) {
      mainContentTextarea.addEventListener('input', updateWordCounter);
    }

    // Radio cards styling - Publishing Channel (no auto-selection)
    const radioInputs = document.querySelectorAll('input[name="publishingChannel"]');
    radioInputs.forEach(radio => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('.radio-group[aria-label="Publishing Channel Selection"] .radio-card').forEach(card => card.classList.remove('selected'));
        const parentCard = radio.closest('.radio-card');
        if (parentCard) parentCard.classList.add('selected');
        const groupChannel = document.getElementById('group-publishingChannel');
        const channelError = document.getElementById('publishingChannel-error');
        if (groupChannel) groupChannel.classList.remove('has-error');
        if (channelError) channelError.style.display = 'none';
      });
    });

    // Radio cards styling - Image Requirement (no auto-selection)
    const imageReqInputs = document.querySelectorAll('input[name="imageRequirement"]');
    imageReqInputs.forEach(radio => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('#label-imageReq-create, #label-imageReq-none').forEach(card => card.classList.remove('selected'));
        const parentCard = radio.closest('.radio-card');
        if (parentCard) parentCard.classList.add('selected');
        const groupImageReq = document.getElementById('group-imageRequirement');
        const imageReqError = document.getElementById('imageRequirement-error');
        if (groupImageReq) groupImageReq.classList.remove('has-error');
        if (imageReqError) imageReqError.style.display = 'none';
      });
    });

    // Dynamic LinkedIn & Instagram Fields based on Mentions
    if (mentionsInput) {
      mentionsInput.addEventListener('input', handleMentionsInput);
      mentionsInput.addEventListener('change', handleMentionsInput);
    }

    // Time Zone: automatically convert to uppercase on every input
    if (timeZoneInput) {
      timeZoneInput.addEventListener('input', (e) => {
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        e.target.value = e.target.value.toUpperCase();
        if (start !== null && end !== null) {
          e.target.setSelectionRange(start, end);
        }
      });
    }

    // Validate Public Video Link Button (ONLY verifies and displays status when clicked)
    if (validateVideoLinkBtn) {
      validateVideoLinkBtn.addEventListener('click', async () => {
        const val = videoPublicLinkInput ? videoPublicLinkInput.value.trim() : '';
        const group = document.getElementById('group-videoPublicLink');
        const errorMsg = document.getElementById('video-error');

        // Always hide previous feedback first
        clearVideoFeedback();

        if (!val || val.toUpperCase() === 'NA') {
          if (videoPublicLinkInput) {
            videoPublicLinkInput.focus();
            videoPublicLinkInput.classList.add('is-invalid');
          }
          if (group) group.classList.add('has-error');
          if (errorMsg) {
            errorMsg.textContent = 'Please provide the public link in order to upload the link';
            errorMsg.style.display = 'block';
          }
          if (videoSuccessMsg) videoSuccessMsg.style.display = 'none';
          return;
        }

        // 1. Initial client-side format check
        const formatOk = checkVideoUrlFormat(val);
        if (!formatOk) {
          if (videoPublicLinkInput) videoPublicLinkInput.classList.add('is-invalid');
          if (group) group.classList.add('has-error');
          if (errorMsg) {
            errorMsg.textContent = 'Please provide the public link in order to upload the link';
            errorMsg.style.display = 'block';
          }
          if (videoSuccessMsg) videoSuccessMsg.style.display = 'none';
          return;
        }

        // 2. Server-side deep check (e.g. for Google Drive live access / redirect status)
        validateVideoLinkBtn.disabled = true;
        const origHtml = validateVideoLinkBtn.innerHTML;
        validateVideoLinkBtn.innerHTML = '<span>Verifying...</span>';

        try {
          const res = await fetch('/api/validate-video-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: val })
          });
          const result = await res.json().catch(() => ({}));
          if (res.ok && result.success) {
            if (videoPublicLinkInput) videoPublicLinkInput.classList.remove('is-invalid');
            if (group) group.classList.remove('has-error');
            if (errorMsg) errorMsg.style.display = 'none';
            if (videoSuccessMsg) {
              videoSuccessMsg.textContent = '✓ Public video link is verified and valid.';
              videoSuccessMsg.style.display = 'block';
            }
          } else {
            if (videoPublicLinkInput) videoPublicLinkInput.classList.add('is-invalid');
            if (group) group.classList.add('has-error');
            if (errorMsg) {
              errorMsg.textContent = result.error || 'Please provide the public link in order to upload the link';
              errorMsg.style.display = 'block';
            }
            if (videoSuccessMsg) videoSuccessMsg.style.display = 'none';
          }
        } catch (e) {
          if (videoPublicLinkInput) videoPublicLinkInput.classList.add('is-invalid');
          if (group) group.classList.add('has-error');
          if (errorMsg) {
            errorMsg.textContent = 'Please provide the public link in order to upload the link';
            errorMsg.style.display = 'block';
          }
          if (videoSuccessMsg) videoSuccessMsg.style.display = 'none';
        } finally {
          validateVideoLinkBtn.disabled = false;
          validateVideoLinkBtn.innerHTML = origHtml;
        }
      });
    }

    // Drag and Drop Upload
    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());
      dropzone.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInput.click();
        }
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, e => {
          e.preventDefault();
          dropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, e => {
          e.preventDefault();
          dropzone.classList.remove('dragover');
        });
      });

      dropzone.addEventListener('drop', e => {
        if (e.dataTransfer && e.dataTransfer.files) {
          handleSelectedFiles(e.dataTransfer.files);
        }
      });

      fileInput.addEventListener('change', () => {
        if (fileInput.files) {
          handleSelectedFiles(fileInput.files);
        }
      });
    }

    // Video URL input: clear feedback states when user edits, types, or pastes the link
    // Neither valid nor invalid status is displayed while placing/editing the link
    if (videoPublicLinkInput) {
      ['input', 'change', 'paste', 'keyup', 'cut'].forEach(evt => {
        videoPublicLinkInput.addEventListener(evt, clearVideoFeedback);
      });
    }

    // Event date validation
    if (eventDateInput) {
      ['change', 'input'].forEach(evt => {
        eventDateInput.addEventListener(evt, validateEventDateInput);
      });
    }

    // Delivery date validation
    if (deliveryDateInput) {
      ['change', 'input'].forEach(evt => {
        deliveryDateInput.addEventListener(evt, validateDeliveryDateInput);
      });
    }

    // Form submit & reset
    if (form) {
      form.addEventListener('submit', handleFormSubmit);
    }

    if (resetFormBtn) {
      resetFormBtn.addEventListener('click', () => {
        resetForm(true);
      });
    }

    // Receipt Modal Events
    if (copyReferenceIdBtn) {
      copyReferenceIdBtn.addEventListener('click', copyReferenceId);
    }

    if (closeReceiptBtn) {
      closeReceiptBtn.addEventListener('click', closeReceiptModal);
    }
  }

  /**
   * Live Word Counter with Recommendation Guidance
   */
  function updateWordCounter() {
    if (!mainContentTextarea || !wordCountDisplay || !wordCountBadge) return;
    const text = mainContentTextarea.value.trim();
    const count = text ? text.split(/\s+/).filter(Boolean).length : 0;
    wordCountDisplay.textContent = count;

    wordCountBadge.className = 'word-count-badge';
    if (count < 100) {
      wordCountBadge.classList.add('below');
      wordCountBadge.innerHTML = `<span>${count} words</span> <span style="opacity:0.75;">(Below 100–250 guidance)</span>`;
    } else if (count <= 250) {
      wordCountBadge.classList.add('optimal');
      wordCountBadge.innerHTML = `<span>${count} words</span> <span>(Optimal Range: 100–250)</span>`;
    } else {
      wordCountBadge.classList.add('above');
      wordCountBadge.innerHTML = `<span>${count} words</span> <span style="opacity:0.85;">(Above 250 guidance)</span>`;
    }
  }

  /**
   * Handle File Selection and Base64 Conversion
   */
  async function handleSelectedFiles(filesList) {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf'];
    const maxFileSizeBytes = 15 * 1024 * 1024; // 15MB

    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name);

      if (!isPdf && !isImage) {
        alert(`File "${file.name}" is not supported. Please select standard images or PDF documents only.`);
        continue;
      }

      if (file.size > maxFileSizeBytes) {
        alert(`File "${file.name}" exceeds the maximum permitted size of 15MB.`);
        continue;
      }

      // Check if duplicate
      if (selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
        continue;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        selectedFiles.push({
          name: file.name,
          size: file.size,
          type: file.type || (isPdf ? 'application/pdf' : 'image/png'),
          isPdf: isPdf,
          dataUrl: dataUrl
        });
      } catch (err) {
        console.error('Error reading file:', err);
      }
    }

    renderFileChips();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Render Selected File Chips with [IMG] / [PDF] Tags
   */
  function renderFileChips() {
    if (!fileChipsContainer) return;
    fileChipsContainer.innerHTML = '';

    selectedFiles.forEach((file, index) => {
      const chip = document.createElement('div');
      chip.className = 'file-chip';

      const left = document.createElement('div');
      left.className = 'file-chip-left';

      const badge = document.createElement('span');
      badge.className = `file-type-badge ${file.isPdf ? 'pdf' : 'img'}`;
      badge.textContent = file.isPdf ? '[PDF]' : '[IMG]';

      const name = document.createElement('span');
      name.className = 'file-chip-name';
      name.textContent = file.name;
      name.title = file.name;

      const size = document.createElement('span');
      size.className = 'file-chip-size';
      size.textContent = `(${formatFileSize(file.size)})`;

      left.appendChild(badge);
      left.appendChild(name);
      left.appendChild(size);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'file-chip-remove';
      removeBtn.setAttribute('aria-label', `Remove file ${file.name}`);
      removeBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      `;
      removeBtn.addEventListener('click', () => {
        selectedFiles.splice(index, 1);
        renderFileChips();
      });

      chip.appendChild(left);
      chip.appendChild(removeBtn);
      fileChipsContainer.appendChild(chip);
    });
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Pure Video URL Format Checker (Zero DOM Side-Effects)
   * Validates format against supported public video platforms.
   */
  function checkVideoUrlFormat(val) {
    if (!val || typeof val !== 'string') return false;
    const str = val.trim();
    if (!str || str.toUpperCase() === 'NA') return false;

    try {
      const parsed = new URL(str);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }
      const host = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname;

      // YouTube
      if (host.includes('youtube.com') || host.includes('youtu.be')) {
        const v = parsed.searchParams.get('v');
        if (v && /^[a-zA-Z0-9_-]{10,14}$/.test(v)) return true;
        if (pathname.startsWith('/embed/') || pathname.startsWith('/shorts/') || pathname.startsWith('/v/') || host === 'youtu.be') {
          return true;
        }
        return false;
      }

      // Vimeo
      if (host.includes('vimeo.com')) {
        return /\/\d+/.test(pathname) || pathname.startsWith('/video/');
      }

      // Loom
      if (host.includes('loom.com') && pathname.startsWith('/share/')) {
        return true;
      }

      // Google Drive
      if (host.includes('drive.google.com')) {
        if (pathname.includes('/folders/')) return false;

        let fileId = null;
        const match = pathname.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
        if (match) fileId = match[1];
        else if (parsed.searchParams.get('id') && /^[a-zA-Z0-9_-]{20,}$/.test(parsed.searchParams.get('id'))) {
          fileId = parsed.searchParams.get('id');
        }

        if (!fileId) return false;

        const usp = (parsed.searchParams.get('usp') || '').toLowerCase();
        // Disallow restricted copy links
        if (usp === 'drive_link' || usp === 'drive_web' || usp === 'drivesdk') {
          return false;
        }

        // Must have recognized sharing/preview structure
        if (usp === 'sharing' || pathname.endsWith('/preview') || pathname.endsWith('/view') || parsed.searchParams.get('export') === 'view') {
          return true;
        }
        return false;
      }

      // Direct Video (.mp4, .webm)
      if (pathname.endsWith('.mp4') || pathname.endsWith('.webm')) {
        return true;
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  /**
   * Clear all video validation feedback (called on typing, pasting, cutting, or editing)
   * Ensuring NO message (neither success nor error) is shown when placing/typing a link
   */
  function clearVideoFeedback() {
    if (videoSuccessMsg) {
      videoSuccessMsg.style.display = 'none';
    }
    const group = document.getElementById('group-videoPublicLink');
    if (group) group.classList.remove('has-error');
    if (videoPublicLinkInput) videoPublicLinkInput.classList.remove('is-invalid');
    const errorMsg = document.getElementById('video-error');
    if (errorMsg) errorMsg.style.display = 'none';
  }

  /**
   * Handle Dynamic Social Fields Based on Mentions Dropdown Selection
   */
  function handleMentionsInput() {
    const count = getMentionCount();
    renderSocialFields(count);
  }

  function getMentionCount() {
    if (!mentionsInput) return 0;
    const text = mentionsInput.value.trim();
    if (text === '0') return 0;
    if (!text) return 0;

    // Check if the user selected or entered a number: e.g. "0", "1", "2", "3"... up to 10
    const match = text.match(/\b([0-9]|10)\b/);
    if (match) {
      return parseInt(match[1], 10);
    }

    // Check multiple mentions e.g. "@alice, @bob"
    const list = text.split(/[,\s]+/).filter(item => item.startsWith('@') || item.length > 1);
    if (list.length > 1) {
      return Math.min(list.length, 10);
    }

    return 0;
  }

  function renderSocialFields(count) {
    const linkedinList = document.getElementById('linkedinFieldsList');
    const instagramList = document.getElementById('instagramFieldsList');
    if (!linkedinList || !instagramList) return;

    if (count === 0) {
      linkedinList.innerHTML = '<div style="font-size: 0.825rem; color: var(--text-muted); padding: 0.4rem 0; font-style: italic;">No LinkedIn mentions required (0 selected)</div>';
      instagramList.innerHTML = '<div style="font-size: 0.825rem; color: var(--text-muted); padding: 0.4rem 0; font-style: italic;">No Instagram mentions required (0 selected)</div>';
      return;
    }

    // Preserve existing user inputs
    const currentLinkedinVals = Array.from(document.querySelectorAll('.linkedin-id-input')).map(el => el.value);
    const currentInstagramVals = Array.from(document.querySelectorAll('.instagram-id-input')).map(el => el.value);

    // Render LinkedIn fields
    linkedinList.innerHTML = '';
    for (let i = 1; i <= count; i++) {
      const existingVal = currentLinkedinVals[i - 1] || '';
      const row = document.createElement('div');
      row.className = 'social-input-row';
      row.style.marginBottom = '0.65rem';
      row.innerHTML = `
        <label class="form-label" for="linkedinId_${i}">
          <span class="linkedin-label-text">LinkedIn Profile / ID #${i}</span>
        </label>
        <input type="text" class="form-control linkedin-id-input" id="linkedinId_${i}" name="linkedinIds_${i}" value="${escapeAttr(existingVal)}" placeholder="LinkedIn profile URL or handle #${i} (or NA)">
      `;
      linkedinList.appendChild(row);
    }

    // Render Instagram fields
    instagramList.innerHTML = '';
    for (let i = 1; i <= count; i++) {
      const existingVal = currentInstagramVals[i - 1] || '';
      const row = document.createElement('div');
      row.className = 'social-input-row';
      row.style.marginBottom = '0.65rem';
      row.innerHTML = `
        <label class="form-label" for="instagramId_${i}">
          <span class="instagram-label-text">Instagram ID / Handle #${i}</span>
        </label>
        <input type="text" class="form-control instagram-id-input" id="instagramId_${i}" name="instagramIds_${i}" value="${escapeAttr(existingVal)}" placeholder="Instagram handle #${i} (or NA)">
      `;
      instagramList.appendChild(row);
    }
  }

  function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Form Submission Handler
   */
  async function handleFormSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (isSubmitting) return;

    let hasErrors = false;

    // 1. Validate Portfolio
    const groupPortfolio = document.getElementById('group-portfolio');
    if (!portfolioSelect || !portfolioSelect.value) {
      if (portfolioSelect) portfolioSelect.classList.add('is-invalid');
      if (groupPortfolio) groupPortfolio.classList.add('has-error');
      hasErrors = true;
    } else {
      if (portfolioSelect) portfolioSelect.classList.remove('is-invalid');
      if (groupPortfolio) groupPortfolio.classList.remove('has-error');
    }

    // 2. Validate Title
    const groupTitle = document.getElementById('group-requestTitle');
    if (!requestTitleInput || !requestTitleInput.value.trim()) {
      if (requestTitleInput) requestTitleInput.classList.add('is-invalid');
      if (groupTitle) groupTitle.classList.add('has-error');
      hasErrors = true;
    } else {
      if (requestTitleInput) requestTitleInput.classList.remove('is-invalid');
      if (groupTitle) groupTitle.classList.remove('has-error');
    }

    // 3. Validate Submitter Name
    const groupName = document.getElementById('group-submitterName');
    if (!submitterNameInput || !submitterNameInput.value.trim()) {
      if (submitterNameInput) submitterNameInput.classList.add('is-invalid');
      if (groupName) groupName.classList.add('has-error');
      hasErrors = true;
    } else {
      if (submitterNameInput) submitterNameInput.classList.remove('is-invalid');
      if (groupName) groupName.classList.remove('has-error');
    }

    // 4. Validate Submitter Email
    const groupEmail = document.getElementById('group-submitterEmail');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!submitterEmailInput || !submitterEmailInput.value.trim() || !emailRegex.test(submitterEmailInput.value.trim())) {
      if (submitterEmailInput) submitterEmailInput.classList.add('is-invalid');
      if (groupEmail) groupEmail.classList.add('has-error');
      hasErrors = true;
    } else {
      if (submitterEmailInput) submitterEmailInput.classList.remove('is-invalid');
      if (groupEmail) groupEmail.classList.remove('has-error');
    }

    // 5. Validate Publishing Channel (Radio)
    const selectedRadio = form ? form.querySelector('input[name="publishingChannel"]:checked') : null;
    const groupChannel = document.getElementById('group-publishingChannel');
    const channelError = document.getElementById('publishingChannel-error');
    if (!selectedRadio) {
      if (groupChannel) groupChannel.classList.add('has-error');
      if (channelError) channelError.style.display = 'block';
      hasErrors = true;
    } else {
      if (groupChannel) groupChannel.classList.remove('has-error');
      if (channelError) channelError.style.display = 'none';
    }
    const publishingChannel = selectedRadio ? selectedRadio.value : '';

    // 6. Main Content (Normal optional field - no required validation)
    const groupContent = document.getElementById('group-mainContent');
    if (mainContentTextarea) mainContentTextarea.classList.remove('is-invalid');
    if (groupContent) groupContent.classList.remove('has-error');

    // 7. Validate Video Link if provided
    const videoVal = videoPublicLinkInput ? videoPublicLinkInput.value.trim() : '';
    if (videoVal && videoVal.toUpperCase() !== 'NA') {
      const isFormatOk = checkVideoUrlFormat(videoVal);
      const groupVideo = document.getElementById('group-videoPublicLink');
      const videoErr = document.getElementById('video-error');
      if (!isFormatOk) {
        if (videoPublicLinkInput) videoPublicLinkInput.classList.add('is-invalid');
        if (groupVideo) groupVideo.classList.add('has-error');
        if (videoErr) {
          videoErr.textContent = 'Please provide the public link in order to upload the link';
          videoErr.style.display = 'block';
        }
        hasErrors = true;
      } else {
        if (videoPublicLinkInput) videoPublicLinkInput.classList.remove('is-invalid');
        if (groupVideo) groupVideo.classList.remove('has-error');
        if (videoErr) videoErr.style.display = 'none';
      }
    }

    // 8. Validate Image Requirement (Radio)
    const selectedImageReq = form ? form.querySelector('input[name="imageRequirement"]:checked') : null;
    const groupImageReq = document.getElementById('group-imageRequirement');
    const imageReqError = document.getElementById('imageRequirement-error');
    if (!selectedImageReq) {
      if (groupImageReq) groupImageReq.classList.add('has-error');
      if (imageReqError) imageReqError.style.display = 'block';
      hasErrors = true;
    } else {
      if (groupImageReq) groupImageReq.classList.remove('has-error');
      if (imageReqError) imageReqError.style.display = 'none';
    }
    const imageRequirement = selectedImageReq ? selectedImageReq.value : '';

    // Validate Event Date (Optional, but cannot be yesterday, today, or tomorrow)
    if (!validateEventDateInput()) {
      hasErrors = true;
    }

    // 9. Validate Delivery Date (Optional normal field, but if specified must be >= 48 hours)
    if (!validateDeliveryDateInput()) {
      hasErrors = true;
    }

    // Check if any errors occurred
    if (hasErrors) {
      const firstErrorEl = form ? form.querySelector('.is-invalid, .has-error') : null;
      if (firstErrorEl) {
        firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const focusable = firstErrorEl.querySelector('input, select, textarea') || (firstErrorEl.focus ? firstErrorEl : null);
        if (focusable && focusable.focus) focusable.focus();
      }
      return;
    }

    // Collect all dynamic LinkedIn IDs
    const linkedinVals = Array.from(document.querySelectorAll('.linkedin-id-input'))
      .map(el => el.value.trim())
      .filter(val => val && val.toUpperCase() !== 'NA');
    const finalLinkedInIds = linkedinVals.length > 0 ? linkedinVals.join(', ') : 'NA';

    // Collect all dynamic Instagram IDs
    const instagramVals = Array.from(document.querySelectorAll('.instagram-id-input'))
      .map(el => el.value.trim())
      .filter(val => val && val.toUpperCase() !== 'NA');
    const finalInstagramIds = instagramVals.length > 0 ? instagramVals.join(', ') : 'NA';

    // Construct Payload safely
    const payload = {
      portfolio: portfolioSelect ? portfolioSelect.value : '',
      requestTitle: requestTitleInput ? requestTitleInput.value.trim() : '',
      submitterName: submitterNameInput ? submitterNameInput.value.trim() : '',
      submitterRole: (submitterRoleInput ? submitterRoleInput.value.trim() : '') || 'NA',
      submitterEmail: submitterEmailInput ? submitterEmailInput.value.trim() : '',
      submitterPhone: (submitterPhoneInput ? submitterPhoneInput.value.trim() : '') || 'NA',
      publishingChannel: publishingChannel,
      headline: (headlineInput ? headlineInput.value.trim() : '') || 'NA',
      mainContent: (mainContentTextarea && mainContentTextarea.value.trim()) ? mainContentTextarea.value.trim() : 'NA',
      keyHighlights: (keyHighlightsInput ? keyHighlightsInput.value.trim() : '') || 'NA',
      hashtags: hashtagsInput ? hashtagsInput.value.trim() : '',
      mentions: mentionsInput ? mentionsInput.value.trim() : '',
      linkedinIds: finalLinkedInIds,
      instagramIds: finalInstagramIds,
      eventName: (eventNameInput ? eventNameInput.value.trim() : '') || 'NA',
      eventDate: (eventDateInput ? eventDateInput.value.trim() : '') || 'NA',
      eventTime: (eventTimeInput ? eventTimeInput.value.trim() : '') || 'NA',
      timeZone: (timeZoneInput ? timeZoneInput.value.trim() : '') || 'NA',
      mediaFiles: selectedFiles || [],
      videoPublicLink: videoPublicLinkInput ? videoPublicLinkInput.value.trim() : '',
      noMediaCheckbox: imageRequirement === 'Create Image',
      imageRequirement: imageRequirement,
      deliveryDate: (deliveryDateInput && deliveryDateInput.value.trim()) ? deliveryDateInput.value.trim() : 'NA',
      deliveryTime: deliveryTimeInput ? deliveryTimeInput.value : '09:00',
      repostComments: repostCommentsTextarea ? repostCommentsTextarea.value.trim() : ''
    };

    // UI Submitting State
    isSubmitting = true;
    if (submitRequestBtn) submitRequestBtn.disabled = true;
    if (submitBtnText) submitBtnText.textContent = 'Recording Requisition...';

    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok && result.success) {
        // Show Private Tracking Receipt
        if (receiptReferenceId) receiptReferenceId.textContent = result.referenceId;

        // Check if submitter required an image to be created
        const needsImageCreated = (payload.imageRequirement === 'Create Image') && !payload.noMediaCheckbox;
        if (needsImageCreated) {
          if (receiptImageReqNotice) receiptImageReqNotice.style.display = 'block';
          if (receiptHostingReqNotice) receiptHostingReqNotice.style.display = 'none';
          if (receiptFillMediaFormBtn) {
            const mediaUrl = new URL('media-request.html', window.location.href);
            mediaUrl.searchParams.set('ref', result.referenceId);
            mediaUrl.searchParams.set('portfolio', payload.portfolio || '');
            mediaUrl.searchParams.set('name', payload.submitterName || '');
            mediaUrl.searchParams.set('email', payload.submitterEmail || '');
            mediaUrl.searchParams.set('role', payload.submitterRole && payload.submitterRole !== 'NA' ? payload.submitterRole : '');
            mediaUrl.searchParams.set('phone', payload.submitterPhone && payload.submitterPhone !== 'NA' ? payload.submitterPhone : '');
            mediaUrl.searchParams.set('title', payload.requestTitle || '');
            receiptFillMediaFormBtn.href = mediaUrl.toString();
          }
          openReceiptModal();
        } else {
          // Submitter DOES NOT need an image created -> Direct redirect to hosting details so they can select fields!
          if (receiptImageReqNotice) receiptImageReqNotice.style.display = 'none';
          if (receiptHostingReqNotice) receiptHostingReqNotice.style.display = 'block';

          const hostingUrl = new URL('media-request.html', window.location.href);
          hostingUrl.searchParams.set('mode', 'hosting');
          hostingUrl.searchParams.set('ref', result.referenceId);
          hostingUrl.searchParams.set('portfolio', payload.portfolio || '');
          hostingUrl.searchParams.set('name', payload.submitterName || '');
          hostingUrl.searchParams.set('email', payload.submitterEmail || '');
          hostingUrl.searchParams.set('role', payload.submitterRole && payload.submitterRole !== 'NA' ? payload.submitterRole : '');
          hostingUrl.searchParams.set('phone', payload.submitterPhone && payload.submitterPhone !== 'NA' ? payload.submitterPhone : '');
          hostingUrl.searchParams.set('title', payload.requestTitle || '');
          hostingUrl.hash = 'section-hosting';

          if (receiptFillHostingFormBtn) {
            receiptFillHostingFormBtn.href = hostingUrl.toString();
          }

          openReceiptModal();

          // Direct redirect so they can select the fields
          let countdown = 2;
          const redirectTimer = setInterval(() => {
            countdown--;
            if (hostingRedirectCountdown) hostingRedirectCountdown.textContent = String(countdown);
            if (countdown <= 0) {
              clearInterval(redirectTimer);
              window.location.href = hostingUrl.toString();
            }
          }, 800);
        }
        resetForm();
      } else {
        alert(result.error || 'Unable to record content requisition. Please review your input and try again.');
      }
    } catch (netErr) {
      console.error('Submission network error:', netErr);
      alert('Network connection error. Please verify your connection to the server and retry.');
    } finally {
      isSubmitting = false;
      if (submitRequestBtn) submitRequestBtn.disabled = false;
      if (submitBtnText) submitBtnText.textContent = 'Submit Content Request';
    }
  }

  function scrollToFormTop() {
    const formCard = document.querySelector('.form-card');
    if (formCard && typeof formCard.scrollIntoView === 'function') {
      formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setTimeout(() => {
      if (portfolioSelect) {
        portfolioSelect.focus({ preventScroll: true });
      }
    }, 350);
  }

  function resetForm(shouldScroll = false) {
    form.reset();
    selectedFiles = [];
    renderFileChips();
    setupDeliveryDateMin();
    updateWordCounter();

    // Reset radio selection for publishing channel (none selected)
    document.querySelectorAll('.radio-group[aria-label="Publishing Channel Selection"] .radio-card').forEach(card => card.classList.remove('selected'));
    document.querySelectorAll('input[name="publishingChannel"]').forEach(radio => radio.checked = false);
    const channelError = document.getElementById('publishingChannel-error');
    if (channelError) channelError.style.display = 'none';
    const groupChannel = document.getElementById('group-publishingChannel');
    if (groupChannel) groupChannel.classList.remove('has-error');

    // Reset radio selection for image requirement (none selected)
    document.querySelectorAll('#label-imageReq-create, #label-imageReq-none').forEach(card => card.classList.remove('selected'));
    document.querySelectorAll('input[name="imageRequirement"]').forEach(radio => radio.checked = false);
    const imageReqError = document.getElementById('imageRequirement-error');
    if (imageReqError) imageReqError.style.display = 'none';
    const groupImageReq = document.getElementById('group-imageRequirement');
    if (groupImageReq) groupImageReq.classList.remove('has-error');

    // Reset mentions and dynamic social fields
    if (mentionsInput) mentionsInput.value = '0';
    renderSocialFields(0);

    // Reset delivery time & comments
    if (deliveryTimeInput) deliveryTimeInput.value = '09:00';
    if (repostCommentsTextarea) repostCommentsTextarea.value = '';

    // Reset video validation status
    if (videoSuccessMsg) videoSuccessMsg.style.display = 'none';

    setupDeliveryDateMin();
    setupEventDateMin();

    // Remove validation errors
    form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    form.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));

    if (shouldScroll) {
      scrollToFormTop();
    }
  }

  /**
   * Receipt Modal Open / Close & Copy
   */
  function openReceiptModal() {
    if (!receiptModal) return;
    receiptModal.classList.add('is-open');
    if (copyReferenceIdBtn) copyReferenceIdBtn.focus();
  }

  function closeReceiptModal() {
    if (!receiptModal) return;
    receiptModal.classList.remove('is-open');
    if (portfolioSelect) portfolioSelect.focus();
  }

  function copyReferenceId() {
    const id = receiptReferenceId.textContent.trim();
    if (!id) return;

    navigator.clipboard.writeText(id).then(() => {
      copyBtnText.textContent = 'Copied to Clipboard!';
      setTimeout(() => {
        copyBtnText.textContent = 'Copy Reference ID';
      }, 2500);
    }).catch(() => {
      // Fallback
      copyBtnText.textContent = 'Copied!';
    });
  }

  // Self-execute initialization on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

