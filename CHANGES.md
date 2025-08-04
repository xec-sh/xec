# Changes for Next Release

## 🚀 Core Engine Architecture Optimization

### What Changed:
Major architectural refactoring of the execution engine to improve performance, maintainability, and code organization. The core functionality has been split into focused modules with better separation of concerns.

### Key Improvements:

#### 1. **Process Context Extraction** 
- ✅ Created dedicated `ProcessContext` module (420 lines) handling process promise logic
- ✅ Extracted process promise building functionality from execution engine
- ✅ Improved type safety with specialized `ProcessPromiseBuilder` class
- ✅ Better encapsulation of process-related operations and state management

#### 2. **Execution Engine Streamlining**
- ⚡ Reduced execution engine complexity by 630 lines (~70% reduction)
- ⚡ Improved startup performance through better code organization  
- ⚡ Enhanced maintainability with cleaner separation of concerns
- ⚡ Optimized memory usage with more focused modules

#### 3. **SSH Adapter Improvements**
- 🔧 Simplified SSH tunnel creation using native NodeSSH `createTunnel` method
- 🔧 Removed complex manual tunnel implementation (~100 lines of code)
- 🔧 Improved tunnel reliability and performance
- 🔧 Better error handling for SSH connection management

#### 4. **Enhanced Testing Coverage**
- 🧪 Expanded SSH adapter tunnel tests (855 lines, ~300% increase)
- 🧪 Updated execution engine tests to reflect new architecture
- 🧪 Enhanced integration test coverage for API functionality
- 🧪 Better test isolation and reliability

### Fixed Issues:
- 🐛 Improved error handling in SSH tunnel creation
- 🐛 Fixed potential memory leaks in process promise handling
- 🐛 Resolved complex initialization issues in execution engine
- 🐛 Enhanced stability of SSH connection pooling

### Dependencies:
- 📦 Updated `zod` to version `4.0.14` for better validation performance
- 📦 Removed unused `make-dir` dependency reducing bundle size
