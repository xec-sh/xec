import { it, vi, expect, describe } from 'vitest';
import { cancelSymbol } from '../../../../src/core/types.js';
import { TextPrompt } from '../../../../src/components/primitives/text.js';
import { SelectPrompt } from '../../../../src/components/primitives/select.js';
import { wizard, WizardPrompt } from '../../../../src/components/layout/wizard.js';
describe('WizardPrompt', () => {
    describe('initialization', () => {
        it('should create with pages', () => {
            const prompt = new WizardPrompt({
                message: 'Test Wizard',
                pages: [
                    {
                        id: 'page1',
                        title: 'Page 1',
                        render: () => new TextPrompt({ message: 'Name?' })
                    },
                    {
                        id: 'page2',
                        title: 'Page 2',
                        render: () => new SelectPrompt({ message: 'Color?', options: ['red', 'blue'] })
                    }
                ]
            });
            expect(prompt.config.pages).toHaveLength(2);
        });
        it('should accept wizard options', () => {
            const prompt = new WizardPrompt({
                message: 'Test Wizard',
                title: 'Setup Wizard',
                showProgress: true,
                showNavigation: true,
                allowSkip: true,
                allowBack: true,
                pages: []
            });
            expect(prompt.config.title).toBe('Setup Wizard');
            expect(prompt.config.showProgress).toBe(true);
            expect(prompt.config.showNavigation).toBe(true);
            expect(prompt.config.allowSkip).toBe(true);
            expect(prompt.config.allowBack).toBe(true);
        });
        it('should set default options', () => {
            const prompt = new WizardPrompt({
                message: 'Test Wizard',
                pages: []
            });
            expect(prompt.config.showProgress).toBe(true);
            expect(prompt.config.showNavigation).toBe(true);
            expect(prompt.config.allowBack).toBe(true);
            expect(prompt.config.allowSkip).toBe(true);
        });
    });
    describe('rendering', () => {
        it('should display title', async () => {
            const prompt = new WizardPrompt({
                message: 'Test Wizard',
                title: 'Configuration Wizard',
                pages: []
            });
            const rendered = prompt.render();
            expect(rendered).toContain('Configuration Wizard');
        });
        it('should show progress indicator', async () => {
            const prompt = new WizardPrompt({
                message: 'Test Wizard',
                showProgress: true,
                pages: [
                    { id: 'p1', render: () => 'Page 1' },
                    { id: 'p2', render: () => 'Page 2' },
                    { id: 'p3', render: () => 'Page 3' }
                ]
            });
            const rendered = prompt.render();
            expect(rendered).toContain('○');
            expect(rendered).toContain('(1/3)');
        });
        it('should show current page title', async () => {
            const prompt = new WizardPrompt({
                message: 'Test Wizard',
                pages: [
                    {
                        id: 'page1',
                        title: 'Personal Information',
                        render: () => 'Content'
                    }
                ]
            });
            const rendered = prompt.render();
            expect(rendered).toContain('Personal Information');
        });
        it('should show navigation help', async () => {
            const prompt = new WizardPrompt({
                message: 'Test Wizard',
                showNavigation: true,
                allowBack: true,
                allowSkip: true,
                pages: [{ id: 'p1', render: () => 'Page' }]
            });
            const rendered = prompt.render();
            expect(rendered).toContain('Skip');
            expect(rendered).toContain('Cancel');
        });
    });
    describe('page navigation', () => {
        it('should navigate through pages sequentially', async () => {
            const pageOrder = [];
            const mockPrompt1 = {
                prompt: vi.fn().mockResolvedValue('value1'),
                render: vi.fn().mockReturnValue(''),
                handleInput: vi.fn()
            };
            const mockPrompt2 = {
                prompt: vi.fn().mockResolvedValue('value2'),
                render: vi.fn().mockReturnValue(''),
                handleInput: vi.fn()
            };
            const prompt = new WizardPrompt({
                message: 'Test Wizard',
                pages: [
                    {
                        id: 'page1',
                        render: () => {
                            pageOrder.push('page1');
                            return mockPrompt1;
                        }
                    },
                    {
                        id: 'page2',
                        render: () => {
                            pageOrder.push('page2');
                            return mockPrompt2;
                        }
                    }
                ]
            });
            const result = await prompt.prompt();
            expect(pageOrder).toEqual(['page1', 'page2']);
            expect(result).toEqual({
                page1: 'value1',
                page2: 'value2'
            });
        });
        it('should handle page skip conditions', async () => {
            const mockPrompt1 = {
                prompt: vi.fn().mockResolvedValue(false),
                render: vi.fn().mockReturnValue(''),
                handleInput: vi.fn()
            };
            const mockPrompt2 = {
                prompt: vi.fn().mockResolvedValue('skipped'),
                render: vi.fn().mockReturnValue(''),
                handleInput: vi.fn()
            };
            const mockPrompt3 = {
                prompt: vi.fn().mockResolvedValue('value3'),
                render: vi.fn().mockReturnValue(''),
                handleInput: vi.fn()
            };
            const prompt = new WizardPrompt({
                message: 'Test Wizard',
                pages: [
                    {
                        id: 'shouldSkip',
                        render: () => mockPrompt1
                    },
                    {
                        id: 'skippedPage',
                        render: () => mockPrompt2,
                        skip: (context) => context.shouldSkip === false
                    },
                    {
                        id: 'finalPage',
                        render: () => mockPrompt3
                    }
                ]
            });
            const result = await prompt.prompt();
            expect(mockPrompt2.prompt).not.toHaveBeenCalled();
            expect(result).toEqual({
                shouldSkip: false,
                finalPage: 'value3'
            });
        });
        it('should support string content pages', async () => {
            const prompt = new WizardPrompt({
                message: 'Test Wizard',
                pages: [
                    {
                        id: 'info',
                        title: 'Information',
                        render: () => 'This is an information page'
                    }
                ]
            });
            const result = await prompt.prompt();
            expect(result).toBe(cancelSymbol);
        });
    });
    describe('validation', () => {
        it('should validate page results', async () => {
            let validationAttempts = 0;
            const mockPrompt = {
                prompt: vi.fn()
                    .mockResolvedValueOnce('invalid')
                    .mockResolvedValueOnce('valid'),
                render: vi.fn().mockReturnValue(''),
                handleInput: vi.fn()
            };
            const prompt = new WizardPrompt({
                message: 'Test Wizard',
                pages: [
                    {
                        id: 'validated',
                        render: () => mockPrompt,
                        validate: (value) => {
                            validationAttempts++;
                            return value === 'invalid' ? 'Invalid value' : undefined;
                        }
                    }
                ]
            });
            const result = await prompt.prompt();
            expect(validationAttempts).toBe(2);
            expect(mockPrompt.prompt).toHaveBeenCalledTimes(2);
            expect(result).toEqual({ validated: 'valid' });
        });
    });
    describe('callbacks', () => {
        it('should call onPageChange', async () => {
            const pageChanges = [];
            const mockPrompt1 = {
                prompt: vi.fn().mockResolvedValue('value1'),
                render: vi.fn().mockReturnValue(''),
                handleInput: vi.fn()
            };
            const mockPrompt2 = {
                prompt: vi.fn().mockResolvedValue('value2'),
                render: vi.fn().mockReturnValue(''),
                handleInput: vi.fn()
            };
            const prompt = new WizardPrompt({
                message: 'Test Wizard',
                pages: [
                    { id: 'page1', render: () => mockPrompt1 },
                    { id: 'page2', render: () => mockPrompt2 }
                ],
                onPageChange: async (from, to) => {
                    pageChanges.push({ from, to });
                }
            });
            await prompt.prompt();
            expect(pageChanges).toEqual([
                { from: 'page1', to: 'page2' }
            ]);
        });
        it('should call onComplete', async () => {
            let completedContext = null;
            const mockPrompt = {
                prompt: vi.fn().mockResolvedValue('test'),
                render: vi.fn().mockReturnValue(''),
                handleInput: vi.fn()
            };
            const prompt = new WizardPrompt({
                message: 'Test Wizard',
                pages: [
                    { id: 'page1', render: () => mockPrompt }
                ],
                onComplete: async (context) => {
                    completedContext = context;
                }
            });
            await prompt.prompt();
            expect(completedContext).toEqual({ page1: 'test' });
        });
    });
    describe('cancellation', () => {
        it('should handle page cancellation', async () => {
            const mockPrompt = {
                prompt: vi.fn().mockResolvedValue(cancelSymbol),
                render: vi.fn().mockReturnValue(''),
                handleInput: vi.fn()
            };
            const prompt = new WizardPrompt({
                message: 'Test Wizard',
                pages: [
                    { id: 'page1', render: () => mockPrompt }
                ]
            });
            const result = await prompt.prompt();
            expect(result).toBe(cancelSymbol);
        });
    });
    describe('progress rendering', () => {
        it('should render progress dots', () => {
            const prompt = new WizardPrompt({
                message: 'Test Wizard',
                pages: [
                    { id: 'p1', render: () => 'Page 1' },
                    { id: 'p2', render: () => 'Page 2' },
                    { id: 'p3', render: () => 'Page 3' }
                ]
            });
            const progress = prompt.renderProgress(2, 3);
            expect(progress).toContain('●');
            expect(progress).toContain('○');
            expect(progress).toContain('(2/3)');
        });
    });
    describe('helper function', () => {
        it('should create wizard with options', () => {
            const wizardPrompt = wizard({
                title: 'Setup',
                pages: [
                    {
                        id: 'welcome',
                        title: 'Welcome',
                        render: () => 'Welcome to the setup wizard'
                    }
                ],
                showProgress: true,
                allowBack: true
            });
            expect(wizardPrompt).toBeInstanceOf(WizardPrompt);
            expect(wizardPrompt.config.title).toBe('Setup');
            expect(wizardPrompt.config.showProgress).toBe(true);
            expect(wizardPrompt.config.allowBack).toBe(true);
        });
    });
    describe('final render', () => {
        it('should show completion summary', async () => {
            const mockPrompt1 = {
                prompt: vi.fn().mockResolvedValue('John'),
                render: vi.fn().mockReturnValue(''),
                handleInput: vi.fn()
            };
            const mockPrompt2 = {
                prompt: vi.fn().mockResolvedValue('Engineer'),
                render: vi.fn().mockReturnValue(''),
                handleInput: vi.fn()
            };
            const prompt = new WizardPrompt({
                message: 'Test Wizard',
                title: 'User Setup',
                pages: [
                    { id: 'name', title: 'Name', render: () => mockPrompt1 },
                    { id: 'role', title: 'Role', render: () => mockPrompt2 }
                ]
            });
            await prompt.prompt();
            const finalRender = prompt.renderFinal();
            expect(finalRender).toContain('User Setup');
            expect(finalRender).toContain('Name: John');
            expect(finalRender).toContain('Role: Engineer');
        });
        it('should format different value types', () => {
            const prompt = new WizardPrompt({
                message: 'Test Wizard',
                pages: []
            });
            const formatMethod = prompt.formatPageResult;
            expect(formatMethod(true)).toBe('Yes');
            expect(formatMethod(false)).toBe('No');
            expect(formatMethod(['a', 'b', 'c'])).toBe('a, b, c');
            expect(formatMethod({ field1: 'value1', field2: 'value2' })).toBe('2 fields');
            expect(formatMethod('simple string')).toBe('simple string');
            expect(formatMethod(42)).toBe('42');
        });
    });
});
//# sourceMappingURL=wizard.test.js.map