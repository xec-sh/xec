import { it, vi, expect, describe, beforeEach } from 'vitest';

import { ReactiveState } from '../../../../src/core/reactive/reactive-state.js';
import { validators, ReactiveValidator } from '../../../../src/core/reactive/validation.js';

describe('ReactiveValidator', () => {
  interface FormData {
    username: string;
    email: string;
    age: number;
    password: string;
    confirmPassword: string;
    terms: boolean;
  }

  let state: ReactiveState<FormData>;
  let validator: ReactiveValidator<FormData>;

  beforeEach(() => {
    state = new ReactiveState<FormData>({
      username: '',
      email: '',
      age: 0,
      password: '',
      confirmPassword: '',
      terms: false,
    });

    validator = new ReactiveValidator(state, {
      username: [
        validators.required(),
        validators.minLength(3),
        validators.maxLength(20),
        validators.pattern(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
      ],
      email: [
        validators.required(),
        validators.email(),
      ],
      age: [
        validators.required('Age is required'),
        validators.min(18, 'Must be at least 18 years old'),
        validators.max(120, 'Invalid age'),
      ],
      password: [
        validators.required(),
        validators.minLength(8, 'Password must be at least 8 characters'),
      ],
      terms: validators.custom(
        value => value === true,
        'You must accept the terms and conditions'
      ),
    });
  });

  describe('field validation', () => {
    it('should validate required fields', async () => {
      const result = await validator.validateField('username');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('This field is required');
    });

    it('should validate with multiple rules', async () => {
      state.set('username', 'ab');
      
      // Wait for automatic validation to trigger
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result = await validator.validateField('username');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Must be at least 3 characters');

      state.set('username', 'a'.repeat(25));
      const result2 = await validator.validateField('username');
      expect(result2.valid).toBe(false);
      expect(result2.errors).toContain('Must be at most 20 characters');
    });

    it('should validate email format', async () => {
      state.set('email', 'invalid');
      const result = await validator.validateField('email');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid email address');

      state.set('email', 'test@example.com');
      const result2 = await validator.validateField('email');
      expect(result2.valid).toBe(true);
      expect(result2.errors).toHaveLength(0);
    });

    it('should validate numbers', async () => {
      state.set('age', 15);
      const result = await validator.validateField('age');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Must be at least 18 years old');

      state.set('age', 25);
      const result2 = await validator.validateField('age');
      expect(result2.valid).toBe(true);
    });

    it('should validate custom rules', async () => {
      const result = await validator.validateField('terms');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('You must accept the terms and conditions');

      state.set('terms', true);
      const result2 = await validator.validateField('terms');
      expect(result2.valid).toBe(true);
    });
  });

  describe('cross-field validation', () => {
    it('should validate dependent fields', async () => {
      validator.addCrossFieldValidation({
        fields: ['password', 'confirmPassword'],
        validate: (values) => {
          if (values.password !== values.confirmPassword) {
            return 'Passwords do not match';
          }
          return true;
        },
      });

      state.set('password', 'password123');
      state.set('confirmPassword', 'password456');

      const result = await validator.validateField('confirmPassword');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Passwords do not match');

      state.set('confirmPassword', 'password123');
      const result2 = await validator.validateField('confirmPassword');
      expect(result2.valid).toBe(true);
    });

    it('should re-validate related fields', async () => {
      validator.addCrossFieldValidation({
        fields: ['password', 'confirmPassword'],
        validate: (values) => {
          if (values.password !== values.confirmPassword) {
            return 'Passwords do not match';
          }
          return true;
        },
      });

      state.set('password', 'password123');
      state.set('confirmPassword', 'password123');

      // Both should be valid
      expect((await validator.validateField('password')).valid).toBe(true);
      expect((await validator.validateField('confirmPassword')).valid).toBe(true);

      // Change password - both fields should be re-validated
      state.set('password', 'newpassword');
      
      // Give time for watchers to trigger
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(validator.isFieldValid('confirmPassword')).toBe(false);
    });
  });

  describe('validate all', () => {
    it('should validate all fields', async () => {
      const results = await validator.validateAll();
      
      expect(results.username.valid).toBe(false);
      expect(results.email.valid).toBe(false);
      expect(results.age.valid).toBe(false);
      expect(results.password.valid).toBe(false);
      expect(results.terms.valid).toBe(false);

      expect(validator.isValid()).toBe(false);
    });

    it('should return all errors', async () => {
      await validator.validateAll();
      const errors = validator.getAllErrors();

      expect(errors.username).toContain('This field is required');
      expect(errors.email).toContain('This field is required');
      expect(errors.age).toEqual(['Age is required', 'Must be at least 18 years old']);
    });
  });

  describe('real-time validation', () => {
    it('should validate on value change', async () => {
      const listener = vi.fn();
      validator.subscribe('username', listener);

      state.set('username', 'a');
      
      // Wait for validation
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalled();
      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(lastCall.valid).toBe(false);
      expect(lastCall.errors).toContain('Must be at least 3 characters');
    });

    it('should clear errors', async () => {
      // First validate to generate errors
      await validator.validateField('username');
      expect(validator.isFieldValid('username')).toBe(false);

      validator.clearFieldErrors('username');
      expect(validator.isFieldValid('username')).toBe(true);

      validator.clearAllErrors();
      expect(validator.isValid()).toBe(true);
    });
  });

  describe('computed validation state', () => {
    it('should create computed validation values', async () => {
      // Validate all fields initially to populate validation state
      await validator.validateAll();

      const formValid = validator.computed(getValidation => 
        ['username', 'email', 'password', 'terms'].every(field => 
          getValidation(field as keyof FormData).valid
        )
      );

      expect(formValid()).toBe(false);

      // Set valid values
      state.set('username', 'validuser');
      state.set('email', 'test@example.com');
      state.set('password', 'password123');
      state.set('terms', true);

      // Wait for validations
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(formValid()).toBe(true);
    });
  });

  describe('async validation', () => {
    it('should handle async validation rules', async () => {
      const asyncValidator = new ReactiveValidator(state, {
        username: validators.compose(
          validators.required(),
          validators.custom(
            async (value) => {
              await new Promise(resolve => setTimeout(resolve, 10));
              return value !== 'taken';
            },
            'Username is already taken'
          )
        ),
      });

      state.set('username', 'taken');
      const result = await asyncValidator.validateField('username');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Username is already taken');

      state.set('username', 'available');
      const result2 = await asyncValidator.validateField('username');
      expect(result2.valid).toBe(true);
    });
  });

  describe('validation caching', () => {
    it('should not re-validate unchanged values', async () => {
      let validateCount = 0;
      const cachedValidator = new ReactiveValidator(state, {
        username: validators.custom(
          (value) => {
            validateCount++;
            return value.length >= 3;
          },
          'Too short'
        ),
      });

      state.set('username', 'test');
      await cachedValidator.validateField('username');
      expect(validateCount).toBe(1);

      // Same value - should use cache
      await cachedValidator.validateField('username');
      expect(validateCount).toBe(1);

      // Different value - should re-validate
      state.set('username', 'test2');
      await cachedValidator.validateField('username');
      expect(validateCount).toBe(2);
    });
  });

  describe('validators utility', () => {
    it('should compose multiple validators', async () => {
      const strongPassword = validators.compose(
        validators.required('Password is required'),
        validators.minLength(8, 'At least 8 characters'),
        validators.pattern(/[A-Z]/, 'Must contain uppercase letter'),
        validators.pattern(/[0-9]/, 'Must contain number'),
        validators.pattern(/[!@#$%^&*]/, 'Must contain special character')
      );

      expect(await strongPassword('')).toBe('Password is required');
      expect(await strongPassword('short')).toBe('At least 8 characters');
      expect(await strongPassword('longenough')).toBe('Must contain uppercase letter');
      expect(await strongPassword('LongEnough')).toBe('Must contain number');
      expect(await strongPassword('LongEnough1')).toBe('Must contain special character');
      expect(await strongPassword('LongEnough1!')).toBe(true);
    });
  });
});