#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { execSync } from 'child_process';

// Read package.json to get workspaces
const rootPackageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const workspacePatterns = rootPackageJson.workspaces || ["apps/*", "packages/*"];

const getPackages = () => {
  const packages = new Set<string>();

  workspacePatterns.forEach(pattern => {
    const basePath = pattern.replace('/*', '');
    const workspaceDir = path.join(process.cwd(), basePath);

    if (fs.existsSync(workspaceDir)) {
      fs.readdirSync(workspaceDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .forEach(dirent => packages.add(dirent.name));
    }
  });

  return Array.from(packages);
};

const publishPackage = (packageName: string) => {
  // Search for package in all workspace directories
  const packagePath = workspacePatterns
    .map(pattern => path.join(process.cwd(), pattern.replace('/*', ''), packageName))
    .find(dir => fs.existsSync(dir));

  if (!packagePath) {
    console.error(`❌ Package ${packageName} not found in workspaces`);
    return;
  }

  try {
    console.log(`\nPublishing package: ${packageName}`);
    console.log(packagePath);
    execSync(`corepack yarn npm publish --access public`, { stdio: 'inherit', cwd: packagePath, shell: '/bin/bash' });
    console.log(`✅ Successfully published: ${packageName}\n`);
  } catch (error: any) {
    console.error(`❌ Error publishing ${packageName}:`, error.message);
  }
};

const run = async () => {
  const packages = getPackages();

  const { selectedPackages } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedPackages',
      message: 'Select packages to publish:',
      choices: packages,
    },
  ]);

  if (selectedPackages.length === 0) {
    console.log('No packages selected for publishing. Exiting.');
    process.exit(0);
  }

  for (const pkg of selectedPackages) {
    publishPackage(pkg);
  }
};

run();
