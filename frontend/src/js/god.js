import { adminAPI, getUser } from '/src/api.js';

const user = getUser();
if (!user || user.role !== 'admin') {
  document.getElementById('adminPage').innerHTML = '<div class="card" style="padding:40px;text-align:center;max-width:400px;margin:40px auto;"><h2 style="font-size:20px;margin-bottom:8px;">God access only</h2><p class="hint">Sign in with the god account (niroj).</p><a href="login.html" class="btn btn-primary" style="margin-top:16px;display:inline-flex;">Go to login</a></div>';
  throw new Error('Not god');
}

async function loadAll() {
  await loadStats();
  await loadVictims();
  await loadUnregisteredHospitals();
  await loadAccounts();
  await loadAuditLog();
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
    if (victims.length === 0) { wrap.innerHTML = '<p class="hint" style="padding:16px;">No cases yet.</p>'; return; }

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
    // Fetch citizenship doc meta for admin (victim/municipality/admin visibility) — admin role can view
    let citizenshipHtml = '';
    try {
      const meta = await victimsAPI.getCitizenshipMeta(id);
      if (meta && meta.citizenship_doc) {
        const isPdf = meta.citizenship_doc.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          citizenshipHtml = `<div style="margin-top:12px;padding:10px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;">
            <strong style="font-size:13px;">Government ID / Citizenship <span class="pill blue" style="font-size:10px;">restricted</span></strong>
            <p class="hint" style="font-size:11px;margin:4px 0 6px;">Compressed to &lt;200 KB</p>
            <a href="/uploads/${meta.citizenship_doc}" target="_blank" class="btn btn-outline btn-sm">View PDF</a>
            <a href="${victimsAPI.getCitizenshipDocUrl(id)}" style="margin-left:8px;font-size:11px;color:var(--primary);" onclick="event.preventDefault(); fetch('${victimsAPI.getCitizenshipDocUrl(id)}',{headers:{Authorization:'Bearer '+ (getUser()?.token||'')}}).then(r=>r.blob()).then(b=>{const u=URL.createObjectURL(b); window.open(u,'_blank');}); return false;">Auth fetch</a>
          </div>`;
        } else {
          citizenshipHtml = `<div style="margin-top:12px;padding:10px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;">
            <strong style="font-size:13px;">Government ID / Citizenship <span class="pill blue" style="font-size:10px;">restricted</span></strong>
            <p class="hint" style="font-size:11px;margin:4px 0 6px;">Compressed to &lt;200 KB · admin/municipality/owner only</p>
            <img src="/uploads/${meta.citizenship_doc}" alt="Citizenship" style="max-width:100%;max-height:240px;object-fit:contain;display:block;margin:0 auto;background:#fff;border:1px solid var(--gray-200);border-radius:6px;">
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
  } catch (err) { el.innerHTML = `<p class="hint">Error: ${err.message}</p>`; }
}

document.getElementById('createHospBtn').addEventListener('click', () => createAccount('hospital'));
document.getElementById('createMunBtn').addEventListener('click', () => createAccount('municipality'));

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
