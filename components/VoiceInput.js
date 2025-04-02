// components/VoiceInput.js
import { useState, useRef, useEffect } from 'react';
import { Button, Group, Tooltip, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { processVoiceCommand } from '../lib/apiClient'; // Ensure this path is correct

function VoiceInput({ onCommandProcessed }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasPermission, setHasPermission] = useState(null); // null | true | false
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null); // Ref to hold the stream for proper cleanup

  // Effect to check for microphone permission on component mount
  useEffect(() => {
    let currentStream = null; // Local variable for cleanup within effect
    const checkPermission = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setError('Media Devices API not supported.');
          setHasPermission(false);
          return;
        }
        if (!window.MediaRecorder) {
          setError('MediaRecorder API not supported.');
          setHasPermission(false);
          return;
        }

        console.log('[VoiceInput] Checking microphone permission...');
        // Try to get access to the microphone
        currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('[VoiceInput] Microphone permission granted.');
        setHasPermission(true);
        streamRef.current = currentStream; // Store stream if needed later, but maybe not

        // IMPORTANT: Stop tracks immediately after permission check to release mic
        currentStream.getTracks().forEach(track => track.stop());
        streamRef.current = null; // Clear ref after stopping

      } catch (err) {
        console.error('[VoiceInput] Microphone permission error:', err);
        setHasPermission(false);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
             setError('Microphone permission denied by user.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
             setError('No microphone found.');
        } else {
             setError('Error accessing microphone.');
        }
      }
    };

    checkPermission();

    // Cleanup function to stop tracks if component unmounts during permission request
    return () => {
        if (streamRef.current) {
            console.log('[VoiceInput] Cleaning up stream on unmount/re-render');
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    };
  }, []); // Run only on mount

  const handleStartRecording = async () => {
    if (isRecording || isProcessing || hasPermission !== true) return; // Prevent multiple starts or start without permission

    setError(null); // Clear previous errors
    console.log('[VoiceInput] Starting recording...');
    setIsRecording(true);
    audioChunksRef.current = []; // Reset chunks

    try {
      // Get a fresh microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream; // Store the active stream

      // Create media recorder instance
      const options = { mimeType: 'audio/webm;codecs=opus' }; // Specify mimetype if possible
      let recorder;
      if (MediaRecorder.isTypeSupported(options.mimeType)) {
          recorder = new MediaRecorder(stream, options);
      } else {
          console.warn(`[VoiceInput] MimeType ${options.mimeType} not supported, using default.`);
          recorder = new MediaRecorder(stream);
      }
      mediaRecorderRef.current = recorder;

      // Event handler for when data is available
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log(`[VoiceInput] Data available: ${event.data.size} bytes`);
          audioChunksRef.current.push(event.data);
        } else {
           console.log('[VoiceInput] Data available event with 0 size.');
        }
      };

       // Event handler for recorder errors
      recorder.onerror = (event) => {
        console.error('[VoiceInput] MediaRecorder error:', event.error);
        setError(`Recording error: ${event.error.name}`);
        // Force stop recording state if an error occurs
        setIsRecording(false);
        // Clean up stream tracks
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
      };

      // Event handler for when recording stops
      recorder.onstop = async () => {
        console.log('[VoiceInput] Recording stopped. Processing data...');
        setIsProcessing(true); // Set processing state *after* stop event

        // Clean up the tracks and stream reference *after* stopping
        if (streamRef.current) {
           streamRef.current.getTracks().forEach(track => track.stop());
           streamRef.current = null;
           console.log('[VoiceInput] Microphone stream stopped.');
        } else {
            console.warn('[VoiceInput] streamRef was null on stop event.');
        }


        if (audioChunksRef.current.length === 0) {
          console.error('[VoiceInput] No audio chunks recorded.');
          showNotification({
            title: 'Recording Error',
            message: 'No audio data was captured. Please try again.',
            color: 'red',
          });
          setIsProcessing(false); // Reset processing state
          setIsRecording(false); // Ensure recording state is also reset
          return; // Exit early
        }

        try {
          // Get audio blob
          const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          console.log(`[VoiceInput] Created Blob size: ${audioBlob.size}, type: ${audioBlob.type}`);

          if (audioBlob.size === 0) {
             console.error('[VoiceInput] Created blob has size 0.');
             throw new Error("Recorded audio size is zero.");
          }

          // Process audio with the API
          const result = await processVoiceCommand(audioBlob); // This function is in apiClient.js
          onCommandProcessed(result);

        } catch (processingError) {
          console.error("[VoiceInput] Voice processing error:", processingError);
          showNotification({
            title: 'Processing Error',
            message: processingError.error || processingError.message || 'Failed to process voice command.',
            color: 'red',
          });
        } finally {
          setIsProcessing(false); // Reset processing state
          // Recording state should already be false here
        }
      };


      // Start recording (e.g., record in 1-second chunks)
      // Using timeslice can sometimes help ensure dataavailable fires periodically
      // recorder.start(1000); 
      recorder.start(); // Or start without timeslice

      console.log(`[VoiceInput] MediaRecorder started. State: ${recorder.state}`);

      showNotification({
        title: 'Recording Started',
        message: 'Speak your command clearly.',
        color: 'blue',
        autoClose: 3000,
      });

    } catch (err) {
      console.error('[VoiceInput] Error starting recording:', err);
      setError(`Failed to start recording: ${err.message}`);
      setIsRecording(false); // Reset state on error
      // Ensure stream is cleaned up if start fails mid-way
       if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
      showNotification({
        title: 'Recording Error',
        message: 'Could not start recording. Check microphone permissions and availability.',
        color: 'red',
      });
    }
  };

  const handleStopRecording = () => {
    console.log('[VoiceInput] Stop recording requested...');
    // Check if recorder exists and is actually recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        setIsRecording(false); // Update UI immediately
        mediaRecorderRef.current.stop(); // Trigger the onstop event
    } else {
      console.warn(`[VoiceInput] Stop requested but recorder state is: ${mediaRecorderRef.current?.state}`);
      // If it wasn't recording, ensure states are reset
      setIsRecording(false);
      setIsProcessing(false); // Ensure processing isn't stuck true
    }
  };

  // Button disabled logic
  const buttonDisabled = isProcessing || hasPermission !== true;


  // Determine tooltip text
   let tooltipLabel = "Click and hold to record voice command";
   if (hasPermission === null) {
       tooltipLabel = "Checking microphone permissions...";
   } else if (hasPermission === false) {
       tooltipLabel = "Microphone access is denied or unavailable.";
   } else if (isProcessing) {
       tooltipLabel = "Processing previous command...";
   } else if (isRecording) {
       tooltipLabel = "Release to stop recording";
   }


  return (
    <Group position="right">
       {error && <Text color="red" size="sm" sx={{ maxWidth: '200px' }}>{error}</Text>}
      <Tooltip label={tooltipLabel} position="bottom" withArrow>
        {/* Wrap button in a div for Tooltip to work when button is disabled */}
        <div> 
          <Button
            color={isRecording ? "red" : "blue"}
            // Use onMouseDown/Up for mouse, onTouchStart/End for touch
            onMouseDown={!isRecording ? handleStartRecording : undefined} // Only start on mouse down if not already recording
            onMouseUp={isRecording ? handleStopRecording : undefined} // Only stop on mouse up if recording
            onTouchStart={!isRecording ? handleStartRecording : undefined}
            onTouchEnd={isRecording ? handleStopRecording : undefined}
            loading={isProcessing}
            disabled={buttonDisabled} // Use the combined disabled state
            aria-label={tooltipLabel} // Accessibility
          >
            {isProcessing ? "Processing..." : (isRecording ? "Recording..." : "Record Command")}
          </Button>
        </div>
      </Tooltip>
    </Group>
  );
}

export default VoiceInput;