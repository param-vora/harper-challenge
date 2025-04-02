// pages/api/load-form.js
import { getAuth } from '@clerk/nextjs/server';

// Assuming mockDatabase is imported correctly (even if empty initially)
import { mockDatabase } from './save-form'; // Check this import path

export default async function handler(req, res) {
  const { userId: clerkUserId } = getAuth(req);

  if (!clerkUserId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { companyId } = req.query;

  if (!companyId) {
    return res.status(400).json({ error: "Missing companyId parameter" });
  }

  try {
    console.log(`[API/LoadForm - MOCK] Attempting to load data for user ${clerkUserId}, company ${companyId}`);

    // **1. Look up in In-Memory Store (Safely)**
    // Check if mockDatabase itself and the user entry exist
    const userData = mockDatabase && mockDatabase[clerkUserId] ? mockDatabase[clerkUserId] : null;
    const companyData = userData ? userData[companyId] : null; // Now userData check happens first

    if (companyData && companyData.formData) {
      console.log(`[API/LoadForm - MOCK] Found mock saved data from ${companyData.updatedAt || 'unknown time'} for user ${clerkUserId}, company ${companyId}`);
      return res.status(200).json(companyData.formData);
    } else {
      console.log(`[API/LoadForm - MOCK] No mock saved data found for user ${clerkUserId}, company ${companyId}`);
      return res.status(200).json(null);
    }

  } catch (error) {
    // Log the specific error object
    console.error(`[API/LoadForm - MOCK] Unexpected error for user ${clerkUserId}, company ${companyId}:`, error);
    // Avoid exposing detailed error messages potentially
    return res.status(500).json({ error: "An unexpected error occurred while loading mock form data." });
  }
}