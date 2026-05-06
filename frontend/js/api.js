// frontend/js/api.js — Centralised API layer

const API_BASE = '/api';

async function apiRequest(endpoint, method = 'GET', body = null, requiresAuth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (requiresAuth) {
    const token = localStorage.getItem('bds_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);

  try {
    const res  = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await res.json();
    if (!res.ok) throw { status: res.status, message: data.message || 'Request failed', data };
    return data;
  } catch (err) {
    if (err.message === 'Failed to fetch') {
      throw { message: 'Cannot connect to server. Is the backend running on port 5000?' };
    }
    throw err;
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
const Auth = {
  signup:          (data) => apiRequest('/auth/signup', 'POST', data, false),
  verifyOtp:       (email, otp) => apiRequest('/auth/verify-otp', 'POST', { email, otp }, false),
  resendOtp:       (email) => apiRequest('/auth/resend-otp', 'POST', { email }, false),
  login:           (email, password) => apiRequest('/auth/login', 'POST', { email, password }, false),
  getMe:           () => apiRequest('/auth/me'),
  updateProfile:   (data) => apiRequest('/auth/update-profile', 'PUT', data),
  updateLocation:  (lat, lng) => apiRequest('/auth/update-location', 'PUT', { lat, lng }),
};

// ── Requests ──────────────────────────────────────────────────────────────────
const Requests = {
  create:         (data) => apiRequest('/requests', 'POST', data),
  getAll:         () => apiRequest('/requests'),
  getMyRequests:  () => apiRequest('/requests/my-requests'),
  getDonorRequests: () => apiRequest('/requests/donor-requests'),
  getById:        (id) => apiRequest(`/requests/${id}`),
  updateStatus:   (id, status) => apiRequest(`/requests/${id}/status`, 'PUT', { status }),
  cancel:         (id) => apiRequest(`/requests/${id}`, 'DELETE'),
};

// ── Donors ────────────────────────────────────────────────────────────────────
const Donors = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/donors${qs ? '?' + qs : ''}`);
  },
  setAvailability:  (available) => apiRequest('/donors/availability', 'PUT', { availability: available }),
  acceptRequest:    (requestId) => apiRequest(`/donors/accept/${requestId}`, 'POST'),
  rejectRequest:    (requestId) => apiRequest(`/donors/reject/${requestId}`, 'POST'),
  completeDonation: (donationId) => apiRequest(`/donors/complete/${donationId}`, 'POST'),
  getHistory:       () => apiRequest('/donors/history'),
  checkEligibility: () => apiRequest('/donors/eligibility'),
};

// ── Donations ─────────────────────────────────────────────────────────────────
const Donations = {
  getMyDonations:   () => apiRequest('/donation/my-donations'),
  // FIX: Append token as query param so the browser can open the PDF directly
  // in a new tab without needing a custom Authorization header
  getReceiptUrl: (txnId) => {
    const token = localStorage.getItem('bds_token') || '';
    return `${API_BASE}/donation/receipt/${txnId}?token=${encodeURIComponent(token)}`;
  },
  generateReceipt:  (donationId) => apiRequest('/donation/generate-receipt', 'POST', { donation_id: donationId }),
  getNearbyDonors:  (params) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/donation/nearby-donors?${qs}`);
  },
};

// ── Chatbot ───────────────────────────────────────────────────────────────────
const Chatbot = {
  send: (message) => apiRequest('/chatbot', 'POST', { message }, false),
};

// ── Admin ─────────────────────────────────────────────────────────────────────
const Admin = {
  adminLogin:      (creds) => apiRequest('/admin/login', 'POST', creds),
  getUsers:        () => apiRequest('/admin/users'),
  getRequests:     () => apiRequest('/admin/requests'),
  getAnalytics:    () => apiRequest('/admin/analytics'),
  getDonations:    () => apiRequest('/admin/donations'),
  deleteUser:      (id) => apiRequest(`/admin/users/${id}`, 'DELETE'),
  deleteCompleted: () => apiRequest('/admin/delete-completed', 'DELETE'),
  exportUsers:     () => `${API_BASE}/admin/export-users`,
  exportRequests:  () => `${API_BASE}/admin/export-requests`,
  reportPdfUrl:    () => `${API_BASE}/admin/report-pdf`,
};

// ── Session helpers ───────────────────────────────────────────────────────────
function saveSession(token, user) {
  localStorage.setItem('bds_token', token);
  localStorage.setItem('bds_user',  JSON.stringify(user));
}
function getSession() {
  const token = localStorage.getItem('bds_token');
  const user  = localStorage.getItem('bds_user');
  if (!token || !user) return null;
  return { token, user: JSON.parse(user) };
}
function clearSession() {
  localStorage.removeItem('bds_token');
  localStorage.removeItem('bds_user');
}
function requireAuth(redirectTo = '/login.html') {
  const session = getSession();
  if (!session) { window.location.href = redirectTo; return null; }
  return session;
}

// ── Role helpers (dual-role aware) ───────────────────────────────────────────
function userHasRole(user, role) {
  // support both new roles[] array and legacy role string
  if (Array.isArray(user.roles)) return user.roles.includes(role);
  return user.role === role || user.role === 'both';
}
function getUserRoles(user) {
  if (Array.isArray(user.roles) && user.roles.length > 0) return user.roles;
  if (user.role === 'both') return ['donor', 'receiver'];
  return [user.role || 'donor'];
}

// ── Toast notifications ───────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('bds-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'bds-toast-container';
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
    document.body.appendChild(container);
  }
  const COLORS = { success:'#2e7d32', error:'#c62828', info:'#1565c0', warning:'#e65100' };
  const ICONS  = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const toast  = document.createElement('div');
  toast.style.cssText = `background:${COLORS[type]||COLORS.info};color:white;padding:14px 18px;
    border-radius:10px;font-size:.9rem;max-width:340px;box-shadow:0 4px 20px rgba(0,0,0,.3);
    animation:bdsSlideIn .3s ease;display:flex;align-items:center;gap:10px;line-height:1.4;`;
  toast.innerHTML = `<span style="font-size:18px">${ICONS[type]}</span><span>${message}</span>`;
  if (!document.getElementById('bds-toast-style')) {
    const s = document.createElement('style'); s.id = 'bds-toast-style';
    s.textContent = '@keyframes bdsSlideIn{from{transform:translateX(100%);opacity:0}to{transform:none;opacity:1}}@keyframes bdsSlideOut{from{opacity:1}to{transform:translateX(100%);opacity:0}}';
    document.head.appendChild(s);
  }
  container.appendChild(toast);
  setTimeout(() => { toast.style.animation='bdsSlideOut .3s ease forwards'; setTimeout(()=>toast.remove(),300); }, duration);
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
}
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}
