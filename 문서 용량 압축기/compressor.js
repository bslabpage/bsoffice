/**
 * Smart Doc Compressor - Core Compression Engine
 * Handles PPTX, DOCX, PDF (Scan-style capture & repack), and Images
 * Author: Kim Bosung
 */

// Configure PDF.js Worker
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = './libs/pdf.worker.min.js';
}

const CompressorEngine = {
  /**
   * Compression Level Presets
   */
  PRESETS: {
    light: {
      imageQuality: 0.80,
      imageMaxDim: 1920,
      pdfScale: 1.3,
      pdfQuality: 0.72,
      name: '가벼운 압축'
    },
    balanced: {
      imageQuality: 0.65,
      imageMaxDim: 1440,
      pdfScale: 1.05,
      pdfQuality: 0.58,
      name: '균형 압축'
    },
    heavy: {
      imageQuality: 0.48,
      imageMaxDim: 1080,
      pdfScale: 0.85,
      pdfQuality: 0.45,
      name: '강력 압축'
    }
  },

  /**
   * Detect file format category
   */
  detectType(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['pptx', 'ppt'].includes(ext)) return 'ppt';
    if (['docx', 'doc'].includes(ext)) return 'doc';
    if (['pdf'].includes(ext)) return 'pdf';
    if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'].includes(ext)) return 'img';
    if (['hwp', 'hwpx'].includes(ext)) return 'hwp';
    return 'unsupported';
  },

  /**
   * Main dispatch function
   */
  async compressFile(file, level = 'balanced', onProgress) {
    const format = this.detectType(file);
    const preset = this.PRESETS[level] || this.PRESETS.balanced;

    switch (format) {
      case 'ppt':
      case 'doc':
        return await this.compressOfficeDocument(file, preset, onProgress);
      case 'pdf':
        return await this.compressPdfScanStyle(file, preset, onProgress);
      case 'img':
        return await this.compressImage(file, preset, onProgress);
      default:
        throw new Error(`지원하지 않는 파일 형식입니다: .${file.name.split('.').pop()}`);
    }
  },

  /**
   * Compress Office Documents (DOCX & PPTX) by optimizing internal media files
   */
  async compressOfficeDocument(file, preset, onProgress) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip 라이브러리가 로드되지 않았습니다.');
    }

    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'doc' || ext === 'ppt') {
      // Legacy binary formats
      throw new Error(`구버전 .${ext} 형식은 내부 미디어 압축을 지원하지 않습니다. 최신 .${ext}x 파일로 저장하여 업로드해주세요.`);
    }

    onProgress(5, '문서 압축 해제 및 미디어 분석 중...');
    const zip = new JSZip();
    let loadedZip;
    try {
      loadedZip = await zip.loadAsync(file);
    } catch (e) {
      throw new Error('문서 파싱 실패: 파일이 손상되었거나 암호가 걸려있을 수 있습니다.');
    }

    // Find media files in ppt/media/* or word/media/*
    const mediaFiles = [];
    loadedZip.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir && (relativePath.startsWith('word/media/') || relativePath.startsWith('ppt/media/'))) {
        const lower = relativePath.toLowerCase();
        if (lower.match(/\.(png|jpe?g|bmp|webp)$/)) {
          mediaFiles.push(zipEntry);
        }
      }
    });

    const totalMedia = mediaFiles.length;
    let optimizedCount = 0;

    if (totalMedia === 0) {
      onProgress(30, '내부 미디어 없음 (XML 구조 최적화 중...)');
    } else {
      onProgress(10, `미디어 최적화 준비 중 (${totalMedia}개 미디어 발견)...`);
    }

    // Process each image inside the Office document
    for (let i = 0; i < totalMedia; i++) {
      const entry = mediaFiles[i];
      const percent = 10 + Math.round(((i + 1) / totalMedia) * 65);
      onProgress(percent, `문서 내 이미지 최적화 중 (${i + 1}/${totalMedia})...`);

      try {
        const originalArrayBuffer = await entry.async('arraybuffer');
        const isPng = entry.name.toLowerCase().endsWith('.png');
        const mimeType = isPng ? 'image/png' : 'image/jpeg';
        const imgBlob = new Blob([originalArrayBuffer], { type: mimeType });

        // Optimize image using canvas
        const compressedBlob = await this._optimizeImageBlob(imgBlob, preset.imageMaxDim, preset.imageQuality, isPng);
        
        // Only replace if compressed is smaller than original
        if (compressedBlob && compressedBlob.size < originalArrayBuffer.byteLength) {
          const newBuffer = await compressedBlob.arrayBuffer();
          loadedZip.file(entry.name, newBuffer);
          optimizedCount++;
        }
      } catch (err) {
        console.warn(`이미지 최적화 건너뜀 (${entry.name}):`, err);
      }
    }

    onProgress(80, '고효율 DEFLATE 패키징 중...');

    // Re-pack with DEFLATE level 9
    const outputBlob = await loadedZip.generateAsync({
      type: 'blob',
      mimeType: file.type || 'application/octet-stream',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    }, (meta) => {
      const pct = 80 + Math.round(meta.percent * 0.2);
      onProgress(pct, `최종 문서 저장 중 (${Math.round(meta.percent)}%)...`);
    });

    onProgress(100, `압축 완료! (미디어 ${optimizedCount}개 최적화)`);
    return outputBlob;
  },

  /**
   * PDF: Capture all pages and re-bundle into lightweight scan-style PDF
   * (Req: 모든 페이지를 전부 캡처해서 화질을 압축하고 다시 PDF로 묶어 일종의 저화질 스캔본 형태로 압축)
   */
  async compressPdfScanStyle(file, preset, onProgress) {
    if (!window.pdfjsLib) {
      throw new Error('PDF.js 라이브러리를 불러올 수 없습니다.');
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('jsPDF 라이브러리를 불러올 수 없습니다.');
    }

    onProgress(5, 'PDF 문서 로딩 중...');
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    if (numPages === 0) {
      throw new Error('PDF에 페이지가 존재하지 않습니다.');
    }

    onProgress(10, `PDF 파싱 완료 (총 ${numPages}페이지 스캔 모드 가동)...`);

    const { jsPDF } = window.jspdf;
    let newPdfDoc = null;

    const scale = preset.pdfScale;
    const quality = preset.pdfQuality;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const progressPercent = 10 + Math.round((pageNum / numPages) * 75);
      onProgress(progressPercent, `페이지 ${pageNum}/${numPages} 스캔 캡처 및 화질 압축 중...`);

      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      // Create an offscreen canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { alpha: false });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);

      // Render white background (scan standard)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render PDF page to canvas
      await page.render({
        canvasContext: ctx,
        viewport: viewport
      }).promise;

      // Apply light scanner-style contrast touch (makes black text crisp, paper light)
      this._applyScanPostProcess(ctx, canvas.width, canvas.height);

      // Export as compressed JPEG
      const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);

      // Page dimensions in points (72 DPI standard for PDF)
      // Original dimensions:
      const origViewport = page.getViewport({ scale: 1.0 });
      const ptWidth = origViewport.width;
      const ptHeight = origViewport.height;
      const orientation = ptWidth > ptHeight ? 'landscape' : 'portrait';

      if (pageNum === 1) {
        newPdfDoc = new jsPDF({
          orientation: orientation,
          unit: 'pt',
          format: [ptWidth, ptHeight],
          compress: true
        });
        newPdfDoc.addImage(jpegDataUrl, 'JPEG', 0, 0, ptWidth, ptHeight, undefined, 'FAST');
      } else {
        newPdfDoc.addPage([ptWidth, ptHeight], orientation);
        newPdfDoc.addImage(jpegDataUrl, 'JPEG', 0, 0, ptWidth, ptHeight, undefined, 'FAST');
      }

      // Memory cleanup
      canvas.width = 0;
      canvas.height = 0;
    }

    onProgress(90, '스캔본 PDF 파일 빌드 및 최종 경량화 중...');
    const outputBlob = newPdfDoc.output('blob');

    onProgress(100, `압축 완료! (${numPages}페이지 저화질 스캔본 재구성)`);
    return outputBlob;
  },

  /**
   * Compress standalone image file
   */
  async compressImage(file, preset, onProgress) {
    onProgress(15, '이미지 디코딩 중...');
    const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');

    const optimizedBlob = await this._optimizeImageBlob(file, preset.imageMaxDim, preset.imageQuality, isPng, (pct) => {
      onProgress(15 + Math.round(pct * 0.7), '이미지 캔버스 리사이징 및 인코딩 중...');
    });

    onProgress(100, '이미지 압축 완료!');
    return optimizedBlob;
  },

  /**
   * Helper: Optimize an image blob using Canvas API
   */
  _optimizeImageBlob(blob, maxDim, quality, isPng, progressCb) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(url);
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Downscale if exceeds max dimension while preserving aspect ratio
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Check if PNG has transparency
        if (!isPng) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);
        if (progressCb) progressCb(0.5);

        // For Office media and web, JPEG offers vastly superior compression ratio
        const outputMime = isPng ? 'image/png' : 'image/jpeg';

        canvas.toBlob((resultBlob) => {
          if (progressCb) progressCb(1.0);
          canvas.width = 0;
          canvas.height = 0;
          if (resultBlob) {
            resolve(resultBlob);
          } else {
            resolve(blob); // Fallback to original
          }
        }, outputMime, quality);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        // Fallback to original if decoding fails
        resolve(blob);
      };

      img.src = url;
    });
  },

  /**
   * Scanner-style light enhancement filter
   * Boosts contrast slightly to preserve readability at low JPEG quality
   */
  _applyScanPostProcess(ctx, width, height) {
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      const len = data.length;

      // Subtle contrast curve: darks become slightly darker, lights become clean white
      for (let i = 0; i < len; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        // If almost white (background paper noise), push to pure white for great JPEG compressibility
        if (r > 230 && g > 230 && b > 230) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        } else if (r < 60 && g < 60 && b < 60) {
          // Push text darker
          data[i] = Math.max(0, r - 15);
          data[i + 1] = Math.max(0, g - 15);
          data[i + 2] = Math.max(0, b - 15);
        }
      }
      ctx.putImageData(imgData, 0, 0);
    } catch (e) {
      // Ignore if getImageData fails (e.g. cross-origin, though offscreen canvas is clean)
    }
  }
};

window.CompressorEngine = CompressorEngine;
