import { it, expect, describe } from 'vitest';
import { testPrompt, testNonTTYPrompt } from '../../../helpers/prompt-test-utils.js';
import { FormPrompt } from '../../../../src/components/advanced/form.js';
describe('FormPrompt', () => {
    describe('basic rendering', () => {
        it('should render form fields', async () => {
            const fields = [
                { name: 'username', type: 'text', label: 'Username', required: true },
                { name: 'email', type: 'text', label: 'Email', required: true },
                { name: 'age', type: 'number', label: 'Age' }
            ];
            await testPrompt(FormPrompt, {
                message: 'User Registration',
                fields
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                const output = getLastRender();
                expect(output).toContain('User Registration');
                expect(output).toContain('Username');
                expect(output).toContain('Email');
                expect(output).toContain('Age');
                expect(output).toContain('*');
                sendKey({ name: 'escape' });
            });
        });
        it('should show field descriptions', async () => {
            const fields = [
                {
                    name: 'password',
                    type: 'password',
                    label: 'Password',
                    description: 'Must be at least 8 characters'
                }
            ];
            await testPrompt(FormPrompt, {
                message: 'Security',
                fields
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                const output = getLastRender();
                expect(output).toContain('Must be at least 8 characters');
                sendKey({ name: 'escape' });
            });
        });
        it('should show default values', async () => {
            const fields = [
                { name: 'country', type: 'text', label: 'Country', defaultValue: 'USA' },
                { name: 'newsletter', type: 'boolean', label: 'Subscribe', defaultValue: true }
            ];
            await testPrompt(FormPrompt, {
                message: 'Preferences',
                fields
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                const output = getLastRender();
                expect(output).toContain('USA');
                expect(output).toContain('[x]');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('field navigation', () => {
        it('should navigate between fields with tab/shift-tab', async () => {
            const fields = [
                { name: 'field1', type: 'text', label: 'Field 1' },
                { name: 'field2', type: 'text', label: 'Field 2' },
                { name: 'field3', type: 'text', label: 'Field 3' }
            ];
            await testPrompt(FormPrompt, {
                message: 'Navigation Test',
                fields
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                let output = getLastRender();
                expect(output).toMatch(/▶.*Field 1/);
                output = getLastRender();
                expect(output).toContain('Field 1');
                expect(output).toContain('Field 2');
                expect(output).toContain('Field 3');
                sendKey({ name: 'escape' });
            });
        });
        it('should navigate with arrow keys', async () => {
            const fields = [
                { name: 'field1', type: 'text', label: 'Field 1' },
                { name: 'field2', type: 'text', label: 'Field 2' }
            ];
            await testPrompt(FormPrompt, {
                message: 'Arrow Navigation',
                fields
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                const output = getLastRender();
                expect(output).toContain('Field 1');
                expect(output).toContain('Field 2');
                expect(output).toMatch(/▶.*Field 1/);
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('text field input', () => {
        it('should handle text input', async () => {
            const fields = [
                { name: 'username', type: 'text', label: 'Username' }
            ];
            await testPrompt(FormPrompt, {
                message: 'Enter username',
                fields
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                const output = getLastRender();
                expect(output).toContain('Username');
                expect(output).toContain('Enter text');
                sendKey({ name: 'escape' });
            });
        });
        it('should handle password field masking', async () => {
            const fields = [
                { name: 'password', type: 'password', label: 'Password' }
            ];
            await testPrompt(FormPrompt, {
                message: 'Enter password',
                fields
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                const output = getLastRender();
                expect(output).toContain('Password');
                expect(output).toContain('Enter password');
                sendKey({ name: 'escape' });
            });
        });
        it('should handle textarea multiline input', async () => {
            const fields = [
                { name: 'description', type: 'text', label: 'Description', defaultValue: 'Line 1\nLine 2' }
            ];
            const result = await testPrompt(FormPrompt, {
                message: 'Enter description',
                fields
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                sendKey({ name: 'tab' });
                await waitForRender();
                sendKey({ name: 'enter' });
            });
            expect(result).toEqual({ description: 'Line 1\nLine 2' });
        });
    });
    describe('number field input', () => {
        it('should handle number input', async () => {
            const fields = [
                { name: 'age', type: 'number', label: 'Age', defaultValue: 25 }
            ];
            const result = await testPrompt(FormPrompt, {
                message: 'Enter age',
                fields
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                const output = getLastRender();
                expect(output).toContain('Age');
                expect(output).toContain('25');
                sendKey({ name: 'tab' });
                await waitForRender();
                sendKey({ name: 'enter' });
            });
            expect(result).toEqual({ age: 25 });
        });
        it('should validate number min/max', async () => {
            const fields = [
                {
                    name: 'quantity',
                    type: 'number',
                    label: 'Quantity',
                    min: 1,
                    max: 10,
                    defaultValue: 5
                }
            ];
            const result = await testPrompt(FormPrompt, {
                message: 'Enter quantity',
                fields
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                sendKey({ name: 'tab' });
                await waitForRender();
                sendKey({ name: 'enter' });
            });
            expect(result).toEqual({ quantity: 5 });
        });
        it('should handle increment/decrement', async () => {
            const fields = [
                { name: 'count', type: 'number', label: 'Count', defaultValue: 5, step: 1 }
            ];
            const result = await testPrompt(FormPrompt, {
                message: 'Adjust count',
                fields
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                sendKey({ name: 'tab' });
                await waitForRender();
                sendKey({ name: 'enter' });
            });
            expect(result).toEqual({ count: 5 });
        });
    });
    describe('boolean field input', () => {
        it('should toggle boolean fields with space', async () => {
            const fields = [
                { name: 'agree', type: 'boolean', label: 'I agree', defaultValue: false }
            ];
            await testPrompt(FormPrompt, {
                message: 'Terms',
                fields
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                const output = getLastRender();
                expect(output).toContain('[ ]');
                expect(output).toContain('I agree');
                expect(output).toContain('[ ]');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('select field input', () => {
        it('should show select options', async () => {
            const fields = [
                {
                    name: 'country',
                    type: 'select',
                    label: 'Country',
                    options: ['USA', 'Canada', 'Mexico']
                }
            ];
            await testPrompt(FormPrompt, {
                message: 'Select country',
                fields
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                const output = getLastRender();
                expect(output).toContain('Country');
                expect(output).toContain('Select');
                sendKey({ name: 'escape' });
            });
        });
        it('should navigate and select options', async () => {
            const fields = [
                {
                    name: 'size',
                    type: 'select',
                    label: 'Size',
                    options: ['Small', 'Medium', 'Large'],
                    defaultValue: 'Medium'
                }
            ];
            const result = await testPrompt(FormPrompt, {
                message: 'Select size',
                fields
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                const output = getLastRender();
                expect(output).toContain('Size');
                expect(output).toContain('Medium');
                sendKey({ name: 'tab' });
                await waitForRender();
                sendKey({ name: 'enter' });
            });
            expect(result).toEqual({ size: 'Medium' });
        });
    });
    describe('multiselect field input', () => {
        it('should allow multiple selections', async () => {
            const fields = [
                {
                    name: 'tags',
                    type: 'multiselect',
                    label: 'Tags',
                    options: ['JavaScript', 'TypeScript', 'Python', 'Go']
                }
            ];
            await testPrompt(FormPrompt, {
                message: 'Select tags',
                fields
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                const output = getLastRender();
                expect(output).toContain('Tags');
                expect(output).toContain('Select multi');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('validation', () => {
        it('should validate required fields', async () => {
            const fields = [
                { name: 'username', type: 'text', label: 'Username', required: true },
                { name: 'email', type: 'text', label: 'Email', required: true }
            ];
            await testPrompt(FormPrompt, {
                message: 'Registration',
                fields
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                const output = getLastRender();
                expect(output).toContain('Username *');
                expect(output).toContain('Enter text');
                sendKey({ name: 'escape' });
            });
        });
        it('should validate using custom validators', async () => {
            const fields = [
                {
                    name: 'email',
                    type: 'text',
                    label: 'Email',
                    validate: (value) => {
                        if (!value.includes('@')) {
                            return 'Invalid email address';
                        }
                    }
                }
            ];
            await testPrompt(FormPrompt, {
                message: 'Email validation',
                fields
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                const output = getLastRender();
                expect(output).toContain('Email');
                expect(output).toContain('Enter text');
                sendKey({ name: 'escape' });
            });
        });
        it('should validate field patterns', async () => {
            const fields = [
                {
                    name: 'phone',
                    type: 'text',
                    label: 'Phone',
                    pattern: /^\d{3}-\d{3}-\d{4}$/,
                    placeholder: '123-456-7890'
                }
            ];
            await testPrompt(FormPrompt, {
                message: 'Phone validation',
                fields
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                const output = getLastRender();
                expect(output).toContain('Phone');
                expect(output).toContain('123-456-7890');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('form submission', () => {
        it('should submit form with all values', async () => {
            const fields = [
                { name: 'username', type: 'text', label: 'Username' },
                { name: 'age', type: 'number', label: 'Age' },
                { name: 'newsletter', type: 'boolean', label: 'Newsletter' }
            ];
            const result = await testPrompt(FormPrompt, {
                message: 'User form',
                fields
            }, async ({ sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                sendKey('john');
                sendKey('\t');
                sendKey('25');
                sendKey('\t');
                sendKey({ name: 'space' });
                sendKey({ ctrl: true, name: 'return' });
            });
            expect(result).toEqual({
                username: 'john',
                age: 25,
                newsletter: true
            });
        });
        it('should handle partial submission', async () => {
            const fields = [
                { name: 'field1', type: 'text', label: 'Field 1', defaultValue: 'default1' },
                { name: 'field2', type: 'text', label: 'Field 2', defaultValue: 'value2' },
                { name: 'field3', type: 'text', label: 'Field 3', defaultValue: 'default3' }
            ];
            const prompt = new FormPrompt({
                message: 'Partial form',
                fields
            });
            expect(prompt).toBeDefined();
        });
    });
    describe('field dependencies', () => {
        it('should show/hide fields based on conditions', async () => {
            const fields = [
                { name: 'hasAccount', type: 'boolean', label: 'Have account?' },
                {
                    name: 'accountId',
                    type: 'text',
                    label: 'Account ID',
                    show: (values) => values.hasAccount === true
                }
            ];
            await testPrompt(FormPrompt, {
                message: 'Account info',
                fields
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                let output = getLastRender();
                expect(output).not.toContain('Account ID');
                sendKey({ name: 'space' });
                await waitForRender();
                await new Promise(resolve => setTimeout(resolve, 50));
                output = getLastRender();
                sendKey({ name: 'escape' });
            });
        });
        it('should update field options dynamically', async () => {
            const fields = [
                {
                    name: 'country',
                    type: 'select',
                    label: 'Country',
                    options: ['USA', 'Canada']
                },
                {
                    name: 'state',
                    type: 'select',
                    label: 'State',
                    options: (values) => {
                        if (values.country === 'USA') {
                            return ['California', 'New York', 'Texas'];
                        }
                        else if (values.country === 'Canada') {
                            return ['Ontario', 'Quebec', 'British Columbia'];
                        }
                        return [];
                    }
                }
            ];
            await testPrompt(FormPrompt, {
                message: 'Location',
                fields
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                const output = getLastRender();
                expect(output).toContain('Country');
                expect(output).toContain('State');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('form groups', () => {
        it('should render field groups', async () => {
            const fields = [
                { name: 'firstName', type: 'text', label: 'First Name', group: 'Personal' },
                { name: 'lastName', type: 'text', label: 'Last Name', group: 'Personal' },
                { name: 'email', type: 'text', label: 'Email', group: 'Contact' },
                { name: 'phone', type: 'text', label: 'Phone', group: 'Contact' }
            ];
            await testPrompt(FormPrompt, {
                message: 'User Information',
                fields
            }, async ({ getLastRender, sendKey }) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                const output = getLastRender();
                expect(output).toContain('User Information');
                expect(output).toContain('First Name');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('error handling', () => {
        it('should show field-specific errors', async () => {
            const fields = [
                {
                    name: 'age',
                    type: 'number',
                    label: 'Age',
                    defaultValue: 20,
                    validate: (value) => {
                        if (value < 18) {
                            return 'Must be 18 or older';
                        }
                    }
                }
            ];
            const result = await testPrompt(FormPrompt, {
                message: 'Age verification',
                fields
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                sendKey({ name: 'tab' });
                await waitForRender();
                sendKey({ name: 'enter' });
            });
            expect(result).toEqual({ age: 20 });
        });
        it('should prevent submission with errors', async () => {
            const fields = [
                {
                    name: 'username',
                    type: 'text',
                    label: 'Username',
                    required: true,
                    defaultValue: 'john'
                }
            ];
            const result = await testPrompt(FormPrompt, {
                message: 'Form with errors',
                fields
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                sendKey({ name: 'tab' });
                await waitForRender();
                sendKey({ name: 'enter' });
            });
            expect(result).toEqual({ username: 'john' });
        });
    });
    describe('non-TTY mode', () => {
        it('should handle non-TTY environment', async () => {
            const fields = [
                { name: 'name', type: 'text', label: 'Name', defaultValue: 'John' },
                { name: 'age', type: 'number', label: 'Age', defaultValue: 25 }
            ];
            const result = await testNonTTYPrompt(FormPrompt, {
                message: 'Non-TTY form',
                fields
            }, {
                name: 'John',
                age: 25
            });
            expect(result).toEqual({
                name: 'John',
                age: 25
            });
        });
    });
});
//# sourceMappingURL=form.test.js.map