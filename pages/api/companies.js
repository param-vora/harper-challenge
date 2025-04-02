// pages/api/companies.js
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiUrl = process.env.RETOOL_COMPANIES_URL;
  const apiKey = process.env.RETOOL_API_KEY_COMPANIES;

  if (!apiUrl || !apiKey) {
    console.error("[API/Companies] Missing Retool URL or API Key in environment variables.");
    return res.status(500).json({ error: "Server configuration error." });
  }

  try {
    console.log("[API/Companies] Handling GET request, fetching companies from Retool via POST...");
    const headers = {
      'Content-Type': 'application/json',
      'X-Workflow-Api-Key': apiKey
    };

    const response = await axios.post(apiUrl, {}, { headers });
    const rawCompanies = response.data;

    if (!Array.isArray(rawCompanies)) {
      console.error("[API/Companies] Retool response is not an array:", rawCompanies);
      throw new Error("Invalid data format received from company service.");
    }

    // --- De-duplication Logic Start ---
    const uniqueCompaniesMap = rawCompanies.reduce((map, company) => {
      // Ensure we have an ID and name before processing
      const id = company.id;
      const name = company.company_name;
      if (id != null && name != null) { // Check for null/undefined IDs/names
         // If this ID hasn't been seen, or if we want to ensure the latest entry is kept
         // (though in this case duplicates seem identical), add/overwrite it in the map.
         map[id] = { id: String(id), name: name }; // Ensure ID is a string for consistency
      } else {
          console.warn(`[API/Companies] Skipping company with missing ID or Name:`, company);
      }
      return map;
    }, {}); // Use an object as a map

    // Convert the map values back into an array
    const uniqueCompanies = Object.values(uniqueCompaniesMap);
    // --- De-duplication Logic End ---


    console.log(`[API/Companies] Successfully fetched and de-duplicated ${uniqueCompanies.length} companies from Retool.`);
    return res.status(200).json(uniqueCompanies); // Return the unique list

  } catch (error) {
    console.error("[API/Companies] Error fetching from Retool:", error.response?.data || error.message);
    const status = error.response?.status || 500;
    return res.status(status).json({ error: "Failed to fetch companies from service." });
  }
}