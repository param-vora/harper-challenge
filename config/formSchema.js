export const formSchema = {
  legal_name: { 
    label: 'Legal Name', 
    type: 'text', 
    required: true, 
    validation: (v) => !!v && typeof v === 'string' && v.trim().length > 0 
  },
  business_description: { 
    label: 'Business Description', 
    type: 'textarea', 
    required: false, 
    validation: (v) => !v || (typeof v === 'string') 
  },
  annual_revenue: { 
    label: 'Annual Revenue', 
    type: 'number', 
    required: false, 
    validation: (v) => v === null || v === '' || (typeof v === 'number' && v >= 0) 
  },
  num_vehicles: { 
    label: 'Number of Vehicles (Trucking/Auto)', 
    type: 'number', 
    required: false, 
    validation: (v) => v === null || v === '' || (Number.isInteger(Number(v)) && Number(v) >= 0) 
  },
  contact_email: { 
    label: 'Contact Email', 
    type: 'email', 
    required: true, 
    validation: (v) => /\S+@\S+\.\S+/.test(v) 
  },
  address: { 
    label: 'Business Address', 
    type: 'text', 
    required: true, 
    validation: (v) => !!v && typeof v === 'string' && v.trim().length > 0 
  },
  fein: { 
    label: 'Federal Employer Identification Number (FEIN)', 
    type: 'text', 
    required: true, 
    validation: (v) => !!v && /^\d{2}-\d{7}$/.test(v) 
  },
  industry_type: { 
    label: 'Industry Type', 
    type: 'select', 
    required: false,
    options: [
      { value: 'construction', label: 'Construction' },
      { value: 'manufacturing', label: 'Manufacturing' },
      { value: 'retail', label: 'Retail' },
      { value: 'transportation', label: 'Transportation' },
      { value: 'healthcare', label: 'Healthcare' },
      { value: 'technology', label: 'Technology' },
      { value: 'other', label: 'Other' }
    ],
    validation: (v) => !v || typeof v === 'string'
  },
  has_employees: { 
    label: 'Has Employees', 
    type: 'checkbox', 
    required: false, 
    validation: (v) => typeof v === 'boolean' || v === undefined || v === null 
  },
};
