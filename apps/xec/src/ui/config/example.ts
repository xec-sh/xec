/**
 * Example usage of the UI Configuration Manager
 */

import { getUIConfigManager, getWorkspaceManager } from './index.js';

async function main() {
  console.log('=== UI Configuration Manager Example ===\n');

  // Initialize managers
  const configManager = getUIConfigManager();
  const workspaceManager = getWorkspaceManager();

  // Initialize and load configuration
  console.log('1. Initializing workspace manager...');
  await workspaceManager.initialize();

  // List current workspaces
  console.log('\n2. Current workspaces:');
  const workspaces = await workspaceManager.getAll();
  if (workspaces.length === 0) {
    console.log('   No workspaces configured');
  } else {
    for (const workspace of workspaces) {
      console.log(`   - ${workspace.name} (${workspace.id}): ${workspace.path}`);
    }
  }

  // Add current directory as a workspace (if it's a valid xec project)
  console.log('\n3. Adding current directory as workspace...');
  try {
    const currentPath = process.cwd();
    const existing = await workspaceManager.getByPath(currentPath);
    
    if (existing) {
      console.log(`   Already exists: ${existing.name}`);
    } else {
      const workspace = await workspaceManager.add(currentPath, {
        description: 'Example workspace',
        tags: ['example', 'demo'],
        type: 'project'
      });
      console.log(`   Added: ${workspace.name} (${workspace.id})`);
    }
  } catch (error: any) {
    console.log(`   Failed: ${error.message}`);
  }

  // Set active workspace
  console.log('\n4. Setting active workspace...');
  const allWorkspaces = await workspaceManager.getAll();
  const firstWorkspace = allWorkspaces[0];
  if (firstWorkspace) {
    await workspaceManager.setActive(firstWorkspace.id);
    console.log(`   Active: ${firstWorkspace.name}`);
  }

  // Get recent workspaces
  console.log('\n5. Recent workspaces:');
  const recent = await workspaceManager.getRecent(3);
  if (recent.length === 0) {
    console.log('   No recent workspaces');
  } else {
    for (const workspace of recent) {
      console.log(`   - ${workspace.name}`);
    }
  }

  // Search workspaces
  console.log('\n6. Searching for "xec" workspaces:');
  const searchResults = await workspaceManager.search('xec');
  if (searchResults.length === 0) {
    console.log('   No matches found');
  } else {
    for (const workspace of searchResults) {
      console.log(`   - ${workspace.name}: ${workspace.path}`);
    }
  }

  // Get statistics
  console.log('\n7. Workspace statistics:');
  const stats = await workspaceManager.getStatistics();
  console.log(`   Total: ${stats.total}`);
  console.log(`   Recently used: ${stats.recentlyUsed}`);
  console.log(`   With tags: ${stats.withTags}`);
  console.log('   By type:');
  for (const [type, count] of Object.entries(stats.byType)) {
    console.log(`     ${type}: ${count}`);
  }

  // Configuration details
  console.log('\n8. Configuration details:');
  const config = configManager.getConfig();
  console.log(`   Version: ${config.version}`);
  console.log(`   Theme: ${config.theme?.name || 'default'}`);
  console.log(`   Layout:`);
  console.log(`     Show sidebar: ${config.layout?.showSidebar}`);
  console.log(`     Sidebar width: ${config.layout?.sidebarWidth}`);
  console.log(`   Preferences:`);
  console.log(`     Auto-discover: ${config.preferences?.autoDiscover}`);
  console.log(`     Auto-save: ${config.preferences?.autoSave}`);

  // Listen to configuration changes
  console.log('\n9. Setting up event listeners...');
  configManager.on('config-changed', (event) => {
    console.log(`   Config changed: ${event.type}`);
  });

  // Save configuration
  console.log('\n10. Saving configuration...');
  await workspaceManager.save();
  console.log('    Configuration saved successfully');

  console.log('\n=== Example completed ===');
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}