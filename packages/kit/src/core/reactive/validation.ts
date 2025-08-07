import { watch, computed } from './computed.js';
import { ReactiveState } from './reactive-state.js';

export type ValidationRule<T> = (value: T) => string | boolean | Promise<string | boolean>;
export type ValidationResult = { valid: boolean; errors: string[] };

export type ValidationSchema<T extends Record<string, any>> = {
  [K in keyof T]?: ValidationRule<T[K]> | ValidationRule<T[K]>[];
}

export interface CrossFieldValidation<T extends Record<string, any>> {
  fields: (keyof T)[];
  validate: (values: Partial<T>) => string | boolean | Promise<string | boolean>;
}

export class ReactiveValidator<T extends Record<string, any>> {
  private state: ReactiveState<T>;
  private schema: ValidationSchema<T>;
  private crossFieldValidations: CrossFieldValidation<T>[] = [];
  private validationState: ReactiveState<Record<keyof T, ValidationResult>>;
  private isValidating = new Map<keyof T, boolean>();
  private validationCache = new Map<string, ValidationResult>();

  constructor(state: ReactiveState<T>, schema: ValidationSchema<T>) {
    this.state = state;
    this.schema = schema;
    
    // Initialize validation state
    const initialValidationState = {} as Record<keyof T, ValidationResult>;
    Object.keys(state.getState()).forEach(key => {
      initialValidationState[key as keyof T] = { valid: true, errors: [] };
    });
    
    this.validationState = new ReactiveState(initialValidationState);
    
    // Set up watchers for each field
    this.setupWatchers();
    
    // Run initial validation for all fields
    this.validateAll();
  }

  /**
   * Add a cross-field validation rule
   */
  addCrossFieldValidation(validation: CrossFieldValidation<T>): void {
    this.crossFieldValidations.push(validation);
    
    // Re-validate affected fields
    validation.fields.forEach(field => {
      this.validateField(field);
    });
  }

  /**
   * Validate a specific field
   */
  async validateField(field: keyof T): Promise<ValidationResult> {
    // Check if already validating
    if (this.isValidating.get(field)) {
      return this.validationState.get(field);
    }
    
    this.isValidating.set(field, true);
    
    try {
      const value = this.state.get(field);
      const rules = this.schema[field];
      const errors: string[] = [];
      
      // Validate field rules
      if (rules) {
        const ruleArray = Array.isArray(rules) ? rules : [rules];
        
        for (const rule of ruleArray) {
          const result = await rule(value);
          
          if (typeof result === 'string') {
            errors.push(result);
          } else if (result === false) {
            errors.push(`Invalid ${String(field)}`);
          }
        }
      }
      
      // Check cross-field validations
      for (const crossValidation of this.crossFieldValidations) {
        if (crossValidation.fields.includes(field)) {
          const values: Partial<T> = {};
          crossValidation.fields.forEach(f => {
            values[f] = this.state.get(f);
          });
          
          const result = await crossValidation.validate(values);
          
          if (typeof result === 'string') {
            errors.push(result);
          } else if (result === false) {
            errors.push(`Cross-field validation failed`);
          }
        }
      }
      
      const validationResult: ValidationResult = {
        valid: errors.length === 0,
        errors,
      };
      
      // Update validation state
      this.validationState.set(field, validationResult);
      
      // Cache result
      const cacheKey = `${String(field)}:${JSON.stringify(value)}`;
      this.validationCache.set(cacheKey, validationResult);
      
      return validationResult;
    } finally {
      this.isValidating.set(field, false);
    }
  }

  /**
   * Validate all fields
   */
  async validateAll(): Promise<Record<keyof T, ValidationResult>> {
    const fields = Object.keys(this.state.getState()) as (keyof T)[];
    const results = await Promise.all(
      fields.map(field => this.validateField(field))
    );
    
    const validationResults = {} as Record<keyof T, ValidationResult>;
    fields.forEach((field, index) => {
      validationResults[field] = results[index] || { valid: true, errors: [] };
    });
    
    return validationResults;
  }

  /**
   * Check if a specific field is valid
   */
  isFieldValid(field: keyof T): boolean {
    return this.validationState.get(field).valid;
  }

  /**
   * Check if all fields are valid
   */
  isValid(): boolean {
    const state = this.validationState.getState();
    return Object.values(state).every((result: any) => result.valid);
  }

  /**
   * Get errors for a specific field
   */
  getFieldErrors(field: keyof T): string[] {
    return this.validationState.get(field).errors;
  }

  /**
   * Get all validation errors
   */
  getAllErrors(): Record<keyof T, string[]> {
    const state = this.validationState.getState();
    const errors = {} as Record<keyof T, string[]>;
    
    Object.entries(state).forEach(([field, result]) => {
      if (!result.valid) {
        errors[field as keyof T] = result.errors;
      }
    });
    
    return errors;
  }

  /**
   * Subscribe to validation state changes
   */
  subscribe(field: keyof T, callback: (result: ValidationResult) => void): () => void {
    return this.validationState.subscribe(field, callback);
  }

  /**
   * Get computed validation state
   */
  computed<R>(compute: (getValidation: (field: keyof T) => ValidationResult) => R): () => R {
    return computed(this.validationState, (get) => {
      const getter = (field: keyof T) => get(field);
      return compute(getter);
    });
  }

  /**
   * Clear validation errors for a field
   */
  clearFieldErrors(field: keyof T): void {
    this.validationState.set(field, () => ({ valid: true, errors: [] }));
  }

  /**
   * Clear all validation errors
   */
  clearAllErrors(): void {
    const fields = Object.keys(this.state.getState()) as (keyof T)[];
    this.validationState.batch(() => {
      fields.forEach(field => {
        this.clearFieldErrors(field);
      });
    });
  }

  /**
   * Dispose of the validator
   */
  dispose(): void {
    this.validationState.dispose();
    this.validationCache.clear();
    this.isValidating.clear();
  }

  private setupWatchers(): void {
    const fields = Object.keys(this.state.getState()) as (keyof T)[];
    
    fields.forEach(field => {
      watch(this.state, field, async () => {
        // Clear cache for this field
        const cacheKeys = Array.from(this.validationCache.keys());
        cacheKeys.forEach(key => {
          if (key.startsWith(`${String(field)}:`)) {
            this.validationCache.delete(key);
          }
        });
        
        // Re-validate field
        await this.validateField(field);
        
        // Also re-validate fields that have cross-field validations with this field
        for (const crossValidation of this.crossFieldValidations) {
          if (crossValidation.fields.includes(field)) {
            // Validate other fields in the cross-validation
            const otherFields = crossValidation.fields.filter(f => f !== field);
            await Promise.all(otherFields.map(f => this.validateField(f)));
          }
        }
      });
    });
  }
}

/**
 * Common validation rules
 */
export const validators = {
  required: <T>(message = 'This field is required'): ValidationRule<T> => 
    (value) => {
      if (value === null || value === undefined || value === '') {
        return message;
      }
      if (Array.isArray(value) && value.length === 0) {
        return message;
      }
      return true;
    },

  minLength: (min: number, message?: string): ValidationRule<string> => 
    (value) => {
      if (value.length < min) {
        return message || `Must be at least ${min} characters`;
      }
      return true;
    },

  maxLength: (max: number, message?: string): ValidationRule<string> => 
    (value) => {
      if (value.length > max) {
        return message || `Must be at most ${max} characters`;
      }
      return true;
    },

  pattern: (regex: RegExp, message?: string): ValidationRule<string> => 
    (value) => {
      if (!regex.test(value)) {
        return message || 'Invalid format';
      }
      return true;
    },

  email: (message = 'Invalid email address'): ValidationRule<string> => 
    (value) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return message;
      }
      return true;
    },

  min: (min: number, message?: string): ValidationRule<number> => 
    (value) => {
      if (value < min) {
        return message || `Must be at least ${min}`;
      }
      return true;
    },

  max: (max: number, message?: string): ValidationRule<number> => 
    (value) => {
      if (value > max) {
        return message || `Must be at most ${max}`;
      }
      return true;
    },

  custom: <T>(
    validate: (value: T) => boolean | Promise<boolean>,
    message: string
  ): ValidationRule<T> => 
    async (value) => {
      const isValid = await validate(value);
      return isValid ? true : message;
    },

  compose: <T>(...rules: ValidationRule<T>[]): ValidationRule<T> => 
    async (value) => {
      for (const rule of rules) {
        const result = await rule(value);
        if (result !== true) {
          return result;
        }
      }
      return true;
    },
};