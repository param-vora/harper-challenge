import axios from 'axios';

const api = axios.create({
  baseURL: '',
  timeout: 20000, // Extended timeout for voice processing
  headers: {
    'Content-Type': 'application/json',
  },
});

// Handle API errors
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    throw error.response?.data || { error: error.message };
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
  if (!audioBlob) {
    console.warn('No audio blob provided, using fallback mode');
    return api.post('/api/process-voice', {});
  }

  try {
    // Create FormData to send the audio blob
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    // Custom axios call with multipart/form-data header
    const response = await axios.post('/api/process-voice', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 30000, // Extended timeout for audio processing
    });

    return response.data;
  } catch (error) {
    console.error('Voice processing error:', error);
    throw error.response?.data || { error: error.message };
  }
};

// PDF generation API call
export const generatePdf = async (formData) => {
  const response = await api.post('/api/generate-pdf', formData);
  
  // If we got HTML content back, create and download the file
  if (response.htmlContent && response.fileName) {
    // Create a Blob from the HTML content
    const blob = new Blob([response.htmlContent], { type: 'text/html' });
    
    // Create a download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = response.fileName;
    
    // Append to the document, click it, and clean up
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
  
  return response;
};

export default api;
