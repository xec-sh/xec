# Path Component Examples

This directory contains comprehensive examples demonstrating the `path` component capabilities for file and directory selection.

## Examples

### 1. Basic Path Selection (`basic/path.ts`)

Simple example showing:

- Basic file selection
- Directory selection
- File validation (JSON files only)

Run: `npx tsx examples/basic/path.ts`

### 2. Comprehensive Path Features (`path-comprehensive.ts`)

Complete demonstration of all path component features:

- Basic file/directory selection
- Custom root directory
- Directory-only mode
- Initial value setting
- File type validation (TypeScript/JavaScript files)
- File size validation (< 1MB)
- Parent directory navigation
- Configuration file selection

Run: `npx tsx examples/path-comprehensive.ts`

### 3. Advanced Path Patterns (`path-advanced.ts`)

Advanced usage patterns and real-world scenarios:

- **Source & Destination Selection**: Copy/move operations with permission checks
- **Project Setup Wizard**: Multi-step path selection for project structure
- **Backup File Selection**: Filter files by modification date and size
- **Permission-aware Selection**: Check read/write/execute permissions
- **Relative Path Resolution**: Work with relative paths and path resolution

Run: `npx tsx examples/path-advanced.ts`

## Features Demonstrated

### Core Features

- ✅ File selection with autocomplete
- ✅ Directory-only selection mode
- ✅ Custom root directory
- ✅ Initial value setting
- ✅ Real-time path filtering
- ✅ Navigation with arrow keys

### Validation Options

- ✅ File existence checking
- ✅ File type validation (by extension)
- ✅ File size validation
- ✅ Permission checking (read/write/execute)
- ✅ Directory vs file validation
- ✅ Custom validation functions

### Advanced Features

- ✅ Symbolic link detection
- ✅ Hidden file handling
- ✅ Relative path resolution
- ✅ Parent directory navigation
- ✅ Multi-step workflows
- ✅ Overwrite confirmation

## Usage

The path component provides an autocomplete-based file/directory selector:

```typescript
import { path } from '@xec-sh/kit';

const selectedFile = await path({
  message: 'Select a file',
  initialValue: process.cwd(),
  directory: false, // Set to true for directory-only mode
  root: '/custom/root', // Optional custom root directory
  validate: (value) => {
    // Custom validation logic
    if (!value?.endsWith('.json')) {
      return 'Please select a JSON file';
    }
    return undefined;
  },
});
```

## Key Bindings

- **Type**: Filter paths in real-time
- **↑/↓**: Navigate through filtered options
- **Tab**: Autocomplete the current selection
- **Enter**: Confirm selection
- **Ctrl+C**: Cancel operation

## Tips

1. **Performance**: The path component efficiently handles large directories by limiting displayed options
2. **Validation**: Use validation to ensure users select appropriate files for your use case
3. **Permissions**: Always check permissions when dealing with file operations
4. **Relative Paths**: Be careful with relative paths - use `resolve()` for absolute paths
5. **Error Handling**: Always check for cancellation with `isCancel()`
