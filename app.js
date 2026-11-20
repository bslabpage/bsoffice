/**
 * BSoffice - Modern Integrated Web Application Portal
 * GitHub Pages Static Web Compatible & Zero Server Dependency
 * Real Google OAuth 2.0 (GIS Client SDK) & Client-side Storage Engine
 */

const GOOGLE_CLIENT_ID = '659290198207-jo65ar0u3439lp5mf1rbkpmrvqhujmcl.apps.googleusercontent.com';
const ADMIN_EMAIL = 'bosung3116@gmail.com';
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbx2HG6H8ZcqbtF0lNxY5aZGew4feCk8sMIbPLHQnEYaWpGG7GujQBa7Tjubty5ZyAAw/exec';

// ============================================================================
// Google Sheets Cloud Sync Engine (Real-time Cross-Device Storage Layer)
// ============================================================================
const CloudSync = {
  getUrl() {
    return localStorage.getItem('bsoffice_gas_url') || DEFAULT_GAS_URL || '';
  },

  setUrl(url) {
    if (url) {
      localStorage.setItem('bsoffice_gas_url', url.trim());
    } else {
      localStorage.removeItem('bsoffice_gas_url');
    }
  },

  isConfigured() {
    const url = this.getUrl();
    return !!url && url.startsWith('https://script.google.com/macros/s/');
  },

  // Ping test
  async ping() {
    const url = this.getUrl();
    if (!this.isConfigured()) {
      return { success: false, message: 'Google Apps Script URL이 설정되지 않았습니다.' };
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(url + '?action=ping', {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timer);

      // Check if redirected to Google sign-in
      if (res.url && res.url.includes('accounts.google.com')) {
        return {
          success: false,
          isAuthRedirect: true,
          message: "Google 로그인 페이지로 리디렉션되었습니다. Apps Script 배포 설정에서 '액세스 권한'을 '모든 사용자(Anyone)'로 변경해주세요."
        };
      }

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.status === 'success') {
          return { success: true, message: "BOS'S Office 클라우드 DB 정상 연결 완료" };
        }
      }
      return { success: false, message: '응답 데이터 파싱 실패 또는 상태 오류' };
    } catch (e) {
      if (e.name === 'AbortError') {
        return { success: false, message: '연결 시간 초과 (7초)' };
      }
      return { success: false, message: e.message || '네트워크 연결 오류' };
    }
  },

  // Fetch all users from Google Sheet
  async getUsers() {
    if (!this.isConfigured()) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(this.getUrl() + '?action=get_users', {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timer);

      if (res.url && res.url.includes('accounts.google.com')) {
        console.warn('Apps Script requires login. Please set Who has access to Anyone.');
        return null;
      }

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.status === 'success' && Array.isArray(data.users)) {
          return data.users;
        }
      }
    } catch (e) {
      console.warn('CloudSync.getUsers error:', e);
    }
    return null;
  },

  // Check single user status & role from Google Sheet
  async checkUser(email) {
    if (!this.isConfigured() || !email) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(this.getUrl() + '?action=check_user&email=' + encodeURIComponent(email), {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timer);

      if (res.url && res.url.includes('accounts.google.com')) return null;

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.status === 'success' && data.user) {
          return data.user;
        }
      }
    } catch (e) {
      console.warn('CloudSync.checkUser error:', e);
    }
    return null;
  },

  // Send approval request to Google Sheet (Plain POST without json header to prevent OPTIONS preflight)
  async requestAccess(userReq) {
    if (!this.isConfigured()) return false;
    try {
      const payload = {
        action: 'request_access',
        email: userReq.email,
        name: userReq.name,
        picture: userReq.picture || '',
        department: userReq.department,
        reason: userReq.reason
      };

      const res = await fetch(this.getUrl(), {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return data.status === 'success';
      }
    } catch (e) {
      console.warn('CloudSync.requestAccess error:', e);
    }
    return false;
  },

  // Update status (approved / rejected / pending)
  async updateStatus(email, status) {
    if (!this.isConfigured()) return false;
    try {
      const payload = { action: 'update_status', email, status };
      const res = await fetch(this.getUrl(), {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return data.status === 'success';
      }
    } catch (e) {
      console.warn('CloudSync.updateStatus error:', e);
    }
    return false;
  },

  // Set role (admin / member / guest)
  async setRole(email, role) {
    if (!this.isConfigured()) return false;
    try {
      const payload = { action: 'set_role', email, role };
      const res = await fetch(this.getUrl(), {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return data.status === 'success';
      }
    } catch (e) {
      console.warn('CloudSync.setRole error:', e);
    }
    return false;
  }
};

// Sync logged-in user profile & approval status with Cloud DB
async function syncUserWithCloud(user) {
  if (!CloudSync.isConfigured() || !user || !user.email) return user;
  try {
    const cloudUser = await CloudSync.checkUser(user.email);
    if (cloudUser) {
      let changed = false;
      if (cloudUser.status && cloudUser.status !== user.status) {
        user.status = cloudUser.status;
        changed = true;
      }
      if (cloudUser.role && cloudUser.role !== user.role) {
        user.role = cloudUser.role;
        changed = true;
      }
      if (cloudUser.department) user.department = cloudUser.department;
      if (cloudUser.reason) user.reason = cloudUser.reason;

      if (changed) {
        const users = Storage.getUsers();
        const idx = users.findIndex(u => u.email.toLowerCase() === user.email.toLowerCase());
        if (idx !== -1) {
          users[idx] = { ...users[idx], ...user };
          Storage.saveUsers(users);
        }
        Storage.setCurrentUser(user);
      }
    }
  } catch (e) {
    console.warn('syncUserWithCloud error:', e);
  }
  return user;
}

// Default Office Tools (Relative Paths for GitHub Pages)
const DEFAULT_APPS = [
  {
    id: "pdf-converter",
    name: "PDF 변환기",
    folder: "pdf 변환기",
    entry: "./pdf 변환기/index.html",
    category: "문서 변환 & 병합",
    desc: "브라우저에서 100% 안전하고 빠르게 PDF를 병합하고 Word/PPT 문서로 상호 변환합니다.",
    icon: "file-text",
    badge: "PRO",
    color: "#4f46e5"
  },
  {
    id: "qr-generator",
    name: "QR코드 생성기",
    folder: "QR코드 생성기",
    entry: "./QR코드 생성기/index.html",
    category: "홍보 & 마케팅",
    desc: "URL 및 파일 입력 시 즉각적인 고화질 JPG QR코드를 실시간 생성 및 다운로드합니다.",
    icon: "qr-code",
    badge: "v2.0",
    color: "#4f46e5"
  },
  {
    id: "doc-compressor",
    name: "문서 용량 압축기",
    folder: "문서 용량 압축기",
    entry: "./문서 용량 압축기/index.html",
    category: "용량 최적화",
    desc: "PPT, Word, PDF, 이미지 파일의 대용량을 브라우저에서 초고속으로 압축합니다.",
    icon: "minimize-2",
    badge: "스마트",
    color: "#4f46e5"
  },
  {
    id: "image-resizer",
    name: "이미지 리사이즈",
    folder: "이미지 리사이즈",
    entry: "./이미지 리사이즈/index.html",
    category: "디자인 & 미디어",
    desc: "사진 비율 조절, 패딩/크롭 모드, 고화질 다중 변환 및 ZIP 일괄 다운로드를 제공합니다.",
    icon: "image",
    badge: "일괄처리",
    color: "#4f46e5"
  },
  {
    id: "batch-renamer",
    name: "파일명 일괄변경기",
    folder: "파일명 일괄변경기",
    entry: "./파일명 일괄변경기/index.html",
    category: "업무 자동화",
    desc: "패턴 치환, 접두사/접미사, 번호 매기기, 날짜 삽입으로 대량 파일명을 한 번에 정리합니다.",
    icon: "edit-3",
    badge: "생산성",
    color: "#4f46e5"
  }
];

// Application State
const state = {
  currentUser: null,       // { email, name, picture, role, status, ... }
  apps: DEFAULT_APPS,      // Array of registered tools
  config: null,            // System config
  currentView: 'home',     // 'home' | 'admin' | 'viewer'
  currentApp: null         // Currently loaded app in embedded viewer
};

// SVG Icon Mapping for dynamic cards
const APP_ICONS = {
  'file-text': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
  'qr-code': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
  'minimize-2': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`,
  'image': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
  'edit-3': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`
};

// ============================================================================
// Client-Side Storage Manager (GitHub Pages & Static Web Engine)
// ============================================================================
const Storage = {
  getUsers() {
    let users = [];
    try {
      const data = localStorage.getItem('bsoffice_users');
      if (data) users = JSON.parse(data);
    } catch (e) {}

    // Ensure super admin bosung3116@gmail.com is always registered and immutable
    let admin = users.find(u => u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
    if (!admin) {
      admin = {
        email: ADMIN_EMAIL,
        name: "김보성 (최고 관리자)",
        picture: "",
        role: "admin",
        status: "approved",
        department: "총괄관리",
        reason: "시스템 최고 관리자",
        approved_at: "2026-11-01 00:00:00",
        created_at: "2026-11-01 00:00:00",
        is_super: true
      };
      users.unshift(admin);
    } else {
      admin.role = "admin";
      admin.status = "approved";
      admin.is_super = true;
    }
    localStorage.setItem('bsoffice_users', JSON.stringify(users));
    return users;
  },

  saveUsers(users) {
    try {
      localStorage.setItem('bsoffice_users', JSON.stringify(users));
    } catch (e) {}
  },

  getLogs() {
    try {
      const data = localStorage.getItem('bsoffice_usage_logs');
      if (data) return JSON.parse(data);
    } catch (e) {}
    return [];
  },

  saveLogs(logs) {
    try {
      localStorage.setItem('bsoffice_usage_logs', JSON.stringify(logs));
    } catch (e) {}
  },

  getCurrentUser() {
    try {
      const data = localStorage.getItem('bsoffice_current_user');
      if (data) return JSON.parse(data);
    } catch (e) {}
    return null;
  },

  setCurrentUser(user) {
    if (user) {
      localStorage.setItem('bsoffice_current_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('bsoffice_current_user');
      localStorage.removeItem('bsoffice_token');
    }
  }
};

// ============================================================================
// Initialization
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initEventListeners();
  initGoogleIdentity();
  await loadConfig();
  await checkAuth();

  // Check URL parameters (OAuth redirect result if any)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('login_success') === '1') {
    showToast('구글 로그인이 성공적으로 완료되었습니다!', 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (urlParams.get('auth_error')) {
    showToast(`로그인 처리 결과: ${decodeURIComponent(urlParams.get('auth_error'))}`, 'info');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (urlParams.get('approval_required') === '1') {
    if (state.currentUser) {
      showApprovalModal();
    } else {
      openLoginModal();
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }
});

// ============================================================================
// Google Identity Services (GSI SDK) Integration
// ============================================================================
function initGoogleIdentity() {
  if (window.google && google.accounts && google.accounts.id) {
    try {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true
      });

      // Render official Google button into modal container
      const btnTarget = document.getElementById('gsi-button-target');
      if (btnTarget) {
        google.accounts.id.renderButton(btnTarget, {
          theme: 'outline',
          size: 'large',
          type: 'standard',
          shape: 'rectangular',
          text: 'signin_with',
          logo_alignment: 'left',
          locale: 'ko',
          width: 320
        });
      }
    } catch (e) {
      console.warn("Google Identity initialization note:", e);
    }
  } else {
    // Retry if script loads asynchronously
    setTimeout(() => {
      if (window.google && google.accounts && google.accounts.id) {
        initGoogleIdentity();
      }
    }, 600);
  }
}

function handleGoogleCredentialResponse(response) {
  if (!response || !response.credential) return;
  try {
    const payload = parseJwt(response.credential);
    const email = payload.email;
    const name = payload.name || email.split('@')[0];
    const picture = payload.picture || '';

    closeModal('modal-login-choice');
    loginUserDirect(email, name, picture);
    showToast(`${name}님 환영합니다! (Google 계정 연동 완료)`, 'success');
  } catch (err) {
    console.error('Failed to parse Google credential:', err);
    showToast('구글 로그인 토큰 해석에 실패했습니다.', 'error');
  }
}

function parseJwt(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
  return JSON.parse(jsonPayload);
}

// ============================================================================
// Direct User Login & Registration Logic
// ============================================================================
function loginUserDirect(email, name, picture = '') {
  email = email.trim().toLowerCase();
  name = (name || email.split('@')[0]).trim();
  const isSuperAdmin = (email === ADMIN_EMAIL.toLowerCase());

  const users = Storage.getUsers();
  let user = users.find(u => u.email.toLowerCase() === email);

  if (!user) {
    user = {
      email,
      name,
      picture,
      role: isSuperAdmin ? 'admin' : 'guest',
      status: isSuperAdmin ? 'approved' : 'pending',
      department: isSuperAdmin ? '총괄관리' : '신규가입',
      reason: isSuperAdmin ? '시스템 최고 관리자' : '사이트 이용 승인 요청 대기',
      requested_at: isSuperAdmin ? '' : new Date().toLocaleString('ko-KR'),
      approved_at: isSuperAdmin ? new Date().toLocaleString('ko-KR') : '',
      created_at: new Date().toLocaleString('ko-KR'),
      is_super: isSuperAdmin
    };
    users.push(user);
  } else {
    if (isSuperAdmin) {
      user.role = 'admin';
      user.status = 'approved';
      user.is_super = true;
    }
    if (picture) user.picture = picture;
    if (name) user.name = name;
  }

  Storage.saveUsers(users);
  Storage.setCurrentUser(user);
  setAuthenticatedUser(user);

  // Background Cloud Sync for external user check
  if (CloudSync.isConfigured() && !isSuperAdmin) {
    syncUserWithCloud(user).then(syncedUser => {
      if (syncedUser) setAuthenticatedUser(syncedUser);
    });
  }
}

// ============================================================================
// API Helpers (Pure Client-side Static Simulation & Cloud DB Integration)
// ============================================================================
async function apiCall(endpoint, method = 'GET', body = null) {
  // Try real server if on localhost with server.py running
  const isStaticSite = window.location.protocol === 'file:' || window.location.hostname.endsWith('github.io');
  if (!isStaticSite) {
    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      const savedToken = localStorage.getItem('bsoffice_token');
      if (savedToken) options.headers['X-Session-Token'] = savedToken;
      if (body) options.body = JSON.stringify(body);

      const res = await fetch(endpoint, options);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      // Fallback to local storage logic
    }
  }

  // Pure Client-side Static Simulation & Cloud DB Integration
  return await handleStaticApi(endpoint, method, body);
}

async function handleStaticApi(endpoint, method, body) {
  const normEndpoint = endpoint.split('?')[0];

  // 1. Config
  if (normEndpoint === '/api/config') {
    return {
      google_client_id: GOOGLE_CLIENT_ID,
      admin_email: ADMIN_EMAIL,
      apps: DEFAULT_APPS
    };
  }

  // 2. Auth me
  if (normEndpoint === '/api/auth/me') {
    const user = Storage.getCurrentUser();
    return { authenticated: !!user, user };
  }

  // 3. Logout
  if (normEndpoint === '/api/auth/logout') {
    Storage.setCurrentUser(null);
    return { success: true };
  }

  // 4. Track usage
  if (normEndpoint === '/api/track_usage') {
    const user = Storage.getCurrentUser();
    if (user && body && body.app_id) {
      const logs = Storage.getLogs();
      const matchedApp = DEFAULT_APPS.find(a => a.id === body.app_id);
      logs.unshift({
        id: Date.now(),
        user_email: user.email,
        user_name: user.name,
        app_id: body.app_id,
        app_name: matchedApp ? matchedApp.name : body.app_id,
        timestamp: new Date().toLocaleString('ko-KR')
      });
      if (logs.length > 200) logs.pop();
      Storage.saveLogs(logs);
    }
    return { success: true };
  }

  // 5. Admin stats
  if (normEndpoint === '/api/admin/stats') {
    const users = Storage.getUsers();
    const logs = Storage.getLogs();

    const total_logs = logs.length;
    const activeEmails = new Set(logs.map(l => l.user_email));
    const pending_count = users.filter(u => u.status === 'pending').length;
    const approved_count = users.filter(u => u.status === 'approved').length;

    const app_stats = DEFAULT_APPS.map(app => {
      const appLogs = logs.filter(l => l.app_id === app.id);
      const uniqueUsers = new Set(appLogs.map(l => l.user_email)).size;
      const lastLog = appLogs[0];

      const userMap = {};
      appLogs.forEach(l => {
        userMap[l.user_email] = (userMap[l.user_email] || 0) + 1;
      });

      const top_users = Object.entries(userMap).map(([email, cnt]) => {
        const u = users.find(x => x.email === email);
        return {
          user_name: u ? u.name : email,
          user_email: email,
          cnt,
          last_time: appLogs.find(l => l.user_email === email)?.timestamp || '-'
        };
      }).sort((a, b) => b.cnt - a.cnt).slice(0, 5);

      return {
        id: app.id,
        name: app.name,
        category: app.category,
        color: app.color,
        usage_count: appLogs.length,
        unique_users: uniqueUsers,
        last_used: lastLog ? lastLog.timestamp : '-',
        top_users
      };
    });

    return {
      summary: {
        total_logs,
        total_active_users: activeEmails.size,
        pending_count,
        approved_count
      },
      app_stats,
      recent_logs: logs.slice(0, 30)
    };
  }

  // 6. Admin users (Cloud Sync merged)
  if (normEndpoint === '/api/admin/users') {
    let users = Storage.getUsers();

    // Pull external user requests from Google Sheets if configured
    if (CloudSync.isConfigured()) {
      try {
        const cloudUsers = await CloudSync.getUsers();
        if (cloudUsers && Array.isArray(cloudUsers) && cloudUsers.length > 0) {
          const localMap = new Map(users.map(u => [u.email.toLowerCase(), u]));
          cloudUsers.forEach(cu => {
            const emailLower = cu.email.toLowerCase();
            if (localMap.has(emailLower)) {
              const existing = localMap.get(emailLower);
              if (existing.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
                existing.name = cu.name || existing.name;
                existing.department = cu.department || existing.department;
                existing.reason = cu.reason || existing.reason;
                existing.role = cu.role || existing.role;
                existing.status = cu.status || existing.status;
                existing.requested_at = cu.requested_at || existing.requested_at;
                existing.approved_at = cu.approved_at || existing.approved_at;
              }
            } else {
              users.push({
                ...cu,
                created_at: cu.requested_at || new Date().toLocaleString('ko-KR')
              });
            }
          });
          Storage.saveUsers(users);
        }
      } catch (err) {
        console.warn('Failed to sync users from Google Sheets:', err);
      }
    }

    const logs = Storage.getLogs();
    const withUsage = users.map(u => ({
      ...u,
      total_usage: logs.filter(l => l.user_email === u.email).length
    }));
    return { users: withUsage };
  }

  // 7. Admin approve (승인)
  if (normEndpoint === '/api/admin/approve') {
    const users = Storage.getUsers();
    const target = users.find(u => u.email.toLowerCase() === body.email.toLowerCase());
    if (target) {
      target.status = 'approved';
      target.approved_at = new Date().toLocaleString('ko-KR');
      if (target.role === 'guest') {
        target.role = 'member'; // 기본 회원 등급 부여
      }
      Storage.saveUsers(users);
      if (state.currentUser && state.currentUser.email.toLowerCase() === target.email.toLowerCase()) {
        state.currentUser.status = 'approved';
        state.currentUser.role = target.role;
        Storage.setCurrentUser(state.currentUser);
      }
    }

    // Sync to Cloud DB
    if (CloudSync.isConfigured()) {
      await CloudSync.updateStatus(body.email, 'approved');
    }

    return { success: true, message: `${body.email} 계정이 승인되었습니다.` };
  }

  // 8. Admin reject (거절)
  if (normEndpoint === '/api/admin/reject') {
    const users = Storage.getUsers();
    const target = users.find(u => u.email.toLowerCase() === body.email.toLowerCase());
    if (target) {
      target.status = 'rejected';
      Storage.saveUsers(users);
      if (state.currentUser && state.currentUser.email.toLowerCase() === target.email.toLowerCase()) {
        state.currentUser.status = 'rejected';
        Storage.setCurrentUser(state.currentUser);
      }
    }

    // Sync to Cloud DB
    if (CloudSync.isConfigured()) {
      await CloudSync.updateStatus(body.email, 'rejected');
    }

    return { success: true, message: `${body.email} 계정이 거절되었습니다.` };
  }

  // Admin hold (보류)
  if (normEndpoint === '/api/admin/hold') {
    const users = Storage.getUsers();
    const target = users.find(u => u.email.toLowerCase() === body.email.toLowerCase());
    if (target) {
      target.status = 'pending';
      Storage.saveUsers(users);
      if (state.currentUser && state.currentUser.email.toLowerCase() === target.email.toLowerCase()) {
        state.currentUser.status = 'pending';
        Storage.setCurrentUser(state.currentUser);
      }
    }

    // Sync to Cloud DB
    if (CloudSync.isConfigured()) {
      await CloudSync.updateStatus(body.email, 'pending');
    }

    return { success: true, message: `${body.email} 계정이 보류되었습니다.` };
  }

  // Admin set role (등급 지정: admin, member, guest)
  if (normEndpoint === '/api/admin/set_role') {
    const users = Storage.getUsers();
    const target = users.find(u => u.email.toLowerCase() === body.email.toLowerCase());
    if (target) {
      if (target.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        throw new Error('최고 관리자의 등급은 변경할 수 없습니다.');
      }
      target.role = body.role; // 'admin' | 'member' | 'guest'
      Storage.saveUsers(users);
      if (state.currentUser && state.currentUser.email.toLowerCase() === target.email.toLowerCase()) {
        state.currentUser.role = body.role;
        Storage.setCurrentUser(state.currentUser);
      }
    }

    // Sync to Cloud DB
    if (CloudSync.isConfigured()) {
      await CloudSync.setRole(body.email, body.role);
    }

    return { success: true, message: `${body.email} 계정의 등급이 '${body.role}'(으)로 변경되었습니다.` };
  }

  // 9. Request access
  if (normEndpoint === '/api/request_access') {
    const curUser = Storage.getCurrentUser();
    if (!curUser) throw new Error('구글 로그인이 필요합니다.');

    const users = Storage.getUsers();
    let target = users.find(u => u.email.toLowerCase() === curUser.email.toLowerCase());
    if (!target) {
      target = { ...curUser, role: 'guest', created_at: new Date().toLocaleString('ko-KR') };
      users.push(target);
    }
    target.department = body.department;
    target.reason = body.reason;
    target.requested_at = new Date().toLocaleString('ko-KR');
    target.status = 'pending';
    Storage.saveUsers(users);

    curUser.department = body.department;
    curUser.reason = body.reason;
    curUser.status = 'pending';
    Storage.setCurrentUser(curUser);

    // Real-time Push to Cloud (Google Sheets)
    let cloudSynced = false;
    if (CloudSync.isConfigured()) {
      try {
        cloudSynced = await CloudSync.requestAccess({
          email: curUser.email,
          name: curUser.name,
          picture: curUser.picture,
          department: body.department,
          reason: body.reason
        });
      } catch (e) {
        console.warn('Cloud sync error on request_access:', e);
      }
    }

    const msg = cloudSynced
      ? `관리자(${ADMIN_EMAIL})의 Google 스프레드시트 클라우드 DB에 실시간 승인 요청이 전송되었습니다!`
      : `관리자(${ADMIN_EMAIL})에게 사용 승인 요청이 접수되었습니다.`;

    return {
      success: true,
      message: msg,
      user: curUser
    };
  }

  return { success: true };
}

async function loadConfig() {
  try {
    const res = await apiCall('/api/config');
    state.config = res;
    state.apps = res.apps || DEFAULT_APPS;
    renderAppCards();
  } catch (err) {
    state.apps = DEFAULT_APPS;
    renderAppCards();
  }
}

// ============================================================================
// Google Login Flow
// ============================================================================
function openLoginModal() {
  const modal = document.getElementById('modal-login-choice');
  if (modal) {
    modal.classList.remove('hidden');
    // Attempt prompt if GIS is loaded
    if (window.google && google.accounts && google.accounts.id) {
      try {
        google.accounts.id.prompt();
      } catch (e) {}
    }
  }
}

function redirectToGoogleLogin() {
  openLoginModal();
}

// ============================================================================
// Authentication Flow
// ============================================================================
async function checkAuth() {
  try {
    const res = await apiCall('/api/auth/me');
    if (res.authenticated && res.user) {
      const syncedUser = await syncUserWithCloud(res.user);
      setAuthenticatedUser(syncedUser);
    } else {
      setUnauthenticated();
    }
  } catch (err) {
    setUnauthenticated();
  }
}

function canAccessTools(user) {
  if (!user) return false;
  const isSuperAdmin = user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  if (isSuperAdmin || user.role === 'admin') return true;
  if (user.role === 'member' && user.status === 'approved') return true;
  return false;
}

function setAuthenticatedUser(user) {
  state.currentUser = user;

  // Toggle Header Sections
  document.getElementById('auth-guest').classList.add('hidden');
  document.getElementById('auth-logged-in').classList.remove('hidden');

  // Update Profile Chip
  const avatarEl = document.getElementById('user-avatar');
  avatarEl.src = user.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=4f46e5&color=fff&bold=true`;

  document.getElementById('user-name').textContent = user.name;
  document.getElementById('dropdown-user-email').textContent = user.email;

  const roleBadge = document.getElementById('user-role-badge');
  const statusText = document.getElementById('user-status-text');
  const dropdownStatus = document.getElementById('dropdown-user-status');
  const switchAdminBtn = document.getElementById('dropdown-btn-switch-admin');

  const isSuperAdmin = (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  const isAdmin = (user.role === 'admin' || isSuperAdmin);

  if (isAdmin) {
    roleBadge.textContent = isSuperAdmin ? '최고관리자' : '관리자';
    roleBadge.className = 'role-badge admin';
    statusText.textContent = isSuperAdmin ? '최고관리자' : '관리자 권한';
    statusText.className = 'user-status-text approved';
    dropdownStatus.textContent = isSuperAdmin ? '권한: 최고관리자 (승인됨)' : '권한: 관리자 (승인됨)';

    // Show admin controls
    document.getElementById('tab-admin').classList.remove('hidden');
    document.getElementById('dropdown-btn-admin').classList.remove('hidden');
    document.getElementById('dropdown-btn-request').classList.add('hidden');
    document.getElementById('approval-notice-banner').classList.add('hidden');
    if (switchAdminBtn) switchAdminBtn.classList.add('hidden');
  } else {
    document.getElementById('tab-admin').classList.add('hidden');
    document.getElementById('dropdown-btn-admin').classList.add('hidden');
    if (switchAdminBtn) switchAdminBtn.classList.remove('hidden');

    const roleName = user.role === 'member' ? '회원' : '비회원';
    roleBadge.textContent = roleName;
    roleBadge.className = user.role === 'member' ? 'role-badge member' : 'role-badge guest';

    if (user.role === 'member' && user.status === 'approved') {
      statusText.textContent = '사용 승인됨';
      statusText.className = 'user-status-text approved';
      dropdownStatus.textContent = `등급: 회원 (승인 완료)`;
      document.getElementById('dropdown-btn-request').classList.add('hidden');
      document.getElementById('approval-notice-banner').classList.add('hidden');
    } else if (user.status === 'pending') {
      statusText.textContent = '승인 대기(보류)';
      statusText.className = 'user-status-text pending';
      dropdownStatus.textContent = `등급: ${roleName} (승인 대기/보류)`;
      document.getElementById('dropdown-btn-request').classList.remove('hidden');

      const banner = document.getElementById('approval-notice-banner');
      banner.classList.remove('hidden');
      document.getElementById('notice-banner-title').textContent = '관리자 승인 대기(보류) 중입니다.';
      document.getElementById('notice-banner-desc').textContent = `관리자(${ADMIN_EMAIL})의 확인 후 승인되면 오피스 프로그램을 이용하실 수 있습니다.`;
      document.getElementById('btn-banner-request').textContent = '승인 요청 재작성';
    } else if (user.status === 'rejected') {
      statusText.textContent = '이용 거절됨';
      statusText.className = 'user-status-text rejected';
      dropdownStatus.textContent = `등급: ${roleName} (승인 거절됨)`;
      document.getElementById('dropdown-btn-request').classList.remove('hidden');

      const banner = document.getElementById('approval-notice-banner');
      banner.classList.remove('hidden');
      document.getElementById('notice-banner-title').textContent = '사이트 이용이 거절된 상태입니다.';
      document.getElementById('notice-banner-desc').textContent = '관리자에게 다시 승인 요청을 보내 검토를 요청할 수 있습니다.';
      document.getElementById('btn-banner-request').textContent = '승인 요청 다시 보내기';
    } else {
      // Guest
      statusText.textContent = '비회원 (승인 필요)';
      statusText.className = 'user-status-text rejected';
      dropdownStatus.textContent = '등급: 비회원 (승인 필요)';
      document.getElementById('dropdown-btn-request').classList.remove('hidden');

      const banner = document.getElementById('approval-notice-banner');
      banner.classList.remove('hidden');
      document.getElementById('notice-banner-title').textContent = '사이트 사용 승인이 필요합니다.';
      document.getElementById('notice-banner-desc').textContent = '오피스 도구를 사용하시려면 관리자에게 승인 요청을 보내주세요.';
      document.getElementById('btn-banner-request').textContent = '승인 요청 작성하기';
    }

    const bannerSwitchAdminBtn = document.getElementById('btn-banner-switch-admin');
    if (bannerSwitchAdminBtn) {
      bannerSwitchAdminBtn.classList.remove('hidden');
    }
  }

  switchView('home');
  renderAppCards();
}

function setUnauthenticated() {
  state.currentUser = null;
  Storage.setCurrentUser(null);

  document.getElementById('auth-guest').classList.remove('hidden');
  document.getElementById('auth-logged-in').classList.add('hidden');
  document.getElementById('tab-admin').classList.add('hidden');
  document.getElementById('approval-notice-banner').classList.add('hidden');

  switchView('home');
  renderAppCards();
}

async function performLogout() {
  try {
    await apiCall('/api/auth/logout', 'POST');
  } catch (e) {}
  setUnauthenticated();
  showToast('로그아웃 되었습니다.', 'info');
}

// ============================================================================
// Render Tool Cards
// ============================================================================
function renderAppCards() {
  const container = document.getElementById('tools-cards-container');
  if (!container) return;
  container.innerHTML = '';

  state.apps.forEach(app => {
    const isLocked = !canAccessTools(state.currentUser);

    const card = document.createElement('div');
    card.className = 'app-card';

    const iconSvg = APP_ICONS[app.icon] || APP_ICONS['file-text'];

    card.innerHTML = `
      <div class="card-top">
        <div class="card-icon-box">
          ${iconSvg}
        </div>
        <span class="card-badge">${app.badge || 'PRO'}</span>
      </div>
      <div class="card-category">${app.category}</div>
      <h3 class="card-name">${app.name}</h3>
      <p class="card-desc">${app.desc}</p>
      <div class="card-footer">
        <div class="card-action-btn">
          <span>도구 실행하기</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
        ${!state.currentUser ? `
          <div class="card-lock-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>구글 로그인 필요</span>
          </div>
        ` : (isLocked ? `
          <div class="card-lock-badge" style="background:#fee2e2; color:#b91c1c; border-color:#fca5a5;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>승인 필요 (${state.currentUser.role === 'guest' ? '비회원' : (state.currentUser.status === 'pending' ? '보류중' : '거절됨')})</span>
          </div>
        ` : '')}
      </div>
    `;

    card.addEventListener('click', () => handleAppClick(app));
    container.appendChild(card);
  });
}

// ============================================================================
// Tool Launch & Permission Check
// ============================================================================
async function handleAppClick(app) {
  // If not logged in -> open login modal
  if (!state.currentUser) {
    redirectToGoogleLogin();
    return;
  }

  // If logged in but not authorized -> open approval request form
  if (!canAccessTools(state.currentUser)) {
    if (state.currentUser.role === 'guest') {
      showToast('비회원 계정입니다. 사이트 사용 승인을 요청해주세요.', 'warning');
    } else if (state.currentUser.status === 'pending') {
      showToast('관리자 승인 대기(보류) 중입니다.', 'warning');
    } else if (state.currentUser.status === 'rejected') {
      showToast('이용이 거절된 상태입니다. 승인 요청을 다시 제출하세요.', 'error');
    } else {
      showToast('사이트 사용 승인이 필요한 계정입니다.', 'warning');
    }
    showApprovalModal();
    return;
  }

  await launchApp(app);
}

async function launchApp(app) {
  state.currentApp = app;

  try {
    await apiCall('/api/track_usage', 'POST', { app_id: app.id });
  } catch (err) {
    console.warn("Usage tracking error:", err);
  }

  // Relative path navigation for GitHub Pages (./[folder]/index.html)
  const targetUrl = './' + encodeURIComponent(app.folder) + '/index.html';
  window.location.href = targetUrl;
}

// ============================================================================
// View Switcher (home | admin | viewer)
// ============================================================================
function switchView(viewName) {
  state.currentView = viewName;

  document.getElementById('view-home').classList.add('hidden');
  document.getElementById('view-admin').classList.add('hidden');
  document.getElementById('view-viewer').classList.add('hidden');

  document.getElementById('tab-home').classList.remove('active');
  document.getElementById('tab-admin').classList.remove('active');

  if (viewName === 'home') {
    document.getElementById('view-home').classList.remove('hidden');
    document.getElementById('tab-home').classList.add('active');
    document.getElementById('tool-iframe').src = 'about:blank';
  } else if (viewName === 'admin') {
    if (!state.currentUser || (state.currentUser.role !== 'admin' && state.currentUser.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase())) {
      showToast('관리자만 접근할 수 있는 페이지입니다.', 'error');
      switchView('home');
      return;
    }
    document.getElementById('view-admin').classList.remove('hidden');
    document.getElementById('tab-admin').classList.add('active');
    loadAdminDashboard();
  } else if (viewName === 'viewer') {
    document.getElementById('view-viewer').classList.remove('hidden');
  }
}

// ============================================================================
// Admin Dashboard Logic
// ============================================================================
async function loadAdminDashboard() {
  try {
    const stats = await apiCall('/api/admin/stats');
    const usersData = await apiCall('/api/admin/users');

    // KPI
    document.getElementById('kpi-total-usage').textContent = (stats.summary.total_logs || 0).toLocaleString();
    document.getElementById('kpi-active-users').textContent = (stats.summary.total_active_users || 0).toLocaleString();
    document.getElementById('kpi-pending-users').textContent = (stats.summary.pending_count || 0).toLocaleString();
    document.getElementById('kpi-approved-users').textContent = (stats.summary.approved_count || 0).toLocaleString();

    // Program Stats
    const appStatsTbody = document.getElementById('app-stats-tbody');
    appStatsTbody.innerHTML = '';

    stats.app_stats.forEach(app => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="font-weight: 700; color: var(--text-main);">${app.name}</div>
        </td>
        <td>
          <span style="font-size: 0.8rem; background: var(--bg-secondary); padding: 3px 8px; border-radius: 4px; font-weight: 600;">
            ${app.category}
          </span>
        </td>
        <td>
          <span class="count-pill">${(app.usage_count || 0).toLocaleString()} 회</span>
        </td>
        <td>
          <strong>${(app.unique_users || 0).toLocaleString()} 명</strong>
        </td>
        <td style="font-size: 0.82rem; color: var(--text-muted);">
          ${app.last_used || '-'}
        </td>
        <td>
          <button class="btn-table-action btn-view-users" data-app-id="${app.id}" data-app-name="${app.name}">
            <span>이용자 명단</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </td>
      `;

      tr.querySelector('.btn-view-users').addEventListener('click', () => {
        showAppUsersModal(app);
      });

      appStatsTbody.appendChild(tr);
    });

    // Users Management Table
    const usersTbody = document.getElementById('users-tbody');
    usersTbody.innerHTML = '';

    usersData.users.forEach(user => {
      const tr = document.createElement('tr');
      const isSuperAdmin = user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

      // 1. Grade (Role) Column: admin / member / guest
      let roleHtml = '';
      if (isSuperAdmin) {
        roleHtml = `<span class="grade-badge admin">👑 최고 관리자</span>`;
      } else {
        roleHtml = `
          <select class="grade-select" data-email="${user.email}" title="회원 등급 지정">
            <option value="member" ${user.role === 'member' ? 'selected' : ''}>👤 회원</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>👑 관리자</option>
            <option value="guest" ${user.role === 'guest' ? 'selected' : ''}>⚪ 비회원</option>
          </select>
        `;
      }

      // 2. Status Badge Column: approved / rejected / pending
      let statusBadge = '';
      if (user.status === 'approved') {
        statusBadge = '<span class="status-tag approved">승인</span>';
      } else if (user.status === 'rejected') {
        statusBadge = '<span class="status-tag rejected">거절</span>';
      } else {
        statusBadge = '<span class="status-tag pending">보류</span>';
      }

      // 3. Status Action Buttons: 승인 / 거절 / 보류
      let actionButtonsHtml = '';
      if (isSuperAdmin) {
        actionButtonsHtml = `<span style="font-size: 0.75rem; color: var(--text-dim); font-weight: 600;">변경 불가</span>`;
      } else {
        actionButtonsHtml = `
          <div class="table-actions" style="display: flex; gap: 4px;">
            <button class="btn-table-action btn-approve ${user.status === 'approved' ? 'active' : ''}" data-email="${user.email}" title="승인">승인</button>
            <button class="btn-table-action btn-reject ${user.status === 'rejected' ? 'active' : ''}" data-email="${user.email}" title="거절">거절</button>
            <button class="btn-table-action btn-hold ${user.status === 'pending' ? 'active' : ''}" data-email="${user.email}" title="보류">보류</button>
          </div>
        `;
      }

      tr.innerHTML = `
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: #e0e7ff; color: #4f46e5; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.82rem; overflow: hidden;">
              ${user.picture ? `<img src="${user.picture}" style="width:100%; height:100%; object-fit:cover;" />` : (user.name[0] || 'U')}
            </div>
            <div>
              <div style="font-weight: 700; font-size: 0.9rem;">${user.name} ${isSuperAdmin ? '<span style="font-size:0.65rem; background:#4f46e5; color:#fff; padding:2px 6px; border-radius:99px; margin-left:4px;">SUPER ADMIN</span>' : ''}</div>
              <div style="font-size: 0.78rem; color: var(--text-muted);">${user.email}</div>
            </div>
          </div>
        </td>
        <td style="font-size: 0.85rem;">${user.department || '-'}</td>
        <td style="font-size: 0.82rem; max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${user.reason || ''}">
          ${user.reason || '-'}
        </td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">${user.requested_at || user.created_at || '-'}</td>
        <td>${roleHtml}</td>
        <td>${statusBadge}</td>
        <td><strong>${(user.total_usage || 0).toLocaleString()} 회</strong></td>
        <td>${actionButtonsHtml}</td>
      `;

      // Event listener for Grade Change
      const gradeSelect = tr.querySelector('.grade-select');
      if (gradeSelect) {
        gradeSelect.addEventListener('change', async (e) => {
          const newRole = e.target.value;
          const roleLabels = { admin: '관리자', member: '회원', guest: '비회원' };
          try {
            await apiCall('/api/admin/set_role', 'POST', { email: user.email, role: newRole });
            showToast(`${user.name}님의 등급이 '${roleLabels[newRole]}'(으)로 변경되었습니다.`, 'success');
            loadAdminDashboard();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }

      // Event listeners for Status Buttons: Approve / Reject / Hold
      const btnApprove = tr.querySelector('.btn-approve');
      if (btnApprove) {
        btnApprove.addEventListener('click', async () => {
          try {
            await apiCall('/api/admin/approve', 'POST', { email: user.email });
            showToast(`${user.name} 계정이 승인되었습니다. (등급: 회원)`, 'success');
            loadAdminDashboard();
          } catch (e) {
            showToast(e.message, 'error');
          }
        });
      }

      const btnReject = tr.querySelector('.btn-reject');
      if (btnReject) {
        btnReject.addEventListener('click', async () => {
          if (!confirm(`${user.name}(${user.email}) 계정을 '거절' 상태로 변경하시겠습니까?`)) return;
          try {
            await apiCall('/api/admin/reject', 'POST', { email: user.email });
            showToast(`${user.name} 계정이 거절 처리되었습니다.`, 'info');
            loadAdminDashboard();
          } catch (e) {
            showToast(e.message, 'error');
          }
        });
      }

      const btnHold = tr.querySelector('.btn-hold');
      if (btnHold) {
        btnHold.addEventListener('click', async () => {
          try {
            await apiCall('/api/admin/hold', 'POST', { email: user.email });
            showToast(`${user.name} 계정이 '보류' 상태로 변경되었습니다.`, 'warning');
            loadAdminDashboard();
          } catch (e) {
            showToast(e.message, 'error');
          }
        });
      }

      usersTbody.appendChild(tr);
    });

    // Recent Activity Logs
    const logsTbody = document.getElementById('activity-logs-tbody');
    logsTbody.innerHTML = '';

    stats.recent_logs.forEach(log => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: monospace; font-size: 0.78rem; color: var(--text-dim);">#${log.id}</td>
        <td style="font-size: 0.82rem; color: var(--text-muted);">${log.timestamp}</td>
        <td style="font-weight: 600;">${log.user_name}</td>
        <td style="font-size: 0.82rem; color: var(--text-muted);">${log.user_email}</td>
        <td>
          <span style="font-size: 0.8rem; font-weight: 700; color: #4f46e5; background: #eef2ff; padding: 3px 8px; border-radius: 4px;">
            ${log.app_name}
          </span>
        </td>
      `;
      logsTbody.appendChild(tr);
    });

    // Update Cloud DB status badge & input
    updateCloudSyncUI();

  } catch (err) {
    console.error("Admin dashboard load error:", err);
    showToast('관리자 데이터 조회 중 오류가 발생했습니다.', 'error');
  }
}

// ============================================================================
// Cloud DB UI Controller (Google Sheets Sync Status)
// ============================================================================
async function updateCloudSyncUI() {
  const badge = document.getElementById('cloud-sync-badge');
  const inputUrl = document.getElementById('input-gas-url');
  if (!badge) return;

  const currentUrl = CloudSync.getUrl();
  if (inputUrl && !inputUrl.value) {
    inputUrl.value = currentUrl;
  }

  if (!CloudSync.isConfigured()) {
    badge.textContent = '⚠️ 로컬 모드 (연동 필요)';
    badge.className = 'status-tag pending';
    return;
  }

  badge.textContent = '🔄 연결 확인 중...';
  badge.className = 'status-tag pending';

  const pingResult = await CloudSync.ping();
  if (pingResult.success) {
    badge.textContent = '✅ 클라우드 DB 연동 정상 (Google Sheets)';
    badge.className = 'status-tag approved';
  } else if (pingResult.isAuthRedirect) {
    badge.textContent = '⚠️ 배포 권한 확인 필요 (모든 사용자)';
    badge.className = 'status-tag rejected';
  } else {
    badge.textContent = '⚠️ 클라우드 연결 지연 (로컬 캐시 동작)';
    badge.className = 'status-tag pending';
  }
}

function showAppUsersModal(app) {
  document.getElementById('app-modal-title').textContent = `${app.name} 이용자 현황`;
  document.getElementById('app-modal-desc').textContent = `최근 사용된 사용자 명단과 사용 횟수 통계입니다.`;

  const tbody = document.getElementById('app-users-tbody');
  tbody.innerHTML = '';

  if (!app.top_users || app.top_users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">아직 해당 프로그램을 이용한 기록이 없습니다.</td></tr>`;
  } else {
    app.top_users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 700;">${u.user_name}</td>
        <td style="font-size: 0.85rem; color: var(--text-muted);">${u.user_email}</td>
        <td><span class="count-pill">${u.cnt} 회</span></td>
        <td style="font-size: 0.82rem; color: var(--text-muted);">${u.last_time || '-'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('modal-app-users').classList.remove('hidden');
}

// ============================================================================
// Modal & Dialog Management
// ============================================================================
function showApprovalModal() {
  if (!state.currentUser) {
    openLoginModal();
    return;
  }
  document.getElementById('req-email').value = state.currentUser.email;
  document.getElementById('req-dept').value = state.currentUser.department || '';
  document.getElementById('req-reason').value = state.currentUser.reason || '';
  document.getElementById('modal-approval-request').classList.remove('hidden');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

// ============================================================================
// Event Listeners
// ============================================================================
function initEventListeners() {
  // Brand Home Button (Relative navigation)
  document.getElementById('btn-brand-home').addEventListener('click', (e) => {
    e.preventDefault();
    switchView('home');
  });

  // Navigation Tabs
  document.getElementById('tab-home').addEventListener('click', () => switchView('home'));
  document.getElementById('tab-admin').addEventListener('click', () => switchView('admin'));

  // Google Login Button in Navbar
  document.getElementById('btn-google-login').addEventListener('click', () => {
    openLoginModal();
  });

  // Admin-Only Quick Test & Account Switcher Buttons (Inside Admin Dashboard)
  const btnQuickAdmin = document.getElementById('btn-quick-admin');
  if (btnQuickAdmin) {
    btnQuickAdmin.addEventListener('click', () => {
      loginUserDirect(ADMIN_EMAIL, '김보성 (최고 관리자)');
      showToast('최고 관리자(bosung3116@gmail.com) 계정으로 전환되었습니다.', 'success');
      switchView('admin');
    });
  }

  const btnQuickUser = document.getElementById('btn-quick-user');
  if (btnQuickUser) {
    btnQuickUser.addEventListener('click', () => {
      loginUserDirect('test.user@bsoffice.local', '테스트 사용자');
      showToast('일반 계정으로 전환되었습니다. (승인 요청 및 비회원 제한 테스트 가능)', 'info');
    });
  }

  // Switch back to Admin from Profile Dropdown (when simulating non-admin)
  const btnSwitchAdmin = document.getElementById('dropdown-btn-switch-admin');
  if (btnSwitchAdmin) {
    btnSwitchAdmin.addEventListener('click', () => {
      loginUserDirect(ADMIN_EMAIL, '김보성 (최고 관리자)');
      showToast('최고 관리자(bosung3116@gmail.com) 계정으로 복귀했습니다.', 'success');
    });
  }

  // Switch back to Admin from Approval Notice Banner
  const btnBannerSwitchAdmin = document.getElementById('btn-banner-switch-admin');
  if (btnBannerSwitchAdmin) {
    btnBannerSwitchAdmin.addEventListener('click', () => {
      loginUserDirect(ADMIN_EMAIL, '김보성 (최고 관리자)');
      showToast('최고 관리자(bosung3116@gmail.com) 계정으로 복귀했습니다.', 'success');
    });
  }

  // Profile Chip Toggle Dropdown
  const userChipBtn = document.getElementById('user-chip-btn');
  const dropdown = document.getElementById('profile-dropdown');

  userChipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
    userChipBtn.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !userChipBtn.contains(e.target)) {
      dropdown.classList.add('hidden');
      userChipBtn.classList.remove('open');
    }
  });

  // Dropdown Items
  document.getElementById('dropdown-btn-admin').addEventListener('click', () => {
    dropdown.classList.add('hidden');
    switchView('admin');
  });

  document.getElementById('dropdown-btn-request').addEventListener('click', () => {
    dropdown.classList.add('hidden');
    showApprovalModal();
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    dropdown.classList.add('hidden');
    performLogout();
  });

  // Notice Banner Request Button
  document.getElementById('btn-banner-request').addEventListener('click', showApprovalModal);

  // Embedded Viewer Topbar Buttons
  document.getElementById('btn-viewer-back').addEventListener('click', () => switchView('home'));
  document.getElementById('btn-viewer-reload').addEventListener('click', () => {
    const iframe = document.getElementById('tool-iframe');
    if (iframe.src) iframe.src = iframe.src;
  });
  document.getElementById('btn-viewer-newtab').addEventListener('click', () => {
    if (state.currentApp) {
      window.open(state.currentApp.entry, '_blank');
    }
  });

  // Admin Refresh Button
  document.getElementById('btn-refresh-admin').addEventListener('click', async () => {
    showToast('최신 클라우드 및 사용자 데이터를 동기화 중입니다...', 'info');
    await loadAdminDashboard();
    showToast('대시보드가 새로고침되었습니다.', 'success');
  });

  // Cloud Sync Panel Toggle Header & Button
  const toggleHeader = document.getElementById('toggle-cloud-sync-header');
  const toggleBtn = document.getElementById('btn-toggle-cloud-panel');
  const cloudPanel = document.getElementById('cloud-sync-panel');

  const togglePanelAction = () => {
    if (cloudPanel) {
      cloudPanel.classList.toggle('hidden');
      if (toggleBtn) {
        toggleBtn.textContent = cloudPanel.classList.contains('hidden') ? '설정 / 가이드 보기' : '패널 닫기';
      }
    }
  };

  if (toggleHeader) {
    toggleHeader.addEventListener('click', (e) => {
      if (e.target.closest('#btn-toggle-cloud-panel')) return;
      togglePanelAction();
    });
  }
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanelAction();
    });
  }

  // Cloud Sync: Save Apps Script URL
  const btnSaveGas = document.getElementById('btn-save-gas-url');
  if (btnSaveGas) {
    btnSaveGas.addEventListener('click', async () => {
      const input = document.getElementById('input-gas-url');
      const val = input ? input.value.trim() : '';
      if (!val) {
        CloudSync.setUrl('');
        showToast('클라우드 연동 URL이 해제되었습니다. (로컬 모드로 전환)', 'info');
      } else if (!val.startsWith('https://script.google.com/macros/s/')) {
        showToast('올바른 Google Apps Script Web App URL 형식(https://script.google.com/macros/s/.../exec)을 입력해주세요.', 'warning');
        return;
      } else {
        CloudSync.setUrl(val);
        showToast('Apps Script URL이 저장되었습니다. 연결 상태를 확인합니다...', 'info');
      }
      await updateCloudSyncUI();
      await loadAdminDashboard();
    });
  }

  // Cloud Sync: Connection Test (Ping)
  const btnTestGas = document.getElementById('btn-test-gas-url');
  if (btnTestGas) {
    btnTestGas.addEventListener('click', async () => {
      btnTestGas.disabled = true;
      btnTestGas.textContent = '테스트 중...';
      const res = await CloudSync.ping();
      btnTestGas.disabled = false;
      btnTestGas.textContent = '연결 테스트';

      if (res.success) {
        showToast('🎉 Google Sheets 클라우드 DB 연결 성공! 실시간 연동이 정상 작동합니다.', 'success');
      } else if (res.isAuthRedirect) {
        alert("⚠️ Google 계정 로그인 리디렉션 감지!\n\n현재 Apps Script 배포의 '액세스할 수 있는 사용자'가 '나만(Only myself)'으로 되어 있어 외부 사용자의 승인 요청을 수신할 수 없습니다.\n\n[해결 방법]\n1. Apps Script 편집기 우측 상단 [배포] ➔ [배포 관리] ➔ [수정(연필 아이콘)]\n2. '액세스할 수 있는 사용자(Who has access)'를 반드시 '모든 사용자(Anyone)'로 변경\n3. [배포] 버튼 클릭 후 다시 테스트해주세요.");
        showToast('Apps Script 배포 액세스 권한을 "모든 사용자"로 변경해주세요.', 'warning');
      } else {
        showToast(`연결 실패: ${res.message}`, 'error');
      }
      await updateCloudSyncUI();
    });
  }

  // Cloud Sync: Copy Apps Script Code to Clipboard
  const btnCopyGas = document.getElementById('btn-copy-gas-code');
  if (btnCopyGas) {
    btnCopyGas.addEventListener('click', async () => {
      try {
        const res = await fetch('./BOS_S_Office_Backend_Code.gs');
        if (!res.ok) throw new Error('Fetch failed');
        const codeToCopy = await res.text();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(codeToCopy);
        } else {
          fallbackCopyText(codeToCopy);
        }
        showToast('📋 Apps Script 전체 코드가 복사되었습니다! sheets.new 에 붙여넣으세요.', 'success');
      } catch (err) {
        showToast('BOS_S_Office_Backend_Code.gs 파일 내용을 직접 복사해주세요.', 'info');
      }
    });
  }

  // Close Modal Buttons
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close-modal');
      closeModal(modalId);
    });
  });

  // Approval Form Submit
  document.getElementById('form-approval-request').addEventListener('submit', async (e) => {
    e.preventDefault();
    const department = document.getElementById('req-dept').value.trim();
    const reason = document.getElementById('req-reason').value.trim();

    try {
      const res = await apiCall('/api/request_access', 'POST', { department, reason });
      closeModal('modal-approval-request');
      showToast(res.message || '승인 요청이 완료되었습니다.', 'success');
      if (res.user) {
        setAuthenticatedUser(res.user);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ============================================================================
// Toast Notification Utility
// ============================================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'warning') icon = '⚠️';
  if (type === 'error')   icon = '❌';

  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Fallback clipboard copy for browsers or environments without navigator.clipboard
function fallbackCopyText(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(ta);
    if (successful) {
      showToast('📋 Apps Script 전체 코드가 복사되었습니다! sheets.new 에 붙여넣으세요.', 'success');
    } else {
      showToast('복사에 실패했습니다. BOS_S_Office_Backend_Code.gs 파일을 직접 복사해주세요.', 'error');
    }
  } catch (err) {
    showToast('복사에 실패했습니다. BOS_S_Office_Backend_Code.gs 파일을 직접 복사해주세요.', 'error');
  }
}
