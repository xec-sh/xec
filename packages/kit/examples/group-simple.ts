#!/usr/bin/env tsx
/**
 * Simple Group Component Example
 *
 * Quick demonstration of group component basics:
 * - Sequential prompts
 * - Accessing previous results
 * - Conditional prompts
 * - Cancel handling
 */

import picocolors from '../src/prism/index.js';
import { text, note, group, select, confirm, isCancel } from '../src/index.js';

async function main() {
  console.clear();
  console.log(picocolors.cyan('🏯 Group Component - Simple Example'));
  console.log(picocolors.gray('─'.repeat(40)));
  console.log();

  // Simple user onboarding flow
  const results = await group(
    {
      // Step 1: Get user's name
      name: () =>
        text({
          message: 'What is your name?',
          placeholder: 'John Doe',
          validate: (value) => {
            if (!value || value.trim().length < 2) {
              return 'Name must be at least 2 characters';
            }
            return undefined;
          },
        }),

      // Step 2: Get user's role
      role: () =>
        select({
          message: 'What is your role?',
          options: [
            { value: 'developer', label: 'Developer' },
            { value: 'designer', label: 'Designer' },
            { value: 'manager', label: 'Manager' },
            { value: 'other', label: 'Other' },
          ],
        }),

      // Step 3: Conditional - Ask for specific skills based on role
      skills: ({ results }) => {
        // Skip if no role selected
        if (!results.role) return;

        let skillOptions: { value: string; label: string }[] = [];

        switch (results.role) {
          case 'developer':
            skillOptions = [
              { value: 'javascript', label: 'JavaScript' },
              { value: 'python', label: 'Python' },
              { value: 'java', label: 'Java' },
              { value: 'go', label: 'Go' },
            ];
            break;
          case 'designer':
            skillOptions = [
              { value: 'figma', label: 'Figma' },
              { value: 'sketch', label: 'Sketch' },
              { value: 'photoshop', label: 'Photoshop' },
              { value: 'illustrator', label: 'Illustrator' },
            ];
            break;
          case 'manager':
            skillOptions = [
              { value: 'agile', label: 'Agile/Scrum' },
              { value: 'leadership', label: 'Leadership' },
              { value: 'communication', label: 'Communication' },
              { value: 'planning', label: 'Strategic Planning' },
            ];
            break;
          default:
            // For 'other', ask for custom input
            return text({
              message: 'Describe your main skill',
              placeholder: 'e.g., Marketing, Sales, etc.',
            });
        }

        return select({
          message: 'What is your primary skill?',
          options: skillOptions,
        });
      },

      // Step 4: Experience level
      experience: () =>
        select({
          message: 'Years of experience?',
          options: [
            { value: '0-1', label: '0-1 years' },
            { value: '2-5', label: '2-5 years' },
            { value: '5-10', label: '5-10 years' },
            { value: '10+', label: '10+ years' },
          ],
        }),

      // Step 5: Personalized message based on all previous answers
      subscribe: ({ results }) => {
        // Create a personalized message
        let message = `Hi ${results.name}!\n\n`;

        if (results.role === 'developer' && results.skills) {
          message += `As a ${results.skills} developer`;
        } else if (results.role === 'designer' && results.skills) {
          message += `As a ${results.skills} designer`;
        } else if (results.role === 'manager') {
          message += `As a manager`;
        } else {
          message += `As a professional`;
        }

        if (results.experience === '10+') {
          message += ' with extensive experience,';
        } else if (results.experience === '5-10') {
          message += ' with solid experience,';
        } else {
          message += ',';
        }

        message += ' would you like to receive our newsletter?';

        return confirm({
          message,
          initialValue: true,
        });
      },
    },
    {
      // Handle cancellation gracefully
      onCancel: ({ results }) => {
        console.log();
        console.log(picocolors.yellow('⚠ Process cancelled'));
        if (Object.keys(results).length > 0) {
          console.log(picocolors.gray('Data collected before cancellation:'));
          Object.entries(results).forEach(([key, value]) => {
            if (value !== 'canceled') {
              console.log(picocolors.gray(`  ${key}: ${value}`));
            }
          });
        }
        process.exit(0);
      },
    }
  );

  // Display results
  console.log();
  console.log(picocolors.green('✓ Onboarding complete!'));
  console.log();

  // Create a summary
  const summary = `
👤 Profile Summary
──────────────────
  Name: ${results.name}
  Role: ${results.role}
  Primary Skill: ${results.skills || 'Not specified'}
  Experience: ${results.experience} years
  Newsletter: ${results.subscribe ? 'Subscribed ✓' : 'Not subscribed'}
  `;

  note(summary, 'User Profile');

  console.log();
  console.log(picocolors.gray('Thank you for trying the group component!'));
  console.log();
}

// Run the example
main().catch((error) => {
  if (isCancel(error)) {
    console.log();
    console.log(picocolors.yellow('Cancelled'));
  } else {
    console.error(picocolors.red('Error:'), error);
  }
  process.exit(1);
});
