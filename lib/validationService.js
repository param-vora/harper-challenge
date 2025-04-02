/**
 * Validates form data against the provided schema
 * 
 * @param {Object} formData - The form data to validate
 * @param {Object} schema - The form schema with validation rules
 * @returns {Object} - Object containing isValid flag and errors object
 */
export function validateFormData(formData, schema) {
  const errors = {};
  let isValid = true;

  // Validate each field in the schema
  Object.entries(schema).forEach(([fieldName, fieldConfig]) => {
    const value = formData[fieldName];
    
    // Check required fields
    if (fieldConfig.required && (value === undefined || value === null || value === '')) {
      errors[fieldName] = `${fieldConfig.label} is required`;
      isValid = false;
    } 
    // Apply custom validation if field has a value
    else if (value !== undefined && value !== null && value !== '' && fieldConfig.validation) {
      const isFieldValid = fieldConfig.validation(value);
      if (!isFieldValid) {
        errors[fieldName] = `Invalid ${fieldConfig.label}`;
        isValid = false;
      }
    }
  });

  return { isValid, errors };
}
