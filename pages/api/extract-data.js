// pages/api/extract-data.js
import { getAuth } from '@clerk/nextjs/server';
// Import the (currently stubbed) extraction functions
import { extractWithRules, extractWithLLM } from '../../lib/extractionService';
import { formSchema } from '../../config/formSchema';

// Helper function to safely get nested properties
const get = (obj, path, defaultValue = null) => {
  // Ensure path is a string and obj exists
  if (typeof path !== 'string' || obj === null || obj === undefined) {
    return defaultValue;
  }
  const keys = path.split('.');
  let result = obj;
  for (const key of keys) {
    // Check if result is an object and has the key
    if (typeof result !== 'object' || result === null || !(key in result)) {
      return defaultValue;
    }
    result = result[key];
     // Check if intermediate value is null/undefined
    if (result === null || result === undefined) {
        // Check if it's the last key, if so return null/undefined
        if (key === keys[keys.length - 1]) break;
        else return defaultValue; // Intermediate path broken
    }
  }
  // Final check in case the loop didn't run (empty path) or value is explicitly undefined
  return result === undefined ? defaultValue : result;
};

// Helper function to parse potential numeric values (like revenue strings)
const parseNumeric = (value) => {
  if (typeof value === 'number' && !isNaN(value)) return value; // Already a valid number
  if (typeof value === 'string') {
    // Remove symbols like $, commas, spaces within numbers, and trim whitespace
    const cleanedValue = value.replace(/[$,\s]/g, '').trim();
    // Check for empty string after cleaning
    if (cleanedValue === '') return null;

    let num = parseFloat(cleanedValue);
    // Check if parsing resulted in NaN
    if (isNaN(num)) return null;

    // Handle millions (M) or thousands (K) - case insensitive, must be at the end
    const multiplierMatch = value.trim().match(/([mk])$/i); // Match at the very end after trimming
    if (multiplierMatch) {
      const multiplier = multiplierMatch[1].toLowerCase();
      if (multiplier === 'm') num *= 1000000;
      if (multiplier === 'k') num *= 1000;
    }
    return num;
  }
  // Return null if input is not a number or string
  return null;
};


export default async function handler(req, res) {
  const { userId } = getAuth(req);
  if (!userId) {
    console.error("[API/ExtractData] Unauthorized access attempt.");
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== 'POST') {
     console.warn(`[API/ExtractData] Method ${req.method} not allowed.`);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Ensure body parts exist, default to empty objects/arrays if missing
    const { structured_data = {}, unstructured_transcripts = [] } = req.body;

    console.log("[API/ExtractData] Received structured_data:", JSON.stringify(structured_data, null, 2));
    console.log("[API/ExtractData] Received unstructured_transcripts:", unstructured_transcripts);

    // Initialize result object with nulls/defaults based on schema
    const extractedData = {};
    Object.keys(formSchema).forEach(key => {
      // Default checkboxes to false, others to null
      extractedData[key] = formSchema[key].type === 'checkbox' ? false : null;
    });

    // --- SWAP POINT: Call Actual Rule-Based Extraction ---
    // Replace the basic inline logic with a call to our dedicated function
    const rulesResults = extractWithRules(structured_data, unstructured_transcripts, formSchema);
    console.log("[API/ExtractData] Rules Results:", rulesResults);

    // Merge rules results into our main object
    // Use Object.assign carefully, only merge non-null/undefined values from rules
    for (const key in rulesResults) {
        if (rulesResults[key] !== null && rulesResults[key] !== undefined) {
             extractedData[key] = rulesResults[key];
        }
    }


    // --- SWAP POINT: Identify Remaining Fields and Call LLM (Stubbed) ---
    const remainingSchema = {};
    const fieldsToFillByLLM = [];
    Object.entries(formSchema).forEach(([key, config]) => {
        // If the field wasn't adequately filled by rules (is null/empty string/default false for checkbox)
         const currentValue = extractedData[key];
         const isMissing = currentValue === null || currentValue === '' || (config.type === 'checkbox' && currentValue === false);

        if (isMissing) {
            remainingSchema[key] = config; // Keep the original schema config
            fieldsToFillByLLM.push(key);
        }
    });

    let llmResults = {};
    if (fieldsToFillByLLM.length > 0) {
        console.log(`[API/ExtractData] Attempting LLM extraction for fields: ${fieldsToFillByLLM.join(', ')}`);
        // Call the (currently stubbed) LLM extraction function
        // Pass only the schema for fields that still need values
        // Pass current extracted data as context for the LLM
        llmResults = await extractWithLLM(structured_data, unstructured_transcripts, remainingSchema, extractedData);
        console.log("[API/ExtractData] LLM (Stubbed) Results:", llmResults);

        // Merge LLM results, potentially overwriting nulls/defaults from init/rules
        // Again, be careful only to merge actual values returned by the LLM stub/service
         for (const key in llmResults) {
            if (llmResults[key] !== null && llmResults[key] !== undefined && remainingSchema[key]) { // Ensure it was a field we asked for
                 extractedData[key] = llmResults[key];
            }
        }
    } else {
         console.log("[API/ExtractData] No remaining fields needed LLM extraction.");
    }


    // --- Final Cleanup/Formatting (Optional but recommended) ---
    // Ensure final data types match the schema expectations where possible
    Object.keys(extractedData).forEach(key => {
        if (formSchema[key]) { // Check if the key exists in our schema
             const schemaType = formSchema[key].type;
             const currentValue = extractedData[key];

            // Ensure numbers are numbers
            if (schemaType === 'number') {
                 // If not null/undefined, try to parse it; keep null if parsing fails
                 if (currentValue !== null && currentValue !== undefined) {
                     const parsed = parseNumeric(String(currentValue)); // Convert to string first for consistency
                     extractedData[key] = parsed; // Assign null if parsing fails
                 }
            }
            // Ensure booleans are booleans
            else if (schemaType === 'checkbox') {
                 // If not null/undefined, evaluate truthiness robustly
                 if (currentValue !== null && currentValue !== undefined) {
                     const lowerStringValue = String(currentValue).toLowerCase().trim();
                     extractedData[key] = ['true', 'yes', '1', 'on'].includes(lowerStringValue);
                 } else {
                     extractedData[key] = false; // Default to false if null/undefined after all processing
                 }
            }
            // Trim strings (optional)
            else if ( (schemaType === 'text' || schemaType === 'textarea' || schemaType === 'email') && typeof currentValue === 'string') {
                extractedData[key] = currentValue.trim();
                 // Clear empty strings to null if not required? Or keep based on preference.
                 // if (extractedData[key] === '' && !formSchema[key].required) {
                 //     extractedData[key] = null;
                 // }
            }
             // Handle nulling empty strings for non-required fields?
             if (currentValue === '' && !formSchema[key].required) {
                // extractedData[key] = null; // Optional: uncomment if empty strings should become null
             }
        }
    });


    console.log("[API/ExtractData] Final Cleaned Data:", JSON.stringify(extractedData, null, 2));
    return res.status(200).json(extractedData);

  } catch (error) {
    console.error("[API/ExtractData] Extraction error:", error);
    // Log the specific error for better debugging
    if (error instanceof Error) {
        console.error(error.stack);
    }
    return res.status(500).json({ error: "Failed to extract data", details: error.message });
  }
}