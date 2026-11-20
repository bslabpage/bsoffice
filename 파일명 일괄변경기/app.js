/**
 * bslab - 파일명 일괄 변경기 (Batch Renamer)
 * 100% 클라이언트 사이드 바닐라 자바스크립트
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // 1. 상태 변수 (State)
  // ==========================================
  let fileList = []; // Array of { id, file, originalName, baseName, ext, size }

  // ==========================================
  // 2. DOM 요소 참조
  // ==========================================
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const selectFilesBtn = document.getElementById('selectFilesBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const downloadZipBtn = document.getElementById('downloadZipBtn');
  const downloadBtnText = document.getElementById('downloadBtnText');

  // 규칙 설정 필드
  const prefixInput = document.getElementById('prefixInput');
  const modeKeep = document.getElementById('modeKeep');
  const modeCustom = document.getElementById('modeCustom');
  const customNameInput = document.getElementById('customNameInput');
  const suffixInput = document.getElementById('suffixInput');
  const useNumbering = document.getElementById('useNumbering');
  const numberingOptions = document.getElementById('numberingOptions');
  const startNumber = document.getElementById('startNumber');
  const numberDigits = document.getElementById('numberDigits');
  const numPosition = document.getElementById('numPosition');
  const numSeparator = document.getElementById('numSeparator');
  const resetRulesBtn = document.getElementById('resetRulesBtn');

  // 구조 미리보기 태그
  const formulaPrefix = document.getElementById('formulaPrefix');
  const formulaBase = document.getElementById('formulaBase');
  const formulaNum = document.getElementById('formulaNum');
  const formulaSuffix = document.getElementById('formulaSuffix');

  // 테이블 및 뷰
  const tableContainer = document.getElementById('tableContainer');
  const emptyState = document.getElementById('emptyState');
  const previewTable = document.getElementById('previewTable');
  const previewTbody = document.getElementById('previewTbody');
  const fileCountBadge = document.getElementById('fileCountBadge');
  const summaryText = document.getElementById('summaryText');

  // 프로그레스 바
  const progressContainer = document.getElementById('progressContainer');
  const progressFill = document.getElementById('progressFill');
  const progressPercent = document.getElementById('progressPercent');
  const progressStatus = document.getElementById('progressStatus');

  // 토스트
  const toastContainer = document.getElementById('toastContainer');

  // 헤더 버튼
  const googleLoginBtn = document.getElementById('googleLoginBtn');

  // ==========================================
  // 3. 유틸리티 함수
  // ==========================================

  // 토스트 알림
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'danger') icon = '❌';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 3000);
  }

  // 파일 크기 포맷터
  function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // 파일명과 확장자 분리
  function splitFilename(fullName) {
    const lastDotIndex = fullName.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) {
      return { base: fullName, ext: '' };
    }
    return {
      base: fullName.substring(0, lastDotIndex),
      ext: fullName.substring(lastDotIndex) // . 포함
    };
  }

  // 숫자 패딩
  function padNumber(num, digits) {
    return String(num).padStart(digits, '0');
  }

  // ==========================================
  // 4. 새 파일명 계산 로직
  // ==========================================
  function computeNewFilename(item, index) {
    const prefix = prefixInput.value || '';
    const suffix = suffixInput.value || '';
    const isCustom = modeCustom.checked;
    const customName = customNameInput.value.trim();

    // 1) 본문 결정
    let base = isCustom ? (customName || 'file') : item.baseName;

    // 2) 넘버링 결정
    let formattedNum = '';
    const isNumEnabled = useNumbering.checked;
    if (isNumEnabled) {
      const start = parseInt(startNumber.value, 10) || 1;
      const digits = parseInt(numberDigits.value, 10) || 1;
      formattedNum = padNumber(start + index, digits);
    }

    const sep = numSeparator.value;
    const pos = numPosition.value;

    let finalName = '';

    if (!isNumEnabled) {
      finalName = `${prefix}${base}${suffix}`;
    } else {
      if (pos === 'suffix_before') {
        // [접두사][본문][구분자+번호][접미사]
        const numPart = (base.length > 0 && sep) ? `${sep}${formattedNum}` : formattedNum;
        finalName = `${prefix}${base}${numPart}${suffix}`;
      } else if (pos === 'suffix_after') {
        // [접두사][본문][접미사][구분자+번호]
        const numPart = ((base.length > 0 || suffix.length > 0) && sep) ? `${sep}${formattedNum}` : formattedNum;
        finalName = `${prefix}${base}${suffix}${numPart}`;
      } else if (pos === 'prefix_after') {
        // [접두사][번호+구분자][본문][접미사]
        const numPart = sep ? `${formattedNum}${sep}` : formattedNum;
        finalName = `${prefix}${numPart}${base}${suffix}`;
      }
    }

    // 만약 이름이 전부 공백이어서 빈 문자열이 되는 경우 방지
    if (!finalName.trim()) {
      finalName = `file_${index + 1}`;
    }

    return `${finalName}${item.ext}`;
  }

  // ==========================================
  // 5. 실시간 UI 렌더링
  // ==========================================
  function updatePreview() {
    const count = fileList.length;
    fileCountBadge.textContent = `${count}개 파일`;

    // 조합 공식 배너 텍스트 갱신
    updateFormulaTags();

    // Call Local Python Backend API for batch rename verification
    if (window.BSOfficeBridge && count > 0) {
      window.BSOfficeBridge.batchRename(fileList.map(f => f.originalName), {
        prefix: prefixInput.value,
        suffix: suffixInput.value,
        mode: modeCustom.checked ? 'custom' : 'keep',
        customName: customNameInput.value.trim(),
        useNumbering: useNumbering.checked,
        startNumber: parseInt(startNumber.value, 10) || 1,
        numberDigits: parseInt(numberDigits.value, 10) || 2,
        numPosition: numPosition.value.includes('prefix') ? 'prefix' : 'suffix',
        numSeparator: numSeparator.value
      }).catch(e => console.warn('Backend rename notice:', e));
    }

    if (count === 0) {
      emptyState.style.display = 'block';
      previewTable.style.display = 'none';
      clearAllBtn.disabled = true;
      downloadZipBtn.disabled = true;
      summaryText.textContent = '선택된 파일: 0개 (0 KB)';
      return;
    }

    emptyState.style.display = 'none';
    previewTable.style.display = 'table';
    clearAllBtn.disabled = false;
    downloadZipBtn.disabled = false;

    // 총 크기 계산
    const totalBytes = fileList.reduce((acc, cur) => acc + cur.size, 0);
    summaryText.textContent = `선택된 파일: ${count}개 (${formatBytes(totalBytes)})`;

    // 행 렌더링
    previewTbody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    fileList.forEach((item, index) => {
      const newName = computeNewFilename(item, index);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="col-num">${index + 1}</td>
        <td class="col-original" title="${escapeHtml(item.originalName)}">
          📄 ${escapeHtml(item.originalName)}
        </td>
        <td class="col-arrow">➔</td>
        <td class="col-new" title="${escapeHtml(newName)}">
          ${escapeHtml(newName)}
        </td>
        <td class="col-size">${formatBytes(item.size)}</td>
        <td class="col-action">
          <button type="button" class="del-btn" data-id="${item.id}" title="목록에서 제거">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </td>
      `;
      fragment.appendChild(tr);
    });

    previewTbody.appendChild(fragment);
  }

  // 조합 공식 배너 갱신
  function updateFormulaTags() {
    const prefix = prefixInput.value;
    formulaPrefix.textContent = prefix ? `[${prefix}]` : '[접두사]';
    formulaPrefix.style.opacity = prefix ? '1' : '0.6';

    const isCustom = modeCustom.checked;
    const customName = customNameInput.value.trim();
    if (isCustom) {
      formulaBase.textContent = customName ? `[${customName}]` : '[새이름]';
    } else {
      formulaBase.textContent = '[기존본문]';
    }

    const isNumEnabled = useNumbering.checked;
    if (isNumEnabled) {
      const sep = numSeparator.value;
      const digits = parseInt(numberDigits.value, 10) || 2;
      const sampleNum = padNumber(parseInt(startNumber.value, 10) || 1, digits);
      formulaNum.textContent = `[${sep ? sep + sampleNum : sampleNum}]`;
      formulaNum.style.display = 'inline-block';
    } else {
      formulaNum.style.display = 'none';
    }

    const suffix = suffixInput.value;
    formulaSuffix.textContent = suffix ? `[${suffix}]` : '[접미사]';
    formulaSuffix.style.opacity = suffix ? '1' : '0.6';
  }

  // HTML 이스케이프 유틸리티
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================
  // 6. 파일 추가 & 관리
  // ==========================================
  function handleFiles(files) {
    if (!files || files.length === 0) return;

    let addedCount = 0;
    Array.from(files).forEach((file) => {
      const { base, ext } = splitFilename(file.name);
      fileList.push({
        id: 'file_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
        file: file,
        originalName: file.name,
        baseName: base,
        ext: ext,
        size: file.size
      });
      addedCount++;
    });

    updatePreview();
    showToast(`${addedCount}개 파일이 추가되었습니다.`, 'success');
  }

  // 파일 개별 삭제 이벤트 위임
  previewTbody.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.del-btn');
    if (!delBtn) return;

    const fileId = delBtn.dataset.id;
    fileList = fileList.filter(item => item.id !== fileId);
    updatePreview();
    showToast('파일이 목록에서 삭제되었습니다.', 'info');
  });

  // 전체 비우기
  clearAllBtn.addEventListener('click', () => {
    if (fileList.length === 0) return;
    if (confirm('모든 파일을 목록에서 지우시겠습니까?')) {
      fileList = [];
      updatePreview();
      showToast('모든 파일이 제거되었습니다.', 'info');
    }
  });

  // ==========================================
  // 7. 업로드 인터랙션 (Drag & Drop & Input)
  // ==========================================

  // 드롭존 클릭 시 파일 선택창 오픈
  selectFilesBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    fileInput.value = ''; // 재선택 가능하도록 초기화
  });

  // 드래그 앤 드롭 효과
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      handleFiles(dt.files);
    }
  });

  // 전체 화면 드롭 방지 (브라우저가 파일 직접 열어버리는 현상 방지)
  window.addEventListener('dragover', (e) => e.preventDefault(), false);
  window.addEventListener('drop', (e) => e.preventDefault(), false);

  // ==========================================
  // 8. 규칙 컨트롤 이벤트 리스너
  // ==========================================
  const ruleInputs = [
    prefixInput,
    suffixInput,
    customNameInput,
    startNumber,
    numberDigits,
    numPosition,
    numSeparator
  ];

  ruleInputs.forEach(input => {
    input.addEventListener('input', updatePreview);
    input.addEventListener('change', updatePreview);
  });

  // 본문 라디오 변경
  [modeKeep, modeCustom].forEach(radio => {
    radio.addEventListener('change', () => {
      if (modeCustom.checked) {
        customNameInput.disabled = false;
        customNameInput.focus();
      } else {
        customNameInput.disabled = true;
      }
      updatePreview();
    });
  });

  // 넘버링 토글
  useNumbering.addEventListener('change', () => {
    const isChecked = useNumbering.checked;
    numberingOptions.style.opacity = isChecked ? '1' : '0.4';
    numberingOptions.style.pointerEvents = isChecked ? 'auto' : 'none';
    updatePreview();
  });

  // 규칙 초기화
  resetRulesBtn.addEventListener('click', () => {
    prefixInput.value = '';
    suffixInput.value = '';
    modeKeep.checked = true;
    customNameInput.value = '';
    customNameInput.disabled = true;
    useNumbering.checked = true;
    numberingOptions.style.opacity = '1';
    numberingOptions.style.pointerEvents = 'auto';
    startNumber.value = 1;
    numberDigits.value = 2;
    numPosition.value = 'suffix_before';
    numSeparator.value = '_';

    updatePreview();
    showToast('규칙이 기본값으로 초기화되었습니다.', 'info');
  });

  // ==========================================
  // 9. JSZip 일괄 변경 및 압축 다운로드
  // ==========================================
  downloadZipBtn.addEventListener('click', async () => {
    if (fileList.length === 0) {
      showToast('다운로드할 파일이 없습니다.', 'warning');
      return;
    }

    if (typeof JSZip === 'undefined') {
      showToast('JSZip 라이브러리를 로드할 수 없습니다. 인터넷 연결을 확인하세요.', 'danger');
      return;
    }

    // UI 비활성화 및 로딩 전환
    downloadZipBtn.disabled = true;
    downloadBtnText.textContent = '압축 파일 생성 중...';
    progressContainer.style.display = 'block';
    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressStatus.textContent = '파일 패키징 준비 중...';

    try {
      const zip = new JSZip();
      const usedFilenames = new Set();

      // 파일명 중복 충돌 방지 맵
      fileList.forEach((item, index) => {
        let newName = computeNewFilename(item, index);

        // 동일한 파일명이 생성된 경우 안전하게 번호 추가
        if (usedFilenames.has(newName)) {
          const { base, ext } = splitFilename(newName);
          let duplicateIndex = 1;
          while (usedFilenames.has(`${base} (${duplicateIndex})${ext}`)) {
            duplicateIndex++;
          }
          newName = `${base} (${duplicateIndex})${ext}`;
        }
        usedFilenames.add(newName);

        // ZIP에 새 이름으로 파일 바이너리 추가
        zip.file(newName, item.file);
      });

      progressStatus.textContent = 'ZIP 압축 진행 중...';

      // 압축 생성 (진행률 모니터링)
      const zipBlob = await zip.generateAsync(
        {
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        },
        (metadata) => {
          const percent = Math.round(metadata.percent);
          progressFill.style.width = `${percent}%`;
          progressPercent.textContent = `${percent}%`;
          if (metadata.currentFile) {
            progressStatus.textContent = `압축 중: ${metadata.currentFile}`;
          }
        }
      );

      // 다운로드 트리거
      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.href = downloadUrl;
      a.download = `bslab_renamed_${dateStr}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // URL 해제
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

      showToast('성공적으로 압축 파일이 다운로드되었습니다!', 'success');
      progressStatus.textContent = '압축 완료!';
      progressFill.style.width = '100%';
      progressPercent.textContent = '100%';

      setTimeout(() => {
        progressContainer.style.display = 'none';
      }, 2500);

    } catch (err) {
      console.error('압축 다운로드 실패:', err);
      showToast('압축 중 오류가 발생했습니다: ' + err.message, 'danger');
      progressContainer.style.display = 'none';
    } finally {
      downloadZipBtn.disabled = false;
      downloadBtnText.textContent = '일괄 변경 및 다운로드 (ZIP)';
    }
  });

  // ==========================================
  // 10. 부가 인터랙션 (구글 로그인 및 로고)
  // ==========================================
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', () => {
      showToast('Google 계정 연동 및 클라우드 동기화 기능은 곧 지원될 예정입니다.', 'info');
    });
  }

  // 초기 렌더링 호출
  updatePreview();
});

