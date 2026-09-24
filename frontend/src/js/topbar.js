import { getUser, logout } from '/src/api.js';

function currentPage() {
  const p = location.pathname;
  if (p.endsWith('/index.html') || p.endsWith('/') || p.includes('/index.html')) return 'home';
  if (p.includes('cases.html')) return 'cases';
  if (p.includes('case.html')) return 'case';
  if (p.includes('dashboard.html')) return 'dashboard';
  if (p.includes('submit.html')) return 'submit';
  if (p.includes('hospital.html')) return 'hospital';
  if (p.includes('municipality.html')) return 'municipality';
  if (p.includes('god.html')) return 'god';
  if (p.includes('login.html')) return 'login';
  if (p.includes('signup.html')) return 'signup';
  return '';
}

function navLink(href, label, active) {
  return `<a href="${href}"${active ? ' aria-current="page" style="background:var(--gray-100);color:var(--gray-900);"' : ''}>${label}</a>`;
}

export function renderTopbar() {
  const el = document.querySelector('.topbar');
  if (!el) return;
  const user = getUser();
  const page = currentPage();
  const role = user?.role || null;

  // Brand — always link to home
  let brandPill = '';
  if (role === 'patient') brandPill = '<span class="pill blue" style="margin-left:8px;">Patient</span>';
  else if (role === 'hospital') brandPill = '<span class="pill green" style="margin-left:8px;">Hospital</span>';
  else if (role === 'municipality') brandPill = '<span class="pill amber" style="margin-left:8px;">Municipality</span>';
  else if (role === 'admin') brandPill = '<span class="pill red" style="margin-left:8px;">Admin</span>';

  const brandHtml = `<a href="/" class="brand" aria-label="TrustMed home" style="text-decoration:none;color:inherit;">
    <span class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2"><path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg></span>
    <span>TrustMed${brandPill}</span>
  </a>`;

  let navHtml = '';
  if (page === 'login' || page === 'signup') {
    navHtml = `${navLink('/','Home',page==='home')} ${navLink('/src/pages/cases.html','Browse Cases',page==='cases')}`;
  } else if (role === 'patient') {
    navHtml = `${navLink('/','Home',page==='home')} ${navLink('/src/pages/cases.html','Browse Cases',page==='cases')} ${navLink('/src/pages/dashboard.html','My cases',page==='dashboard')}`;
  } else if (role === 'hospital') {
    navHtml = `${navLink('/','Home',page==='home')} ${navLink('/src/pages/cases.html','Browse Cases',page==='cases')} ${navLink('/src/pages/hospital.html','Desk',page==='hospital')}`;
  } else if (role === 'municipality') {
    navHtml = `${navLink('/','Home',page==='home')} ${navLink('/src/pages/cases.html','Browse Cases',page==='cases')} ${navLink('/src/pages/municipality.html','Desk',page==='municipality')}`;
  } else if (role === 'admin') {
    navHtml = `${navLink('/','Home',page==='home')} ${navLink('/src/pages/cases.html','Browse Cases',page==='cases')} ${navLink('/src/pages/god.html','Console',page==='god')}`;
  } else {
    navHtml = `${navLink('/','Home',page==='home')} ${navLink('/src/pages/cases.html','Browse Cases',page==='cases')}`;
  }

  let rightHtml = '';
  if (!user) {
    // anon
    if (page === 'login') rightHtml = `<a href="/src/pages/signup.html" class="btn btn-primary btn-sm">Start a Fundraiser</a>`;
    else if (page === 'signup') rightHtml = `<a href="/src/pages/login.html" class="btn btn-outline btn-sm">Sign in</a>`;
    else rightHtml = `<a href="/src/pages/login.html" class="btn btn-outline btn-sm">Sign in</a> <a href="/src/pages/signup.html" class="btn btn-primary btn-sm">Start a Fundraiser</a>`;
  } else {
    if (role === 'patient') {
      rightHtml = `<a href="/src/pages/submit.html" class="btn btn-primary btn-sm">Start a fundraiser</a> <a href="#" class="btn btn-outline btn-sm" data-logout>Sign out</a>`;
    } else if (role === 'hospital' || role === 'municipality' || role === 'admin') {
      rightHtml = `<span class="hint" style="font-size:12.5px;margin-right:4px;">${user.username}</span> <a href="#" class="btn btn-outline btn-sm" data-logout>Sign out</a>`;
    } else {
      rightHtml = `<a href="#" class="btn btn-outline btn-sm" data-logout>Sign out</a>`;
    }
  }

  el.innerHTML = `${brandHtml}<div class="nav">${navHtml}</div><div class="nav-right">${rightHtml}</div>`;

  // bind logout
  el.querySelectorAll('[data-logout]').forEach(a => {
    a.addEventListener('click', (e) => { e.preventDefault(); logout(); });
  });

  // hero CTA conditional — patient goes to submit, others to signup
  const heroPrimary = document.querySelector('.hero-actions a.btn-primary');
  if (heroPrimary) {
    if (role === 'patient') heroPrimary.setAttribute('href', '/src/pages/submit.html');
    else if (role === 'hospital' || role === 'municipality' || role === 'admin') {
      heroPrimary.textContent = 'Go to Dashboard';
      heroPrimary.setAttribute('href', role === 'hospital' ? '/src/pages/hospital.html' : role === 'municipality' ? '/src/pages/municipality.html' : '/src/pages/god.html');
    }
  }

  // search Enter handling (home)
  const searchInput = document.getElementById('searchInput');
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = '1';
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (typeof window.searchCase === 'function') window.searchCase();
        else {
          const q = searchInput.value.trim();
          if (q) window.location.href = '/src/pages/cases.html?search=' + encodeURIComponent(q);
        }
      }
    });
  }
}

// auto-render on import if topbar exists
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderTopbar);
} else {
  renderTopbar();
}
