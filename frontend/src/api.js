const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function withBase(path) {
  return API_BASE ? `${API_BASE}${path}` : path;
}

function authHeaders() {
  const u = JSON.parse(sessionStorage.getItem('user') || 'null');
  if (!u || !u.token) return {};
  return { 'Authorization': `Bearer ${u.token}` };
}

async function api(path, opts = {}) {
  const { headers: extraHeaders, ...rest } = opts;
  const url = withBase(path);
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...extraHeaders },
    ...rest,
  });
  if (!res.ok) {
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
};

export const adminAPI = {
  createAccount: (username, password, role, full_name) => api('/admin/create-account', {
    method: 'POST', body: JSON.stringify({ username, password, role, full_name }),
  }),
  listAccounts: () => api('/admin/accounts'),
  listVictims: () => api('/admin/victims'),
  stats: () => api('/admin/stats'),
  logs: () => api('/admin/logs'),
  pause: (id) => api(`/admin/victims/${id}/pause`, { method: 'PATCH' }),
  unpause: (id) => api(`/admin/victims/${id}/unpause`, { method: 'PATCH' }),
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
  uploadCollectorPhoto: (id, collectorId, file) => apiUpload(`/victims/${id}/collector/${collectorId}/photo`, file),
  uploadLogo: (id, file, role) => apiUpload(`/victims/${id}/upload-logo`, file, { role }),
};
