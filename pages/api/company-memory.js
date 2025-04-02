// pages/api/company-memory.js
import { getAuth } from '@clerk/nextjs/server';
// Import createClient directly, similar to api/companies.js
import { createClient } from '@supabase/supabase-js'; 

export default async function handler(req, res) {
  // Get auth details, including the function to get the Supabase token
  const { userId, getToken } = getAuth(req); 
  
  if (!userId) {
    console.error("[API/CompanyMemory] Unauthorized access attempt.");
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== 'GET') {
    console.warn(`[API/CompanyMemory] Method ${req.method} not allowed.`);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { companyId } = req.query;

  if (!companyId) {
    console.error("[API/CompanyMemory] Company ID is required.");
    return res.status(400).json({ error: "Company ID is required" });
  }

  console.log(`[API/CompanyMemory] User ${userId} fetching memory for company ${companyId}...`);

  try {
    // 1. Get the Supabase JWT for the current user
    const supabaseAccessToken = await getToken({ template: 'supabase' });

    if (!supabaseAccessToken) {
        console.error("[API/CompanyMemory] Failed to get Supabase token for user.");
        return res.status(500).json({ error: "Could not authenticate with database service." });
    }

    // 2. Create a new Supabase client IN THIS REQUEST SCOPE, authenticated with the user's token
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Still use Anon key for initialization

     if (!supabaseUrl || !supabaseKey) {
        console.error('[API/CompanyMemory] Missing Supabase URL or Anon Key in environment variables.');
        return res.status(500).json({ error: 'Server configuration error.' });
    }
    
    // Initialize client, passing the JWT in the global headers
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${supabaseAccessToken}`, // Pass the user's JWT
        },
      },
    });

    console.log("[API/CompanyMemory] Created request-scoped Supabase client. Fetching data...");

    // 3. Fetch from Supabase using the authenticated client
    const { data, error } = await supabase
      .from('company_memory') // Ensure table name is correct
      .select('structured_data, unstructured_transcripts') // Select the required columns
      .eq('company_id', companyId) // Filter by company ID
      .maybeSingle(); // Use maybeSingle() to handle 0 or 1 results gracefully

    if (error) {
      // Log the specific Supabase error
      console.error("[API/CompanyMemory] Supabase query error:", error);
       if (error.code === '42501') { // permission denied
           console.error("[API/CompanyMemory] RLS Permission Denied.");
       } else if (error.code === 'PGRST116') { // Not found by .single() - maybeSingle() avoids this being an error
           console.warn(`[API/CompanyMemory] No memory found in Supabase for company ${companyId}`);
       }
      // Return null or an empty object if allowed by RLS but not found, but error for other DB issues
      if (error.code !== 'PGRST116'){ // PGRST116 is not a fatal error when using maybeSingle
         return res.status(500).json({ 
             error: "Failed to fetch company memory from database.", 
             details: error.message 
         });
      }
    }

    // If data is null (not found or RLS prevented access if policy doesn't error)
    if (!data) {
       console.warn(`[API/CompanyMemory] No memory data found or accessible for company ${companyId}. Returning null.`);
       // Return null as per expected behaviour if not found
       return res.status(200).json(null); 
    }
    
    console.log(`[API/CompanyMemory] Successfully fetched memory for company ${companyId} from Supabase.`);
    // Return the data fetched from Supabase
    return res.status(200).json(data); 

    // --- REMOVE THE OLD MOCK DATA FALLBACK ---
    /* 
    // For development purposes, return mock data for each company
    const mockData = { ... }; 
    return res.status(200).json(mockData[companyId] || null); 
    */
   
  } catch (error) {
    // Catch errors from getToken or createClient too
    console.error("[API/CompanyMemory] Unexpected server error:", error);
     if (error.message.includes('template not found')) {
        console.error("[API/CompanyMemory] Clerk Supabase template likely missing or misconfigured in Clerk dashboard.");
     }
    return res.status(500).json({ error: "An unexpected error occurred while fetching company memory." });
  }
}