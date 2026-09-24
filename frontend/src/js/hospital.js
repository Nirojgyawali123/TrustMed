import { victimsAPI, getUser, authAPI } from '/src/api.js';

const user = getUser();
if (!user || (user.role !== 'hospital' && user.role !== 'admin')) {
  document.querySelector('.page').innerHTML = '<div class="card" style="padding:40px;text-align:center;max-width:400px;margin:40px auto;"><h2 style="font-size:20px;margin-bottom:8px;">Hospital access only</h2><p class="hint">Please sign in with a hospital account.</p><a href="login.html" class="btn btn-primary" style="margin-top:16px;display:inline-flex;">Sign in</a></div>';
  throw new Error('Not hospital');
}

const queue = document.getElementById('hospitalQueue');
const detail = document.getElementById('detailContent');
const actions = document.getElementById('actionButtons');
const logoSec = document.getElementById('logoSection');
let selectedId = null;
let victimsData = [];
let rejectTargetId = null;

async function load() {
  try {
    const victims = await victimsAPI.getAllAuth();
    victimsData = victims;
    const pending = victims.filter(v => !v.hospital_verified && !v.paused && !v.rejected);
    const verified = victims.filter(v => v.hospital_verified);

    document.getElementById('statPending').textContent = pending.length;
    document.getElementById('statVerified').textContent = verified.length;
    document.getElementById('statTotal').textContent = victims.length;
    document.getElementById('queueCount').textContent = pending.length + ' pending';

    if (pending.length === 0) {
      queue.innerHTML = '<div class="empty-state">No pending cases. All caught up!</div>';
      return;
    }

    queue.innerHTML = pending.map(v => `
      <div class="queue-row" data-id="${v.id}">
        <div class="queue-avatar">${v.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}</div>
        <div class="queue-main"><div class="name">${v.name}</div><div class="meta">${v.case_id || '#'+v.id} · ${v.disease}</div></div>
        <div class="queue-amt"><div class="amt">₨ ${Number(v.estimated_cost).toLocaleString()}</div></div>
      </div>
    `).join('');

    queue.querySelectorAll('.queue-row').forEach(row => {
      row.addEventListener('click', () => {
        queue.querySelectorAll('.queue-row').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
        showDetail(row);
      });
    });

    const first = queue.querySelector('.queue-row');
    if (first) { first.classList.add('selected'); showDetail(first); }
  } catch (err) {
    queue.innerHTML = '<div class="empty-state">Could not load cases. Make sure the backend is running.</div>';
  }
}

function showDetail(row) {
  const v = victimsData.find(v => v.id === parseInt(row.dataset.id));
  if (!v) return;
  selectedId = v.id;
  actions.hidden = false;
  logoSec.style.display = v.hospital_verified ? 'none' : 'block';

  const photoHtml = v.patient_photo
    ? `<img src="/uploads/${v.patient_photo}" style="width:72px;height:72px;border-radius:8px;object-fit:cover;border:1px solid var(--gray-200);">`
    : '';

  let reportsHtml = '';
  if (v.medical_reports && v.medical_reports.length > 0) {
    reportsHtml = v.medical_reports.map(r =>
      `<div class="report-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <a href="/uploads/${r.filename}" target="_blank">${r.original_name}</a>
      </div>`
    ).join('');
  }

  let collectorsHtml = '';
  if (v.collectors && v.collectors.length > 0) {
    collectorsHtml = v.collectors.map(c => {
      const cPhoto = c.photo ? `<img src="/uploads/${c.photo}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;">` : '';
      return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--gray-100);">
        ${cPhoto || '<div style="width:48px;height:48px;border-radius:50%;background:var(--gray-100);flex-shrink:0;"></div>'}
        <div><div style="font-weight:600;font-size:14px;">${c.name}</div><div class="hint" style="font-size:12px;">${c.relation_to_victim} · ${c.contact}</div></div>
      </div>`;
    }).join('');
  }

  const noteHtml = v.note_to_donors
    ? `<div style="margin-top:12px;padding:12px;background:var(--primary-50);border-radius:8px;font-size:13px;color:var(--gray-700);"><strong>Note to donors:</strong> ${v.note_to_donors}</div>`
    : '';

  const statusBadge = v.hospital_verified
    ? '<span class="pill green">Hospital verified</span>'
    : '<span class="pill amber">Pending verification</span>';

  detail.innerHTML = `
    <div style="margin-top:8px;">
      <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:12px;">
        ${photoHtml}
        <div>
          <h3 style="font-size:18px;font-weight:700;">${v.name}</h3>
          <div style="margin-top:4px;">${statusBadge}</div>
          <div class="hint" style="margin-top:4px;">${v.case_id || 'Case #'+v.id}</div>
        </div>
      </div>
      <div class="detail-panel">
        <div class="kv"><span class="k">Phone</span><span class="v">${v.phone}</span></div>
        <div class="kv"><span class="k">Address</span><span class="v">${v.address}</span></div>
        <div class="kv"><span class="k">Municipality</span><span class="v">${v.municipality_name}</span></div>
        <div class="kv"><span class="k">Diagnosis</span><span class="v">${v.disease}</span></div>
        <div class="kv"><span class="k">Hospital</span><span class="v">${v.hospital_name}</span></div>
        <div class="kv"><span class="k">Est. cost</span><span class="v">₨ ${Number(v.estimated_cost).toLocaleString()}</span></div>
        <div class="kv"><span class="k">Bank</span><span class="v">${v.bank_name} - ${v.bank_branch}</span></div>
        <div class="kv"><span class="k">Account holder</span><span class="v">${v.bank_account_holder}</span></div>
        <div class="kv"><span class="k">Account no.</span><span class="v">${v.bank_account_number}</span></div>
      </div>
      ${noteHtml}
      ${reportsHtml ? `<div style="margin-top:16px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;">Medical reports</div>
        <div class="report-list">${reportsHtml}</div>
      </div>` : '<p class="hint" style="margin-top:12px;">No medical reports uploaded.</p>'}
      ${collectorsHtml ? `<div style="margin-top:16px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;">Collectors (${v.collectors.length})</div>
        ${collectorsHtml}
      </div>` : ''}
    </div>
  `;
}

document.getElementById('verifyBtn').addEventListener('click', async () => {
  if (!selectedId) return;
  const btn = document.getElementById('verifyBtn');
  btn.disabled = true;
  btn.textContent = 'Verifying...';
  try {
    await victimsAPI.verify(selectedId, 'hospital');
    btn.textContent = 'Verified ✓';
    setTimeout(() => load(), 1500);
  } catch (err) {
    alert('Error: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Verify & forward to municipality';
  }
});

document.getElementById('rejectBtn').addEventListener('click', () => {
  if (!selectedId) return;
  rejectTargetId = selectedId;
  document.getElementById('rejectReason').value = '';
  document.getElementById('rejectModal').classList.add('open');
});

window.closeRejectModal = function() {
  document.getElementById('rejectModal').classList.remove('open');
  rejectTargetId = null;
};

window.confirmReject = async function() {
  const reason = document.getElementById('rejectReason').value.trim() || undefined;
  const btn = document.querySelector('#rejectModal .btn-danger');
  btn.disabled = true;
  btn.textContent = 'Rejecting...';
  try {
    await victimsAPI.reject(rejectTargetId, reason);
    closeRejectModal();
    btn.disabled = false;
    btn.textContent = 'Reject case';
    await load();
  } catch (err) {
    alert('Error: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Reject case';
  }
};

window.handleLogoUpload = async function(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!/\.(jpg|jpeg|png)$/i.test(file.name)) {
    alert('Only JPG and PNG files are accepted.');
    return;
  }
  try {
    await victimsAPI.uploadLogo(selectedId, file, 'hospital');
    alert('Logo uploaded. It will appear on the case once verified.');
  } catch (err) {
    alert('Error: ' + err.message);
  }
  e.target.value = '';
};

document.getElementById('reqPwdBtn')?.addEventListener('click', async ()=>{
  const reason = prompt('Reason for password change request (optional):') ?? '';
  const hint = document.getElementById('pwdReqHint');
  if(hint){ hint.style.display='block'; hint.textContent='Sending request...'; hint.style.color='var(--gray-500)'; }
  try{
    await authAPI.requestPasswordChange(reason);
    if(hint){ hint.textContent='Request sent to admin. Wait for approval.'; hint.style.color='var(--success)'; }
  }catch(err){
    if(hint){ hint.textContent=err.message; hint.style.color='var(--danger)'; }
    else alert(err.message);
  }
});

load();
