/**
 * BSoffice Client Bridge
 * GitHub Pages Static Web & Local Engine Integration
 */

(function (window) {
  'use strict';

  // State
  const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbyH9THwSYLT-wXhVaTh0Vi0v3Ew4_v8j7_N6ZhKThu5W8CFFvHJqomxU_McfCwtmfw/exec';

  const bridgeState = {
    cdpConnected: false,
    cdpInfo: null,
    backendConnected: false,
    isStaticWeb: false,
    checkedAt: null,
    gasUrl: DEFAULT_GAS_URL
  };

  // Helper: File or Blob to Base64
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Helper: Base64 to Blob
  function base64ToBlob(base64Data, contentType = 'application/octet-stream') {
    const parts = base64Data.split(';base64,');
    const rawData = parts.length > 1 ? parts[1] : parts[0];
    const byteCharacters = atob(rawData);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: contentType });
  }

  // Helper: Relative API Fetch (Fails safely on static hosts like GitHub Pages)
  async function bridgeFetch(endpoint, method = 'GET', body = null) {
    const isStaticHost = window.location.protocol === 'file:' || 
                         window.location.hostname.endsWith('github.io') ||
                         window.location.hostname.endsWith('pages.dev') ||
                         window.location.hostname.endsWith('web.app') ||
                         window.location.hostname.endsWith('firebaseapp.com') ||
                         window.location.hostname.endsWith('vercel.app') ||
                         window.location.hostname.endsWith('netlify.app');
    if (isStaticHost) {
      throw new Error('Static host mode: Using 100% client-side engine.');
    }

    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const token = localStorage.getItem('bsoffice_token');
    if (token) {
      options.headers['X-Session-Token'] = token;
    }

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      // Relative endpoint for portability
      const relEndpoint = endpoint.startsWith('/') ? '.' + endpoint : endpoint;
      const res = await fetch(relEndpoint, options);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      bridgeState.isStaticWeb = true;
      throw new Error(err.message || 'Static host mode: Using 100% client-side engine.');
    }
  }

  const BSOfficeBridge = {
    // 1. Check CDP (Port 9000) and Backend Server Health
    async checkCDP() {
      const isStaticHost = window.location.protocol === 'file:' || window.location.hostname.endsWith('github.io');
      if (isStaticHost) {
        bridgeState.isStaticWeb = true;
        bridgeState.backendConnected = false;
        this.updateCDPBadge({ is_static: true });
        return { is_static: true };
      }

      try {
        const data = await bridgeFetch('./api/cdp/status');
        bridgeState.cdpConnected = !!data.cdp_connected;
        bridgeState.cdpInfo = data.cdp_info || null;
        bridgeState.backendConnected = true;
        bridgeState.checkedAt = new Date();
        this.updateCDPBadge(data);
        return data;
      } catch (err) {
        bridgeState.cdpConnected = false;
        bridgeState.backendConnected = false;
        bridgeState.isStaticWeb = true;
        this.updateCDPBadge({ is_static: true });
        return { is_static: true, error: err.message };
      }
    },

    // 2. Query CDP Target Pages
    async getCDPTargets() {
      return await bridgeFetch('./api/cdp/targets');
    },

    // 3. Backend PDF Merge (Falls back to client PDFLib if offline)
    async mergePDFs(files) {
      const base64List = [];
      for (const f of files) {
        const b64 = await fileToBase64(f.file || f);
        base64List.push({
          name: f.name || 'document.pdf',
          data: b64
        });
      }
      const res = await bridgeFetch('./api/tools/pdf/merge', 'POST', { files: base64List });
      return {
        blob: base64ToBlob(res.data, 'application/pdf'),
        fileName: res.fileName || 'merged_document.pdf',
        pageCount: res.pageCount
      };
    },

    // 4. Backend QR Code Generator (Falls back to client qrcode.min.js)
    async generateQR(text, options = {}) {
      const res = await bridgeFetch('./api/tools/qrcode/generate', 'POST', {
        text,
        box_size: options.box_size || 10,
        border: options.border || 4,
        fill_color: options.fill_color || '#000000',
        back_color: options.back_color || '#FFFFFF',
        format: options.format || 'JPEG'
      });
      return {
        dataUrl: res.dataUrl,
        blob: base64ToBlob(res.dataUrl, res.format === 'PNG' ? 'image/png' : 'image/jpeg')
      };
    },

    // 5. Backend Document Compressor (Falls back to client compressor.js)
    async compressFile(file, level = 'balanced') {
      const b64 = await fileToBase64(file);
      const res = await bridgeFetch('./api/tools/compress', 'POST', {
        name: file.name,
        data: b64,
        level: level
      });
      return {
        blob: base64ToBlob(res.data, res.mimeType || file.type || 'application/octet-stream'),
        originalSize: res.originalSize,
        compressedSize: res.compressedSize,
        ratio: res.ratio,
        savedBytes: res.savedBytes
      };
    },

    // 6. Backend Image Resizer (Falls back to client canvas)
    async resizeImage(file, options = {}) {
      const b64 = await fileToBase64(file);
      const res = await bridgeFetch('./api/tools/image/resize', 'POST', {
        name: file.name,
        data: b64,
        ratio: options.ratio || '1:1',
        mode: options.mode || 'padding',
        customW: options.customW || 1,
        customH: options.customH || 1,
        paddingColor: options.paddingColor || '#FFFFFF',
        format: options.format || 'JPEG'
      });
      return {
        dataUrl: res.dataUrl,
        blob: base64ToBlob(res.dataUrl, res.format === 'PNG' ? 'image/png' : 'image/jpeg'),
        width: res.width,
        height: res.height,
        fileName: res.fileName
      };
    },

    // 7. Backend Batch Renamer
    async batchRename(fileNames, rules = {}) {
      return await bridgeFetch('./api/tools/rename', 'POST', {
        files: fileNames,
        prefix: rules.prefix || '',
        suffix: rules.suffix || '',
        mode: rules.mode || 'keep',
        customName: rules.customName || '',
        useNumbering: !!rules.useNumbering,
        startNumber: rules.startNumber || 1,
        numberDigits: rules.numberDigits || 2,
        numPosition: rules.numPosition || 'suffix',
        numSeparator: rules.numSeparator || '_'
      });
    },

    // 8. Track Usage (Writes directly to localStorage on static web)
    async trackUsage(appId) {
      try {
        const logs = JSON.parse(localStorage.getItem('bsoffice_usage_logs') || '[]');
        const user = JSON.parse(localStorage.getItem('bsoffice_current_user') || 'null');
        const userEmail = user ? user.email : 'guest@bsoffice.local';
        const userName = user ? user.name : '비회원 방문자';
        logs.unshift({
          id: Date.now(),
          user_email: userEmail,
          user_name: userName,
          app_id: appId,
          app_name: appId,
          timestamp: new Date().toLocaleString('ko-KR')
        });
        if (logs.length > 200) logs.pop();
        localStorage.setItem('bsoffice_usage_logs', JSON.stringify(logs));
      } catch (e) {}

      try {
        await bridgeFetch('./api/track_usage', 'POST', { app_id: appId });
      } catch (e) {}
    },

    // 9. Save Processed Document to Administrator's Google Drive Categorized by Item
    async saveToGoogleDrive(options = {}) {
      const {
        file,                  // File | Blob | ArrayBuffer | base64 string
        fileName,              // string
        category = '기타 PDF',  // 'PDF 병합' | '문서 용량 압축' | etc.
        mimeType = 'application/pdf',
        userEmail = null
      } = options;

      try {
        const gasUrl = localStorage.getItem('bsoffice_gas_url') || DEFAULT_GAS_URL;
        if (!gasUrl) {
          console.warn("[BOS'S Office Drive] Google Apps Script URL이 설정되지 않았습니다.");
          return { success: false, reason: 'no_gas_url' };
        }

        // Determine user email
        let email = userEmail;
        if (!email) {
          try {
            const curUser = JSON.parse(localStorage.getItem('bsoffice_current_user') || 'null');
            if (curUser && curUser.email) email = curUser.email;
          } catch (e) {}
        }
        if (!email) email = 'guest@bsoffice.local';

        let base64Data = '';
        if (typeof file === 'string') {
          base64Data = file;
        } else if (file instanceof Blob || (file && file.size !== undefined)) {
          base64Data = await fileToBase64(file);
        } else if (file instanceof ArrayBuffer) {
          const blob = new Blob([file], { type: mimeType });
          base64Data = await fileToBase64(blob);
        } else {
          return { success: false, reason: 'invalid_file' };
        }

        const outName = fileName || (file && file.name) || `document_${Date.now()}.pdf`;

        const payload = {
          action: 'save_to_drive',
          category: category,
          fileName: outName,
          base64Data: base64Data,
          mimeType: mimeType,
          userEmail: email
        };

        const res = await fetch(gasUrl, {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data && data.status === 'success') {
            console.log(`[BOS'S Office Drive] 구글 드라이브 저장 성공 [${category}]:`, data.fileUrl);
            return { success: true, ...data };
          }
        }
      } catch (err) {
        console.warn("[BOS'S Office Drive] 구글 드라이브 저장 중 예외 (비동기 무시):", err);
        return { success: false, error: err.message };
      }
      return { success: false };
    },

    // UI Helper: Render or update Connection Pill in header
    updateCDPBadge(status) {
      let badge = document.getElementById('bsoffice-cdp-pill');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'bsoffice-cdp-pill';
        badge.className = 'bsoffice-cdp-pill';
        badge.title = "BOS'S Office 웹 앱 실행 상태";

        // Find best mounting container
        const targetContainer =
          document.querySelector('.bsoffice-header-actions') ||
          document.querySelector('.header-right') ||
          document.querySelector('.brand-right') ||
          document.querySelector('.header-actions') ||
          document.querySelector('.nav-right');

        if (targetContainer) {
          targetContainer.prepend(badge);
        } else {
          document.body.appendChild(badge);
        }
      }

      if (status.cdp_connected) {
        badge.className = 'bsoffice-cdp-pill cdp-active';
        badge.innerHTML = `
          <span class="cdp-dot pulse"></span>
          <span class="cdp-label">CDP 9000 & Python 연동됨</span>
        `;
      } else if (status.is_static) {
        badge.className = 'bsoffice-cdp-pill cdp-active';
        badge.style.background = 'rgba(79, 70, 229, 0.08)';
        badge.style.color = '#4f46e5';
        badge.style.borderColor = 'rgba(79, 70, 229, 0.25)';
        badge.innerHTML = `
          <span class="cdp-dot pulse" style="background:#4f46e5; box-shadow:0 0 8px rgba(79,70,229,0.5);"></span>
          <span class="cdp-label">GitHub Pages 모드 (100% 브라우저 처리)</span>
        `;
      } else {
        badge.className = 'bsoffice-cdp-pill cdp-standby';
        badge.innerHTML = `
          <span class="cdp-dot standby"></span>
          <span class="cdp-label">Python 엔진 활성 (CDP 포트 9000 대기)</span>
        `;
      }
    }
  };

  BSOfficeBridge.GAS_URL = DEFAULT_GAS_URL;

  // Expose to window
  window.BSOfficeBridge = BSOfficeBridge;

  // Auto-check on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    BSOfficeBridge.checkCDP();
  });

})(window);
