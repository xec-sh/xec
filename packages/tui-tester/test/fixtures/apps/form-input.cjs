#!/usr/bin/env node

// Form input app for testing text input and forms
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const fields = {
  name: '',
  email: '',
  age: ''
};

let currentField = 'name';

function askField(field, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      fields[field] = answer;
      resolve();
    });
  });
}

async function runForm() {
  console.log('=== User Registration ===\n');
  
  await askField('name', 'Name: ');
  await askField('email', 'Email: ');
  await askField('age', 'Age: ');
  
  console.log('\n=== Summary ===');
  console.log(`Name: ${fields.name}`);
  console.log(`Email: ${fields.email}`);
  console.log(`Age: ${fields.age}`);
  console.log('\nForm completed!');
  
  rl.close();
  process.exit(0);
}

runForm();