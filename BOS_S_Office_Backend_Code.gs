/**
 * ============================================================================
 * BOS'S Office - Google Apps Script 실시간 클라우드 DB 백엔드 (Code.gs)
 * ============================================================================
 * 
 * [배포 안내]
 * 1. sheets.new (새 Google 스프레드시트)를 생성합니다.
 * 2. 상단 메뉴 [확장 프로그램] ➔ [Apps Script] 클릭 후 이 파일의 전체 코드를 붙여넣습니다.
 * 3. 우측 상단 [배포] ➔ [새 배포] 클릭
 *    - 유형: 웹 앱 (Web App)
 *    - 설명: BOS'S Office API
 *    - 다음 사용자 권한으로 실행: '나(내 Google 계정)'
 *    - 액세스 권한: '모든 사용자(Anyone)'  <-- 반드시 '모든 사용자'로 설정해야 합니다!
 * 4. 생성된 웹 앱 URL(https://script.google.com/macros/s/.../exec)을 복사하여
 *    BOS'S Office 관리자 대시보드의 클라우드 연동 URL 입력창에 붙여넣습니다.
 */

const SUPER_ADMIN_EMAIL = "bosung3116@gmail.com";

// ============================================================================
// 1. GET 요청 핸들러 (사용자 목록 조회, 상태 확인, Ping 테스트)
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

    // C. 연결 테스트 Ping
    return createJsonResponse({
      status: 'success',
      message: "BOS'S Office Cloud DB is online!",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.toString() });
  }
}

// ============================================================================
// 2. POST 요청 핸들러 (승인 요청, 상태 변경, 등급 지정)
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

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

