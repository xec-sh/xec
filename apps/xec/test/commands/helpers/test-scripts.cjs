// Test helper script for watch command tests
const fs = require('fs');
const path = require('path');

const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
  case 'echo':
    console.log(args.join(' '));
    break;
  
  case 'write':
    const [file, content] = args;
    fs.writeFileSync(file, content);
    console.log(`Wrote to ${file}`);
    break;
  
  case 'append':
    const [appendFile, appendContent] = args;
    fs.appendFileSync(appendFile, appendContent);
    console.log(`Appended to ${appendFile}`);
    break;
  
  case 'create-file':
    const fileName = args[0];
    fs.writeFileSync(fileName, 'test content');
    console.log(`Created ${fileName}`);
    break;
  
  case 'increment':
    const [counterFile] = args;
    let currentValue = 0;
    try {
      if (fs.existsSync(counterFile)) {
        const content = fs.readFileSync(counterFile, 'utf-8');
        const lines = content.trim().split('\n').filter(l => l);
        if (lines.length > 0) {
          currentValue = parseInt(lines[lines.length - 1], 10) || 0;
        }
      }
    } catch (e) {
      // File doesn't exist or can't be read, start at 0
    }
    fs.appendFileSync(counterFile, `${currentValue + 1}\n`);
    console.log(`Incremented to ${currentValue + 1}`);
    break;

  case 'error':
    console.error('Test error');
    process.exit(1);
    break;
  
  default:
    console.log('Unknown command:', command);
    process.exit(1);
}