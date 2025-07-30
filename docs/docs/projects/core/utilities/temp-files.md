---
sidebar_position: 1
---

# Temporary Files

Safe creation and management of temporary files and directories with automatic cleanup.

## Overview

The temporary file utilities in @xec-sh/core provide:
- Safe creation of temporary files and directories
- Automatic cleanup on process exit
- Scoped temporary resources with guaranteed cleanup
- Cross-platform compatibility
- Event emission for tracking temp file lifecycle
- Protection against directory traversal attacks

## Basic Usage

### Working with Temporary Files

```typescript
import { withTempFile, TempFile } from '@xec-sh/core';

// Automatic cleanup with withTempFile
await withTempFile(async (file) => {
  // File is created and available
  console.log('Temp file path:', file.path);
  
  // Write content
  await file.write('Hello, World!');
  
  // Read content
  const content = await file.read();
  console.log('Content:', content); // "Hello, World!"
  
  // Append more content
  await file.append('\nMore data');
  
  // Use with shell commands
  await $`cat ${file.path}`;
}); // File is automatically cleaned up here

// With initial content
await withTempFile(async (file) => {
  // File already contains this content
  const data = await file.read();
  console.log(data); // "Initial content"
}, { 
  prefix: 'data-',
  suffix: '.json'
});
```

### Working with Temporary Directories

```typescript
import { withTempDir, TempDir } from '@xec-sh/core';

// Automatic cleanup with withTempDir
await withTempDir(async (dir) => {
  console.log('Temp dir path:', dir.path);
  
  // Create files in the directory
  await dir.writeFile('config.json', '{"key": "value"}');
  
  // Read files
  const config = await dir.readFile('config.json');
  console.log('Config:', config);
  
  // List files
  const files = await dir.list();
  console.log('Files:', files); // ['config.json']
  
  // Use with shell commands
  await $`ls -la ${dir.path}`;
  
  // Create subdirectories
  await $`mkdir -p ${dir.path}/subdir`;
}); // Directory and all contents are automatically cleaned up
```

## API Reference

### withTempFile

```typescript
function withTempFile<T>(
  fn: (file: TempFile) => T | Promise<T>,
  options?: TempOptions
): Promise<T>
```

Creates a temporary file, executes the provided function, and ensures cleanup.

**Parameters:**
- `fn` - Function that receives the TempFile instance
- `options` - Optional configuration

**Options:**
- `prefix` - Filename prefix (default: 'ush-')
- `suffix` - Filename suffix (default: '.tmp')
- `dir` - Directory for temp file (default: system temp)
- `keep` - Skip cleanup if true (default: false)
- `emitter` - Event emitter for lifecycle events

### withTempDir

```typescript
function withTempDir<T>(
  fn: (dir: TempDir) => T | Promise<T>,
  options?: TempOptions
): Promise<T>
```

Creates a temporary directory, executes the provided function, and ensures cleanup.

**Parameters:**
- `fn` - Function that receives the TempDir instance
- `options` - Optional configuration (same as withTempFile)

### TempFile Class

```typescript
class TempFile {
  readonly path: string;
  
  create(content?: string): Promise<void>;
  write(content: string): Promise<void>;
  append(content: string): Promise<void>;
  read(): Promise<string>;
  exists(): Promise<boolean>;
  cleanup(): Promise<void>;
}
```

**Methods:**
- `create(content?)` - Create the file with optional initial content
- `write(content)` - Write content to file (overwrites existing)
- `append(content)` - Append content to file
- `read()` - Read file content as string
- `exists()` - Check if file exists
- `cleanup()` - Remove the file (called automatically)

### TempDir Class

```typescript
class TempDir {
  readonly path: string;
  
  create(): Promise<void>;
  writeFile(name: string, content: string): Promise<void>;
  readFile(name: string): Promise<string>;
  exists(name?: string): Promise<boolean>;
  list(): Promise<string[]>;
  cleanup(): Promise<void>;
}
```

**Methods:**
- `create()` - Create the directory
- `writeFile(name, content)` - Write a file in the directory
- `readFile(name)` - Read a file from the directory
- `exists(name?)` - Check if directory or file exists
- `list()` - List files in the directory
- `cleanup()` - Remove directory and contents (called automatically)

## Advanced Usage

### Custom Temp Directory

```typescript
await withTempFile(async (file) => {
  // File created in /custom/temp/
  console.log(file.path);
}, {
  dir: '/custom/temp',
  prefix: 'app-',
  suffix: '.log'
});
```

### Keeping Files for Debugging

```typescript
await withTempFile(async (file) => {
  await file.write('debug data');
  console.log('Debug file:', file.path);
  // File won't be deleted
}, { keep: true });
```

### Manual Lifecycle Management

```typescript
import { TempFile, TempDir } from '@xec-sh/core';

// Manual file management
const file = new TempFile({ prefix: 'manual-' });
await file.create('Initial content');
try {
  // Use the file
  await $`cat ${file.path}`;
} finally {
  // Manual cleanup required
  await file.cleanup();
}

// Manual directory management
const dir = new TempDir();
await dir.create();
try {
  // Use the directory
  await dir.writeFile('data.txt', 'content');
} finally {
  await dir.cleanup();
}
```

### Event Tracking

```typescript
import { EventEmitter } from 'events';

const emitter = new EventEmitter();

emitter.on('temp:create', (event) => {
  console.log('Created:', event.path, event.type);
});

emitter.on('temp:cleanup', (event) => {
  console.log('Cleaned up:', event.path, event.type);
});

await withTempFile(async (file) => {
  // Events will be emitted
}, { emitter });
```

## Use Cases

### Processing Large Files

```typescript
await withTempFile(async (file) => {
  // Download to temp file
  await $`curl -o ${file.path} https://example.com/large-file.zip`;
  
  // Process the file
  const result = await $`unzip -l ${file.path} | grep -c ".txt"`;
  console.log(`Found ${result.stdout.trim()} text files`);
  
  // Extract specific files
  await withTempDir(async (extractDir) => {
    await $`unzip ${file.path} -d ${extractDir.path} "*.txt"`;
    const textFiles = await extractDir.list();
    
    for (const txtFile of textFiles) {
      const content = await extractDir.readFile(txtFile);
      // Process each text file
    }
  });
}); // Both temp file and extract dir are cleaned up
```

### Building and Testing

```typescript
await withTempDir(async (buildDir) => {
  // Copy source files
  await $`cp -r ./src ${buildDir.path}/`;
  
  // Build in temp directory
  await $.cd(buildDir.path)`npm install && npm run build`;
  
  // Run tests
  const testResult = await $.cd(buildDir.path)`npm test`.nothrow();
  
  if (testResult.ok) {
    // Copy artifacts
    await $`cp -r ${buildDir.path}/dist ./`;
  }
}); // Build directory cleaned up
```

### Atomic File Operations

```typescript
async function atomicWriteFile(targetPath: string, content: string) {
  await withTempFile(async (temp) => {
    // Write to temp file first
    await temp.write(content);
    
    // Validate content
    const written = await temp.read();
    if (written !== content) {
      throw new Error('Write verification failed');
    }
    
    // Atomic move to target
    await $`mv ${temp.path} ${targetPath}`;
  }, {
    dir: path.dirname(targetPath),
    suffix: '.tmp'
  });
}
```

## Best Practices

### 1. Always Use Scoped Functions

```typescript
// ✅ Good - Automatic cleanup
await withTempFile(async (file) => {
  // Use file
});

// ❌ Avoid - Manual cleanup required
const file = new TempFile();
await file.create();
// Easy to forget cleanup
```

### 2. Handle Errors Properly

```typescript
await withTempFile(async (file) => {
  try {
    await riskyOperation(file.path);
  } catch (error) {
    // Log but don't prevent cleanup
    console.error('Operation failed:', error);
    throw error;
  }
}); // Cleanup happens even if error thrown
```

### 3. Use Appropriate Suffixes

```typescript
// Help other tools understand file type
await withTempFile(async (file) => {
  await file.write(JSON.stringify(data));
  await $`jq . ${file.path}`; // jq recognizes JSON
}, { suffix: '.json' });
```

### 4. Consider Security

```typescript
// TempDir protects against directory traversal
await withTempDir(async (dir) => {
  const userInput = '../../../etc/passwd';
  
  // This will throw an error - path escapes temp dir
  await dir.writeFile(userInput, 'malicious');
  
  // Safe - normalized within temp directory
  await dir.writeFile('safe-file.txt', 'content');
});
```

## Platform Considerations

- **Windows**: Uses `%TEMP%` or `%TMP%`
- **macOS**: Uses `/var/folders/...` (user-specific)
- **Linux**: Uses `/tmp` or `$TMPDIR`

The utilities handle platform differences automatically:

```typescript
await withTempFile(async (file) => {
  console.log('Temp location:', path.dirname(file.path));
  // Windows: C:\Users\...\AppData\Local\Temp
  // macOS: /var/folders/.../T
  // Linux: /tmp
});
```

## Performance Tips

1. **Reuse Temp Directories**: For multiple files, use one temp directory
   ```typescript
   await withTempDir(async (dir) => {
     // Create multiple files in same directory
     for (let i = 0; i < 100; i++) {
       await dir.writeFile(`file-${i}.txt`, `content-${i}`);
     }
   });
   ```

2. **Stream Large Files**: Don't load entire content into memory
   ```typescript
   await withTempFile(async (file) => {
     // Stream download directly to file
     await $`curl -o ${file.path} https://example.com/large.zip`;
     
     // Process without loading into memory
     await $`unzip -p ${file.path} | grep pattern`;
   });
   ```

3. **Parallel Operations**: Safe to use multiple temp files concurrently
   ```typescript
   const tasks = urls.map(url => 
     withTempFile(async (file) => {
       await $`curl -o ${file.path} ${url}`;
       return $`wc -l < ${file.path}`.then(r => r.stdout.trim());
     })
   );
   const lineCounts = await Promise.all(tasks);
   ```