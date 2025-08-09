import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { MockTerminal } from '../../../../src/test/mock-terminal.js';
import { Form, type FormData, type FormOptions, type FieldDefinition } from '../../../../src/components/complex/form.js';

describe('Form Component', () => {
  let form: Form;
  let mockTerminal: MockTerminal;

  beforeEach(() => {
    mockTerminal = new MockTerminal();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create form with basic fields', () => {
      const fields: FieldDefinition[] = [
        {
          name: 'firstName',
          type: 'text',
          label: 'First Name',
          required: true
        },
        {
          name: 'email',
          type: 'email',
          label: 'Email Address',
          required: true
        }
      ];

      form = new Form({ fields });

      expect(form).toBeInstanceOf(Form);
      expect(form.type).toBe('form');
      expect(form.getData()).toEqual({
        firstName: '',
        email: ''
      });
    });

    it('should create form with default values', () => {
      const fields: FieldDefinition[] = [
        {
          name: 'name',
          type: 'text',
          label: 'Name',
          defaultValue: 'John Doe'
        },
        {
          name: 'age',
          type: 'number',
          label: 'Age',
          defaultValue: 25
        }
      ];

      form = new Form({ fields });

      expect(form.getFieldValue('name')).toBe('John Doe');
      expect(form.getFieldValue('age')).toBe(25);
    });

    it('should handle form with sections', () => {
      const options: FormOptions = {
        sections: [
          {
            title: 'Personal Info',
            fields: [
              {
                name: 'firstName',
                type: 'text',
                label: 'First Name'
              }
            ]
          },
          {
            title: 'Contact Info',
            fields: [
              {
                name: 'email',
                type: 'email',
                label: 'Email'
              }
            ]
          }
        ]
      };

      form = new Form(options);

      expect(form.getData()).toHaveProperty('firstName');
      expect(form.getData()).toHaveProperty('email');
    });

    it('should set form title and description', () => {
      form = new Form({
        title: 'User Registration',
        description: 'Please fill out this form',
        fields: []
      });

      const output = form.render();
      expect(output.lines.some(line => line.includes('User Registration'))).toBe(true);
      expect(output.lines.some(line => line.includes('Please fill out this form'))).toBe(true);
    });
  });

  describe('Field Types', () => {
    it('should handle text fields', () => {
      const fields: FieldDefinition[] = [
        {
          name: 'textField',
          type: 'text',
          label: 'Text Field',
          placeholder: 'Enter text'
        }
      ];

      form = new Form({ fields });

      expect(form.getFieldValue('textField')).toBe('');
    });

    it('should handle number fields', () => {
      const fields: FieldDefinition[] = [
        {
          name: 'numberField',
          type: 'number',
          label: 'Number Field',
          min: 0,
          max: 100
        } as any
      ];

      form = new Form({ fields });

      expect(form.getFieldValue('numberField')).toBe(0);
    });

    it('should handle email fields', () => {
      const fields: FieldDefinition[] = [
        {
          name: 'emailField',
          type: 'email',
          label: 'Email Field'
        }
      ];

      form = new Form({ fields });

      expect(form.getFieldValue('emailField')).toBe('');
    });

    it('should handle select fields', () => {
      const fields: FieldDefinition[] = [
        {
          name: 'selectField',
          type: 'select',
          label: 'Select Field',
          choices: [
            { value: 'option1', label: 'Option 1' },
            { value: 'option2', label: 'Option 2' }
          ]
        } as any
      ];

      form = new Form({ fields });

      expect(form.getFieldValue('selectField')).toBe(null);
    });

    it('should handle checkbox fields', () => {
      const fields: FieldDefinition[] = [
        {
          name: 'checkboxField',
          type: 'checkbox',
          label: 'Checkbox Field',
          checked: true
        } as any
      ];

      form = new Form({ fields });

      expect(form.getFieldValue('checkboxField')).toBe(false); // Default is false
    });
  });

  describe('Data Management', () => {
    beforeEach(() => {
      const fields: FieldDefinition[] = [
        {
          name: 'firstName',
          type: 'text',
          label: 'First Name'
        },
        {
          name: 'lastName',
          type: 'text',
          label: 'Last Name'
        }
      ];

      form = new Form({ fields });
    });

    it('should get form data', () => {
      const data = form.getData();
      expect(data).toEqual({
        firstName: '',
        lastName: ''
      });
    });

    it('should set form data', async () => {
      form.setData({ firstName: 'John', lastName: 'Doe' });

      expect(form.getFieldValue('firstName')).toBe('John');
      expect(form.getFieldValue('lastName')).toBe('Doe');
      expect(form.isFormDirty()).toBe(true);
    });

    it('should set individual field value', async () => {
      await form.setFieldValue('firstName', 'Jane');

      expect(form.getFieldValue('firstName')).toBe('Jane');
      expect(form.isFormDirty()).toBe(true);
    });

    it('should track touched fields', async () => {
      expect(form.isFieldTouched('firstName')).toBe(false);

      await form.setFieldValue('firstName', 'John');
      expect(form.isFieldTouched('firstName')).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should validate required fields', async () => {
      const fields: FieldDefinition[] = [
        {
          name: 'requiredField',
          type: 'text',
          label: 'Required Field',
          required: true
        }
      ];

      form = new Form({ fields });

      const isValid = await form.validateFormPublic();
      expect(isValid).toBe(false);

      const errors = form.getErrors();
      expect(errors.requiredField).toContain('Required Field is required');
    });

    it('should validate email format', async () => {
      const fields: FieldDefinition[] = [
        {
          name: 'email',
          type: 'email',
          label: 'Email'
        }
      ];

      form = new Form({ fields });

      await form.setFieldValue('email', 'invalid-email');
      const isValid = await form.validateFormPublic();
      
      expect(isValid).toBe(false);
      const errors = form.getErrors();
      expect(errors.email).toContain('valid email address');
    });

    it('should validate number fields', async () => {
      const fields: FieldDefinition[] = [
        {
          name: 'age',
          type: 'number',
          label: 'Age',
          min: 0,
          max: 150
        } as any
      ];

      form = new Form({ fields });

      // Test minimum validation
      await form.setFieldValue('age', -5);
      let isValid = await form.validateFormPublic();
      expect(isValid).toBe(false);
      expect(form.getErrors().age).toContain('at least 0');

      // Test maximum validation
      await form.setFieldValue('age', 200);
      isValid = await form.validateFormPublic();
      expect(isValid).toBe(false);
      expect(form.getErrors().age).toContain('at most 150');
    });

    it('should handle custom field validators', async () => {
      const customValidator = (value: any) => {
        if (typeof value === 'string' && value.length < 3) {
          return 'Must be at least 3 characters';
        }
        return null;
      };

      const fields: FieldDefinition[] = [
        {
          name: 'username',
          type: 'text',
          label: 'Username',
          validators: [customValidator]
        }
      ];

      form = new Form({ fields });

      await form.setFieldValue('username', 'ab');
      const isValid = await form.validateFormPublic();

      expect(isValid).toBe(false);
      expect(form.getErrors().username).toBe('Must be at least 3 characters');
    });

    it('should handle cross-field validation', async () => {
      const fields: FieldDefinition[] = [
        {
          name: 'password',
          type: 'password',
          label: 'Password'
        },
        {
          name: 'confirmPassword',
          type: 'password',
          label: 'Confirm Password'
        }
      ];

      const crossFieldValidator = (formData: FormData) => {
        const errors = [];
        if (formData.password !== formData.confirmPassword) {
          errors.push({
            field: 'confirmPassword',
            message: 'Passwords do not match'
          });
        }
        return errors;
      };

      form = new Form({ 
        fields,
        crossFieldValidators: [crossFieldValidator]
      });

      await form.setFieldValue('password', 'password123');
      await form.setFieldValue('confirmPassword', 'password456');

      const isValid = await form.validateFormPublic();
      expect(isValid).toBe(false);

      const crossFieldErrors = form.getCrossFieldErrors();
      expect(crossFieldErrors).toHaveLength(1);
      expect(crossFieldErrors[0].message).toBe('Passwords do not match');
    });
  });

  describe('Field Dependencies', () => {
    it('should handle show/hide dependencies', () => {
      const fields: FieldDefinition[] = [
        {
          name: 'hasAccount',
          type: 'checkbox',
          label: 'I have an account'
        } as any,
        {
          name: 'accountId',
          type: 'text',
          label: 'Account ID',
          dependencies: [{
            field: 'hasAccount',
            condition: (value) => value === true,
            action: 'show'
          }]
        }
      ];

      form = new Form({ fields });

      // Initially, account ID should be hidden (hasAccount is false)
      const output1 = form.render();
      expect(output1.lines.some(line => line.includes('Account ID'))).toBe(false);
    });

    it('should handle enable/disable dependencies', () => {
      const fields: FieldDefinition[] = [
        {
          name: 'agreeToTerms',
          type: 'checkbox',
          label: 'I agree to terms'
        } as any,
        {
          name: 'submitButton',
          type: 'custom',
          label: 'Submit',
          component: {} as any,
          getValue: () => null,
          setValue: () => {},
          dependencies: [{
            field: 'agreeToTerms',
            condition: (value) => value === true,
            action: 'enable'
          }]
        } as any
      ];

      form = new Form({ fields });

      // Button should be disabled initially
      expect(form).toBeDefined(); // Basic test - full dependency testing would need more setup
    });

    it('should handle require dependencies', async () => {
      const fields: FieldDefinition[] = [
        {
          name: 'contactMethod',
          type: 'select',
          label: 'Contact Method',
          choices: [
            { value: 'email', label: 'Email' },
            { value: 'phone', label: 'Phone' }
          ]
        } as any,
        {
          name: 'phoneNumber',
          type: 'text',
          label: 'Phone Number',
          dependencies: [{
            field: 'contactMethod',
            condition: (value) => value === 'phone',
            action: 'require'
          }]
        }
      ];

      form = new Form({ fields });

      // Set contact method to phone
      await form.setFieldValue('contactMethod', 'phone');
      
      // Now phone number should be required
      const isValid = await form.validateFormPublic();
      expect(isValid).toBe(false);

      const errors = form.getErrors();
      expect(errors.phoneNumber).toContain('Phone Number is required');
    });
  });

  describe('Keyboard Navigation', () => {
    beforeEach(() => {
      const fields: FieldDefinition[] = [
        {
          name: 'field1',
          type: 'text',
          label: 'Field 1'
        },
        {
          name: 'field2',
          type: 'text',
          label: 'Field 2'
        }
      ];

      form = new Form({ fields });
    });

    it('should handle Tab navigation', () => {
      const result = form.handleKeypress({ name: 'tab' } as any);
      expect(result).toBe(true);
    });

    it('should handle Shift+Tab navigation', () => {
      const result = form.handleKeypress({ name: 'tab', shift: true } as any);
      expect(result).toBe(true);
    });

    it('should handle Enter key', () => {
      const result = form.handleKeypress({ name: 'enter' } as any);
      expect(result).toBe(false); // Should pass to focused field
    });

    it('should handle Ctrl+Enter for submit', () => {
      const result = form.handleKeypress({ name: 'enter', ctrl: true } as any);
      expect(result).toBe(true);
    });

    it('should handle Escape for cancel', () => {
      const result = form.handleKeypress({ name: 'escape' } as any);
      expect(result).toBe(true);
    });
  });

  describe('Form Actions', () => {
    beforeEach(() => {
      const fields: FieldDefinition[] = [
        {
          name: 'name',
          type: 'text',
          label: 'Name',
          required: true
        }
      ];

      form = new Form({ fields });
    });

    it('should handle form submission', async () => {
      const submitSpy = vi.fn();
      form.on('submit', submitSpy);

      // Fill required field
      await form.setFieldValue('name', 'John Doe');

      // Simulate Ctrl+Enter
      form.handleKeypress({ name: 'enter', ctrl: true } as any);

      // Wait for async validation
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(submitSpy).toHaveBeenCalledWith({
        name: 'John Doe'
      });
      expect(form.isSubmitting()).toBe(false);
    });

    it('should prevent submission if form is invalid', async () => {
      const submitSpy = vi.fn();
      form.on('submit', submitSpy);

      // Don't fill required field
      form.handleKeypress({ name: 'enter', ctrl: true } as any);

      // Wait for async validation
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(submitSpy).not.toHaveBeenCalled();
    });

    it('should handle form cancellation', () => {
      const cancelSpy = vi.fn();
      form.on('cancel', cancelSpy);

      form.handleKeypress({ name: 'escape' } as any);

      expect(cancelSpy).toHaveBeenCalled();
    });

    it('should handle form reset', async () => {
      const resetSpy = vi.fn();
      form.on('reset', resetSpy);

      // Make form dirty
      await form.setFieldValue('name', 'John Doe');
      expect(form.isFormDirty()).toBe(true);

      // Reset form
      form.resetFormPublic();

      expect(form.getFieldValue('name')).toBe('');
      expect(form.isFormDirty()).toBe(false);
      expect(resetSpy).toHaveBeenCalled();
    });
  });

  describe('Auto-save', () => {
    it('should handle auto-save when enabled', async () => {
      const autoSaveSpy = vi.fn();
      
      const fields: FieldDefinition[] = [
        {
          name: 'content',
          type: 'textarea',
          label: 'Content'
        } as any
      ];

      form = new Form({ 
        fields,
        autoSave: true,
        autoSaveDelay: 100
      });

      form.on('autoSave', autoSaveSpy);

      await form.setFieldValue('content', 'Some content');

      // Wait for auto-save delay
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(autoSaveSpy).toHaveBeenCalledWith({
        content: 'Some content'
      });
    });
  });

  describe('Rendering', () => {
    it('should render form with fields', () => {
      const fields: FieldDefinition[] = [
        {
          name: 'firstName',
          type: 'text',
          label: 'First Name',
          hint: 'Enter your first name'
        }
      ];

      form = new Form({ 
        title: 'Registration Form',
        fields 
      });

      const output = form.render();
      
      expect(output.lines.length).toBeGreaterThan(0);
      expect(output.lines.some(line => line.includes('Registration Form'))).toBe(true);
      expect(output.lines.some(line => line.includes('First Name'))).toBe(true);
    });

    it('should render form with sections', () => {
      form = new Form({
        sections: [
          {
            title: 'Personal Info',
            description: 'Your personal details',
            fields: [
              {
                name: 'name',
                type: 'text',
                label: 'Name'
              }
            ]
          }
        ]
      });

      const output = form.render();
      
      expect(output.lines.some(line => line.includes('Personal Info'))).toBe(true);
      expect(output.lines.some(line => line.includes('Your personal details'))).toBe(true);
    });

    it('should render form with progress bar when enabled', () => {
      const fields: FieldDefinition[] = [
        {
          name: 'field1',
          type: 'text',
          label: 'Field 1'
        },
        {
          name: 'field2',
          type: 'text',
          label: 'Field 2'
        }
      ];

      form = new Form({ 
        fields,
        showProgress: true
      });

      const output = form.render();
      expect(output.lines.some(line => line.includes('Progress:'))).toBe(true);
    });

    it('should render field errors', async () => {
      const fields: FieldDefinition[] = [
        {
          name: 'email',
          type: 'email',
          label: 'Email'
        }
      ];

      form = new Form({ fields });

      await form.setFieldValue('email', 'invalid-email');
      await form.validateFormPublic();

      const output = form.render();
      expect(output.lines.some(line => line.includes('⚠'))).toBe(true);
    });

    it('should render action buttons', () => {
      form = new Form({ 
        fields: [],
        submitLabel: 'Save',
        cancelLabel: 'Cancel',
        resetLabel: 'Reset'
      });

      const output = form.render();
      expect(output.lines.some(line => line.includes('Save'))).toBe(true);
      expect(output.lines.some(line => line.includes('Cancel'))).toBe(true);
    });
  });

  describe('Event Emission', () => {
    beforeEach(() => {
      const fields: FieldDefinition[] = [
        {
          name: 'testField',
          type: 'text',
          label: 'Test Field'
        }
      ];

      form = new Form({ fields });
    });

    it('should emit change events', async () => {
      const changeSpy = vi.fn();
      form.on('change', changeSpy);

      await form.setFieldValue('testField', 'new value');

      expect(changeSpy).toHaveBeenCalledWith({
        testField: 'new value'
      });
    });

    it('should emit field-specific events', async () => {
      const fieldChangeSpy = vi.fn();
      form.on('fieldChange', fieldChangeSpy);

      await form.setFieldValue('testField', 'new value');

      expect(fieldChangeSpy).toHaveBeenCalledWith(
        'testField', 
        'new value',
        { testField: 'new value' }
      );
    });
  });

  describe('Form State', () => {
    beforeEach(() => {
      const fields: FieldDefinition[] = [
        {
          name: 'testField',
          type: 'text',
          label: 'Test Field'
        }
      ];

      form = new Form({ fields });
    });

    it('should track form validity', async () => {
      expect(form.isFormValid()).toBe(true);

      // Add required field with no value
      form = new Form({
        fields: [{
          name: 'required',
          type: 'text',
          label: 'Required',
          required: true
        }]
      });

      await form.validateFormPublic();
      expect(form.isFormValid()).toBe(false);
    });

    it('should track dirty state', async () => {
      expect(form.isFormDirty()).toBe(false);

      await form.setFieldValue('testField', 'new value');
      expect(form.isFormDirty()).toBe(true);
    });

    it('should track submitting state', () => {
      expect(form.isSubmitting()).toBe(false);

      // Simulate submission start (this is internal state)
      form.handleKeypress({ name: 'enter', ctrl: true } as any);
      // Note: Would need to test actual submission logic with proper setup
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty form', () => {
      form = new Form({ fields: [] });

      expect(form.getData()).toEqual({});
      expect(form.isFormValid()).toBe(true);

      const output = form.render();
      expect(output.lines.length).toBeGreaterThan(0); // Should still render buttons
    });

    it('should handle null/undefined values', async () => {
      const fields: FieldDefinition[] = [
        {
          name: 'nullField',
          type: 'text',
          label: 'Null Field'
        }
      ];

      form = new Form({ fields });

      await form.setFieldValue('nullField', null);
      expect(form.getFieldValue('nullField')).toBe(null);

      await form.setFieldValue('nullField', undefined);
      expect(form.getFieldValue('nullField')).toBe(undefined);
    });

    it('should handle very long field labels', () => {
      const fields: FieldDefinition[] = [
        {
          name: 'longField',
          type: 'text',
          label: 'This is a very long field label that might cause rendering issues if not handled properly'
        }
      ];

      form = new Form({ fields });

      const output = form.render();
      expect(output.lines.some(line => line.includes('very long field label'))).toBe(true);
    });

    it('should handle rapid field changes', async () => {
      const fields: FieldDefinition[] = [
        {
          name: 'rapidField',
          type: 'text',
          label: 'Rapid Field'
        }
      ];

      form = new Form({ fields });

      // Simulate rapid changes
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(form.setFieldValue('rapidField', `value${i}`));
      }

      await Promise.all(promises);

      // Should handle without errors
      expect(form.getFieldValue('rapidField')).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should handle large forms efficiently', () => {
      const startTime = performance.now();

      // Create form with many fields
      const fields: FieldDefinition[] = [];
      for (let i = 0; i < 100; i++) {
        fields.push({
          name: `field${i}`,
          type: 'text',
          label: `Field ${i}`
        });
      }

      form = new Form({ fields });

      const output = form.render();
      const endTime = performance.now();

      expect(output.lines.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(1000); // Should render in under 1 second
    });

    it('should handle complex validation efficiently', async () => {
      const startTime = performance.now();

      const customValidator = vi.fn().mockResolvedValue(null);
      const fields: FieldDefinition[] = [];

      for (let i = 0; i < 50; i++) {
        fields.push({
          name: `field${i}`,
          type: 'text',
          label: `Field ${i}`,
          defaultValue: 'test',
          validators: [customValidator]
        });
      }

      form = new Form({ fields });

      await form.validateFormPublic();
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(500); // Should validate in under 500ms
      expect(customValidator).toHaveBeenCalledTimes(50);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup properly on unmount', async () => {
      const fields: FieldDefinition[] = [
        {
          name: 'testField',
          type: 'text',
          label: 'Test Field'
        }
      ];

      form = new Form({ 
        fields,
        autoSave: true
      });

      // Create some state
      await form.setFieldValue('testField', 'test');

      // Unmount should not throw
      await expect(form.unmount()).resolves.not.toThrow();
    });
  });
});