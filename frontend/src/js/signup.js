import { authAPI, setUser, getDeviceId, getDeviceInfo } from '/src/api.js';

document.getElementById('signupBtn').addEventListener('click', async () => {
  const fullName = document.getElementById('fullName').value.trim();
  const dob = document.getElementById('dob').value;
  const phone = document.getElementById('phone').value.trim();
  const address = document.getElementById('address').value.trim();
  const citizenship = document.getElementById('citizenship').value.trim();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const confirm = document.getElementById('confirmPassword').value;
  const status = document.getElementById('signupStatus');

  if (!fullName || !dob || !phone || !address || !citizenship || !username || !password) {
    status.textContent = 'Fill in all required fields.';
    return;
  }
  if (password.length < 4) {
    status.textContent = 'Password must be at least 4 characters.';
    return;
  }
  if (password !== confirm) {
    status.textContent = 'Passwords do not match.';
    return;
  }

  status.textContent = 'Creating account...';
  try {
    const res = await authAPI.signup({
      username, password,
      full_name: fullName, dob, phone, address, citizenship,
    });
    const deviceId = getDeviceId();
    setUser({ id: res.id, username: res.username, role: res.role, token: res.access_token, deviceId, deviceInfo: getDeviceInfo(), loginAt: Date.now() });
    window.location.href = 'dashboard.html';
  } catch (err) {
    status.textContent = err.message;
  }
});
