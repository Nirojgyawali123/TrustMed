import { authAPI, victimsAPI, adminAPI, getUser } from '/src/api.js';

const user = getUser();
if (!user || user.role !== 'patient') {
  document.getElementById('formView').innerHTML = '<div class="card" style="padding:40px;text-align:center;max-width:400px;margin:40px auto;"><h2 style="font-size:20px;margin-bottom:8px;">Please sign in first</h2><p class="hint">You need a patient account to submit a case.</p><a href="login.html" class="btn btn-primary" style="margin-top:16px;display:inline-flex;">Sign in</a></div>';
  document.getElementById('successView').style.display = 'none';
  throw new Error('Not authenticated');
}

let currentStep = 1;
let selectedFiles = [];
let patientPhotoFile = null;
let citizenshipDocFile = null;
let bankQrFile = null;
let collectorData = { files: {} };
let collectorCount = 1;

async function prefillAccount() {
  try {
    const account = await authAPI.me();
    document.getElementById('fName').value = account.full_name || '';
    document.getElementById('fDob').value = account.dob || '';
    document.getElementById('fAddress').value = account.address || '';
    document.getElementById('fPhone').value = account.phone || '';
    document.getElementById('fCitizenship').value = account.citizenship || '';
  } catch {
    const fallback = getUser();
    if (fallback) {
      const u = fallback;
      const nameInput = document.getElementById('fName');
      if (nameInput) nameInput.value = u.full_name || u.username || '';
    }
  }
}
prefillAccount();

const BUTWAL_HOSPITALS = [
  'Lumbini Provincial Hospital, Butwal',
  'Universal College of Medical Sciences (UCMS) Teaching Hospital, Bhairahawa',
  'Crimson Hospital, Butwal',
  'Siddhartha Children and Women Hospital, Butwal',
  'Lumbini Eye Institute, Butwal',
  'Gautam Buddha Community Heart Hospital, Butwal',
  'City Hospital Butwal',
  'Butwal Heart Hospital',
  'Devdaha Medical College, Devdaha',
  'Lumbini City Hospital, Butwal',
  'Butwal Model Hospital',
];

async function loadHospitals() {
  const input = document.getElementById('fHospital');
  const datalist = document.getElementById('hospitalDatalist');
  const dropdown = document.getElementById('hospitalDropdown');
  if (!input || !datalist) return;
  let dynamic = [];
  try {
    const hospitals = await adminAPI.listHospitals();
    dynamic = hospitals.map(h => h.full_name || h.username).filter(Boolean);
  } catch (e) {
    console.warn('Could not load hospitals', e);
  }
  const all = [...new Set([...BUTWAL_HOSPITALS, ...dynamic])].sort();
  all.push('Other');
  datalist.innerHTML = '';
  all.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    datalist.appendChild(opt);
  });
  // also populate styled dropdown if capable
  if (dropdown) {
    dropdown.innerHTML = all.map(name => `<div role="option" tabindex="-1" data-value="${name}" style="padding:8px 12px;cursor:pointer;font-size:13.5px;border-bottom:1px solid var(--gray-50);">${name}</div>`).join('');
    dropdown.querySelectorAll('[role="option"]').forEach(el => {
      el.addEventListener('click', () => {
        input.value = el.dataset.value;
        dropdown.style.display = 'none';
        input.setAttribute('aria-expanded','false');
        toggleOtherHospital();
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
      });
    });
  }
}
loadHospitals();

function isCapablePhone() {
  try {
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const widthOk = window.innerWidth >= 360;
    const notSaveData = !navigator.connection?.saveData;
    const memOk = navigator.deviceMemory ? navigator.deviceMemory > 2 : true;
    return hasTouch && widthOk && notSaveData && memOk && window.innerWidth < 1024;
  } catch { return false; }
}

window.handleHospitalInput = function() {
  toggleOtherHospital();
  const input = document.getElementById('fHospital');
  const dropdown = document.getElementById('hospitalDropdown');
  if (!dropdown) return;
  // progressive: capable phone shows styled dropdown, normal keeps native datalist
  if (isCapablePhone()) {
    const q = input.value.toLowerCase();
    const ops = dropdown.querySelectorAll('[role="option"]');
    let any = false;
    ops.forEach(el => {
      const show = !q || el.dataset.value.toLowerCase().includes(q);
      el.style.display = show ? 'block' : 'none';
      if (show) any = true;
    });
    if (document.activeElement === input && any) {
      dropdown.style.display = 'block';
      input.setAttribute('aria-expanded','true');
    } else if (!q) {
      dropdown.style.display = 'none';
      input.setAttribute('aria-expanded','false');
    }
  }
};

// hide styled dropdown on blur/outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('hospitalDropdown');
  const input = document.getElementById('fHospital');
  if (!dropdown || !input) return;
  if (!dropdown.contains(e.target) && e.target !== input) {
    dropdown.style.display = 'none';
    input.setAttribute('aria-expanded','false');
  }
});
document.getElementById('fHospital')?.addEventListener('focus', () => {
  if (isCapablePhone()) handleHospitalInput();
});

window.toggleOtherHospital = function() {
  const val = document.getElementById('fHospital').value.trim();
  const box = document.getElementById('otherHospitalFields');
  if (!box) return;
  // treat free text not in list as Other
  const datalistVals = Array.from(document.querySelectorAll('#hospitalDatalist option')).map(o=>o.value);
  const isOther = val === 'Other' || (val && !datalistVals.includes(val));
  if (isOther) {
    if (val !== 'Other' && val) {
      // auto-select Other and keep typed name
      document.getElementById('fOtherHospName').value = val;
    }
    box.style.display = 'block';
    box.setAttribute('aria-hidden','false');
    if (val !== 'Other') document.getElementById('fHospital').value = 'Other';
  } else if (val === 'Other') {
    box.style.display = 'block';
    box.setAttribute('aria-hidden','false');
  } else {
    box.style.display = 'none';
    box.setAttribute('aria-hidden','true');
  }
};

window.goStep = function(step) {
  if (step < currentStep || validateStep(currentStep)) {
    currentStep = step;
    updateSteps();
  }
};

function validateStep(step) {
  if (step === 1) {
    if (!document.getElementById('fMunicipality').value.trim()) { showError('Please enter your municipality / ward.'); return false; }
    if (!document.getElementById('fHospital').value) { showError('Please select a treating hospital.'); return false; }
    if (document.getElementById('fHospital').value === 'Other') {
      if (!document.getElementById('fOtherHospName').value.trim()) { showError('Please enter the unregistered hospital name.'); return false; }
      if (!document.getElementById('fOtherHospAddress').value.trim()) { showError('Please enter the unregistered hospital address.'); return false; }
      if (!document.getElementById('fOtherHospContact').value.trim()) { showError('Please enter the unregistered hospital contact.'); return false; }
    }
    if (!document.getElementById('fDisease').value.trim()) { showError('Please enter the diagnosis.'); return false; }
    if (!document.getElementById('fCost').value.trim()) { showError('Please enter the estimated cost.'); return false; }
    if (!patientPhotoFile) { showError('Please upload the patient photo.'); return false; }
    if (!citizenshipDocFile) { showError('Please upload the government ID / citizenship document.'); return false; }
    return true;
  }
  if (step === 2) {
    if (!document.getElementById('fBankName').value.trim()) { showError('Please enter the bank name.'); return false; }
    if (!document.getElementById('fBankHolder').value.trim()) { showError('Please enter the account holder name.'); return false; }
    if (!document.getElementById('fBankAccount').value.trim()) { showError('Please enter the account number.'); return false; }
    if (!document.getElementById('fBankBranch').value.trim()) { showError('Please enter the branch.'); return false; }
    if (!bankQrFile) { showError('Please upload the bank QR code from your bank app.'); return false; }
    return true;
  }
  if (step === 3) {
    if (selectedFiles.length === 0) { showError('Please upload at least one medical report.'); return false; }
    return true;
  }
  if (step === 4) {
    const hasCollector = document.getElementById('fHasCollector').checked;
    if (hasCollector) {
      const entries = document.querySelectorAll('.collector-entry');
      for (const entry of entries) {
        const name = entry.querySelector('.colName').value.trim();
        const contact = entry.querySelector('.colContact').value.trim();
        const address = entry.querySelector('.colAddress').value.trim();
        const relation = entry.querySelector('.colRelation').value.trim();
        const idx = entry.dataset.index;
        if (!name || !contact || !address || !relation) {
          showError(`Please fill all required fields for Collector ${parseInt(idx) + 1}.`);
          return false;
        }
        if (!collectorData.files[idx]) {
          showError(`Please upload a face photo for Collector ${parseInt(idx) + 1}.`);
          return false;
        }
      }
    }
    return true;
  }
  return true;
}

function showError(msg) {
  document.getElementById('submitStatus').textContent = msg;
  setTimeout(() => document.getElementById('submitStatus').textContent = '', 4000);
}

function updateSteps() {
  document.querySelectorAll('.step-content').forEach(el => el.style.display = 'none');
  const el = document.getElementById(`step${currentStep}`);
  if (el) el.style.display = 'block';

  document.querySelectorAll('.step').forEach(s => {
    s.classList.remove('active', 'done');
    const n = parseInt(s.dataset.step);
    if (n === currentStep) s.classList.add('active');
    else if (n < currentStep) s.classList.add('done');
  });

  const labels = ['Patient info','Bank details','Reports','Collectors','Note'];
  const prog = document.getElementById('stepProgressFill');
  const progLabel = document.getElementById('stepProgressLabel');
  if (prog) prog.style.width = (currentStep/5*100) + '%';
  if (progLabel) progLabel.textContent = `Step ${currentStep} of 5 · ${labels[currentStep-1]}`;

  document.getElementById('submitStatus').textContent = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.handleBankQr = function(e) {
  const file = e.target.files[0];
  const errEl = document.getElementById('bankQrError');
  const nameEl = document.getElementById('bankQrName');
  if (!file) return;
  if (!/\.(jpg|jpeg|png)$/i.test(file.name)) {
    errEl.textContent = 'Only JPG/PNG accepted.';
    errEl.style.display = 'block';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    errEl.textContent = 'File too large. Max 2 MB.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  bankQrFile = file;
  nameEl.textContent = file.name;
  const reader = new FileReader();
  reader.onload = function(ev) {
    const preview = document.getElementById('bankQrPreview');
    preview.style.display = 'block';
    document.getElementById('bankQrImg').src = ev.target.result;
  };
  reader.readAsDataURL(file);
};

window.handlePatientPhoto = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!/\.(jpg|jpeg|png)$/i.test(file.name)) {
    document.getElementById('patPhotoName').textContent = 'Only JPG/PNG accepted.';
    return;
  }
  patientPhotoFile = file;
  document.getElementById('patPhotoName').textContent = file.name;
  const reader = new FileReader();
  reader.onload = function(ev) {
    const preview = document.getElementById('patPhotoPreview');
    preview.style.display = 'block';
    document.getElementById('patPhotoImg').src = ev.target.result;
  };
  reader.readAsDataURL(file);
};

window.handleCitizenshipDoc = function(e) {
  const file = e.target.files[0];
  const errEl = document.getElementById('citDocError');
  const nameEl = document.getElementById('citDocName');
  if (!file) return;
  if (!/\.(jpg|jpeg|png|pdf)$/i.test(file.name)) {
    errEl.textContent = 'Only JPG, PNG, or PDF accepted.';
    errEl.style.display = 'block';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    errEl.textContent = 'File too large. Max 5 MB.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  citizenshipDocFile = file;
  nameEl.textContent = file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB → will compress to <200 KB)';
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = function(ev) {
      const preview = document.getElementById('citDocPreview');
      preview.style.display = 'block';
      document.getElementById('citDocImg').src = ev.target.result;
    };
    reader.readAsDataURL(file);
  } else {
    const preview = document.getElementById('citDocPreview');
    preview.style.display = 'block';
    document.getElementById('citDocImg').src = '';
    document.getElementById('citDocImg').alt = 'PDF document';
    nameEl.textContent += ' — PDF preview not available';
  }
};

window.handleFileSelect = function(e) {
  const newFiles = Array.from(e.target.files);
  const validFiles = newFiles.filter(f => /\.(jpg|jpeg|png)$/i.test(f.name));
  if (validFiles.length !== newFiles.length) {
    document.getElementById('fileError').textContent = 'Only JPG and PNG files are accepted.';
    document.getElementById('fileError').style.display = 'block';
  } else {
    document.getElementById('fileError').style.display = 'none';
  }
  selectedFiles = [...selectedFiles, ...validFiles];
  renderFileList();
  e.target.value = '';
};

function renderFileList() {
  const list = document.getElementById('fileList');
  if (selectedFiles.length === 0) {
    list.innerHTML = '';
    document.getElementById('reportUpload').classList.remove('has-files');
    return;
  }
  document.getElementById('reportUpload').classList.add('has-files');
  list.innerHTML = selectedFiles.map((f, i) =>
    `<div class="file-item">
      <span class="file-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
      <span class="file-name">${f.name}</span>
      <button class="file-remove" onclick="removeFile(${i})">&times;</button>
    </div>`
  ).join('');
}

window.removeFile = function(index) {
  selectedFiles.splice(index, 1);
  renderFileList();
};

window.toggleCollector = function() {
  const checked = document.getElementById('fHasCollector').checked;
  document.getElementById('collectorSection').style.display = checked ? 'block' : 'none';
};

window.addCollector = function() {
  const idx = collectorCount;
  collectorCount++;
  const container = document.getElementById('collectorsContainer');
  const div = document.createElement('div');
  div.className = 'collector-entry';
  div.dataset.index = idx;
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h4 style="font-size:14px;color:var(--gray-600);">Collector ${idx + 1}</h4>
      <button class="btn btn-sm btn-danger" onclick="removeCollector(${idx})">Remove</button>
    </div>
    <div class="field-row2">
      <div class="field"><label>Full name <span class="required">*</span></label><input type="text" class="colName" placeholder="Enter full name"></div>
      <div class="field"><label>Contact number <span class="required">*</span></label><input type="tel" class="colContact" placeholder="Enter contact number"></div>
    </div>
    <div class="field"><label>Address <span class="required">*</span></label><input type="text" class="colAddress" placeholder="Enter address"></div>
    <div class="field"><label>Relation to patient <span class="required">*</span></label><input type="text" class="colRelation" placeholder="Enter relation to patient"></div>
    <div class="field"><label>Citizenship details (if available)</label><input type="text" class="colCitizenship" placeholder="Enter citizenship number"></div>
    <div class="field">
      <label>Face photo <span class="required">*</span></label>
      <input type="file" class="colPhoto" accept=".jpg,.jpeg,.png" onchange="handleCollectorPhoto(event, ${idx})">
      <div style="margin-top:8px;display:flex;align-items:center;gap:14px;">
        <div class="colPhotoPreview" style="width:72px;height:72px;border-radius:50%;background:var(--gray-100);display:none;overflow:hidden;">
          <img class="colPhotoImg" style="width:100%;height:100%;object-fit:cover;">
        </div>
        <div class="colPhotoName hint"></div>
      </div>
    </div>
  `;
  container.appendChild(div);
};

window.removeCollector = function(idx) {
  const entry = document.querySelector(`.collector-entry[data-index="${idx}"]`);
  if (entry) entry.remove();
  delete collectorData.files[idx];
};

window.handleCollectorPhoto = function(e, idx) {
  const file = e.target.files[0];
  if (!file) return;
  if (!/\.(jpg|jpeg|png)$/i.test(file.name)) {
    e.target.parentElement.querySelector('.colPhotoName').textContent = 'Only JPG/PNG accepted.';
    return;
  }
  collectorData.files[idx] = file;
  const entry = e.target.closest('.collector-entry');
  entry.querySelector('.colPhotoName').textContent = file.name;
  const reader = new FileReader();
  reader.onload = function(ev) {
    const preview = entry.querySelector('.colPhotoPreview');
    preview.style.display = 'block';
    entry.querySelector('.colPhotoImg').src = ev.target.result;
  };
  reader.readAsDataURL(file);
};

window.submitCase = async function() {
  if (!validateStep(1) || !validateStep(2) || !validateStep(3) || !validateStep(4)) return;

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  const status = document.getElementById('submitStatus');
  status.textContent = 'Submitting case...';

  try {
    const collectors = [];
    const hasCollector = document.getElementById('fHasCollector').checked;
    if (hasCollector) {
      const entries = document.querySelectorAll('.collector-entry');
      for (const entry of entries) {
        collectors.push({
          name: entry.querySelector('.colName').value.trim(),
          address: entry.querySelector('.colAddress').value.trim(),
          relation_to_victim: entry.querySelector('.colRelation').value.trim(),
          contact: entry.querySelector('.colContact').value.trim(),
          citizenship_details: entry.querySelector('.colCitizenship').value.trim() || undefined,
        });
      }
    }

    const isOtherHosp = document.getElementById('fHospital').value === 'Other';
    const body = {
      name: document.getElementById('fName').value.trim(),
      phone: document.getElementById('fPhone').value.trim(),
      address: document.getElementById('fAddress').value.trim(),
      disease: document.getElementById('fDisease').value.trim(),
      hospital_name: document.getElementById('fHospital').value,
      municipality_name: document.getElementById('fMunicipality').value.trim(),
      estimated_cost: parseFloat(document.getElementById('fCost').value.trim()),
      bank_name: document.getElementById('fBankName').value.trim(),
      bank_account_number: document.getElementById('fBankAccount').value.trim(),
      bank_account_holder: document.getElementById('fBankHolder').value.trim(),
      bank_branch: document.getElementById('fBankBranch').value.trim(),
      note_to_donors: document.getElementById('fNote').value.trim() || undefined,
      collectors: collectors.length > 0 ? collectors : undefined,
      other_hospital_name: isOtherHosp ? document.getElementById('fOtherHospName').value.trim() : undefined,
      other_hospital_address: isOtherHosp ? document.getElementById('fOtherHospAddress').value.trim() : undefined,
      other_hospital_contact: isOtherHosp ? document.getElementById('fOtherHospContact').value.trim() : undefined,
    };

    const result = await victimsAPI.create(body);

    if (patientPhotoFile) {
      await victimsAPI.uploadPatientPhoto(result.id, patientPhotoFile);
    }

    if (citizenshipDocFile) {
      status.textContent = 'Compressing government ID to <200 KB...';
      await victimsAPI.uploadCitizenshipDoc(result.id, citizenshipDocFile);
    }

    if (bankQrFile) {
      await victimsAPI.uploadBankQr(result.id, bankQrFile);
    }

    for (const file of selectedFiles) {
      await victimsAPI.uploadReport(result.id, file);
    }

    if (hasCollector) {
      const entries = document.querySelectorAll('.collector-entry');
      for (const entry of entries) {
        const idx = entry.dataset.index;
        const photoFile = collectorData.files[idx];
        if (photoFile) {
          const collectorId = result.collectors.find(c => c.name === entry.querySelector('.colName').value.trim())?.id;
          if (collectorId) {
            await victimsAPI.uploadCollectorPhoto(result.id, collectorId, photoFile);
          }
        }
      }
    }

    document.getElementById('displayCaseId').textContent = result.case_id || `#${result.id}`;
    document.getElementById('formView').style.display = 'none';
    document.getElementById('successView').style.display = 'block';
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    btn.disabled = false;
  }
};
