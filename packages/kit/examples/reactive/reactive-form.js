#!/usr/bin/env node
import { reactive, validators } from '../../src/index.js';
if (process.stdin.ref) {
    console.log('DEBUG: Calling process.stdin.ref() at start');
    process.stdin.ref();
}
process.on('beforeExit', (code) => {
    console.log('DEBUG: Process is about to exit with code:', code);
});
async function main() {
    console.log('Starting reactive form demo...');
    console.log('Press Ctrl+C to exit at any time\n');
    console.log('TTY:', process.stdin.isTTY);
    console.log('setRawMode:', typeof process.stdin.setRawMode);
    console.log('DEBUG: Creating reactive prompt...');
    const reactivePrompt = reactive({
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
                validate: validators.compose(validators.required(), validators.minLength(3), validators.pattern(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores')),
            },
            {
                id: 'email',
                type: 'text',
                message: 'Email address',
                validate: validators.compose(validators.required(), validators.email()),
            },
            {
                id: 'age',
                type: 'number',
                message: 'Age',
                validate: validators.compose(validators.required(), validators.min(18, 'Must be 18 or older')),
            },
            {
                id: 'password',
                type: 'password',
                message: 'Password',
                validate: validators.compose(validators.required(), validators.minLength(8), validators.pattern(/[A-Z]/, 'Must contain uppercase'), validators.pattern(/[0-9]/, 'Must contain number')),
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
    });
    console.log('DEBUG: Reactive prompt created, calling prompt()...');
    const result = await reactivePrompt.prompt();
    console.log('DEBUG: prompt() completed');
    console.log('\nRegistration Complete!');
    console.log('Username:', result.username);
    console.log('Email:', result.email);
    console.log('Age:', result.age);
    console.log('Newsletter:', result.newsletter ? 'Subscribed' : 'Not subscribed');
}
main()
    .then(() => {
    console.log('DEBUG: main() completed successfully');
    process.exit(0);
})
    .catch((error) => {
    console.error('DEBUG: main() error:', error);
    process.exit(1);
});
//# sourceMappingURL=reactive-form.js.map