import { existsSync } from 'fs';
import * as yaml from 'js-yaml';
import { dirname, resolve } from 'path';
import { stat, mkdir, readFile, writeFile as fsWriteFile } from 'fs/promises';

import { errorMessages } from './error-handler.js';

/**
 * Ensure directory exists, creating it if necessary
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

/**
 * Ensure parent directory of a file exists
 */
export async function ensureParentDirectory(filePath: string): Promise<void> {
  await ensureDirectory(dirname(filePath));
}

/**
 * Read and parse JSON file
 */
export async function readJsonFile<T = any>(filePath: string): Promise<T> {
  if (!existsSync(filePath)) {
    throw errorMessages.fileNotFound(filePath);
  }

  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error: any) {
    if (error.name === 'SyntaxError') {
      throw errorMessages.invalidInput(filePath, 'Invalid JSON format');
    }
    throw error;
  }
}

/**
 * Write JSON file with proper formatting
 */
export async function writeJsonFile(filePath: string, data: any, options?: { pretty?: boolean }): Promise<void> {
  const { pretty = true } = options || {};
  
  await ensureParentDirectory(filePath);
  
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await writeFile(filePath, content, 'utf8');
}

/**
 * Read and parse YAML file
 */
export async function readYamlFile<T = any>(filePath: string): Promise<T> {
  if (!existsSync(filePath)) {
    throw errorMessages.fileNotFound(filePath);
  }

  try {
    const content = await readFile(filePath, 'utf8');
    return yaml.load(content) as T;
  } catch (error: any) {
    throw errorMessages.invalidInput(filePath, `Invalid YAML format: ${error.message}`);
  }
}

/**
 * Write YAML file
 */
export async function writeYamlFile(filePath: string, data: any): Promise<void> {
  await ensureParentDirectory(filePath);
  
  const content = yaml.dump(data, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
  
  await writeFile(filePath, content, 'utf8');
}

/**
 * Read file based on extension (auto-detect JSON/YAML)
 */
export async function readDataFile<T = any>(filePath: string): Promise<T> {
  const ext = filePath.toLowerCase();
  
  if (ext.endsWith('.json')) {
    return readJsonFile<T>(filePath);
  } else if (ext.endsWith('.yaml') || ext.endsWith('.yml')) {
    return readYamlFile<T>(filePath);
  } else {
    // Try to detect format by content
    const content = await readFile(filePath, 'utf8');
    
    try {
      return JSON.parse(content);
    } catch {
      try {
        return yaml.load(content) as T;
      } catch {
        throw errorMessages.invalidInput(filePath, 'Unable to parse as JSON or YAML');
      }
    }
  }
}

/**
 * Write file based on extension
 */
export async function writeDataFile(filePath: string, data: any): Promise<void> {
  const ext = filePath.toLowerCase();
  
  if (ext.endsWith('.json')) {
    await writeJsonFile(filePath, data);
  } else if (ext.endsWith('.yaml') || ext.endsWith('.yml')) {
    await writeYamlFile(filePath, data);
  } else {
    // Default to JSON
    await writeJsonFile(filePath, data);
  }
}

/**
 * Check if path is a file
 */
export async function isFile(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Check if path is a directory
 */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Find config file in current directory or parent directories
 */
export async function findConfigFile(filename: string, startDir = process.cwd()): Promise<string | null> {
  let currentDir = resolve(startDir);
  
  while (currentDir !== '/') {
    const configPath = resolve(currentDir, filename);
    
    if (existsSync(configPath)) {
      return configPath;
    }
    
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break; // Reached root
    }
    
    currentDir = parentDir;
  }
  
  return null;
}

/**
 * Load config file from standard locations
 */
export async function loadConfigFile<T = any>(
  filename: string,
  options?: {
    searchPaths?: string[];
    required?: boolean;
  }
): Promise<T | null> {
  const { searchPaths = [process.cwd()], required = false } = options || {};
  
  // First check explicit paths
  for (const searchPath of searchPaths) {
    const configPath = resolve(searchPath, filename);
    
    if (existsSync(configPath)) {
      return readDataFile<T>(configPath);
    }
  }
  
  // Then search up the directory tree
  const foundPath = await findConfigFile(filename);
  
  if (foundPath) {
    return readDataFile<T>(foundPath);
  }
  
  if (required) {
    throw errorMessages.fileNotFound(filename);
  }
  
  return null;
}

/**
 * Safe file write with backup
 */
export async function safeWriteFile(
  filePath: string,
  content: string,
  options?: {
    backup?: boolean;
    encoding?: BufferEncoding;
  }
): Promise<void> {
  const { backup = true, encoding = 'utf8' } = options || {};
  
  if (backup && existsSync(filePath)) {
    const backupPath = `${filePath}.backup`;
    const originalContent = await readFile(filePath, encoding);
    await fsWriteFile(backupPath, originalContent, encoding);
  }
  
  await fsWriteFile(filePath, content, encoding);
}

/**
 * Template file with variable substitution
 */
export async function templateFile(
  templatePath: string,
  outputPath: string,
  variables: Record<string, any>
): Promise<void> {
  if (!existsSync(templatePath)) {
    throw errorMessages.fileNotFound(templatePath);
  }

  let content = await readFile(templatePath, 'utf8');
  
  // Simple template substitution ({{variable}})
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    content = content.replace(regex, String(value));
  }
  
  await ensureParentDirectory(outputPath);
  await fsWriteFile(outputPath, content, 'utf8');
}

/**
 * Export writeFile for direct use
 */
export const writeFile = fsWriteFile;