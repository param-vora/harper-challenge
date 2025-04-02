// pages/api/process-voice.js
import { getAuth } from '@clerk/nextjs/server';
import { createClient as createDeepgramClient } from '@deepgram/sdk'; // Use createClient for Deepgram
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai"; // Gemini Client
import { formSchema } from '../../config/formSchema';
import formidable from 'formidable';
import fs from 'fs'; // File system module for reading/deleting temp files

// --- Define Schema Information for Prompt ---
// Create a simpler representation of the schema for the prompt
const schemaForPrompt = Object.entries(formSchema).map(([key, config]) => ({
    fieldName: key,
    label: config.label,
    type: config.type,
    required: config.required
}));
// Convert to a string format suitable for the prompt
const schemaStringForPrompt = JSON.stringify(schemaForPrompt, null, 2);


// --- Function to Call Gemini for Intent Parsing ---
async function parseTranscriptWithGemini(transcript, apiKey) {
    console.log("[Gemini] Initializing client...");
    const genAI = new GoogleGenerativeAI(apiKey);
    // Ensure we are using a recent model - flash is good for speed/cost
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    // Define the desired JSON output structure clearly in the prompt
    const jsonOutputFormat = `{
  "intent": "SET | UPDATE | GET | DELETE | AMBIGUOUS | OTHER", // Choose one intent
  "field": "schema_field_name | null", // Must be one of the fieldNames from the provided schema, or null if intent is OTHER/AMBIGUOUS or doesn't apply
  "value": "extracted_value | null", // The extracted value for SET/UPDATE. Attempt to convert numbers/booleans. Null otherwise.
  "message": "optional_clarification | null" // Use for AMBIGUOUS/OTHER or if clarification is needed
}`;

    // Construct the detailed prompt
    const prompt = `
You are an AI assistant helping parse voice commands for filling a form.
Your task is to analyze the user's transcript and determine their intent and the relevant details (field name, value).
Output *only* a valid JSON object in the specified format. Do not include any other text, greetings, explanations, or markdown formatting like \`\`\`json.

**Allowed Form Fields (Schema):**
${schemaStringForPrompt}

**JSON Output Format:**
${jsonOutputFormat}

**Instructions:**
1.  Analyze the following user transcript.
2.  Determine the primary intent:
    *   'SET'/'UPDATE': User wants to set or change the value of a specific field.
    *   'GET': User is asking for the current value of a field.
    *   'DELETE'/'CLEAR': User wants to clear a field's value.
    *   'AMBIGUOUS': The command is unclear, refers to multiple fields, or the field/value is unrecognizable. Provide a clarification message.
    *   'OTHER': The command is unrelated to form filling, a greeting, or nonsensical. Provide a descriptive message.
3.  Identify the specific 'field' from the **Allowed Form Fields** schema that the user is referring to. Use the 'fieldName'. Map common terms (e.g., "company name" -> "legal_name", "EIN" -> "fein"). If no specific field is identified or relevant, set 'field' to null.
4.  Extract the 'value' the user wants to set/update.
    *   For numbers (annual_revenue, num_vehicles), provide the numeric value (e.g., 500000, 5).
    *   For booleans (has_employees), use \`true\` or \`false\`.
    *   For other types, use the extracted string.
    *   If no value is relevant or extracted, set 'value' to null.
5.  If the intent is 'AMBIGUOUS' or 'OTHER', provide a helpful 'message'. Otherwise, 'message' can be null.
6.  Ensure the output is **only** the JSON object.

**User Transcript:**
"${transcript}"

**JSON Output:**
`;

    console.log("[Gemini] Sending prompt to Gemini...");

    try {
        const generationConfig = {
          temperature: 0.1, // Lower temperature for stricter adherence
          topK: 1,
          topP: 1,
          maxOutputTokens: 1024, // JSON output should be relatively small
          // Explicitly request JSON output
          responseMimeType: "application/json",
        };

        // Safety Settings (Optional but recommended)
        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ];


        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig,
            safetySettings,
        });

        const response = result.response;

         // Check for safety blocks or other reasons for no response
        if (!response || !response.candidates || response.candidates.length === 0 || !response.candidates[0].content) {
            console.error("[Gemini] No valid response candidate found. Finish reason:", response?.candidates?.[0]?.finishReason);
            console.error("[Gemini] Prompt feedback:", response?.promptFeedback);
            throw new Error("AI model did not provide a valid response.");
        }


        // --- Revised Cleanup ---
        // 1. Check if the response *claims* to be JSON first
        if (response.candidates[0].content.mimeType !== "application/json") {
             console.warn(`[Gemini] Response mimeType was not application/json, received: ${response.candidates[0].content.mimeType}`);
             // If strict JSON is required, could throw an error here.
        }

        // 2. Get the text content
        let responseText = response.text(); // response.text() automatically extracts from parts
        console.log("[Gemini] Received raw response text:", responseText);

        // 3. Attempt cleanup ONLY if it doesn't look like clean JSON
        const trimmedText = responseText.trim();
        if (!trimmedText.startsWith('{') || !trimmedText.endsWith('}')) {
            console.warn("[Gemini] Raw response doesn't look like clean JSON, attempting fence removal...");
            // More aggressive fence removal
             responseText = trimmedText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
             console.log("[Gemini] Cleaned response text:", responseText);
        } else {
             console.log("[Gemini] Raw response looks like clean JSON, skipping fence removal.");
             responseText = trimmedText; // Use the trimmed version
        }
        // -----------------------

        // Attempt to parse the potentially cleaned JSON response
        let parsedJson = JSON.parse(responseText);
        console.log("[Gemini] Parsed JSON:", parsedJson);

        // --- Basic Validation ---
        const validIntents = ['SET', 'UPDATE', 'GET', 'DELETE', 'AMBIGUOUS', 'OTHER'];
        if (!parsedJson || typeof parsedJson !== 'object') {
            throw new Error("LLM returned invalid non-object response.");
        }
        // Ensure required fields exist and provide defaults
        parsedJson.intent = parsedJson.intent || 'OTHER';
        parsedJson.field = parsedJson.field || null;
        parsedJson.value = parsedJson.value !== undefined ? parsedJson.value : null;
        parsedJson.message = parsedJson.message || null;

        if (!validIntents.includes(parsedJson.intent)) {
             console.warn(`[Gemini] LLM returned invalid intent: ${parsedJson.intent}`);
             parsedJson.message = parsedJson.message || `Received unclear intent '${parsedJson.intent}' from AI. Original command: ${transcript}`;
             parsedJson.intent = 'OTHER'; // Fallback to OTHER
             parsedJson.field = null;
             parsedJson.value = null;
        }
        // Check if field is valid (if provided and intent requires it)
        if (parsedJson.field && !formSchema[parsedJson.field]) {
            console.warn(`[Gemini] LLM returned invalid field: ${parsedJson.field}`);
             parsedJson.message = parsedJson.message || `AI mentioned an invalid field '${parsedJson.field}'. Please use a valid field name.`;
             parsedJson.intent = 'AMBIGUOUS'; // It tried to set something, but field was wrong
             // Keep the invalid field name in the message, but nullify field/value for processing
             parsedJson.field = null;
             parsedJson.value = null;
        }

        return parsedJson;

    } catch (error) {
        console.error("[Gemini] Error during Gemini API call or parsing:", error);
        if (error instanceof SyntaxError) {
             // Log the text *before* parsing attempt
            console.error("[Gemini] Failed to parse LLM response as JSON. Text before parsing:", responseText); // Note: responseText might not be defined if error happened before assignment
        }
         // Return a generic error structure
        return {
            intent: 'OTHER',
            field: null,
            value: null,
            message: `Error processing voice command with AI: ${error.message}`
        };
    }
}


// --- API Route Handler ---

// Configure API route to handle multipart/form-data
export const config = {
  api: {
    bodyParser: false, // Disable Next.js default body parser
  },
};

// Main handler function
export default async function handler(req, res) {
  const { userId } = getAuth(req);
  if (!userId) {
    console.error("[API/ProcessVoice] Unauthorized access attempt.");
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== 'POST') {
    console.warn(`[API/ProcessVoice] Method ${req.method} not allowed.`);
    return res.status(405).json({ error: "Method not allowed" });
  }

  console.log("[API/ProcessVoice] Received request...");

  // --- Get API Keys ---
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY; // Get Gemini key

  if (!deepgramApiKey) {
      console.error('[API/ProcessVoice] Deepgram API key not found.');
      return res.status(500).json({ intent: 'OTHER', message: 'Voice processing (STT) not configured.' });
  }
  if (!geminiApiKey) {
       console.error('[API/ProcessVoice] Gemini API key not found.');
       return res.status(500).json({ intent: 'OTHER', message: 'Voice processing (AI) not configured.' });
  }


  const form = formidable({});
  let audioFile = null;

  try {
    // --- Parse Form Data ---
    const [fields, files] = await form.parse(req);
    console.log("[API/ProcessVoice] Formidable parsed fields:", fields);
    // console.log("[API/ProcessVoice] Formidable parsed files:", files); // Can be verbose

    if (files.audio && files.audio.length > 0) {
       audioFile = files.audio[0];
       // Log essential file info, avoid logging the full object
       console.log(`[API/ProcessVoice] Received audio file: ${audioFile.originalFilename}, size: ${audioFile.size}, type: ${audioFile.mimetype}`);
    } else {
        console.warn("[API/ProcessVoice] No audio file found in the request.");
        return res.status(400).json({ intent: 'OTHER', message: 'No audio data received.' });
    }

    // --- Deepgram Transcription ---
    const deepgram = createDeepgramClient(deepgramApiKey);
    const audioBuffer = fs.readFileSync(audioFile.filepath);
    console.log("[API/ProcessVoice] Sending audio buffer to Deepgram...");
    const { result: dgResult, error: dgError } = await deepgram.listen.prerecorded.transcribeFile(
        audioBuffer,
        {
            model: 'nova-2', // Or your preferred Deepgram model
            language: 'en-US',
            smart_format: true,
            punctuate: true,
            numerals: true,
        }
    );

    // --- Clean up Temp File ---
    // IMPORTANT: Do this IMMEDIATELY after the buffer is read/used if possible
    fs.unlinkSync(audioFile.filepath);
    console.log("[API/ProcessVoice] Temporary audio file deleted.");
    audioFile = null; // Clear reference after deletion


    if (dgError) {
        console.error("[API/ProcessVoice] Deepgram Error:", dgError);
        throw new Error(`Speech-to-text failed: ${dgError.message || 'Unknown Deepgram error'}`);
    }

    const transcript = dgResult?.results?.channels[0]?.alternatives[0]?.transcript || '';
    if (!transcript) {
        console.warn("[API/ProcessVoice] Deepgram returned empty transcript.");
        // Optionally check dgResult.metadata for more info (e.g., duration, speech detected)
        return res.status(200).json({ intent: 'OTHER', message: 'Could not understand audio or no speech detected.' });
    }
    console.log('[API/ProcessVoice] Deepgram Transcript:', transcript);


    // --- Call Gemini for Intent Parsing ---
    const parsedResult = await parseTranscriptWithGemini(transcript, geminiApiKey);
    console.log('[API/ProcessVoice] Gemini Parsed Result:', parsedResult);

    // --- Return Result ---
    return res.status(200).json(parsedResult); // Return result from Gemini

  } catch (error) {
    console.error("[API/ProcessVoice] Error during processing:", error);

    // --- Ensure Temp File Cleanup on Error ---
    if (audioFile?.filepath && fs.existsSync(audioFile.filepath)) {
         try {
             fs.unlinkSync(audioFile.filepath);
             console.log("[API/ProcessVoice] Temporary audio file deleted after error.");
         } catch (unlinkError) {
             console.error("[API/ProcessVoice] Error deleting temporary audio file after main error:", unlinkError);
         }
    }

    // Return a structured error response
    return res.status(500).json({
        intent: 'OTHER',
        field: null,
        value: null,
        message: error.message || 'An unexpected error occurred processing the voice command.'
    });
  }
}