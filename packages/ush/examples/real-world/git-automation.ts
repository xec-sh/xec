#!/usr/bin/env node
/**
 * Git Automation with @xec/ush
 * 
 * Real-world examples of automating Git workflows using @xec/ush.
 */

import { $ } from '@xec/ush';
import * as path from 'path';

// ===== Git Helper Class =====
class GitAutomation {
  constructor(private repoPath: string) {}
  
  // Change to repo directory for all operations
  private get $git() {
    return $.cd(this.repoPath);
  }
  
  // Check if directory is a git repository
  async isGitRepo(): Promise<boolean> {
    const result = await this.$git`git rev-parse --git-dir`.nothrow();
    return result.exitCode === 0;
  }
  
  // Get current branch name
  async getCurrentBranch(): Promise<string> {
    const result = await this.$git`git branch --show-current`;
    return result.stdout.trim();
  }
  
  // Check if working directory is clean
  async isClean(): Promise<boolean> {
    const result = await this.$git`git status --porcelain`;
    return result.stdout.trim() === '';
  }
  
  // Get list of modified files
  async getModifiedFiles(): Promise<string[]> {
    const result = await this.$git`git status --porcelain`;
    return result.stdout
      .trim()
      .split('\n')
      .filter(line => line)
      .map(line => line.substring(3)); // Remove status prefix
  }
  
  // Create and checkout new branch
  async createBranch(branchName: string, baseBranch = 'main'): Promise<void> {
    await this.$git`git checkout ${baseBranch}`;
    await this.$git`git pull origin ${baseBranch}`;
    await this.$git`git checkout -b ${branchName}`;
  }
  
  // Automated commit with conventional commit format
  async commit(type: string, scope: string | null, message: string): Promise<void> {
    const commitMessage = scope 
      ? `${type}(${scope}): ${message}`
      : `${type}: ${message}`;
    
    await this.$git`git add .`;
    await this.$git`git commit -m ${commitMessage}`;
  }
  
  // Smart push with upstream tracking
  async push(force = false): Promise<void> {
    const branch = await this.getCurrentBranch();
    const forceFlag = force ? '--force-with-lease' : '';
    
    // Check if upstream is set
    const upstreamCheck = await this.$git`git rev-parse --abbrev-ref --symbolic-full-name @{u}`.nothrow();
    
    if (upstreamCheck.exitCode !== 0) {
      // No upstream set, use -u flag
      await this.$git`git push -u origin ${branch} ${forceFlag}`;
    } else {
      // Upstream exists
      await this.$git`git push ${forceFlag}`;
    }
  }
  
  // Interactive rebase helper
  async interactiveRebase(commits: number): Promise<void> {
    // Create rebase script
    const rebaseScript = `#!/bin/bash
# Rebase the last ${commits} commits
# Change 'pick' to 'squash' or 'fixup' as needed
git rebase -i HEAD~${commits}
`;
    
    const scriptPath = '/tmp/git-rebase-helper.sh';
    await $`echo ${rebaseScript} > ${scriptPath}`;
    await $`chmod +x ${scriptPath}`;
    
    console.log(`\nRebase script created at: ${scriptPath}`);
    console.log('Edit the script and run it when ready.');
  }
  
  // Find commits by author
  async findCommitsByAuthor(author: string, days = 30): Promise<any[]> {
    const result = await this.$git`
      git log --author="${author}" --since="${days} days ago" 
      --pretty=format:'%H|%an|%ae|%ad|%s' --date=short
    `;
    
    return result.stdout
      .trim()
      .split('\n')
      .filter(line => line)
      .map(line => {
        const [hash, name, email, date, subject] = line.split('|');
        return { hash, name, email, date, subject };
      });
  }
  
  // Cherry-pick commits
  async cherryPick(commits: string[]): Promise<void> {
    for (const commit of commits) {
      try {
        await this.$git`git cherry-pick ${commit}`;
        console.log(`✅ Cherry-picked: ${commit}`);
      } catch (error: any) {
        console.error(`❌ Failed to cherry-pick ${commit}: ${error.message}`);
        
        // Check for conflicts
        const status = await this.$git`git status --porcelain`;
        if (status.stdout.includes('UU')) {
          console.log('⚠️  Conflicts detected. Resolve them and run:');
          console.log('   git cherry-pick --continue');
          throw error;
        }
      }
    }
  }
  
  // Stash operations
  async stash(message?: string): Promise<void> {
    if (message) {
      await this.$git`git stash push -m ${message}`;
    } else {
      await this.$git`git stash`;
    }
  }
  
  async stashPop(): Promise<void> {
    await this.$git`git stash pop`;
  }
  
  async stashList(): Promise<string[]> {
    const result = await this.$git`git stash list`;
    return result.stdout.trim().split('\n').filter(line => line);
  }
}

// ===== Example 1: Automated Release Process =====
async function automatedRelease(repoPath: string, version: string) {
  console.log('=== Automated Release Process ===\n');
  
  const git = new GitAutomation(repoPath);
  
  try {
    // Ensure we're on main branch
    const currentBranch = await git.getCurrentBranch();
    if (currentBranch !== 'main') {
      console.log('Switching to main branch...');
      await git.$git`git checkout main`;
    }
    
    // Pull latest changes
    console.log('Pulling latest changes...');
    await git.$git`git pull origin main`;
    
    // Check working directory is clean
    if (!await git.isClean()) {
      throw new Error('Working directory is not clean. Please commit or stash changes.');
    }
    
    // Update version in package.json
    console.log(`Updating version to ${version}...`);
    await git.$git`npm version ${version} --no-git-tag-version`;
    
    // Generate changelog
    console.log('Generating changelog...');
    const changelog = await git.$git`git log --pretty=format:"- %s (%h)" $(git describe --tags --abbrev=0)..HEAD`;
    const changelogPath = path.join(repoPath, 'CHANGELOG.md');
    
    // Prepend to changelog
    const existingChangelog = await $`cat ${changelogPath}`.nothrow();
    const newChangelog = `# Version ${version} - ${new Date().toISOString().split('T')[0]}

${changelog.stdout}

${existingChangelog.exitCode === 0 ? existingChangelog.stdout : ''}`;
    
    await $`echo ${newChangelog} > ${changelogPath}`;
    
    // Commit changes
    console.log('Committing release...');
    await git.commit('chore', 'release', `version ${version}`);
    
    // Create tag
    console.log('Creating tag...');
    await git.$git`git tag -a v${version} -m "Release version ${version}"`;
    
    // Push changes and tag
    console.log('Pushing to remote...');
    await git.push();
    await git.$git`git push origin v${version}`;
    
    console.log(`\n✅ Release ${version} completed successfully!`);
    
  } catch (error: any) {
    console.error(`\n❌ Release failed: ${error.message}`);
    throw error;
  }
}

// ===== Example 2: Branch Cleanup =====
async function cleanupOldBranches(repoPath: string, daysOld = 30) {
  console.log('=== Branch Cleanup ===\n');
  
  const git = new GitAutomation(repoPath);
  
  // Get all branches with last commit date
  const branches = await git.$git`
    git for-each-ref --format='%(refname:short)|%(committerdate:iso8601)' refs/heads/
  `;
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const branchesToDelete: string[] = [];
  
  for (const line of branches.stdout.trim().split('\n')) {
    if (!line) continue;
    
    const [branch, dateStr] = line.split('|');
    const lastCommitDate = new Date(dateStr);
    
    // Skip protected branches
    if (['main', 'master', 'develop', 'staging', 'production'].includes(branch)) {
      continue;
    }
    
    if (lastCommitDate < cutoffDate) {
      branchesToDelete.push(branch);
    }
  }
  
  if (branchesToDelete.length === 0) {
    console.log('No old branches to delete.');
    return;
  }
  
  console.log(`Found ${branchesToDelete.length} branches older than ${daysOld} days:`);
  for (const branch of branchesToDelete) {
    console.log(`  - ${branch}`);
  }
  
  // Confirm deletion
  const confirm = await $.confirm('\nDelete these branches?');
  if (!confirm) {
    console.log('Cleanup cancelled.');
    return;
  }
  
  // Delete branches
  for (const branch of branchesToDelete) {
    try {
      await git.$git`git branch -D ${branch}`;
      console.log(`✅ Deleted: ${branch}`);
    } catch (error: any) {
      console.error(`❌ Failed to delete ${branch}: ${error.message}`);
    }
  }
  
  console.log('\nBranch cleanup completed!');
}

// ===== Example 3: Git Hooks Automation =====
async function setupGitHooks(repoPath: string) {
  console.log('=== Setting Up Git Hooks ===\n');
  
  const hooksDir = path.join(repoPath, '.git', 'hooks');
  
  // Pre-commit hook: Run tests and linting
  const preCommitHook = `#!/bin/bash
# Pre-commit hook: Run tests and linting

echo "🔍 Running pre-commit checks..."

# Run linting
echo "📝 Checking code style..."
npm run lint
if [ $? -ne 0 ]; then
  echo "❌ Linting failed. Please fix errors before committing."
  exit 1
fi

# Run tests
echo "🧪 Running tests..."
npm test
if [ $? -ne 0 ]; then
  echo "❌ Tests failed. Please fix failing tests before committing."
  exit 1
fi

echo "✅ All checks passed!"
`;

  // Commit-msg hook: Enforce conventional commits
  const commitMsgHook = `#!/bin/bash
# Commit-msg hook: Enforce conventional commit format

commit_regex='^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\(.+\))?: .{1,100}$'
commit_message=$(cat "$1")

if ! echo "$commit_message" | grep -qE "$commit_regex"; then
  echo "❌ Invalid commit message format!"
  echo ""
  echo "📝 Commit message must follow conventional commit format:"
  echo "   <type>(<scope>?): <subject>"
  echo ""
  echo "Types: feat, fix, docs, style, refactor, test, chore, perf, ci, build, revert"
  echo ""
  echo "Example: feat(auth): add login functionality"
  echo ""
  exit 1
fi
`;

  // Post-merge hook: Install dependencies if package.json changed
  const postMergeHook = `#!/bin/bash
# Post-merge hook: Auto-install dependencies

changed_files="$(git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD)"

check_run() {
  echo "$changed_files" | grep -E "$1" > /dev/null 2>&1
}

if check_run "package.json|yarn.lock|package-lock.json"; then
  echo "📦 Dependencies changed, running install..."
  npm install
fi
`;

  // Create hooks
  const hooks = [
    { name: 'pre-commit', content: preCommitHook },
    { name: 'commit-msg', content: commitMsgHook },
    { name: 'post-merge', content: postMergeHook }
  ];
  
  for (const hook of hooks) {
    const hookPath = path.join(hooksDir, hook.name);
    await $`echo ${hook.content} > ${hookPath}`;
    await $`chmod +x ${hookPath}`;
    console.log(`✅ Created ${hook.name} hook`);
  }
  
  console.log('\nGit hooks installed successfully!');
}

// ===== Example 4: Automated PR Creation =====
async function createPullRequest(repoPath: string, title: string, body: string) {
  console.log('=== Creating Pull Request ===\n');
  
  const git = new GitAutomation(repoPath);
  
  // Get current branch
  const currentBranch = await git.getCurrentBranch();
  if (currentBranch === 'main' || currentBranch === 'master') {
    throw new Error('Cannot create PR from main branch');
  }
  
  // Push current branch
  console.log('Pushing current branch...');
  await git.push();
  
  // Create PR using GitHub CLI (gh)
  const prBody = `${body}

## Checklist
- [ ] Tests pass
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
`;

  try {
    const result = await git.$git`gh pr create --title ${title} --body ${prBody} --base main`;
    console.log('\n✅ Pull request created successfully!');
    console.log(result.stdout);
  } catch (error: any) {
    if (error.stderr.includes('already exists')) {
      console.log('ℹ️  Pull request already exists for this branch');
      const viewResult = await git.$git`gh pr view --web`;
    } else {
      throw error;
    }
  }
}

// ===== Example 5: Git Statistics =====
async function generateGitStats(repoPath: string) {
  console.log('=== Git Repository Statistics ===\n');
  
  const git = new GitAutomation(repoPath);
  
  // Repository info
  const repoInfo = await git.$git`git remote -v | head -1`;
  console.log(`Repository: ${repoInfo.stdout.trim()}`);
  
  // Commit statistics
  const totalCommits = await git.$git`git rev-list --count HEAD`;
  console.log(`\nTotal commits: ${totalCommits.stdout.trim()}`);
  
  // Contributors
  const contributors = await git.$git`git shortlog -sn --no-merges`;
  console.log('\nTop Contributors:');
  const topContributors = contributors.stdout.trim().split('\n').slice(0, 5);
  for (const contributor of topContributors) {
    console.log(`  ${contributor}`);
  }
  
  // File statistics
  const fileStats = await git.$git`
    git ls-files | xargs -n1 git blame --line-porcelain | 
    sed -n 's/^author //p' | sort | uniq -c | sort -nr | head -5
  `.nothrow();
  
  // Language statistics
  console.log('\nLanguage Distribution:');
  const extensions = await git.$git`
    git ls-files | sed -n 's/.*\\.//p' | sort | uniq -c | sort -nr | head -5
  `;
  console.log(extensions.stdout);
  
  // Recent activity
  console.log('\nRecent Activity (last 7 days):');
  const recentCommits = await git.$git`
    git log --since="7 days ago" --pretty=format:"%h - %an, %ar : %s" --abbrev-commit | head -10
  `;
  console.log(recentCommits.stdout);
  
  // Branch statistics
  const branches = await git.$git`git branch -r | wc -l`;
  console.log(`\nTotal remote branches: ${branches.stdout.trim()}`);
  
  // Tag statistics
  const tags = await git.$git`git tag | wc -l`;
  console.log(`Total tags: ${tags.stdout.trim()}`);
}

// ===== Main Demo Function =====
async function runDemo() {
  console.log('🚀 Git Automation Demo\n');
  
  // For demo purposes, we'll create a test repository
  const testRepo = '/tmp/git-automation-demo';
  
  console.log('Setting up demo repository...');
  await $`rm -rf ${testRepo}`.nothrow();
  await $`mkdir -p ${testRepo}`;
  await $`cd ${testRepo} && git init`;
  await $`cd ${testRepo} && echo "# Demo Repo" > README.md`;
  await $`cd ${testRepo} && git add . && git commit -m "Initial commit"`;
  
  // Create package.json for demo
  const packageJson = {
    name: 'git-automation-demo',
    version: '1.0.0',
    description: 'Demo repository for git automation'
  };
  await $`cd ${testRepo} && echo ${JSON.stringify(packageJson, null, 2)} > package.json`;
  
  const git = new GitAutomation(testRepo);
  
  // Demo: Check repository status
  console.log('\n1. Checking repository status...');
  const isRepo = await git.isGitRepo();
  console.log(`   Is Git repo: ${isRepo}`);
  
  const branch = await git.getCurrentBranch();
  console.log(`   Current branch: ${branch}`);
  
  const isClean = await git.isClean();
  console.log(`   Working directory clean: ${isClean}`);
  
  // Demo: Create a feature branch
  console.log('\n2. Creating feature branch...');
  await git.createBranch('feature/demo-feature');
  
  // Demo: Make changes and commit
  console.log('\n3. Making changes...');
  await $`cd ${testRepo} && echo "console.log('Hello, Git!');" > index.js`;
  await git.commit('feat', 'demo', 'add hello world script');
  
  // Demo: Setup git hooks
  console.log('\n4. Setting up Git hooks...');
  await setupGitHooks(testRepo);
  
  // Demo: Generate statistics
  console.log('\n5. Generating repository statistics...');
  await generateGitStats(testRepo);
  
  // Cleanup
  console.log('\n\nCleaning up demo repository...');
  await $`rm -rf ${testRepo}`;
  
  console.log('\n✅ Git automation demo completed!');
  console.log('\nYou can use these functions in your real repositories.');
  console.log('Remember to install GitHub CLI (gh) for PR creation features.');
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runDemo().catch(console.error);
}