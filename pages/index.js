// pages/index.js
import { useEffect, useState } from 'react';
import { SignedIn, SignedOut, useUser } from '@clerk/nextjs';
import {
  Container,
  Title,
  Select,
  Button,
  Text,
  Loader,
  Group,
  Stack,
  Paper,
  Box,
  Grid,
  Alert,
  MantineProvider // Import MantineProvider to potentially isolate styling
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import FormField from '../components/FormField';
import VoiceInput from '../components/VoiceInput';
import { getCompanies, getCompanyMemory, extractData, generatePdf } from '../lib/apiClient';
import { validateFormData } from '../lib/validationService';
import { formSchema } from '../config/formSchema';

export default function Home() {
  const { isSignedIn, isLoaded: isUserLoaded } = useUser();
  const router = useRouter();
  
  const [companies, setCompanies] = useState([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [companiesError, setCompaniesError] = useState(null); 
  
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  // ... (other state variables remain the same) ...
  const [companyMemory, setCompanyMemory] = useState(null);
  const [formData, setFormData] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isFormValid, setIsFormValid] = useState(false);

  // Fetch companies when user is signed in
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
      console.log("[Frontend] Raw companies data received:", data); // Log raw data
      
      if (Array.isArray(data)) {
        setCompanies(data); // Update state
        if (data.length === 0) {
          console.warn("[Frontend] No companies returned from API.");
           showNotification({ title: 'Info', message: 'No companies found.', color: 'blue' });
        }
      } else {
          console.error("[Frontend] Received non-array data for companies:", data);
          setCompaniesError("Received invalid data format for companies.");
      }

    } catch (error) {
      console.error("[Frontend] Failed to load companies:", error);
      const errorMsg = error?.error || error?.message || 'Failed to load companies. Please check server logs and ensure the database is reachable.';
      setCompaniesError(errorMsg); 
      showNotification({ title: 'Error Loading Companies', message: errorMsg, color: 'red', autoClose: 7000 });
    } finally {
      setIsLoadingCompanies(false);
    }
  };
  
  // --- (Rest of the functions: handleCompanySelect, extractFormData, etc. unchanged) ---
  const handleCompanySelect = async (companyId) => {
    setSelectedCompanyId(companyId);
    setCompanyMemory(null);
    setFormData({});
    setValidationErrors({});
    
    if (!companyId) return;
    
    setIsLoadingMemory(true);
    try {
      const memory = await getCompanyMemory(companyId);
      setCompanyMemory(memory);
      if (memory) {
        extractFormData(memory);
      } else {
         showNotification({
           title: 'Info',
           message: 'No specific memory data found for this company.',
           color: 'yellow',
         });
      }
    } catch (error) {
      console.error("Failed to load company memory:", error);
      showNotification({
        title: 'Error',
        message: 'Failed to load company data. Please try again.',
        color: 'red',
      });
    } finally {
      setIsLoadingMemory(false);
    }
  };

  const extractFormData = async (memory) => {
    setIsExtracting(true);
    try {
      // Ensure structured_data and unstructured_transcripts exist before sending
      const structured = memory?.structured_data || {};
      const unstructured = memory?.unstructured_transcripts || [];
      
      const extractedData = await extractData(structured, unstructured);
      setFormData(extractedData || {}); 
      validateForm(extractedData || {});
    } catch (error) {
      console.error("Failed to extract data:", error);
      showNotification({
        title: 'Error',
        message: 'Failed to extract form data. Please try again.',
        color: 'red',
      });
      setFormData({}); 
    } finally {
      setIsExtracting(false);
    }
  };

  const validateForm = (data) => {
    const { isValid, errors } = validateFormData(data, formSchema);
    setValidationErrors(errors);
    setIsFormValid(isValid);
    return isValid;
  };

  const handleInputChange = (fieldName, value) => {
    const updatedFormData = {
      ...formData,
      [fieldName]: value
    };
    setFormData(updatedFormData);
    validateForm(updatedFormData);
  };

  const handleVoiceCommand = (command) => {
    if (command.intent === 'SET' || command.intent === 'UPDATE') {
      if (formSchema[command.field]) {
        handleInputChange(command.field, command.value);
        showNotification({
          title: 'Voice Command Applied',
          message: `Updated field: ${formSchema[command.field]?.label || command.field}`,
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
        message: command.message,
        color: 'yellow',
      });
    }
  };

  const handleGeneratePdf = async () => {
    if (!validateForm(formData)) {
      showNotification({
        title: 'Validation Error',
        message: 'Please fix form errors before generating document.',
        color: 'red',
      });
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const result = await generatePdf(formData);
      showNotification({
        title: 'Success',
        message: result.message || "Document download initiated.", 
        color: 'green',
      });
    } catch (error) {
      console.error("Failed to generate document:", error);
      showNotification({
        title: 'Error',
        message: error?.error || 'Failed to generate document. Please try again.',
        color: 'red',
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // --- Render Logic ---

  // 1. Prepare data for the Select component
  const companySelectData = companies.map(company => ({ 
      value: company.id, 
      label: company.name 
  }));
  
  // 2. Log the prepared data just before rendering
  console.log("[Frontend] Data prepared for Mantine Select:", companySelectData);
  
  return (
    <Layout>
       {/* Optionally wrap with MantineProvider here to test style isolation */}
       {/* <MantineProvider withGlobalStyles withNormalizeCSS theme={{ colorScheme: 'light' }}> */}
      <SignedIn>
        <Container size="lg" py="xl">
          <Stack spacing="xl">
            <Title order={1}>Harper AI Challenge</Title>
            
            <Paper shadow="xs" p="md" withBorder>
              <Title order={3} mb="md">Select a Company</Title>
              
              {companiesError && (
                <Alert icon={<IconAlertCircle size="1rem" />} title="Error!" color="red" withCloseButton onClose={() => setCompaniesError(null)}>
                  {companiesError}
                </Alert>
              )}

              {/* 3. Pass the prepared data */}
              // In pages/index.js, modify the Select component:
              <Select
                label="Company"
                placeholder="Select a company"
                data={companySelectData} 
                value={selectedCompanyId}
                onChange={handleCompanySelect}
                // Keep searchable and clearable if you want them, or leave them commented out
                // searchable 
                // clearable
                disabled={isLoadingCompanies || !!companiesError || companySelectData.length === 0}
                // Remove these two lines:
                // dropdownPosition="bottom" 
                // withinPortal={true} 
              />
            </Paper>

            {/* --- (Rest of the conditional rendering remains the same) --- */}
             {isLoadingMemory && (
              <Box sx={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <Loader size="md" />
                <Text ml="md">Loading company data...</Text>
              </Box>
            )}

            {isExtracting && (
              <Box sx={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <Loader size="md" />
                <Text ml="md">Extracting form data...</Text>
              </Box>
            )}

            {selectedCompanyId && !isLoadingMemory && !isExtracting && (
              <Paper shadow="xs" p="md" withBorder>
                <Group position="apart" mb="md">
                  <Title order={3}>Company Form</Title>
                  {Object.keys(formData).length > 0 && <VoiceInput onCommandProcessed={handleVoiceCommand} />}
                </Group>

                {Object.keys(formData).length > 0 ? (
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
                        onClick={handleGeneratePdf}
                        loading={isGeneratingPdf}
                        disabled={!isFormValid || isGeneratingPdf} 
                      >
                        Generate & Download Document
                      </Button>
                    </Group>
                  </form>
                ) : (
                   // Show loading indicator if memory was fetched but extraction is pending or failed
                   companyMemory ? 
                   <Text color="dimmed">Extracting form data or data unavailable...</Text> : 
                   <Text color="dimmed">Select a company to load data.</Text> 
                )}
              </Paper>
            )}
            {/* --- End of conditional form section --- */}

          </Stack>
        </Container>
      </SignedIn>
      
      <SignedOut>
        {/* --- Signed Out View --- */}
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
       {/* </MantineProvider> */}
    </Layout>
  );
}