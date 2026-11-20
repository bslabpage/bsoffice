/**
 * ============================================================================
 * BOS'S Office - Google Apps Script 실시간 클라우드 DB & 드라이브 백엔드 (Code.gs)
 * ============================================================================
 * 
 * [배포 및 업데이트 안내]
 * 1. 구글 스프레드시트의 상단 메뉴 [확장 프로그램] ➔ [Apps Script]를 엽니다.
 * 2. 기존 코드를 모두 지우고 이 파일(Code.gs)의 전체 코드를 붙여넣은 뒤 저장(Ctrl+S)합니다.
 * 3. 우측 상단 [배포] ➔ [배포 관리] 클릭 ➔ 연필 모양(수정) 아이콘 클릭
 *    - 버전: '새 버전' 선택
 *    - 설명: 'BOS'S Office API (드라이브 자동 저장 지원)' 입력
 *    - 다음 사용자 권한으로 실행: '나(내 Google 계정 - bosung3116@gmail.com)'
 *    - 액세스 권한: '모든 사용자(Anyone)'
 *    ➔ [배포] 버튼 클릭!
 * 4. ※ 구글 드라이브(DriveApp) 접근 권한 팝업이 뜨면 '고급 ➔ 이동 ➔ 허용'을 클릭하여 승인합니다.
 *    이후 사용자들이 작업한 PDF 파일이 관리자 구글 드라이브 'BOS'S Office 작업 문서' 폴더에
 *    항목별(PDF 병합, 문서 용량 압축 등)로 안전하게 자동 저장됩니다.
 */

const SUPER_ADMIN_EMAIL = "bosung3116@gmail.com";

// ============================================================================
// 1. GET 요청 핸들러 (사용자 목록 조회, 저장된 파일 목록 조회, 상태 확인, Ping)
// ============================================================================
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'ping';
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("Users");
    if (!sheet) {
      sheet = initUsersSheet(ss);
    }

    // A. 전체 사용자 목록 조회 (관리자 대시보드용)
    if (action === 'get_users') {
      const users = getAllUsers(sheet);
      return createJsonResponse({ status: 'success', users: users });
    }

    // B. 특정 사용자의 실시간 승인 상태 및 등급 확인 (사용자 로그인 시)
    if (action === 'check_user') {
      const email = (e.parameter.email || '').toLowerCase().trim();
      const users = getAllUsers(sheet);
      const user = users.find(function(u) { return u.email.toLowerCase() === email; });
      return createJsonResponse({ status: 'success', user: user || null });
    }

    // C. 최근 구글 드라이브에 저장된 작업 파일 목록 조회 (관리자 대시보드용)
    if (action === 'get_drive_files') {
      const savedSheet = ss.getSheetByName("Saved_Files");
      if (!savedSheet) {
        return createJsonResponse({ status: 'success', files: [] });
      }
      const fileRows = savedSheet.getDataRange().getValues();
      const files = [];
      for (let i = 1; i < fileRows.length; i++) {
        if (!fileRows[i][0]) continue;
        files.push({
          saved_at: fileRows[i][0],
          category: fileRows[i][1],
          fileName: fileRows[i][2],
          userEmail: fileRows[i][3],
          fileSize: fileRows[i][4],
          fileUrl: fileRows[i][5]
        });
      }
      // 최신순으로 상위 50개 반환
      return createJsonResponse({ status: 'success', files: files.reverse().slice(0, 50) });
    }

    // D. 연결 테스트 Ping
    return createJsonResponse({
      status: 'success',
      message: "BOS'S Office Cloud DB & Drive Engine is online!",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.toString() });
  }
}

// ============================================================================
// 2. POST 요청 핸들러 (승인 요청, 상태/등급 변경, 구글 드라이브 파일 저장)
// ============================================================================
function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }
    const action = payload.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("Users");
    if (!sheet) {
      sheet = initUsersSheet(ss);
    }

    // A. 외부 사용자의 사이트 사용 승인 요청 접수
    if (action === 'request_access') {
      const email = (payload.email || '').toLowerCase().trim();
      const name = (payload.name || email.split('@')[0]).trim();
      const dept = payload.department || '';
      const reason = payload.reason || '';
      const now = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");

      const rows = sheet.getDataRange().getValues();
      let rowIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0].toString().toLowerCase().trim() === email) {
          rowIndex = i + 1; // 1-based index
          break;
        }
      }

      if (rowIndex > 0) {
        // 기존 계정의 신청 정보 업데이트 (승인 대기 상태로 전환)
        sheet.getRange(rowIndex, 2).setValue(name);
        sheet.getRange(rowIndex, 3).setValue(dept);
        sheet.getRange(rowIndex, 4).setValue(reason);
        sheet.getRange(rowIndex, 7).setValue('pending'); // status
        sheet.getRange(rowIndex, 8).setValue(now);       // requested_at
      } else {
        // 신규 사용자 추가: [이메일, 이름, 부서, 신청사유, 등급, 프로필사진, 상태, 신청일시, 승인일시]
        sheet.appendRow([email, name, dept, reason, 'guest', payload.picture || '', 'pending', now, '']);
      }

      return createJsonResponse({
        status: 'success',
        message: '승인 요청이 클라우드 데이터베이스에 성공적으로 접수되었습니다.'
      });
    }

    // B. 관리자의 회원 상태 변경 (approved / rejected / pending)
    if (action === 'update_status') {
      const email = (payload.email || '').toLowerCase().trim();
      const status = payload.status; // 'approved' | 'rejected' | 'pending'
      const now = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");

      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0].toString().toLowerCase().trim() === email) {
          const rowNum = i + 1;
          sheet.getRange(rowNum, 7).setValue(status);
          if (status === 'approved') {
            sheet.getRange(rowNum, 9).setValue(now);
            // 비회원이었으면 기본 회원으로 승격
            if (rows[i][4] === 'guest') {
              sheet.getRange(rowNum, 5).setValue('member');
            }
          }
          break;
        }
      }
      return createJsonResponse({ status: 'success', message: '상태가 변경되었습니다.' });
    }

    // C. 관리자의 회원 등급 지정 (admin / member / guest)
    if (action === 'set_role') {
      const email = (payload.email || '').toLowerCase().trim();
      const role = payload.role; // 'admin' | 'member' | 'guest'

      if (email === SUPER_ADMIN_EMAIL.toLowerCase()) {
        return createJsonResponse({ status: 'error', message: '최고 관리자의 등급은 변경할 수 없습니다.' });
      }

      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0].toString().toLowerCase().trim() === email) {
          sheet.getRange(i + 1, 5).setValue(role);
          break;
        }
      }
      return createJsonResponse({ status: 'success', message: '등급이 변경되었습니다.' });
    }

    // D. 사용자가 작업한 PDF/문서 파일 관리자 구글 드라이브에 항목별 자동 저장
    if (action === 'save_to_drive') {
      const category = (payload.category || '기타 PDF').trim(); // 예: 'PDF 병합', '문서 용량 압축'
      const rawFileName = (payload.fileName || ('document_' + new Date().getTime() + '.pdf')).trim();
      const base64Data = payload.base64Data || '';
      const userEmail = (payload.userEmail || '익명 사용자').trim();
      const mimeType = payload.mimeType || 'application/pdf';

      if (!base64Data) {
        return createJsonResponse({ status: 'error', message: '파일 데이터(base64)가 비어있습니다.' });
      }

      // 1. 최상위 루트 폴더: "BOS'S Office 작업 문서"
      const rootFolderName = "BOS'S Office 작업 문서";
      let rootFolder;
      const rootFolders = DriveApp.getFoldersByName(rootFolderName);
      if (rootFolders.hasNext()) {
        rootFolder = rootFolders.next();
      } else {
        rootFolder = DriveApp.createFolder(rootFolderName);
      }

      // 2. 항목(카테고리)별 서브 폴더: 예: "PDF 병합", "문서 용량 압축"
      let categoryFolder;
      const categoryFolders = rootFolder.getFoldersByName(category);
      if (categoryFolders.hasNext()) {
        categoryFolder = categoryFolders.next();
      } else {
        categoryFolder = rootFolder.createFolder(category);
      }

      // 3. Base64 디코딩 및 Blob 생성
      let rawBase64 = base64Data;
      if (rawBase64.indexOf(';base64,') !== -1) {
        rawBase64 = rawBase64.split(';base64,')[1];
      }
      const decodedBytes = Utilities.base64Decode(rawBase64);
      const blob = Utilities.newBlob(decodedBytes, mimeType, rawFileName);

      // 4. 구글 드라이브 해당 항목 폴더에 파일 저장
      const file = categoryFolder.createFile(blob);
      const nowStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
      file.setDescription(`[BOS'S Office 작업 문서]\n작업자: ${userEmail}\n항목: ${category}\n저장일시: ${nowStr}`);

      // 5. 스프레드시트 'Saved_Files' 탭에 실시간 기록
      try {
        logSavedFileToSheet(ss, category, rawFileName, userEmail, file.getUrl(), blob.getBytes().length);
      } catch (logErr) {
        // 기록 에러 시에도 파일 생성은 성공했으므로 계속 진행
      }

      return createJsonResponse({
        status: 'success',
        message: '구글 드라이브 [' + category + '] 폴더에 성공적으로 저장되었습니다.',
        fileId: file.getId(),
        fileUrl: file.getUrl(),
        fileName: file.getName(),
        category: category
      });
    }

    return createJsonResponse({ status: 'error', message: '알 수 없는 요청 action: ' + action });
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.toString() });
  }
}

// ============================================================================
// 3. 헬퍼 함수
// ============================================================================
function initUsersSheet(ss) {
  let sheet = ss.getSheetByName("Users");
  if (!sheet) {
    sheet = ss.insertSheet("Users");
    sheet.appendRow(["이메일", "이름", "부서", "신청사유", "등급", "프로필사진", "승인상태", "신청일시", "승인일시"]);
    
    // 최고 관리자 시드 데이터
    sheet.appendRow([
      SUPER_ADMIN_EMAIL,
      "김보성 (최고 관리자)",
      "총괄관리",
      "시스템 최고 관리자",
      "admin",
      "",
      "approved",
      "2026-11-01 00:00:00",
      "2026-11-01 00:00:00"
    ]);

    sheet.setFrozenRows(1);
    const headerRange = sheet.getRange(1, 1, 1, 9);
    headerRange.setFontWeight("bold").setBackground("#4f46e5").setFontColor("#ffffff");
  }
  return sheet;
}

function getAllUsers(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const users = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    users.push({
      email: row[0].toString().trim(),
      name: row[1].toString().trim(),
      department: row[2].toString().trim(),
      reason: row[3].toString().trim(),
      role: row[4].toString().trim() || 'guest',
      picture: row[5].toString().trim(),
      status: row[6].toString().trim() || 'pending',
      requested_at: row[7].toString().trim(),
      approved_at: row[8].toString().trim(),
      is_super: (row[0].toString().toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase())
    });
  }
  return users;
}

function logSavedFileToSheet(ss, category, fileName, userEmail, fileUrl, byteLength) {
  let sheet = ss.getSheetByName("Saved_Files");
  if (!sheet) {
    sheet = ss.insertSheet("Saved_Files");
    sheet.appendRow(["저장일시", "항목(카테고리)", "파일명", "작업자 이메일", "용량", "구글 드라이브 링크"]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#4f46e5").setFontColor("#ffffff");
  }
  const now = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
  const sizeFormatted = formatByteSize(byteLength);
  sheet.appendRow([now, category, fileName, userEmail, sizeFormatted, fileUrl]);
}

function formatByteSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let s = bytes;
  while (s >= 1024 && i < units.length - 1) {
    s /= 1024;
    i++;
  }
  return s.toFixed(1) + ' ' + units[i];
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
