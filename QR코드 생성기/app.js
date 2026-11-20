/**
 * Kim Bosung | QR Generator
 * Core Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const inputWrapper = document.getElementById('input-wrapper');
  const qrStage = document.getElementById('qr-stage');
  const qrCodeWrapper = document.getElementById('qr-code-wrapper');
  const qrCodeBox = document.getElementById('qrcode-box');
  const qrTargetText = document.getElementById('qr-target-text');
  const badgeIcon = document.getElementById('badge-icon');
  const badgeLabel = document.getElementById('badge-label');
  const dockIndicator = document.getElementById('dock-indicator');

  // Input & Tab Elements
  const tabUrl = document.getElementById('tab-url');
  const tabPdf = document.getElementById('tab-pdf');
  const panelUrl = document.getElementById('panel-url');
  const panelPdf = document.getElementById('panel-pdf');
  
  const urlInput = document.getElementById('url-input');
  const btnClearUrl = document.getElementById('btn-clear-url');
  const btnPasteUrl = document.getElementById('btn-paste-url');
  const quickPresets = document.getElementById('quick-presets');

  const pdfDropZone = document.getElementById('pdf-drop-zone');
  const pdfFileInput = document.getElementById('pdf-file-input');
  const dropContentInitial = document.getElementById('drop-content-initial');
  const dropContentSelected = document.getElementById('drop-content-selected');
  const pdfFileName = document.getElementById('pdf-file-name');
  const pdfFileSize = document.getElementById('pdf-file-size');
  const btnRemovePdf = document.getElementById('btn-remove-pdf');
  const pdfUrlAlt = document.getElementById('pdf-url-alt');

  // Buttons
  const btnConfirm = document.getElementById('btn-confirm');
  const btnDownloadJpg = document.getElementById('btn-download-jpg');
  const btnCopyUrl = document.getElementById('btn-copy-url');
  const btnCopyLabel = document.getElementById('btn-copy-label');
  const btnResetView = document.getElementById('btn-reset-view');
  const toastContainer = document.getElementById('toast-container');
  const hintText = document.getElementById('hint-text');

  // State
  let currentMode = 'url'; // 'url' | 'pdf'
  let selectedPdfFile = null;
  let activeQRData = '';
  let activeDisplayLabel = '';
  let qrCodeInstance = null;

  // --- Sound FX via Web Audio API (No external assets required) ---
  const playSound = (type = 'success') => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.25);
      } else if (type === 'download') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.12); // G5
        osc.frequency.exponentialRampToValueAtTime(1046.5, audioCtx.currentTime + 0.25); // C6
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      }
    } catch (e) {
      // Audio not permitted or supported; continue silently
    }
  };

  // --- Toast Notification ---
  const showToast = (message, type = 'success', duration = 3000) => {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✓' : '⚠️';
    toast.innerHTML = `<span style="color:${type === 'success' ? '#10b981' : '#f59e0b'}">${icon}</span> <span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-leave');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, duration);
  };

  // --- Tab Switching ---
  tabUrl.addEventListener('click', () => switchTab('url'));
  tabPdf.addEventListener('click', () => switchTab('pdf'));

  function switchTab(mode) {
    currentMode = mode;
    if (mode === 'url') {
      tabUrl.classList.add('active');
      tabUrl.setAttribute('aria-selected', 'true');
      tabPdf.classList.remove('active');
      tabPdf.setAttribute('aria-selected', 'false');
      panelUrl.style.display = 'block';
      panelPdf.style.display = 'none';
      hintText.textContent = 'URL을 입력하고 확인 버튼을 눌러주세요';
      urlInput.focus();
    } else {
      tabPdf.classList.add('active');
      tabPdf.setAttribute('aria-selected', 'true');
      tabUrl.classList.remove('active');
      tabUrl.setAttribute('aria-selected', 'false');
      panelPdf.style.display = 'block';
      panelUrl.style.display = 'none';
      hintText.textContent = 'PDF 파일을 업로드하거나 링크를 입력하세요';
    }
  }

  // --- URL Input Handling ---
  urlInput.addEventListener('input', () => {
    btnClearUrl.style.display = urlInput.value ? 'flex' : 'none';
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
  });

  btnClearUrl.addEventListener('click', () => {
    urlInput.value = '';
    btnClearUrl.style.display = 'none';
    urlInput.focus();
  });

  btnPasteUrl.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        btnClearUrl.style.display = 'flex';
        showToast('클립보드에서 주소를 붙여넣었습니다');
      }
    } catch (err) {
      showToast('클립보드 접근 권한이 필요합니다', 'warning');
    }
  });

  // Presets
  quickPresets.addEventListener('click', (e) => {
    const chip = e.target.closest('.preset-chip');
    if (chip && chip.dataset.url) {
      urlInput.value = chip.dataset.url;
      btnClearUrl.style.display = 'flex';
      handleConfirm();
    }
  });

  // --- PDF File Handling ---
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleSelectedFile = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      showToast('PDF 파일(.pdf)만 업로드할 수 있습니다', 'warning');
      return;
    }
    selectedPdfFile = file;
    pdfFileName.textContent = file.name;
    pdfFileSize.textContent = formatBytes(file.size);
    dropContentInitial.style.display = 'none';
    dropContentSelected.style.display = 'flex';
    showToast(`PDF 파일이 선택되었습니다: ${file.name}`);
  };

  pdfFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedFile(e.target.files[0]);
    }
  });

  btnRemovePdf.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedPdfFile = null;
    pdfFileInput.value = '';
    dropContentSelected.style.display = 'none';
    dropContentInitial.style.display = 'block';
  });

  // Drag & drop events
  ['dragenter', 'dragover'].forEach(eventName => {
    pdfDropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      pdfDropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    pdfDropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      pdfDropZone.classList.remove('dragover');
    }, false);
  });

  pdfDropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files[0]) {
      handleSelectedFile(dt.files[0]);
    }
  });

  // --- Confirm & Transition Logic ---
  btnConfirm.addEventListener('click', handleConfirm);

  async function handleConfirm() {
    let dataToEncode = '';
    let displayTitle = '';
    let isPdfMode = false;

    if (currentMode === 'url') {
      let rawUrl = urlInput.value.trim();
      if (!rawUrl) {
        showToast('URL 주소를 입력해주세요!', 'warning');
        urlInput.focus();
        return;
      }

      // Automatically add https:// if missing schema
      if (!/^https?:\/\//i.test(rawUrl)) {
        if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(rawUrl)) {
          rawUrl = 'https://' + rawUrl;
          urlInput.value = rawUrl;
        }
      }

      dataToEncode = rawUrl;
      displayTitle = rawUrl;
      badgeIcon.textContent = '🔗';
      badgeLabel.textContent = '웹사이트 URL';
    } else {
      // PDF mode
      const altUrl = pdfUrlAlt.value.trim();
      if (altUrl) {
        dataToEncode = altUrl;
        displayTitle = altUrl;
        isPdfMode = true;
      } else if (selectedPdfFile) {
        isPdfMode = true;
        displayTitle = selectedPdfFile.name;
        
        // Handle PDF file:
        // Standard QR code capacity is up to ~2.5KB.
        if (selectedPdfFile.size <= 2048) {
          // Can encode directly as Base64 Data URI!
          try {
            dataToEncode = await readFileAsDataURL(selectedPdfFile);
            showToast('PDF 파일 데이터가 QR코드에 직접 인코딩되었습니다!');
          } catch (err) {
            dataToEncode = URL.createObjectURL(selectedPdfFile);
          }
        } else {
          // File is larger than direct QR byte capacity
          // We create an Object URL or file link and inform the user
          dataToEncode = URL.createObjectURL(selectedPdfFile);
          showToast(`💡 ${selectedPdfFile.name} 로컬 PDF 뷰어 QR코드가 생성되었습니다. (대용량 파일)`, 'success', 4000);
        }
      } else {
        showToast('PDF 파일을 업로드하거나 온라인 PDF 주소를 입력해주세요!', 'warning');
        return;
      }

      badgeIcon.textContent = '📄';
      badgeLabel.textContent = 'PDF 문서';
    }

    activeQRData = dataToEncode;
    activeDisplayLabel = displayTitle;

    // Execute generation
    generateQRCode(dataToEncode, displayTitle);

    // Layout Transition: Move Input to Bottom Dock, Center QR Code
    inputWrapper.classList.remove('state-centered');
    inputWrapper.classList.add('state-docked');

    qrStage.classList.remove('state-hidden');
    qrStage.classList.add('state-visible');

    playSound('success');
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // --- QR Code Rendering ---
  async function generateQRCode(text, label) {
    qrCodeBox.innerHTML = '';
    qrTargetText.textContent = label;

    // 1. Try Local Python Backend Engine first (Pillow + qrcode)
    if (window.BSOfficeBridge) {
      try {
        const res = await window.BSOfficeBridge.generateQR(text, { box_size: 10, border: 4 });
        if (res && res.dataUrl) {
          const img = document.createElement('img');
          img.src = res.dataUrl;
          img.alt = 'QR Code';
          img.style.width = '256px';
          img.style.height = '256px';
          img.style.display = 'block';
          qrCodeBox.appendChild(img);
          window._activeGeneratedQRDataUrl = res.dataUrl;
          return;
        }
      } catch (backendErr) {
        console.warn('Backend QR fallback to client qrcode.js:', backendErr);
      }
    }

    // 2. Client-side fallback
    try {
      // Create QRCode instance using qrcodejs
      qrCodeInstance = new QRCode(qrCodeBox, {
        text: text,
        width: 256,
        height: 256,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    } catch (err) {
      console.error('QR creation error:', err);
      // Fallback with lower error correction if text is too large
      try {
        qrCodeBox.innerHTML = '';
        qrCodeInstance = new QRCode(qrCodeBox, {
          text: text,
          width: 256,
          height: 256,
          colorDark: '#0f172a',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.L
        });
      } catch (fallbackErr) {
        showToast('데이터 용량이 너무 커서 QR코드로 변환할 수 없습니다. 더 짧은 URL을 사용해주세요.', 'warning', 5000);
      }
    }
  }

  // ==========================================================================
  // 5. Click QR Code -> Download JPG
  // ==========================================================================
  // Clicking either the QR code wrapper OR the "JPG 다운로드" button triggers download
  qrCodeWrapper.addEventListener('click', () => downloadAsJpg());
  btnDownloadJpg.addEventListener('click', (e) => {
    e.stopPropagation();
    downloadAsJpg();
  });

  function downloadAsJpg() {
    if (!activeQRData) {
      showToast('생성된 QR코드가 없습니다.', 'warning');
      return;
    }

    // Locate source canvas or image in qrcode-box
    const sourceCanvas = qrCodeBox.querySelector('canvas');
    const sourceImg = qrCodeBox.querySelector('img');

    if (!sourceCanvas && !sourceImg) {
      showToast('QR코드를 준비하는 중입니다. 잠시 후 다시 시도해주세요.', 'warning');
      return;
    }

    // High resolution canvas for ultra-crisp output (1024x1024)
    const exportCanvas = document.createElement('canvas');
    const exportSize = 1024;
    const padding = 100; // Quiet zone
    exportCanvas.width = exportSize;
    exportCanvas.height = exportSize;
    const ctx = exportCanvas.getContext('2d');

    // CRITICAL: Fill background with solid white for JPEG (prevents black alpha in JPG)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, exportSize, exportSize);

    // Disable image smoothing for pixel-perfect crisp QR edges
    ctx.imageSmoothingEnabled = false;

    // Draw the QR Code image or canvas
    const drawContent = () => {
      const qrSize = exportSize - (padding * 2);
      if (sourceImg && sourceImg.complete && sourceImg.naturalWidth > 0) {
        ctx.drawImage(sourceImg, padding, padding, qrSize, qrSize);
      } else if (sourceCanvas) {
        ctx.drawImage(sourceCanvas, padding, padding, qrSize, qrSize);
      } else if (sourceImg) {
        ctx.drawImage(sourceImg, padding, padding, qrSize, qrSize);
      }

      // Add a clean, subtle professional footer branding
      ctx.fillStyle = '#64748b';
      ctx.font = '600 24px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Kim Bosung  |  QR Generator', exportSize / 2, exportSize - 35);

      // Convert to JPG Data URL
      try {
        const jpgDataUrl = exportCanvas.toDataURL('image/jpeg', 0.95);
        
        // Trigger download
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const filename = `KimBosung_QR_${timestamp}.jpg`;
        
        const downloadLink = document.createElement('a');
        downloadLink.href = jpgDataUrl;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        playSound('download');
        showToast(`🎉 ${filename} JPG 파일이 다운로드되었습니다!`);
      } catch (e) {
        console.error('Export error:', e);
        showToast('JPG 다운로드 중 문제가 발생했습니다.', 'warning');
      }
    };

    if (sourceImg && !sourceImg.complete) {
      sourceImg.onload = drawContent;
    } else {
      drawContent();
    }
  }

  // --- Copy Link Button ---
  btnCopyUrl.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!activeQRData) return;
    try {
      await navigator.clipboard.writeText(activeQRData);
      btnCopyLabel.textContent = '복사됨 ✓';
      showToast('내용이 클립보드에 복사되었습니다!');
      setTimeout(() => {
        btnCopyLabel.textContent = '복사';
      }, 2000);
    } catch (err) {
      showToast('클립보드 복사 실패', 'warning');
    }
  });

  // --- Reset View / 새로 만들기 ---
  btnResetView.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // Return input box to center
    inputWrapper.classList.remove('state-docked');
    inputWrapper.classList.add('state-centered');

    // Hide QR stage
    qrStage.classList.remove('state-visible');
    qrStage.classList.add('state-hidden');

    if (currentMode === 'url') {
      urlInput.focus();
      urlInput.select();
    }
    showToast('새로운 QR코드를 생성할 수 있습니다');
  });

});
