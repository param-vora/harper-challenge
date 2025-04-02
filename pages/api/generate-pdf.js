import { getAuth } from '@clerk/nextjs/server';
import { validateFormData } from '../../lib/validationService';
import { formSchema } from '../../config/formSchema';

// Function to generate a simple PDF with client-side code
const generateClientSidePdf = (formData) => {
  // Generate base64 encoded PDF content
  // This would be a placeholder for now - in a real implementation, 
  // we would use a library like jsPDF to generate a real PDF
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Company Information - ${formData.legal_name || 'N/A'}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1 { color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        .section { margin: 20px 0; }
        .section h2 { color: #3498db; }
        .field { margin: 10px 0; }
        .label { font-weight: bold; display: inline-block; width: 200px; }
        .value { display: inline-block; }
      </style>
    </head>
    <body>
      <h1>Company Information</h1>
      <div class="section">
        <h2>Basic Information</h2>
        <div class="field">
          <span class="label">Legal Name:</span>
          <span class="value">${formData.legal_name || 'N/A'}</span>
        </div>
        <div class="field">
          <span class="label">Annual Revenue:</span>
          <span class="value">$${formData.annual_revenue?.toLocaleString() || 'N/A'}</span>
        </div>
        <div class="field">
          <span class="label">Number of Vehicles:</span>
          <span class="value">${formData.num_vehicles || 'N/A'}</span>
        </div>
      </div>
      <div class="section">
        <h2>Contact Information</h2>
        <div class="field">
          <span class="label">Email:</span>
          <span class="value">${formData.contact_email || 'N/A'}</span>
        </div>
        <div class="field">
          <span class="label">Address:</span>
          <span class="value">${formData.address || 'N/A'}</span>
        </div>
      </div>
      <div class="section">
        <h2>Business Details</h2>
        <div class="field">
          <span class="label">FEIN:</span>
          <span class="value">${formData.fein || 'N/A'}</span>
        </div>
        <div class="field">
          <span class="label">Business Description:</span>
          <span class="value">${formData.business_description || 'N/A'}</span>
        </div>
      </div>
      <div style="margin-top: 50px; text-align: center; font-size: 0.8em; color: #7f8c8d;">
        Generated on ${new Date().toLocaleDateString()} by Harper AI Challenge
      </div>
    </body>
    </html>
  `;
  
  return {
    htmlContent,
    fileName: `${formData.legal_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'company'}_info.html`
  };
};

export default async function handler(req, res) {
  const { userId } = getAuth(req);
  
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const formData = req.body;
    
    // Validate the form data
    const { isValid, errors } = validateFormData(formData, formSchema);
    
    if (!isValid) {
      return res.status(400).json({ error: "Invalid form data", errors });
    }

    // Generate HTML content for download (simulating PDF generation)
    // In a production app, we would use a proper PDF generation service like Anvil API
    const { htmlContent, fileName } = generateClientSidePdf(formData);

    return res.status(200).json({ 
      success: true, 
      message: "Document generated successfully.", 
      htmlContent,
      fileName
    });
  } catch (error) {
    console.error("Document generation error:", error);
    return res.status(500).json({ error: "Failed to generate document" });
  }
}
