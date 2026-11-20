/**
 * Smart Doc Compressor - Application UI & Workflow Controller
 * Author: Kim Bosung
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const browseBtn = document.getElementById('browseBtn');
  const dragOverlay = document.getElementById('dragOverlay');
  const queueSection = document.getElementById('queueSection');
  const fileCardsList = document.getElementById('fileCardsList');
  const queueCountBadge = document.getElementById('queueCountBadge');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const downloadAllBtn = document.getElementById('downloadAllBtn');
  const levelBtns = document.querySelectorAll('.level-btn');
  const toastContainer = document.getElementById('toastContainer');

  // HWP Modal Elements
  const hwpModal = document.getElementById('hwpModal');
  const hwpModalCloseX = document.getElementById('hwpModalCloseX');
  const hwpModalConfirmBtn = document.getElementById('hwpModalConfirmBtn');

  // State Management
  let currentCompressionLevel = 'balanced';
  const fileQueue = new Map(); // id -> { file, cardEl, compressedBlob, status, originalSize, compressedSize }
  let dragCounter = 0;

  // ==========================================================================
  // Level Selector
  // ==========================================================================
  levelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      levelBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCompressionLevel = btn.dataset.level || 'balanced';
      showToast(`압축 모드가 [${btn.querySelector('.level-name').textContent}]로 변경되었습니다.`, 'info');
    });
  });

  // ==========================================================================
  // File Input & Dropzone Events (Requirements 4, 5)
  // ==========================================================================
  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleIncomingFiles(Array.from(e.target.files));
      fileInput.value = ''; // Reset input so same file can be re-selected
    }
  });

  // Window-wide Drag and Drop (Req 5)
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      dragOverlay.classList.add('active');
      dropzone.classList.add('drag-active');
    }
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dragOverlay.classList.remove('active');
      dropzone.classList.remove('drag-active');
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dragOverlay.classList.remove('active');
    dropzone.classList.remove('drag-active');

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleIncomingFiles(Array.from(e.dataTransfer.files));
    }
  });

  // ==========================================================================
  // File Filtering & Validation (Requirements 11, 12, HWP, PDF)
  // ==========================================================================
  function handleIncomingFiles(files) {
    let acceptedCount = 0;
    let hwpDetected = false;

    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();

      // Check for HWP / HWPX (Req: HWP 파일은 PDF나 워드로 변환 요청)
      if (ext === 'hwp' || ext === 'hwpx') {
        hwpDetected = true;
        continue;
      }

      // Check allowed formats (Req 11 & 12: DOCX/DOC, PPTX/PPT, Image, PDF)
      const type = CompressorEngine.detectType(file);
      if (type === 'unsupported') {
        showToast(`'${file.name}'은(는) 지원하지 않는 형식입니다. (지원: PPT, DOC, PDF, 이미지)`, 'error');
        continue;
      }

      // Valid file: add to queue and start compression
      addFileToQueue(file);
      acceptedCount++;
    }

    if (hwpDetected) {
      openHwpModal();
    }

    if (acceptedCount > 0) {
      updateQueueUI();
    }
  }

  // ==========================================================================
  // HWP Guide Modal Controls
  // ==========================================================================
  function openHwpModal() {
    hwpModal.classList.add('open');
  }

  function closeHwpModal() {
    hwpModal.classList.remove('open');
  }

  hwpModalCloseX.addEventListener('click', closeHwpModal);
  hwpModalConfirmBtn.addEventListener('click', closeHwpModal);
  hwpModal.addEventListener('click', (e) => {
    if (e.target === hwpModal) {
      closeHwpModal();
    }
  });

  // ==========================================================================
  // File Queue & Progress Card (Requirements 7, 8, 9, 10)
  // ==========================================================================
  function addFileToQueue(file) {
    const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const cardEl = createFileCard(fileId, file);
    fileCardsList.appendChild(cardEl);

    const item = {
      id: fileId,
      file: file,
      cardEl: cardEl,
      compressedBlob: null,
      status: 'pending',
      originalSize: file.size,
      compressedSize: 0,
      level: currentCompressionLevel
    };

    fileQueue.set(fileId, item);
    queueSection.style.display = 'block';

    // Start compression asynchronously for this file (Req 8)
    processCompression(item);
  }

  function createFileCard(fileId, file) {
    const ext = file.name.split('.').pop().toUpperCase();
    const type = CompressorEngine.detectType(file);

    const card = document.createElement('div');
    card.className = 'file-card';
    card.id = fileId;

    let badgeClass = 'type-doc';
    let badgeText = ext;
    if (type === 'ppt') { badgeClass = 'type-ppt'; badgeText = 'PPT'; }
    else if (type === 'doc') { badgeClass = 'type-doc'; badgeText = 'DOC'; }
    else if (type === 'pdf') { badgeClass = 'type-pdf'; badgeText = 'PDF'; }
    else if (type === 'img') { badgeClass = 'type-img'; badgeText = 'IMG'; }

    card.innerHTML = `
      <div class="card-left">
        <div class="file-format-badge ${badgeClass}">${badgeText}</div>
        <div class="file-details">
          <div class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
          <div class="file-sizes">
            <span class="size-original">${formatBytes(file.size)}</span>
            <span class="size-arrow">➔</span>
            <span class="size-compressed" id="${fileId}-compressed-size">계산 중...</span>
            <span class="size-saved-tag" id="${fileId}-saved-tag" style="display: none;"></span>
          </div>
        </div>
      </div>

      <div class="card-center">
        <div class="progress-info">
          <span class="progress-status-text" id="${fileId}-status">
            <span class="status-spinner"></span>
            압축 대기 중...
          </span>
          <span class="progress-percentage" id="${fileId}-percent">0%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" id="${fileId}-fill" style="width: 0%;"></div>
        </div>
      </div>

      <div class="card-right">
        <!-- Req 9: Download button -->
        <button type="button" class="btn-download-file" id="${fileId}-download-btn" disabled title="압축 완료 후 다운로드 가능">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>다운로드</span>
        </button>
        <button type="button" class="btn-remove-card" id="${fileId}-remove-btn" title="목록에서 제거">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;

    // Download Button Click Handler (Req 9 & 10)
    const downloadBtn = card.querySelector(`#${fileId}-download-btn`);
    downloadBtn.addEventListener('click', () => {
      const item = fileQueue.get(fileId);
      if (item && item.compressedBlob) {
        triggerDownload(item.compressedBlob, item.file.name);
      }
    });

    // Remove Button Click Handler
    const removeBtn = card.querySelector(`#${fileId}-remove-btn`);
    removeBtn.addEventListener('click', () => {
      card.remove();
      fileQueue.delete(fileId);
      updateQueueUI();
    });

    return card;
  }

  // ==========================================================================
  // Compression Execution (Requirements 8, 9, 10)
  // ==========================================================================
  async function processCompression(item) {
    const { id, file, cardEl, level } = item;
    const statusTextEl = cardEl.querySelector(`#${id}-status`);
    const percentEl = cardEl.querySelector(`#${id}-percent`);
    const fillEl = cardEl.querySelector(`#${id}-fill`);
    const downloadBtn = cardEl.querySelector(`#${id}-download-btn`);
    const compressedSizeEl = cardEl.querySelector(`#${id}-compressed-size`);
    const savedTagEl = cardEl.querySelector(`#${id}-saved-tag`);

    item.status = 'processing';

    try {
      // Progress Callback (Req 8)
      const onProgress = (percent, statusMessage) => {
        const clamped = Math.min(100, Math.max(0, percent));
        fillEl.style.width = `${clamped}%`;
        percentEl.textContent = `${clamped}%`;
        statusTextEl.innerHTML = `<span class="status-spinner"></span> ${escapeHtml(statusMessage)}`;
      };

      // 1. Try Local Python Backend Engine first (Pillow + PyPDF + ZipFile)
      let outputBlob = null;
      if (window.BSOfficeBridge) {
        try {
          onProgress(35, 'Python 고속 압축 엔진 최적화 중...');
          const bridgeRes = await window.BSOfficeBridge.compressFile(file, level);
          if (bridgeRes && bridgeRes.blob && bridgeRes.compressedSize > 0) {
            outputBlob = bridgeRes.blob;
            onProgress(90, '초경량 패키징 완료...');
          }
        } catch (bErr) {
          console.warn('Backend compression fallback to client CompressorEngine:', bErr);
        }
      }

      // 2. Client-side fallback if backend failed or unavailable
      if (!outputBlob) {
        outputBlob = await CompressorEngine.compressFile(file, level, onProgress);
      }
      
      item.compressedBlob = outputBlob;
      item.compressedSize = outputBlob.size;
      item.status = 'completed';

      // Update Card to Completed State
      cardEl.classList.add('completed');
      fillEl.style.width = '100%';
      percentEl.textContent = '100%';
      statusTextEl.innerHTML = `<span style="color:#10B981; font-weight:700;">✓ 압축 완료</span>`;

      // Calculate size reduction
      const origSize = item.originalSize;
      const compSize = item.compressedSize;
      compressedSizeEl.textContent = formatBytes(compSize);

      if (compSize < origSize) {
        const savedPercent = Math.round(((origSize - compSize) / origSize) * 100);
        savedTagEl.textContent = `-${savedPercent}% 절감`;
        savedTagEl.style.display = 'inline-block';
      } else {
        savedTagEl.textContent = '최적화됨';
        savedTagEl.style.display = 'inline-block';
      }

      // Req 9: Activate Download Button!
      downloadBtn.disabled = false;
      downloadBtn.classList.add('active');
      downloadBtn.title = '클릭하여 압축된 파일 다운로드';

      updateQueueUI();
      showToast(`'${file.name}' 압축이 완료되었습니다!`, 'success');

    } catch (error) {
      console.error('Compression error:', error);
      item.status = 'error';
      cardEl.classList.add('error');
      fillEl.style.width = '100%';
      percentEl.textContent = '!';
      statusTextEl.innerHTML = `<span style="color:#EF4444; font-weight:700;">⚠️ ${escapeHtml(error.message || '압축 실패')}</span>`;
      compressedSizeEl.textContent = '실패';
      downloadBtn.disabled = true;
      downloadBtn.classList.remove('active');
      showToast(`'${file.name}' 압축 중 오류: ${error.message}`, 'error');
      updateQueueUI();
    }
  }

  // ==========================================================================
  // File Download Trigger (Requirement 10: compressed_원본파일명)
  // ==========================================================================
  function triggerDownload(blob, originalFilename) {
    // Req 10: 'compressed_원본파일명' 형태로 저장
    const targetFilename = `compressed_${originalFilename}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = targetFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Release object URL after a brief delay
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ==========================================================================
  // Batch Actions: Download All & Clear All
  // ==========================================================================
  downloadAllBtn.addEventListener('click', () => {
    let count = 0;
    fileQueue.forEach(item => {
      if (item.status === 'completed' && item.compressedBlob) {
        // Sequential triggers with slight delay to prevent browser block
        setTimeout(() => {
          triggerDownload(item.compressedBlob, item.file.name);
        }, count * 350);
        count++;
      }
    });

    if (count > 0) {
      showToast(`${count}개의 압축 파일을 순차적으로 다운로드합니다.`, 'success');
    }
  });

  clearAllBtn.addEventListener('click', () => {
    fileCardsList.innerHTML = '';
    fileQueue.clear();
    updateQueueUI();
    showToast('작업 목록을 모두 비웠습니다.', 'info');
  });

  function updateQueueUI() {
    const total = fileQueue.size;
    queueCountBadge.textContent = `${total}개 파일`;

    if (total === 0) {
      queueSection.style.display = 'none';
      downloadAllBtn.disabled = true;
      return;
    }

    queueSection.style.display = 'block';

    // Enable "Download All" if at least one file is completed
    let hasCompleted = false;
    fileQueue.forEach(item => {
      if (item.status === 'completed') hasCompleted = true;
    });
    downloadAllBtn.disabled = !hasCompleted;
  }

  // ==========================================================================
  // Toast Notifications Helper
  // ==========================================================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';
    if (type === 'warning') icon = '💡';

    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  }

  // Utilities
  function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
