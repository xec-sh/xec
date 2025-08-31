#!/usr/bin/env node
/**
 * CLI utility for managing xec UI workspaces
 * Usage: xec ui workspace <command> [options]
 */

import * as path from 'path';

import { getWorkspaceManager } from './index.js';

// CLI commands
type Command =
  | 'list'
  | 'add'
  | 'remove'
  | 'active'
  | 'set-active'
  | 'discover'
  | 'stats'
  | 'export'
  | 'import'
  | 'clean';

/**
 * Main CLI handler for workspace management
 */
export async function handleWorkspaceCommand(args: string[]): Promise<void> {
  const command = args[0] as Command;
  const options = args.slice(1);

  const workspaceManager = getWorkspaceManager();
  await workspaceManager.initialize();

  try {
    switch (command) {
      case 'list':
        await listWorkspaces(workspaceManager);
        break;

      case 'add':
        await addWorkspace(workspaceManager, options[0]);
        break;

      case 'remove':
        await removeWorkspace(workspaceManager, options[0]);
        break;

      case 'active':
        await showActiveWorkspace(workspaceManager);
        break;

      case 'set-active':
        await setActiveWorkspace(workspaceManager, options[0]);
        break;

      case 'discover':
        await discoverWorkspaces(workspaceManager, options);
        break;

      case 'stats':
        await showStatistics(workspaceManager);
        break;

      case 'export':
        await exportWorkspaces(workspaceManager, options[0]);
        break;

      case 'import':
        await importWorkspaces(workspaceManager, options[0]);
        break;

      case 'clean':
        await cleanInvalidWorkspaces(workspaceManager);
        break;

      default:
        showHelp();
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * List all workspaces
 */
async function listWorkspaces(manager: any): Promise<void> {
  const workspaces = await manager.getAll();
  const active = await manager.getActive();

  if (workspaces.length === 0) {
    console.log('No workspaces configured.');
    console.log('Use "xec ui workspace add <path>" to add a workspace.');
    return;
  }

  console.log('Configured workspaces:\n');

  for (const workspace of workspaces) {
    const isActive = active?.id === workspace.id;
    const marker = isActive ? '→' : ' ';
    const tags = workspace.tags?.join(', ') || '';

    console.log(`${marker} ${workspace.name} (${workspace.id})`);
    console.log(`    Path: ${workspace.path}`);
    if (workspace.description) {
      console.log(`    Description: ${workspace.description}`);
    }
    if (tags) {
      console.log(`    Tags: ${tags}`);
    }
    if (workspace.lastAccessed) {
      const date = new Date(workspace.lastAccessed).toLocaleString();
      console.log(`    Last accessed: ${date}`);
    }
    console.log();
  }

  console.log(`Total: ${workspaces.length} workspace(s)`);
}

/**
 * Add a new workspace
 */
async function addWorkspace(manager: any, workspacePath?: string): Promise<void> {
  const targetPath = workspacePath || process.cwd();
  const resolvedPath = path.resolve(targetPath);

  try {
    const existing = await manager.getByPath(resolvedPath);
    if (existing) {
      console.log(`Workspace already exists: ${existing.name} (${existing.id})`);
      return;
    }

    const workspace = await manager.add(resolvedPath);
    await manager.save();

    console.log(`Added workspace: ${workspace.name} (${workspace.id})`);
    console.log(`Path: ${workspace.path}`);
  } catch (error: any) {
    if (error.message.includes('Not a valid xec workspace')) {
      console.error(`Error: ${resolvedPath} is not a valid xec workspace.`);
      console.error('Make sure the directory contains a .xec folder.');
    } else {
      throw error;
    }
  }
}

/**
 * Remove a workspace
 */
async function removeWorkspace(manager: any, identifier?: string): Promise<void> {
  if (!identifier) {
    console.error('Please provide a workspace ID, name, or path to remove.');
    return;
  }

  // Try to find by ID first
  let workspace = await manager.get(identifier);

  // Try by path if not found
  if (!workspace) {
    const resolvedPath = path.resolve(identifier);
    workspace = await manager.getByPath(resolvedPath);
  }

  // Try by name if still not found
  if (!workspace) {
    const all = await manager.getAll();
    workspace = all.find((w: any) => w.name === identifier);
  }

  if (!workspace) {
    console.error(`Workspace not found: ${identifier}`);
    return;
  }

  await manager.remove(workspace.id);
  await manager.save();

  console.log(`Removed workspace: ${workspace.name} (${workspace.id})`);
}

/**
 * Show active workspace
 */
async function showActiveWorkspace(manager: any): Promise<void> {
  const active = await manager.getActive();

  if (!active) {
    console.log('No active workspace set.');
    return;
  }

  console.log(`Active workspace: ${active.name} (${active.id})`);
  console.log(`Path: ${active.path}`);
}

/**
 * Set active workspace
 */
async function setActiveWorkspace(manager: any, identifier?: string): Promise<void> {
  if (!identifier) {
    // Set current directory as active if it's a workspace
    const currentPath = process.cwd();
    const workspace = await manager.getByPath(currentPath);

    if (!workspace) {
      console.error('Current directory is not a registered workspace.');
      console.error('Use "xec ui workspace add" to add it first.');
      return;
    }

    identifier = workspace.id;
  } else {
    // Find workspace by identifier
    let workspace = await manager.get(identifier);

    if (!workspace) {
      const resolvedPath = path.resolve(identifier);
      workspace = await manager.getByPath(resolvedPath);
    }

    if (!workspace) {
      const all = await manager.getAll();
      workspace = all.find((w: any) => w.name === identifier);
    }

    if (!workspace) {
      console.error(`Workspace not found: ${identifier}`);
      return;
    }

    identifier = workspace.id;
  }

  await manager.setActive(identifier);
  await manager.save();

  const workspace = await manager.get(identifier);
  console.log(`Set active workspace: ${workspace.name} (${workspace.id})`);
}

/**
 * Discover workspaces
 */
async function discoverWorkspaces(manager: any, paths: string[]): Promise<void> {
  const scanPaths = paths.length > 0
    ? paths.map(p => path.resolve(p))
    : [path.join(process.env['HOME'] || '~', 'projects')];

  console.log('Scanning for xec workspaces in:');
  for (const p of scanPaths) {
    console.log(`  - ${p}`);
  }
  console.log();

  const configManager = manager['configManager'];
  const discovered = await configManager.discoverWorkspaces(scanPaths);

  if (discovered.length === 0) {
    console.log('No new workspaces found.');
    return;
  }

  console.log(`Found ${discovered.length} workspace(s):\n`);

  for (const workspace of discovered) {
    try {
      const added = await manager.add(workspace.path, workspace);
      console.log(`✓ Added: ${added.name} (${added.path})`);
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log(`- Skipped: ${workspace.name} (already exists)`);
      } else {
        console.log(`✗ Failed: ${workspace.name} - ${error.message}`);
      }
    }
  }

  await manager.save();
}

/**
 * Show workspace statistics
 */
async function showStatistics(manager: any): Promise<void> {
  const stats = await manager.getStatistics();

  console.log('Workspace Statistics:\n');
  console.log(`Total workspaces: ${stats.total}`);
  console.log(`Recently used (last 7 days): ${stats.recentlyUsed}`);
  console.log(`With tags: ${stats.withTags}`);

  if (Object.keys(stats.byType).length > 0) {
    console.log('\nBy type:');
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(`  ${type}: ${count}`);
    }
  }

  const recent = await manager.getRecent(5);
  if (recent.length > 0) {
    console.log('\nRecent workspaces:');
    for (const workspace of recent) {
      console.log(`  - ${workspace.name} (${workspace.id})`);
    }
  }
}

/**
 * Export workspaces to JSON
 */
async function exportWorkspaces(manager: any, outputPath?: string): Promise<void> {
  const json = await manager.exportToJSON();

  if (outputPath) {
    const fs = await import('fs/promises');
    await fs.writeFile(outputPath, json, 'utf8');
    console.log(`Exported workspaces to: ${outputPath}`);
  } else {
    console.log(json);
  }
}

/**
 * Import workspaces from JSON
 */
async function importWorkspaces(manager: any, inputPath?: string): Promise<void> {
  if (!inputPath) {
    console.error('Please provide a path to the JSON file to import.');
    return;
  }

  const fs = await import('fs/promises');
  const json = await fs.readFile(inputPath, 'utf8');

  const imported = await manager.importFromJSON(json);
  await manager.save();

  console.log(`Imported ${imported.length} workspace(s):`);
  for (const workspace of imported) {
    console.log(`  - ${workspace.name} (${workspace.id})`);
  }
}

/**
 * Clean invalid workspaces
 */
async function cleanInvalidWorkspaces(manager: any): Promise<void> {
  const workspaces = await manager.getAll();
  const invalid: any[] = [];

  for (const workspace of workspaces) {
    try {
      const fs = await import('fs/promises');
      await fs.access(workspace.path);
      const xecPath = path.join(workspace.path, '.xec');
      await fs.access(xecPath);
    } catch {
      invalid.push(workspace);
    }
  }

  if (invalid.length === 0) {
    console.log('All workspaces are valid.');
    return;
  }

  console.log(`Found ${invalid.length} invalid workspace(s):\n`);

  for (const workspace of invalid) {
    console.log(`  - ${workspace.name} (${workspace.path})`);
    await manager.remove(workspace.id);
  }

  await manager.save();
  console.log(`\nRemoved ${invalid.length} invalid workspace(s).`);
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
xec ui workspace - Manage xec UI workspaces

Usage: xec ui workspace <command> [options]

Commands:
  list, ls                    List all configured workspaces
  add [path]                  Add a workspace (default: current directory)
  remove, rm <id|name|path>   Remove a workspace
  active                      Show the active workspace
  set-active [id|name|path]   Set the active workspace
  discover [paths...]         Discover workspaces in specified paths
  stats                       Show workspace statistics
  export [file]               Export workspaces to JSON
  import <file>               Import workspaces from JSON
  clean                       Remove invalid workspaces

Examples:
  xec ui workspace add                    # Add current directory
  xec ui workspace add ~/projects/myapp   # Add specific directory
  xec ui workspace list                   # List all workspaces
  xec ui workspace remove myapp           # Remove by name or ID
  xec ui workspace set-active             # Set current dir as active
  xec ui workspace discover ~/projects    # Find workspaces in ~/projects
  xec ui workspace export > workspaces.json
  xec ui workspace import workspaces.json
`);
}