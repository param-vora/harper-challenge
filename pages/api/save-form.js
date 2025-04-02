// pages/api/save-form.js
import { getAuth } from '@clerk/nextjs/server';
import { formSchema } from '../../config/formSchema';
import { validateFormData } from '../../lib/validationService';

// --- In-Memory Mock Database ---
// IMPORTANT: This data resets when the server restarts!
const mockDatabase = {};
// Structure: mockDatabase[clerkUserId][companyId] = { formData: {}, updatedAt: Date }
// -----------------------------

export default async function handler(req, res) {
  // Use Clerk user ID directly as the key for the mock DB
  const { userId: clerkUserId } = getAuth(req);

  if (!clerkUserId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { companyId, formData } = req.body;

    if (!companyId || !formData) {
      return res.status(400).json({ error: "Missing companyId or formData" });
    }

    // **1. Validate the received formData** (Keep validation)
    const completeFormDataForValidation = {};
     Object.keys(formSchema).forEach(key => {
        completeFormDataForValidation[key] = formData.hasOwnProperty(key) ? formData[key] : (formSchema[key].type === 'checkbox' ? false : null);
     });
    const { isValid, errors } = validateFormData(completeFormDataForValidation, formSchema);

    if (!isValid) {
      console.warn(`[API/SaveForm - MOCK] Validation failed for user ${clerkUserId}, company ${companyId}. Errors:`, errors);
      return res.status(400).json({ error: "Invalid form data provided.", details: errors });
    }
    console.log(`[API/SaveForm - MOCK] Validation passed for user ${clerkUserId}, company ${companyId}.`);

    // **2. Update In-Memory Store**
    // Ensure user entry exists
    if (!mockDatabase[clerkUserId]) {
        mockDatabase[clerkUserId] = {};
    }

    // Store the data
    mockDatabase[clerkUserId][companyId] = {
        formData: formData,
        updatedAt: new Date()
    };

    console.log(`[API/SaveForm - MOCK] Successfully saved form data for user ${clerkUserId}, company ${companyId}`);
    // console.log("Current Mock DB State:", JSON.stringify(mockDatabase, null, 2)); // Optional: Log state for debugging

    // Simulate successful save response
    return res.status(200).json({
        success: true,
        message: "Form data saved (Mock).",
        // Mimic structure of Supabase response if needed by frontend later
        savedData: {
            user_id: clerkUserId,
            company_id: companyId,
            form_data: formData,
            updated_at: mockDatabase[clerkUserId][companyId].updatedAt,
            // id: 'mock-id-' + Math.random(), // Mock ID if needed
            // created_at: mockDatabase[clerkUserId][companyId].createdAt || new Date() // Mock created_at
        }
    });

  } catch (error) {
    console.error(`[API/SaveForm - MOCK] Unexpected error for user ${clerkUserId}:`, error);
    return res.status(500).json({ error: "An unexpected error occurred while saving mock form data." });
  }
}