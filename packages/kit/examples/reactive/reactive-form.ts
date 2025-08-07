#!/usr/bin/env node
import { reactive, validators } from '@xec-sh/kit';

// Example: Reactive form with real-time validation
async function main() {
  const result = await reactive({
    initialValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      age: 0,
      newsletter: false,
    },
    prompts: (state) => [
      {
        id: 'username',
        type: 'text',
        message: 'Username',
        validate: validators.compose(
          validators.required(),
          validators.minLength(3),
          validators.pattern(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores')
        ),
      },
      {
        id: 'email',
        type: 'text',
        message: 'Email address',
        validate: validators.compose(
          validators.required(),
          validators.email()
        ),
      },
      {
        id: 'age',
        type: 'number',
        message: 'Age',
        validate: validators.compose(
          validators.required(),
          validators.min(18, 'Must be 18 or older')
        ),
      },
      {
        id: 'password',
        type: 'password',
        message: 'Password',
        validate: validators.compose(
          validators.required(),
          validators.minLength(8),
          validators.pattern(/[A-Z]/, 'Must contain uppercase'),
          validators.pattern(/[0-9]/, 'Must contain number')
        ),
      },
      {
        id: 'confirmPassword',
        type: 'password',
        message: () => `Confirm password`,
        validate: (value) => {
          if (value !== state.get('password')) {
            return 'Passwords do not match';
          }
          return true;
        },
      },
      {
        id: 'newsletter',
        type: 'confirm',
        message: () => `Subscribe to newsletter for ${state.get('email')}?`,
        when: () => state.get('email').includes('@'),
      },
    ],
  }).prompt();

  console.log('\nRegistration Complete!');
  console.log('Username:', result.username);
  console.log('Email:', result.email);
  console.log('Age:', result.age);
  console.log('Newsletter:', result.newsletter ? 'Subscribed' : 'Not subscribed');
}

main().catch(console.error);