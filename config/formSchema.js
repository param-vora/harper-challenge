// config/formSchema.js

// Helper to check if a value is truly empty (null, undefined, or empty string)
const isEmpty = (v) => v === null || v === undefined || v === '';

export const formSchema = {
  legal_name: {
    label: 'Legal Name',
    type: 'text',
    required: true,
    // Validation: Required, must be a non-empty string, trim whitespace. Min length 1.
    validation: (v) => typeof v === 'string' && v.trim().length > 0,
  },
  business_description: {
    label: 'Business Description',
    type: 'textarea',
    required: false,
    // Validation: Optional. If provided, must be a string. Max length check (e.g., 1000 chars) could be added.
    validation: (v) => isEmpty(v) || typeof v === 'string',
    // Example adding max length:
    // validation: (v) => isEmpty(v) || (typeof v === 'string' && v.length <= 1000),
  },
  annual_revenue: {
    label: 'Annual Revenue',
    type: 'number',
    required: false,
    // Validation: Optional. If provided, must be a valid number >= 0.
    validation: (v) => isEmpty(v) || (typeof v === 'number' && !isNaN(v) && v >= 0),
  },
  num_vehicles: {
    label: 'Number of Vehicles (Trucking/Auto)',
    type: 'number',
    required: false,
    // Validation: Optional. If provided, must be a valid integer >= 0.
    validation: (v) => isEmpty(v) || (typeof v === 'number' && Number.isInteger(v) && v >= 0),
    // Alternative if input might be string needing parsing:
    // validation: (v) => {
    //   if (isEmpty(v)) return true;
    //   const num = Number(v);
    //   return !isNaN(num) && Number.isInteger(num) && num >= 0;
    // }
  },
  contact_email: {
    label: 'Contact Email',
    type: 'email',
    required: true,
    // Validation: Required, must be a string matching a basic email pattern.
    validation: (v) => typeof v === 'string' && /\S+@\S+\.\S+/.test(v.trim()),
  },
  address: {
    label: 'Business Address',
    type: 'text',
    required: true,
    // Validation: Required, must be a non-empty string after trimming. Min length 5?
    validation: (v) => typeof v === 'string' && v.trim().length >= 5,
  },
  fein: {
    label: 'Federal Employer Identification Number (FEIN)',
    type: 'text',
    required: true,
    // Validation: Required, must be a string exactly matching the XX-XXXXXXX format.
    validation: (v) => typeof v === 'string' && /^\d{2}-\d{7}$/.test(v.trim()),
  },
  industry_type: {
    label: 'Industry Type',
    type: 'select',
    required: false, // Assuming not strictly required for initial save
    options: [
      { value: 'construction', label: 'Construction' },
      { value: 'manufacturing', label: 'Manufacturing' },
      { value: 'retail', label: 'Retail' },
      { value: 'transportation', label: 'Transportation' },
      { value: 'healthcare', label: 'Healthcare' },
      { value: 'technology', label: 'Technology' },
      { value: 'other', label: 'Other' }
    ],
    // Validation: Optional. If provided, must be a string that matches one of the option values.
    validation: (v) => {
        if (isEmpty(v)) return true; // Allow empty if not required
        // Ensure options array is accessible (might need adjustment if schema structure changes)
        const validValues = formSchema.industry_type.options.map(opt => opt.value);
        return typeof v === 'string' && validValues.includes(v);
    }
  },
  has_employees: {
    label: 'Has Employees',
    type: 'checkbox',
    required: false, // Checkboxes are often optional boolean flags
    // Validation: Optional (defaults to false). If provided, must be explicitly true or false.
    validation: (v) => isEmpty(v) || typeof v === 'boolean',
  },
};

// You might add more complex validation logic or reusable validation functions above
// if needed, e.g., function validatePositiveNumber(v) { ... }