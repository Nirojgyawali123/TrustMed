import { victimsAPI, getUser, authHeaders } from '/src/api.js';

async function load() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const el = document.getElementById('caseDetail');

  if (!id) { el.innerHTML = '<div class="empty-state">No case ID specified.</div>'; return; }

  try {
    const v = await victimsAPI.get(parseInt(id));
    // Try to fetch citizenship doc meta (auth-gated: victim/municipality/admin only)
    let citizenshipHtml = '';
    let citizenshipDocPath = null;
    try {
      const meta = await victimsAPI.getCitizenshipMeta(parseInt(id));
      if (meta && meta.citizenship_doc) {
        citizenshipDocPath = meta.citizenship_doc;
        const isPdf = meta.citizenship_doc.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          citizenshipHtml = `<div class="card" style="padding:18px;margin-top:12px;border-left:3px solid var(--primary);">
            <h3 style="font-size:14px;font-weight:700;margin-bottom:6px;">Government ID / Citizenship <span class="pill blue" style="font-size:10px;">restricted</span></h3>
            <p class="hint" style="font-size:12px;margin-bottom:10px;">Compressed to &lt;200 KB · Visible only to you, municipality, and admin.</p>
            <a href="/uploads/${meta.citizenship_doc}" target="_blank" class="btn btn-outline btn-sm">View / Download citizenship document (PDF)</a>
            <div style="margin-top:8px;"><a href="${victimsAPI.getCitizenshipDocUrl(parseInt(id))}" data-auth-link style="font-size:12px;color:var(--primary);">Authenticated download via API (requires sign-in)</a></div>
          </div>`;
        } else {
          citizenshipHtml = `<div class="card" style="padding:18px;margin-top:12px;border-left:3px solid var(--primary);">
            <h3 style="font-size:14px;font-weight:700;margin-bottom:6px;">Government ID / Citizenship <span class="pill blue" style="font-size:10px;">restricted</span></h3>
            <p class="hint" style="font-size:12px;margin-bottom:10px;">Compressed to &lt;200 KB · Visible only to you, municipality, and admin. Original clarity preserved for verification (synthetic 800×600 if OCR available).</p>
            <div style="text-align:center;background:#fff;border:1px solid var(--gray-200);border-radius:8px;padding:8px;">
              <img id="citDocDisplay" src="/uploads/${meta.citizenship_doc}" alt="Citizenship document" style="max-width:100%;max-height:420px;object-fit:contain;display:block;margin:0 auto;background:#fff;">
            </div>
            <div class="hint" style="font-size:11px;margin-top:6px;text-align:center;">If image does not load, <a href="/uploads/${meta.citizenship_doc}" target="_blank">open directly</a> or <a href="#" id="citAuthFetch">fetch with auth</a></div>
          </div>`;
        }
      }
    } catch (e) {
      // Not authorized or no doc — hide section (hospital/public will land here)
      citizenshipHtml = '';
    }

    const pct = v.total_collected && v.estimated_cost ? Math.min(100, (v.total_collected / v.estimated_cost) * 100) : 0;
    const raised = Number(v.total_collected || 0).toLocaleString();
    const cost = Number(v.estimated_cost).toLocaleString();

     const ageTxt = v.age ? `${v.age} years` : null;
     const photoHtml = v.patient_photo
      ? `<img src="/uploads/${v.patient_photo}" style="width:64px;height:64px;border-radius:8px;object-fit:cover;border:1px solid var(--gray-200);display:block;">`
      : '';

    let reportsHtml = '';
    if (v.medical_reports && v.medical_reports.length > 0) {
      reportsHtml = v.medical_reports.map(r =>
        `<div class="report-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <a href="/uploads/${r.filename}" target="_blank">${r.original_name}</a>
        </div>`
      ).join('');
    }

    let collectorsHtml = '';
    if (v.collectors && v.collectors.length > 0) {
      collectorsHtml = v.collectors.map(c => {
        const cPhoto = c.photo
          ? `<img src="/uploads/${c.photo}" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:2px solid #fff;box-shadow:var(--shadow);margin-bottom:8px;display:block;">`
          : `<div style="width:60px;height:60px;border-radius:50%;background:var(--gray-100);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--gray-500);margin:0 auto 8px;">${c.name[0] || '?'}</div>`;
        return `<div style="text-align:center;padding:12px;background:#fff;border:1px solid var(--gray-200);border-radius:var(--radius);">
          ${cPhoto}
          <div style="font-weight:600;font-size:13.5px;">${c.name}</div>
          <div class="hint" style="font-size:11.5px;line-height:1.4;margin-top:2px;">${c.address}<br>${c.relation_to_victim} · ${c.contact}</div>
        </div>`;
      }).join('');
    }

    const noteHtml = v.note_to_donors
      ? `<div style="padding:12px 16px;background:var(--primary-50);border:1px solid var(--primary-light);border-radius:8px;margin-bottom:16px;">
          <div style="font-size:13px;font-style:italic;color:var(--gray-700);line-height:1.5;">"${v.note_to_donors}"</div>
          <div style="font-size:11.5px;color:var(--gray-400);margin-top:6px;">— ${v.name}</div>
        </div>`
      : '';

    const hospitalLogoHtml = v.hospital_logo
      ? `<img src="/uploads/${v.hospital_logo}" style="height:24px;object-fit:contain;">`
      : '<span class="hint" style="font-size:12px;">Pending</span>';
    const municipalityLogoHtml = v.municipality_logo
      ? `<img src="/uploads/${v.municipality_logo}" style="height:24px;object-fit:contain;">`
      : '<span class="hint" style="font-size:12px;">Pending</span>';

    el.innerHTML = `
      <div class="flex-between" style="margin-bottom:14px;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;gap:14px;align-items:center;min-width:0;">
          ${photoHtml}
          <div style="min-width:0;">
            <div class="eyebrow green">Verified case</div>
            <h1 class="page-title" style="margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${v.name}${ageTxt ? `<span style="font-weight:400;color:var(--gray-400);font-size:14px;margin-left:6px;">· ${ageTxt}</span>` : ''}</h1>
            <div class="hint" style="font-size:12.5px;">${v.case_id || 'Case #'+v.id} · ${v.municipality_name}${v.age ? ` · ${v.age}y` : ''}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <span class="pill green">Hospital ✓</span>
          <span class="pill blue">Municipality ✓</span>
        </div>
      </div>

      ${noteHtml}

      <div style="display:flex;gap:20px;justify-content:center;margin-bottom:16px;padding:10px;background:#fff;border:1px solid var(--gray-200);border-radius:8px;">
        <div style="text-align:center;min-width:0;">
          <div style="font-size:10.5px;font-weight:600;color:var(--gray-400);margin-bottom:3px;letter-spacing:.03em;">HOSPITAL</div>
          ${hospitalLogoHtml}
        </div>
        <div style="width:1px;background:var(--gray-100);align-self:stretch;"></div>
        <div style="text-align:center;min-width:0;">
          <div style="font-size:10.5px;font-weight:600;color:var(--gray-400);margin-bottom:3px;letter-spacing:.03em;">MUNICIPALITY</div>
          ${municipalityLogoHtml}
        </div>
      </div>

      <div class="card" style="padding:18px;margin-bottom:14px;">
        <div class="flex-between"><span class="eyebrow">Funding progress</span><span class="hint" style="font-size:12px;">Case #${v.id}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin:10px 0 6px;gap:12px;">
          <span style="font-size:22px;font-weight:700;letter-spacing:-.02em;">₨ ${raised}</span>
          <span class="hint" style="font-size:12.5px;">of ₨ ${cost} goal</span>
        </div>
        <div class="fund-track"><div class="fund-fill" style="width:${pct}%"></div></div>
        <div class="fund-labels"><span>${pct.toFixed(0)}% funded</span></div>
      </div>

      <div class="grid-2" style="margin-bottom:14px;">
        <div>
          <div class="card" style="padding:18px;">
            <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Patient details</h3>
            <div class="detail-panel">
              ${ageTxt ? `<div class="kv"><span class="k">Age</span><span class="v">${ageTxt}</span></div>` : ''}
              <div class="kv"><span class="k">Phone</span><span class="v">${v.phone}</span></div>
              <div class="kv"><span class="k">Address</span><span class="v">${v.address}</span></div>
              <div class="kv"><span class="k">Municipality</span><span class="v">${v.municipality_name}</span></div>
              <div class="kv"><span class="k">Diagnosis</span><span class="v">${v.disease}</span></div>
              <div class="kv"><span class="k">Hospital</span><span class="v">${v.hospital_name === 'Other' && v.other_hospital_name ? v.other_hospital_name + (v.other_hospital_address ? ' — ' + v.other_hospital_address : '') : v.hospital_name}</span></div>
              ${v.hospital_name === 'Other' && v.other_hospital_name ? `<div class="kv"><span class="k">Hospital contact</span><span class="v">Via admin verification</span></div><div class="kv"><span class="k">Unregistered location</span><span class="v">${v.other_hospital_address || '—'}</span></div>` : ''}
              <div class="kv"><span class="k">Est. cost</span><span class="v">₨ ${cost}</span></div>
            </div>
          </div>
          ${reportsHtml ? `<div class="card" style="padding:18px;margin-top:12px;">
            <h3 style="font-size:14px;font-weight:700;margin-bottom:8px;">Medical reports <span class="hint" style="font-weight:400;font-size:11px;">kept clear, enhanced if blurry</span></h3>
            <div class="report-list">${reportsHtml}</div>
          </div>` : ''}
          ${citizenshipHtml}
        </div>
        <div>
          <div class="card" style="padding:18px;">
            <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Donate via bank QR</h3>
            ${v.bank_qr ? `<div style="text-align:center;padding:12px;background:#fff;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:12px;">
              <img src="/uploads/${v.bank_qr}" alt="Bank QR code for ${v.bank_name}" style="width:180px;height:180px;object-fit:contain;display:block;margin:0 auto 8px;background:#fff;border-radius:6px;">
              <div class="hint" style="font-size:12px;">Scan with your banking app to donate</div>
            </div>` : '<p class="hint" style="font-size:12.5px;color:var(--gray-400);">QR code not yet provided.</p>'}
            <div class="detail-panel">
              <div class="kv"><span class="k">Bank</span><span class="v">${v.bank_name}</span></div>
              <div class="kv"><span class="k">Account holder</span><span class="v">${v.bank_account_holder}</span></div>
              <div class="kv"><span class="k">Branch</span><span class="v">${v.bank_branch}</span></div>
            </div>
            <p class="hint" style="font-size:11.5px;margin-top:10px;line-height:1.4;">Account number is hidden for privacy. Please scan the QR code above to transfer funds directly.</p>
          </div>

          ${collectorsHtml ? `<div class="card" style="padding:18px;margin-top:12px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:8px;">Verified collectors (${v.collectors.length})</div>
            <p class="hint" style="margin-bottom:10px;font-size:12.5px;">Authorised to collect cash in person. Present this page as proof.</p>
            <div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));">${collectorsHtml}</div>
          </div>` : ''}
        </div>
      </div>

      <div style="text-align:center;margin-bottom:16px;">
        <a href="/victims/${v.id}/pdf" target="_blank" class="btn btn-outline btn-sm">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download verification PDF
        </a>
      </div>

      <div class="trust-strip trust-strip--center">
        <div class="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 2 4 5v6c0 4.2 2.8 7.2 8 10 5.2-2.8 8-5.8 8-10V5l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>Diagnosis confirmed by ${v.hospital_name}</div>
        <div class="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Identity confirmed by ${v.municipality_name}</div>
        <div class="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2Z"/></svg>Funds go to verified bank account</div>
      </div>
    `;
    // Attach authenticated fetch handler for citizenship doc (for strict auth endpoint)
    setTimeout(() => {
      const link = document.getElementById('citAuthFetch');
      const img = document.getElementById('citDocDisplay');
      if (link) {
        link.addEventListener('click', async (e) => {
          e.preventDefault();
          const u = getUser();
          if (!u || !u.token) { alert('Please sign in to fetch citizenship doc'); return; }
          try {
            const res = await fetch(victimsAPI.getCitizenshipDocUrl(parseInt(id)), { headers: { ...authHeaders() } });
            if (!res.ok) throw new Error('Fetch failed: ' + res.status);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            if (img) img.src = url;
            else window.open(url, '_blank');
          } catch (err) { alert('Auth fetch failed: ' + err.message); }
        });
      }
      // Also try auth fetch automatically if direct /uploads fails (e.g., 404 due to protected static)
      if (img && citizenshipDocPath) {
        img.addEventListener('error', async () => {
          const u = getUser();
          if (!u || !u.token) return;
          try {
            const res = await fetch(victimsAPI.getCitizenshipDocUrl(parseInt(id)), { headers: { ...authHeaders() } });
            if (res.ok) {
              const blob = await res.blob();
              img.src = URL.createObjectURL(blob);
            }
          } catch {}
        });
      }
    }, 0);
  } catch (err) {
    el.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
  }
}

load();
