import React from 'react';
import { 
  TextInput, 
  NumberInput, 
  Checkbox, 
  Select, 
  Textarea,
  Text
} from '@mantine/core';

/**
 * Generic form field component that renders the appropriate input based on field type
 */
function FormField({ name, config, value, error, onChange }) {
  const { label, type, required, options } = config;
  const renderField = () => {
    switch (type) {
      case 'text':
        return (
          <TextInput
            id={name}
            label={label}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            error={error}
            required={required}
            placeholder={`Enter ${label.toLowerCase()}`}
          />
        );
      
      case 'textarea':
        return (
          <Textarea
            id={name}
            label={label}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            error={error}
            required={required}
            placeholder={`Enter ${label.toLowerCase()}`}
            minRows={3}
          />
        );
      
      case 'number':
        return (
          <NumberInput
            id={name}
            label={label}
            value={value || ''}
            onChange={(val) => onChange(val)}
            error={error}
            required={required}
            placeholder={`Enter ${label.toLowerCase()}`}
            min={0}
          />
        );
      
      case 'email':
        return (
          <TextInput
            id={name}
            label={label}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            error={error}
            required={required}
            placeholder="email@example.com"
            type="email"
          />
        );
      
      case 'checkbox':
        return (
          <Checkbox
            id={name}
            label={label}
            checked={!!value}
            onChange={(e) => onChange(e.currentTarget.checked)}
            error={error}
          />
        );
      
      case 'select':
        return (
          <Select
            id={name}
            label={label}
            value={value || ''}
            onChange={(val) => onChange(val)}
            error={error}
            required={required}
            placeholder={`Select ${label.toLowerCase()}`}
            data={options || []}
            clearable
          />
        );
      
      default:
        return (
          <TextInput
            id={name}
            label={label}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            error={error}
            required={required}
          />
        );
    }
  };

  return (
    <div style={{ marginBottom: '16px' }}>
      {renderField()}
      {error && <Text color="red" size="sm">{error}</Text>}
    </div>
  );
}

export default FormField;
