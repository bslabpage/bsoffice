/**
 * BSoffice - Modern Integrated Web Application Portal
 * GitHub Pages Static Web Compatible & Zero Server Dependency
 * Real Google OAuth 2.0 (GIS Client SDK) & Client-side Storage Engine
 */

const GOOGLE_CLIENT_ID = '659290198207-jo65ar0u3439lp5mf1rbkpmrvqhujmcl.apps.googleusercontent.com';
const ADMIN_EMAIL = 'bosung3116@gmail.com';

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
    try {
      const data = localStorage.getItem('bsoffice_users');
      if (data) return JSON.parse(data);
    } catch (e) {}
    
    // Seed default admin
    const defaultUsers = [
      {
        email: ADMIN_EMAIL,
        name: "관리자 (김보성)",
        picture: "",
        role: "admin",
        status: "approved",
        department: "총괄관리",
        reason: "시스템 관리자",
        approved_at: "2026-11-01 00:00:00",
        created_at: "2026-11-01 00:00:00"
      }
    ];
    localStorage.setItem('bsoffice_users', JSON.stringify(defaultUsers));
    return defaultUsers;
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
  const isAdmin = (email === ADMIN_EMAIL.toLowerCase());

  const users = Storage.getUsers();
  let user = users.find(u => u.email.toLowerCase() === email);

  if (!user) {
    user = {
      email,
      name,
      picture,
      role: isAdmin ? 'admin' : 'user',
      status: isAdmin ? 'approved' : 'pending',
      department: '',
      reason: '',
      requested_at: '',
      approved_at: isAdmin ? new Date().toLocaleString('ko-KR') : '',
      created_at: new Date().toLocaleString('ko-KR')
    };
    users.push(user);
  } else {
    if (isAdmin) {
      user.role = 'admin';
      user.status = 'approved';
    }
    if (picture) user.picture = picture;
    if (name) user.name = name;
  }

  Storage.saveUsers(users);
  Storage.setCurrentUser(user);
  setAuthenticatedUser(user);
}

// ============================================================================
// API Helpers (Pure Client-side Static Simulation for GitHub Pages)
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

  // Pure Client-side Static Simulation
  return handleStaticApi(endpoint, method, body);
}

function handleStaticApi(endpoint, method, body) {
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

  // 6. Admin users
  if (normEndpoint === '/api/admin/users') {
    const users = Storage.getUsers();
    const logs = Storage.getLogs();
    const withUsage = users.map(u => ({
      ...u,
      total_usage: logs.filter(l => l.user_email === u.email).length
    }));
    return { users: withUsage };
  }

  // 7. Admin approve
  if (normEndpoint === '/api/admin/approve') {
    const users = Storage.getUsers();
    const target = users.find(u => u.email.toLowerCase() === body.email.toLowerCase());
    if (target) {
      target.status = 'approved';
      target.approved_at = new Date().toLocaleString('ko-KR');
      Storage.saveUsers(users);
    }
    return { success: true, message: `${body.email} 계정이 승인되었습니다.` };
  }

  // 8. Admin reject
  if (normEndpoint === '/api/admin/reject') {
    const users = Storage.getUsers();
    const target = users.find(u => u.email.toLowerCase() === body.email.toLowerCase());
    if (target) {
      target.status = 'rejected';
      Storage.saveUsers(users);
    }
    return { success: true, message: `${body.email} 계정이 거절되었습니다.` };
  }

  // 9. Request access
  if (normEndpoint === '/api/request_access') {
    const curUser = Storage.getCurrentUser();
    if (!curUser) throw new Error('구글 로그인이 필요합니다.');

    const users = Storage.getUsers();
    let target = users.find(u => u.email.toLowerCase() === curUser.email.toLowerCase());
    if (!target) {
      target = { ...curUser, role: 'user', created_at: new Date().toLocaleString('ko-KR') };
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

    return {
      success: true,
      message: `관리자(${ADMIN_EMAIL})에게 사용 승인 요청이 접수되었습니다.`,
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
      setAuthenticatedUser(res.user);
    } else {
      setUnauthenticated();
    }
  } catch (err) {
    setUnauthenticated();
  }
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

  const isAdmin = (user.role === 'admin' || user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());

  if (isAdmin) {
    roleBadge.textContent = '관리자';
    roleBadge.className = 'role-badge admin';
    statusText.textContent = '최고관리자';
    statusText.className = 'user-status-text approved';
    dropdownStatus.textContent = '권한: 최고관리자 (승인됨)';

    // Show admin controls
    document.getElementById('tab-admin').classList.remove('hidden');
    document.getElementById('dropdown-btn-admin').classList.remove('hidden');
    document.getElementById('dropdown-btn-request').classList.add('hidden');
    document.getElementById('approval-notice-banner').classList.add('hidden');
  } else {
    roleBadge.textContent = '회원';
    roleBadge.className = 'role-badge user';

    document.getElementById('tab-admin').classList.add('hidden');
    document.getElementById('dropdown-btn-admin').classList.add('hidden');

    if (user.status === 'approved') {
      statusText.textContent = '사용 승인됨';
      statusText.className = 'user-status-text approved';
      dropdownStatus.textContent = '승인 상태: 승인 완료';
      document.getElementById('dropdown-btn-request').classList.add('hidden');
      document.getElementById('approval-notice-banner').classList.add('hidden');
    } else if (user.status === 'pending') {
      statusText.textContent = '승인 대기중';
      statusText.className = 'user-status-text pending';
      dropdownStatus.textContent = '승인 상태: 관리자 승인 대기';
      document.getElementById('dropdown-btn-request').classList.remove('hidden');

      const banner = document.getElementById('approval-notice-banner');
      banner.classList.remove('hidden');
      document.getElementById('notice-banner-title').textContent = '관리자 승인 대기 중입니다.';
      document.getElementById('notice-banner-desc').textContent = `관리자(${ADMIN_EMAIL})의 확인 후 승인되면 오피스 프로그램을 이용하실 수 있습니다.`;
      document.getElementById('btn-banner-request').textContent = '승인 요청 재작성';
    } else {
      statusText.textContent = '승인 필요';
      statusText.className = 'user-status-text rejected';
      dropdownStatus.textContent = '승인 상태: 미승인';
      document.getElementById('dropdown-btn-request').classList.remove('hidden');

      const banner = document.getElementById('approval-notice-banner');
      banner.classList.remove('hidden');
      document.getElementById('notice-banner-title').textContent = '사이트 사용 승인이 필요합니다.';
      document.getElementById('notice-banner-desc').textContent = '오피스 도구를 사용하시려면 관리자에게 승인 요청을 보내주세요.';
      document.getElementById('btn-banner-request').textContent = '승인 요청 작성하기';
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
    const isLocked = !state.currentUser || (state.currentUser.role !== 'admin' && state.currentUser.status !== 'approved');

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
        ${isLocked ? `
          <div class="card-lock-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>구글 로그인 필요</span>
          </div>
        ` : ''}
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

  // If logged in but not yet approved -> open approval request form
  if (state.currentUser.role !== 'admin' && state.currentUser.status !== 'approved') {
    showToast('사이트 사용 승인이 필요한 계정입니다.', 'warning');
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
      const isSelf = user.email.toLowerCase() === state.currentUser?.email?.toLowerCase();
      const isAdminAccount = user.role === 'admin' || user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

      let statusBadge = '';
      if (user.status === 'approved') {
        statusBadge = '<span class="status-badge approved">승인 완료</span>';
      } else if (user.status === 'pending') {
        statusBadge = '<span class="status-badge pending">승인 대기중</span>';
      } else {
        statusBadge = '<span class="status-badge rejected">거절 / 회수됨</span>';
      }

      tr.innerHTML = `
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: #e0e7ff; color: #4f46e5; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.82rem; overflow: hidden;">
              ${user.picture ? `<img src="${user.picture}" style="width:100%; height:100%; object-fit:cover;" />` : (user.name[0] || 'U')}
            </div>
            <div>
              <div style="font-weight: 700; font-size: 0.9rem;">${user.name} ${isAdminAccount ? '<span style="font-size:0.65rem; background:#4f46e5; color:#fff; padding:2px 6px; border-radius:99px; margin-left:4px;">ADMIN</span>' : ''}</div>
              <div style="font-size: 0.78rem; color: var(--text-muted);">${user.email}</div>
            </div>
          </div>
        </td>
        <td style="font-size: 0.85rem;">${user.department || '-'}</td>
        <td style="font-size: 0.82rem; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${user.reason || ''}">
          ${user.reason || '-'}
        </td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">${user.requested_at || user.created_at || '-'}</td>
        <td>${statusBadge}</td>
        <td><strong>${(user.total_usage || 0).toLocaleString()} 회</strong></td>
        <td>
          <div class="table-actions">
            ${isAdminAccount ? `
              <span style="font-size: 0.75rem; color: var(--text-dim); font-weight: 600;">최고관리자</span>
            ` : `
              ${user.status !== 'approved' ? `
                <button class="btn-action-sm btn-approve" data-email="${user.email}" title="접근 승인">승인</button>
              ` : `
                <button class="btn-action-sm btn-reject" data-email="${user.email}" title="권한 회수">회수</button>
              `}
            `}
          </div>
        </td>
      `;

      const btnApprove = tr.querySelector('.btn-approve');
      if (btnApprove) {
        btnApprove.addEventListener('click', async () => {
          try {
            await apiCall('/api/admin/approve', 'POST', { email: user.email });
            showToast(`${user.email} 계정이 승인되었습니다.`, 'success');
            loadAdminDashboard();
          } catch (e) {
            showToast(e.message, 'error');
          }
        });
      }

      const btnReject = tr.querySelector('.btn-reject');
      if (btnReject) {
        btnReject.addEventListener('click', async () => {
          if (!confirm(`${user.name}(${user.email}) 계정의 사이트 이용 권한을 회수하시겠습니까?`)) return;
          try {
            await apiCall('/api/admin/reject', 'POST', { email: user.email });
            showToast(`${user.email} 계정 권한이 회수되었습니다.`, 'info');
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

  } catch (err) {
    console.error("Admin dashboard load error:", err);
    showToast('관리자 데이터 조회 중 오류가 발생했습니다.', 'error');
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

  // Modal Quick Login Buttons
  const btnQuickAdmin = document.getElementById('btn-quick-admin');
  if (btnQuickAdmin) {
    btnQuickAdmin.addEventListener('click', () => {
      closeModal('modal-login-choice');
      loginUserDirect(ADMIN_EMAIL, '관리자 (김보성)');
      showToast('관리자 계정으로 로그인되었습니다.', 'success');
    });
  }

  const btnQuickUser = document.getElementById('btn-quick-user');
  if (btnQuickUser) {
    btnQuickUser.addEventListener('click', () => {
      closeModal('modal-login-choice');
      loginUserDirect('test.user@gmail.com', '테스트 사용자');
      showToast('일반 테스트 계정으로 로그인되었습니다. (승인 대기 상태)', 'info');
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
  document.getElementById('btn-refresh-admin').addEventListener('click', loadAdminDashboard);

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
