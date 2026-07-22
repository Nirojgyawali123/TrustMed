import { victimsAPI } from './api.js';

function renderDashboard() {
  return `
    <div class="mt-6">
      <h2 class="text-2xl font-bold mb-4">Victims List</h2>
      <div class="grid gap-4" id="victims-list">
        Loading...
      </div>
    </div>
  `;
}

function renderLogin() {
  return `
    <div class="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 class="text-2xl font-bold mb-6 text-center">Login</h2>
      <form id="login-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Username</label>
          <input type="text" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Password</label>
          <input type="password" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <button type="submit" class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700">Login</button>
      </form>
      <p class="mt-4 text-center text-sm text-gray-500">
        Demo: use any username/password to proceed
      </p>
    </div>
  `;
}

function renderPatients() {
  return `
    <div class="p-6">
      <h2 class="text-2xl font-bold mb-4">Patient Portal</h2>
      <p class="mb-4">View and manage patient records.</p>
      <!-- Placeholder for patient list -->
      <div id="patients-list" class="space-y-4">
        Loading patients...
      </div>
    </div>
  `;
}

function renderHospital() {
  return `
    <div class="p-6">
      <h2 class="text-2xl font-bold mb-4">Hospital Desk</h2>
      <p class="mb-4">Verify cases and manage hospital workflow.</p>
      <!-- Placeholder -->
      <div class="bg-gray-50 p-4 rounded">
        Hospital dashboard coming soon...
      </div>
    </div>
  `;
}

function renderMunicipality() {
  return `
    <div class="p-6">
      <h2 class="text-2xl font-bold mb-4">Municipality Office</h2>
      <p class="mb-4">Approve cases and manage municipal workflow.</p>
      <div class="bg-gray-50 p-4 rounded">
        Municipality dashboard coming soon...
      </div>
    </div>
  `;
}

function renderCitizen() {
  return `
    <div class="p-6">
      <h2 class="text-2xl font-bold mb-4">Citizen Giving</h2>
      <p class="mb-4">Donate to verified cases.</p>
      <div class="bg-gray-50 p-4 rounded">
        Citizen portal coming soon...
      </div>
    </div>
  `;
}

async function initApp() {
  const path = window.location.pathname;
  const app = document.querySelector('#app');

  // Clear existing content
  app.innerHTML = '';

  // Determine which page to render based on path
  let content = '';
  if (path.endsWith('/src/pages/login.html') || path.endsWith('/login.html')) {
    content = renderLogin();
  } else if (path.endsWith('/src/pages/patients.html') || path.endsWith('/patients.html')) {
    content = renderPatients();
  } else if (path.endsWith('/src/pages/hospital.html') || path.endsWith('/hospital.html')) {
    content = renderHospital();
  } else if (path.endsWith('/src/pages/municipality.html') || path.endsWith('/municipality.html')) {
    content = renderMunicipality();
  } else if (path.endsWith('/src/pages/citizen.html') || path.endsWith('/citizen.html')) {
    content = renderCitizen();
  } else {
    // Default to dashboard (for index.html or root)
    content = renderDashboard();
  }

  app.innerHTML = content;

  // If we rendered the dashboard, fetch and display victims
  if (path.endsWith('/src/pages/index.html') || path.endsWith('/index.html') || path === '/' || path === '') {
    try {
      const victims = await victimsAPI.getAll();
      const victimsListEl = document.querySelector('#victims-list');
      if (victims.length === 0) {
        victimsListEl.innerHTML = `
          <div class="col-span-4 p-4 bg-blue-50 rounded-lg">
            <p class="text-blue-800">No victims found. <a href="#" class="underline">Create one</a></p>
          </div>
        `;
      } else {
        victimsListEl.innerHTML = victims.map(victim => `
          <div class="col-span-4 p-4 bg-white rounded-lg shadow">
            <h3 class="font-semibold mb-2">${victim.name}</h3>
            <p class="mb-1"><span class="font-medium">Address:</span> ${victim.address}</p>
            <p class="mb-1"><span class="font-medium">Disease:</span> ${victim.disease}</p>
            <p class="mb-1"><span class="font-medium">Hospital:</span> ${victim.hospital_name}</p>
            <p class="mb-1"><span class="font-medium">Municipality:</span> ${victim.municipality_name}</p>
            <p class="mb-1"><span class="font-medium">Estimated cost:</span> $${victim.estimated_cost.toFixed(2)}</p>
            <div class="mt-2 flex space-x-3">
              <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">${victim.hospital_verified ? 'Hospital Verified' : 'Hospital Pending'}</span>
              <span class="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">${victim.muni_verified ? 'Municipality Verified' : 'Municipality Pending'}</span>
            </div>
          </div>
        `).join('');
      }
    } catch (error) {
      console.error('Dashboard error:', error);
      const victimsListEl = document.querySelector('#victims-list');
      if (victimsListEl) {
        victimsListEl.innerHTML = `
          <div class="col-span-4 p-4 bg-red-50 rounded-lg">
            <p class="text-red-800">Error connecting to backend. Make sure the server is running on http://localhost:8000</p>
          </div>
        `;
      }
    }
  }

  // Handle login form submission (demo)
  const loginForm = document.querySelector('#login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', e => {
      e.preventDefault();
      alert('Login successful! (demo)');
      // In a real app, you would redirect to dashboard
      window.location.href = '/src/pages/index.html';
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}