import { text } from '../src/index.js';

async function main() {
  console.log('Testing simple text prompt...');
  console.log('TTY:', process.stdin.isTTY);
  
  try {
    const name = await text({
      message: 'What is your name?',
      placeholder: 'John Doe',
    });
    
    console.log('Hello,', name);
  } catch (error) {
    console.error('Error:', error);
  }
}

main();