// lib/extractionService.js
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
// (Keep the helper functions 'get' and 'parseNumeric' and the 'extractWithRules' function from the previous version)
const get = (obj, path, defaultValue = null) => { /* ... */ };
const parseNumeric = (value) => { /* ... */ };
export function extractWithRules(structuredData, transcripts, schema) { /* ... (Keep existing implementation) ... */ };


/**
 * Extracting remaining form data using LLM (Gemini Implementation).
 */
export async function extractWithLLM(structuredData, transcripts, remainingSchema, currentResults) {
  console.log('[extractWithLLM] Starting Gemini extraction for fields:', Object.keys(remainingSchema));
  // console.log('[extractWithLLM] Context (Current Data):', currentResults); // Optional: log context if needed

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
      console.error("[extractWithLLM] Gemini API key not found.");
      // Return empty object or throw error? Returning empty allows flow to continue.
      return {};
  }

  // --- Prepare Input for LLM ---

  // 1. Format the remaining schema for the prompt
  const fieldsToRequest = Object.entries(remainingSchema).map(([key, config]) => ({
      fieldName: key,
      label: config.label,
      type: config.type,
      description: `(Type: ${config.type}${config.required ? ', Required' : ''})` // Add type/required info
  }));
  const requestedFieldsString = JSON.stringify(fieldsToRequest, null, 2);

  // 2. Format context data (be concise to save tokens)
  const context = {
    // Include potentially relevant structured data (limit length if necessary)
    structuredInfo: JSON.stringify(structuredData)?.substring(0, 1500) + (JSON.stringify(structuredData)?.length > 1500 ? '...' : ''),
    // Combine transcripts
    transcriptsSummary: (transcripts || []).join(' \n ').substring(0, 3000) + ((transcripts || []).join(' \n ').length > 3000 ? '...' : ''),
    // Optionally include already filled data if it helps context
    // alreadyExtracted: currentResults
  };

  // 3. Define the desired JSON output structure
   const jsonOutputFormat = `{
  "fieldName1": "extracted_value_or_null",
  "fieldName2": "extracted_value_or_null",
  // ... include only keys listed in 'Fields to Extract' below
}`;

  // 4. Construct the prompt
  const prompt = `
You are an AI assistant specialized in extracting structured information from business context to fill form fields.
Your goal is to extract values for the specific fields listed below, based on the provided structured info and conversation transcripts.
Output *only* a valid JSON object containing the requested fields as keys and their extracted values. Use null if a value cannot be found for a requested field. Do not include explanations or markdown formatting.

**Context:**
Structured Info: ${context.structuredInfo}
Transcripts Summary: ${context.transcriptsSummary}

**Fields to Extract (provide values for these keys in the JSON output):**
${requestedFieldsString}

**JSON Output Format (only include keys from 'Fields to Extract'):**
${jsonOutputFormat}

**Instructions:**
1.  Carefully read the Context (Structured Info and Transcripts).
2.  For each field listed in "Fields to Extract", find the most likely value within the Context.
3.  Pay attention to the expected data type mentioned in the field description (e.g., number, boolean, text).
    *   For numbers (e.g., annual_revenue, num_vehicles), provide the numeric value (e.g., 500000, 5). Parse values like "$1.5M" or "two hundred thousand".
    *   For booleans (e.g., has_employees), use \`true\` or \`false\`. Infer based on phrases like "we have 10 employees" (true) or "it's just me" (false).
    *   For text/email/textarea, provide the relevant string.
4.  If a specific value for a requested field cannot be reasonably determined from the context, use \`null\` for that field's value in the JSON output.
5.  Return **only** the JSON object containing the extracted values for the requested fields.

**JSON Output:**
`;

  // --- Call Gemini API ---
  console.log("[extractWithLLM] Initializing Gemini client...");
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); // Use flash for speed/cost

  try {
      const generationConfig = {
          temperature: 0.2, // Low temperature for factual extraction
          topK: 1,
          topP: 1,
          maxOutputTokens: 2048, // Adjust based on expected output size
          responseMimeType: "application/json",
      };
      const safetySettings = [ /* ... (same safety settings as before) ... */ ];

      console.log("[extractWithLLM] Sending prompt to Gemini for extraction...");
      // console.log("--- PROMPT START ---"); // Debugging: log the prompt if needed
      // console.log(prompt);
      // console.log("--- PROMPT END ---");

      const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig,
          safetySettings,
      });

      const response = result.response;
      if (!response || !response.candidates || response.candidates.length === 0 || !response.candidates[0].content) {
          console.error("[extractWithLLM] Gemini Error: No valid response candidate.", response?.promptFeedback);
          throw new Error("AI model did not provide a valid extraction response.");
      }

      let responseText = response.text();
      console.log("[extractWithLLM] Gemini Raw Response Text:", responseText);

       // Apply the same cleanup logic for potential markdown fences
      const trimmedText = responseText.trim();
      if (!trimmedText.startsWith('{') || !trimmedText.endsWith('}')) {
          console.warn("[extractWithLLM] Raw response doesn't look like clean JSON, attempting fence removal...");
          responseText = trimmedText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
          console.log("[extractWithLLM] Cleaned response text:", responseText);
      } else {
          console.log("[extractWithLLM] Raw response looks like clean JSON.");
          responseText = trimmedText;
      }

      let extractedJson = JSON.parse(responseText);
      console.log("[extractWithLLM] Gemini Parsed JSON:", extractedJson);

      // --- Basic Validation/Filtering ---
      // Ensure we only return values for fields we actually requested
      const validatedResults = {};
      for (const key in extractedJson) {
          if (remainingSchema.hasOwnProperty(key)) { // Was this a field we asked for?
               // Optional: Add type validation based on remainingSchema[key].type if needed
               validatedResults[key] = extractedJson[key];
          } else {
              console.warn(`[extractWithLLM] Gemini returned unexpected field: ${key}`);
          }
      }

      console.log("[extractWithLLM] Returning validated results:", validatedResults);
      return validatedResults; // Return the parsed and filtered JSON

  } catch (error) {
      console.error("[extractWithLLM] Error during Gemini call or processing:", error);
      if (error instanceof SyntaxError) {
            console.error("[extractWithLLM] Failed to parse LLM response as JSON. Text before parsing:", responseText); // Log text that failed
      }
      return {}; // Return empty object on error to allow flow to continue
  }
}