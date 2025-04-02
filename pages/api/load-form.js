// pages/api/load-form.js
import { getAuth } from '@clerk/nextjs/server';

// --- In-Memory Mock Database (referenced from save-form, but separate instance here) ---
// NOTE: For a slightly more robust mock across routes, you might create a
// separate `lib/mockDb.js` module, export `mockDatabase` from there, and import it here
// and in save-form.js. For now, this simple approach might suffice if server restarts often.
// Let's assume the save route populates a conceptual shared store.
// To actually share state reliably between API route invocations without a real DB
// is tricky in serverless environments. This mock is primarily for testing the flow.

// Re-import the conceptual store (or use the same object if possible in the environment)
// This import path assumes you created lib/mockDb.js as suggested above
// import { mockDatabase } from '../../lib/mockDb';
// If not using a separate module, this route won't see data saved by the other route's instance easily!
// Let's proceed assuming a shared conceptual store for the purpose of the mock API logic.

// Temporary Simple Store for Load (will only see data if save happened in *same process*)
import { mockDatabase } from './save-form'; // Directly import from save-form for simple testing (NOT production safe)


// -----------------------------

export default async function handler(req, res) {
  // Use Clerk user ID directly as the key
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

    // **1. Look up in In-Memory Store**
    const userData = mockDatabase[clerkUserId];
    const companyData = userData ? userData[companyId] : null;

    if (companyData && companyData.formData) {
      console.log(`[API/LoadForm - MOCK] Found mock saved data from ${companyData.updatedAt} for user ${clerkUserId}, company ${companyId}`);
      return res.status(200).json(companyData.formData); // Return only the form_data
    } else {
      console.log(`[API/LoadForm - MOCK] No mock saved data found for user ${clerkUserId}, company ${companyId}`);
      return res.status(200).json(null); // Return null explicitly
    }

  } catch (error) {
    console.error(`[API/LoadForm - MOCK] Unexpected error for user ${clerkUserId}, company ${companyId}:`, error);
    return res.status(500).json({ error: "An unexpected error occurred while loading mock form data." });
  }
}