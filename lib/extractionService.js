// lib/extractionService.js
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";
import { formSchema } from '../config/formSchema'; // Ensure this path is correct and imports the refined ACORD 125 schema

// --- Helper Functions (Consider moving to utils.js later) ---

// Helper function to safely get nested properties
const get = (obj, path, defaultValue = null) => {
  if (typeof path !== 'string' || obj === null || obj === undefined) return defaultValue;
  const keys = path.split('.');
  let result = obj;
  for (const key of keys) {
    // Check if result is not null/undefined before trying to access property
    if (typeof result !== 'object' || result === null || !(key in result)) return defaultValue;
    result = result[key];
    // If any intermediate key leads to null/undefined, stop unless it's the last key
    if ((result === null || result === undefined) && key !== keys[keys.length - 1]) {
        return defaultValue;
    }
  }
  // Return defaultValue if the final result is undefined, otherwise return the result
  return result === undefined ? defaultValue : result;
};


// Helper function to parse potential numeric values (improved robustness)
const parseNumeric = (value) => {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    // Basic word-to-number mapping (can be expanded)
    let potentialNumStr = String(value).trim().toLowerCase();
    const numberWords = { 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'zero': 0 };
     if (numberWords[potentialNumStr] !== undefined) {
         potentialNumStr = String(numberWords[potentialNumStr]); // Convert word match to string number
     }

    // Clean and parse
    const cleanedValue = potentialNumStr.replace(/[$,\s]/g, '').trim();
    if (cleanedValue === '') return null;

    let num = parseFloat(cleanedValue);
    if (isNaN(num)) return null;

    // Handle 'k' and 'm' multipliers
    const multiplierMatch = value.trim().match(/([mk])$/i); // Check original value for multiplier
    if (multiplierMatch) {
      const multiplier = multiplierMatch[1].toLowerCase();
      if (multiplier === 'm') num *= 1000000;
      if (multiplier === 'k') num *= 1000;
    }
    return num;
  }
  return null; // Return null if not number or parsable string
};


// --- Rule-Based Extraction ---
// This function attempts to directly map known fields or apply simple rules.
// It's faster and more reliable than LLM for well-defined structured data.
export function extractWithRules(structuredData, transcripts, schema) {
  console.log("[extractWithRules] Starting rule-based extraction...");
  const results = {};

  // --- Direct Mappings from structuredData (based on /api/company-memory output) ---

  // Example: Legal Name
  const legalName = get(structuredData, 'legal_name');
  if (legalName && schema.legal_name?.validation(legalName)) {
    results.legal_name = legalName;
    console.log(`[extractWithRules] Found legal_name via direct map: ${legalName}`);
  }

  // Example: Contact Email
  const email = get(structuredData, 'contact_email');
  if (email && schema.contact_email?.validation(email)) {
      results.contact_email = email;
      console.log(`[extractWithRules] Found contact_email via direct map: ${email}`);
  }

  // Example: Applicant Address (as combined string)
  const address = get(structuredData, 'applicant_address');
   if (address && schema.applicant_address?.validation(address)) {
       results.applicant_address = address;
       console.log(`[extractWithRules] Found applicant_address via direct map: ${address}`);
   }
   // If premise address is different and needed, map it too
   const premiseAddress = get(structuredData, 'premise_address');
    if (premiseAddress && schema.premise_address?.validation(premiseAddress)) {
        results.premise_address = premiseAddress;
        console.log(`[extractWithRules] Found premise_address via direct map: ${premiseAddress}`);
    } else if(results.applicant_address) {
        // Default premise address to applicant address if not found separately
        results.premise_address = results.applicant_address;
    }

  // Example: Annual Revenue (needs parsing/validation)
  const revenueStr = get(structuredData, 'annual_revenue');
  if (revenueStr !== null && revenueStr !== undefined) {
      const revenueNum = parseNumeric(revenueStr);
      if (revenueNum !== null && schema.annual_revenue?.validation(revenueNum)) {
          results.annual_revenue = revenueNum;
          console.log(`[extractWithRules] Found and parsed annual_revenue via direct map: ${revenueNum}`);
      }
  }

   // Example: SIC / NAICS
   const sic = get(structuredData, 'sic');
   if (sic && schema.sic?.validation(String(sic).trim())) { // Validate as string
       results.sic = String(sic).trim();
       console.log(`[extractWithRules] Found sic via direct map: ${results.sic}`);
   }
   const naics = get(structuredData, 'naics');
   if (naics && schema.naics?.validation(String(naics).trim())) { // Validate as string
       results.naics = String(naics).trim();
       console.log(`[extractWithRules] Found naics via direct map: ${results.naics}`);
   }

    // Example: Contact Name
    const contactName = get(structuredData, 'contact_name');
    if (contactName && schema.contact_name?.validation(contactName)) {
        results.contact_name = contactName;
        console.log(`[extractWithRules] Found contact_name via direct map: ${contactName}`);
    }

    // Example: Contact Phone
    const contactPhone = get(structuredData, 'contact_phone');
    if (contactPhone && schema.contact_phone?.validation(contactPhone)) {
        results.contact_phone = contactPhone;
        console.log(`[extractWithRules] Found contact_phone via direct map: ${contactPhone}`);
    }

    // Example: Business Phone
    const businessPhone = get(structuredData, 'business_phone');
    if (businessPhone && schema.business_phone?.validation(businessPhone)) {
        results.business_phone = businessPhone;
        console.log(`[extractWithRules] Found business_phone via direct map: ${businessPhone}`);
    }

   // --- Rule applied to unstructured_transcripts ---

   // Example Rule: Find FEIN using Regex in transcripts (if not found directly)
   if (!results.fein) { // Only run if not found directly
       const feinRegex = /(\d{2}-\d{7})/;
       for (const transcript of transcripts) {
           const match = transcript.match(feinRegex);
           if (match && match[1] && schema.fein?.validation(match[1])) {
               results.fein = match[1];
               console.log(`[extractWithRules] Found FEIN via regex in transcripts: ${results.fein}`);
               break; // Stop after first valid match
           }
       }
   }

   // Add more rules here if specific patterns are common in transcripts
   // e.g., looking for "Entity Type: LLC", "Nature of Business: Contractor"

  console.log("[extractWithRules] Finished. Results:", results);
  return results;
}


// --- LLM Extraction using Function Calling ---

/**
 * Dynamically creates the tools definition for Gemini based on the fields needing extraction.
 * ENHANCED: Use field labels and types for better descriptions.
 */
function createExtractionTools(schemaForLLM) {
    const properties = {};
    Object.entries(schemaForLLM).forEach(([key, config]) => {
        let description = `Extract the value for "${config.label}". `;
        if (config.type === 'select' && config.options) {
            const allowedValues = config.options.map(opt => opt.value || opt.label).join(', ');
            description += `The value should ideally be one of: ${allowedValues}. Extract the term used in the text that best matches one of these options.`;
        } else if (config.type === 'date') {
            description += `Format as YYYY-MM-DD.`;
        } else if (key === 'fein') { // Using schema key for specificity
            description += `Format must be XX-XXXXXXX.`;
        } else if (config.type === 'number') {
             description += `Extract the numerical value. Can be digits or words (e.g., "1 million", "50k").`;
        } else if (config.type === 'email') {
            description += `Extract the email address.`;
        } else {
            description += `Extract the relevant text or value accurately from the context.`;
        }

        properties[key] = {
            type: SchemaType.STRING, // Always request string from LLM initially
            description: description
        };
    });

    return [
        {
            functionDeclarations: [
                {
                    name: "populateFormFields",
                    description: "Populates form fields based *only* on information confidently extracted from the provided context (structured info and facts/transcripts).",
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: properties,
                        // No 'required' array - LLM should only provide what it finds confidently.
                    }
                }
            ]
        }
    ];
}


/**
 * Extracts remaining form data using LLM (Gemini Function Calling Implementation).
 * ENHANCED: Improved prompt and context handling.
 */
export async function extractWithLLM(structuredData, transcripts, remainingSchema) {
  const fieldsToRequest = Object.keys(remainingSchema);
  if (fieldsToRequest.length === 0) {
      console.log('[extractWithLLM] No fields remaining for LLM extraction.');
      return {};
  }

  console.log('[extractWithLLM] Starting Gemini Function Calling extraction for fields:', fieldsToRequest.join(', '));

  const geminiApiKey = process.env.GEMINI_API_KEY; // Make sure this is set in .env.local
  if (!geminiApiKey) {
      console.error("[extractWithLLM] Gemini API key not found in environment variables.");
      // Allow graceful failure - validation downstream will catch missing required fields
      return {};
  }

  // --- Prepare Input for LLM ---
  const tools = createExtractionTools(remainingSchema); // Use enhanced tool descriptions

  // Context: Provide reasonably complete transcripts/facts if token limits allow.
  const transcriptSummary = (transcripts || []).join(' \n ').substring(0, 4000); // Limit context size
  const structuredDataSnippet = JSON.stringify(structuredData)?.substring(0, 1000); // Keep snippet concise

  const context = `
Context for Data Extraction:
Structured Information Known So Far:
${structuredDataSnippet}${JSON.stringify(structuredData)?.length > 1000 ? '...' : ''}

Facts & Transcripts (Unstructured Context):
${transcriptSummary}${ (transcripts || []).join(' \n ').length > 4000 ? '...' : ''}
`;

  // ENHANCED Prompt: More specific instructions
  const prompt = `
You are an AI assistant specialized in accurately extracting specific data points from business context (structured info, facts, transcripts) to populate form fields.
Your goal is to populate the parameters of the 'populateFormFields' function.

${context}

**Instructions:**
1.  Review the Structured Information and Facts/Transcripts carefully.
2.  Identify values for the fields defined in the 'populateFormFields' function's parameters. Refer to the parameter descriptions for expected formats or types (e.g., FEIN format, Entity Type options).
3.  Call the 'populateFormFields' function, providing arguments *only* for fields where you found a value with HIGH CONFIDENCE directly stated or clearly implied in the context.
4.  **CRITICAL: Do NOT guess or infer values.** If you are uncertain about a field's value based *only* on the provided context, DO NOT include it in the function call. Accuracy is paramount.
5.  For fields with limited options (like 'Applicant Entity Type' or 'Nature of Business'), extract the term used in the text (e.g., "LLC", "Contractor", "Service") that best matches one of the allowed options mentioned in the parameter description. If no clear match exists in the text, do not provide a value for that field.
6.  Extract values exactly as they appear where possible, especially for text descriptions. Format numbers as strings (e.g., "80000.00"), dates as "YYYY-MM-DD", FEIN as "XX-XXXXXXX".
7.  Only call the function. Do not add conversational text, explanations, or apologies. If no fields can be confidently extracted, do not call the function.
`;

  // --- Call Gemini API ---
  console.log("[extractWithLLM] Initializing Gemini client for extraction...");
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest", // Use a model that supports function calling
      tools: tools
  });

  try {
      const generationConfig = {
          temperature: 0.1, // Low temperature for factual extraction
      };
      // Define safety settings to block potentially harmful content
      const safetySettings = [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ];

      console.log("[extractWithLLM] Sending enhanced prompt to Gemini...");

      // Use chat interface for function calling
      const chat = model.startChat({
         generationConfig,
         safetySettings,
      });

      // Send the main prompt
      const result = await chat.sendMessage(prompt);
      const response = result.response;
      const candidate = response?.candidates?.[0];

      // Log the raw response for debugging
      console.log("[extractWithLLM] Raw Gemini Response:", JSON.stringify(response, null, 2));

      // Check for valid candidate and content parts
      if (!candidate || !candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
            const finishReason = candidate?.finishReason;
            const safetyRatings = candidate?.safetyRatings;
            console.warn(`[extractWithLLM] No valid response/function call. Finish reason: ${finishReason}`, safetyRatings ? `Safety Ratings: ${JSON.stringify(safetyRatings)}` : '');
            // If stopped due to safety, throw an error
            if (finishReason === 'SAFETY') {
                 throw new Error("AI extraction stopped due to safety settings.");
            }
            // Otherwise, it likely found nothing or finished normally without a function call
            return {}; // Return empty if no function call or stopped normally
      }

      // Find the function call part in the response
      const functionCallPart = candidate.content.parts.find(part => part.functionCall);

      // Check if the expected function was called
      if (functionCallPart && functionCallPart.functionCall?.name === 'populateFormFields') {
          const args = functionCallPart.functionCall.args || {};
          console.log("[extractWithLLM] Received 'populateFormFields' function call with args:", args);
          // Return the arguments object. Validation will happen in the API route (/api/extract-data)
          return args;
      } else {
          // Log if no function call was made or a different one was called
          const textPart = candidate.content.parts.find(part => part.text);
          console.log("[extractWithLLM] No 'populateFormFields' function call was made by the LLM.", textPart ? `Text response: ${textPart.text}` : '');
          return {}; // Return empty object
      }

  } catch (error) {
      // Log any errors during the API call or processing
      console.error("[extractWithLLM] Error during Gemini call or processing:", error);
       const errorMessage = error.message?.includes("safety settings")
            ? "Extraction stopped due to safety concerns."
            : `Error during AI data extraction.`;
       // Depending on requirements, could throw the error or return empty
       // Returning empty allows downstream validation to handle missing required fields
       return {};
  }
}