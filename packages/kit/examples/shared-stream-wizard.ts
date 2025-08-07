#!/usr/bin/env node
/**
 * Example: Multi-step wizard using shared stream architecture
 * 
 * This example demonstrates the new shared stream capabilities
 * introduced in @xec-sh/kit v2.0.0
 */

import { 
  text, 
  select, 
  confirm, 
  multiselect,
  StreamHandler,
  TextPrompt,
  SelectPrompt,
  ConfirmPrompt
} from '../src/index.js';

// Create a shared stream for all prompts
const sharedStream = new StreamHandler({ shared: true });

interface WizardData {
  personalInfo: {
    name: string;
    email: string;
    phone?: string;
  };
  preferences: {
    theme: string;
    language: string;
    notifications: string[];
  };
  account: {
    username: string;
    plan: string;
    addOns: string[];
    terms: boolean;
  };
}

async function personalInfoStep(): Promise<WizardData['personalInfo']> {
  console.log('\n📝 Step 1: Personal Information\n');
  
  // All prompts share the same stream
  const namePrompt = new TextPrompt({
    message: 'Full name:',
    stream: sharedStream,
    validate: (value) => value.length > 0 ? undefined : 'Name is required'
  });
  
  const emailPrompt = new TextPrompt({
    message: 'Email address:',
    stream: sharedStream,
    validate: (value) => {
      if (!value.includes('@')) return 'Invalid email format';
      return undefined;
    }
  });
  
  const phonePrompt = new TextPrompt({
    message: 'Phone number (optional):',
    stream: sharedStream,
    placeholder: '+1 (555) 123-4567'
  });
  
  // Execute prompts in sequence
  const name = await namePrompt.prompt();
  const email = await emailPrompt.prompt();
  const phone = await phonePrompt.prompt();
  
  return {
    name: String(name),
    email: String(email),
    phone: phone ? String(phone) : undefined
  };
}

async function preferencesStep(name: string): Promise<WizardData['preferences']> {
  console.log(`\n⚙️ Step 2: Preferences for ${name}\n`);
  
  const themePrompt = new SelectPrompt({
    message: 'Choose your theme:',
    options: [
      { value: 'light', label: '☀️ Light' },
      { value: 'dark', label: '🌙 Dark' },
      { value: 'auto', label: '🔄 Auto (follows system)' }
    ],
    stream: sharedStream
  });
  
  const languagePrompt = new SelectPrompt({
    message: 'Preferred language:',
    options: [
      { value: 'en', label: 'English' },
      { value: 'es', label: 'Español' },
      { value: 'fr', label: 'Français' },
      { value: 'de', label: 'Deutsch' },
      { value: 'ja', label: '日本語' }
    ],
    stream: sharedStream
  });
  
  const theme = await themePrompt.prompt();
  const language = await languagePrompt.prompt();
  
  // Use multiselect with shared stream
  const notifications = await multiselect({
    message: 'Email notifications for:',
    options: [
      { value: 'updates', label: '📢 Product updates' },
      { value: 'tips', label: '💡 Tips & tricks' },
      { value: 'newsletter', label: '📰 Newsletter' },
      { value: 'offers', label: '🎁 Special offers' }
    ]
  });
  
  return {
    theme: String(theme),
    language: String(language),
    notifications: notifications as string[]
  };
}

async function accountStep(email: string): Promise<WizardData['account']> {
  console.log('\n👤 Step 3: Account Setup\n');
  
  const usernamePrompt = new TextPrompt({
    message: 'Choose a username:',
    stream: sharedStream,
    placeholder: email.split('@')[0],
    validate: async (value) => {
      // Simulate checking username availability
      if (!value) return 'Username is required';
      if (value.length < 3) return 'Username must be at least 3 characters';
      
      // Simulate async validation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Simulate some usernames being taken
      if (['admin', 'root', 'test'].includes(value.toLowerCase())) {
        return 'Username is already taken';
      }
      
      return undefined;
    }
  });
  
  const username = await usernamePrompt.prompt();
  
  const plan = await select({
    message: 'Select your plan:',
    options: [
      { value: 'free', label: '🆓 Free - Basic features' },
      { value: 'pro', label: '⭐ Pro - $9.99/month' },
      { value: 'enterprise', label: '🏢 Enterprise - Contact us' }
    ]
  });
  
  let addOns: string[] = [];
  if (plan !== 'free') {
    addOns = await multiselect({
      message: 'Select add-ons:',
      options: [
        { value: 'storage', label: '💾 Extra storage (+10GB)' },
        { value: 'support', label: '🤝 Priority support' },
        { value: 'analytics', label: '📊 Advanced analytics' },
        { value: 'api', label: '🔌 API access' }
      ]
    });
  }
  
  const terms = await confirm({
    message: 'Do you agree to the terms and conditions?'
  });
  
  if (!terms) {
    throw new Error('You must agree to the terms to continue');
  }
  
  return {
    username: String(username),
    plan: String(plan),
    addOns,
    terms: Boolean(terms)
  };
}

async function reviewStep(data: WizardData): Promise<boolean> {
  console.log('\n📋 Review Your Information\n');
  console.log('Personal Info:');
  console.log(`  Name: ${data.personalInfo.name}`);
  console.log(`  Email: ${data.personalInfo.email}`);
  if (data.personalInfo.phone) {
    console.log(`  Phone: ${data.personalInfo.phone}`);
  }
  
  console.log('\nPreferences:');
  console.log(`  Theme: ${data.preferences.theme}`);
  console.log(`  Language: ${data.preferences.language}`);
  console.log(`  Notifications: ${data.preferences.notifications.join(', ') || 'None'}`);
  
  console.log('\nAccount:');
  console.log(`  Username: ${data.account.username}`);
  console.log(`  Plan: ${data.account.plan}`);
  if (data.account.addOns.length > 0) {
    console.log(`  Add-ons: ${data.account.addOns.join(', ')}`);
  }
  
  const confirmPrompt = new ConfirmPrompt({
    message: 'Is everything correct?',
    stream: sharedStream
  });
  
  return Boolean(await confirmPrompt.prompt());
}

async function main() {
  console.log('🧙 Welcome to the Setup Wizard');
  console.log('================================');
  console.log('This wizard demonstrates shared stream architecture');
  console.log('Press Ctrl+C at any time to cancel\n');
  
  try {
    // Collect all information
    const personalInfo = await personalInfoStep();
    const preferences = await preferencesStep(personalInfo.name);
    const account = await accountStep(personalInfo.email);
    
    const wizardData: WizardData = {
      personalInfo,
      preferences,
      account
    };
    
    // Review and confirm
    const confirmed = await reviewStep(wizardData);
    
    if (confirmed) {
      console.log('\n✅ Setup Complete!');
      console.log('Your account has been created successfully.');
      
      // Demonstrate that the shared stream properly cleaned up
      console.log(`\nStream reference count: ${(sharedStream as any).refCount || 0}`);
      console.log('All resources properly released');
    } else {
      console.log('\n❌ Setup Cancelled');
      console.log('Please run the wizard again to complete setup.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cancelled')) {
      console.log('\n⚠️ Wizard cancelled by user');
    } else {
      console.error('\n❌ Setup failed:', error);
    }
  }
  
  process.exit(0);
}

// Handle errors
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

// Run the wizard
main();