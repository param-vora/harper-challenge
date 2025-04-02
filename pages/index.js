// pages/index.js
import { useEffect, useState, useRef } from 'react'; // Import useRef
import { SignedIn, SignedOut, useUser } from '@clerk/nextjs';
import {
  Container, Title, Select, Button, Text, Loader, Group, Stack, Paper, Box, Grid, Alert, Progress, Collapse, Divider
} from '@mantine/core';
import { IconAlertCircle, IconCircleCheck, IconLoader } from '@tabler/icons-react';
import { showNotification, updateNotification } from '@mantine/notifications';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import FormField from '../components/FormField';
import VoiceInput from '../components/VoiceInput';
// Import new API client functions
import { getCompanies, getCompanyMemory, extractData, generatePdf, saveFormData, loadFormData } from '../lib/apiClient';
// Import validation and schema (now includes applyDefaultsToFormData)
import { formSchema, validateAcord125Data, applyDefaultsToFormData } from '../config/formSchema';

const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

export default function Home() {
  const { isSignedIn, isLoaded: isUserLoaded } = useUser();
  const router = useRouter();

  const [companies, setCompanies] = useState([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [companiesError, setCompaniesError] = useState(null);

  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [companyMemory, setCompanyMemory] = useState(null); // Keep memory for potential re-extraction?
  const [formData, setFormData] = useState({}); // Initial empty state
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
  // Uses the imported validateAcord125Data function
  const validateForm = (data) => {
    const { isValid, errors } = validateAcord125Data(data);
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
        // Validate immediately after setting state using the *updated* data
        const { isValid, errors } = validateAcord125Data(updatedData);
        setIsFormValid(isValid); // Update validity based on the potential new state
        setValidationErrors(errors); // Update errors
        return updatedData;
    });
    // Auto-save logic will trigger via useEffect watching formData
  };

  // --- Auto-Save Logic ---
  const handleSaveForm = async (isAutoSave = false) => {
      if (!selectedCompanyId || Object.keys(formData).length === 0) {
          console.log("[Frontend] Save skipped: No company selected or form data is empty.");
          return;
      }
       if (isSaving) {
            console.log("[Frontend] Save skipped: Another save operation is already in progress.");
            return;
       }

      setIsSaving(true);
      const notificationId = `save-${selectedCompanyId}`;
      if (isAutoSave) {
           console.log("[Frontend] Auto-saving form data...");
           // Less intrusive notification for auto-save perhaps? Or keep as is.
           showNotification({
                id: notificationId,
                title: 'Auto-saving...',
                message: `Saving progress...`,
                loading: true,
                color: 'blue',
                autoClose: false,
                disallowClose: true,
           });
      } else {
           console.log("[Frontend] Explicitly saving form data...");
      }


      try {
          const dataToSave = { ...formData };
          await saveFormData(selectedCompanyId, dataToSave);
          setLastSaveTime(new Date());

           if (isAutoSave) {
                updateNotification({
                     id: notificationId,
                     title: 'Progress Saved',
                     message: `Changes automatically saved.`,
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
                     message: `Form data saved.`,
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

  // --- Auto-Save Timer Effect ---
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    if (selectedCompanyId && Object.keys(formData).length > 0 && !isSaving) { // Also check !isSaving
      autoSaveTimerRef.current = setTimeout(() => {
        console.log(`[Frontend] Auto-save timer expired. Triggering save.`);
        handleSaveForm(true);
      }, AUTO_SAVE_INTERVAL);
      console.log(`[Frontend] Auto-save timer set for ${AUTO_SAVE_INTERVAL / 1000}s`);
    }
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        console.log("[Frontend] Auto-save timer cleared.");
      }
    };
  }, [formData, selectedCompanyId, isSaving]); // Rerun when formData, company, or saving state changes


  // --- Company Selection & Data Loading (REVISED LOGIC WITH DEFAULTS) ---
  const handleCompanySelect = async (companyId) => {
    console.log(`[Frontend] Company selected: ${companyId}`);
    setSelectedCompanyId(companyId);
    // Reset states consistently
    setCompanyMemory(null);
    setFormData({}); // Start with empty
    setValidationErrors({});
    setIsFormValid(false);
    setIsLoadingMemory(false);
    setIsExtracting(false);
    setIsSaving(false);
    setLastSaveTime(null);
    setIsLoadingSavedData(false);
     if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
     }

    if (!companyId) {
        setFormData(applyDefaultsToFormData({})); // Apply defaults even if no company selected
        validateForm({});
        return;
    }

    setIsLoadingSavedData(true);
    let loadedData = null; // Store loaded/extracted data before applying defaults

    try {
        // **Step 1: Attempt to load previously saved form data**
        console.log(`[Frontend] Attempting to load saved form data for company ${companyId}...`);
        const savedData = await loadFormData(companyId);

        if (savedData && typeof savedData === 'object' && Object.keys(savedData).length > 0) {
            console.log("[Frontend] Saved data found.", savedData);
            loadedData = savedData; // Use saved data
            showNotification({ title: 'Progress Loaded', message: 'Loaded previously saved data.', color: 'teal' });
            setLastSaveTime(new Date()); // Or use actual timestamp from data if available
        } else {
            console.log("[Frontend] No saved data found. Proceeding to extraction.");
            // **Step 2: Fetch memory and extract if no saved data**
            setIsLoadingMemory(true);
            setIsExtracting(true);
            try {
                console.log(`[Frontend] Fetching company memory for company ${companyId}...`);
                const memory = await getCompanyMemory(companyId);
                setCompanyMemory(memory); // Store raw memory if needed
                setIsLoadingMemory(false);

                if (memory) {
                    console.log("[Frontend] Extracting data from memory...");
                    const structured = memory?.structured_data || {};
                    const unstructured = memory?.unstructured_transcripts || [];
                    const extracted = await extractData(structured, unstructured);
                    loadedData = extracted; // Use extracted data
                    console.log("[Frontend] Data extraction complete.", extracted);
                } else {
                    console.log("[Frontend] No company memory found. Initializing with defaults.");
                    loadedData = {}; // Start with empty object before defaults
                    showNotification({
                        title: 'No Prior Data',
                        message: 'No saved progress or extraction data found. Starting fresh with defaults.',
                        color: 'blue',
                    });
                }
            } catch (extractError) {
                 console.error("[Frontend] Error during memory fetch or extraction:", extractError);
                 showNotification({
                     title: 'Error Loading Initial Data',
                     message: extractError?.error || extractError?.message || 'Failed to get initial data.',
                     color: 'red',
                 });
                 loadedData = {}; // Reset to empty on error before defaults
            } finally {
                setIsLoadingMemory(false);
                setIsExtracting(false);
            }
        }

    } catch (loadError) {
        console.error("[Frontend] Error loading saved form data:", loadError);
        showNotification({
            title: 'Could Not Load Saved Data',
            message: `Proceeding with initial data extraction or defaults. ${loadError?.error || loadError?.message || ''}`,
            color: 'orange',
            autoClose: 5000,
        });
        loadedData = {}; // Reset to empty on load error before defaults
    } finally {
       setIsLoadingSavedData(false);
       // **Step 3: Apply defaults AFTER loading or extracting**
       const finalDataWithDefaults = applyDefaultsToFormData(loadedData);
       console.log("[Frontend] Final data after applying defaults:", finalDataWithDefaults);
       setFormData(finalDataWithDefaults);
       validateForm(finalDataWithDefaults); // Validate the data with defaults applied
    }
    // End of handleCompanySelect
  };


  // --- Voice Command Handling ---
  const handleVoiceCommand = (command) => {
    console.log("[Frontend] Received voice command:", command);
    if (!command || command.intent !== 'UPDATE') {
         showNotification({
           title: 'Voice Command Info',
           message: command?.message || "Could not process the command or no update action detected.",
           color: command?.intent === 'AMBIGUOUS' ? 'yellow' : 'blue',
           autoClose: 6000,
         });
         return;
    }

    // Handle UPDATE intent (including clear mapped to null)
    if (formSchema[command.field]) {
      handleInputChange(command.field, command.value); // Use standard handler
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
  };


  // --- PDF Generation Trigger ---
  const handleFinalizeAndGenerate = async () => {
    // 1. Validate form one last time
    const { isValid, errors } = validateAcord125Data(formData);
    if (!isValid) {
        setValidationErrors(errors);
        showNotification({
            title: 'Validation Error',
            message: 'Please fix the highlighted errors before generating the document.',
            color: 'red',
        });
        // Consider scrolling to the first error
        return;
    }

    // 2. Optional: Ensure latest data is saved (using mock save)
     if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
     }
    await handleSaveForm(false); // Explicitly save before generating

    // 3. Trigger PDF generation API call
    setIsGeneratingPdf(true);
    console.log("[Frontend] Calling API to generate PDF with data:", formData); // Log data being sent
    const notificationId = 'pdf-generation';
    showNotification({ /* ... existing notification ... */ });

    try {
        // Send current validated formData (now includes defaults and agency info)
        const response = await fetch('/api/generate-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
        });

        if (!response.ok) { /* ... existing error handling ... */
             let errorDetails = `Server responded with status ${response.status}`;
             try {
                const errorJson = await response.json();
                errorDetails = errorJson.error || errorJson.details || errorDetails;
             } catch (e) { /* Ignore */ }
             throw new Error(errorDetails);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/pdf')) {
             throw new Error('Received unexpected response format instead of PDF.');
        }

        // Handle PDF Download (existing logic is fine)
        const disposition = response.headers.get('content-disposition');
        let filename = 'ACORD_125_Generated.pdf';
        if (disposition && disposition.indexOf('attachment') !== -1) { /* ... extract filename ... */ }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none'; a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); document.body.removeChild(a);

        updateNotification({ /* ... existing success notification ... */ });

    } catch (error) {
      console.error("[Frontend] Failed to generate document:", error);
      updateNotification({ /* ... existing error notification ... */ });
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
  const showForm = isUserLoaded && isSignedIn && selectedCompanyId && !showLoadingIndicator;
  const showSelectCompanyMessage = isUserLoaded && isSignedIn && !selectedCompanyId && !showLoadingIndicator;

  // Filter schema keys for rendering sections
  const agencyFields = Object.keys(formSchema).filter(key => key.startsWith('agency_'));
  const policyFields = ['policy_eff_date', 'policy_exp_date'];
  const applicantFields = ['legal_name', 'applicant_address', 'business_phone', 'applicant_entity_type', 'fein', 'sic', 'naics'];
  const contactFields = ['contact_name', 'contact_email', 'contact_phone'];
  const premisesFields = ['premise_address', 'city_limits', 'annual_revenue'];
  const businessDetailFields = ['nature_of_business', 'business_description'];

  // Function to render a section of the form
  const renderFormSection = (title, fieldKeys) => (
      <>
          <Grid.Col span={12}>
              <Divider my="sm" label={<Title order={5}>{title}</Title>} labelPosition="left" />
          </Grid.Col>
          {fieldKeys.map(fieldName => (
              <Grid.Col span={12} md={6} key={fieldName}>
                  <FormField
                      name={fieldName}
                      config={formSchema[fieldName]}
                      value={formData[fieldName]}
                      error={validationErrors[fieldName]}
                      onChange={(value) => handleInputChange(fieldName, value)}
                      // Consider adding a disabled prop for agency fields if needed:
                      // disabled={fieldName.startsWith('agency_')}
                  />
              </Grid.Col>
          ))}
      </>
  );

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


            {(showForm || showSelectCompanyMessage) && ( // Show form container if signed in, even if no company selected yet
                <Paper shadow="xs" p="md" withBorder>
                    <Group position="apart" mb="md">
                        <Title order={3}>
                            ACORD 125 Data
                            {selectedCompanyId && isSaving ? <IconLoader size="1rem" style={{marginLeft: '8px', animation: 'spin 1s linear infinite'}} /> : ''}
                        </Title>
                        {showForm && <VoiceInput onCommandProcessed={handleVoiceCommand} />}
                    </Group>

                    {showForm ? (
                        <form>
                            <Grid>
                                {renderFormSection("Agency Information", agencyFields)}
                                {renderFormSection("Policy Information", policyFields)}
                                {renderFormSection("Applicant Information", applicantFields)}
                                {renderFormSection("Primary Contact Information", contactFields)}
                                {renderFormSection("Primary Premises Information", premisesFields)}
                                {renderFormSection("Business Details", businessDetailFields)}
                            </Grid>

                            <Group position="right" mt="xl">
                            <Button
                                color="blue"
                                onClick={handleFinalizeAndGenerate}
                                loading={isGeneratingPdf || isSaving}
                                disabled={!isFormValid || isGeneratingPdf || isSaving}
                            >
                                {isSaving ? 'Saving...' : (isGeneratingPdf ? 'Generating...' : 'Finalize & Generate Document')}
                            </Button>
                            </Group>
                        </form>
                    ) : showSelectCompanyMessage ? (
                         <Text color="dimmed">Select a company above to load data or start a new form.</Text>
                    ) : (
                        // Fallback for loading states handled by Collapse, but good to have
                        <Text color="dimmed">Loading data...</Text>
                    )}
                </Paper>
             )}


          </Stack>
        </Container>
      </SignedIn>
      <SignedOut>
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