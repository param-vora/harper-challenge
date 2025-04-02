// pages/api/process-voice.js
import { getAuth } from '@clerk/nextjs/server';
import { createClient as createDeepgramClient } from '@deepgram/sdk';
import {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
    SchemaType // Use SchemaType
} from "@google/generative-ai";
import { formSchema } from '../../config/formSchema'; // Import the updated schema
import formidable from 'formidable';
import fs from 'fs';

// --- Define Schema Information and Tools for Function Calling ---

const validFieldNames = Object.keys(formSchema);

const tools = [
  {
    functionDeclarations: [
      {
        name: "updateFormField",
        description: "Updates the value of a specific field in the form.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            fieldName: {
              type: SchemaType.STRING,
              description: "The exact name of the form field to update.",
              enum: validFieldNames
            },
            value: {
              type: SchemaType.STRING, // Expect string from LLM
              description: "The new value for the form field (as a string). Type conversion will be handled later based on the field name."
            }
          },
          required: ["fieldName", "value"]
        }
      },
      {
        name: "clearFormField",
        description: "Clears the value of a specific field in the form.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            fieldName: {
                type: SchemaType.STRING,
                description: "The exact name of the form field to clear.",
                enum: validFieldNames
            }
          },
          required: ["fieldName"]
        }
      },
      {
          name: "reportAmbiguityOrIrrelevance",
          description: "Use this function if the user's command is ambiguous, unclear, references a non-existent field, or is unrelated to managing the form fields.",
          parameters: {
              type: SchemaType.OBJECT,
              properties: {
                  reason: {
                      type: SchemaType.STRING,
                      description: "A brief explanation of why the command could not be directly processed (e.g., 'Ambiguous field reference', 'Unrelated command', 'Field not found')."
                  }
              },
              required: ["reason"]
          }
      }
    ]
  }
];


// --- Function to Call Gemini for Intent Parsing using Function Calling ---
async function parseTranscriptWithFunctionCalling(transcript, apiKey) {
    console.log("[Gemini FC] Initializing client...");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
      tools: tools
    });

    const prompt = `
You are an AI assistant helping parse voice commands for filling a form.
Analyze the user's transcript and determine the appropriate action using the available functions.
Only use the provided functions to respond. Do not add explanations or conversational text outside of the function calls.

**User Transcript:**
"${transcript}"
`;

    console.log("[Gemini FC] Sending prompt to Gemini for function calling...");

    try {
        const generationConfig = {
          temperature: 0.1,
        };
        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ];

        const chat = model.startChat({
            history: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig,
            safetySettings
        });

        const result = await chat.sendMessage("Analyzing transcript...");
        const response = result.response;
        const candidate = response?.candidates?.[0];

        console.log("[Gemini FC] Raw Gemini Response:", JSON.stringify(response, null, 2));

        if (!candidate || !candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
            const finishReason = candidate?.finishReason;
            const safetyRatings = candidate?.safetyRatings;
            console.error(`[Gemini FC] No valid response candidate. Finish reason: ${finishReason}`, safetyRatings ? `Safety Ratings: ${JSON.stringify(safetyRatings)}` : '');
            console.error("[Gemini FC] Prompt feedback:", response?.promptFeedback);
            if(finishReason === 'SAFETY') {
                 throw new Error("AI processing stopped due to safety settings.");
            } else if (finishReason === 'STOP' && (!candidate.content.parts || candidate.content.parts.find(p => p.text))) {
                 console.warn("[Gemini FC] Model generated text instead of function call:", candidate.content.parts?.find(p => p.text)?.text);
                 return { intent: 'AMBIGUOUS', field: null, value: null, message: "Could not determine a specific action from the command." };
            } else if (finishReason === 'MAX_TOKENS') {
                throw new Error("AI model response exceeded maximum length.");
            } else {
                 throw new Error(`AI model finished unexpectedly. Reason: ${finishReason || 'Unknown'}`);
            }
        }

        const functionCallPart = candidate.content.parts.find(part => part.functionCall);

        if (functionCallPart && functionCallPart.functionCall) {
            const functionCall = functionCallPart.functionCall;
            const { name, args } = functionCall;
            console.log(`[Gemini FC] Function Call Recommended: ${name}`);
            console.log(`[Gemini FC] Arguments:`, args);

            // --- Validate Arguments & Map Function Call ---
            switch (name) {
                case "updateFormField": {
                    if (!args || !args.fieldName || !formSchema[args.fieldName]) {
                        console.warn(`[Gemini FC] Invalid fieldName '${args?.fieldName}' in updateFormField call.`);
                        return { intent: 'AMBIGUOUS', field: null, value: null, message: `Could not update field: '${args?.fieldName || 'unknown'}' not found.` };
                    }

                    const fieldName = args.fieldName;
                    const value = args.value; // Value from Gemini (expected string)
                    const fieldConfig = formSchema[fieldName];

                    let coercedValue = value; // Start with the original string value
                    let validationError = null;

                    try {
                        // 1. Coerce Type based on schema
                        if (fieldConfig.type === 'number') {
                            // Attempt to parse common number representations first
                            let potentialNum = String(value).trim().toLowerCase();
                            // Basic word-to-number mapping (can be expanded)
                            const numberWords = { 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'zero': 0 };
                            if (numberWords[potentialNum] !== undefined) {
                                potentialNum = numberWords[potentialNum];
                            }
                            // Remove commas, $, etc. for parsing
                            potentialNum = String(potentialNum).replace(/[$, ]/g, '');
                            const parsed = parseFloat(potentialNum);
                            if (isNaN(parsed)) {
                                throw new Error(`Value "${value}" could not be parsed as a valid number.`);
                            }
                            // If the schema expects an integer (like num_vehicles), check that too
                            if (fieldName === 'num_vehicles' && !Number.isInteger(parsed)) {
                                throw new Error(`Value "${value}" must be a whole number for ${fieldConfig.label}.`);
                            }
                            coercedValue = parsed;
                        } else if (fieldConfig.type === 'checkbox') {
                            const lowerVal = String(value).toLowerCase().trim();
                             const truthy = ['true', 'yes', 'on', '1', 'affirmative', 'checked'];
                             const falsy = ['false', 'no', 'off', '0', 'negative', 'unchecked'];
                             if (truthy.includes(lowerVal)) {
                                 coercedValue = true;
                             } else if (falsy.includes(lowerVal)) {
                                 coercedValue = false;
                             } else {
                                 throw new Error(`Value "${value}" is not a clear indicator of true or false.`);
                             }
                        } else {
                            // For text, textarea, email, select - coerce to string and trim
                            coercedValue = String(value).trim();
                        }

                        // 2. Validate coerced value using schema's validation function
                        if (fieldConfig.validation) {
                            const isValid = fieldConfig.validation(coercedValue);
                            if (!isValid) {
                                let specificError = `Invalid value "${value}" provided for ${fieldConfig.label}.`;
                                if(fieldConfig.type === 'select' && fieldConfig.options) {
                                    specificError += ` Please choose from: ${fieldConfig.options.map(o => o.label || o.value).join(', ')}.`;
                                } else if (fieldName === 'fein' && fieldConfig.type === 'text') {
                                     specificError += ` Expected format: XX-XXXXXXX.`;
                                } else if (fieldConfig.type === 'number' && coercedValue < 0) {
                                     specificError += ` Value cannot be negative.`
                                } else if (fieldName === 'num_vehicles' && !Number.isInteger(coercedValue)) {
                                    // This check is now also in validation, but can be explicit here too
                                    specificError += ` Value must be a whole number.`;
                                }
                                throw new Error(specificError);
                            }
                        }

                        // If coercion and validation passed:
                        console.log(`[Gemini FC] Coerced/Validated value for ${fieldName}:`, coercedValue);
                        return {
                            intent: 'UPDATE',
                            field: fieldName,
                            value: coercedValue, // Send the *coerced* value
                            message: null
                        };

                    } catch (error) {
                        console.warn(`[Gemini FC] Validation/Coercion Error for field "${fieldName}" with value "${value}": ${error.message}`);
                        validationError = error.message;
                        return {
                            intent: 'AMBIGUOUS',
                            field: fieldName,
                            value: value, // Keep original value for context in message
                            message: validationError // Use the specific error message
                        };
                    }
                } // End case "updateFormField"

                case "clearFormField": {
                     if (!args || !args.fieldName || !formSchema[args.fieldName]) {
                         console.warn(`[Gemini FC] Invalid fieldName '${args?.fieldName}' in clearFormField call.`);
                         return { intent: 'AMBIGUOUS', field: null, value: null, message: `Could not clear field: '${args?.fieldName || 'unknown'}' not found.` };
                     }
                     const fieldName = args.fieldName;
                     // No validation needed for clear, just map intent
                     return {
                         intent: 'UPDATE', // Map clear to UPDATE with null
                         field: fieldName,
                         value: null,
                         message: null
                     };
                 } // End case "clearFormField"

                case "reportAmbiguityOrIrrelevance":
                     return {
                         intent: 'AMBIGUOUS',
                         field: null,
                         value: null,
                         message: args?.reason || "Command is unclear or irrelevant."
                     };

                default:
                    console.warn(`[Gemini FC] Received unknown function call name: ${name}`);
                    return { intent: 'OTHER', field: null, value: null, message: `Unknown action requested: ${name}` };
            }
        } else {
             const textPart = candidate.content.parts.find(part => part.text);
             const responseText = textPart?.text || "";
             console.warn("[Gemini FC] No function call found in response. Text:", responseText);
             return { intent: 'AMBIGUOUS', field: null, value: null, message: responseText || "Could not determine a specific action from the command." };
        }

    } catch (error) {
        console.error("[Gemini FC] Error during Gemini API call or processing:", error);
        return {
            intent: 'OTHER',
            field: null,
            value: null,
            message: 'An error occurred while processing the voice command.' // Generic error to client
        };
    }
}


// --- API Route Handler ---

export const config = {
  api: {
    bodyParser: false, // Keep formidable handling
  },
};

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

  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!deepgramApiKey || !geminiApiKey) {
      console.error('[API/ProcessVoice] Missing Deepgram or Gemini API key.');
      const missingKeys =[!deepgramApiKey ? 'Deepgram':'', !geminiApiKey ? 'Gemini':''].filter(Boolean).join(' and ');
       return res.status(500).json({ intent: 'OTHER', message: `Voice processing service (${missingKeys}) not configured.` });
  }

  const form = formidable({});
  let audioFile = null;

  try {
    // --- Parse Form Data ---
    const [fields, files] = await form.parse(req);
    if (files.audio && files.audio.length > 0) {
       audioFile = files.audio[0];
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
        { // Ensure these options are appropriate
            model: 'nova-2',
            language: 'en-US',
            smart_format: true,
            punctuate: true,
            numerals: true, // Important for number parsing
        }
    );

    // --- Clean up Temp File ---
    if (audioFile?.filepath && fs.existsSync(audioFile.filepath)) {
         try {
             fs.unlinkSync(audioFile.filepath);
             console.log("[API/ProcessVoice] Temporary audio file deleted.");
         } catch (unlinkErr) { console.error("Error deleting temp file", unlinkErr); }
         audioFile = null;
    }

    if (dgError) {
        console.error("[API/ProcessVoice] Deepgram Error:", dgError);
        throw new Error(`Speech-to-text failed: ${dgError.message || 'Unknown Deepgram error'}`);
    }

    const transcript = dgResult?.results?.channels[0]?.alternatives[0]?.transcript || '';
    if (!transcript) {
        console.warn("[API/ProcessVoice] Deepgram returned empty transcript.");
        return res.status(200).json({ intent: 'OTHER', message: 'Could not understand audio or no speech detected.' });
    }
    console.log('[API/ProcessVoice] Deepgram Transcript:', transcript);


    // --- Call Gemini Function Calling Parser (with validation inside) ---
    console.log('[API/ProcessVoice] Calling Gemini Function Calling for parsing...');
    const parsedResult = await parseTranscriptWithFunctionCalling(transcript, geminiApiKey);
    console.log('[API/ProcessVoice] Gemini Parsed Result (FC):', parsedResult);

    // --- Return Result ---
    return res.status(200).json(parsedResult);

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

    return res.status(500).json({
        intent: 'OTHER',
        field: null,
        value: null,
        message: 'An unexpected error occurred processing the voice command.' // Keep generic for client
    });
  }
}