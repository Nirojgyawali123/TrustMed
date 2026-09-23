import { authAPI, setUser, getDeviceId, getDeviceInfo } from '/src/api.js';

const ROUTES = {
  admin: '../pages/god.html',
  hospital: '../pages/hospital.html',
  municipality: '../pages/municipality.html',
  patient: '../pages/dashboard.html',
};

document.getElementById('loginBtn').addEventListener('click', async () => {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const status = document.getElementById('loginStatus');

  if (!username || !password) {
    status.textContent = 'Enter your username and password.';
    return;
  }

  status.textContent = 'Signing in...';
  try {
    const res = await authAPI.login(username, password);
    const deviceId = getDeviceId();
    const deviceInfo = getDeviceInfo();
    setUser({ id: res.id, username: res.username, role: res.role, token: res.access_token, deviceId, deviceInfo, loginAt: Date.now() });
    const dest = ROUTES[res.role];
    if (dest) window.location.href = dest;
    else status.textContent = 'Unknown role.';
  } catch (err) {
    status.textContent = err.message;
  }
});

document.getElementById('username').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginBtn').click(); });
document.getElementById('password').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginBtn').click(); });
