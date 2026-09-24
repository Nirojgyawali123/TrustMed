const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function withBase(path) {
  return API_BASE ? `${API_BASE}${path}` : path;
}

export const STORAGE_KEY = 'trustmed_user';
export const DEVICE_KEY = 'trustmed_device';

export function getUser() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = sessionStorage.getItem('user') || sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        localStorage.setItem(STORAGE_KEY, raw);
        sessionStorage.removeItem('user');
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function setUser(u) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
  try { sessionStorage.removeItem('user'); sessionStorage.removeItem(STORAGE_KEY); } catch {}
}
export function clearUser() {
  localStorage.removeItem(STORAGE_KEY);
  try { sessionStorage.removeItem('user'); sessionStorage.removeItem(STORAGE_KEY); } catch {}
}
export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch { return null; }
}
export function getDeviceInfo() {
  try {
    return {
      ua: navigator.userAgent,
      platform: navigator.platform || '',
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      screen: `${screen.width}x${screen.height}`,
    };
  } catch { return {}; }
}

export function authHeaders() {
  const u = getUser();
  if (!u || !u.token) return {};
  return { 'Authorization': `Bearer ${u.token}` };
}
export function getCitizenshipAuthFetchUrl(id) {
  // Returns URL that requires Authorization header - caller must fetch with authHeaders()
  return withBase(`/victims/${id}/citizenship-doc`);
}

async function api(path, opts = {}) {
  const { headers: extraHeaders, ...rest } = opts;
  const url = withBase(path);
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...extraHeaders },
    ...rest,
  });
  if (!res.ok) {
    if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/signup')) {
      clearUser();
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiUpload(path, file, extraHeaders = {}) {
  const formData = new FormData();
  formData.append('file', file);
  const url = withBase(path);
  const res = await fetch(url, { method: 'POST', body: formData, headers: { ...authHeaders(), ...extraHeaders } });
  if (!res.ok) {
    if (res.status === 401) clearUser();
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export const authAPI = {
  login: (username, password) => api('/auth/login', {
    method: 'POST', body: JSON.stringify({ username, password }),
  }),
  signup: (data) => api('/auth/signup', {
    method: 'POST', body: JSON.stringify(data),
  }),
  me: () => api('/auth/me'),
  forgotRequest: (data) => api('/auth/forgot/request', {
    method: 'POST', body: JSON.stringify(data),
  }),
  forgotVerify: (email, otp) => api('/auth/forgot/verify', {
    method: 'POST', body: JSON.stringify({ email, otp }),
  }),
  forgotReset: (reset_token, new_password) => api('/auth/forgot/reset', {
    method: 'POST', body: JSON.stringify({ reset_token, new_password }),
  }),
  forgotResetWithOtp: (email, otp, new_password) => api('/auth/forgot/reset-with-otp', {
    method: 'POST', body: JSON.stringify({ email, otp, new_password }),
  }),
  requestPasswordChange: (reason) => api('/auth/request-password-change', {
    method: 'POST', body: JSON.stringify({ reason }),
  }),
};

export const adminAPI = {
  createAccount: (username, password, role, full_name, opts = {}) => api('/admin/create-account', {
    method: 'POST', body: JSON.stringify({ username, password, role, full_name, ...opts }),
  }),
  listAccounts: () => api('/admin/accounts'),
  listVictims: () => api('/admin/victims'),
  stats: () => api('/admin/stats'),
  logs: () => api('/admin/logs'),
  pause: (id) => api(`/admin/victims/${id}/pause`, { method: 'PATCH' }),
  unpause: (id) => api(`/admin/victims/${id}/unpause`, { method: 'PATCH' }),
  listUnregisteredHospitals: () => api('/admin/unregistered-hospitals'),
  verifyUnregisteredHospital: (id) => api(`/admin/unregistered-hospitals/${id}/verify`, { method: 'POST' }),
  listHospitals: () => api('/hospitals'),
  listPasswordRequests: () => api('/admin/password-requests'),
  approvePasswordRequest: (id) => api(`/admin/password-requests/${id}/approve`, { method: 'PATCH' }),
  rejectPasswordRequest: (id) => api(`/admin/password-requests/${id}/reject`, { method: 'PATCH' }),
  resetPasswordForRequest: (id, new_password) => api(`/admin/password-requests/${id}/reset-password?new_password=${encodeURIComponent(new_password)}`, { method: 'POST' }),
  listSettings: () => api('/admin/settings'),
  getSetting: (key) => api(`/admin/settings/${key}`),
  updateSetting: (key, value) => api(`/admin/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),
};

export const victimsAPI = {
  getAll: () => api('/victims/'),
  get: (id) => api(`/victims/${id}`),
  getAllAuth: () => api('/victims/all'),
  create: (data) => api('/victims/', { method: 'POST', body: JSON.stringify(data) }),
  verify: (id, role) => api(`/victims/${id}/verify/${role}`, { method: 'PATCH' }),
  reject: (id, reason) => api(`/victims/${id}/reject${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`, { method: 'PATCH' }),
  resubmit: (id) => api(`/victims/${id}/resubmit`, { method: 'PATCH' }),
  uploadReport: (id, file) => apiUpload(`/victims/${id}/reports`, file),
  uploadPatientPhoto: (id, file) => apiUpload(`/victims/${id}/patient-photo`, file),
  uploadBankQr: (id, file) => apiUpload(`/victims/${id}/bank-qr`, file),
  uploadCollectorPhoto: (id, collectorId, file) => apiUpload(`/victims/${id}/collector/${collectorId}/photo`, file),
  uploadLogo: (id, file, role) => apiUpload(`/victims/${id}/upload-logo`, file, { role }),
  uploadCitizenshipDoc: (id, file) => apiUpload(`/victims/${id}/citizenship-doc`, file),
  getCitizenshipMeta: (id) => api(`/victims/${id}/citizenship-meta`),
  getCitizenshipDocUrl: (id) => withBase(`/victims/${id}/citizenship-doc`),
};

export function logout() {
  clearUser();
  try { localStorage.removeItem(DEVICE_KEY); } catch {}
  window.location.href = '/src/pages/login.html';
}
// auto-attach to Sign out links if DOM available
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('a[href*="login.html"]').forEach(a => {
      if (a.textContent.trim().toLowerCase().includes('sign out')) {
        a.addEventListener('click', (e) => { e.preventDefault(); logout(); });
      }
    });
  });
}
