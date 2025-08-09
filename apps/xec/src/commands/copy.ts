import chalk from 'chalk';
import { kit } from '@xec-sh/kit';

import { InteractiveHelpers } from '../utils/interactive-helpers.js';
import { selectFiles, selectDirectory } from '../utils/file-helpers.js';


export interface EnhancedCopyResult {
  sourceSpec: string;
  destinationSpec: string;
  options: {
    recursive?: boolean;
    preserve?: boolean;
    force?: boolean;
    parallel?: boolean;
  };
}

/**
 * Enhanced interactive copy mode with file browser
 */
export async function runEnhancedInteractiveMode(): Promise<EnhancedCopyResult | null> {

  InteractiveHelpers.startInteractiveMode('Interactive Copy Mode (Enhanced)');

  try {
    // Select source type
    const sourceType = await kit.select({
      message: 'What do you want to copy?',
      options: [
        { value: 'file', label: '📄 Single file', hint: 'Copy one file' },
        { value: 'multiple', label: '📄📄 Multiple files', hint: 'Select multiple files' },
        { value: 'directory', label: '📁 Directory', hint: 'Copy entire directory' },
        { value: 'pattern', label: '🔍 Files matching pattern', hint: 'Use wildcards' },
      ],
      search: true,
    });

    if (kit.isCancel(sourceType)) return null;

    // Select source target
    const sourceTarget = await InteractiveHelpers.selectTarget({
      message: 'Select source location:',
      type: 'all',
      allowCustom: true,
    });

    if (!sourceTarget || Array.isArray(sourceTarget)) return null;

    let sourcePath: string | null = null;
    const options: EnhancedCopyResult['options'] = {};

    // Handle different source types
    switch (sourceType) {
      case 'file': {
        // Use file browser for single file selection
        if (sourceTarget.type === 'local') {
          const files = await selectFiles({
            title: 'Select file to copy',
            multiple: false,
            preview: true,
          });

          if (!files || files.length === 0) return null;
          sourcePath = files[0];
        } else {
          // Remote target - use text input
          sourcePath = await kit.text({
            message: 'Enter source file path:',
            placeholder: '/path/to/file.txt',
            validate: (value) => {
              if (!value || value.trim().length === 0) {
                return 'Path cannot be empty';
              }
              return undefined;
            },
            suggestions: [
              '/var/log/app.log',
              '/home/user/document.txt',
              '/etc/config.conf',
            ],
          });
        }
        break;
      }

      case 'multiple': {
        // Use file browser for multiple file selection
        if (sourceTarget.type === 'local') {
          const files = await selectFiles({
            title: 'Select files to copy',
            multiple: true,
            preview: true,
          });

          if (!files || files.length === 0) return null;
          
          // Convert to glob pattern or handle individually
          if (files.length === 1) {
            sourcePath = files[0];
          } else {
            // Show selected files
            kit.log.info(`Selected ${files.length} files:`);
            files.forEach((f: string) => kit.log.info(`  - ${f}`));
            
            // For simplicity, use first file's directory with wildcard
            const dir = files[0].substring(0, files[0].lastIndexOf('/'));
            sourcePath = `${dir}/*`;
            options.recursive = true;
          }
        } else {
          // Remote target - use pattern input
          sourcePath = await kit.text({
            message: 'Enter file pattern:',
            placeholder: '*.log or /path/*.txt',
            validate: (value) => {
              if (!value || value.trim().length === 0) {
                return 'Pattern cannot be empty';
              }
              return undefined;
            },
            suggestions: [
              '*.log',
              '*.txt',
              '/var/log/*.log',
              '**/*.js',
            ],
          });
        }
        break;
      }

      case 'directory': {
        // Use directory browser
        if (sourceTarget.type === 'local') {
          const dir = await selectDirectory({
            title: 'Select directory to copy',
          });

          if (!dir) return null;
          sourcePath = dir;
          options.recursive = true;
        } else {
          // Remote target - use text input
          sourcePath = await kit.text({
            message: 'Enter source directory path:',
            placeholder: '/path/to/directory',
            validate: (value) => {
              if (!value || value.trim().length === 0) {
                return 'Path cannot be empty';
              }
              return undefined;
            },
            suggestions: [
              '/var/www',
              '/home/user',
              '/opt/app',
              '/usr/local',
            ],
          });
          options.recursive = true;
        }
        break;
      }

      case 'pattern': {
        sourcePath = await kit.text({
          message: 'Enter file pattern:',
          placeholder: '*.log or /path/**/*.txt',
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Pattern cannot be empty';
            }
            return undefined;
          },
          suggestions: [
            '*.log',
            '**/*.js',
            '/var/log/**/*.log',
            '*.{js,ts}',
            '**/node_modules/**',
          ],
          help: 'Use * for single level, ** for recursive matching',
        });
        break;
      }
    }

    if (kit.isCancel(sourcePath) || !sourcePath) return null;

    // Select destination target
    const destTarget = await InteractiveHelpers.selectTarget({
      message: 'Select destination location:',
      type: 'all',
      allowCustom: true,
    });

    if (!destTarget || Array.isArray(destTarget)) return null;

    // Get destination path
    let destPath: string | null = null;
    
    if (destTarget.type === 'local') {
      // Use directory browser for local destination
      const useExisting = await kit.confirm({
        message: 'Copy to existing directory?',
        default: true,
      });

      if (kit.isCancel(useExisting)) return null;

      if (useExisting) {
        const dir = await selectDirectory({
          title: 'Select destination directory',
          allowCreate: true,
        });
        
        if (!dir) return null;
        destPath = dir;
      } else {
        destPath = await kit.text({
          message: 'Enter destination path:',
          placeholder: '/path/to/destination',
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Path cannot be empty';
            }
            return undefined;
          },
        });
      }
    } else {
      // Remote target or no file picker - use text input
      destPath = await kit.text({
        message: 'Enter destination path:',
        placeholder: '/path/to/destination',
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Path cannot be empty';
          }
          return undefined;
        },
        suggestions: [
          '/tmp',
          '/home/user',
          '/var/backups',
          './backups',
        ],
      });
    }

    if (kit.isCancel(destPath) || !destPath) return null;

    // Configure copy options using a form
    // Forms are always enabled with kit
    {
      const copyOptions = await kit.form({
        title: 'Copy Options',
        fields: [
          {
            name: 'preserve',
            type: 'confirm',
            message: 'Preserve file attributes?',
            default: false,
          },
          {
            name: 'force',
            type: 'confirm',
            message: 'Force overwrite existing files?',
            default: false,
          },
          {
            name: 'parallel',
            type: 'confirm',
            message: 'Copy files in parallel?',
            default: true,
          },
        ],
      });

      if (kit.isCancel(copyOptions)) return null;
      Object.assign(options, copyOptions);
    }

    // Build source and destination specs
    const sourceSpec = sourceTarget.id === 'local' 
      ? sourcePath 
      : `${sourceTarget.id}:${sourcePath}`;
    
    const destSpec = destTarget.id === 'local'
      ? destPath
      : `${destTarget.id}:${destPath}`;

    // Show summary
    kit.log.info('\n📋 Copy Summary:');
    kit.log.info(`  Source: ${chalk.cyan(sourceSpec)}`);
    kit.log.info(`  Destination: ${chalk.cyan(destSpec)}`);
    if (options.recursive) kit.log.info(`  📁 Recursive copy`);
    if (options.preserve) kit.log.info(`  🔒 Preserve attributes`);
    if (options.force) kit.log.info(`  ⚡ Force overwrite`);
    if (options.parallel) kit.log.info(`  🚀 Parallel transfer`);

    const confirm = await kit.confirm({
      message: 'Proceed with copy?',
      default: true,
    });

    if (kit.isCancel(confirm) || !confirm) return null;

    InteractiveHelpers.endInteractiveMode('Copy configuration complete');

    return {
      sourceSpec,
      destinationSpec: destSpec,
      options,
    };
  } catch (error) {
    InteractiveHelpers.showError(`Error: ${error}`);
    return null;
  }
}