// pages/index.js
import { useEffect, useState, useRef } from 'react'; // Import useRef
import { SignedIn, SignedOut, useUser } from '@clerk/nextjs';
import {
  Container, Title, Select, Button, Text, Loader, Group, Stack, Paper, Box, Grid, Alert, Progress, Collapse
} from '@mantine/core';
import { IconAlertCircle, IconCircleCheck, IconLoader } from '@tabler/icons-react';
import { showNotification, updateNotification } from '@mantine/notifications';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import FormField from '../components/FormField';
import VoiceInput from '../components/VoiceInput';
// Import new API client functions
import { getCompanies, getCompanyMemory, extractData, generatePdf, saveFormData, loadFormData } from '../lib/apiClient';
import { validateFormData } from '../lib/validationService';
import { formSchema } from '../config/formSchema';

const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

export default function Home() {
  const { isSignedIn, isLoaded: isUserLoaded } = useUser();
  const router = useRouter();

  const [companies, setCompanies] = useState([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [companiesError, setCompaniesError] = useState(null);

  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [companyMemory, setCompanyMemory] = useState(null); // Keep memory for potential re-extraction?
  const [formData, setFormData] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [isFormValid, setIsFormValid] = useState(false);

  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // --- New State for Save/Load ---
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSavedData, setIsLoadingSavedData] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState(null); // Optional: display last save time

  // Ref for auto-save timer
  const autoSaveTimerRef = useRef(null);

  // --- Fetch Companies ---
  useEffect(() => {
    if (isUserLoaded && isSignedIn) {
      loadCompanies();
    }
  }, [isUserLoaded, isSignedIn]);

  const loadCompanies = async () => {
    // ... (loadCompanies function remains the same) ...
     setIsLoadingCompanies(true);
    setCompaniesError(null);
    setCompanies([]);
    try {
      console.log("[Frontend] Fetching companies...");
      const data = await getCompanies();
      console.log("[Frontend] Raw companies data received:", data);

      if (Array.isArray(data)) {
        setCompanies(data);
        if (data.length === 0) {
          console.warn("[Frontend] No companies returned from API.");
          // showNotification({ title: 'Info', message: 'No companies found.', color: 'blue' });
        }
      } else {
          console.error("[Frontend] Received non-array data for companies:", data);
          setCompaniesError("Received invalid data format for companies.");
          showNotification({ title: 'Error', message: 'Could not load companies.', color: 'red' });
      }
    } catch (error) {
      console.error("[Frontend] Failed to load companies:", error);
      const errorMsg = error?.error || error?.message || 'Failed to load companies.';
      setCompaniesError(errorMsg);
      showNotification({ title: 'Error Loading Companies', message: errorMsg, color: 'red', autoClose: 7000 });
    } finally {
      setIsLoadingCompanies(false);
    }
  };

  // --- Form Validation ---
  const validateForm = (data) => {
    const { isValid, errors } = validateFormData(data, formSchema);
    setValidationErrors(errors);
    setIsFormValid(isValid);
    console.log("[Frontend] Form validation run. IsValid:", isValid, "Errors:", errors);
    return isValid;
  };

  // --- Input Change Handler ---
  const handleInputChange = (fieldName, value) => {
    console.log(`[Frontend] Input change: ${fieldName} =`, value);
    setFormData(prevData => {
        const updatedData = { ...prevData, [fieldName]: value };
        // Validate immediately after setting state
        // Note: Validation state update might lag by one render cycle if not handled carefully
        // Calling validateForm here updates validationErrors, but isFormValid relies on the *next* render's formData
        // For immediate feedback on button disable state, validate the *updatedData* directly
        const { isValid } = validateFormData(updatedData, formSchema);
        setIsFormValid(isValid); // Update validity based on the potential new state
        setValidationErrors(validateFormData(updatedData, formSchema).errors); // Update errors
        return updatedData;
    });
    // Auto-save logic will trigger via useEffect watching formData
  };

  // --- Auto-Save Logic ---
  const handleSaveForm = async (isAutoSave = false) => {
      if (!selectedCompanyId || Object.keys(formData).length === 0) {
          console.log("[Frontend] Save skipped: No company selected or form data is empty.");
          return; // Don't save if nothing to save or no context
      }
       if (isSaving) {
            console.log("[Frontend] Save skipped: Another save operation is already in progress.");
            return; // Prevent concurrent saves
       }

      setIsSaving(true);
      const notificationId = `save-${selectedCompanyId}`;
      if (isAutoSave) {
           console.log("[Frontend] Auto-saving form data...");
           showNotification({
                id: notificationId,
                title: 'Auto-saving...',
                message: `Saving progress for ${companies.find(c=>c.id === selectedCompanyId)?.name || 'current company'}...`,
                loading: true,
                color: 'blue',
                autoClose: false,
                disallowClose: true,
           });
      } else {
           console.log("[Frontend] Explicitly saving form data...");
           // Potentially show a different indicator for explicit saves if needed
      }


      try {
          // Use a snapshot of formData at the time of saving
          const dataToSave = { ...formData };
          const result = await saveFormData(selectedCompanyId, dataToSave);
          setLastSaveTime(new Date()); // Update last save time

           if (isAutoSave) {
                updateNotification({
                     id: notificationId,
                     title: 'Progress Saved',
                     message: `Your changes have been automatically saved.`,
                     color: 'green',
                     icon: <IconCircleCheck size="1rem" />,
                     loading: false,
                     autoClose: 3000,
                     disallowClose: false,
                });
                 console.log("[Frontend] Auto-save successful.");
           } else {
                showNotification({
                     title: 'Save Successful',
                     message: `Form data saved successfully.`,
                     color: 'green',
                });
                 console.log("[Frontend] Explicit save successful.");
           }

      } catch (error) {
          console.error("[Frontend] Failed to save form data:", error);
           const errorMsg = error?.error || error?.message || 'Could not save form data.';
           if (isAutoSave) {
                updateNotification({
                     id: notificationId,
                     title: 'Auto-save Failed',
                     message: errorMsg,
                     color: 'red',
                     icon: <IconAlertCircle size="1rem" />,
                     loading: false,
                     autoClose: 5000,
                     disallowClose: false,
                });
           } else {
                showNotification({
                     title: 'Save Failed',
                     message: errorMsg,
                     color: 'red',
                });
           }
      } finally {
          setIsSaving(false);
      }
  };

  useEffect(() => {
    // Clear previous timer if dependencies change
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Only set timer if we have a company selected and form data exists
    if (selectedCompanyId && Object.keys(formData).length > 0) {
      autoSaveTimerRef.current = setTimeout(() => {
        console.log(`[Frontend] Auto-save timer expired for company ${selectedCompanyId}. Triggering save.`);
        handleSaveForm(true); // Pass true to indicate it's an auto-save
      }, AUTO_SAVE_INTERVAL);

      console.log(`[Frontend] Auto-save timer set for ${AUTO_SAVE_INTERVAL / 1000}s`);
    }

    // Cleanup function to clear timer on unmount or before next effect run
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        console.log("[Frontend] Auto-save timer cleared.");
      }
    };
  }, [formData, selectedCompanyId]); // Rerun effect when formData or selectedCompanyId changes


  // --- Company Selection & Data Loading (REVISED LOGIC) ---
  const handleCompanySelect = async (companyId) => {
    console.log(`[Frontend] Company selected: ${companyId}`);
    setSelectedCompanyId(companyId);
    // Reset states consistently
    setCompanyMemory(null);
    setFormData({});
    setValidationErrors({});
    setIsFormValid(false);
    setIsLoadingMemory(false);
    setIsExtracting(false);
    setIsSaving(false);
    setLastSaveTime(null);
    setIsLoadingSavedData(false); // Ensure this is reset too
     if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
     }

    if (!companyId) return; // Exit if no company selected

    // Indicate general loading starts
    setIsLoadingSavedData(true); // Start with this indicator

    let loadedSuccessfully = false; // Flag to track if we loaded saved data

    try {
        // **Step 1: Attempt to load previously saved form data**
        console.log(`[Frontend] Attempting to load saved form data for company ${companyId}...`);
        const loadedData = await loadFormData(companyId);

        if (loadedData && typeof loadedData === 'object' && Object.keys(loadedData).length > 0) {
            console.log("[Frontend] Saved data found. Populating form.", loadedData);
            const completeLoadedData = {};
             Object.keys(formSchema).forEach(key => {
                 completeLoadedData[key] = loadedData.hasOwnProperty(key) ? loadedData[key] : (formSchema[key].type === 'checkbox' ? false : null);
             });
            setFormData(completeLoadedData);
            validateForm(completeLoadedData);
            showNotification({ /* ... Checkpoint Loaded notification ... */ });
            setLastSaveTime(new Date()); // Or use actual timestamp
            loadedSuccessfully = true; // Mark as loaded
        } else {
            console.log("[Frontend] No saved data found.");
            // Do NOT stop here, proceed to fetch memory/extract
        }

    } catch (error) {
         // Log error from loading attempt, but proceed to extraction as fallback
        console.error("[Frontend] Error loading saved form data:", error);
        showNotification({
            title: 'Could Not Load Saved Data',
            message: `Proceeding with initial data extraction. ${error?.error || error?.message || ''}`,
            color: 'orange',
            autoClose: 5000,
        });
        // Ensure form is reset if load fails badly
        setFormData({});
        validateForm({});
    } finally {
       setIsLoadingSavedData(false); // Finished attempting to load saved data
    }

    // **Step 2: If saved data wasn't loaded, fetch memory and extract**
    if (!loadedSuccessfully) {
        setIsLoadingMemory(true); // Now indicate memory loading
        setIsExtracting(true); // Expect extraction
        try {
            console.log(`[Frontend] Fetching company memory for company ${companyId}...`);
            const memory = await getCompanyMemory(companyId);
            setCompanyMemory(memory);
            setIsLoadingMemory(false); // Finished memory load

            if (memory) {
                console.log("[Frontend] Extracting data from memory...");
                const structured = memory?.structured_data || {};
                const unstructured = memory?.unstructured_transcripts || [];
                const extractedData = await extractData(structured, unstructured);

                const completeExtractedData = {};
                Object.keys(formSchema).forEach(key => {
                    completeExtractedData[key] = extractedData.hasOwnProperty(key) ? extractedData[key] : (formSchema[key].type === 'checkbox' ? false : null);
                });
                setFormData(completeExtractedData);
                validateForm(completeExtractedData);
                console.log("[Frontend] Data extraction complete.", completeExtractedData);
            } else {
                console.log("[Frontend] No company memory found. Initializing empty form.");
                const emptyFormData = {};
                Object.keys(formSchema).forEach(key => {
                    emptyFormData[key] = formSchema[key].type === 'checkbox' ? false : null;
                });
                setFormData(emptyFormData);
                validateForm(emptyFormData);
                 showNotification({
                     title: 'No Prior Data',
                     message: 'No saved progress or extraction data found. Starting fresh.',
                     color: 'blue',
                 });
            }
        } catch (error) {
            console.error("[Frontend] Error during memory fetch or extraction:", error);
            showNotification({
                title: 'Error Loading Initial Data',
                message: error?.error || error?.message || 'Failed to get initial data.',
                color: 'red',
            });
            // Reset form on error during extraction phase
            const emptyFormData = {};
            Object.keys(formSchema).forEach(key => {
                 emptyFormData[key] = formSchema[key].type === 'checkbox' ? false : null;
            });
             setFormData(emptyFormData);
             validateForm(emptyFormData);
        } finally {
            setIsLoadingMemory(false); // Ensure these are false regardless of success/failure
            setIsExtracting(false);
        }
    }
    // End of handleCompanySelect
  };


  // --- Voice Command Handling ---
  const handleVoiceCommand = (command) => {
    console.log("[Frontend] Received voice command:", command);
    if (!command) return;

    // Map 'UPDATE' with null value (from clearFormField) back to setting null
    if (command.intent === 'UPDATE') {
      if (formSchema[command.field]) {
        // Use handleInputChange to trigger validation and auto-save effect
        handleInputChange(command.field, command.value);
        showNotification({
          title: 'Voice Command Applied',
          message: `Set ${formSchema[command.field]?.label || command.field} to: ${command.value === null ? 'cleared' : command.value}`,
          color: 'green',
        });
      } else {
         console.warn(`Voice command tried to update non-existent field: ${command.field}`);
         showNotification({
           title: 'Voice Command Error',
           message: `Could not find field "${command.field}" in the form.`,
           color: 'orange',
         });
      }
    } else if (command.intent === 'AMBIGUOUS' || command.intent === 'OTHER') {
      showNotification({
        title: 'Voice Command Info',
        message: command.message || "Could not process the command.",
        color: 'yellow',
        autoClose: 6000,
      });
    }
    // Add handling for 'GET' if implemented later
  };


  // --- PDF Generation Trigger ---
  const handleFinalizeAndGenerate = async () => {
    // 1. Validate form one last time
    if (!validateForm(formData)) {
      showNotification({
        title: 'Validation Error',
        message: 'Please fix form errors before generating document.',
        color: 'red',
      });
      return;
    }

    // 2. Ensure latest data is saved before generating
    console.log("[Frontend] Finalizing... attempting final save.");
    // Clear any pending auto-save timer
     if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
     }
     // Trigger save (don't mark as auto-save for notifications)
    await handleSaveForm(false); // Await the save completion

     // Check if save failed (isSaving might still be true if error occurred in handleSaveForm)
     // We might need better error propagation from handleSaveForm if we need to halt generation
     // For now, proceed cautiously.

    // 3. Trigger PDF generation (currently mock)
    setIsGeneratingPdf(true);
    console.log("[Frontend] Generating document...");
    try {
      const result = await generatePdf(formData); // Call the mock generation API
      showNotification({
        title: 'Success',
        message: result.message || "Document download initiated.",
        color: 'green',
      });
    } catch (error) {
      console.error("[Frontend] Failed to generate document:", error);
      showNotification({
        title: 'Error',
        message: error?.error || 'Failed to generate document.',
        color: 'red',
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };


  // --- Render Logic ---
  const companySelectData = companies.map(company => ({
      value: company.id,
      label: company.name
  }));

  const showLoadingIndicator = isLoadingCompanies || isLoadingSavedData || isLoadingMemory || isExtracting;
  const showForm = selectedCompanyId && !showLoadingIndicator;
  const showNoDataMessage = selectedCompanyId && !showLoadingIndicator && Object.keys(formData).length === 0;

  return (
    <Layout>
      <SignedIn>
        <Container size="lg" py="xl">
          <Stack spacing="xl">
            <Title order={1}>Harper AI Challenge</Title>

            <Paper shadow="xs" p="md" withBorder>
              <Title order={3} mb="md">Select a Company</Title>
              {companiesError && ( <Alert icon={<IconAlertCircle size="1rem" />} title="Error!" color="red" withCloseButton onClose={() => setCompaniesError(null)}>{companiesError}</Alert> )}
              <Select
                label="Company"
                placeholder={isLoadingCompanies ? "Loading companies..." : "Select a company"}
                data={companySelectData}
                value={selectedCompanyId}
                onChange={handleCompanySelect}
                disabled={isLoadingCompanies || !!companiesError || showLoadingIndicator}
                searchable
                clearable
              />
               {/* Loading Indicators */}
                <Collapse in={isLoadingSavedData} mt="sm">
                   <Group><Loader size="xs" /><Text size="sm" color="dimmed">Checking for saved progress...</Text></Group>
                </Collapse>
                 <Collapse in={isLoadingMemory && !isLoadingSavedData} mt="sm">
                   <Group><Loader size="xs" /><Text size="sm" color="dimmed">Loading company data...</Text></Group>
                </Collapse>
                 <Collapse in={isExtracting} mt="sm">
                   <Group><Loader size="xs" /><Text size="sm" color="dimmed">Extracting data from memory...</Text></Group>
                </Collapse>
            </Paper>


            {selectedCompanyId && ( // Only show form section if a company is selected
                <Paper shadow="xs" p="md" withBorder>
                    <Group position="apart" mb="md">
                        <Title order={3}>Company Form {isSaving ? <IconLoader size="1rem" style={{marginLeft: '8px', animation: 'spin 1s linear infinite'}} /> : ''}</Title>
                        {showForm && <VoiceInput onCommandProcessed={handleVoiceCommand} />}
                    </Group>

                    {showForm ? (
                        <form>
                            <Grid>
                            {Object.entries(formSchema).map(([fieldName, fieldConfig]) => (
                                <Grid.Col span={12} md={6} key={fieldName}>
                                <FormField
                                    name={fieldName}
                                    config={fieldConfig}
                                    value={formData[fieldName]}
                                    error={validationErrors[fieldName]}
                                    onChange={(value) => handleInputChange(fieldName, value)}
                                />
                                </Grid.Col>
                            ))}
                            </Grid>

                            <Group position="right" mt="xl">
                            <Button
                                color="blue"
                                onClick={handleFinalizeAndGenerate} // Use the updated handler
                                loading={isGeneratingPdf || isSaving} // Also indicate loading during save
                                disabled={!isFormValid || isGeneratingPdf || isSaving}
                            >
                                {isSaving ? 'Saving...' : (isGeneratingPdf ? 'Generating...' : 'Finalize & Generate Document')}
                            </Button>
                            </Group>
                        </form>
                    ) : showNoDataMessage ? (
                         <Text color="dimmed">No data available or extracted for this company. Start filling the form.</Text>
                    ) : !selectedCompanyId ? (
                         <Text color="dimmed">Select a company to load or start a form.</Text>
                    ) : (
                        // This covers the loading states handled by Collapse above, but acts as fallback
                        <Text color="dimmed">Loading data...</Text>
                    )}
                </Paper>
             )}


          </Stack>
        </Container>
      </SignedIn>
      <SignedOut>
         {/* ... (SignedOut view remains the same) ... */}
         <Container size="sm" py="xl">
          <Paper shadow="xs" p="md" withBorder>
            <Stack align="center" spacing="md">
              <Title order={2}>Please Sign In</Title>
              <Text>You need to be signed in to access this application.</Text>
              <Button onClick={() => router.push('/sign-in')}>Sign In</Button>
            </Stack>
          </Paper>
        </Container>
      </SignedOut>
    </Layout>
  );
}