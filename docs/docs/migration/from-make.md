---
title: Migrating from Make
description: Comprehensive guide for migrating from Makefile to Xec
keywords: [migration, make, makefile, build, automation]
source_files:
  - apps/xec/src/config/task-manager.ts
  - apps/xec/src/commands/run.ts
  - packages/core/src/core/execution-engine.ts
verification_date: 2025-08-03
---

# Migrating from Make to Xec

## Overview

This guide helps you migrate from GNU Make and Makefiles to Xec's modern task automation system. While Make has been the standard for decades, Xec provides better cross-platform support, TypeScript integration, parallel execution control, and modern developer experience.

## Why Migrate from Make?

### Make Limitations

```makefile
# Traditional Makefile
CC = gcc
CFLAGS = -Wall -O2

.PHONY: all clean test deploy

all: build

build: src/*.c
	$(CC) $(CFLAGS) -o app src/*.c

test: build
	./test/run-tests.sh

deploy: test
	rsync -avz app user@server:/opt/
	ssh user@server 'systemctl restart app'

clean:
	rm -f app *.o
```

**Problems:**
- Platform-specific (Unix-centric)
- Arcane syntax with tabs vs spaces
- Limited debugging capabilities
- No built-in TypeScript/JavaScript support
- Complex dependency management
- Poor Windows support

### Xec Advantages

```yaml
# .xec/config.yaml
tasks:
  build:
    description: Build application
    command: gcc -Wall -O2 -o app src/*.c
    outputs: [app]
    
  test:
    needs: [build]
    command: ./test/run-tests.sh
    
  deploy:
    needs: [test]
    targets: production
    steps:
      - name: Copy binary
        command: xec copy app /opt/app
      - name: Restart service
        command: systemctl restart app
```

**Benefits:**
- Cross-platform by design
- Modern YAML/TypeScript syntax
- Built-in parallel execution
- SSH/Docker/K8s integration
- Better error handling and logging
- TypeScript for complex logic

## Core Concepts Mapping

### Make → Xec Terminology

| Make Concept | Xec Equivalent | Description |
|--------------|----------------|-------------|
| Target | Task | Unit of work to execute |
| Prerequisites | needs/depends | Task dependencies |
| Recipe | command/steps | Commands to execute |
| Variables | params/env | Configuration values |
| Pattern Rules | patterns/glob | File matching patterns |
| .PHONY | (default) | All tasks are phony by default |
| VPATH | cwd | Working directory control |
| Functions | TypeScript | Full programming language |

## Common Patterns Migration

### 1. Basic Targets

**Makefile:**
```makefile
.PHONY: hello clean

hello:
	echo "Hello, World!"

clean:
	rm -rf build/
	rm -f *.o *.tmp
```

**Xec Tasks:**
```yaml
tasks:
  hello:
    command: echo "Hello, World!"
    
  clean:
    steps:
      - command: rm -rf build/
      - command: rm -f *.o *.tmp
```

**Xec Script (Better):**
```typescript
// scripts/clean.ts
import { rm } from 'fs/promises';
import { glob } from '@xec-sh/core';

// Cross-platform clean
await rm('build', { recursive: true, force: true });

const tempFiles = await glob('**/*.{o,tmp}');
for (const file of tempFiles) {
  await rm(file);
}

console.log(`✅ Cleaned ${tempFiles.length} temporary files`);
```

### 2. Dependencies

**Makefile:**
```makefile
all: build test package

build: compile link

compile:
	gcc -c src/*.c

link: compile
	gcc *.o -o app

test: build
	./run-tests

package: test
	tar -czf app.tar.gz app
```

**Xec Configuration:**
```yaml
tasks:
  all:
    needs: [build, test, package]
    
  build:
    needs: [compile, link]
    
  compile:
    command: gcc -c src/*.c
    
  link:
    needs: [compile]
    command: gcc *.o -o app
    
  test:
    needs: [build]
    command: ./run-tests
    
  package:
    needs: [test]
    command: tar -czf app.tar.gz app
```

### 3. Variables and Substitution

**Makefile:**
```makefile
CC = gcc
CFLAGS = -Wall -O2
SRC_DIR = src
BUILD_DIR = build
SOURCES = $(wildcard $(SRC_DIR)/*.c)
OBJECTS = $(SOURCES:$(SRC_DIR)/%.c=$(BUILD_DIR)/%.o)

$(BUILD_DIR)/%.o: $(SRC_DIR)/%.c
	$(CC) $(CFLAGS) -c $< -o $@

app: $(OBJECTS)
	$(CC) $(OBJECTS) -o $@
```

**Xec with TypeScript:**
```typescript
// scripts/build.ts
import { $, glob } from '@xec-sh/core';
import path from 'path';

const CC = process.env.CC || 'gcc';
const CFLAGS = process.env.CFLAGS || '-Wall -O2';
const SRC_DIR = 'src';
const BUILD_DIR = 'build';

// Get all C source files
const sources = await glob(`${SRC_DIR}/*.c`);

// Compile each source file
for (const source of sources) {
  const object = source
    .replace(SRC_DIR, BUILD_DIR)
    .replace('.c', '.o');
  
  console.log(`Compiling ${source}...`);
  await $`${CC} ${CFLAGS} -c ${source} -o ${object}`;
}

// Link all object files
const objects = await glob(`${BUILD_DIR}/*.o`);
await $`${CC} ${objects.join(' ')} -o app`;

console.log('✅ Build complete!');
```

### 4. Pattern Rules

**Makefile:**
```makefile
%.pdf: %.md
	pandoc $< -o $@

%.min.js: %.js
	uglify $< -o $@

%.gz: %
	gzip -c $< > $@
```

**Xec Script:**
```typescript
// scripts/process-files.ts
import { $, glob } from '@xec-sh/core';

// Process markdown to PDF
const markdownFiles = await glob('**/*.md');
await Promise.all(
  markdownFiles.map(file => 
    $`pandoc ${file} -o ${file.replace('.md', '.pdf')}`
  )
);

// Minify JavaScript
const jsFiles = await glob('src/**/*.js');
await Promise.all(
  jsFiles.map(file =>
    $`uglify ${file} -o ${file.replace('.js', '.min.js')}`
  )
);

// Compress files
const filesToCompress = await glob('dist/*', { nodir: true });
await Promise.all(
  filesToCompress.map(file =>
    $`gzip -c ${file} > ${file}.gz`
  )
);
```

### 5. Conditional Execution

**Makefile:**
```makefile
ifdef DEBUG
CFLAGS += -g -O0
else
CFLAGS += -O2
endif

ifeq ($(OS),Windows_NT)
RM = del /Q
else
RM = rm -f
endif

debug:
	$(MAKE) DEBUG=1
```

**Xec Configuration:**
```yaml
tasks:
  build:
    params:
      - name: debug
        type: boolean
        default: false
    env:
      CFLAGS: ${params.debug ? '-g -O0' : '-O2'}
    command: gcc ${env.CFLAGS} -o app src/*.c
```

**Xec Script:**
```typescript
// scripts/build.ts
import { $ } from '@xec-sh/core';
import { platform } from 'os';

const isDebug = process.argv.includes('--debug');
const isWindows = platform() === 'win32';

// Platform-specific commands
const RM = isWindows ? 'del /Q' : 'rm -f';
const CFLAGS = isDebug ? '-g -O0' : '-O2';

// Clean
await $`${RM} *.o`;

// Build
await $`gcc ${CFLAGS} -o app src/*.c`;

if (isDebug) {
  console.log('🐛 Built with debug symbols');
}
```

### 6. Parallel Execution

**Makefile (Limited):**
```makefile
.PHONY: test
test: test-unit test-integration test-e2e

test-unit:
	npm run test:unit

test-integration:
	npm run test:integration

test-e2e:
	npm run test:e2e

# Run with: make -j3 test
```

**Xec (Native Parallel):**
```yaml
tasks:
  test:
    parallel: true
    steps:
      - name: Unit Tests
        command: npm run test:unit
      - name: Integration Tests
        command: npm run test:integration
      - name: E2E Tests
        command: npm run test:e2e
```

**Xec Script:**
```typescript
// scripts/test.ts
import { $ } from '@xec-sh/core';

// Run all test suites in parallel
const results = await Promise.allSettled([
  $`npm run test:unit`,
  $`npm run test:integration`,
  $`npm run test:e2e`
]);

// Check results
const failed = results.filter(r => r.status === 'rejected');
if (failed.length > 0) {
  console.error(`❌ ${failed.length} test suites failed`);
  process.exit(1);
}

console.log('✅ All tests passed!');
```

## Complex Makefile Migration

### Real-World C++ Project

**Original Makefile:**
```makefile
CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra
LDFLAGS = -lpthread -lssl -lcrypto
SRC_DIR = src
TEST_DIR = test
BUILD_DIR = build
TARGET = myapp

SOURCES = $(wildcard $(SRC_DIR)/*.cpp)
OBJECTS = $(SOURCES:$(SRC_DIR)/%.cpp=$(BUILD_DIR)/%.o)
TEST_SOURCES = $(wildcard $(TEST_DIR)/*.cpp)
TEST_OBJECTS = $(TEST_SOURCES:$(TEST_DIR)/%.cpp=$(BUILD_DIR)/test_%.o)

.PHONY: all clean test install docker

all: $(TARGET)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(BUILD_DIR)/%.o: $(SRC_DIR)/%.cpp | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR)/test_%.o: $(TEST_DIR)/%.cpp | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(TARGET): $(OBJECTS)
	$(CXX) $(OBJECTS) $(LDFLAGS) -o $@

test: $(TARGET) $(TEST_OBJECTS)
	$(CXX) $(TEST_OBJECTS) $(LDFLAGS) -o $(BUILD_DIR)/test_runner
	./$(BUILD_DIR)/test_runner

install: $(TARGET)
	install -m 755 $(TARGET) /usr/local/bin/

docker:
	docker build -t myapp:latest .
	docker push myregistry/myapp:latest

clean:
	rm -rf $(BUILD_DIR) $(TARGET)

watch:
	while true; do \
		make -q || make; \
		inotifywait -qre close_write $(SRC_DIR); \
	done
```

**Migrated to Xec:**

```yaml
# .xec/config.yaml
defaults:
  env:
    CXX: g++
    CXXFLAGS: -std=c++17 -Wall -Wextra
    LDFLAGS: -lpthread -lssl -lcrypto

tasks:
  all:
    needs: [build]
    
  build:
    description: Build the C++ application
    script: scripts/build.ts
    
  test:
    description: Run test suite
    needs: [build]
    script: scripts/test.ts
    
  install:
    description: Install to system
    needs: [build]
    command: install -m 755 myapp /usr/local/bin/
    
  docker:
    description: Build and push Docker image
    steps:
      - name: Build image
        command: docker build -t myapp:latest .
      - name: Push image
        command: docker push myregistry/myapp:latest
        
  clean:
    description: Clean build artifacts
    script: scripts/clean.ts
    
  watch:
    description: Watch and rebuild on changes
    command: xec watch --pattern "src/**/*.cpp" --exec "xec build"
```

```typescript
// scripts/build.ts
import { $, glob, fs } from '@xec-sh/core';
import path from 'path';

const CXX = process.env.CXX || 'g++';
const CXXFLAGS = process.env.CXXFLAGS || '-std=c++17 -Wall -Wextra';
const LDFLAGS = process.env.LDFLAGS || '-lpthread -lssl -lcrypto';

const SRC_DIR = 'src';
const BUILD_DIR = 'build';
const TARGET = 'myapp';

// Create build directory
await fs.mkdir(BUILD_DIR, { recursive: true });

// Compile source files
console.log('🔨 Compiling source files...');
const sources = await glob(`${SRC_DIR}/*.cpp`);

const compilePromises = sources.map(async (source) => {
  const object = path.join(
    BUILD_DIR,
    path.basename(source, '.cpp') + '.o'
  );
  
  console.log(`  Compiling ${source}...`);
  await $`${CXX} ${CXXFLAGS} -c ${source} -o ${object}`;
  return object;
});

const objects = await Promise.all(compilePromises);

// Link executable
console.log('🔗 Linking executable...');
await $`${CXX} ${objects.join(' ')} ${LDFLAGS} -o ${TARGET}`;

console.log(`✅ Built ${TARGET} successfully!`);
```

```typescript
// scripts/test.ts
import { $, glob } from '@xec-sh/core';
import path from 'path';

const CXX = process.env.CXX || 'g++';
const CXXFLAGS = process.env.CXXFLAGS || '-std=c++17 -Wall -Wextra';
const LDFLAGS = process.env.LDFLAGS || '-lpthread -lssl -lcrypto';

const TEST_DIR = 'test';
const BUILD_DIR = 'build';

// Build main app first
await $`xec build`;

// Compile test files
console.log('🧪 Compiling tests...');
const testSources = await glob(`${TEST_DIR}/*.cpp`);

const testObjects = await Promise.all(
  testSources.map(async (source) => {
    const object = path.join(
      BUILD_DIR,
      'test_' + path.basename(source, '.cpp') + '.o'
    );
    
    await $`${CXX} ${CXXFLAGS} -c ${source} -o ${object}`;
    return object;
  })
);

// Link test runner
console.log('🔗 Linking test runner...');
await $`${CXX} ${testObjects.join(' ')} ${LDFLAGS} -o ${BUILD_DIR}/test_runner`;

// Run tests
console.log('🏃 Running tests...');
const result = await $`./${BUILD_DIR}/test_runner`.nothrow();

if (result.exitCode === 0) {
  console.log('✅ All tests passed!');
} else {
  console.error('❌ Tests failed!');
  process.exit(1);
}
```

## Advanced Make Features

### 1. Include Files

**Makefile:**
```makefile
include config.mk
-include local.mk

ifdef CUSTOM_CONFIG
include $(CUSTOM_CONFIG)
endif
```

**Xec:**
```yaml
# .xec/config.yaml
import:
  - ./config/base.yaml
  - ./config/local.yaml
  - ${env.CUSTOM_CONFIG}
```

### 2. Functions and Macros

**Makefile:**
```makefile
define compile_rule
$(1): $(2)
	$(CXX) $(CXXFLAGS) -c $(2) -o $(1)
endef

$(foreach obj,$(OBJECTS),$(eval $(call compile_rule,$(obj),$(obj:.o=.cpp))))
```

**Xec TypeScript:**
```typescript
// scripts/compile.ts
function createCompileTask(source: string, output: string) {
  return $`${CXX} ${CXXFLAGS} -c ${source} -o ${output}`;
}

const compileTasks = sources.map(source => {
  const output = source.replace('.cpp', '.o');
  return createCompileTask(source, output);
});

await Promise.all(compileTasks);
```

### 3. Auto-Dependencies

**Makefile:**
```makefile
DEPS = $(OBJECTS:.o=.d)

%.d: %.cpp
	$(CXX) -MM $(CXXFLAGS) $< > $@

-include $(DEPS)
```

**Xec with File Watching:**
```typescript
// scripts/build-incremental.ts
import { $, watch } from '@xec-sh/core';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';

const cache = new Map<string, string>();

async function getFileHash(file: string): Promise<string> {
  const content = await readFile(file);
  return createHash('md5').update(content).digest('hex');
}

async function needsRebuild(source: string): Promise<boolean> {
  const hash = await getFileHash(source);
  const cached = cache.get(source);
  
  if (cached !== hash) {
    cache.set(source, hash);
    return true;
  }
  
  return false;
}

// Only compile changed files
for (const source of sources) {
  if (await needsRebuild(source)) {
    console.log(`Recompiling ${source}...`);
    await $`${CXX} ${CXXFLAGS} -c ${source} -o ${output}`;
  }
}
```

## Migration Strategy

### Phase 1: Analysis
1. **Inventory Targets**: List all Make targets and their purposes
2. **Map Dependencies**: Document target dependencies
3. **Identify Variables**: List all variables and their uses
4. **Find Patterns**: Identify pattern rules and functions

### Phase 2: Setup
```bash
# Install Xec
npm install -g @xec-sh/cli

# Initialize configuration
xec new config

# Create scripts directory
mkdir -p scripts
```

### Phase 3: Incremental Migration

**Keep Makefile, add Xec wrapper:**
```makefile
# Existing Makefile targets
legacy-build:
	$(CC) $(CFLAGS) -o app src/*.c

# New Xec integration
xec-build:
	xec build

# Transition period - both work
build: xec-build
```

### Phase 4: Complete Migration
1. Convert all targets to Xec tasks
2. Replace pattern rules with TypeScript scripts
3. Update CI/CD pipelines
4. Remove Makefile

## Compatibility During Migration

### Wrapper Script
```bash
#!/bin/bash
# make-compat.sh - Make compatibility wrapper

case "$1" in
  build)
    xec build
    ;;
  test)
    xec test
    ;;
  clean)
    xec clean
    ;;
  *)
    xec "$@"
    ;;
esac
```

### Dual Support
```json
// package.json
{
  "scripts": {
    "make": "./make-compat.sh"
  }
}
```

## Benefits After Migration

### 1. Cross-Platform Support
```typescript
// Works on Windows, macOS, Linux
import { platform } from 'os';

const isWindows = platform() === 'win32';
const exe = isWindows ? '.exe' : '';

await $`gcc -o myapp${exe} src/*.c`;
```

### 2. Better Error Handling
```typescript
const result = await $`gcc -o app src/*.c`.nothrow();

if (!result.ok) {
  console.error('Compilation failed:', result.stderr);
  // Send notification, create issue, etc.
  await notifyBuildFailure(result.stderr);
}
```

### 3. Modern Development Experience
- TypeScript with autocomplete
- Proper IDE support
- Integrated debugging
- NPM package ecosystem

### 4. Enhanced Parallelism
```typescript
// Compile all files in parallel with concurrency limit
import pLimit from 'p-limit';

const limit = pLimit(4); // Max 4 concurrent compilations

await Promise.all(
  sources.map(source => 
    limit(() => compileFile(source))
  )
);
```

## Common Migration Pitfalls

### 1. Tab vs Space
- Make requires tabs for recipes
- Xec uses standard YAML/TypeScript

### 2. Shell Differences
- Make uses sh by default
- Xec provides consistent cross-platform shell

### 3. Variable Expansion
- Make: `$(VAR)` or `${VAR}`
- Xec: `${params.var}` or TypeScript variables

### 4. Implicit Rules
- Make has built-in rules for common patterns
- Xec requires explicit definitions (more clarity)

## Summary

Migrating from Make to Xec provides:
- ✅ True cross-platform support
- ✅ Modern TypeScript programming
- ✅ Better error handling and debugging
- ✅ Integrated remote execution (SSH/Docker/K8s)
- ✅ Parallel execution control
- ✅ Rich ecosystem integration

Start with simple targets and gradually migrate complex build logic to experience the full benefits of Xec's modern approach to task automation!