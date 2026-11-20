/**
 * Kim Bosung - Smart Image Resizer
 * High-performance client-side image processing, ratio adjustment, 
 * progress tracking, single download, and JSZip batch archiving.
 */

(function () {
  'use strict';

  // --- State ---
  const state = {
    ratio: {
      key: '1:1',
      w: 1,
      h: 1
    },
    mode: 'padding', // 'padding' | 'crop'
    paddingColor: '#FFFFFF',
    items: [], // Array of ImageItem
    isProcessingAll: false
  };

  // --- DOM Elements ---
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const btnBrowseFiles = document.getElementById('btn-browse-files');
  const ratioButtons = document.querySelectorAll('.ratio-btn');
  const customRatioBox = document.getElementById('custom-ratio-box');
  const customWInput = document.getElementById('custom-w');
  const customHInput = document.getElementById('custom-h');
  
  const modeRadios = document.querySelectorAll('input[name="resize-mode"]');
  const modePaddingCard = document.getElementById('mode-padding-card');
  const modeCropCard = document.getElementById('mode-crop-card');
  const paddingColorPanel = document.getElementById('padding-color-panel');
  const colorPresetBtns = document.querySelectorAll('.color-preset-btn');
  const customPaddingColor = document.getElementById('custom-padding-color');
  const colorPreviewChip = document.getElementById('color-preview-chip');
  const colorHexText = document.getElementById('color-hex-text');

  const actionBarSection = document.getElementById('action-bar-section');
  const totalFileCount = document.getElementById('total-file-count');
  const batchStatusText = document.getElementById('batch-status-text');
  const btnAddMore = document.getElementById('btn-add-more');
  const btnProcessAll = document.getElementById('btn-process-all');
  const btnClearAll = document.getElementById('btn-clear-all');
  const btnDownloadAll = document.getElementById('btn-download-all');

  const imageListSection = document.getElementById('image-list-section');
  const imageItemsContainer = document.getElementById('image-items-container');
  const listProgressBadge = document.getElementById('list-progress-badge');

  // Modal elements
  const previewModal = document.getElementById('preview-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalFilename = document.getElementById('modal-filename');
  const modalPreviewImg = document.getElementById('modal-preview-img');
  const modalOriginalImg = document.getElementById('modal-original-img');
  const modalResultImg = document.getElementById('modal-result-img');
  const modalCompareWrap = document.getElementById('modal-compare-wrap');
  const modalInfoText = document.getElementById('modal-info-text');
  const modalDownloadBtn = document.getElementById('modal-download-btn');
  const previewTabs = document.querySelectorAll('.preview-tab');

  const toastContainer = document.getElementById('toast-container');

  let activeModalItem = null;

  // --- Initialize Event Listeners ---
  function init() {
    setupUploadHandlers();
    setupRatioHandlers();
    setupModeHandlers();
    setupColorHandlers();
    setupBatchHandlers();
    setupModalHandlers();
  }

  // --- Notification System ---
  function showToast(message, type = 'info', icon = 'fa-info-circle') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="fa-solid ${icon}"></i>
      <span>${message}</span>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.95)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // --- Format Helpers ---
  function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function getBaseFileName(fileName) {
    const dotIdx = fileName.lastIndexOf('.');
    if (dotIdx === -1) return fileName;
    return fileName.substring(0, dotIdx);
  }

  function getFileExtension(fileName) {
    const dotIdx = fileName.lastIndexOf('.');
    if (dotIdx === -1) return 'jpg';
    return fileName.substring(dotIdx + 1).toLowerCase();
  }

  // --- Upload Event Handlers ---
  function setupUploadHandlers() {
    btnBrowseFiles.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    btnAddMore.addEventListener('click', () => {
      fileInput.click();
    });

    // Drag and Drop
    ['dragenter', 'dragover'].forEach(evtName => {
      dropZone.addEventListener(evtName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(evtName => {
      dropZone.addEventListener(evtName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleIncomingFiles(files);
      }
    });

    fileInput.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleIncomingFiles(files);
      }
      fileInput.value = ''; // Reset so the same file can be selected again
    });
  }

  // --- Ratio Handlers ---
  function setupRatioHandlers() {
    ratioButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        ratioButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const ratioKey = btn.dataset.ratio;
        state.ratio.key = ratioKey;

        if (ratioKey === 'custom') {
          customRatioBox.style.display = 'block';
          state.ratio.w = parseFloat(customWInput.value) || 1;
          state.ratio.h = parseFloat(customHInput.value) || 1;
        } else {
          customRatioBox.style.display = 'none';
          state.ratio.w = parseFloat(btn.dataset.w);
          state.ratio.h = parseFloat(btn.dataset.h);
        }

        onSettingChanged(`캔버스 비율이 ${ratioKey === 'custom' ? `${state.ratio.w}:${state.ratio.h}` : ratioKey}(으)로 변경되었습니다.`);
      });
    });

    [customWInput, customHInput].forEach(inp => {
      inp.addEventListener('input', () => {
        if (state.ratio.key === 'custom') {
          const w = Math.max(1, parseFloat(customWInput.value) || 1);
          const h = Math.max(1, parseFloat(customHInput.value) || 1);
          state.ratio.w = w;
          state.ratio.h = h;
          onSettingChanged(`커스텀 비율이 ${w}:${h}(으)로 변경되었습니다.`);
        }
      });
    });
  }

  // --- Mode Handlers (Padding vs Crop) ---
  function setupModeHandlers() {
    modeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const val = e.target.value;
        state.mode = val;

        if (val === 'padding') {
          modePaddingCard.classList.add('active');
          modeCropCard.classList.remove('active');
          paddingColorPanel.style.display = 'flex';
          onSettingChanged('변환 방식이 Padding (여백 채우기)으로 변경되었습니다.');
        } else {
          modeCropCard.classList.add('active');
          modePaddingCard.classList.remove('active');
          paddingColorPanel.style.display = 'none';
          onSettingChanged('변환 방식이 Crop (중앙 자르기)으로 변경되었습니다.');
        }
      });
    });
  }

  // --- Color Handlers ---
  function setupColorHandlers() {
    colorPresetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        colorPresetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const color = btn.dataset.color;
        setPaddingColor(color);
      });
    });

    customPaddingColor.addEventListener('input', (e) => {
      colorPresetBtns.forEach(b => b.classList.remove('active'));
      setPaddingColor(e.target.value.toUpperCase());
    });
  }

  function setPaddingColor(hexColor) {
    state.paddingColor = hexColor;
    colorPreviewChip.style.backgroundColor = hexColor;
    colorHexText.textContent = hexColor;
    customPaddingColor.value = hexColor;

    if (state.mode === 'padding') {
      onSettingChanged(`여백 색상이 ${hexColor}(으)로 변경되었습니다.`);
    }
  }

  // Setting change notification & auto re-trigger prompt
  function onSettingChanged(message) {
    if (state.items.length > 0) {
      showToast(message, 'info', 'fa-gear');
      // If we have items already processed, automatically start re-processing them
      processAllImages();
    }
  }

  // --- Batch Toolbar Handlers ---
  function setupBatchHandlers() {
    btnProcessAll.addEventListener('click', () => {
      processAllImages();
    });

    btnClearAll.addEventListener('click', () => {
      if (confirm('목록의 모든 이미지를 지우시겠습니까?')) {
        clearAllItems();
      }
    });

    btnDownloadAll.addEventListener('click', () => {
      downloadAllAsZip();
    });
  }

  // --- Modal Handlers ---
  function setupModalHandlers() {
    modalCloseBtn.addEventListener('click', closeModal);
    previewModal.addEventListener('click', (e) => {
      if (e.target === previewModal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && previewModal.style.display !== 'none') {
        closeModal();
      }
    });

    previewTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        previewTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        updateModalStageView(tab.dataset.tab);
      });
    });

    modalDownloadBtn.addEventListener('click', () => {
      if (activeModalItem && activeModalItem.resultBlob) {
        downloadSingleItem(activeModalItem);
      }
    });
  }

  function openModal(item) {
    activeModalItem = item;
    modalFilename.textContent = item.name;
    modalInfoText.textContent = `원본: ${item.originalWidth}x${item.originalHeight}px (${formatBytes(item.file.size)}) → 변환본: ${item.targetWidth}x${item.targetHeight}px (${formatBytes(item.resultBlob ? item.resultBlob.size : 0)})`;

    modalOriginalImg.src = item.originalUrl;
    if (item.resultUrl) {
      modalResultImg.src = item.resultUrl;
      modalPreviewImg.src = item.resultUrl;
      modalDownloadBtn.disabled = false;
    } else {
      modalResultImg.src = item.originalUrl;
      modalPreviewImg.src = item.originalUrl;
      modalDownloadBtn.disabled = true;
    }

    // Default to result tab
    previewTabs.forEach(t => t.classList.remove('active'));
    previewTabs[0].classList.add('active');
    updateModalStageView('result');

    previewModal.style.display = 'flex';
  }

  function updateModalStageView(tab) {
    if (!activeModalItem) return;
    if (tab === 'result') {
      modalPreviewImg.style.display = 'block';
      modalPreviewImg.src = activeModalItem.resultUrl || activeModalItem.originalUrl;
      modalCompareWrap.style.display = 'none';
    } else if (tab === 'original') {
      modalPreviewImg.style.display = 'block';
      modalPreviewImg.src = activeModalItem.originalUrl;
      modalCompareWrap.style.display = 'none';
    } else if (tab === 'compare') {
      modalPreviewImg.style.display = 'none';
      modalCompareWrap.style.display = 'grid';
    }
  }

  function closeModal() {
    previewModal.style.display = 'none';
    activeModalItem = null;
  }

  // --- File Processing Core ---
  async function handleIncomingFiles(fileList) {
    const validFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (validFiles.length === 0) {
      showToast('지원되지 않는 파일 형식입니다. 이미지 파일을 선택해 주세요.', 'error', 'fa-triangle-exclamation');
      return;
    }

    showToast(`${validFiles.length}개의 이미지가 추가되었습니다.`, 'success', 'fa-file-circle-check');

    for (const file of validFiles) {
      const item = {
        id: 'img_' + Math.random().toString(36).substring(2, 9),
        file: file,
        name: file.name,
        originalUrl: URL.createObjectURL(file),
        originalWidth: 0,
        originalHeight: 0,
        targetWidth: 0,
        targetHeight: 0,
        resultBlob: null,
        resultUrl: null,
        progress: 0,
        status: 'waiting', // 'waiting' | 'processing' | 'done' | 'error'
        errorMsg: ''
      };

      // Read image dimensions
      await loadImageDimensions(item);
      state.items.push(item);
      renderItemCard(item);
    }

    updateOverallUI();
    processAllImages();
  }

  function loadImageDimensions(item) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        item.originalWidth = img.naturalWidth;
        item.originalHeight = img.naturalHeight;
        resolve();
      };
      img.onerror = () => {
        item.originalWidth = 1000;
        item.originalHeight = 1000;
        resolve();
      };
      img.src = item.originalUrl;
    });
  }

  // --- Rendering Item Card in the List ---
  function renderItemCard(item) {
    const card = document.createElement('div');
    card.className = 'image-item-card';
    card.id = `card-${item.id}`;

    card.innerHTML = `
      <div class="item-thumbnail-box" title="클릭하여 미리보기/비교">
        <img src="${item.originalUrl}" alt="${item.name}" id="thumb-${item.id}">
        <div class="thumb-preview-overlay">
          <i class="fa-solid fa-magnifying-glass-plus"></i>
        </div>
      </div>
      
      <div class="item-main-content">
        <div class="item-info-row">
          <div class="item-filename-wrap">
            <span class="item-filename" title="${item.name}">${item.name}</span>
          </div>
          <div class="item-meta-badges">
            <span class="badge-res">원본: ${item.originalWidth}×${item.originalHeight}</span>
            <span class="badge-target" id="target-res-${item.id}">대기 중...</span>
            <span class="badge-res">${formatBytes(item.file.size)}</span>
          </div>
        </div>

        <div class="item-progress-section">
          <div class="progress-track">
            <div class="progress-fill" id="pfill-${item.id}" style="width: 0%;"></div>
          </div>
          <div class="progress-status-row">
            <span class="progress-msg" id="pmsg-${item.id}">
              <i class="fa-regular fa-clock"></i> 대기 중...
            </span>
            <span class="progress-pct" id="ppct-${item.id}">0%</span>
          </div>
        </div>
      </div>

      <div class="item-actions-box">
        <!-- Requirement 10: Individual Download Button activated at 100% -->
        <button type="button" class="btn btn-item-download" id="btndownload-${item.id}" disabled>
          <i class="fa-solid fa-download"></i>
          <span>다운로드</span>
        </button>
        <button type="button" class="btn-item-icon btn-delete" title="목록에서 삭제" id="btndelete-${item.id}">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `;

    // Click thumbnail -> Open preview modal
    const thumbBox = card.querySelector('.item-thumbnail-box');
    thumbBox.addEventListener('click', () => {
      openModal(item);
    });

    // Individual download button
    const btnDownload = card.querySelector(`#btndownload-${item.id}`);
    btnDownload.addEventListener('click', () => {
      downloadSingleItem(item);
    });

    // Delete item button
    const btnDelete = card.querySelector(`#btndelete-${item.id}`);
    btnDelete.addEventListener('click', () => {
      removeItem(item.id);
    });

    imageItemsContainer.appendChild(card);
  }

  function removeItem(itemId) {
    const idx = state.items.findIndex(it => it.id === itemId);
    if (idx !== -1) {
      const item = state.items[idx];
      if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      state.items.splice(idx, 1);

      const card = document.getElementById(`card-${itemId}`);
      if (card) {
        card.style.opacity = '0';
        card.style.transform = 'translateX(20px)';
        card.style.transition = 'all 0.25s ease';
        setTimeout(() => card.remove(), 250);
      }
      setTimeout(() => updateOverallUI(), 260);
    }
  }

  function clearAllItems() {
    state.items.forEach(it => {
      if (it.originalUrl) URL.revokeObjectURL(it.originalUrl);
      if (it.resultUrl) URL.revokeObjectURL(it.resultUrl);
    });
    state.items = [];
    imageItemsContainer.innerHTML = '';
    updateOverallUI();
    showToast('모든 이미지가 목록에서 제거되었습니다.', 'info', 'fa-trash-can');
  }

  function updateOverallUI() {
    const count = state.items.length;
    totalFileCount.textContent = count;

    if (count > 0) {
      actionBarSection.style.display = 'block';
      imageListSection.style.display = 'block';
    } else {
      actionBarSection.style.display = 'none';
      imageListSection.style.display = 'none';
    }

    const completedCount = state.items.filter(it => it.status === 'done').length;
    listProgressBadge.textContent = `${completedCount} / ${count} 완료`;

    // Requirement 11: 모든 사진이 끝나면 일괄 다운로드 버튼 활성화
    if (count > 0 && completedCount === count) {
      btnDownloadAll.disabled = false;
      batchStatusText.textContent = `모든 이미지(${count}장) 변환 완료! ZIP 다운로드가 가능합니다.`;
      batchStatusText.style.color = '#34d399';
    } else {
      btnDownloadAll.disabled = true;
      if (count > 0) {
        batchStatusText.textContent = `${completedCount} / ${count} 변환 완료`;
        batchStatusText.style.color = 'var(--text-muted)';
      }
    }
  }

  // --- Processing Queue ---
  async function processAllImages() {
    if (state.items.length === 0 || state.isProcessingAll) return;
    state.isProcessingAll = true;
    btnProcessAll.disabled = true;
    btnProcessAll.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>변환 진행 중...</span>';

    for (const item of state.items) {
      await processSingleImage(item);
    }

    state.isProcessingAll = false;
    btnProcessAll.disabled = false;
    btnProcessAll.innerHTML = '<i class="fa-solid fa-bolt"></i> <span>전체 다시 변환</span>';
    updateOverallUI();
  }

  /**
   * Process a single image with smooth progress bar animation
   */
  async function processSingleImage(item) {
    const card = document.getElementById(`card-${item.id}`);
    const pfill = document.getElementById(`pfill-${item.id}`);
    const pmsg = document.getElementById(`pmsg-${item.id}`);
    const ppct = document.getElementById(`ppct-${item.id}`);
    const btnDownload = document.getElementById(`btndownload-${item.id}`);
    const targetResBadge = document.getElementById(`target-res-${item.id}`);
    const thumbImg = document.getElementById(`thumb-${item.id}`);

    item.status = 'processing';
    card.classList.remove('completed');
    card.classList.add('processing');
    btnDownload.disabled = true;

    // Smooth progress update helper
    const setProgress = (pct, msg) => {
      item.progress = pct;
      if (pfill) pfill.style.width = `${pct}%`;
      if (ppct) ppct.textContent = `${pct}%`;
      if (pmsg) pmsg.innerHTML = msg;
    };

    try {
      // Step 1: Initialize (0% -> 25%)
      setProgress(15, '<i class="fa-solid fa-spinner fa-spin"></i> 이미지 로딩 중...');
      await new Promise(r => setTimeout(r, 60));

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('이미지 로딩 실패'));
        img.src = item.originalUrl;
      });

      item.originalWidth = img.naturalWidth;
      item.originalHeight = img.naturalHeight;

      // Step 2: Compute dimensions based on ratio and mode (25% -> 55%)
      setProgress(40, '<i class="fa-solid fa-wand-magic-sparkles"></i> 캔버스 크기 계산 및 조절...');
      await new Promise(r => setTimeout(r, 60));

      let blob = null;
      // 1. Try Local Python Backend Engine (Pillow LANCZOS)
      if (window.BSOfficeBridge) {
        try {
          setProgress(60, '<i class="fa-solid fa-bolt"></i> Python LANCZOS 고화질 렌더링 중...');
          const bridgeRes = await window.BSOfficeBridge.resizeImage(item.file, {
            ratio: state.ratio.key,
            mode: state.mode,
            customW: state.ratio.w,
            customH: state.ratio.h,
            paddingColor: state.paddingColor,
            format: (getFileExtension(item.name) === 'png') ? 'PNG' : 'JPEG'
          });
          if (bridgeRes && bridgeRes.blob) {
            blob = bridgeRes.blob;
            item.targetWidth = bridgeRes.width;
            item.targetHeight = bridgeRes.height;
            if (targetResBadge) {
              targetResBadge.textContent = `목표: ${bridgeRes.width}×${bridgeRes.height} (${state.ratio.key})`;
            }
          }
        } catch (bErr) {
          console.warn('Backend resize fallback to client canvas:', bErr);
        }
      }

      // 2. Client-side Canvas Fallback
      if (!blob) {
        const { canvas, targetW, targetH } = renderToCanvas(img, state.ratio, state.mode, state.paddingColor);
        item.targetWidth = targetW;
        item.targetHeight = targetH;
        if (targetResBadge) {
          targetResBadge.textContent = `목표: ${targetW}×${targetH} (${state.ratio.key})`;
        }

        // Step 3: Convert Canvas to Blob (55% -> 85%)
        setProgress(75, '<i class="fa-solid fa-file-image"></i> 고화질 렌더링 중...');
        await new Promise(r => setTimeout(r, 70));

        const ext = getFileExtension(item.name);
        let mimeType = 'image/jpeg';
        if (ext === 'png') mimeType = 'image/png';
        else if (ext === 'webp') mimeType = 'image/webp';

        blob = await new Promise((resolve) => {
          canvas.toBlob((b) => resolve(b), mimeType, 0.95);
        });
      }

      if (!blob) throw new Error('이미지 Blob 변환 실패');

      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      item.resultBlob = blob;
      item.resultUrl = URL.createObjectURL(blob);

      // Update thumbnail to transformed preview
      if (thumbImg) thumbImg.src = item.resultUrl;

      // Step 4: Requirement 9 & 10 (100% reached -> enable download button)
      setProgress(100, '<i class="fa-solid fa-check" style="color:#10b981;"></i> 변환 완료!');
      pfill.classList.add('completed');
      card.classList.remove('processing');
      card.classList.add('completed');

      item.status = 'done';
      btnDownload.disabled = false; // Requirement 10
      btnDownload.classList.add('btn-success');
      btnDownload.innerHTML = '<i class="fa-solid fa-download"></i> <span>다운로드</span>';

    } catch (err) {
      console.error(err);
      item.status = 'error';
      setProgress(100, `<i class="fa-solid fa-circle-exclamation" style="color:#f43f5e;"></i> 오류: ${err.message}`);
      card.classList.remove('processing');
      btnDownload.disabled = true;
    }

    updateOverallUI();
  }

  /**
   * Core Canvas Rendering Engine
   * Handles Requirement 4 (Ratio), Requirement 5 & 6 (Padding), Requirement 7 (Crop)
   */
  function renderToCanvas(img, ratio, mode, paddingColor) {
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    const targetRatio = ratio.w / ratio.h;
    const srcRatio = sw / sh;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: true });

    let canvasW, canvasH;

    if (mode === 'padding') {
      // Requirement 6: Padding Mode
      // 종횡비가 안 맞을 때 사진 전체를 축소/확대 없이 온전히 유지하고 여백을 남김
      if (srcRatio > targetRatio) {
        // Source is wider than target ratio: top/bottom padding
        canvasW = sw;
        canvasH = Math.round(sw / targetRatio);
      } else {
        // Source is taller than target ratio: left/right padding
        canvasH = sh;
        canvasW = Math.round(sh * targetRatio);
      }

      canvas.width = canvasW;
      canvas.height = canvasH;

      // Fill canvas background with user selected padding color (default white)
      ctx.fillStyle = paddingColor;
      ctx.fillRect(0, 0, canvasW, canvasH);

      // Calculate centered position for source image
      const dx = Math.round((canvasW - sw) / 2);
      const dy = Math.round((canvasH - sh) / 2);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, dx, dy, sw, sh);

    } else {
      // Requirement 7: Crop Mode
      // 사진의 일부를 잘라내면서(Center Crop) 종횡비를 맞춤
      let cropW, cropH, cropX, cropY;

      if (srcRatio > targetRatio) {
        // Source is wider than target: crop left & right
        cropH = sh;
        cropW = Math.round(sh * targetRatio);
        cropX = Math.round((sw - cropW) / 2);
        cropY = 0;
      } else {
        // Source is taller than target: crop top & bottom
        cropW = sw;
        cropH = Math.round(sw / targetRatio);
        cropX = 0;
        cropY = Math.round((sh - cropH) / 2);
      }

      canvasW = cropW;
      canvasH = cropH;
      canvas.width = canvasW;
      canvas.height = canvasH;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvasW, canvasH);
    }

    return { canvas, targetW: canvasW, targetH: canvasH };
  }

  // --- Single Download Handler (Requirement 10) ---
  function downloadSingleItem(item) {
    if (!item.resultBlob) return;
    const baseName = getBaseFileName(item.name);
    const ext = getFileExtension(item.name);
    const ratioStr = state.ratio.key === 'custom' ? `${state.ratio.w}x${state.ratio.h}` : state.ratio.key.replace(':', '_');
    const downloadFileName = `${baseName}_resized_${ratioStr}_${state.mode}.${ext}`;

    const link = document.createElement('a');
    link.href = item.resultUrl;
    link.download = downloadFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`"${downloadFileName}" 다운로드를 시작합니다.`, 'success', 'fa-circle-down');
  }

  // --- Batch ZIP Download Handler (Requirement 11) ---
  async function downloadAllAsZip() {
    const doneItems = state.items.filter(it => it.status === 'done' && it.resultBlob);
    if (doneItems.length === 0) {
      showToast('다운로드할 수 있는 완료된 이미지가 없습니다.', 'error', 'fa-triangle-exclamation');
      return;
    }

    if (typeof JSZip === 'undefined') {
      showToast('압축 라이브러리(JSZip)를 로드할 수 없습니다. 개별 다운로드를 이용해 주세요.', 'error', 'fa-circle-xmark');
      return;
    }

    btnDownloadAll.disabled = true;
    const originalBtnHtml = btnDownloadAll.innerHTML;
    btnDownloadAll.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>ZIP 압축 생성 중...</span>';

    showToast(`${doneItems.length}장의 사진을 ZIP으로 압축 중입니다...`, 'info', 'fa-file-zipper');

    try {
      const zip = new JSZip();
      const folder = zip.folder('Smart_Resized_Images');

      const ratioStr = state.ratio.key === 'custom' ? `${state.ratio.w}x${state.ratio.h}` : state.ratio.key.replace(':', '_');
      const usedNames = new Set();

      doneItems.forEach((item, index) => {
        const baseName = getBaseFileName(item.name);
        const ext = getFileExtension(item.name);
        let finalName = `${baseName}_resized_${ratioStr}_${state.mode}.${ext}`;

        // Ensure unique file name in ZIP
        if (usedNames.has(finalName)) {
          finalName = `${baseName}_(${index + 1})_resized_${ratioStr}_${state.mode}.${ext}`;
        }
        usedNames.add(finalName);

        folder.file(finalName, item.resultBlob);
      });

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      const zipUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = `Smart_Resized_Images_${ratioStr}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(zipUrl), 10000);
      showToast('ZIP 압축 파일이 성공적으로 다운로드되었습니다!', 'success', 'fa-circle-check');

    } catch (err) {
      console.error(err);
      showToast(`ZIP 압축 중 오류 발생: ${err.message}`, 'error', 'fa-circle-xmark');
    } finally {
      btnDownloadAll.disabled = false;
      btnDownloadAll.innerHTML = originalBtnHtml;
    }
  }

  // --- Run on page load ---
  window.addEventListener('DOMContentLoaded', init);

})();
