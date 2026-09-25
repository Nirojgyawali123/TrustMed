import { victimsAPI } from '/src/api.js';

async function load() {
  const grid = document.getElementById('caseGrid');
  const params = new URLSearchParams(window.location.search);
  const searchQ = params.get('search');

  try {
    // Use server search when query present (backend filters case_id/name/disease/municipality/hospital)
    const victims = await victimsAPI.getAll(searchQ || undefined);
    let approved = victims.filter(v => v.hospital_verified && v.muni_verified && !v.paused && !v.rejected);

    if (searchQ && approved.length === 0) {
      // Fallback client filter already applied server-side; show empty
      grid.innerHTML = `<div class="card" style="text-align:center;padding:36px 24px;"><p style="font-size:15px;font-weight:600;color:var(--gray-800);margin-bottom:4px;">No results for "${searchQ}"</p><p class="hint"><a href="cases.html">Clear search</a></p></div>`;
      return;
    }

    if (approved.length === 0) {
      grid.innerHTML = '<div class="card" style="text-align:center;padding:36px 24px;"><p style="font-size:15px;font-weight:600;color:var(--gray-800);margin-bottom:4px;">No approved cases yet</p><p class="hint">Check back soon when cases are verified by the hospital and municipality.</p></div>';
      return;
    }

    grid.innerHTML = '<div class="case-grid">' + approved.map(v => {
      const pct = v.total_collected && v.estimated_cost ? Math.min(100, (v.total_collected / v.estimated_cost) * 100) : 0;
      const raised = '₨ ' + Number(v.total_collected || 0).toLocaleString();
      const goal = '₨ ' + Number(v.estimated_cost).toLocaleString();
      const ageTxt = v.age ? ` · ${v.age}y` : '';
      const logoHtml = (v.hospital_logo || v.municipality_logo) ? `<div style="display:flex;gap:4px;align-items:center;margin-top:3px;">${v.hospital_logo ? `<img src="/uploads/${v.hospital_logo}" title="${v.hospital_name}" style="height:14px;object-fit:contain;border:1px solid var(--gray-100);border-radius:3px;padding:1px;background:#fff;">` : ''}${v.municipality_logo ? `<img src="/uploads/${v.municipality_logo}" title="${v.municipality_name}" style="height:14px;object-fit:contain;border:1px solid var(--gray-100);border-radius:3px;padding:1px;background:#fff;">` : ''}</div>` : '';
      const photoAvatar = v.patient_photo
        ? `<img src="/uploads/${v.patient_photo}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;display:block;">`
        : `<div class="case-avatar">${v.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}</div>`;
      return `<div class="case-card" tabindex="0" role="button" aria-label="View case ${v.name}" onclick="window.location.href='case.html?id=${v.id}'" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.location.href='case.html?id=${v.id}'}">
        <div class="case-card-top">
          ${photoAvatar}
          <div class="case-info">
            <div class="case-name">${v.name}${ageTxt ? `<span style="font-weight:400;color:var(--gray-400);font-size:12px;margin-left:4px;">${ageTxt}</span>` : ''}</div>
            <div class="case-meta">${v.municipality_name} · ${v.case_id || '#'+v.id}</div>
            ${logoHtml}
          </div>
        </div>
        <div class="case-desc">${v.disease}</div>
        <div class="case-stats">
          <div class="case-progress"><div class="case-progress-fill" style="width:${pct}%"></div></div>
          <div class="case-numbers">
            <span class="case-raised">${raised}</span>
            <span class="case-goal">${pct.toFixed(0)}% of ${goal}</span>
          </div>
        </div>
        <div class="case-footer">
          <span class="case-badge green">Hospital verified</span>
          <span class="case-badge blue">Municipality approved</span>
        </div>
      </div>`;
    }).join('') + '</div>';
  } catch (err) {
    grid.innerHTML = '<div class="empty-state">Could not load cases. Make sure the backend is running.</div>';
  }
}

load();
