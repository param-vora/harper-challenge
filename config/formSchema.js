// config/formSchema.js

// --- Helper Functions (Keep from previous version) ---
const isEmpty = (v) => v === null || v === undefined || v === '';
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isNonNegativeNumber = (v) => typeof v === 'number' && !isNaN(v) && v >= 0;
const isPhoneNumber = (v) => typeof v === 'string' && /^[+]?[\d\s()-.]{7,}$/.test(v.trim());
const isEmail = (v) => typeof v === 'string' && /\S+@\S+\.\S+/.test(v.trim());
const isIsoDateString = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
const isValidOption = (v, options) => !isEmpty(v) && options.some(opt => opt.value === v);
// --- End Helpers ---

// --- Hardcoded Agency Info (Use later in API, not in schema) ---
export const AGENCY_INFO = {
    name: "Tatch Co.",
    address: "1035 Rockingham Street, Alpharetta, GA, 30022",
    contactName: "Shabaig Chatha",
    phone: "(770) 470-2936",
    email: "shabaig@tatchinsurance.com",
    // fax: "" // Add if needed
};
// ---

// --- Define Options for Select fields based on ACORD 125 PDF ---
const applicantBusinessTypeOptions = [
    { value: 'Corporation', label: 'Corporation' },
    { value: 'Individual', label: 'Individual' },
    { value: 'Joint Venture', label: 'Joint Venture' },
    { value: 'LLC', label: 'LLC' },
    { value: 'Partnership', label: 'Partnership' },
    { value: 'Not For Profit Org', label: 'Not For Profit Org' },
    { value: 'Subchapter S Corporation', label: 'Subchapter "S" Corporation' },
    { value: 'Trust', label: 'Trust' }
];

const natureOfBusinessOptions = [
    { value: 'Apartments', label: 'Apartments' },
    { value: 'Contractor', label: 'Contractor' },
    { value: 'Manufacturing', label: 'Manufacturing' },
    { value: 'Restaurant', label: 'Restaurant' },
    { value: 'Service', label: 'Service' },
    { value: 'Wholesale', label: 'Wholesale' },
    { value: 'Condominiums', label: 'Condominiums' },
    { value: 'Institutional', label: 'Institutional' },
    { value: 'Office', label: 'Office' },
    { value: 'Retail', label: 'Retail' }
];

const cityLimitsOptions = [
    { value: 'Inside', label: 'Inside City Limits' },
    { value: 'Outside', label: 'Outside City Limits' }
];
// --- End Options ---


// --- ACORD 125 Focused Schema ---
export const formSchema = {
    // --- Policy Info ---
    // NOTE: Using simple keys, map to Anvil slugs ('proposedEffectiveDate', 'proposedExpirationDate') later
    policy_eff_date: {
        label: 'Proposed Eff. Date',
        type: 'date',
        required: true,
        validation: isIsoDateString,
        anvilId: 'proposedEffectiveDate' // Or proposedEffectiveDate1 etc.
    },
    policy_exp_date: {
        label: 'Proposed Exp. Date',
        type: 'date',
        required: true,
        validation: isIsoDateString,
        anvilId: 'proposedExpirationDate' // Or proposedExpirationDate1 etc.
    },

    // --- Applicant Info (Page 1) ---
    legal_name: {
        label: 'Applicant Legal Name', // Matches form label
        type: 'text',
        required: true,
        validation: isNonEmptyString,
        anvilId: 'applicantName' // NOTE: Anvil expects {firstName, lastName}? Parsing needed later.
    },
    applicant_address: {
        label: 'Applicant Mailing Address', // Full address for now
        type: 'textarea',
        required: true,
        validation: (v) => typeof v === 'string' && v.trim().length >= 15, // Stricter length
        anvilId: 'mailingAddress' // NOTE: Anvil expects {street1, city, state, zip}? Parsing needed later.
    },
    business_phone: {
        label: 'Applicant Business Phone',
        type: 'text',
        required: true,
        validation: isPhoneNumber,
        anvilId: 'businessPhone' // Matches Anvil slug
    },
    applicant_entity_type: {
        label: 'Applicant Entity Type',
        type: 'select',
        required: true,
        options: applicantBusinessTypeOptions,
        validation: (v) => isValidOption(v, applicantBusinessTypeOptions),
        anvilId: 'applicantBusinessType' // Or applicantBusinessType1 etc.
    },
     fein: {
        label: 'FEIN',
        type: 'text',
        required: true, // Required for ACORD
        validation: (v) => typeof v === 'string' && /^\d{2}-\d{7}$/.test(v.trim()),
        anvilId: 'feinOrSocSec' // Matches Anvil slug
     },
     sic: {
         label: 'SIC Code',
         type: 'text',
         required: false, // Usually optional but good to have
         validation: (v) => isEmpty(v) || /^\d{4}$/.test(v.trim()),
         anvilId: 'sic' // Matches Anvil slug
     },
     naics: {
         label: 'NAICS Code',
         type: 'text',
         required: false, // Usually optional but good to have
         validation: (v) => isEmpty(v) || /^\d{6}$/.test(v.trim()),
         anvilId: 'naics' // Matches Anvil slug
     },

    // --- Contact Info (Page 2) ---
    contact_name: {
        label: 'Primary Contact Name',
        type: 'text',
        required: true,
        validation: isNonEmptyString,
        // anvilId: Check Anvil template for specific contact name field slug
    },
    contact_email: {
        label: 'Primary Contact Email',
        type: 'email',
        required: true,
        validation: isEmail,
        // anvilId: Check Anvil template for specific contact email field slug
    },
    contact_phone: {
        label: 'Primary Contact Phone',
        type: 'text',
        required: true,
        validation: isPhoneNumber,
        // anvilId: Check Anvil template for specific contact phone field slug
    },

    // --- Premises Info (Page 2 - Simplified to first location) ---
    premise_address: {
        label: 'Primary Premise Address', // Full address for now
        type: 'textarea',
        required: true,
        validation: (v) => typeof v === 'string' && v.trim().length >= 15,
        anvilId: 'street' // NOTE: Anvil expects {street1, city, state, zip}? Parsing needed later. Map to 'street' for now? Check Anvil template.
    },
    city_limits: {
        label: 'Premise City Limits',
        type: 'select', // Using select for clear Inside/Outside
        required: true,
        options: cityLimitsOptions,
        validation: (v) => isValidOption(v, cityLimitsOptions),
        anvilId: ['insideCityLimits', 'outsideCityLimits'] // NOTE: Needs logic later to set boolean based on value
    },
    annual_revenue: {
        label: 'Annual Revenue ($)',
        type: 'number',
        required: true,
        validation: isNonNegativeNumber,
        anvilId: 'annualRevenues' // Matches Anvil slug (check pluralization)
    },

    // --- Nature of Business (Page 2) ---
     nature_of_business: {
        label: 'Nature of Business',
        type: 'select',
        required: true,
        options: natureOfBusinessOptions,
        validation: (v) => isValidOption(v, natureOfBusinessOptions),
        anvilId: 'natureOfBusiness' // Matches Anvil slug
     },
     business_description: {
        label: 'Description of Operations',
        type: 'textarea',
        required: true,
        validation: (v) => typeof v === 'string' && v.trim().length >= 10,
        anvilId: 'descriptionOfPrimaryOperations' // Matches Anvil slug
     },

     // --- Remove fields not explicitly required for ACORD 125 core ---
     // num_vehicles: { ... }
     // has_employees: { ... }
     // industry_type: { ... } // Replaced by nature_of_business
};

// --- Updated Validation Function (incorporates schema directly) ---
export function validateAcord125Data(formData) {
    const errors = {};
    let isValid = true;

    for (const fieldName in formSchema) {
        const fieldConfig = formSchema[fieldName];
        const value = formData ? formData[fieldName] : undefined; // Handle case where formData might be null/undefined initially

        // Check Required
        if (fieldConfig.required) {
            if (isEmpty(value)) { // Simple check for null/undefined/empty string
                 errors[fieldName] = `${fieldConfig.label} is required`;
                 isValid = false;
                 continue; // Skip further validation if required field is missing
            }
        }

        // Apply custom validation function if value exists and validation defined
        if (!isEmpty(value) && fieldConfig.validation) {
             const isFieldValid = fieldConfig.validation(value);
             if (!isFieldValid) {
                 // Provide more specific errors
                 if (fieldName === 'fein') errors[fieldName] = `Invalid ${fieldConfig.label}. Format: XX-XXXXXXX`;
                 else if (fieldName === 'policy_eff_date' || fieldName === 'policy_exp_date') errors[fieldName] = `Invalid date format for ${fieldConfig.label}. Use YYYY-MM-DD.`;
                 else if (fieldConfig.type === 'email') errors[fieldName] = `Invalid ${fieldConfig.label} format.`;
                 else if (fieldConfig.type === 'number' && !isNonNegativeNumber(value)) errors[fieldName] = `${fieldConfig.label} must be a non-negative number.`;
                 else if (fieldName === 'applicant_address' || fieldName === 'premise_address') errors[fieldName] = `${fieldConfig.label} must be at least 15 characters.`;
                 else if (fieldName === 'business_description') errors[fieldName] = `${fieldConfig.label} must be at least 10 characters.`;
                 else if (fieldConfig.type === 'select') errors[fieldName] = `Invalid selection for ${fieldConfig.label}.`;
                 else errors[fieldName] = `Invalid value for ${fieldConfig.label}.`;

                 isValid = false;
             }
        }
    }
    return { isValid, errors };
}