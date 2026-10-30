/**
 * PMI Pearl City Chapter - Creative Media & Hosting Requisition Portal
 * Client-Side Application Controller (Image/Video Creation & Direct Hosting Details)
 */

(function () {
  'use strict';

  // DOM Elements - Form & Layout
  const form = document.getElementById('mediaRequestForm');
  const sectionRequester = document.getElementById('section-requester');
  const sectionCreativeSpecs = document.getElementById('section-creative-specs');
  const sectionCreativeBrief = document.getElementById('section-creative-brief');
  const sectionHosting = document.getElementById('section-hosting');

  const hostingModeBanner = document.getElementById('hostingModeBanner');
  const hostingLinkedRefDisplay = document.getElementById('hostingLinkedRefDisplay');
  const linkedBanner = document.getElementById('linkedRequisitionBanner');
  const linkedRequisitionIdText = document.getElementById('linkedRequisitionIdText');
  const hostingBypassNotice = document.getElementById('hostingBypassNotice');
  const hostingDirectNotice = document.getElementById('hostingDirectNotice');
  const hostingPostCreationNotice = document.getElementById('hostingPostCreationNotice');
  const toggleCreativeSectionsBtn = document.getElementById('toggleCreativeSectionsBtn');
  const hostingSectionLegend = document.getElementById('hostingSectionLegend');

  const formHeaderBadge = document.getElementById('formHeaderBadge');
  const formHeaderBadgeText = document.getElementById('formHeaderBadgeText');
  const formTitle = document.getElementById('formTitle');
  const formHeaderDesc = document.getElementById('formHeaderDesc');

  // Form Fields - Requester
  const contentReqIdInput = document.getElementById('contentReqId');
  const portfolioSelect = document.getElementById('portfolio');
  const submitterNameInput = document.getElementById('submitterName');
  const submitterRoleInput = document.getElementById('submitterRole');
  const submitterEmailInput = document.getElementById('submitterEmail');
  const submitterPhoneInput = document.getElementById('submitterPhone');

  // Form Fields - Creative Specs
  const assetCategorySelect = document.getElementById('assetCategory');
  const dimensionsSelect = document.getElementById('dimensions');
  const groupCustomDimensions = document.getElementById('group-customDimensions');
  const customDimensionsInput = document.getElementById('customDimensions');

  // Form Fields - Creative Brief
  const projectTitleInput = document.getElementById('projectTitle');
  const headlineTextInput = document.getElementById('headlineText');
  const supportingTextTextarea = document.getElementById('supportingText');
  const designGuidanceTextarea = document.getElementById('designGuidance');

  const dropzone = document.getElementById('fileDropzone');
  const fileInput = document.getElementById('mediaFileInput');
  const fileChipsContainer = document.getElementById('fileChipsContainer');

  const referenceLinkInput = document.getElementById('referenceLink');
  const validateVideoLinkBtn = document.getElementById('validateVideoLinkBtn');
  const videoSuccessMsg = document.getElementById('video-success-msg');
  const videoError = document.getElementById('video-error');

  const deliveryDateInput = document.getElementById('deliveryDate');
  const deliveryDateError = document.getElementById('deliveryDate-error');
  const prioritySelect = document.getElementById('priority');

  // Form Fields - Hosting & Deployment
  const hostingTargetUrlInput = document.getElementById('hostingTargetUrl');
  const hostingLiveDateInput = document.getElementById('hostingLiveDate');
  const hostingWorkflowSelect = document.getElementById('hostingWorkflow');
  const hostingNotesTextarea = document.getElementById('hostingNotes');

  const resetFormBtn = document.getElementById('resetMediaFormBtn');
  const submitBtn = document.getElementById('submitMediaRequestBtn');
  const submitBtnText = document.getElementById('submitMediaBtnText');

  // Receipt Modal Elements
  const receiptModal = document.getElementById('mediaReceiptModal');
  const receiptReferenceId = document.getElementById('mediaReceiptReferenceId');
  const copyMediaRefBtn = document.getElementById('copyMediaRefBtn');
  const copyMediaBtnText = document.getElementById('copyMediaBtnText');
  const closeMediaReceiptBtn = document.getElementById('closeMediaReceiptBtn');
  const mediaReceiptModalTitle = document.getElementById('mediaReceiptModalTitle');
  const mediaReceiptSubtitle = document.getElementById('mediaReceiptSubtitle');
  const mediaReceiptIconBox = document.getElementById('mediaReceiptIconBox');
  const mediaReceiptNextStepsTitle = document.getElementById('mediaReceiptNextStepsTitle');
  const mediaReceiptNextStepsText = document.getElementById('mediaReceiptNextStepsText');
  const closeMediaReceiptBtnText = document.getElementById('closeMediaReceiptBtnText');

  // State
  let selectedFiles = []; // { name, size, type, isPdf, dataUrl }
  let isSubmitting = false;
  let isHostingMode = false;
  let creativeSectionsVisible = true;

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    prefillFromUrl();
    bindEvents();
  });

  /**
   * Auto-fill from URL query parameters (sent when redirected from initial form)
   */
  function prefillFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const ref = params.get('ref');
    const portfolio = params.get('portfolio');
    const name = params.get('name');
    const email = params.get('email');
    const role = params.get('role');
    const phone = params.get('phone');
    const title = params.get('title');

    isHostingMode = (mode === 'hosting') || (window.location.hash === '#section-hosting');

    if (ref) {
      if (contentReqIdInput) contentReqIdInput.value = ref;
      if (linkedBanner && linkedRequisitionIdText && !isHostingMode) {
        linkedRequisitionIdText.textContent = ref;
        linkedBanner.style.display = 'flex';
      }
      if (hostingLinkedRefDisplay) {
        hostingLinkedRefDisplay.textContent = ref;
      }
    }

    if (portfolio && portfolioSelect) {
      for (const opt of portfolioSelect.options) {
        if (opt.value === portfolio || opt.value.toLowerCase() === portfolio.toLowerCase()) {
          opt.selected = true;
          break;
        }
      }
    }

    if (name && submitterNameInput) submitterNameInput.value = name;
    if (email && submitterEmailInput) submitterEmailInput.value = email;
    if (role && submitterRoleInput && role !== 'NA') submitterRoleInput.value = role;
    if (phone && submitterPhoneInput && phone !== 'NA') submitterPhoneInput.value = phone;
    if (title && projectTitleInput) {
      projectTitleInput.value = title;
      if (headlineTextInput && !headlineTextInput.value) {
        headlineTextInput.value = title;
      }
    }

    if (isHostingMode) {
      activateHostingMode(ref, title);
    }
  }

  /**
   * Activate direct hosting mode for requisitions not requiring image creation
   */
  function activateHostingMode(ref, title) {
    isHostingMode = true;
    creativeSectionsVisible = false;

    // Header badge
    if (formHeaderBadge) {
      formHeaderBadge.style.color = '#15803d';
      formHeaderBadge.style.background = '#f0fdf4';
      formHeaderBadge.style.borderColor = '#86efac';
    }
    if (formHeaderBadgeText) {
      formHeaderBadgeText.textContent = 'Hosting & Deployment Intake';
    }

    // Title & description
    if (formTitle) {
      formTitle.textContent = 'Specify Hosting & Publishing Details';
    }
    if (formHeaderDesc) {
      formHeaderDesc.textContent = 'Select where your content and visual assets will be hosted and distributed across chapter channels. Since new creative generation is not required for this requisition, creative briefs are bypassed.';
    }

    // Banners
    if (hostingModeBanner) {
      if (hostingLinkedRefDisplay && ref) hostingLinkedRefDisplay.textContent = ref;
      hostingModeBanner.style.display = 'flex';
    }
    if (linkedBanner) {
      linkedBanner.style.display = 'none';
    }

    // Bypass creative sections B & C
    if (sectionCreativeSpecs) sectionCreativeSpecs.style.display = 'none';
    if (sectionCreativeBrief) sectionCreativeBrief.style.display = 'none';
    if (hostingBypassNotice) hostingBypassNotice.style.display = 'block';

    // Section D notices & styling
    if (hostingPostCreationNotice) hostingPostCreationNotice.style.display = 'none';
    if (hostingDirectNotice) hostingDirectNotice.style.display = 'flex';
    if (hostingSectionLegend) hostingSectionLegend.textContent = 'Hosting & Publishing Channels Selection';

    if (sectionHosting) {
      sectionHosting.style.border = '2px solid #10b981';
      sectionHosting.style.boxShadow = '0 4px 16px rgba(16, 185, 129, 0.12)';
      sectionHosting.style.borderRadius = 'var(--radius-lg, 12px)';
    }

    // Submit button styling & text
    if (submitBtn) {
      submitBtn.style.background = 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)';
      submitBtn.style.borderColor = '#0284c7';
    }
    if (submitBtnText) {
      submitBtnText.textContent = 'Confirm & Submit Hosting Specifications';
    }

    // Default title and headline for hosting-only requisition
    if (projectTitleInput && !projectTitleInput.value.trim()) {
      projectTitleInput.value = title || (ref ? `Content Requisition ${ref} Hosting` : 'Chapter Content Hosting');
    }
    if (headlineTextInput && !headlineTextInput.value.trim()) {
      headlineTextInput.value = 'NA';
    }

    // Direct scroll to Section D (Hosting Details) so user can select fields immediately
    setTimeout(() => {
      if (sectionHosting) {
        sectionHosting.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const firstCheckbox = sectionHosting.querySelector('input[type="checkbox"]');
        if (firstCheckbox) firstCheckbox.focus();
      }
    }, 200);
  }

  /**
   * Toggle visibility of creative specification sections
   */
  function toggleCreativeSections() {
    creativeSectionsVisible = !creativeSectionsVisible;
    if (creativeSectionsVisible) {
      if (sectionCreativeSpecs) sectionCreativeSpecs.style.display = 'block';
      if (sectionCreativeBrief) sectionCreativeBrief.style.display = 'block';
      if (toggleCreativeSectionsBtn) toggleCreativeSectionsBtn.textContent = 'Hide Creative Specs';
    } else {
      if (sectionCreativeSpecs) sectionCreativeSpecs.style.display = 'none';
      if (sectionCreativeBrief) sectionCreativeBrief.style.display = 'none';
      if (toggleCreativeSectionsBtn) toggleCreativeSectionsBtn.textContent = 'Need Image Created Instead? Show Creative Specs';
    }
  }

  /**
   * Bind event listeners
   */
  function bindEvents() {
    // Toggle creative sections in hosting mode
    if (toggleCreativeSectionsBtn) {
      toggleCreativeSectionsBtn.addEventListener('click', toggleCreativeSections);
    }

    // Radio cards styling - Request Type
    const typeRadios = document.querySelectorAll('input[name="requestType"]');
    typeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('#label-type-image, #label-type-video, #label-type-both').forEach(card => card.classList.remove('selected'));
        const parentCard = radio.closest('.radio-card');
        if (parentCard) parentCard.classList.add('selected');
      });
    });

    // Custom dimensions toggle
    if (dimensionsSelect) {
      dimensionsSelect.addEventListener('change', () => {
        if (dimensionsSelect.value === 'Custom') {
          if (groupCustomDimensions) groupCustomDimensions.style.display = 'block';
          if (customDimensionsInput) customDimensionsInput.focus();
        } else {
          if (groupCustomDimensions) groupCustomDimensions.style.display = 'none';
        }
      });
    }

    // Dropzone setup
    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());
      dropzone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInput.click();
        }
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('drag-active');
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('drag-active');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
          handleIncomingFiles(dt.files);
        }
      });

      fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files.length > 0) {
          handleIncomingFiles(fileInput.files);
          fileInput.value = '';
        }
      });
    }

    // Video validation
    if (validateVideoLinkBtn && referenceLinkInput) {
      validateVideoLinkBtn.addEventListener('click', validateReferenceVideoLink);
      referenceLinkInput.addEventListener('input', () => {
        if (videoSuccessMsg) videoSuccessMsg.style.display = 'none';
        if (videoError) videoError.style.display = 'none';
        referenceLinkInput.classList.remove('is-invalid');
      });
    }

    // Delivery date validation
    if (deliveryDateInput) {
      deliveryDateInput.addEventListener('input', validateDeliveryDateInput);
      deliveryDateInput.addEventListener('change', validateDeliveryDateInput);
    }

    // Reset button
    if (resetFormBtn) {
      resetFormBtn.addEventListener('click', resetForm);
    }

    // Form submit
    if (form) {
      form.addEventListener('submit', handleFormSubmit);
    }

    // Receipt Modal
    if (copyMediaRefBtn) {
      copyMediaRefBtn.addEventListener('click', copyReferenceId);
    }
    if (closeMediaReceiptBtn) {
      closeMediaReceiptBtn.addEventListener('click', closeReceiptModal);
    }
  }

  /**
   * File processing & drag and drop
   */
  function handleIncomingFiles(fileList) {
    const maxFiles = 10;
    const maxBytes = 15 * 1024 * 1024; // 15MB

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (selectedFiles.length >= maxFiles) {
        alert(`Maximum ${maxFiles} attachments permitted.`);
        break;
      }

      if (file.size > maxBytes) {
        alert(`File "${file.name}" exceeds the maximum permitted size of 15MB.`);
        continue;
      }

      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (!isImage && !isPdf) {
        alert(`File "${file.name}" has an unsupported format. Please upload standard images (PNG, JPG, WEBP) or PDF documents.`);
        continue;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        selectedFiles.push({
          name: file.name,
          size: file.size,
          type: file.type || (isPdf ? 'application/pdf' : 'image/png'),
          isPdf: isPdf,
          dataUrl: e.target.result
        });
        renderFileChips();
      };
      reader.readAsDataURL(file);
    }
  }

  function renderFileChips() {
    if (!fileChipsContainer) return;
    fileChipsContainer.innerHTML = '';

    selectedFiles.forEach((file, index) => {
      const chip = document.createElement('div');
      chip.className = 'file-chip';

      const typeLabel = file.isPdf ? 'PDF' : 'IMG';
      const sizeKb = (file.size / 1024).toFixed(0);

      chip.innerHTML = `
        <span style="font-weight: 700; font-size: 0.75rem; background: var(--pmi-blue-light); color: var(--pmi-dark); padding: 0.15rem 0.4rem; border-radius: 4px;">${typeLabel}</span>
        <span class="file-chip-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)} (${sizeKb} KB)</span>
        <button type="button" class="file-chip-remove" aria-label="Remove ${escapeHtml(file.name)}">&times;</button>
      `;

      chip.querySelector('.file-chip-remove').addEventListener('click', () => {
        selectedFiles.splice(index, 1);
        renderFileChips();
      });

      fileChipsContainer.appendChild(chip);
    });
  }

  /**
   * Video URL validation
   */
  async function validateReferenceVideoLink() {
    const url = referenceLinkInput ? referenceLinkInput.value.trim() : '';
    if (!url || url.toUpperCase() === 'NA') {
      if (videoError) {
        videoError.textContent = 'Please enter a video URL to validate.';
        videoError.style.display = 'block';
      }
      return;
    }

    validateVideoLinkBtn.disabled = true;
    validateVideoLinkBtn.textContent = 'Validating...';

    try {
      const response = await fetch('/api/validate-video-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        if (videoError) videoError.style.display = 'none';
        if (videoSuccessMsg) videoSuccessMsg.style.display = 'block';
        if (referenceLinkInput) {
          referenceLinkInput.classList.remove('is-invalid');
          referenceLinkInput.classList.add('is-valid');
          if (data.cleanUrl) referenceLinkInput.value = data.cleanUrl;
        }
      } else {
        if (videoSuccessMsg) videoSuccessMsg.style.display = 'none';
        if (videoError) {
          videoError.textContent = data.error || 'Please provide a valid public video link.';
          videoError.style.display = 'block';
        }
        if (referenceLinkInput) referenceLinkInput.classList.add('is-invalid');
      }
    } catch (err) {
      if (videoError) {
        videoError.textContent = 'Could not validate link. Please check your network connection.';
        videoError.style.display = 'block';
      }
    } finally {
      validateVideoLinkBtn.disabled = false;
      validateVideoLinkBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>Validate Link</span>
      `;
    }
  }

  /**
   * Delivery date 48-hour validation
   */
  function validateDeliveryDateInput() {
    if (!deliveryDateInput) return true;
    const val = deliveryDateInput.value;
    if (!val || val.trim() === '' || val.toUpperCase() === 'NA') {
      deliveryDateInput.classList.remove('is-invalid');
      if (deliveryDateError) deliveryDateError.style.display = 'none';
      return true;
    }

    const parts = val.split('-');
    if (parts.length !== 3) return true;
    const targetDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const minDate = new Date(today);
    minDate.setDate(today.getDate() + 2); // At least 2 days ahead

    if (targetDate < minDate) {
      deliveryDateInput.classList.add('is-invalid');
      if (deliveryDateError) deliveryDateError.style.display = 'block';
      return false;
    } else {
      deliveryDateInput.classList.remove('is-invalid');
      if (deliveryDateError) deliveryDateError.style.display = 'none';
      return true;
    }
  }

  /**
   * Form Submission
   */
  async function handleFormSubmit(e) {
    e.preventDefault();
    if (isSubmitting) return;

    // Validate Required Fields
    let hasErrors = false;

    // Portfolio
    const groupPortfolio = document.getElementById('group-portfolio');
    const portfolioError = document.getElementById('portfolio-error');
    if (!portfolioSelect || !portfolioSelect.value) {
      if (groupPortfolio) groupPortfolio.classList.add('has-error');
      if (portfolioError) portfolioError.style.display = 'block';
      hasErrors = true;
    } else {
      if (groupPortfolio) groupPortfolio.classList.remove('has-error');
      if (portfolioError) portfolioError.style.display = 'none';
    }

    // Requester Name
    const groupName = document.getElementById('group-submitterName');
    const nameError = document.getElementById('name-error');
    if (!submitterNameInput || !submitterNameInput.value.trim()) {
      if (groupName) groupName.classList.add('has-error');
      if (nameError) nameError.style.display = 'block';
      hasErrors = true;
    } else {
      if (groupName) groupName.classList.remove('has-error');
      if (nameError) nameError.style.display = 'none';
    }

    // Email
    const groupEmail = document.getElementById('group-submitterEmail');
    const emailError = document.getElementById('email-error');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!submitterEmailInput || !emailRegex.test(submitterEmailInput.value.trim())) {
      if (groupEmail) groupEmail.classList.add('has-error');
      if (emailError) emailError.style.display = 'block';
      hasErrors = true;
    } else {
      if (groupEmail) groupEmail.classList.remove('has-error');
      if (emailError) emailError.style.display = 'none';
    }

    // Project Title & Headline (Validated only if in creative mode or user opened creative specs)
    const groupTitle = document.getElementById('group-projectTitle');
    const titleError = document.getElementById('title-error');

    if (!isHostingMode || creativeSectionsVisible) {
      if (!projectTitleInput || !projectTitleInput.value.trim()) {
        if (groupTitle) groupTitle.classList.add('has-error');
        if (titleError) titleError.style.display = 'block';
        hasErrors = true;
      } else {
        if (groupTitle) groupTitle.classList.remove('has-error');
        if (titleError) titleError.style.display = 'none';
      }

      // Headline Text
      if (!headlineTextInput || !headlineTextInput.value.trim()) {
        headlineTextInput.classList.add('is-invalid');
        hasErrors = true;
      } else {
        headlineTextInput.classList.remove('is-invalid');
      }

      // Delivery Date
      if (!validateDeliveryDateInput()) {
        hasErrors = true;
      }
    } else {
      // In hosting mode with bypassed creative specs, ensure no error states
      if (groupTitle) groupTitle.classList.remove('has-error');
      if (titleError) titleError.style.display = 'none';
      if (headlineTextInput) headlineTextInput.classList.remove('is-invalid');
    }

    if (hasErrors) {
      const firstError = document.querySelector('.has-error, .is-invalid');
      if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Request Type
    const selectedType = document.querySelector('input[name="requestType"]:checked');
    const requestType = selectedType ? selectedType.value : 'Image Creation';

    // Hosting Channels
    const checkedChannels = [];
    document.querySelectorAll('input[name="hostingChannel"]:checked').forEach(cb => {
      checkedChannels.push(cb.value);
    });

    if (checkedChannels.length === 0) {
      const officialSiteCheckbox = document.querySelector('input[name="hostingChannel"][value="Official Website"]');
      if (officialSiteCheckbox) {
        officialSiteCheckbox.checked = true;
        checkedChannels.push('Official Website');
      }
    }

    const resolvedTitle = (projectTitleInput && projectTitleInput.value.trim())
      ? projectTitleInput.value.trim()
      : (contentReqIdInput && contentReqIdInput.value.trim() ? `Hosting for Requisition ${contentReqIdInput.value.trim()}` : 'Chapter Content Hosting');

    const resolvedHeadline = (headlineTextInput && headlineTextInput.value.trim())
      ? headlineTextInput.value.trim()
      : 'NA';

    const payload = {
      contentReqId: contentReqIdInput ? contentReqIdInput.value.trim() : 'NA',
      portfolio: portfolioSelect.value,
      submitterName: submitterNameInput.value.trim(),
      submitterRole: submitterRoleInput ? submitterRoleInput.value.trim() : 'NA',
      submitterEmail: submitterEmailInput.value.trim(),
      submitterPhone: submitterPhoneInput ? submitterPhoneInput.value.trim() : 'NA',
      requestType: isHostingMode ? 'Hosting Only (No Image Creation)' : requestType,
      assetCategory: isHostingMode ? 'Direct Hosting / Publishing' : (assetCategorySelect ? assetCategorySelect.value : 'Event Announcement'),
      dimensions: isHostingMode ? 'Standard Channel Dimensions' : (dimensionsSelect ? dimensionsSelect.value : 'Square (1:1)'),
      customDimensions: customDimensionsInput ? customDimensionsInput.value.trim() : '',
      projectTitle: resolvedTitle,
      headlineText: resolvedHeadline,
      supportingText: supportingTextTextarea ? supportingTextTextarea.value.trim() : '',
      designGuidance: designGuidanceTextarea ? designGuidanceTextarea.value.trim() : '',
      referenceLink: referenceLinkInput ? referenceLinkInput.value.trim() : '',
      deliveryDate: (deliveryDateInput && deliveryDateInput.value.trim()) ? deliveryDateInput.value.trim() : 'NA',
      deliveryTime: '09:00',
      priority: prioritySelect ? prioritySelect.value : 'Standard',
      hostingChannels: checkedChannels.length > 0 ? checkedChannels : ['Official Website', 'LinkedIn'],
      hostingTargetUrl: hostingTargetUrlInput ? hostingTargetUrlInput.value.trim() : '',
      hostingLiveDate: hostingLiveDateInput ? hostingLiveDateInput.value.trim() : '',
      hostingNotes: hostingNotesTextarea ? hostingNotesTextarea.value.trim() : '',
      hostingWorkflow: hostingWorkflowSelect ? hostingWorkflowSelect.value : 'Publish Automatically',
      hostingStatus: isHostingMode ? 'Hosting Details Provided' : 'Pending Creation',
      mediaFiles: selectedFiles || []
    };

    isSubmitting = true;
    if (submitBtn) submitBtn.disabled = true;
    if (submitBtnText) submitBtnText.textContent = isHostingMode ? 'Submitting Specifications...' : 'Recording Requisition...';

    try {
      const response = await fetch('/api/media-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));

      if (response.ok && result.success) {
        if (receiptReferenceId) receiptReferenceId.textContent = result.referenceId;
        openReceiptModal();
        resetForm();
      } else {
        alert(result.error || 'Unable to record creative requisition. Please review input and try again.');
      }
    } catch (err) {
      alert('Network error connecting to the server. Please verify your connection and try again.');
    } finally {
      isSubmitting = false;
      if (submitBtn) submitBtn.disabled = false;
      if (submitBtnText) {
        submitBtnText.textContent = isHostingMode ? 'Confirm & Submit Hosting Specifications' : 'Submit Creative Request';
      }
    }
  }

  function resetForm() {
    if (form) form.reset();
    selectedFiles = [];
    renderFileChips();
    if (groupCustomDimensions) groupCustomDimensions.style.display = 'none';
    if (videoSuccessMsg) videoSuccessMsg.style.display = 'none';
    if (videoError) videoError.style.display = 'none';
    document.querySelectorAll('.has-error, .is-invalid').forEach(el => el.classList.remove('has-error', 'is-invalid'));
    document.querySelectorAll('#label-type-image, #label-type-video, #label-type-both').forEach(card => card.classList.remove('selected'));
    const imgLabel = document.getElementById('label-type-image');
    if (imgLabel) imgLabel.classList.add('selected');
    const typeImage = document.getElementById('typeImage');
    if (typeImage) typeImage.checked = true;
  }

  function openReceiptModal() {
    if (!receiptModal) return;
    if (isHostingMode) {
      if (mediaReceiptModalTitle) mediaReceiptModalTitle.textContent = 'Hosting specifications submitted successfully!';
      if (mediaReceiptSubtitle) mediaReceiptSubtitle.textContent = 'Your hosting channels and publishing schedule have been recorded and linked to your content requisition.';
      if (mediaReceiptIconBox) {
        mediaReceiptIconBox.style.background = '#dcfce7';
        mediaReceiptIconBox.style.color = '#15803d';
      }
      if (mediaReceiptNextStepsTitle) mediaReceiptNextStepsTitle.textContent = 'Publishing & Deployment Status:';
      if (mediaReceiptNextStepsText) mediaReceiptNextStepsText.textContent = 'The chapter webmaster and editorial leads have received your hosting details. Your content will be deployed across the specified channels according to your timeline and approval workflow.';
      if (closeMediaReceiptBtnText) closeMediaReceiptBtnText.textContent = 'Submit Another Requisition';
    } else {
      if (mediaReceiptModalTitle) mediaReceiptModalTitle.textContent = 'Creative request submitted successfully!';
      if (mediaReceiptSubtitle) mediaReceiptSubtitle.textContent = 'Your requisition for image/video creation has been recorded in the permanent SQLite database for the MARCOM production team.';
      if (mediaReceiptIconBox) {
        mediaReceiptIconBox.style.background = '#ffedd5';
        mediaReceiptIconBox.style.color = '#ea580c';
      }
      if (mediaReceiptNextStepsTitle) mediaReceiptNextStepsTitle.textContent = 'Hosting & Publishing Next Steps:';
      if (mediaReceiptNextStepsText) mediaReceiptNextStepsText.textContent = 'Once the creative team completes your image or video, your hosting details will be verified and the asset will be deployed to the designated chapter channels. You can also provide or update hosting links anytime.';
      if (closeMediaReceiptBtnText) closeMediaReceiptBtnText.textContent = 'Submit Another Creative Request';
    }
    receiptModal.classList.add('is-open');
    if (copyMediaRefBtn) copyMediaRefBtn.focus();
  }

  function closeReceiptModal() {
    if (!receiptModal) return;
    receiptModal.classList.remove('is-open');
    if (portfolioSelect) portfolioSelect.focus();
  }

  function copyReferenceId() {
    const id = receiptReferenceId ? receiptReferenceId.textContent.trim() : '';
    if (!id) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(id).then(() => {
        if (copyMediaBtnText) copyMediaBtnText.textContent = '✓ Copied!';
        setTimeout(() => {
          if (copyMediaBtnText) copyMediaBtnText.textContent = 'Copy Tracking ID';
        }, 2200);
      }).catch(() => fallbackCopy(id));
    } else {
      fallbackCopy(id);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      if (copyMediaBtnText) copyMediaBtnText.textContent = '✓ Copied!';
      setTimeout(() => {
        if (copyMediaBtnText) copyMediaBtnText.textContent = 'Copy Tracking ID';
      }, 2200);
    } catch (e) {}
    document.body.removeChild(ta);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
