// pages/api/companies.js
import { getAuth } from '@clerk/nextjs/server';
// Import createClient directly, we won't use the singleton from lib for this
import { createClient } from '@supabase/supabase-js'; 

export default async function handler(req, res) {
  // Get auth details, including the function to get the Supabase token
  const { userId, getToken } = getAuth(req); 
  
  if (!userId) {
    console.error("[API/Companies] Unauthorized access attempt.");
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== 'GET') {
    console.warn(`[API/Companies] Method ${req.method} not allowed.`);
    return res.status(405).json({ error: "Method not allowed" });
  }

  console.log(`[API/Companies] User ${userId} attempting fetch...`);

  try {
    // 1. Get the Supabase JWT for the current user
    const supabaseAccessToken = await getToken({ template: 'supabase' });

    if (!supabaseAccessToken) {
        console.error("[API/Companies] Failed to get Supabase token for user.");
        return res.status(500).json({ error: "Could not authenticate with database service." });
    }

    // 2. Create a new Supabase client IN THIS REQUEST SCOPE, authenticated with the user's token
    // Use environment variables directly here
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Still use Anon key for initialization

     if (!supabaseUrl || !supabaseKey) {
        console.error('[API/Companies] Missing Supabase URL or Anon Key in environment variables.');
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

    console.log("[API/Companies] Created request-scoped Supabase client with user token. Fetching data...");

    // 3. Fetch from Supabase using the authenticated client
    const { data, error, count } = await supabase
      .from('companies') 
      .select('id, name', { count: 'exact' }); 

    if (error) {
      // Log the specific Supabase error
      console.error("[API/Companies] Supabase query error:", error);
      // Check for specific RLS violation error code (though usually it just returns empty data)
       if (error.code === '42501') { // permission denied
           console.error("[API/Companies] RLS Permission Denied.");
       }
      return res.status(500).json({ 
        error: "Failed to fetch companies from database.", 
        details: error.message 
      });
    }

    console.log(`[API/Companies] Supabase query returned count: ${count}, data length: ${data?.length ?? 'null'}`);

    // If data is explicitly null or count is 0, RLS might still be the issue despite the token
    if (data === null || count === 0) {
       console.warn("[API/Companies] No companies found or accessible for the user.");
       // It's possible the table is genuinely empty *or* RLS issue persists
       return res.status(200).json([]); 
    }
    
    console.log(`[API/Companies] Successfully fetched ${data.length} companies from Supabase.`);
    return res.status(200).json(data);

  } catch (error) {
    // Catch errors from getToken or createClient too
    console.error("[API/Companies] Unexpected server error:", error);
     if (error.message.includes('template not found')) {
        console.error("[API/Companies] Clerk Supabase template likely missing or misconfigured in Clerk dashboard.");
     }
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
}