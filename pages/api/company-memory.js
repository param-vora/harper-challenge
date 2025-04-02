// pages/api/company-memory.js
import axios from 'axios';

// Helper to combine address parts safely
function combineAddress(companyData) {
    const parts = [
        companyData?.company_street_address_1,
        companyData?.company_street_address_2,
        companyData?.company_city,
        companyData?.company_state,
        companyData?.company_postal_code
    ];
    // Filter out empty/null parts and join
    const validParts = parts.filter(part => part && typeof part === 'string' && part.trim() !== '');
    // Add zip logic if needed - sometimes state includes zip
    // Basic join for now
    return validParts.join(', ');
}


export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { companyId } = req.query;
  if (!companyId) {
    return res.status(400).json({ error: "Company ID is required" });
  }

  const apiUrl = process.env.RETOOL_MEMORY_URL;
  const apiKey = process.env.RETOOL_API_KEY_MEMORY;

  if (!apiUrl || !apiKey) {
    console.error("[API/CompanyMemory] Missing Retool URL or API Key.");
    return res.status(500).json({ error: "Server configuration error." });
  }

  try {
    console.log(`[API/CompanyMemory] Fetching memory for company ${companyId} from Retool...`);
    const headers = { 'Content-Type': 'application/json', 'X-Workflow-Api-Key': apiKey };
    const requestBody = { company_id: companyId }; // Use original ID format

    const response = await axios.post(apiUrl, requestBody, { headers });
    const companyJson = response.data?.company?.json;

    if (!companyJson) {
        console.warn(`[API/CompanyMemory] No company.json data found for company ${companyId}.`);
        return res.status(200).json({ structured_data: {}, unstructured_transcripts: [] });
    }

    const companyData = companyJson.company || {};
    const contacts = companyJson.contacts || [];
    const facts = companyJson.facts || [];

    // Get primary contact details (assuming first contact is primary)
    const primaryContact = contacts.length > 0 ? contacts[0] : {};

    // Prepare structured_data - Map directly from Retool structured fields
    // Align keys with formSchema.js keys
    const structured_data = {
        // Policy Info (Not usually here, needs manual entry or different source)
        policy_eff_date: null,
        policy_exp_date: null,

        // Applicant Info
        legal_name: companyData.company_name || null,
        applicant_address: combineAddress(companyData), // Combine address parts
        business_phone: companyData.company_primary_phone || primaryContact.contact_primary_phone || null, // Use company phone first, then contact
        applicant_entity_type: companyData.company_legal_entity_type || null, // Get direct if available
        fein: companyData.fein || null, // Check if FEIN exists directly
        sic: companyData.company_sic_code || null, // Get direct if available
        naics: companyData.company_naics_code || null, // Get direct if available

        // Contact Info
        contact_name: primaryContact.contact_first_name && primaryContact.contact_last_name
                      ? `${primaryContact.contact_first_name} ${primaryContact.contact_last_name}`
                      : (primaryContact.contact_first_name || primaryContact.contact_last_name || null), // Combine name parts
        contact_email: companyData.company_primary_email || primaryContact.contact_primary_email || null, // Use company email first
        contact_phone: primaryContact.contact_primary_phone || companyData.company_primary_phone || null, // Use contact phone first

        // Premises Info (Assuming same as applicant for now)
        premise_address: combineAddress(companyData), // Default to applicant address
        city_limits: null, // Typically not structured, needs LLM/Rules

        // Business Details
        annual_revenue: companyData.company_annual_revenue_usd || null, // Keep as string/null
        nature_of_business: companyData.company_industry || companyData.company_sub_industry || null, // Use industry first
        business_description: companyData.company_description || null,
    };

    // Prepare unstructured_transcripts from facts' content
    const unstructured_transcripts = facts
        .map(fact => fact?.content)
        .filter(content => typeof content === 'string' && content.trim() !== '');

    // Log the structured data prepared *before* sending to extract-data
    console.log(`[API/CompanyMemory] Prepared structured_data for company ${companyId}:`, JSON.stringify(structured_data, null, 2));

    const result = {
        structured_data: structured_data,
        unstructured_transcripts: unstructured_transcripts
    };

    console.log(`[API/CompanyMemory] Successfully processed memory for company ${companyId}.`);
    return res.status(200).json(result);

  } catch (error) {
    console.error(`[API/CompanyMemory] Error processing memory for company ${companyId}:`, error.response?.data || error.message);
    const status = error.response?.status || 500;
     if (status === 404) {
         console.warn(`[API/CompanyMemory] Retool returned 404 for company ${companyId}.`);
         return res.status(200).json({ structured_data: {}, unstructured_transcripts: [] });
     }
    return res.status(status).json({ error: "Failed to fetch or process company memory." });
  }
}