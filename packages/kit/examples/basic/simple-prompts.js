#!/usr/bin/env node
import kit from '@xec-sh/kit';
async function main() {
    const name = await kit.text('What is your name?');
    kit.log.success(`Hello, ${name}!`);
    const proceed = await kit.confirm('Would you like to continue?');
    if (!proceed) {
        kit.log.info('Goodbye!');
        return;
    }
    const color = await kit.select('What is your favorite color?', [
        'red',
        'blue',
        'green',
        'yellow',
        'purple'
    ]);
    kit.log.message(`You selected: ${color}`);
    const hobbies = await kit.multiselect('Select your hobbies:', [
        'reading',
        'gaming',
        'sports',
        'music',
        'cooking',
        'travel'
    ]);
    kit.log.message(`Your hobbies: ${hobbies.join(', ')}`);
    const password = await kit.password('Enter a password:', {
        showStrength: true
    });
    kit.log.success('Password saved!');
    kit.log.break();
    kit.log.step('Summary:');
    kit.log.message(`Name: ${name}`);
    kit.log.message(`Favorite color: ${color}`);
    kit.log.message(`Hobbies: ${hobbies.join(', ')}`);
    kit.log.message('Password: ********');
}
main().catch(error => {
    if (error.message === 'Cancelled') {
        kit.log.warning('Cancelled by user');
    }
    else {
        kit.log.error(`Error: ${error.message}`);
    }
    process.exit(1);
});
//# sourceMappingURL=simple-prompts.js.map