import { prism } from '@xec-sh/kit';
import { Command } from 'commander';

/**
 * Customize help output for the program
 */
export function customizeHelp(program: Command, dynamicCommandNames: string[]): void {
  const dynamicSet = new Set(dynamicCommandNames);

  // Override the help output
  program.configureOutput({
    outputError: (str, write) => write(prism.red(str)),
  });

  // Override configureHelp to customize help for the main program only
  program.configureHelp({
    formatHelp: (cmd, helper) => {
      // Only customize help for the root command
      if (cmd.parent !== null) {
        // Use default help for subcommands
        return helper.formatHelp(cmd, helper);
      }
      // Custom help output for main program
      const indent = '  ';
      let output = '';

      output += `Usage: ${cmd.name()} [options] [command]\n\n`;

      if (cmd.description()) {
        output += `${cmd.description()}\n\n`;
      }

      // Options
      const options = cmd.options.filter(opt => !opt.hidden);
      if (options.length > 0) {
        output += prism.bold('Options:') + '\n';
        options.forEach(opt => {
          const flags = opt.flags.padEnd(40);
          output += `${indent}${flags}${opt.description || ''}\n`;
        });
        output += '\n';
      }

      // Split commands into built-in and dynamic
      const builtInCommands: Command[] = [];
      const dynamicCommands: Command[] = [];

      cmd.commands.forEach(subcmd => {
        if (subcmd.name() !== 'help') { // Skip help command itself
          if (dynamicSet.has(subcmd.name())) {
            dynamicCommands.push(subcmd);
          } else {
            builtInCommands.push(subcmd);
          }
        }
      });

      // Display built-in commands
      if (builtInCommands.length > 0) {
        output += prism.bold('Built-in Commands:') + '\n';
        builtInCommands.forEach(subcmd => {
          const name = subcmd.name();
          const aliases = subcmd.aliases().length > 0 ? `|${subcmd.aliases().join('|')}` : '';
          const nameStr = `${name}${aliases}`.padEnd(40);
          const desc = subcmd.description() || '';
          output += `${indent}${nameStr}${desc.split('\n')[0]}\n`;
        });
        output += '\n';
      }

      // Display dynamic commands
      if (dynamicCommands.length > 0) {
        output += prism.bold('Dynamic Commands:') + '\n';
        dynamicCommands.forEach(subcmd => {
          const name = subcmd.name();
          const aliases = subcmd.aliases().length > 0 ? `|${subcmd.aliases().join('|')}` : '';
          const nameStr = `${name}${aliases}`.padEnd(40);
          const desc = subcmd.description() || '';
          output += `${indent}${nameStr}${desc.split('\n')[0]}\n`;
        });
        output += '\n';
      }

      // Examples
      output += prism.bold('Examples:') + '\n';
      output += `${indent}xec echo "Hello World"        ${prism.dim('# Run command locally')}\n`;
      output += `${indent}xec on server "ls -la"        ${prism.dim('# Run on SSH server')}\n`;
      output += `${indent}xec in nginx "cat /etc/nginx" ${prism.dim('# Run in container')}\n`;
      output += `${indent}xec script.js                 ${prism.dim('# Run JavaScript file')}\n`;
      output += '\n';

      output += prism.bold('Learn more:') + '\n';
      output += `${indent}Use "xec <command> --help" for more information about a command\n`;
      output += `${indent}Documentation: https://xec.sh\n`;

      return output;
    }
  });
}