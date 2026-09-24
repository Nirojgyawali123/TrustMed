import { adminAPI, getUser } from '/src/api.js';

const user = getUser();
if (!user || user.role !== 'admin') {
  document.getElementById('adminPage').innerHTML = '<div class="card" style="padding:40px;text-align:center;max-width:400px;margin:40px auto;"><h2 style="font-size:20px;margin-bottom:8px;">God access only</h2><p class="hint">Sign in with the god account (niroj).</p><a href="login.html" class="btn btn-primary" style="margin-top:16px;display:inline-flex;">Go to login</a></div>';
  setTimeout(()=>{ if(!user) window.location.href='login.html'; else window.location.href = user.role==='patient' ? 'dashboard.html' : user.role==='hospital' ? 'hospital.html' : user.role==='municipality' ? 'municipality.html' : 'index.html'; }, 1200);
  throw new Error('Not god');
}

const _drawerLoaded = new Set();
let _currentSection = 'overview';

function showSection(name){
  _currentSection = name;
  document.querySelectorAll('#adminMain [data-section]').forEach(sec=>{
    sec.hidden = sec.dataset.section !== name;
  });
  document.querySelectorAll('.drawer-nav a').forEach(a=>{
    a.classList.toggle('active', a.dataset.section===name);
  });
  // Close mobile overlay
  document.getElementById('adminDrawer')?.classList.remove('open');
  document.getElementById('drawerOverlay')?.classList.remove('open');
  // Persist hash
  if(location.hash.slice(1)!==name) history.replaceState(null,'','#'+name);
  // Lazy load section data
  if(_drawerLoaded.has(name)) return;
  _drawerLoaded.add(name);
  if(name==='overview') loadStats();
  else if(name==='cases') loadVictims();
  else if(name==='accounts') loadAccounts();
  else if(name==='create') { /* no load needed */ }
  else if(name==='unregistered') loadUnregisteredHospitals();
  else if(name==='email') loadEmailSettings();
  else if(name==='pwd') loadPasswordRequests();
  else if(name==='audit') loadAuditLog();
  // Always keep stats fresh for badges
  if(name!=='overview') loadStats().catch(()=>{});
}

function initDrawer(){
  const drawer = document.getElementById('adminDrawer');
  const overlay = document.getElementById('drawerOverlay');
  const toggle = document.getElementById('adminDrawerToggle');
  const collapseBtn = document.getElementById('drawerCollapseBtn');
  const shell = document.getElementById('adminShell');
  // Restore collapsed state
  try{
    if(localStorage.getItem('trustmed_admin_drawer_collapsed')==='1' && window.innerWidth>768){
      drawer?.classList.add('collapsed');
      collapseBtn.textContent='›';
    }
  }catch{}
  // Nav clicks
  document.querySelectorAll('.drawer-nav a').forEach(a=>{
    a.addEventListener('click', (e)=>{
      e.preventDefault();
      const sec = a.dataset.section;
      if(sec) showSection(sec);
    });
  });
  toggle?.addEventListener('click', ()=>{
    if(window.innerWidth<=768){
      drawer?.classList.toggle('open');
      overlay?.classList.toggle('open');
    }else{
      // desktop collapse toggle
      const isCollapsed = drawer?.classList.toggle('collapsed');
      collapseBtn.textContent = isCollapsed ? '›' : '‹';
      try{ localStorage.setItem('trustmed_admin_drawer_collapsed', isCollapsed?'1':'0'); }catch{}
    }
  });
  collapseBtn?.addEventListener('click', ()=>{
    if(window.innerWidth<=768){
      drawer?.classList.remove('open');
      overlay?.classList.remove('open');
    }else{
      const isCollapsed = drawer?.classList.toggle('collapsed');
      collapseBtn.textContent = isCollapsed ? '›' : '‹';
      try{ localStorage.setItem('trustmed_admin_drawer_collapsed', isCollapsed?'1':'0'); }catch{}
    }
  });
  overlay?.addEventListener('click', ()=>{
    drawer?.classList.remove('open');
    overlay?.classList.remove('open');
  });
  // Hash routing
  window.addEventListener('hashchange', ()=>{
    const h = location.hash.slice(1);
    if(h && document.querySelector(`[data-section="${h}"]`)) showSection(h);
  });
  // Initial section from hash or default
  const initial = location.hash.slice(1) || 'overview';
  if(document.querySelector(`[data-section="${initial}"]`)) showSection(initial);
  else showSection('overview');
  // Search (global + per-section)
  try{ initAdminSearch(); }catch(e){ console.warn('search init', e); }
  // If initial was overview, we already loaded stats; ensure badges update after all loads
  loadStats().then(()=>{ // update drawer badges after stats
    // also trigger loads for badge counts if not yet
    loadUnregisteredHospitals(); loadPasswordRequests(); loadVictims(); loadAccounts();
  }).catch(()=>{});
}

async function loadAll() {
  initDrawer();
  // Eager load stats for overview; other sections lazy via showSection
  await loadStats();
  // Preload badge counts in background without blocking
  Promise.allSettled([loadUnregisteredHospitals(), loadPasswordRequests(), loadVictims(), loadAccounts()]).then(()=>updateDrawerBadges());
}

function updateDrawerBadges(){
  try{
    const casesTxt = document.getElementById('casesCount')?.textContent || '';
    const mCases = casesTxt.match(/\d+/);
    const dc = document.getElementById('drawerCasesCount');
    if(dc){ if(mCases){ dc.textContent=mCases[0]; dc.style.display='inline-flex'; } else dc.style.display='none'; }
    const acc = document.getElementById('statAccounts')?.textContent || '';
    const da = document.getElementById('drawerAccountsCount');
    if(da){ if(acc && acc!=='-' && acc.trim()!==''){ da.textContent=acc.trim(); da.style.display='inline-flex'; } else da.style.display='none'; }
    // Unreg and pwd counts are updated in their loaders, but also reflect here if needed
  }catch{}
}

function debounce(fn, ms=180){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
function norm(s){ return (s||'').toString().toLowerCase(); }

function filterCases(q){
  const wrap = document.getElementById('victimsTableWrap');
  if(!wrap) return;
  const rows = wrap.querySelectorAll('tbody tr');
  if(!rows.length) return;
  const needle = norm(q).trim();
  let visible=0;
  rows.forEach(tr=>{
    const hay = norm(tr.textContent);
    const show = !needle || hay.includes(needle);
    tr.style.display = show ? '' : 'none';
    if(show) visible++;
  });
  const fc = document.getElementById('casesFilteredCount');
  if(fc){
    if(needle && rows.length){ fc.textContent = `${visible}/${rows.length} matches`; fc.style.display='inline'; }
    else fc.style.display='none';
  }
  if(visible===0 && needle){
    if(!wrap.querySelector('.no-search-match')){
      const el=document.createElement('div'); el.className='hint no-search-match'; el.style.padding='12px'; el.textContent='No cases match "'+q+'"';
      wrap.appendChild(el);
    }
  }else{
    wrap.querySelector('.no-search-match')?.remove();
  }
}
function filterAccounts(q){
  const el = document.getElementById('accountsList');
  if(!el) return;
  const needle = norm(q).trim();
  const rows = el.querySelectorAll('tbody tr');
  if(!rows.length){
    // fallback: if accounts rendered as table, hide via text filter on innerHTML? Already rows
    // if no table yet, ignore
    return;
  }
  let viss=0;
  rows.forEach(tr=>{
    const show = !needle || norm(tr.textContent).includes(needle);
    tr.style.display = show ? '' : 'none';
    if(show) viss++;
  });
  el.querySelector('.no-search-match')?.remove();
  if(viss===0 && needle){
    const d=document.createElement('div'); d.className='hint no-search-match'; d.style.padding='8px'; d.textContent='No accounts match "'+q+'"';
    el.appendChild(d);
  }
}
function filterAudit(q){
  const el=document.getElementById('auditLog');
  if(!el) return;
  const needle=norm(q).trim();
  const rows=el.querySelectorAll('div[style*="border-bottom"]');
  if(!rows.length) return;
  let v=0;
  rows.forEach(r=>{
    const show=!needle||norm(r.textContent).includes(needle);
    r.style.display=show?'':'none';
    if(show) v++;
  });
  el.querySelector('.no-search-match')?.remove();
  if(v===0 && needle){
    const d=document.createElement('div'); d.className='hint no-search-match'; d.style.padding='12px'; d.textContent='No audit entries match "'+q+'"';
    el.appendChild(d);
  }
}
function filterUnregistered(q){
  const list=document.getElementById('unregisteredHospList');
  if(!list) return;
  const needle=norm(q).trim();
  const cards=list.children;
  let v=0;
  Array.from(cards).forEach(c=>{
    if(c.classList.contains('no-search-match')) return;
    const show=!needle||norm(c.textContent).includes(needle);
    c.style.display=show?'':'none';
    if(show) v++;
  });
  list.querySelector('.no-search-match')?.remove();
  if(v===0 && needle){
    const d=document.createElement('div'); d.className='hint no-search-match'; d.style.padding='12px'; d.textContent='No hospitals match "'+q+'"';
    list.appendChild(d);
  }
}
function filterPwd(q){
  const list=document.getElementById('pwdRequestsList');
  if(!list) return;
  const needle=norm(q).trim();
  const cards=list.querySelectorAll('div[style*="border:1px solid"]');
  if(!cards.length) return;
  let v=0;
  cards.forEach(c=>{
    const show=!needle||norm(c.textContent).includes(needle);
    c.style.display=show?'':'none';
    if(show) v++;
  });
  list.querySelector('.no-search-match')?.remove();
  if(v===0 && needle){
    const d=document.createElement('div'); d.className='hint no-search-match'; d.style.padding='12px'; d.textContent='No requests match "'+q+'"';
    list.appendChild(d);
  }
}
function initAdminSearch(){
  const global = document.getElementById('adminGlobalSearch');
  const globalClear = document.getElementById('adminGlobalClear');
  const per = {
    cases: document.getElementById('searchCases'),
    accounts: document.getElementById('searchAccounts'),
    audit: document.getElementById('searchAudit'),
    unregistered: document.getElementById('searchUnregistered'),
    pwd: document.getElementById('searchPwd'),
  };
  const handlers = {
    cases: debounce(v=>filterCases(v)),
    accounts: debounce(v=>filterAccounts(v)),
    audit: debounce(v=>filterAudit(v)),
    unregistered: debounce(v=>filterUnregistered(v)),
    pwd: debounce(v=>filterPwd(v)),
  };
  Object.entries(per).forEach(([k, input])=>{
    if(!input) return;
    input.addEventListener('input', ()=>{
      const v=input.value;
      handlers[k](v);
      // sync global if user typed per-section
      if(global && v) { /* keep global as is */ }
    });
    input.addEventListener('keydown', e=>{ if(e.key==='Escape'){ input.value=''; handlers[k](''); if(global){ global.value=''; globalClear.style.display='none'; } }});
  });
  if(global){
    const runGlobal = debounce((val)=>{
      const q=val.trim();
      globalClear.style.display = q? 'inline-flex':'none';
      // push to all per-section inputs and filter
      Object.entries(per).forEach(([k, inp])=>{
        if(inp){ inp.value = q; handlers[k](q); }
      });
      // Also directly filter current visible section if global typed
      // Jump to first section with matches if needed — keep current section
      if(q){
        // find first section that has visible rows after filter — hint via drawer badge? just stay
      }
    }, 180);
    global.addEventListener('input', ()=>runGlobal(global.value));
    global.addEventListener('keydown', e=>{
      if(e.key==='Escape'){ global.value=''; runGlobal(''); globalClear.style.display='none'; }
    });
    globalClear?.addEventListener('click', ()=>{ global.value=''; runGlobal(''); globalClear.style.display='none'; global.focus(); });
  }
}

async function loadStats() {
  try {
    const s = await adminAPI.stats();
    document.getElementById('statTotal').textContent = s.total;
    document.getElementById('statPaused').textContent = s.paused;
    document.getElementById('statRejected').textContent = s.rejected;
    document.getElementById('statPendingHosp').textContent = s.pending_hospital;
    document.getElementById('statPendingMun').textContent = s.pending_municipality;
    document.getElementById('statVerified').textContent = s.verified;
    updateDrawerBadges();
  } catch (err) { console.error('Stats error:', err); }
}

function statusLabel(v) {
  if (v.paused) return { text: 'Paused', cls: 'red' };
  if (v.rejected) return { text: 'Rejected', cls: 'red' };
  if (!v.hospital_verified) return { text: 'Pending hospital', cls: 'gray' };
  if (!v.muni_verified) return { text: 'Pending municipality', cls: 'amber' };
  return { text: 'Verified & live', cls: 'green' };
}

async function loadVictims() {
  const wrap = document.getElementById('victimsTableWrap');
  try {
    const victims = await adminAPI.listVictims();
    document.getElementById('casesCount').textContent = victims.length + ' cases';
    const dcc = document.getElementById('drawerCasesCount');
    if(dcc){ dcc.textContent = String(victims.length); dcc.style.display = victims.length? 'inline-flex':'none'; }
    if (victims.length === 0) { wrap.innerHTML = '<p class="hint" style="padding:16px;">No cases yet.</p>'; updateDrawerBadges(); return; }

    let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr style="border-bottom:2px solid var(--gray-200);">';
    ['Case ID','Name','Hospital','Municipality','Cost','Status','Paused','Action'].forEach(h => {
      html += `<th style="text-align:left;padding:8px 6px;font-weight:600;white-space:nowrap;">${h}</th>`;
    });
    html += '</tr></thead><tbody>';

    victims.forEach(v => {
      const st = statusLabel(v);
      const cost = '₨ ' + Number(v.estimated_cost).toLocaleString();
      html += `<tr style="border-bottom:1px solid var(--gray-100);cursor:pointer;" onclick="showCaseDetail(${v.id})">`;
      html += `<td style="padding:8px 6px;font-size:11px;">${v.case_id || v.id}</td>`;
      html += `<td style="padding:8px 6px;font-weight:600;">${v.name}</td>`;
      html += `<td style="padding:8px 6px;">${v.hospital_name}</td>`;
      html += `<td style="padding:8px 6px;">${v.municipality_name}</td>`;
      html += `<td style="padding:8px 6px;font-size:11px;">${cost}</td>`;
      html += `<td style="padding:8px 6px;"><span class="pill ${st.cls}">${st.text}</span></td>`;
      html += `<td style="padding:8px 6px;text-align:center;">${v.paused ? '🚫' : '-'}</td>`;
      html += `<td style="padding:8px 6px;">
        <button class="btn btn-sm ${v.paused ? 'btn-green' : 'btn-danger'}" style="font-size:10px;padding:3px 8px;" onclick="event.stopPropagation(); togglePause(${v.id}, ${v.paused})">${v.paused ? 'Resume' : 'Pause'}</button>
      </td></tr>`;
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
    // re-apply current search filter after render
    const _q = document.getElementById('searchCases')?.value || document.getElementById('adminGlobalSearch')?.value || '';
    if(_q) filterCases(_q);
  } catch (err) { wrap.innerHTML = `<p class="hint" style="padding:16px;">Error: ${err.message}</p>`; }
}

let pendingUnregId = null;

async function loadUnregisteredHospitals() {
  const card = document.getElementById('unregisteredHospCard');
  const list = document.getElementById('unregisteredHospList');
  const countEl = document.getElementById('unregHospCount');
  if (!card || !list) return;
  try {
    const victims = await adminAPI.listUnregisteredHospitals();
    if (victims.length === 0) {
      card.hidden = true;
      card.style.display = 'none';
      return;
    }
    card.hidden = false;
    card.style.display = 'block';
    if (countEl) { countEl.textContent = victims.length + ' pending'; countEl.style.display = 'inline-flex'; }
    const duc = document.getElementById('drawerUnregCount');
    if(duc){ duc.textContent = String(victims.length); duc.style.display = victims.length? 'inline-flex':'none'; }
    list.innerHTML = victims.map(v => `
      <div style="display:flex;gap:12px;align-items:center;padding:12px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px;background:#fff;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:13.5px;">${v.other_hospital_name} <span class="pill amber" style="margin-left:6px;">Unregistered</span></div>
          <div class="hint" style="font-size:12px;margin-top:2px;">${v.other_hospital_address} · Contact: ${v.other_hospital_contact || '—'}</div>
          <div class="hint" style="font-size:11.5px;margin-top:4px;">Case: ${v.name} (${v.case_id||'#'+v.id}) · ${v.municipality_name} · ${v.disease.slice(0,60)}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button type="button" class="btn btn-sm btn-green" onclick="openUnregHospModal(${v.id})">Verify</button>
        </div>
      </div>
    `).join('');
    const _qu = document.getElementById('searchUnregistered')?.value || document.getElementById('adminGlobalSearch')?.value || '';
    if(_qu) filterUnregistered(_qu);
    // toast notification
    if (victims.length > 0 && !document.getElementById('unregToast')) {
      const toast = document.createElement('div');
      toast.id = 'unregToast';
      toast.style.cssText = 'position:fixed;top:70px;right:20px;background:var(--gray-900);color:#fff;padding:10px 14px;border-radius:8px;font-size:13px;z-index:99;box-shadow:var(--shadow-lg);cursor:pointer;';
      toast.innerHTML = `🔔 ${victims.length} unregistered hospital${victims.length>1?'s':''} pending`;
      toast.onclick = () => { document.getElementById('unregisteredHospCard')?.scrollIntoView({behavior:'smooth'}); toast.remove(); };
      document.body.appendChild(toast);
      setTimeout(()=>toast.remove(), 6000);
    }
  } catch (e) {
    console.warn('unregistered load', e);
    if (card) card.style.display = 'none';
  }
}

window.openUnregHospModal = async function(id) {
  pendingUnregId = id;
  try {
    const victims = await adminAPI.listUnregisteredHospitals();
    const v = victims.find(x=>x.id===id);
    if (!v) return;
    document.getElementById('unregHospModalContent').innerHTML = `
      <div class="detail-panel">
        <div class="kv"><span class="k">Hospital</span><span class="v">${v.other_hospital_name}</span></div>
        <div class="kv"><span class="k">Location</span><span class="v">${v.other_hospital_address}</span></div>
        <div class="kv"><span class="k">Contact</span><span class="v">${v.other_hospital_contact||'—'}</span></div>
        <div class="kv"><span class="k">Patient</span><span class="v">${v.name} (${v.case_id||v.id})</span></div>
        <div class="kv"><span class="k">Diagnosis</span><span class="v">${v.disease}</span></div>
      </div>
      <p class="hint" style="margin-top:10px;">Call the hospital at the contact above, verify patient documents, then click Verify to add hospital to network and mark case as hospital-verified.</p>
    `;
    document.getElementById('unregHospModal').classList.add('open');
  } catch (e) { alert('Error: '+e.message); }
};

window.showCaseDetail = async function(id) {
  try {
    const { victimsAPI, getUser } = await import('/src/api.js');
    const v = await victimsAPI.get(id);
    const modal = document.getElementById('caseModalContent');
    const st = statusLabel(v);
    // Fetch citizenship doc meta for admin (victim/municipality/admin visibility) — admin role can view via auth-gated endpoint
    let citizenshipHtml = '';
    try {
      const meta = await victimsAPI.getCitizenshipMeta(id);
      if (meta && meta.citizenship_doc) {
        const _tok = (getUser()?.token||'');
        const _citUrl = victimsAPI.getCitizenshipDocUrl(id) + (_tok? '?token='+encodeURIComponent(_tok):'');
        const isPdf = meta.citizenship_doc.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          citizenshipHtml = `<div style="margin-top:12px;padding:10px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;">
            <strong style="font-size:13px;">Government ID / Citizenship <span class="pill blue" style="font-size:10px;">restricted</span></strong>
            <p class="hint" style="font-size:11px;margin:4px 0 6px;">Compressed to &lt;200 KB · Private</p>
            <a href="${_citUrl}" target="_blank" class="btn btn-outline btn-sm">View PDF (auth)</a>
          </div>`;
        } else {
          citizenshipHtml = `<div style="margin-top:12px;padding:10px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;">
            <strong style="font-size:13px;">Government ID / Citizenship <span class="pill blue" style="font-size:10px;">restricted</span></strong>
            <p class="hint" style="font-size:11px;margin:4px 0 6px;">Compressed to &lt;200 KB · admin/municipality/owner only</p>
            <img src="${_citUrl}" alt="Citizenship" style="max-width:100%;max-height:240px;object-fit:contain;display:block;margin:0 auto;background:#fff;border:1px solid var(--gray-200);border-radius:6px;">
          </div>`;
        }
      } else {
        citizenshipHtml = `<div style="margin-top:12px;padding:8px;background:var(--warning-light, #fef3c7);border-radius:6px;font-size:11px;">No government ID uploaded for this case.</div>`;
      }
    } catch (e) {
      citizenshipHtml = `<div style="margin-top:12px;" class="hint" style="font-size:11px;">Gov ID not accessible: ${e.message}</div>`;
    }

    const photoHtml = v.patient_photo
      ? `<img src="/uploads/${v.patient_photo}" style="width:64px;height:64px;border-radius:8px;object-fit:cover;">`
      : '';

    let reportsHtml = '';
    if (v.medical_reports && v.medical_reports.length > 0) {
      reportsHtml = v.medical_reports.map(r =>
        `<div style="margin:2px 0;"><a href="/uploads/${r.filename}" target="_blank">${r.original_name}</a></div>`
      ).join('');
    }

    let collectorsHtml = '';
    if (v.collectors && v.collectors.length > 0) {
      collectorsHtml = v.collectors.map(c =>
        `<div style="padding:6px 0;border-bottom:1px solid var(--gray-50);font-size:13px;">
          <strong>${c.name}</strong> (${c.relation_to_victim}) · ${c.contact}
          ${c.citizenship_details ? `<br><span class="hint">Cit: ${c.citizenship_details}</span>` : ''}
        </div>`
      ).join('');
    }

    const created = v.created_at ? new Date(v.created_at).toLocaleDateString() : 'N/A';

    modal.innerHTML = `
      <h3 style="font-size:18px;font-weight:700;margin-bottom:4px;">${v.name}</h3>
      <span class="pill ${st.cls}" style="margin-bottom:12px;">${st.text}</span>
      <div style="display:flex;gap:14px;margin-top:12px;">
        ${photoHtml}
        <div style="flex:1;">
          <div class="detail-panel">
            <div class="kv"><span class="k">Case ID</span><span class="v">${v.case_id || '#'+v.id}</span></div>
            <div class="kv"><span class="k">Created</span><span class="v">${created}</span></div>
            <div class="kv"><span class="k">Phone</span><span class="v">${v.phone}</span></div>
            <div class="kv"><span class="k">Address</span><span class="v">${v.address}</span></div>
            <div class="kv"><span class="k">Municipality</span><span class="v">${v.municipality_name}</span></div>
            <div class="kv"><span class="k">Hospital</span><span class="v">${v.hospital_name}</span></div>
            ${v.other_hospital_name ? `<div class="kv"><span class="k">Other hospital</span><span class="v">${v.other_hospital_name} — ${v.other_hospital_address || ''} ${v.other_hospital_contact ? '· '+v.other_hospital_contact : ''}</span></div>` : ''}
            <div class="kv"><span class="k">Diagnosis</span><span class="v">${v.disease}</span></div>
            <div class="kv"><span class="k">Est. cost</span><span class="v">₨ ${Number(v.estimated_cost).toLocaleString()}</span></div>
            <div class="kv"><span class="k">Collected</span><span class="v">₨ ${Number(v.total_collected || 0).toLocaleString()}</span></div>
            <div class="kv"><span class="k">Bank</span><span class="v">${v.bank_name} - ${v.bank_branch}</span></div>
            <div class="kv"><span class="k">Account holder</span><span class="v">${v.bank_account_holder}</span></div>
            <div class="kv"><span class="k">Account no.</span><span class="v">${v.bank_account_number}</span></div>
            <div class="kv"><span class="k">Hospital verified</span><span class="v">${v.hospital_verified ? '✅' : '❌'}</span></div>
            <div class="kv"><span class="k">Municipality verified</span><span class="v">${v.muni_verified ? '✅' : '❌'}</span></div>
          </div>
          ${v.note_to_donors ? `<div style="margin-top:10px;padding:8px;background:var(--primary-50);border-radius:6px;font-size:13px;"><strong>Note:</strong> ${v.note_to_donors}</div>` : ''}
          ${v.rejection_reason ? `<div style="margin-top:8px;padding:8px;background:var(--danger-light);border-radius:6px;font-size:13px;"><strong>Rejected:</strong> ${v.rejection_reason} (by ${v.rejected_by})</div>` : ''}
          ${reportsHtml ? `<div style="margin-top:12px;"><strong style="font-size:13px;">Medical reports <span class="hint" style="font-weight:400;font-size:11px;">kept clear</span>:</strong><div style="margin-top:4px;">${reportsHtml}</div></div>` : ''}
          ${citizenshipHtml}
          ${collectorsHtml ? `<div style="margin-top:12px;"><strong style="font-size:13px;">Collectors (${v.collectors.length}):</strong><div style="margin-top:4px;">${collectorsHtml}</div></div>` : ''}
        </div>
      </div>
    `;
    document.getElementById('caseModal').classList.add('open');
  } catch (err) {
    alert('Error: ' + err.message);
  }
};

window.togglePause = async function(id, isPaused) {
  const msg = document.getElementById('adminMsg');
  try {
    if (isPaused) {
      await adminAPI.unpause(id);
      msg.textContent = `Case #${id} resumed.`;
    } else {
      await adminAPI.pause(id);
      msg.textContent = `Case #${id} paused.`;
    }
    await loadVictims();
    await loadStats();
  } catch (err) { msg.textContent = err.message; }
};

async function loadAccounts() {
  const el = document.getElementById('accountsList');
  try {
    const accounts = await adminAPI.listAccounts();
    const nonAdmin = accounts.filter(a => a.role !== 'admin');
    document.getElementById('statAccounts').textContent = nonAdmin.length;
    const dac = document.getElementById('drawerAccountsCount');
    if(dac){ dac.textContent = String(nonAdmin.length); dac.style.display = nonAdmin.length? 'inline-flex':'none'; }
    updateDrawerBadges();
    if (nonAdmin.length === 0) { el.innerHTML = '<p class="hint">No accounts.</p>'; return; }

    let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<tr style="border-bottom:1px solid var(--gray-200);"><th style="text-align:left;padding:6px 4px;">ID</th><th style="text-align:left;padding:6px 4px;">Username</th><th style="text-align:left;padding:6px 4px;">Name</th><th style="text-align:left;padding:6px 4px;">Role</th></tr>';
    nonAdmin.forEach(a => {
      const c = a.role === 'hospital' ? 'green' : a.role === 'municipality' ? 'amber' : 'blue';
      html += `<tr style="border-bottom:1px solid var(--gray-50);">
        <td style="padding:6px 4px;font-size:11px;">${a.id}</td>
        <td style="padding:6px 4px;font-weight:600;">${a.username}</td>
        <td style="padding:6px 4px;">${a.full_name || '-'}</td>
        <td style="padding:6px 4px;"><span class="pill ${c}">${a.role}</span></td>
      </tr>`;
    });
    html += '</table>';
    el.innerHTML = html;
    const _qa = document.getElementById('searchAccounts')?.value || document.getElementById('adminGlobalSearch')?.value || '';
    if(_qa) filterAccounts(_qa);
  } catch (err) { el.innerHTML = `<p class="hint">Error: ${err.message}</p>`; }
}

async function loadAuditLog() {
  const el = document.getElementById('auditLog');
  try {
    const logs = await adminAPI.logs();
    if (logs.length === 0) { el.innerHTML = '<p class="hint">No log entries yet.</p>'; return; }
    el.innerHTML = logs.map(l => {
      const time = new Date(l.timestamp).toLocaleString();
      return `<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--gray-50);">
        <span style="color:var(--gray-400);white-space:nowrap;font-size:11px;">${time}</span>
        <span class="pill ${l.actor_role === 'admin' ? 'red' : l.actor_role === 'hospital' ? 'green' : l.actor_role === 'municipality' ? 'amber' : 'blue'}" style="font-size:10px;">${l.actor_role}</span>
        <span style="flex:1;"><strong>${l.actor}</strong> ${l.action.replace(/_/g, ' ')}</span>
        ${l.details ? `<span class="hint" style="font-size:11px;">${l.details}</span>` : ''}
        ${l.victim_id ? `<span style="color:var(--gray-400);font-size:11px;">case #${l.victim_id}</span>` : ''}
      </div>`;
    }).join('');
    const _qaud = document.getElementById('searchAudit')?.value || document.getElementById('adminGlobalSearch')?.value || '';
    if(_qaud) filterAudit(_qaud);
  } catch (err) { el.innerHTML = `<p class="hint">Error: ${err.message}</p>`; }
}

document.getElementById('createHospBtn').addEventListener('click', () => createAccount('hospital'));
document.getElementById('createMunBtn').addEventListener('click', () => createAccount('municipality'));

async function loadEmailSettings(){
  const inp = document.getElementById('smtpFromInput');
  const msg = document.getElementById('smtpMsg');
  if(!inp) return;
  try{
    const row = await adminAPI.getSetting('smtp_from_email');
    inp.value = row.value || '';
  }catch(e){
    // try list
    try{
      const all = await adminAPI.listSettings();
      const found = all.find(x=>x.key==='smtp_from_email');
      if(found) inp.value = found.value||'';
      else inp.placeholder='trustmed66@gmail.com';
    }catch(_){}
  }
  document.getElementById('saveSmtpBtn')?.addEventListener('click', async ()=>{
    const val = inp.value.trim().toLowerCase();
    const m = document.getElementById('smtpMsg');
    if(!val || !val.includes('@')){ m.textContent='Enter valid Gmail.'; m.style.color='var(--danger)'; return;}
    m.textContent='Saving...'; m.style.color='var(--gray-500)';
    try{
      await adminAPI.updateSetting('smtp_from_email', val);
      m.textContent='Saved ✓'; m.style.color='var(--success)';
    }catch(err){ m.textContent=err.message; m.style.color='var(--danger)';}
  });
}

async function loadPasswordRequests(){
  const list = document.getElementById('pwdRequestsList');
  const cnt = document.getElementById('pwdReqCount');
  if(!list) return;
  try{
    const reqs = await adminAPI.listPasswordRequests();
    if(reqs.length===0){ list.innerHTML='<p class="hint">No pending requests.</p>'; if(cnt) cnt.style.display='none'; return; }
    const pending = reqs.filter(r=>r.status==='pending');
    if(cnt){ cnt.textContent = pending.length+' pending'; cnt.style.display = pending.length?'inline-flex':'none'; }
    const dpc = document.getElementById('drawerPwdCount');
    if(dpc){ dpc.textContent = String(pending.length); dpc.style.display = pending.length? 'inline-flex':'none'; }
    list.innerHTML = reqs.map(r=>`
      <div style="border:1px solid var(--gray-200);border-radius:8px;padding:10px;margin-bottom:8px;background:${r.status==='pending'?'#fffbeb':'#fff'};">
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <div><strong style="font-size:13px;">${r.username}</strong> <span class="pill ${r.role==='hospital'?'green':'amber'}" style="font-size:10px;">${r.role}</span> <span class="pill ${r.status==='pending'?'amber':r.status==='approved'?'green':'red'}" style="font-size:10px;">${r.status}</span></div>
          <span class="hint" style="font-size:11px;">${new Date(r.requested_at).toLocaleString()}</span>
        </div>
        ${r.reason? `<div style="margin-top:6px;font-size:12.5px;background:var(--gray-50);padding:6px 8px;border-radius:6px;">${r.reason}</div>`:''}
        ${r.status==='pending'? `
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="btn btn-green btn-sm" onclick="handlePwdApprove(${r.id})">Approve</button>
            <button class="btn btn-danger btn-sm" onclick="handlePwdReject(${r.id})">Reject</button>
          </div>` : r.status==='approved'? `
          <div style="display:flex;gap:6px;margin-top:8px;align-items:center;">
            <input type="text" placeholder="New password" id="pwdNew-${r.id}" style="flex:1;padding:7px 10px;border:1.5px solid var(--gray-200);border-radius:7px;font-size:13px;">
            <button class="btn btn-primary btn-sm" onclick="handlePwdReset(${r.id})">Set password</button>
          </div>
          <div class="hint" id="pwdMsg-${r.id}" style="font-size:11px;margin-top:4px;"></div>
        ` : `<div class="hint" style="font-size:11px;margin-top:6px;">Reviewed by ${r.reviewed_by||'-'}</div>`}
      </div>
     `).join('');
    const _qp = document.getElementById('searchPwd')?.value || document.getElementById('adminGlobalSearch')?.value || '';
    if(_qp) filterPwd(_qp);
  }catch(e){ list.innerHTML=`<p class="hint">Error: ${e.message}</p>`; }
}
window.handlePwdApprove = async function(id){
  try{ await adminAPI.approvePasswordRequest(id); await loadPasswordRequests(); }catch(e){ alert(e.message); }
};
window.handlePwdReject = async function(id){
  const reason = prompt('Reject reason (optional):')||'';
  try{ await adminAPI.rejectPasswordRequest(id); await loadPasswordRequests(); }catch(e){ alert(e.message); }
};
window.handlePwdReset = async function(id){
  const inp = document.getElementById(`pwdNew-${id}`);
  const msg = document.getElementById(`pwdMsg-${id}`);
  const pwd = inp.value.trim();
  if(pwd.length<4){ msg.textContent='Min 4 chars'; msg.style.color='var(--danger)'; return; }
  msg.textContent='Setting...'; msg.style.color='var(--gray-500)';
  try{
    const res = await adminAPI.resetPasswordForRequest(id, pwd);
    msg.textContent=res.detail||'Updated ✓'; msg.style.color='var(--success)';
    inp.value='';
  }catch(e){ msg.textContent=e.message; msg.style.color='var(--danger)'; }
};

document.getElementById('confirmUnregHospBtn')?.addEventListener('click', async () => {
  if (!pendingUnregId) return;
  const btn = document.getElementById('confirmUnregHospBtn');
  btn.disabled = true;
  btn.textContent = 'Verifying...';
  try {
    await adminAPI.verifyUnregisteredHospital(pendingUnregId);
    document.getElementById('unregHospModal').classList.remove('open');
    pendingUnregId = null;
    await loadUnregisteredHospitals();
    await loadVictims();
    await loadAccounts();
    await loadStats();
    document.getElementById('adminMsg').textContent = 'Hospital verified and added to list.';
  } catch (e) { alert('Error: '+e.message); }
  btn.disabled = false;
  btn.textContent = 'Verify & add to list';
});

async function createAccount(role) {
  const prefix = role === 'hospital' ? 'hosp' : 'mun';
  const name = document.getElementById(prefix + 'Name').value.trim();
  const username = document.getElementById(prefix + 'User').value.trim();
  const password = document.getElementById(prefix + 'Pass').value.trim();
  const btnId = 'create' + (role === 'hospital' ? 'Hosp' : 'Mun') + 'Btn';
  const msg = document.getElementById('adminMsg');
  if (!username || !password) { msg.textContent = 'Fill in username and password.'; return; }
  const btn = document.getElementById(btnId);
  btn.disabled = true;
  btn.textContent = 'Creating...';
  try {
    await adminAPI.createAccount(username, password, role, name || undefined);
    btn.textContent = 'Done ✓';
    msg.textContent = `${role} account "${username}" created.`;
    document.getElementById(prefix + 'Name').value = '';
    document.getElementById(prefix + 'User').value = '';
    document.getElementById(prefix + 'Pass').value = '';
    await loadAccounts();
    setTimeout(() => { btn.textContent = 'Create'; btn.disabled = false; }, 2000);
  } catch (err) {
    msg.textContent = err.message;
    btn.textContent = 'Create';
    btn.disabled = false;
  }
}

loadAll();
