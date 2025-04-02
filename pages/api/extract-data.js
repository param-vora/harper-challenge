// pages/api/extract-data.js
import { getAuth } from '@clerk/nextjs/server';
// Import the extraction functions (now with refactored extractWithLLM)
import { extractWithRules, extractWithLLM } from '../../lib/extractionService';
import { formSchema } from '../../config/formSchema'; // Import the stricter schema

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
    // Basic word-to-number mapping
    let potentialNum = String(value).trim().toLowerCase();
    const numberWords = { 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'zero': 0 };
     if (numberWords[potentialNum] !== undefined) {
         potentialNum = numberWords[potentialNum];
     }
     // Clean and parse
    const cleanedValue = String(potentialNum).replace(/[$,\s]/g, '').trim();
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
    const { structured_data = {}, unstructured_transcripts = [] } = req.body;

    console.log("[API/ExtractData] Received structured_data:", JSON.stringify(structured_data, null, 2));
    console.log("[API/ExtractData] Received unstructured_transcripts:", unstructured_transcripts);

    // Initialize result object with nulls/defaults based on schema
    const extractedData = {};
    Object.keys(formSchema).forEach(key => {
      extractedData[key] = formSchema[key].type === 'checkbox' ? null : null; // Default all to null initially
    });

    // --- Step 1: Rule-Based Extraction ---
    const rulesResults = extractWithRules(structured_data, unstructured_transcripts, formSchema);
    console.log("[API/ExtractData] Rules Results:", rulesResults);

    // Merge valid rules results
    for (const key in rulesResults) {
        if (formSchema[key] && rulesResults[key] !== null && rulesResults[key] !== undefined) {
             // Optional: Validate rule results too? For now, assume rules are trusted if they match schema type loosely.
             // We will validate rigorously after LLM merge.
             extractedData[key] = rulesResults[key];
        }
    }
    console.log("[API/ExtractData] Data after merging rules:", extractedData);

    // --- Step 2: Identify Remaining Fields for LLM ---
    const remainingSchema = {};
    const fieldsToFillByLLM = [];
    Object.entries(formSchema).forEach(([key, config]) => {
        // If the field wasn't filled by rules (is still null or empty string)
        const currentValue = extractedData[key];
        const isMissing = currentValue === null || currentValue === ''; // Check against initial null/empty

        if (isMissing) {
            remainingSchema[key] = config;
            fieldsToFillByLLM.push(key);
        }
    });

    // --- Step 3: LLM Extraction (Function Calling) ---
    let llmResults = {};
    if (fieldsToFillByLLM.length > 0) {
        console.log(`[API/ExtractData] Attempting LLM extraction (FC) for fields: ${fieldsToFillByLLM.join(', ')}`);
        // Call the refactored LLM extraction function
        llmResults = await extractWithLLM(structured_data, unstructured_transcripts, remainingSchema);
        console.log("[API/ExtractData] LLM Raw Results (Args from Function Call):", llmResults);

    } else {
         console.log("[API/ExtractData] No remaining fields needed LLM extraction.");
    }

    // --- Step 4: Validate and Merge LLM Results ---
    console.log("[API/ExtractData] Validating and merging LLM results...");
    for (const fieldName in llmResults) {
        // Check if the field returned by LLM is one we expected it to fill
        if (remainingSchema.hasOwnProperty(fieldName)) {
            const rawValue = llmResults[fieldName]; // Value is expected string from LLM
            const fieldConfig = remainingSchema[fieldName];
            let coercedValue = rawValue;
            let isValid = false;

            try {
                // 1. Coerce Type (same logic as in process-voice)
                if (fieldConfig.type === 'number') {
                    const parsed = parseNumeric(rawValue); // Use shared helper
                    if (parsed === null) throw new Error(`Could not parse "${rawValue}" as number.`);
                     // Check for integer requirement if applicable (e.g., num_vehicles)
                    if (fieldName === 'num_vehicles' && !Number.isInteger(parsed)) {
                         throw new Error(`Value "${rawValue}" must parse to a whole number for ${fieldConfig.label}.`);
                    }
                    coercedValue = parsed;
                } else if (fieldConfig.type === 'checkbox') {
                    const lowerVal = String(rawValue).toLowerCase().trim();
                    const truthy = ['true', 'yes', 'on', '1', 'affirmative', 'checked'];
                    const falsy = ['false', 'no', 'off', '0', 'negative', 'unchecked'];
                    if (truthy.includes(lowerVal)) coercedValue = true;
                    else if (falsy.includes(lowerVal)) coercedValue = false;
                    else throw new Error(`Could not parse "${rawValue}" as boolean.`);
                } else {
                    coercedValue = String(rawValue).trim(); // Coerce to string and trim for text/select/email etc.
                }

                // 2. Validate using schema
                if (fieldConfig.validation) {
                    isValid = fieldConfig.validation(coercedValue);
                } else {
                    isValid = true; // Assume valid if no specific validation function
                }

                // 3. Add to results if valid
                if (isValid) {
                    console.log(`[API/ExtractData] LLM Validation Passed for ${fieldName}: value=${coercedValue} (type: ${typeof coercedValue})`);
                    extractedData[fieldName] = coercedValue; // Add the COERCED and VALIDATED value
                } else {
                    // Log validation failure reason from schema if possible
                    console.warn(`[API/ExtractData] LLM Validation Failed for ${fieldName}: value="${rawValue}" (coerced: ${coercedValue}) did not pass schema validation.`);
                }

            } catch (error) {
                console.warn(`[API/ExtractData] LLM Coercion/Validation Error for field "${fieldName}" with raw value "${rawValue}": ${error.message}`);
                // Do not add the invalid value to extractedData
            }
        } else {
            console.warn(`[API/ExtractData] LLM returned unexpected field: ${fieldName}. Ignoring.`);
        }
    }


    // --- Step 5: Final Data Cleanup (Optional but good practice) ---
    // Ensure defaults for optional fields if still null (e.g., checkboxes to false)
    Object.keys(formSchema).forEach(key => {
        if (extractedData[key] === null) {
             if (formSchema[key].type === 'checkbox') {
                 extractedData[key] = false; // Default optional checkboxes to false
             }
             // Keep other nulls as null unless a default is specified in schema
        }
         // Ensure number types are numbers or null
        if (formSchema[key].type === 'number' && typeof extractedData[key] !== 'number' && extractedData[key] !== null) {
             console.warn(`[API/ExtractData] Final check: Converting non-number ${key} to null.`);
             extractedData[key] = null;
        }
        // Ensure boolean types are booleans
        if (formSchema[key].type === 'checkbox' && typeof extractedData[key] !== 'boolean') {
             console.warn(`[API/ExtractData] Final check: Converting non-boolean ${key} to false.`);
             extractedData[key] = false; // Default to false if somehow not boolean
        }
    });


    console.log("[API/ExtractData] Final Extracted Data Sent to Frontend:", JSON.stringify(extractedData, null, 2));
    return res.status(200).json(extractedData);

  } catch (error) {
    console.error("[API/ExtractData] Extraction error:", error);
    // Log the specific error for better debugging
    if (error instanceof Error) {
        console.error(error.stack);
    }
    // Return an empty object or default structure in case of error?
    // Returning empty might be safer to avoid frontend errors with partial/bad data.
    const errorResponse = {};
     Object.keys(formSchema).forEach(key => {
       errorResponse[key] = formSchema[key].type === 'checkbox' ? false : null;
     });
    return res.status(500).json(errorResponse); // Return default structure on error
    // Alternatively: return res.status(500).json({ error: "Failed to extract data", details: error.message });
  }
}