/**
 * @module dev-tools/component-explorer
 * Visual component explorer for Kit components
 */

import { EventEmitter } from '../core/event-emitter.js';
import { PanelPrompt } from '../components/layout/panel.js';
import { SelectPrompt } from '../components/primitives/select.js';

import type { Theme } from '../core/types.js';
import type { Prompt } from '../core/prompt.js';

/**
 * Component example
 */
export interface ComponentExample {
  /**
   * Example name
   */
  name: string;
  
  /**
   * Example description
   */
  description?: string;
  
  /**
   * Example code
   */
  code: string;
  
  /**
   * Function to create the component
   */
  create: () => Prompt<any, any> | Promise<Prompt<any, any>>;
  
  /**
   * Expected result (for testing)
   */
  expectedResult?: any;
}

/**
 * Component documentation
 */
export interface ComponentDoc {
  /**
   * Component name
   */
  name: string;
  
  /**
   * Component category
   */
  category: 'primitives' | 'advanced' | 'feedback' | 'layout';
  
  /**
   * Component description
   */
  description: string;
  
  /**
   * Component examples
   */
  examples: ComponentExample[];
  
  /**
   * API documentation
   */
  api?: {
    options?: Record<string, { type: string; description: string; default?: any }>;
    methods?: Record<string, { description: string; returns?: string }>;
    events?: Record<string, { description: string; payload?: string }>;
  };
}

/**
 * Component explorer options
 */
export interface ComponentExplorerOptions {
  /**
   * Components to explore
   */
  components: ComponentDoc[];
  
  /**
   * Theme to use
   */
  theme?: Theme;
  
  /**
   * Enable interactive mode
   */
  interactive?: boolean;
  
  /**
   * Show source code
   */
  showSource?: boolean;
  
  /**
   * Show API documentation
   */
  showApi?: boolean;
}

/**
 * Component explorer for testing and documentation
 * 
 * @class ComponentExplorer
 * @extends EventEmitter
 * 
 * @example
 * ```typescript
 * const explorer = new ComponentExplorer({
 *   components: [
 *     {
 *       name: 'text',
 *       category: 'primitives',
 *       description: 'Text input component',
 *       examples: [
 *         {
 *           name: 'Basic text input',
 *           code: `await text('What is your name?')`,
 *           create: () => new TextPrompt({ message: 'What is your name?' })
 *         }
 *       ]
 *     }
 *   ]
 * });
 * 
 * await explorer.start();
 * ```
 */
export class ComponentExplorer extends EventEmitter {
  private components: ComponentDoc[];
  private options: ComponentExplorerOptions;
  private currentComponent?: ComponentDoc;
  private currentExample?: ComponentExample;

  constructor(options: ComponentExplorerOptions) {
    super();
    this.components = options.components;
    this.options = options;
  }

  /**
   * Start the component explorer
   */
  async start(): Promise<void> {
    console.clear();
    console.log('🧪 Kit Component Explorer\n');
    
    while (true) {
      // Select component category
      const category = await this.selectCategory();
      if (!category) break;
      
      // Select component
      const component = await this.selectComponent(category);
      if (!component) continue;
      
      this.currentComponent = component;
      
      // Select example
      const example = await this.selectExample(component);
      if (!example) continue;
      
      this.currentExample = example;
      
      // Show component
      await this.showComponent(component, example);
      
      // Ask to continue
      const continueExploring = await this.askContinue();
      if (!continueExploring) break;
    }
    
    console.log('\n👋 Thanks for exploring Kit components!');
  }

  /**
   * Select component category
   */
  private async selectCategory(): Promise<string | null> {
    const categories = ['primitives', 'advanced', 'feedback', 'layout', 'exit'];
    
    const select = new SelectPrompt({
      message: 'Select a component category:',
      options: categories.map(cat => ({
        value: cat,
        label: cat === 'exit' ? '❌ Exit Explorer' : `📁 ${cat}`,
        hint: this.getCategoryDescription(cat),
      })),
    });
    
    const result = await select.prompt();
    if (typeof result === 'symbol') return null;
    return result === 'exit' ? null : result;
  }

  /**
   * Get category description
   */
  private getCategoryDescription(category: string): string {
    const descriptions: Record<string, string> = {
      primitives: 'Basic input components (text, select, confirm)',
      advanced: 'Complex components (autocomplete, table, form)',
      feedback: 'Progress and status components',
      layout: 'Layout and organization components',
      exit: 'Exit the component explorer',
    };
    return descriptions[category] || '';
  }

  /**
   * Select component from category
   */
  private async selectComponent(category: string): Promise<ComponentDoc | null> {
    const categoryComponents = this.components.filter(c => c.category === category);
    
    if (categoryComponents.length === 0) {
      console.log(`\n⚠️  No components found in category: ${category}\n`);
      return null;
    }
    
    const options = [
      ...categoryComponents.map(comp => ({
        value: comp.name,
        label: `🧩 ${comp.name}`,
        hint: comp.description,
      })),
      { value: 'back', label: '← Back', hint: 'Return to category selection' },
    ];
    
    const select = new SelectPrompt({
      message: `Select a ${category} component:`,
      options,
    });
    
    const result = await select.prompt();
    
    if (result === 'back') return null;
    
    return categoryComponents.find(c => c.name === result) || null;
  }

  /**
   * Select component example
   */
  private async selectExample(component: ComponentDoc): Promise<ComponentExample | null> {
    if (component.examples.length === 0) {
      console.log(`\n⚠️  No examples found for component: ${component.name}\n`);
      return null;
    }
    
    if (component.examples.length === 1) {
      return component.examples[0] || null;
    }
    
    const options = [
      ...component.examples.map((ex, i) => ({
        value: i,
        label: `📝 ${ex.name}`,
        hint: ex.description,
      })),
      { value: -1, label: '← Back', hint: 'Return to component selection' },
    ];
    
    const select = new SelectPrompt({
      message: `Select an example for ${component.name}:`,
      options,
    });
    
    const result = await select.prompt();
    
    if (typeof result === 'symbol' || result === -1) return null;
    
    return component.examples[result as number] || null;
  }

  /**
   * Show component with example
   */
  private async showComponent(component: ComponentDoc, example: ComponentExample): Promise<void> {
    console.clear();
    
    // Show header
    const panel = new PanelPrompt({
      message: `🧩 ${component.name}`,
      title: `🧩 ${component.name}`,
      content: component.description,
    });
    console.log(panel.render());
    
    // Show example info
    console.log(`\n📝 Example: ${example.name}`);
    if (example.description) {
      console.log(`   ${example.description}`);
    }
    
    // Show code
    if (this.options.showSource !== false) {
      console.log('\n📄 Code:');
      console.log('```typescript');
      console.log(example.code);
      console.log('```');
    }
    
    // Show API docs
    if (this.options.showApi && component.api) {
      console.log('\n📚 API:');
      
      if (component.api.options) {
        console.log('\nOptions:');
        for (const [name, info] of Object.entries(component.api.options)) {
          console.log(`  ${name}: ${info.type} - ${info.description}`);
          if (info.default !== undefined) {
            console.log(`    Default: ${JSON.stringify(info.default)}`);
          }
        }
      }
      
      if (component.api.methods) {
        console.log('\nMethods:');
        for (const [name, info] of Object.entries(component.api.methods)) {
          console.log(`  ${name}() - ${info.description}`);
          if (info.returns) {
            console.log(`    Returns: ${info.returns}`);
          }
        }
      }
    }
    
    // Run interactive demo
    if (this.options.interactive !== false) {
      console.log('\n🎮 Interactive Demo:\n');
      
      try {
        const prompt = await example.create();
        const result = await prompt.prompt();
        
        console.log('\n✅ Result:', JSON.stringify(result, null, 2));
        
        if (example.expectedResult !== undefined) {
          const passed = JSON.stringify(result) === JSON.stringify(example.expectedResult);
          console.log(`\n🧪 Test: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
          if (!passed) {
            console.log(`   Expected: ${JSON.stringify(example.expectedResult)}`);
            console.log(`   Actual: ${JSON.stringify(result)}`);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('cancelled')) {
          console.log('\n⚠️  Demo cancelled');
        } else {
          console.log('\n❌ Error:', error);
        }
      }
    }
  }

  /**
   * Ask to continue exploring
   */
  private async askContinue(): Promise<boolean> {
    const select = new SelectPrompt({
      message: '\nWhat would you like to do?',
      options: [
        { value: 'continue', label: '🔄 Continue exploring' },
        { value: 'exit', label: '❌ Exit' },
      ],
    });
    
    const result = await select.prompt();
    return result === 'continue';
  }

  /**
   * Generate documentation for all components
   */
  generateDocumentation(): string {
    let doc = '# Kit Components\n\n';
    
    const categories = ['primitives', 'advanced', 'feedback', 'layout'];
    
    for (const category of categories) {
      const categoryComponents = this.components.filter(c => c.category === category);
      if (categoryComponents.length === 0) continue;
      
      doc += `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
      
      for (const component of categoryComponents) {
        doc += `### ${component.name}\n\n`;
        doc += `${component.description}\n\n`;
        
        if (component.examples.length > 0) {
          doc += '#### Examples\n\n';
          
          for (const example of component.examples) {
            doc += `**${example.name}**\n\n`;
            if (example.description) {
              doc += `${example.description}\n\n`;
            }
            doc += '```typescript\n';
            doc += example.code;
            doc += '\n```\n\n';
          }
        }
        
        if (component.api) {
          doc += '#### API\n\n';
          
          if (component.api.options) {
            doc += '**Options:**\n\n';
            doc += '| Option | Type | Description | Default |\n';
            doc += '|--------|------|-------------|----------|\n';
            
            for (const [name, info] of Object.entries(component.api.options)) {
              const defaultVal = info.default !== undefined ? `\`${JSON.stringify(info.default)}\`` : '-';
              doc += `| ${name} | ${info.type} | ${info.description} | ${defaultVal} |\n`;
            }
            doc += '\n';
          }
        }
      }
    }
    
    return doc;
  }
}