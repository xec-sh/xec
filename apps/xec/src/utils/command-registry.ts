/**
 * CLI command registry integration
 */

import { Command } from 'commander';
import { CommandRegistry, type CommandSuggestion } from '@xec-sh/core';

/**
 * Extract command info from Commander.js command
 */
function extractCommandInfo(cmd: Command): CommandSuggestion {
  const name = cmd.name();
  const description = cmd.description();
  const aliases = cmd.aliases();
  const usage = cmd.usage() || `xec ${name} [options]`;
  
  return {
    command: name,
    description,
    aliases,
    usage
  };
}

/**
 * Build command registry from Commander.js program
 */
export function buildCommandRegistry(program: Command): CommandRegistry {
  const registry = new CommandRegistry();
  
  // Register main command
  if (program.name() && program.name() !== 'xec') {
    registry.register(extractCommandInfo(program));
  }
  
  // Register subcommands
  program.commands.forEach(cmd => {
    registry.register(extractCommandInfo(cmd));
    
    // Recursively register nested subcommands
    if (cmd.commands && cmd.commands.length > 0) {
      cmd.commands.forEach(subCmd => {
        const info = extractCommandInfo(subCmd);
        // Prefix with parent command
        info.command = `${cmd.name()} ${info.command}`;
        registry.register(info);
      });
    }
  });
  
  return registry;
}

/**
 * Register all CLI commands for suggestions
 */
export function registerCliCommands(program: Command): CommandRegistry {
  const registry = buildCommandRegistry(program);
  
  // Add custom commands that aren't in the commander structure
  registry.registerAll([
    {
      command: 'on',
      description: 'Execute command on SSH host',
      usage: 'xec on <host> <command>',
      aliases: []
    },
    {
      command: 'in',
      description: 'Execute command in container/pod',
      usage: 'xec in <container|pod:name> <command>',
      aliases: []
    },
    {
      command: 'forward',
      description: 'Set up port forwarding',
      usage: 'xec forward <source> [to] <destination>',
      aliases: ['tunnel', 'port-forward']
    },
    {
      command: 'logs',
      description: 'View logs from container/pod/file',
      usage: 'xec logs <source> [options]',
      aliases: ['log', 'tail']
    }
  ]);
  
  return registry;
}

/**
 * Find command handler with fuzzy matching
 */
export function findCommand(
  program: Command,
  input: string
): Command | null {
  // First try exact match
  const exactMatch = program.commands.find(cmd => 
    cmd.name() === input || cmd.aliases().includes(input)
  );
  
  if (exactMatch) {
    return exactMatch;
  }
  
  // Try case-insensitive match
  const lowerInput = input.toLowerCase();
  const caseInsensitive = program.commands.find(cmd =>
    cmd.name().toLowerCase() === lowerInput ||
    cmd.aliases().some(alias => alias.toLowerCase() === lowerInput)
  );
  
  return caseInsensitive || null;
}