# @xec-sh/kit Architecture Specification

## 1. Executive Summary

The @xec-sh/kit library provides a comprehensive set of terminal UI components for building interactive command-line applications. This specification addresses critical architectural issues discovered in the reactive prompt system and proposes a complete redesign to enable proper multi-prompt scenarios.

## 2. Current Architecture Problems

### 2.1 The Core Issue
The reactive prompt system fails because of fundamental conflicts in resource management:

1. **Multiple StreamHandler Instances**: Each `Prompt` creates its own `StreamHandler` in the constructor, leading to multiple instances trying to manage the same stdin/stdout
2. **Lifecycle Conflicts**: Child prompts are created but never properly initialized through their `prompt()` method
3. **Direct Method Access**: ReactivePrompt tries to use internal methods (`render()`, `handleInput()`) without proper lifecycle management
4. **Resource Contention**: Multiple event listeners on the same stdin create race conditions

### 2.2 Symptom Analysis
- The reactive form example exits immediately after showing the initial prompt
- StreamHandler cleanup is triggered prematurely
- Event handlers are registered but never receive input
- The process terminates because no active resources keep it alive

## 3. Proposed Architecture Redesign

### 3.1 Architecture Diagrams

#### Current (Broken) Architecture
```
ReactivePrompt
├── StreamHandler (instance 1)
├── Renderer
└── Child Prompts
    ├── TextPrompt
    │   └── StreamHandler (instance 2) ❌ Conflict!
    ├── SelectPrompt
    │   └── StreamHandler (instance 3) ❌ Conflict!
    └── PasswordPrompt
        └── StreamHandler (instance 4) ❌ Conflict!
```

#### Proposed Architecture
```
ReactivePrompt
├── StreamHandler (shared instance) ✓
├── Renderer (uses shared stream)
└── Prompt Wrappers
    ├── TextPrompt Wrapper
    │   └── TextPrompt (uses shared stream)
    ├── SelectPrompt Wrapper
    │   └── SelectPrompt (uses shared stream)
    └── PasswordPrompt Wrapper
        └── PasswordPrompt (uses shared stream)
```

### 3.2 Core Principles

1. **Single Responsibility**: Separate concerns between prompt logic and I/O management
2. **Resource Sharing**: Enable components to share a single StreamHandler instance
3. **Lifecycle Management**: Properly manage component lifecycle states
4. **Composition over Inheritance**: Use composition patterns for complex prompts

### 3.2 Key Architectural Changes

#### 3.2.1 StreamHandler as Singleton/Shared Resource
```typescript
// Option 1: Dependency Injection
interface PromptConfig<T> {
  stream?: StreamHandler;
  // ... other config
}

// Option 2: StreamHandler Factory
class StreamHandlerFactory {
  private static instance?: StreamHandler;
  
  static getShared(): StreamHandler {
    if (!this.instance) {
      this.instance = new StreamHandler();
    }
    return this.instance;
  }
}
```

#### 3.2.2 Prompt Lifecycle States
```typescript
enum PromptLifecycle {
  Created = 'created',
  Initialized = 'initialized',
  Active = 'active',
  Completed = 'completed',
  Disposed = 'disposed'
}
```

#### 3.2.3 New Base Prompt Architecture
```typescript
abstract class Prompt<T> {
  protected lifecycle: PromptLifecycle = PromptLifecycle.Created;
  protected stream: StreamHandler;
  protected renderer: Renderer;
  
  constructor(config: PromptConfig<T>) {
    // Accept optional stream, create own if not provided
    this.stream = config.stream ?? new StreamHandler();
    // Renderer always uses the same stream
    this.renderer = new Renderer({ 
      theme: config.theme,
      stream: this.stream 
    });
  }
  
  // Separate initialization from construction
  protected async initialize(): Promise<void> {
    if (this.lifecycle !== PromptLifecycle.Created) return;
    this.lifecycle = PromptLifecycle.Initialized;
    // Setup that doesn't conflict with other prompts
  }
  
  // Public API for rendering without full prompt lifecycle
  async renderOnly(): Promise<string> {
    if (this.lifecycle === PromptLifecycle.Created) {
      await this.initialize();
    }
    return this.render();
  }
  
  // Handle input without full prompt lifecycle
  async handleInputOnly(key: Key): Promise<void> {
    if (this.lifecycle === PromptLifecycle.Created) {
      await this.initialize();
    }
    await this.handleInput(key);
  }
}
```

## 4. Implementation Plan

### ✅ IMPLEMENTATION STATUS: ALL PHASES COMPLETED

### Phase 1: Core Infrastructure (Week 1) ✅ COMPLETED

#### Step 1.1: StreamHandler Refactoring
- [x] Add support for shared mode vs exclusive mode
- [x] Implement reference counting for shared streams
- [x] Add stream ownership transfer mechanism
- [x] Create StreamHandlerFactory for shared instances

#### Step 1.2: Base Prompt Refactoring
- [x] Separate initialization from construction
- [x] Add lifecycle state management
- [x] Implement renderOnly() and handleInputOnly() methods
- [x] Add stream injection support

#### Step 1.3: Renderer Updates
- [x] Ensure renderer can work with shared streams
- [x] Add render context isolation
- [x] Implement render region management

### Phase 2: ReactivePrompt Redesign (Week 2) ✅ COMPLETED

#### Step 2.1: New ReactivePrompt Architecture ✅
```typescript
class ReactivePrompt<T> {
  private stream: StreamHandler;
  private renderer: Renderer;
  private promptDefinitions: ReactivePromptDefinition[];
  private activePrompt?: PromptWrapper;
  
  constructor(config: ReactivePromptConfig<T>) {
    // Single shared stream for all operations
    this.stream = new StreamHandler({ shared: true });
    this.renderer = new Renderer({ stream: this.stream });
  }
  
  // Wrapper to manage child prompts without full lifecycle
  private createPromptWrapper(definition: ReactivePromptDefinition): PromptWrapper {
    const prompt = this.createPromptInstance(definition, {
      stream: this.stream // Share our stream
    });
    
    return {
      prompt,
      definition,
      render: () => prompt.renderOnly(),
      handleInput: (key) => prompt.handleInputOnly(key),
      getValue: () => prompt.getValue()
    };
  }
}
```

#### Step 2.2: Prompt Coordination ✅
- [x] Implement PromptWrapper abstraction
- [x] Add prompt switching logic
- [x] Handle value extraction without prompt completion
- [x] Manage validation and state updates

#### Step 2.3: Event Management ✅
- [x] Centralize all input handling in ReactivePrompt
- [x] Prevent child prompts from starting their own streams
- [x] Coordinate navigation between prompts

### Phase 3: Component Updates (Week 3) ✅ COMPLETED

#### Step 3.1: Update Primitive Components ✅
- [x] TextPrompt: Add renderOnly/handleInputOnly support
- [x] SelectPrompt: Add renderOnly/handleInputOnly support
- [x] ConfirmPrompt: Add renderOnly/handleInputOnly support
- [x] NumberPrompt: Add renderOnly/handleInputOnly support
- [x] MultiSelectPrompt: Add renderOnly/handleInputOnly support
- [x] PasswordPrompt: Add renderOnly/handleInputOnly support

#### Step 3.2: Update Advanced Components ✅
- [x] FormPrompt: Refactor to use new architecture
- [x] WizardPrompt: Refactor to use new architecture
- [x] AutocompletePrompt: Fix override issues

### Phase 4: Testing & Migration (Week 4) ✅ COMPLETED

#### Step 4.1: Test Infrastructure ✅
- [x] Update mock-tty to support shared streams
- [x] Create integration tests for multi-prompt scenarios
- [x] Add lifecycle state tests

#### Step 4.2: Migration Guide ✅
- [x] Document breaking changes
- [x] Provide migration examples
- [x] Update all examples

#### Step 4.3: Performance Optimization ✅
- [x] Profile stream handler performance
- [x] Optimize render cycles
- [x] Reduce memory footprint

## 5. Detailed Implementation Steps

### 5.1 StreamHandler Modifications

```typescript
// stream-handler.ts
export interface StreamHandlerOptions {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  isTTY?: boolean;
  shared?: boolean; // New option
}

export class StreamHandler extends EventEmitter {
  private refCount = 0;
  private isShared: boolean;
  
  constructor(options: StreamHandlerOptions = {}) {
    super();
    this.isShared = options.shared ?? false;
    // ... existing initialization
  }
  
  // Reference counting for shared mode
  acquire(): void {
    if (this.isShared) {
      this.refCount++;
      if (this.refCount === 1) {
        this.start();
      }
    }
  }
  
  release(): void {
    if (this.isShared) {
      this.refCount--;
      if (this.refCount === 0) {
        this.stop();
      }
    }
  }
  
  // Check if can start exclusively
  canStartExclusive(): boolean {
    return !this.isShared || this.refCount === 0;
  }
}
```

### 5.2 Base Prompt Modifications

```typescript
// prompt.ts
export interface PromptConfig<TValue, TConfig> {
  stream?: StreamHandler;
  sharedStream?: boolean;
  // ... existing config
}

export abstract class Prompt<TValue = any, TConfig = {}> extends EventEmitter {
  protected stream: StreamHandler;
  protected ownStream: boolean;
  
  constructor(config: PromptConfig<TValue, TConfig> & TConfig) {
    super();
    
    // Use provided stream or create new one
    if (config.stream) {
      this.stream = config.stream;
      this.ownStream = false;
    } else {
      this.stream = new StreamHandler({ 
        shared: config.sharedStream 
      });
      this.ownStream = true;
    }
    
    // Renderer always uses our stream
    this.renderer = new Renderer({ 
      theme: this.theme, 
      stream: this.stream 
    });
  }
  
  // New method for render-only mode
  async renderOnly(): Promise<string> {
    // Initialize if needed
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.render();
  }
  
  // New method for handling input without full lifecycle
  async handleInputOnly(key: Key): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    await this.handleInput(key);
  }
  
  // New method to get current value
  getValue(): TValue | undefined {
    const state = this.state.getState();
    return state.value;
  }
  
  // Modified cleanup
  protected cleanup(): void {
    if (this.ownStream) {
      this.stream.stop();
    }
    // ... rest of cleanup
  }
}
```

### 5.3 ReactivePrompt Complete Redesign

```typescript
// reactive-prompt.ts
interface PromptWrapper<T = any> {
  definition: ReactivePromptDefinition;
  instance: Prompt<T, any>;
  render(): Promise<string>;
  handleInput(key: Key): Promise<void>;
  getValue(): T | undefined;
  validate(): Promise<boolean | string>;
}

export class ReactivePrompt<T extends Record<string, any>> extends EventEmitter {
  private stream: StreamHandler;
  private renderer: Renderer;
  private state: ReactiveState<T>;
  private prompts: PromptWrapper[] = [];
  private currentIndex = 0;
  private isRunning = false;
  
  constructor(config: ReactivePromptConfig<T>) {
    super();
    
    this.state = new ReactiveState(config.initialValues);
    this.stream = new StreamHandler();
    this.renderer = new Renderer({ 
      theme: config.theme, 
      stream: this.stream 
    });
    
    // Initialize prompts
    this.initializePrompts(config.prompts);
  }
  
  private initializePrompts(promptsFn: (state: ReactiveState<T>) => ReactivePromptDefinition[]): void {
    const definitions = promptsFn(this.state);
    
    this.prompts = definitions.map(def => {
      const instance = this.createPromptInstance(def);
      
      return {
        definition: def,
        instance,
        render: () => instance.renderOnly(),
        handleInput: (key: Key) => instance.handleInputOnly(key),
        getValue: () => instance.getValue(),
        validate: async () => {
          if (!def.validate) return true;
          const value = instance.getValue();
          return def.validate(value);
        }
      };
    });
  }
  
  private createPromptInstance(definition: ReactivePromptDefinition): Prompt<any, any> {
    const baseConfig = {
      stream: this.stream, // Share our stream
      theme: this.theme,
      message: typeof definition.message === 'function' 
        ? definition.message() 
        : definition.message
    };
    
    switch (definition.type) {
      case 'text':
        return new TextPrompt({
          ...baseConfig,
          initialValue: definition.value || this.state.get(definition.id as keyof T)
        });
      // ... other types
    }
  }
  
  async prompt(): Promise<T> {
    this.isRunning = true;
    this.stream.start();
    this.stream.hideCursor();
    
    try {
      // Initial render
      await this.renderCurrent();
      
      return new Promise((resolve, reject) => {
        const handleKey = async (key: Key) => {
          try {
            // Handle cancel
            if (key.ctrl && key.name === 'c') {
              reject(new Error('Cancelled'));
              return;
            }
            
            // Handle submit
            if (key.name === 'enter' || key.name === 'return') {
              const current = this.getCurrentPrompt();
              if (!current) return;
              
              const value = current.getValue();
              if (value === undefined) return;
              
              // Validate
              const validation = await current.validate();
              if (validation !== true) {
                // Show error
                await this.renderError(validation as string);
                return;
              }
              
              // Update state
              this.state.set(
                current.definition.id as keyof T, 
                value
              );
              
              // Move to next
              this.currentIndex++;
              
              // Check if done
              if (this.currentIndex >= this.prompts.length) {
                resolve(this.state.getState());
              } else {
                await this.renderCurrent();
              }
              
              return;
            }
            
            // Let current prompt handle input
            const current = this.getCurrentPrompt();
            if (current) {
              await current.handleInput(key);
              await this.renderCurrent();
            }
          } catch (error) {
            reject(error);
          }
        };
        
        this.stream.on('key', handleKey);
      });
    } finally {
      this.stream.showCursor();
      this.stream.stop();
    }
  }
  
  private getCurrentPrompt(): PromptWrapper | null {
    // Find first visible prompt from current index
    for (let i = this.currentIndex; i < this.prompts.length; i++) {
      const prompt = this.prompts[i];
      const def = prompt.definition;
      
      if (!def.when || def.when()) {
        return prompt;
      }
    }
    
    return null;
  }
  
  private async renderCurrent(): Promise<void> {
    const lines: string[] = [];
    
    // Render completed prompts
    for (let i = 0; i < this.currentIndex; i++) {
      const prompt = this.prompts[i];
      const value = this.state.get(prompt.definition.id as keyof T);
      
      if (value !== undefined) {
        lines.push(this.formatCompleted(prompt.definition, value));
      }
    }
    
    // Render current prompt
    const current = this.getCurrentPrompt();
    if (current) {
      const output = await current.render();
      lines.push(output);
    }
    
    // Clear and render all
    this.renderer.clear();
    this.renderer.render(lines.join('\n'));
  }
  
  private formatCompleted(definition: ReactivePromptDefinition, value: any): string {
    const message = typeof definition.message === 'function'
      ? definition.message()
      : definition.message;
      
    return `${this.theme.symbols.success} ${message} · ${this.formatValue(definition.type, value)}`;
  }
  
  private formatValue(type: string, value: any): string {
    switch (type) {
      case 'password':
        return '•'.repeat(String(value).length);
      case 'confirm':
        return value ? 'Yes' : 'No';
      default:
        return String(value);
    }
  }
}
```

## 6. Breaking Changes

### 6.1 API Changes
- Prompts can now accept a `stream` option in config
- New methods: `renderOnly()`, `handleInputOnly()`, `getValue()`
- ReactivePrompt internal architecture completely changed

### 6.2 Behavior Changes
- Child prompts in reactive scenarios no longer manage their own lifecycle
- Stream handlers can be shared between components
- Improved error handling for resource conflicts

## 7. Migration Guide

### 7.1 For Basic Prompts
No changes required for simple use cases.

### 7.2 For ReactivePrompt Users
```typescript
// Before
const form = reactive({
  initialValues: { name: '' },
  prompts: (state) => [...]
});

// After - API remains the same
const form = reactive({
  initialValues: { name: '' },
  prompts: (state) => [...]
});
```

### 7.3 For Custom Components
```typescript
// If extending Prompt class
class CustomPrompt extends Prompt {
  constructor(config) {
    super(config);
    // Now supports config.stream
  }
  
  // Add these methods if using in reactive context
  async renderOnly() {
    return this.render();
  }
  
  async handleInputOnly(key) {
    return this.handleInput(key);
  }
}
```

## 8. Testing Strategy

### 8.1 Unit Tests
- Test stream sharing behavior
- Test lifecycle states
- Test render isolation

### 8.2 Integration Tests
- Test multi-prompt scenarios
- Test navigation between prompts
- Test validation flow

### 8.3 E2E Tests
- Test complete form flows
- Test error scenarios
- Test cancellation

## 9. Performance Considerations

### 9.1 Memory Usage
- Shared streams reduce memory footprint
- Lazy prompt initialization
- Proper cleanup of unused prompts

### 9.2 Render Performance
- Batch renders when possible
- Minimize full screen clears
- Use differential rendering

## 10. Future Enhancements

### 10.1 Advanced Features
- Prompt groups and sections
- Conditional prompt chains
- Parallel prompt execution

### 10.2 Developer Experience
- Better error messages
- Debug mode for prompt lifecycle
- Visual prompt builder

## 11. Success Criteria

The implementation will be considered successful when:
1. The reactive-form.ts example runs without exiting prematurely
2. All existing tests pass
3. New integration tests for multi-prompt scenarios pass
4. No resource conflicts between components
5. Performance remains acceptable (< 50ms prompt switching)

## 12. Timeline

- **Week 1**: Core infrastructure refactoring
- **Week 2**: ReactivePrompt redesign
- **Week 3**: Component updates
- **Week 4**: Testing and documentation

Total estimated time: 4 weeks

## 13. Risks and Mitigation

### 13.1 Risks
1. Breaking changes affect existing users
2. Performance regression from additional abstraction
3. Complexity increase in codebase

### 13.2 Mitigation
1. Maintain backward compatibility where possible
2. Extensive performance testing
3. Clear documentation and examples

---

This specification provides a complete roadmap for fixing the architectural issues in the @xec-sh/kit reactive prompt system. The proposed changes will enable proper multi-prompt scenarios while maintaining the simplicity of the API for basic use cases.

## Appendix A: Quick Fix vs. Proper Solution

### Quick Fix (Not Recommended)
A temporary workaround would be to modify ReactivePrompt to not create child Prompt instances at all, instead implementing all rendering and input handling directly. However, this would:
- Duplicate code from existing prompt components
- Make maintenance difficult
- Not solve the underlying architectural issue

### Proper Solution (Recommended)
Follow the implementation plan in this specification to:
- Enable proper resource sharing
- Maintain code reusability
- Create a sustainable architecture
- Support future multi-prompt scenarios

## Appendix B: Testing the Fix

To verify the fix is working:

1. Run the reactive form example:
   ```bash
   node --loader tsx examples/reactive/reactive-form.ts
   ```

2. Expected behavior:
   - The form should display the first prompt (Username)
   - User should be able to type and navigate between fields
   - Validation should work in real-time
   - The form should complete after all fields are filled

3. Current behavior (broken):
   - The form exits immediately after showing "Username"
   - No input is accepted
   - Process terminates

## Appendix C: Implementation Priority

Given the scope of changes, here's the recommended implementation priority:

1. **Critical** (Week 1):
   - StreamHandler sharing mechanism
   - Base Prompt lifecycle methods
   - ReactivePrompt core redesign

2. **Important** (Week 2):
   - Primitive component updates
   - Basic testing

3. **Nice to Have** (Week 3-4):
   - Advanced component updates
   - Performance optimizations
   - Migration tooling