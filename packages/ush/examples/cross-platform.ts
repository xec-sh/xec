#!/usr/bin/env node
/**
 * Cross-Platform Development with @xec/ush
 * 
 * This file demonstrates how to write portable scripts that work
 * across different operating systems (Windows, macOS, Linux).
 */

import * as os from 'os';
import { $ } from '@xec/ush';
import * as path from 'path';

// ===== Platform Detection =====
console.log('=== Platform Detection ===\n');

// Get platform information
const platform = {
  type: process.platform,           // 'darwin', 'linux', 'win32'
  arch: process.arch,              // 'x64', 'arm64', etc.
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux',
  homeDir: os.homedir(),
  tempDir: os.tmpdir(),
  hostname: os.hostname()
};

console.log('Platform Information:');
console.log(`- OS: ${platform.type}`);
console.log(`- Architecture: ${platform.arch}`);
console.log(`- Home Directory: ${platform.homeDir}`);
console.log(`- Temp Directory: ${platform.tempDir}`);
console.log(`- Hostname: ${platform.hostname}`);

// ===== Cross-Platform Command Abstraction =====
console.log('\n\n=== Cross-Platform Commands ===\n');

// Platform-specific command mappings
class CrossPlatformCommands {
  private static commands = {
    // File operations
    copy: {
      win32: 'copy',
      darwin: 'cp',
      linux: 'cp'
    },
    move: {
      win32: 'move',
      darwin: 'mv',
      linux: 'mv'
    },
    remove: {
      win32: 'del',
      darwin: 'rm',
      linux: 'rm'
    },
    makeDir: {
      win32: 'mkdir',
      darwin: 'mkdir -p',
      linux: 'mkdir -p'
    },
    
    // System operations
    clearScreen: {
      win32: 'cls',
      darwin: 'clear',
      linux: 'clear'
    },
    listProcesses: {
      win32: 'tasklist',
      darwin: 'ps aux',
      linux: 'ps aux'
    },
    killProcess: {
      win32: 'taskkill /F /PID',
      darwin: 'kill',
      linux: 'kill'
    },
    
    // File viewing
    viewFile: {
      win32: 'type',
      darwin: 'cat',
      linux: 'cat'
    },
    pageFile: {
      win32: 'more',
      darwin: 'less',
      linux: 'less'
    },
    
    // Opening files/URLs
    open: {
      win32: 'start',
      darwin: 'open',
      linux: 'xdg-open'
    },
    
    // Network
    ping: {
      win32: 'ping -n',
      darwin: 'ping -c',
      linux: 'ping -c'
    }
  };
  
  static get(command: keyof typeof CrossPlatformCommands.commands): string {
    const platformCommand = this.commands[command];
    return platformCommand[platform.type] || platformCommand.linux;
  }
  
  static async execute(command: keyof typeof CrossPlatformCommands.commands, ...args: string[]) {
    const cmd = this.get(command);
    return $`${cmd} ${args}`;
  }
}

// Example: Cross-platform file operations
console.log('Cross-platform file operations:');

const testFile = path.join(platform.tempDir, 'ush-test.txt');
const testFile2 = path.join(platform.tempDir, 'ush-test-copy.txt');

// Create a test file
await $`echo "Cross-platform test" > ${testFile}`;
console.log(`✓ Created test file: ${testFile}`);

// Copy file (platform-specific command)
if (platform.isWindows) {
  await $.raw`copy "${testFile}" "${testFile2}"`;
} else {
  await $`cp ${testFile} ${testFile2}`;
}
console.log('✓ Copied file using platform-specific command');

// View file content
const viewCmd = CrossPlatformCommands.get('viewFile');
const content = await $`${viewCmd} ${testFile}`;
console.log(`✓ File content: ${content.stdout.trim()}`);

// Clean up
await $`${CrossPlatformCommands.get('remove')} ${testFile} ${testFile2}`.nothrow();

// ===== Path Handling =====
console.log('\n\n=== Cross-Platform Path Handling ===\n');

// Use Node's path module for cross-platform paths
class PathHelper {
  // Convert to platform-specific path
  static toPlatform(filepath: string): string {
    return filepath.split('/').join(path.sep);
  }
  
  // Convert to POSIX path (for use in shells)
  static toPosix(filepath: string): string {
    return filepath.split(path.sep).join('/');
  }
  
  // Get user's config directory
  static getConfigDir(appName: string): string {
    if (platform.isWindows) {
      return path.join(process.env.APPDATA || platform.homeDir, appName);
    } else if (platform.isMac) {
      return path.join(platform.homeDir, 'Library', 'Application Support', appName);
    } else {
      return path.join(platform.homeDir, '.config', appName);
    }
  }
  
  // Get user's data directory
  static getDataDir(appName: string): string {
    if (platform.isWindows) {
      return path.join(process.env.LOCALAPPDATA || platform.homeDir, appName);
    } else if (platform.isMac) {
      return path.join(platform.homeDir, 'Library', 'Application Support', appName);
    } else {
      return path.join(platform.homeDir, '.local', 'share', appName);
    }
  }
}

// Example usage
const appName = 'MyApp';
console.log('Platform-specific directories:');
console.log(`- Config: ${PathHelper.getConfigDir(appName)}`);
console.log(`- Data: ${PathHelper.getDataDir(appName)}`);

// ===== Environment Variables =====
console.log('\n\n=== Cross-Platform Environment Variables ===\n');

// Platform-specific environment variable handling
class EnvHelper {
  // Get PATH separator
  static get pathSeparator(): string {
    return platform.isWindows ? ';' : ':';
  }
  
  // Add to PATH
  static addToPath(newPath: string): Record<string, string> {
    const currentPath = process.env.PATH || '';
    const separator = this.pathSeparator;
    return {
      PATH: `${newPath}${separator}${currentPath}`
    };
  }
  
  // Get common environment variables
  static getCommonEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    
    // Home directory
    env.HOME = platform.homeDir;
    if (platform.isWindows) {
      env.USERPROFILE = platform.homeDir;
    }
    
    // Temp directory
    env.TMPDIR = platform.tempDir;
    if (platform.isWindows) {
      env.TEMP = platform.tempDir;
      env.TMP = platform.tempDir;
    }
    
    // User
    env.USER = process.env.USER || process.env.USERNAME || 'unknown';
    
    return env;
  }
}

// Example: Set up cross-platform environment
const crossPlatformEnv = {
  ...EnvHelper.getCommonEnv(),
  ...EnvHelper.addToPath('/usr/local/bin'),
  MY_APP_HOME: PathHelper.getConfigDir('myapp')
};

console.log('Cross-platform environment setup:');
const $configured = $.env(crossPlatformEnv);
await $configured`echo "HOME=$HOME, PATH=$PATH"`;

// ===== Shell Selection =====
console.log('\n\n=== Cross-Platform Shell Selection ===\n');

// Get appropriate shell for the platform
class ShellHelper {
  static async getDefaultShell(): Promise<string> {
    if (platform.isWindows) {
      // Check for PowerShell Core first, then Windows PowerShell
      const hasPwsh = await $.which('pwsh') !== null;
      if (hasPwsh) return 'pwsh.exe';
      
      const hasPowerShell = await $.which('powershell') !== null;
      if (hasPowerShell) return 'powershell.exe';
      
      return 'cmd.exe';
    } else {
      // On Unix-like systems, check common shells
      const shells = [process.env.SHELL, '/bin/bash', '/bin/sh', '/bin/zsh'];
      for (const shell of shells) {
        if (shell && await $`test -x ${shell}`.nothrow().then(r => r.exitCode === 0)) {
          return shell;
        }
      }
      return '/bin/sh'; // Fallback
    }
  }
  
  static async createConfigured() {
    const shell = await this.getDefaultShell();
    console.log(`Using shell: ${shell}`);
    return $.shell(shell);
  }
}

// Use platform-appropriate shell
const $platformShell = await ShellHelper.createConfigured();
if (platform.isWindows) {
  await $platformShell`echo "Running on Windows with $($PSVersionTable.PSVersion)"`.nothrow();
} else {
  await $platformShell`echo "Shell: $SHELL"`;
}

// ===== File System Operations =====
console.log('\n\n=== Cross-Platform File System ===\n');

// Cross-platform file operations
class FileSystemHelper {
  // Check if path is absolute
  static isAbsolute(filepath: string): boolean {
    if (platform.isWindows) {
      // Windows: C:\ or \\server\share
      return /^[a-zA-Z]:[\\\/]/.test(filepath) || /^\\\\/.test(filepath);
    } else {
      // Unix: starts with /
      return filepath.startsWith('/');
    }
  }
  
  // Get file permissions (Unix) or attributes (Windows)
  static async getFileInfo(filepath: string) {
    if (platform.isWindows) {
      const result = await $.raw`attrib "${filepath}"`.nothrow();
      if (result.exitCode === 0) {
        const attrs = result.stdout.trim().split(' ')[0];
        return {
          readable: !attrs.includes('H'), // Not hidden
          writable: !attrs.includes('R'), // Not read-only
          hidden: attrs.includes('H'),
          system: attrs.includes('S'),
          archive: attrs.includes('A')
        };
      }
    } else {
      const result = await $`stat -c "%a %U %G" ${filepath} 2>/dev/null || stat -f "%Lp %Su %Sg" ${filepath}`;
      const [perms, owner, group] = result.stdout.trim().split(' ');
      return {
        permissions: perms,
        owner,
        group,
        readable: parseInt(perms[0]) >= 4,
        writable: parseInt(perms[0]) >= 6
      };
    }
  }
  
  // Create directory with proper permissions
  static async createDirectory(dirPath: string, mode?: string) {
    if (platform.isWindows) {
      await $.raw`mkdir "${dirPath}" 2>nul || echo "Directory exists"`;
    } else {
      await $`mkdir -p ${dirPath}`;
      if (mode) {
        await $`chmod ${mode} ${dirPath}`;
      }
    }
  }
}

// Example: Cross-platform directory creation
const testDir = path.join(platform.tempDir, 'ush-cross-platform-test');
await FileSystemHelper.createDirectory(testDir, '755');
console.log(`✓ Created directory: ${testDir}`);

const fileInfo = await FileSystemHelper.getFileInfo(testDir);
console.log('File info:', fileInfo);

// Clean up
if (platform.isWindows) {
  await $.raw`rmdir /Q "${testDir}" 2>nul`;
} else {
  await $`rm -rf ${testDir}`;
}

// ===== Process Management =====
console.log('\n\n=== Cross-Platform Process Management ===\n');

// Cross-platform process operations
class ProcessHelper {
  // Find process by name
  static async findProcess(processName: string) {
    if (platform.isWindows) {
      const result = await $.raw`tasklist /FI "IMAGENAME eq ${processName}*" /FO CSV`.nothrow();
      if (result.exitCode === 0 && !result.stdout.includes('No tasks')) {
        // Parse CSV output
        const lines = result.stdout.trim().split('\n').slice(1); // Skip header
        return lines.map(line => {
          const [name, pid] = line.split(',').map(s => s.replace(/"/g, ''));
          return { name, pid: parseInt(pid) };
        });
      }
    } else {
      const result = await $`ps aux | grep ${processName} | grep -v grep`.nothrow();
      if (result.exitCode === 0) {
        return result.stdout.trim().split('\n').map(line => {
          const parts = line.split(/\s+/);
          return { name: parts[10], pid: parseInt(parts[1]) };
        });
      }
    }
    return [];
  }
  
  // Kill process by PID
  static async killProcess(pid: number, force = false) {
    if (platform.isWindows) {
      const flag = force ? '/F' : '';
      return $.raw`taskkill ${flag} /PID ${pid}`;
    } else {
      const signal = force ? 'SIGKILL' : 'SIGTERM';
      return $`kill -${signal} ${pid}`;
    }
  }
}

// Example: Find Node.js processes
console.log('Finding Node.js processes:');
const nodeProcesses = await ProcessHelper.findProcess('node');
console.log(`Found ${nodeProcesses.length} Node.js process(es)`);
for (const proc of nodeProcesses.slice(0, 3)) {
  console.log(`- PID: ${proc.pid}, Name: ${proc.name}`);
}

// ===== Network Operations =====
console.log('\n\n=== Cross-Platform Network Operations ===\n');

// Cross-platform network utilities
class NetworkHelper {
  // Ping with count
  static async ping(host: string, count = 4) {
    const countFlag = platform.isWindows ? '-n' : '-c';
    return $`ping ${countFlag} ${count} ${host}`;
  }
  
  // Get network interfaces
  static async getNetworkInterfaces() {
    if (platform.isWindows) {
      return $`ipconfig`;
    } else if (platform.isMac) {
      return $`ifconfig`;
    } else {
      return $`ip addr show`;
    }
  }
  
  // Check port availability
  static async isPortAvailable(port: number): Promise<boolean> {
    if (platform.isWindows) {
      const result = await $.raw`netstat -an | findstr ":${port}"`.nothrow();
      return result.exitCode !== 0; // Not found means available
    } else {
      const result = await $`lsof -i :${port}`.nothrow();
      return result.exitCode !== 0; // Not found means available
    }
  }
}

// Example: Check common ports
console.log('Checking port availability:');
const ports = [80, 443, 3000, 8080];
for (const port of ports) {
  const available = await NetworkHelper.isPortAvailable(port);
  console.log(`- Port ${port}: ${available ? '✓ Available' : '✗ In use'}`);
}

// ===== Summary and Best Practices =====
console.log('\n\n=== Cross-Platform Best Practices ===\n');

console.log('1. Use Node.js built-in modules (path, os) for platform detection');
console.log('2. Abstract platform-specific commands into helper classes');
console.log('3. Always handle Windows path separators (backslash vs forward slash)');
console.log('4. Be aware of shell differences (cmd.exe vs bash)');
console.log('5. Test on all target platforms, not just your development platform');
console.log('6. Use platform-specific environment variables appropriately');
console.log('7. Handle file permissions differently on Windows vs Unix');
console.log('8. Consider using PowerShell Core for better Windows compatibility');
console.log('\nRemember: Write once, test everywhere! 🌍');

// Final example: A fully cross-platform script
console.log('\n\n=== Complete Cross-Platform Example ===\n');

async function crossPlatformBackup(sourceDir: string, backupName: string) {
  console.log(`Creating backup of ${sourceDir}...`);
  
  // Ensure paths are correct for the platform
  sourceDir = PathHelper.toPlatform(sourceDir);
  const backupDir = path.join(PathHelper.getDataDir('backups'), backupName);
  
  // Create backup directory
  await FileSystemHelper.createDirectory(backupDir);
  
  // Copy files (using platform-specific command)
  if (platform.isWindows) {
    await $.raw`xcopy "${sourceDir}" "${backupDir}" /E /I /H /Y`;
  } else {
    await $`cp -r ${sourceDir} ${backupDir}`;
  }
  
  // Create timestamp file
  const timestamp = new Date().toISOString();
  const timestampFile = path.join(backupDir, 'backup-info.txt');
  await $`echo "Backup created: ${timestamp}" > ${timestampFile}`;
  
  console.log(`✓ Backup created at: ${backupDir}`);
  return backupDir;
}

// Run the cross-platform backup example
const sourceExample = path.join(platform.tempDir, 'example-source');
await FileSystemHelper.createDirectory(sourceExample);
await $`echo "Test data" > ${path.join(sourceExample, 'data.txt')}`;

const backupPath = await crossPlatformBackup(sourceExample, `backup-${Date.now()}`);
console.log('Backup completed successfully!');

// Cleanup
await $`${CrossPlatformCommands.get('remove')} -rf ${sourceExample}`.nothrow();