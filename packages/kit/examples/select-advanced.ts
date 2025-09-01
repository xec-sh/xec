#!/usr/bin/env tsx
/**
 * Advanced Select Component Examples
 *
 * This example demonstrates advanced usage patterns:
 * - Async data loading
 * - Option filtering and search
 * - Grouped options
 * - Custom formatting
 * - State management
 * - Multi-step selections
 */

import { setTimeout } from 'node:timers/promises';

import { note , intro, outro, select, cancel, spinner, confirm, isCancel, prism as color } from '../src/index.js';

// Simulate API types
interface ApiUser {
  id: number;
  name: string;
  email: string;
  company: {
    name: string;
  };
}

interface GitHubRepo {
  name: string;
  full_name: string;
  description: string;
  stargazers_count: number;
  language: string;
}

// Simulate async data fetching
async function fetchUsers(): Promise<ApiUser[]> {
  await setTimeout(1000); // Simulate network delay
  return [
    {
      id: 1,
      name: 'Leanne Graham',
      email: 'leanne@example.com',
      company: { name: 'Romaguera-Crona' },
    },
    { id: 2, name: 'Ervin Howell', email: 'ervin@example.com', company: { name: 'Deckow-Crist' } },
    {
      id: 3,
      name: 'Clementine Bauch',
      email: 'clementine@example.com',
      company: { name: 'Romaguera-Jacobson' },
    },
    {
      id: 4,
      name: 'Patricia Lebsack',
      email: 'patricia@example.com',
      company: { name: 'Robel-Corkery' },
    },
    {
      id: 5,
      name: 'Chelsey Dietrich',
      email: 'chelsey@example.com',
      company: { name: 'Keebler LLC' },
    },
  ];
}

async function fetchRepos(): Promise<GitHubRepo[]> {
  await setTimeout(800);
  return [
    {
      name: 'react',
      full_name: 'facebook/react',
      description: 'A declarative UI library',
      stargazers_count: 200000,
      language: 'JavaScript',
    },
    {
      name: 'vue',
      full_name: 'vuejs/vue',
      description: 'Progressive framework',
      stargazers_count: 180000,
      language: 'JavaScript',
    },
    {
      name: 'angular',
      full_name: 'angular/angular',
      description: 'Platform for web apps',
      stargazers_count: 85000,
      language: 'TypeScript',
    },
    {
      name: 'svelte',
      full_name: 'sveltejs/svelte',
      description: 'Compile-time framework',
      stargazers_count: 70000,
      language: 'JavaScript',
    },
    {
      name: 'solid',
      full_name: 'solidjs/solid',
      description: 'Reactive UI library',
      stargazers_count: 28000,
      language: 'TypeScript',
    },
    {
      name: 'qwik',
      full_name: 'BuilderIO/qwik',
      description: 'Resumable framework',
      stargazers_count: 18000,
      language: 'TypeScript',
    },
    {
      name: 'alpine',
      full_name: 'alpinejs/alpine',
      description: 'Rugged framework',
      stargazers_count: 25000,
      language: 'JavaScript',
    },
    {
      name: 'lit',
      full_name: 'lit/lit',
      description: 'Web Components library',
      stargazers_count: 15000,
      language: 'TypeScript',
    },
  ];
}

async function main() {
  console.clear();
  intro(color.bgMagenta(color.white(' Advanced Select Examples ')));

  // Example 1: Async data loading with spinner
  console.log(color.bold('\n🔄 Example 1: Async Data Loading\n'));

  const s1 = spinner();
  s1.start('Loading users from API...');

  const users = await fetchUsers();
  s1.stop('Users loaded successfully');

  const selectedUser = await select<ApiUser>({
    message: 'Select a user from the API',
    options: users.map((user) => ({
      value: user,
      label: user.name,
      hint: `${user.email} - ${user.company.name}`,
    })),
  });

  if (!isCancel(selectedUser)) {
    note(
      `Name: ${selectedUser.name}\n` +
        `Email: ${selectedUser.email}\n` +
        `Company: ${selectedUser.company.name}`,
      'Selected User'
    );
  }

  // Example 2: Grouped options by category
  console.log(color.bold('\n📁 Example 2: Categorized Options\n'));

  const s2 = spinner();
  s2.start('Loading repositories...');

  const repos = await fetchRepos();
  s2.stop('Repositories loaded');

  // Group by language
  const jsRepos = repos.filter((r) => r.language === 'JavaScript');
  const tsRepos = repos.filter((r) => r.language === 'TypeScript');

  // First select category
  const category = await select({
    message: 'Select a category',
    options: [
      { value: 'js', label: `JavaScript (${jsRepos.length} repos)`, hint: 'Dynamic typing' },
      { value: 'ts', label: `TypeScript (${tsRepos.length} repos)`, hint: 'Static typing' },
      { value: 'all', label: 'All Repositories', hint: 'Show everything' },
    ],
  });

  if (isCancel(category)) {
    cancel('Selection cancelled');
    process.exit(0);
  }

  // Then select from filtered list
  const repoOptions = category === 'js' ? jsRepos : category === 'ts' ? tsRepos : repos;

  const selectedRepo = await select<GitHubRepo>({
    message: 'Select a repository',
    options: repoOptions.map((repo) => ({
      value: repo,
      label: `${repo.name} ⭐ ${repo.stargazers_count.toLocaleString()}`,
      hint: repo.description,
    })),
    maxItems: 5,
  });

  if (!isCancel(selectedRepo)) {
    note(
      `Repository: ${selectedRepo.full_name}\n` +
        `Description: ${selectedRepo.description}\n` +
        `Language: ${selectedRepo.language}\n` +
        `Stars: ${selectedRepo.stargazers_count.toLocaleString()}`,
      'Repository Details'
    );
  }

  // Example 3: Multi-step configuration wizard
  console.log(color.bold('\n🧙 Example 3: Configuration Wizard\n'));

  // Step 1: Select environment
  const environment = await select({
    message: 'Select deployment environment',
    options: [
      { value: 'dev', label: '🔧 Development', hint: 'Local development' },
      { value: 'staging', label: '🎭 Staging', hint: 'Pre-production testing' },
      { value: 'prod', label: '🚀 Production', hint: 'Live environment' },
    ],
  });

  if (isCancel(environment)) {
    cancel('Setup cancelled');
    process.exit(0);
  }

  // Step 2: Select region based on environment
  const regions =
    environment === 'dev'
      ? [
          { value: 'local', label: '💻 Local', hint: 'localhost' },
          { value: 'docker', label: '🐳 Docker', hint: 'Containerized' },
        ]
      : [
          { value: 'us-east-1', label: '🇺🇸 US East', hint: 'Virginia' },
          { value: 'us-west-2', label: '🇺🇸 US West', hint: 'Oregon' },
          { value: 'eu-west-1', label: '🇪🇺 EU West', hint: 'Ireland' },
          { value: 'ap-southeast-1', label: '🇸🇬 Asia Pacific', hint: 'Singapore' },
        ];

  const region = await select({
    message: 'Select deployment region',
    options: regions,
  });

  if (isCancel(region)) {
    cancel('Setup cancelled');
    process.exit(0);
  }

  // Step 3: Select instance type based on environment
  const instanceTypes =
    environment === 'prod'
      ? [
          { value: 't3.large', label: 'Large', hint: '2 vCPU, 8 GB RAM' },
          { value: 't3.xlarge', label: 'Extra Large', hint: '4 vCPU, 16 GB RAM' },
          { value: 't3.2xlarge', label: '2x Extra Large', hint: '8 vCPU, 32 GB RAM' },
        ]
      : [
          { value: 't3.micro', label: 'Micro', hint: '2 vCPU, 1 GB RAM' },
          { value: 't3.small', label: 'Small', hint: '2 vCPU, 2 GB RAM' },
          { value: 't3.medium', label: 'Medium', hint: '2 vCPU, 4 GB RAM' },
        ];

  const instance = await select({
    message: 'Select instance type',
    options: instanceTypes,
  });

  if (!isCancel(instance)) {
    note(
      `Environment: ${environment}\n` + `Region: ${region}\n` + `Instance: ${instance}`,
      'Deployment Configuration'
    );
  }

  // Example 4: Time-based options
  console.log(color.bold('\n⏰ Example 4: Time-based Selection\n'));

  const now = new Date();
  const timeSlots = [];

  for (let i = 0; i < 8; i++) {
    const slotTime = new Date(now.getTime() + i * 30 * 60000); // 30 min intervals
    const hours = slotTime.getHours().toString().padStart(2, '0');
    const minutes = slotTime.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    let availability = 'Available';
    let icon = '✅';

    // Simulate some slots being busy
    if (i === 2 || i === 5) {
      availability = 'Busy';
      icon = '❌';
    } else if (i === 3) {
      availability = 'Limited';
      icon = '⚠️';
    }

    timeSlots.push({
      value: timeStr,
      label: `${icon} ${timeStr}`,
      hint: availability,
    });
  }

  const appointment = await select({
    message: 'Select appointment time',
    options: timeSlots,
    maxItems: 5,
  });

  if (!isCancel(appointment)) {
    note(`Appointment scheduled for: ${appointment}`, 'Booking Confirmed');
  }

  // Example 5: Dynamic pricing options
  console.log(color.bold('\n💰 Example 5: Pricing Plans\n'));

  interface PricingPlan {
    id: string;
    name: string;
    price: number;
    features: string[];
    recommended?: boolean;
  }

  const plans: PricingPlan[] = [
    { id: 'free', name: 'Free', price: 0, features: ['Basic features', '10 projects'] },
    {
      id: 'starter',
      name: 'Starter',
      price: 9,
      features: ['All Free features', '50 projects', 'Email support'],
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 29,
      features: [
        'All Starter features',
        'Unlimited projects',
        'Priority support',
        'Advanced analytics',
      ],
      recommended: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 99,
      features: ['All Pro features', 'Custom integrations', 'Dedicated support', 'SLA'],
    },
  ];

  const selectedPlan = await select<PricingPlan>({
    message: 'Choose your pricing plan',
    options: plans.map((plan) => ({
      value: plan,
      label: plan.recommended
        ? `⭐ ${plan.name} - $${plan.price}/mo (RECOMMENDED)`
        : `${plan.name} - $${plan.price}/mo`,
      hint: `${plan.features.length} features`,
    })),
  });

  if (!isCancel(selectedPlan)) {
    note(
      `Plan: ${selectedPlan.name}\n` +
        `Price: $${selectedPlan.price}/month\n` +
        `Features:\n${selectedPlan.features.map((f) => `  • ${f}`).join('\n')}`,
      'Selected Plan'
    );

    // Confirm selection
    const confirmed = await confirm({
      message: `Proceed with ${selectedPlan.name} plan ($${selectedPlan.price}/mo)?`,
    });

    if (confirmed) {
      note('Subscription activated!', 'Success');
    } else {
      note('Subscription cancelled', 'Cancelled');
    }
  }

  // Example 6: Search simulation
  console.log(color.bold('\n🔍 Example 6: Searchable List\n'));

  const searchTerms = [
    'TypeScript',
    'JavaScript',
    'React',
    'Vue',
    'Angular',
    'Svelte',
    'Node.js',
    'Deno',
    'Bun',
    'Express',
    'Fastify',
    'NestJS',
    'PostgreSQL',
    'MongoDB',
    'Redis',
    'MySQL',
    'SQLite',
    'DynamoDB',
    'Docker',
    'Kubernetes',
    'AWS',
    'Azure',
    'Google Cloud',
    'Vercel',
  ];

  // Simulate search by showing filtered results
  const searchCategory = await select({
    message: 'Select technology category',
    options: [
      { value: 'frontend', label: '🎨 Frontend', hint: 'UI frameworks' },
      { value: 'backend', label: '⚙️ Backend', hint: 'Server technologies' },
      { value: 'database', label: '💾 Database', hint: 'Data storage' },
      { value: 'devops', label: '🚀 DevOps', hint: 'Deployment & operations' },
    ],
  });

  if (!isCancel(searchCategory)) {
    const filtered =
      searchCategory === 'frontend'
        ? searchTerms.slice(0, 6)
        : searchCategory === 'backend'
          ? searchTerms.slice(6, 12)
          : searchCategory === 'database'
            ? searchTerms.slice(12, 18)
            : searchTerms.slice(18, 24);

    const tech = await select({
      message: `Select a ${searchCategory} technology`,
      options: filtered.map((t) => ({ value: t })),
      maxItems: 5,
    });

    if (!isCancel(tech)) {
      note(`Selected technology: ${tech}`, 'Technology Stack');
    }
  }

  // Final summary
  outro(color.cyan('🎉 Advanced examples completed!'));
}

// Run the examples
main().catch((error) => {
  console.error(color.red('Error:'), error);
  process.exit(1);
});
