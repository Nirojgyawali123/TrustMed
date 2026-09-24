import { victimsAPI, getUser } from '/src/api.js';

const user = getUser();
if (!user || user.role !== 'patient') {
  document.getElementById('casesContainer').innerHTML = '<div class="card" style="padding:40px;text-align:center;max-width:400px;margin:40px auto;"><h2 style="font-size:20px;margin-bottom:8px;">Please sign in first</h2><p class="hint">You need a patient account to view your cases.</p><a href="login.html" class="btn btn-primary" style="margin-top:16px;display:inline-flex;">Sign in</a></div>';
  throw new Error('Not authenticated');
}

function statusBadgeHtml(v) {
  if (v.paused) return '<span class="pill red">Paused</span>';
  if (v.rejected) return '<span class="pill red">Rejected</span>';
  if (!v.hospital_verified) return '<span class="pill amber">Pending Hospital</span>';
  if (!v.muni_verified) return '<span class="pill amber">Pending Municipality</span>';
  return '<span class="pill green">Verified & Live</span>';
}

function progressPercent(v) {
  if (!v.estimated_cost || v.estimated_cost <= 0) return 0;
  return Math.min(100, Math.round((v.total_collected || 0) / v.estimated_cost * 100));
}

function formatNpr(n) {
  return '₨ ' + Number(n || 0).toLocaleString();
}

async function load() {
  try {
    const victims = await victimsAPI.getAllAuth();
    const container = document.getElementById('casesContainer');
    const emptyState = document.getElementById('emptyState');

    if (victims.length === 0) {
      container.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    container.style.display = 'block';
    emptyState.style.display = 'none';

    container.innerHTML = victims.map(v => {
      const pct = progressPercent(v);
      const photoHtml = v.patient_photo
        ? `<img src="/uploads/${v.patient_photo}" style="width:64px;height:64px;border-radius:8px;object-fit:cover;border:1px solid var(--gray-200);">`
        : `<div style="width:64px;height:64px;border-radius:8px;background:var(--primary-50);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;color:var(--primary);flex-shrink:0;">${v.name[0]}</div>`;

      const reportsHtml = (v.medical_reports && v.medical_reports.length > 0)
        ? v.medical_reports.map(r => `<a href="/uploads/${r.filename}" target="_blank" class="report-item" style="font-size:12px;">${r.original_name}</a>`).join('')
        : '<span class="hint" style="font-size:12px;">No reports</span>';
      const citizenshipBadge = v.citizenship_doc
        ? `<a href="/uploads/${v.citizenship_doc}" target="_blank" style="font-size:12px;color:var(--primary);">Gov ID ✓ (${(v.citizenship_doc.endsWith('.pdf')?'PDF':'IMG')}, &lt;200 KB)</a>`
        : '<span class="hint" style="font-size:12px;color:var(--danger);">Gov ID missing</span>';

      const collectorsCount = v.collectors ? v.collectors.length : 0;

      const rejectionHtml = v.rejected && v.rejection_reason
        ? `<div style="margin-top:12px;padding:10px 14px;background:var(--danger-light);border-radius:8px;font-size:13px;">
            <strong>Rejected:</strong> ${v.rejection_reason}
            <button class="btn btn-sm btn-outline" style="margin-left:8px;font-size:11px;" onclick="resubmitCase(${v.id})">Resubmit</button>
          </div>`
        : (v.rejected ? `<div style="margin-top:12px;">
            <button class="btn btn-sm btn-outline" onclick="resubmitCase(${v.id})">Resubmit case</button>
          </div>` : '');

      return `<div class="card" style="margin-bottom:16px;padding:20px;">
        <div style="display:flex;gap:16px;">
          ${photoHtml}
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
              <h3 style="font-size:17px;font-weight:700;">${v.name}</h3>
              ${statusBadgeHtml(v)}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;font-size:13px;margin-bottom:12px;">
              <div><span style="color:var(--gray-400);">Case ID:</span> <strong>${v.case_id || '#'+v.id}</strong></div>
              <div><span style="color:var(--gray-400);">Hospital:</span> ${v.hospital_name}</div>
              <div><span style="color:var(--gray-400);">Address:</span> ${v.address}</div>
              <div><span style="color:var(--gray-400);">Phone:</span> ${v.phone}</div>
              <div><span style="color:var(--gray-400);">Municipality:</span> ${v.municipality_name}</div>
              <div><span style="color:var(--gray-400);">Collectors:</span> ${collectorsCount}</div>
            </div>
            <div style="margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
                <span class="case-raised">${formatNpr(v.total_collected)}</span>
                <span class="case-goal">of ${formatNpr(v.estimated_cost)}</span>
              </div>
              <div class="case-progress">
                <div class="case-progress-fill" style="width:${pct}%;"></div>
              </div>
            </div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:13px;">
              <div><span style="color:var(--gray-400);">Medical reports:</span></div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">${reportsHtml}</div>
            </div>
            <div style="display:flex;gap:12px;align-items:center;font-size:13px;margin-top:6px;">
              <div><span style="color:var(--gray-400);">Government ID:</span></div>
              <div>${citizenshipBadge}</div>
            </div>
            <div style="margin-top:10px;font-size:13px;">
              <span style="color:var(--gray-400);">Diagnosis:</span> ${v.disease}
            </div>
            ${v.note_to_donors ? `<div style="margin-top:8px;font-size:13px;color:var(--gray-500);font-style:italic;">"${v.note_to_donors}"</div>` : ''}
            ${rejectionHtml}
          </div>
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    document.getElementById('casesContainer').innerHTML = `<div class="empty-state">Error loading cases: ${err.message}</div>`;
  }
}

window.resubmitCase = async function(id) {
  try {
    await victimsAPI.resubmit(id);
    await load();
  } catch (err) {
    alert('Error: ' + err.message);
  }
};

load();
