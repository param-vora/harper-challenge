// pages/api/generate-pdf.js
import Anvil from '@anvilco/anvil';
import { getAuth } from '@clerk/nextjs/server';

// --- Parsing/Formatting Helpers (REVISED) ---
function parseAddressToAnvil(fullAddress) {
  if (!fullAddress || typeof fullAddress !== 'string' || fullAddress.trim().length < 5) {
    console.warn(`[parseAddressToAnvil] Invalid or too short address input: "${fullAddress}"`);
    return undefined;
  }
  const result = { street1: '', street2: '', city: '', state: '', zip: '', country: 'US' };
  const cleanedAddress = fullAddress.replace(/\s+/g, ' ').trim().replace(/,$/, '');
  const parts = cleanedAddress.split(',').map(p => p.trim()).filter(p => p);
  if (parts.length === 0) return undefined;

  // Extract zip code (5 or 9 digits) from last part.
  const lastPart = parts[parts.length - 1];
  const zipMatch = lastPart.match(/\b(\d{5}(?:-\d{4})?)$/);
  if (zipMatch) {
    result.zip = zipMatch[1];
    parts[parts.length - 1] = lastPart.substring(0, zipMatch.index).trim();
    if (parts[parts.length - 1] === '') parts.pop();
  }

  // Extract state (using common abbreviations)
  if (parts.length > 0) {
    const potentialStatePart = parts[parts.length - 1];
    const states = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"];
    const stateRegex = new RegExp(`\\b(${states.join('|')})\\b$`, 'i');
    const stateMatch = potentialStatePart.match(stateRegex);
    if (stateMatch) {
      result.state = stateMatch[1].toUpperCase();
      parts[parts.length - 1] = potentialStatePart.substring(0, stateMatch.index).trim();
      if (parts[parts.length - 1] === '') parts.pop();
    }
  }

  // Extract city (last remaining part)
  if (parts.length > 0) {
    result.city = parts.pop();
  }

  // Combine remaining parts for street address and try to split street2 if applicable.
  if (parts.length > 0) {
    result.street1 = parts.join(', ').trim();
    const street2Keywords = ['#', 'apt', 'suite', 'ste', 'unit', 'fl', 'floor', 'bldg', 'building', 'dept', 'rm', 'room', 'lot'];
    for (const keyword of street2Keywords) {
      const regex = new RegExp(`^(.*?)\\s+(${keyword}[\\.\\s]?\\s*[\\d\\w-#].*)$`, 'i');
      const street2Match = result.street1.match(regex);
      if (street2Match) {
        result.street1 = street2Match[1].trim();
        result.street2 = street2Match[2].trim();
        break;
      }
    }
    if (result.street1 === '') delete result.street1;
    if (result.street2 && !result.street1) {
      result.street1 = result.street2;
      delete result.street2;
    }
  }

  // Cleanup empty values
  for (const key in result) {
    if (result[key] === null || result[key] === undefined || result[key] === '') {
      delete result[key];
    }
  }
  console.log(`[parseAddressToAnvil] Parsed "${fullAddress}" to:`, result);
  return Object.keys(result).length > 1 ? result : undefined;
}

function parseFullNameToAnvil(fullName) {
  const result = { firstName: '', lastName: '' };
  if (!fullName || typeof fullName !== 'string') return undefined;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1 && parts[0]) {
    result.firstName = parts[0];
  } else if (parts.length > 1) {
    const suffixes = ['inc', 'llc', 'ltd', 'corp', 'co', 'group', 'lp', 'llp'];
    const lastWordLower = parts[parts.length - 1].toLowerCase().replace(/[\.,]$/, '');
    if (suffixes.includes(lastWordLower) && parts.length > 2) {
      result.firstName = parts.join(' ');
    } else {
      result.lastName = parts.pop();
      result.firstName = parts.join(' ');
    }
  }
  return result.firstName || result.lastName ? result : undefined;
}

function formatPhoneToAnvil(phone) {
  if (!phone || typeof phone !== 'string') return undefined;
  const digits = phone.replace(/\D/g, '');
  const plausibleDigits = digits.startsWith('1') && digits.length === 11 ? digits.substring(1) : digits;
  return plausibleDigits.length === 10 ? { num: plausibleDigits } : undefined;
}

// --- End Helpers ---

export default async function handler(req, res) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== 'POST') return res.status(405).json({ error: "Method not allowed" });

  const anvilApiKey = process.env.ANVIL_API_KEY;
  const castEid = '4ya1i67hf2irfjdI0t2b';

  if (!anvilApiKey) {
    console.error('[API/GeneratePdf] Anvil API Key missing.');
    return res.status(500).json({ error: 'PDF generation service not configured.' });
  }

  try {
    const formData = req.body;
    console.log("[API/GeneratePdf] Received raw formData:", JSON.stringify(formData, null, 2));

    // --- Internal to Anvil Mapping ---
    // 1. Agency information combined into one string.
    const agencyString = [
      formData.agency_name,
      formData.agency_address,
      formData.agency_phone ? `Phone: ${formData.agency_phone}` : null,
      formData.agency_email ? `Email: ${formData.agency_email}` : null,
      formData.agency_contact_name ? `Contact: ${formData.agency_contact_name}` : null,
    ].filter(Boolean).join('\n');

    // 2. Applicant Name parsed from legal_name.
    const applicantNameParsed = parseFullNameToAnvil(formData.legal_name);

    // 3. Mailing Address parsed from applicant_address.
    const applicantAddressParsed = parseAddressToAnvil(formData.applicant_address);

    // 4. Business Phone parsed from business_phone.
    const businessPhoneFormatted = formatPhoneToAnvil(formData.business_phone);

    // 5. Contact Phone parsed from contact_phone.
    const contactPhoneFormatted = formatPhoneToAnvil(formData.contact_phone);

    // 6. Premise Address parsed from premise_address.
    const premiseAddressParsed = parseAddressToAnvil(formData.premise_address);

    // 7. City limits as booleans.
    const isInsideCityLimits = formData.city_limits === 'Inside';
    const isOutsideCityLimits = formData.city_limits === 'Outside';

    // 8. Annual revenue parsed to a number.
    const annualRevenueValue = (formData.annual_revenue != null && !isNaN(Number(formData.annual_revenue)))
                               ? Number(formData.annual_revenue) : undefined;

    console.log("[API/GeneratePdf] Parsed Values:", {
      agencyString,
      applicantNameParsed,
      applicantAddressParsed,
      businessPhoneFormatted,
      contactPhoneFormatted,
      premiseAddressParsed,
      isInsideCityLimits,
      isOutsideCityLimits,
      annualRevenueValue
    });

    // --- Construct Anvil Payload using only the defined fields ---
    const anvilPayloadData = {
      agency: agencyString,
      date: new Date().toISOString().split('T')[0],
      transactionStatus: "Quote",
      proposedEffectiveDate: formData.policy_eff_date,
      proposedExpirationDate: formData.policy_exp_date,
      applicantName: applicantNameParsed,
      mailingAddress: applicantAddressParsed,
      businessPhone: businessPhoneFormatted,
      applicantBusinessType: formData.applicant_entity_type,
      feinOrSocSec: formData.fein,
      sic: formData.sic,
      naics: formData.naics,
      phoneACNoExt: contactPhoneFormatted,
      street: premiseAddressParsed,
      insideCityLimits: isInsideCityLimits || undefined,
      outsideCityLimits: isOutsideCityLimits || undefined,
      annualRevenues: annualRevenueValue,
      natureOfBusiness: formData.nature_of_business,
      descriptionOfPrimaryOperations: formData.business_description,
    };

    // Clean the payload by removing undefined/null/empty values.
    const cleanPayload = (obj) => {
      if (obj === null || obj === undefined) return undefined;
      if (typeof obj !== 'object') {
        return (String(obj).trim() === '') ? undefined : obj;
      }
      if (Array.isArray(obj)) {
        const cleanedArr = obj.map(cleanPayload).filter(item => item !== undefined);
        return cleanedArr.length > 0 ? cleanedArr : undefined;
      }
      const cleanedObj = {};
      let hasKeys = false;
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const cleanedValue = cleanPayload(obj[key]);
          if (cleanedValue !== undefined) {
            cleanedObj[key] = cleanedValue;
            hasKeys = true;
          }
        }
      }
      return hasKeys ? cleanedObj : undefined;
    };
    const finalCleanedData = cleanPayload(anvilPayloadData);

    const payload = {
      fontSize: 10,
      textColor: '#000000',
      data: finalCleanedData || {}
    };

    console.log('Generating PDF with final clean Anvil payload:', JSON.stringify(payload, null, 2));

    // Check for essential data after cleaning.
    if (!payload.data.applicantName || !payload.data.mailingAddress || !payload.data.proposedEffectiveDate) {
      console.error("[API/GeneratePdf] CRITICAL ERROR: Essential data (Applicant Name, Mailing Address, or Effective Date) is missing AFTER cleaning.");
      return res.status(400).json({
        error: "Essential applicant data is missing.",
        details: "Could not process required fields like Applicant Name, Mailing Address, or Effective Date."
      });
    }

    // --- Call Anvil API ---
    const anvilClient = new Anvil({ apiKey: anvilApiKey });
    const { statusCode, data, errors } = await anvilClient.fillPDF(castEid, payload);

    if (statusCode !== 200 || !data || errors) {
      console.error('Anvil PDF generation error. Status:', statusCode, 'Errors:', errors ? JSON.stringify(errors) : 'N/A');
      const errorMsg = errors ? (errors[0]?.message || JSON.stringify(errors)) : `Anvil API returned status ${statusCode}.`;
      throw new Error(errorMsg);
    }

    const pdfBuffer = Buffer.from(data);
    const filename = `${(applicantNameParsed?.firstName || 'applicant').replace(/\s+/g, '_')}_ACORD125.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    console.log(`Successfully generated PDF: ${filename}`);
    return res.status(200).send(pdfBuffer);

  } catch (error) {
    console.error('Error in /api/generate-pdf handler:', error);
    return res.status(500).json({
      error: 'PDF Generation Failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}
