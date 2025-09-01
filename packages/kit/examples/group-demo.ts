#!/usr/bin/env tsx
/**
 * Group Component Comprehensive Demo
 *
 * This example demonstrates all features of the group component:
 * - Sequential prompts with access to previous results
 * - Dynamic prompts based on previous answers
 * - Conditional prompts
 * - Cancel handling
 * - Result validation and transformation
 * - Various prompt types in a group
 */

import picocolors from 'picocolors';

import {
  text,
  note,
  group,
  select,
  confirm,
  spinner,
  password,
  isCancel,
  multiselect,
} from '../src/index.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.clear();
  console.log(picocolors.cyan('🎯 Group Component Comprehensive Demo'));
  console.log(picocolors.gray('─'.repeat(50)));
  console.log();

  // Example 1: Basic group with sequential prompts
  console.log(picocolors.yellow('📝 Example 1: Basic User Registration'));
  console.log();

  const userRegistration = await group(
    {
      // Simple text input
      username: () =>
        text({
          message: 'Choose a username',
          placeholder: 'johndoe',
          validate: (value) => {
            if (!value || value.length < 3) return 'Username must be at least 3 characters';
            if (!value || !/^[a-zA-Z0-9_]+$/.test(value))
              return 'Username can only contain letters, numbers, and underscores';
            return undefined;
          },
        }),

      // Email with validation
      email: () =>
        text({
          message: 'Enter your email',
          placeholder: 'user@example.com',
          validate: (value) => {
            if (!value || !value.includes('@')) return 'Please enter a valid email';
            return undefined;
          },
        }),

      // Password input
      password: () =>
        password({
          message: 'Create a password',
          validate: (value) => {
            if (!value || value.length < 8) return 'Password must be at least 8 characters';
            return undefined;
          },
        }),

      // Confirm password with access to previous password
      confirmPassword: ({ results }) => {
        // Skip if password was not provided
        if (!results.password) return;

        return password({
          message: 'Confirm your password',
          validate: (value) => {
            if (!value || value !== results.password) {
              return 'Passwords do not match';
            }
            return undefined;
          },
        });
      },

      // Terms acceptance
      acceptTerms: () =>
        confirm({
          message: 'Do you accept the terms and conditions?',
        }),
    },
    {
      // Handle cancellation
      onCancel: ({ results }) => {
        console.log();
        console.log(picocolors.red('✗ Registration cancelled'));
        console.log(picocolors.gray('Partial results collected:'));
        Object.entries(results).forEach(([key, value]) => {
          if (value !== 'canceled') {
            console.log(picocolors.gray(`  ${key}: ${value}`));
          }
        });
      },
    }
  );

  if (userRegistration.acceptTerms) {
    console.log();
    console.log(picocolors.green('✓ Registration successful!'));
    console.log(picocolors.gray('User details:'));
    console.log(`  Username: ${userRegistration.username}`);
    console.log(`  Email: ${userRegistration.email}`);
  }

  console.log();
  console.log(picocolors.gray('─'.repeat(50)));
  console.log();

  // Example 2: Dynamic survey with conditional questions
  console.log(picocolors.yellow('📊 Example 2: Dynamic Survey with Conditional Logic'));
  console.log();

  const survey = await group(
    {
      // User type selection
      userType: () =>
        select({
          message: 'What type of user are you?',
          options: [
            { value: 'developer', label: '👨‍💻 Developer' },
            { value: 'designer', label: '🎨 Designer' },
            { value: 'manager', label: '📊 Manager' },
            { value: 'other', label: '🤷 Other' },
          ],
        }),

      // Conditional: Only for developers
      languages: ({ results }) => {
        if (results.userType !== 'developer') return;

        return multiselect({
          message: 'Which programming languages do you use?',
          options: [
            { value: 'javascript', label: 'JavaScript' },
            { value: 'typescript', label: 'TypeScript' },
            { value: 'python', label: 'Python' },
            { value: 'rust', label: 'Rust' },
            { value: 'go', label: 'Go' },
            { value: 'java', label: 'Java' },
            { value: 'csharp', label: 'C#' },
          ],
          required: true,
        });
      },

      // Conditional: Only for designers
      designTools: ({ results }) => {
        if (results.userType !== 'designer') return;

        return multiselect({
          message: 'Which design tools do you use?',
          options: [
            { value: 'figma', label: 'Figma' },
            { value: 'sketch', label: 'Sketch' },
            { value: 'adobe-xd', label: 'Adobe XD' },
            { value: 'photoshop', label: 'Photoshop' },
            { value: 'illustrator', label: 'Illustrator' },
          ],
        });
      },

      // Conditional: Only for managers
      teamSize: ({ results }) => {
        if (results.userType !== 'manager') return;

        return select({
          message: 'How large is your team?',
          options: [
            { value: 'small', label: '1-5 people' },
            { value: 'medium', label: '6-20 people' },
            { value: 'large', label: '21-50 people' },
            { value: 'enterprise', label: '50+ people' },
          ],
        });
      },

      // Conditional: For "other" users
      otherDescription: ({ results }) => {
        if (results.userType !== 'other') return;

        return text({
          message: 'Please describe your role',
          placeholder: 'I am a...',
        });
      },

      // Experience level - for everyone
      experience: () =>
        select({
          message: 'How many years of experience do you have?',
          options: [
            { value: 'junior', label: '0-2 years' },
            { value: 'mid', label: '3-5 years' },
            { value: 'senior', label: '6-10 years' },
            { value: 'expert', label: '10+ years' },
          ],
        }),

      // Dynamic follow-up based on experience
      mentoring: ({ results }) => {
        // Only ask senior/expert users about mentoring
        if (results.experience === 'junior' || results.experience === 'mid') {
          return;
        }

        return confirm({
          message: 'Are you interested in mentoring junior developers?',
        });
      },

      // Newsletter subscription
      newsletter: () =>
        confirm({
          message: 'Would you like to subscribe to our newsletter?',
          initialValue: true,
        }),

      // Conditional: Only if subscribing to newsletter
      emailFrequency: ({ results }) => {
        if (!results.newsletter) return;

        return select({
          message: 'How often would you like to receive emails?',
          options: [
            { value: 'daily', label: 'Daily' },
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
          ],
        });
      },
    },
    {
      onCancel: ({ results }) => {
        console.log();
        console.log(picocolors.yellow('⚠ Survey cancelled'));
        console.log(picocolors.gray(`Completed ${Object.keys(results).length} questions`));
      },
    }
  );

  // Display survey results
  console.log();
  console.log(picocolors.green('✓ Survey completed!'));
  console.log(picocolors.gray('Results:'));
  console.log(survey);

  console.log();
  console.log(picocolors.gray('─'.repeat(50)));
  console.log();

  // Example 3: Project setup wizard with async operations
  console.log(picocolors.yellow('🚀 Example 3: Project Setup Wizard'));
  console.log();

  const projectSetup = await group(
    {
      // Project name
      projectName: () =>
        text({
          message: 'What is your project name?',
          placeholder: 'my-awesome-project',
          validate: (value) => {
            if (!value || !/^[a-z0-9-]+$/.test(value)) {
              return 'Project name can only contain lowercase letters, numbers, and hyphens';
            }
            return undefined;
          },
        }),

      // Project type
      projectType: () =>
        select({
          message: 'What type of project is this?',
          options: [
            { value: 'web', label: '🌐 Web Application' },
            { value: 'api', label: '🔌 API Server' },
            { value: 'cli', label: '⌨️ CLI Tool' },
            { value: 'library', label: '📚 Library' },
          ],
        }),

      // Framework selection based on project type
      framework: ({ results }) => {
        if (!results.projectType) return;

        let options: { value: string; label: string }[] = [];

        switch (results.projectType) {
          case 'web':
            options = [
              { value: 'react', label: 'React' },
              { value: 'vue', label: 'Vue' },
              { value: 'angular', label: 'Angular' },
              { value: 'svelte', label: 'Svelte' },
              { value: 'vanilla', label: 'Vanilla JS' },
            ];
            break;
          case 'api':
            options = [
              { value: 'express', label: 'Express' },
              { value: 'fastify', label: 'Fastify' },
              { value: 'nestjs', label: 'NestJS' },
              { value: 'koa', label: 'Koa' },
            ];
            break;
          case 'cli':
            options = [
              { value: 'commander', label: 'Commander.js' },
              { value: 'yargs', label: 'Yargs' },
              { value: 'oclif', label: 'OCLIF' },
              { value: 'none', label: 'No framework' },
            ];
            break;
          case 'library':
            return; // No framework selection for libraries
        }

        return select({
          message: 'Choose a framework',
          options,
        });
      },

      // TypeScript option
      useTypeScript: () =>
        confirm({
          message: 'Do you want to use TypeScript?',
          initialValue: true,
        }),

      // Features selection
      features: ({ results }) => {
        const features: { value: string; label: string; hint?: string }[] = [];

        // Add relevant features based on project type
        if (results.projectType === 'web' || results.projectType === 'api') {
          features.push(
            { value: 'auth', label: 'Authentication', hint: 'User login/signup' },
            { value: 'db', label: 'Database', hint: 'Data persistence' },
            { value: 'tests', label: 'Testing', hint: 'Unit and integration tests' }
          );
        }

        if (results.projectType === 'web') {
          features.push(
            { value: 'routing', label: 'Routing', hint: 'Page navigation' },
            { value: 'state', label: 'State Management', hint: 'Global state' },
            { value: 'ui', label: 'UI Library', hint: 'Component library' }
          );
        }

        if (results.projectType === 'api') {
          features.push(
            { value: 'swagger', label: 'API Documentation', hint: 'Swagger/OpenAPI' },
            { value: 'validation', label: 'Input Validation', hint: 'Request validation' },
            { value: 'rate-limit', label: 'Rate Limiting', hint: 'API rate limits' }
          );
        }

        if (features.length === 0) return;

        return multiselect({
          message: 'Select features to include',
          options: features,
        });
      },

      // Database selection if database feature is selected
      database: ({ results }) => {
        if (!results.features || !Array.isArray(results.features) || !results.features.includes('db')) return;

        return select({
          message: 'Choose a database',
          options: [
            { value: 'postgres', label: 'PostgreSQL' },
            { value: 'mysql', label: 'MySQL' },
            { value: 'mongodb', label: 'MongoDB' },
            { value: 'sqlite', label: 'SQLite' },
          ],
        });
      },

      // Git initialization
      initGit: () =>
        confirm({
          message: 'Initialize a git repository?',
          initialValue: true,
        }),

      // Install dependencies
      installDeps: () =>
        confirm({
          message: 'Install dependencies now?',
          initialValue: false,
        }),

      // Simulate installation with spinner
      installation: async ({ results }) => {
        if (!results.installDeps) return;

        const s = spinner();
        s.start('Installing dependencies');

        // Simulate installation steps
        await sleep(1000);
        s.message('Installing core dependencies...');
        await sleep(1000);

        if (results.useTypeScript) {
          s.message('Setting up TypeScript...');
          await sleep(800);
        }

        if (Array.isArray(results.features) && results.features.includes('tests')) {
          s.message('Setting up testing framework...');
          await sleep(800);
        }

        s.stop('Dependencies installed successfully!');

        return true;
      },
    },
    {
      onCancel: ({ results }) => {
        console.log();
        console.log(picocolors.red('✗ Project setup cancelled'));
        if (Object.keys(results).length > 0) {
          console.log(picocolors.gray('Configuration so far:'));
          console.log(results);
        }
      },
    }
  );

  // Generate project summary
  if (projectSetup.projectName) {
    console.log();
    console.log(picocolors.green('✓ Project setup complete!'));
    console.log();
    note(
      `Project: ${projectSetup.projectName}\n` +
        `Type: ${projectSetup.projectType}\n` +
        `Framework: ${projectSetup.framework || 'None'}\n` +
        `TypeScript: ${projectSetup.useTypeScript ? 'Yes' : 'No'}\n` +
        `Features: ${Array.isArray(projectSetup.features) ? projectSetup.features.join(', ') : 'None'}\n` +
        `Database: ${projectSetup.database || 'None'}\n` +
        `Git: ${projectSetup.initGit ? 'Initialized' : 'Not initialized'}`,
      'Project Configuration'
    );
  }

  console.log();
  console.log(picocolors.gray('─'.repeat(50)));
  console.log();

  // Example 4: Complex validation with inter-field dependencies
  console.log(picocolors.yellow('🔐 Example 4: Complex Form with Validation'));
  console.log();

  const complexForm = await group({
    // Start date
    startDate: () =>
      text({
        message: 'Enter start date (YYYY-MM-DD)',
        placeholder: '2024-01-01',
        validate: (value) => {
          if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return 'Please enter date in YYYY-MM-DD format';
          }
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            return 'Invalid date';
          }
          return undefined;
        },
      }),

    // End date with validation against start date
    endDate: ({ results }) => {
      if (!results.startDate) return;

      return text({
        message: 'Enter end date (YYYY-MM-DD)',
        placeholder: '2024-12-31',
        validate: (value) => {
          if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return 'Please enter date in YYYY-MM-DD format';
          }
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            return 'Invalid date';
          }
          if (results.startDate) {
            const startDate = new Date(results.startDate);
            if (date <= startDate) {
              return 'End date must be after start date';
            }
          }
          return undefined;
        },
      });
    },

    // Budget amount
    budget: () =>
      text({
        message: 'Enter budget amount',
        placeholder: '10000',
        validate: (value) => {
          if (!value) return 'Please enter a budget amount';
          const num = parseFloat(value);
          if (isNaN(num) || num <= 0) {
            return 'Please enter a valid positive number';
          }
          return undefined;
        },
      }),

    // Budget allocation based on total budget
    allocations: ({ results }) => {
      if (!results.budget) return;

      const totalBudget = parseFloat(results.budget);

      return multiselect({
        message: `How would you like to allocate $${totalBudget}?`,
        options: [
          { value: 'marketing', label: `Marketing (30% = $${(totalBudget * 0.3).toFixed(2)})` },
          { value: 'development', label: `Development (40% = $${(totalBudget * 0.4).toFixed(2)})` },
          { value: 'operations', label: `Operations (20% = $${(totalBudget * 0.2).toFixed(2)})` },
          { value: 'reserve', label: `Reserve (10% = $${(totalBudget * 0.1).toFixed(2)})` },
        ],
      });
    },

    // Priority based on allocations
    priority: ({ results }) => {
      if (!results.allocations || !Array.isArray(results.allocations) || results.allocations.length === 0) return;

      return select({
        message: 'Which allocation has the highest priority?',
        options: (Array.isArray(results.allocations) ? results.allocations : []).map((alloc: any) => ({
          value: alloc,
          label: alloc.charAt(0).toUpperCase() + alloc.slice(1),
        })),
      });
    },

    // Final confirmation with summary
    confirm: ({ results }) => {
      const summary = `
          Start: ${results.startDate}
          End: ${results.endDate}
          Budget: $${results.budget}
          Allocations: ${Array.isArray(results.allocations) ? results.allocations.join(', ') : 'None'}
          Priority: ${results.priority || 'None'}
        `;

      return confirm({
        message: `Confirm this configuration?\n${summary}`,
      });
    },
  });

  if (complexForm.confirm) {
    console.log();
    console.log(picocolors.green('✓ Configuration saved!'));
  }

  console.log();
  console.log(picocolors.cyan('🎉 All examples completed!'));
  console.log();
}

// Run the demo
main().catch((error) => {
  if (isCancel(error)) {
    console.log();
    console.log(picocolors.yellow('⚠ Demo cancelled'));
  } else {
    console.error(picocolors.red('Error:'), error);
  }
  process.exit(1);
});
