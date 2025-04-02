// pages/api/generate-pdf.js
import Anvil from '@anvilco/anvil';
import { getAuth } from '@clerk/nextjs/server';
import { AGENCY_INFO } from '../../config/formSchema'; // Import hardcoded agency info

// --- Parsing/Formatting Helpers (Keep from previous version) ---
function parseAddressToAnvil(fullAddress) {
    const result = { street1: '', street2: '', city: '', state: '', zip: '', country: 'US' };
    if (!fullAddress || typeof fullAddress !== 'string') {
        return result;
    }
    const parts = fullAddress.split(',').map(p => p.trim());
    if (parts.length === 0) return result;

    const lastPart = parts[parts.length - 1];
    const zipMatch = lastPart.match(/\b\d{5}(?:-\d{4})?\b$/);
    let statePartInZip = '';

    if (zipMatch) {
        result.zip = zipMatch[0];
        statePartInZip = lastPart.substring(0, zipMatch.index).trim();
        if (statePartInZip.length > 0 && /^[A-Za-z\s]+$/.test(statePartInZip)) { // Check if it looks like a state name/code
            result.state = statePartInZip;
            parts.pop();
        } else {
             parts[parts.length - 1] = parts[parts.length - 1].replace(result.zip, '').trim();
             if(parts[parts.length - 1] === '') parts.pop();
        }
    }

     if (!result.state && parts.length > 1) {
        const potentialStatePart = parts[parts.length - 1];
         if (/^[A-Za-z]{2}$/.test(potentialStatePart) || (potentialStatePart.length > 3 && potentialStatePart.length < 25)) {
             result.state = potentialStatePart;
             parts.pop();
         }
     }

    if (parts.length > 0) {
        result.city = parts.pop();
    }

    result.street1 = parts.join(', ');
    const street2Match = result.street1.match(/(.*?)\s+(#|apt|suite|ste|unit)\s*(.*)/i);
    if (street2Match) {
        result.street1 = street2Match[1].trim();
        result.street2 = `${street2Match[2]} ${street2Match[3]}`.trim();
    }

    for (const key in result) {
       if (result[key] === '') delete result[key];
    }
     if (result.street1) result.street1 = result.street1.replace(/,$/, '').trim();

    console.log(`[parseAddressToAnvil] Parsed "${fullAddress}" to:`, result);
    return Object.keys(result).length > 1 ? result : undefined;
}

function parseFullNameToAnvil(fullName) {
     const result = { firstName: '', lastName: '' };
     if (!fullName || typeof fullName !== 'string') {
        return result;
    }
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
        result.firstName = parts[0];
    } else if (parts.length > 1) {
        result.lastName = parts.pop();
        result.firstName = parts.join(' ');
    }
    return result;
}

function formatPhoneToAnvil(phone) {
    if (!phone || typeof phone !== 'string') return undefined;
    const digits = phone.replace(/\D/g, '');
    return digits ? { num: digits } : undefined;
}
// --- End Helpers ---


export default async function handler(req, res) {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const anvilApiKey = process.env.ANVIL_API_KEY;
  const castEid = '4ya1i67hf2irfjdI0t2b'; // Confirmed Template ID

  if (!anvilApiKey) {
    console.error('Anvil API Key missing.');
    return res.status(500).json({ error: 'PDF generation service not configured.' });
  }

  try {
    const formData = req.body; // Data received from frontend

    // Data Transformation and Mapping based on confirmed Anvil slugs
    const applicantAddressParsed = parseAddressToAnvil(formData.applicant_address);
    const premiseAddressParsed = parseAddressToAnvil(formData.premise_address);
    const legalNameParsed = parseFullNameToAnvil(formData.legal_name);
    const businessPhoneFormatted = formatPhoneToAnvil(formData.business_phone);
    const contactPhoneFormatted = formatPhoneToAnvil(formData.contact_phone);

    const effectiveDate = formData.policy_eff_date || '2025-04-01';
    const expirationDate = formData.policy_exp_date || '2026-04-01';
    const natureOfBusinessValue = formData.nature_of_business || 'Other';

    // Map form data to Anvil slugs
    const anvilPayloadData = {
        // --- Agency Info (Hardcoded) ---
        agency: `${AGENCY_INFO.name}\n${AGENCY_INFO.address}`,

        // --- Standard Info ---
        date: new Date().toISOString().split('T')[0],
        transactionStatus: "Quote",

        // --- Policy Info ---
        proposedEffectiveDate: effectiveDate,
        proposedExpirationDate: expirationDate,
        // proposedEffectiveDate1: effectiveDate, // Assuming these duplicates are not needed unless confirmed
        // proposedExpirationDate1: expirationDate,

        // --- Applicant Info (Page 1) ---
        applicantName: legalNameParsed,
        mailingAddress: applicantAddressParsed,
        businessPhone: businessPhoneFormatted,
        applicantBusinessType: formData.applicant_entity_type,
        feinOrSocSec: formData.fein,
        sic: formData.sic,
        naics: formData.naics,

        // --- Contact Info (Page 2) ---
        phoneACNoExt: contactPhoneFormatted, // Maps contact_phone
        // Add email if slug confirmed: emailSlug: formData.contact_email
        // Add name if slug confirmed: contactNameSlug: contactNameParsed

        // --- Premises Info (Page 2 - First Location) ---
        street: premiseAddressParsed, // Maps premise_address
        insideCityLimits: formData.city_limits === 'Inside' || undefined,
        outsideCityLimits: formData.city_limits === 'Outside' || undefined,
        annualRevenues: formData.annual_revenue !== null ? Number(formData.annual_revenue) : undefined,
        // Add other premise fields if slugs are known (e.g., fullTimeEmployees)

        // --- Nature of Business (Page 2) ---
        natureOfBusiness: natureOfBusinessValue,
        descriptionOfPrimaryOperations: formData.business_description,
    };

    // Clean up payload: remove null/undefined/empty strings/empty objects
    for (const key in anvilPayloadData) {
      const value = anvilPayloadData[key];
      if (value === null || value === undefined || value === '') {
        delete anvilPayloadData[key];
      } else if (typeof value === 'object' && Object.keys(value).length === 0) {
         delete anvilPayloadData[key];
      } else if (typeof value === 'object' && value !== null) {
           for (const subKey in value) {
                if (value[subKey] === null || value[subKey] === undefined || value[subKey] === '') {
                   delete value[subKey];
                 }
           }
            if (Object.keys(value).length === 0) {
                delete anvilPayloadData[key];
            }
      }
    }

    // Final Anvil payload structure
    const payload = {
        // title: `${formData.legal_name || 'applicant'}_ACORD125`, // Optional
        // fontSize: 10, // Optional
        // textColor: '#000000', // Optional
        data: anvilPayloadData
     };

    console.log('Generating PDF with Anvil payload:', JSON.stringify(payload, null, 2));

    const anvilClient = new Anvil({ apiKey: anvilApiKey });

    // ***** CORRECTED METHOD CALL *****
    const { statusCode, data, errors } = await anvilClient.fillPDF(castEid, payload);
    // ***** END CORRECTION *****


    if (statusCode !== 200 || !data || errors) {
        console.error('Anvil PDF generation error:', errors || `Status code: ${statusCode}`);
        console.error('Payload sent:', JSON.stringify(payload, null, 2));
        throw new Error(`Failed to generate PDF from Anvil. Status: ${statusCode}`);
    }

    // data should contain the PDF buffer when using fillPDF
    const pdfBuffer = Buffer.from(data);

    // Set headers for PDF download
    const filename = `${formData.legal_name || 'applicant'}_ACORD125.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    console.log(`Successfully generated PDF: ${filename}`);
    return res.status(200).send(pdfBuffer);

  } catch (error) {
    console.error('Error in /api/generate-pdf:', error);
    return res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  }
}