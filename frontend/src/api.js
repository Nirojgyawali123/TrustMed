// API Service for TechMed Backend
const API_BASE_URL = 'http://127.0.0.1:8000';

// Helper function for API calls
async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API Call failed:', error);
    throw error;
  }
}

// Victims API
export const victimsAPI = {
  // Get all victims
  getAll: () => apiCall('/victims/'),

  // Create new victim
  create: (victimData) => apiCall('/victims/', {
    method: 'POST',
    body: JSON.stringify(victimData),
  }),

  // Verify a victim case
  verify: (victimId, role) => apiCall(`/victims/${victimId}/verify/${role}`, {
    method: 'PATCH',
  }),
};

export default { victimsAPI };
