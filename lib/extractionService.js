// lib/extractionService.js
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";
import { formSchema } from '../config/formSchema'; // Ensure formSchema is available if extractWithRules needs it

// --- Rule-Based Extraction (Keep Existing Implementation) ---

// Helper function to safely get nested properties (Consider moving to utils.js later)
const get = (obj, path, defaultValue = null) => {
  if (typeof path !== 'string' || obj === null || obj === undefined) return defaultValue;
  const keys = path.split('.');
  let result = obj;
  for (const key of keys) {
    if (typeof result !== 'object' || result === null || !(key in result)) return defaultValue;
    result = result[key];
    if (result === null || result === undefined) {
        if (key === keys[keys.length - 1]) break;
        else return defaultValue;
    }
  }
  return result === undefined ? defaultValue : result;
};

// Helper function to parse potential numeric values (Consider moving to utils.js later)
const parseNumeric = (value) => {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const cleanedValue = value.replace(/[$,\s]/g, '').trim();
    if (cleanedValue === '') return null;
    let num = parseFloat(cleanedValue);
    if (isNaN(num)) return null;
    const multiplierMatch = value.trim().match(/([mk])$/i);
    if (multiplierMatch) {
      const multiplier = multiplierMatch[1].toLowerCase();
      if (multiplier === 'm') num *= 1000000;
      if (multiplier === 'k') num *= 1000;
    }
    return num;
  }
  return null;
};

// Simple rule-based extraction (Example - Adapt based on actual rules needed)
export function extractWithRules(structuredData, transcripts, schema) {
  console.log("[extractWithRules] Starting rule-based extraction...");
  const results = {};

  // Example Rule 1: Direct mapping for 'legal_name' if present at top level
  const legalName = get(structuredData, 'legal_name') || get(structuredData, 'company_info.name');
  if (legalName && schema.legal_name?.validation(legalName)) {
    results.legal_name = legalName;
    console.log(`[extractWithRules] Found legal_name: ${legalName}`);
  }

  // Example Rule 2: Direct mapping for 'fein' if present and valid format
  const fein = get(structuredData, 'tax_info.fein') || get(structuredData, 'fein');
  if (fein && schema.fein?.validation(fein)) {
      results.fein = fein;
      console.log(`[extractWithRules] Found FEIN: ${fein}`);
  }

   // Example Rule 3: Direct mapping for 'contact_email'
   const email = get(structuredData, 'contact_info.email') || get(structuredData, 'primary_contact.email') || get(structuredData, 'contact_email');
   if (email && schema.contact_email?.validation(email)) {
       results.contact_email = email;
       console.log(`[extractWithRules] Found contact_email: ${email}`);
   }

   // Add more rules here based on common patterns in your structured_data
   // e.g., trying specific paths for address, revenue, etc.

  console.log("[extractWithRules] Finished. Results:", results);
  return results;
}


// --- LLM Extraction using Function Calling ---

/**
 * Dynamically creates the tools definition for Gemini based on the fields needing extraction.
 */
function createExtractionTools(schemaForLLM) {
    const properties = {};
    Object.entries(schemaForLLM).forEach(([key, config]) => {
        properties[key] = {
            type: SchemaType.STRING, // Always request string from LLM
            description: `The extracted value for "${config.label}". Extract as accurately as possible from the context.`
        };
    });

    return [
        {
            functionDeclarations: [
                {
                    name: "populateFormFields",
                    description: "Populates the form fields based on the provided context. Only include fields for which a value was confidently extracted.",
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: properties,
                        // No required fields - LLM should only provide what it finds
                    }
                }
            ]
        }
    ];
}


/**
 * Extracts remaining form data using LLM (Gemini Function Calling Implementation).
 */
export async function extractWithLLM(structuredData, transcripts, remainingSchema) {
  const fieldsToRequest = Object.keys(remainingSchema);
  if (fieldsToRequest.length === 0) {
      console.log('[extractWithLLM] No fields remaining for LLM extraction.');
      return {}; // Nothing to do
  }

  console.log('[extractWithLLM] Starting Gemini Function Calling extraction for fields:', fieldsToRequest.join(', '));

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
      console.error("[extractWithLLM] Gemini API key not found.");
      return {}; // Return empty, let validation handle missing required fields later
  }

  // --- Prepare Input for LLM ---

  // 1. Create tools dynamically based on remainingSchema
  const tools = createExtractionTools(remainingSchema);

  // 2. Format context data (be concise)
   const contextSummary = `
Context for Data Extraction:
Structured Info Snippet: ${JSON.stringify(structuredData)?.substring(0, 1500) + (JSON.stringify(structuredData)?.length > 1500 ? '...' : '')}
Transcripts Summary: ${(transcripts || []).join(' \n ').substring(0, 3000) + ((transcripts || []).join(' \n ').length > 3000 ? '...' : '')}
`;

  // 3. Construct the prompt instructing the LLM to use the function
  const prompt = `
You are an AI assistant specialized in extracting structured information from business context (structured info, transcripts) to fill form fields.
Your goal is to extract values for as many requested fields as possible based *only* on the provided context.

${contextSummary}

**Instructions:**
1.  Carefully read the Context.
2.  Identify the values for the fields defined in the 'populateFormFields' function's parameters.
3.  Call the 'populateFormFields' function, providing arguments *only* for the fields where you could confidently determine a value from the context.
4.  If you cannot find a value for a field, DO NOT include it in the function call arguments.
5.  Prioritize accuracy. If a value seems ambiguous or uncertain in the context, do not include it.
6.  Format extracted values as strings (e.g., numbers as "500000", booleans as "true" or "false").
7.  Do not add any conversational text or explanation; only call the function if you have data to populate. If no fields can be extracted, do not call the function.
`;

  // --- Call Gemini API ---
  console.log("[extractWithLLM] Initializing Gemini client for extraction...");
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest", // Ensure model supports function calling
      tools: tools // Pass the dynamically generated tools
  });

  try {
      const generationConfig = {
          temperature: 0.2, // Low temperature for factual extraction
          // No responseMimeType needed for function calling
      };
      const safetySettings = [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ];

      console.log("[extractWithLLM] Sending prompt to Gemini for function calling extraction...");

      // Use chat interface for function calling
      const chat = model.startChat({
         // History can be empty or include context if structured differently
         // history: [{ role: "user", parts: [{ text: contextSummary }] }], // Option 1
         generationConfig,
         safetySettings,
      });

      // Send the main prompt
      const result = await chat.sendMessage(prompt); // Option 2: Send prompt here
      const response = result.response;
      const candidate = response?.candidates?.[0];

       console.log("[extractWithLLM] Raw Gemini Response:", JSON.stringify(response, null, 2));

      if (!candidate || !candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
            const finishReason = candidate?.finishReason;
            console.warn(`[extractWithLLM] No valid response/function call. Finish reason: ${finishReason}`);
            // It's okay if the LLM doesn't call the function if it finds nothing.
            // Only throw error for critical issues like SAFETY.
            if (finishReason === 'SAFETY') {
                 throw new Error("AI extraction stopped due to safety settings.");
            }
            return {}; // Return empty if no function call or stopped normally
      }

      // Check for the function call part
      const functionCallPart = candidate.content.parts.find(part => part.functionCall);

      if (functionCallPart && functionCallPart.functionCall?.name === 'populateFormFields') {
          const args = functionCallPart.functionCall.args;
          console.log("[extractWithLLM] Received 'populateFormFields' function call with args:", args);
          // Return the arguments object containing the extracted field-value pairs (as strings)
          // Validation will happen in the API route
          return args || {};
      } else {
          // No function call was made, or a different function was called (unexpected)
          console.log("[extractWithLLM] No 'populateFormFields' function call was made by the LLM.");
          return {}; // Return empty object
      }

  } catch (error) {
      console.error("[extractWithLLM] Error during Gemini call or processing:", error);
       const errorMessage = error.message.includes("safety settings")
            ? "Extraction stopped due to safety concerns."
            : `Error during AI data extraction.`;
       // Optionally re-throw or handle more gracefully depending on desired app behavior
       // For now, return empty object and let subsequent validation catch missing required fields
       return {};
  }
}