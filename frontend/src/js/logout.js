import { clearUser } from '/src/api.js';
export function handleLogout(e) {
  if (e) e.preventDefault();
  clearUser();
  try { localStorage.removeItem('trustmed_device'); } catch {}
  window.location.href = '/src/pages/login.html';
}
// auto-bind all Sign out links
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('a[href*="login.html"]').forEach(a => {
    if (a.textContent.trim().toLowerCase().includes('sign out')) {
      a.addEventListener('click', handleLogout);
    }
  });
});
