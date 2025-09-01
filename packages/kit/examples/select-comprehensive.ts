#!/usr/bin/env tsx
/**
 * Comprehensive Select Component Examples
 *
 * This example demonstrates all features and capabilities of the select component:
 * - Basic string options
 * - Options with custom labels
 * - Options with hints
 * - Number and boolean values
 * - Custom objects as values
 * - Initial value selection
 * - Limited visible items with scrolling
 * - Signal handling for cancellation
 * - Different styling states
 */

import { note , intro, outro, select, cancel, isCancel, prism as color } from '../src/index.js';


// Custom type for complex value demonstration
interface User {
  id: number;
  name: string;
  role: string;
  active: boolean;
}

// Custom type for nested data
interface Product {
  sku: string;
  name: string;
  price: number;
  category: {
    id: number;
    name: string;
  };
}

async function main() {
  console.clear();
  intro(color.bgCyan(color.black(' Select Component - Comprehensive Examples ')));

  // Example 1: Basic string options
  console.log(color.bold('\n📝 Example 1: Basic String Selection\n'));

  const fruit = await select({
    message: 'Pick your favorite fruit',
    options: [
      { value: 'apple' },
      { value: 'banana' },
      { value: 'orange' },
      { value: 'strawberry' },
      { value: 'watermelon' },
    ],
  });

  if (isCancel(fruit)) {
    cancel('Selection cancelled');
    process.exit(0);
  }

  note(`You selected: ${fruit}`, 'Your Choice');

  // Example 2: Options with custom labels
  console.log(color.bold('\n🏷️ Example 2: Custom Labels\n'));

  const color1 = await select({
    message: 'Choose a color theme',
    options: [
      { value: '#FF5733', label: '🔴 Sunset Red' },
      { value: '#33FF57', label: '🟢 Forest Green' },
      { value: '#3357FF', label: '🔵 Ocean Blue' },
      { value: '#FF33F5', label: '🟣 Royal Purple' },
      { value: '#FFD700', label: '🟡 Golden Yellow' },
      { value: '#000000', label: '⚫ Midnight Black' },
      { value: '#FFFFFF', label: '⚪ Pure White' },
    ],
  });

  if (!isCancel(color1)) {
    note(`Selected color code: ${color1}`, 'Color Theme');
  }

  // Example 3: Options with hints
  console.log(color.bold('\n💡 Example 3: Options with Hints\n'));

  const difficulty = await select({
    message: 'Select game difficulty',
    options: [
      { value: 'easy', label: 'Easy', hint: 'For beginners' },
      { value: 'normal', label: 'Normal', hint: 'Balanced challenge' },
      { value: 'hard', label: 'Hard', hint: 'For experienced players' },
      { value: 'expert', label: 'Expert', hint: 'Maximum difficulty' },
      { value: 'custom', label: 'Custom', hint: 'Configure your own' },
    ],
    initialValue: 'normal', // Set default selection
  });

  if (!isCancel(difficulty)) {
    note(`Difficulty set to: ${difficulty}`, 'Game Settings');
  }

  // Example 4: Number values
  console.log(color.bold('\n🔢 Example 4: Numeric Values\n'));

  const fontSize = await select({
    message: 'Choose font size',
    options: [
      { value: 12, label: '12px - Small', hint: 'Compact view' },
      { value: 14, label: '14px - Default', hint: 'Standard size' },
      { value: 16, label: '16px - Medium', hint: 'Better readability' },
      { value: 18, label: '18px - Large', hint: 'Enhanced visibility' },
      { value: 20, label: '20px - Extra Large', hint: 'Maximum size' },
    ],
    initialValue: 14,
  });

  if (!isCancel(fontSize)) {
    note(`Font size: ${fontSize}px`, 'Display Settings');
  }

  // Example 5: Boolean values
  console.log(color.bold('\n✅ Example 5: Boolean Values\n'));

  const darkMode = await select({
    message: 'Enable dark mode?',
    options: [
      { value: true, label: '🌙 Dark Mode', hint: 'Easy on the eyes' },
      { value: false, label: '☀️ Light Mode', hint: 'Classic bright theme' },
    ],
  });

  if (!isCancel(darkMode)) {
    note(`Dark mode: ${darkMode ? 'Enabled' : 'Disabled'}`, 'Theme Settings');
  }

  // Example 6: Complex object values
  console.log(color.bold('\n👤 Example 6: Complex Objects\n'));

  const users: User[] = [
    { id: 1, name: 'Alice Johnson', role: 'Admin', active: true },
    { id: 2, name: 'Bob Smith', role: 'Developer', active: true },
    { id: 3, name: 'Charlie Brown', role: 'Designer', active: false },
    { id: 4, name: 'Diana Prince', role: 'Manager', active: true },
    { id: 5, name: 'Eve Adams', role: 'Analyst', active: true },
  ];

  const selectedUser = await select<User>({
    message: 'Select a user',
    options: users.map((user) => ({
      value: user,
      label: `${user.name} (${user.role})`,
      hint: user.active ? 'Active' : 'Inactive',
    })),
  });

  if (!isCancel(selectedUser)) {
    note(
      `Selected: ${selectedUser.name}\n` +
        `Role: ${selectedUser.role}\n` +
        `ID: ${selectedUser.id}\n` +
        `Status: ${selectedUser.active ? 'Active' : 'Inactive'}`,
      'User Details'
    );
  }

  // Example 7: Nested object values
  console.log(color.bold('\n📦 Example 7: Nested Data Structures\n'));

  const products: Product[] = [
    {
      sku: 'LAPTOP-001',
      name: 'Pro Laptop',
      price: 1299,
      category: { id: 1, name: 'Electronics' },
    },
    { sku: 'PHONE-002', name: 'Smart Phone', price: 899, category: { id: 1, name: 'Electronics' } },
    { sku: 'BOOK-003', name: 'TypeScript Guide', price: 49, category: { id: 2, name: 'Books' } },
    {
      sku: 'MOUSE-004',
      name: 'Wireless Mouse',
      price: 29,
      category: { id: 1, name: 'Electronics' },
    },
    {
      sku: 'COURSE-005',
      name: 'Node.js Course',
      price: 199,
      category: { id: 3, name: 'Education' },
    },
  ];

  const selectedProduct = await select<Product>({
    message: 'Select a product',
    options: products.map((product) => ({
      value: product,
      label: `${product.name} - $${product.price}`,
      hint: product.category.name,
    })),
  });

  if (!isCancel(selectedProduct)) {
    note(
      `Product: ${selectedProduct.name}\n` +
        `SKU: ${selectedProduct.sku}\n` +
        `Price: $${selectedProduct.price}\n` +
        `Category: ${selectedProduct.category.name}`,
      'Product Selected'
    );
  }

  // Example 8: Limited visible items (scrolling)
  console.log(color.bold('\n📜 Example 8: Scrollable List (Limited Items)\n'));

  const countries = [
    'United States',
    'Canada',
    'Mexico',
    'Brazil',
    'Argentina',
    'United Kingdom',
    'France',
    'Germany',
    'Italy',
    'Spain',
    'Russia',
    'China',
    'Japan',
    'India',
    'Australia',
    'South Africa',
    'Egypt',
    'Nigeria',
    'Kenya',
    'Morocco',
  ];

  const country = await select({
    message: 'Select your country (scroll with arrow keys)',
    options: countries.map((c) => ({ value: c })),
    maxItems: 7, // Show only 7 items at a time
  });

  if (!isCancel(country)) {
    note(`Selected country: ${country}`, 'Location');
  }

  // Example 9: Mixed option types demonstration
  console.log(color.bold('\n🎨 Example 9: Mixed Options with Different Formats\n'));

  const setting = await select({
    message: 'Configure application setting',
    options: [
      { value: 'auto', label: '🤖 Automatic', hint: 'Let the system decide' },
      { value: 'high', label: '🚀 High Performance', hint: 'Maximum speed' },
      { value: 'balanced', label: '⚖️ Balanced', hint: 'Optimal for most users' },
      { value: 'eco', label: '🌱 Eco Mode', hint: 'Save battery' },
      { value: 'custom', label: '⚙️ Custom Configuration', hint: 'Advanced users only' },
    ],
    initialValue: 'balanced',
  });

  if (!isCancel(setting)) {
    note(`Performance mode: ${setting}`, 'System Configuration');
  }

  // Example 10: Dynamic options based on conditions
  console.log(color.bold('\n🔄 Example 10: Dynamic Options\n'));

  const timeOfDay = new Date().getHours();
  const mealOptions = [];

  if (timeOfDay < 11) {
    mealOptions.push(
      { value: 'breakfast', label: '🍳 Breakfast', hint: 'Start your day right' },
      { value: 'brunch', label: '🥐 Brunch', hint: 'Late morning meal' }
    );
  } else if (timeOfDay < 17) {
    mealOptions.push(
      { value: 'lunch', label: '🥗 Lunch', hint: 'Midday meal' },
      { value: 'snack', label: '🍿 Snack', hint: 'Light bite' }
    );
  } else {
    mealOptions.push(
      { value: 'dinner', label: '🍽️ Dinner', hint: 'Evening meal' },
      { value: 'dessert', label: '🍰 Dessert', hint: 'Sweet treat' }
    );
  }

  const meal = await select({
    message: 'What would you like to have?',
    options: mealOptions,
  });

  if (!isCancel(meal)) {
    note(`Preparing: ${meal}`, 'Order Confirmed');
  }

  // Example 11: Error handling with signal
  console.log(color.bold('\n⚡ Example 11: Abortable Selection\n'));

  const controller = new AbortController();

  // Simulate timeout
  const timeout = setTimeout(() => {
    controller.abort();
  }, 10000); // 10 second timeout

  try {
    const urgentChoice = await select({
      message: 'Make a quick decision (10 second timeout)',
      options: [
        { value: 'yes', label: '✅ Yes', hint: 'Confirm action' },
        { value: 'no', label: '❌ No', hint: 'Cancel action' },
        { value: 'maybe', label: '🤔 Maybe', hint: 'Need more time' },
      ],
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!isCancel(urgentChoice)) {
      note(`Decision: ${urgentChoice}`, 'Choice Made');
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      cancel('Selection timed out!');
    } else {
      throw error;
    }
  }

  // Final summary
  outro(color.green('✨ All examples completed successfully!'));
}

// Run the examples
main().catch((error) => {
  console.error(color.red('Error:'), error);
  process.exit(1);
});
