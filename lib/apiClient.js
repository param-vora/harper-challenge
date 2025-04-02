// lib/apiClient.js
import axios from 'axios';

const api = axios.create({
  baseURL: '', // Assumes API routes are relative to the domain
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Handle API errors
api.interceptors.response.use(
  (response) => response.data, // Only return data on success
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    // Throw a structured error or the response data if available
    throw error.response?.data || { error: error.message, status: error.response?.status };
  }
);

// Company-related API calls
export const getCompanies = async () => {
  return api.get('/api/companies');
};

export const getCompanyMemory = async (companyId) => {
  return api.get(`/api/company-memory?companyId=${companyId}`);
};

// Data extraction API call
export const extractData = async (structuredData, unstructuredTranscripts) => {
  return api.post('/api/extract-data', {
    structured_data: structuredData,
    unstructured_transcripts: unstructuredTranscripts,
  });
};

// Voice processing API call
export const processVoiceCommand = async (audioBlob) => {
  // ... (existing voice processing code remains the same) ...
   if (!audioBlob) {
    // Fallback or error handling if needed
    console.warn('No audio blob provided to processVoiceCommand');
    // Depending on requirements, might return a specific error or mock response
    throw { error: "No audio data provided."};
    // Or call a fallback endpoint: return api.post('/api/process-voice', {});
  }

  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    const response = await axios.post('/api/process-voice', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
    return response.data; // Return data directly from axios response here
  } catch (error) {
     // Log and re-throw structured error
    console.error('Voice processing error in apiClient:', error.response?.data || error.message);
    throw error.response?.data || { error: error.message, status: error.response?.status };
  }
};


// *** NEW: Save Form Data API Call ***
export const saveFormData = async (companyId, formData) => {
    console.log(`[apiClient] Saving form data for company ${companyId}`);
    return api.post('/api/save-form', { companyId, formData });
};

// *** NEW: Load Form Data API Call ***
export const loadFormData = async (companyId) => {
    console.log(`[apiClient] Loading form data for company ${companyId}`);
    // Use standard api instance which handles response.data extraction
    return api.get(`/api/load-form?companyId=${companyId}`);
    // Note: If no data is found, the API returns status 200 with `null` body,
    // which the interceptor will pass through as `null`.
};


// PDF generation API call (Mock)
export const generatePdf = async (formData) => {
  // ... (existing mock PDF generation code remains the same) ...
  // This will likely call `/api/generate-pdf` which might internally trigger a save first
   const response = await api.post('/api/generate-pdf', formData);

  // Client-side download logic (remains the same)
  if (response.htmlContent && response.fileName) {
    const blob = new Blob([response.htmlContent], { type: 'text/html' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = response.fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
  return response;
};

export default api; // Export default if needed elsewhere, otherwise named exports are fine