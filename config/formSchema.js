// config/formSchema.js

// --- Helper Functions (Keep from previous version) ---
const isEmpty = (v) => v === null || v === undefined || v === '';
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isNonNegativeNumber = (v) => typeof v === 'number' && !isNaN(v) && v >= 0;
const isPhoneNumber = (v) => typeof v === 'string' && /^[+]?[\d\s()-.]{7,}$/.test(v.trim());
const isEmail = (v) => typeof v === 'string' && /\S+@\S+\.\S+/.test(v.trim());
const isIsoDateString = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
const isValidOption = (v, options) => !isEmpty(v) && options.some(opt => opt.value === v);
const isFeinFormat = (v) => typeof v === 'string' && /^\d{2}-\d{7}$/.test(v.trim());
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
    { value: 'Retail', label: 'Retail' },
    { value: 'Other', label: 'Other' } // Added 'Other' option
];

const cityLimitsOptions = [
    { value: 'Inside', label: 'Inside City Limits' },
    { value: 'Outside', label: 'Outside City Limits' }
];
// --- End Options ---


// --- ACORD 125 Focused Schema ---
export const formSchema = {
    // --- Policy Info ---
    policy_eff_date: {
        label: 'Proposed Eff. Date',
        type: 'date',
        required: false, // Using placeholder
        validation: (v) => isEmpty(v) || isIsoDateString(v), // Validate format if provided
        // Placeholder applied in generate-pdf.js
    },
    policy_exp_date: {
        label: 'Proposed Exp. Date',
        type: 'date',
        required: false, // Using placeholder
        validation: (v) => isEmpty(v) || isIsoDateString(v), // Validate format if provided
        // Placeholder applied in generate-pdf.js
    },

    // --- Applicant Info (Page 1) ---
    legal_name: {
        label: 'Applicant Legal Name',
        type: 'text',
        required: true,
        validation: isNonEmptyString,
        // anvilId: 'applicantName' -> needs parsing
    },
    applicant_address: {
        label: 'Applicant Mailing Address',
        type: 'textarea',
        required: true,
        validation: (v) => typeof v === 'string' && v.trim().length >= 15,
        // anvilId: 'mailingAddress' -> needs parsing
    },
    business_phone: {
        label: 'Applicant Business Phone',
        type: 'text',
        required: true,
        validation: isPhoneNumber,
        // anvilId: 'businessPhone' -> needs formatting
    },
    applicant_entity_type: {
        label: 'Applicant Entity Type',
        type: 'select',
        required: true,
        options: applicantBusinessTypeOptions,
        validation: (v) => isValidOption(v, applicantBusinessTypeOptions),
        // anvilId: 'applicantBusinessType'
    },
     fein: {
        label: 'FEIN',
        type: 'text',
        required: false, // Made optional as requested
        validation: (v) => isEmpty(v) || isFeinFormat(v), // Validate format ONLY if provided
        // anvilId: 'feinOrSocSec'
     },
     sic: {
         label: 'SIC Code',
         type: 'text',
         required: false,
         validation: (v) => isEmpty(v) || /^\d{4}$/.test(v.trim()),
         // anvilId: 'sic'
     },
     naics: {
         label: 'NAICS Code',
         type: 'text',
         required: false,
         validation: (v) => isEmpty(v) || /^\d{6}$/.test(v.trim()),
         // anvilId: 'naics'
     },

    // --- Contact Info (Page 2) ---
    contact_name: {
        label: 'Primary Contact Name',
        type: 'text',
        required: true,
        validation: isNonEmptyString,
        // anvilId: n/a (or custom) -> needs parsing
    },
    contact_email: {
        label: 'Primary Contact Email',
        type: 'email',
        required: true,
        validation: isEmail,
        // anvilId: n/a (or custom)
    },
    contact_phone: {
        label: 'Primary Contact Phone',
        type: 'text',
        required: true,
        validation: isPhoneNumber,
        // anvilId: 'phoneACNoExt' -> needs formatting
    },

    // --- Premises Info (Page 2 - Simplified to first location) ---
    premise_address: {
        label: 'Primary Premise Address',
        type: 'textarea',
        required: true,
        validation: (v) => typeof v === 'string' && v.trim().length >= 15,
        // anvilId: 'street' -> needs parsing
    },
    city_limits: {
        label: 'Premise City Limits',
        type: 'select',
        required: false, // Made optional as requested
        options: cityLimitsOptions,
        validation: (v) => isEmpty(v) || isValidOption(v, cityLimitsOptions), // Validate only if provided
        // anvilId: 'insideCityLimits', 'outsideCityLimits' -> needs boolean logic
    },
    annual_revenue: {
        label: 'Annual Revenue ($)',
        type: 'number',
        required: true,
        validation: isNonNegativeNumber,
        // anvilId: 'annualRevenues'
    },

    // --- Nature of Business (Page 2) ---
     nature_of_business: {
        label: 'Nature of Business',
        type: 'select',
        required: true, // Keep required, but allow 'Other'
        options: natureOfBusinessOptions, // Includes 'Other' now
        validation: (v) => isValidOption(v, natureOfBusinessOptions),
        // anvilId: 'natureOfBusiness' -> Default to 'Other' in payload if needed
     },
     business_description: {
        label: 'Description of Operations',
        type: 'textarea',
        required: true,
        validation: (v) => typeof v === 'string' && v.trim().length >= 10,
        // anvilId: 'descriptionOfPrimaryOperations'
     },
};

// --- Updated Validation Function ---
export function validateAcord125Data(formData) {
    const errors = {};
    let isValid = true;

    for (const fieldName in formSchema) {
        const fieldConfig = formSchema[fieldName];
        const value = formData ? formData[fieldName] : undefined;

        // Check Required (only if fieldConfig.required is true)
        if (fieldConfig.required && isEmpty(value)) {
            errors[fieldName] = `${fieldConfig.label} is required`;
            isValid = false;
            continue; // Skip further validation if required field is missing
        }

        // Apply custom validation function if value exists and validation defined
        // Only validate non-empty values unless the validation function itself handles empty checks
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
                 else if (fieldName === 'sic') errors[fieldName] = `Invalid ${fieldConfig.label}. Expected 4 digits.`;
                 else if (fieldName === 'naics') errors[fieldName] = `Invalid ${fieldConfig.label}. Expected 6 digits.`;
                 else errors[fieldName] = `Invalid value for ${fieldConfig.label}.`;

                 isValid = false;
             }
        }
    }
    return { isValid, errors };
}