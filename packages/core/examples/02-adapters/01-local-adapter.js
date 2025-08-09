import { $, CommandError } from '@xec-sh/core';
const result = await $ `echo "Running locally"`;
console.log('Local result:', result.stdout);
const $local = $.local();
await $local `whoami`;
const $bash = $.local().shell('/bin/bash');
const $zsh = $.local().shell('/bin/zsh');
const $sh = $.local().shell('/bin/sh');
await $bash `echo $SHELL`;
await $zsh `echo $SHELL`;
await $sh `echo $SHELL`;
const $direct = $.local().shell(false);
await $direct `ls`;
const findResult = await $ `find . -name "*.ts" | head -10`;
console.log('Found files:', findResult.stdout);
const input = 'Hello from stdin';
const echoResult = await $ `echo "${input}" | cat`;
console.log('Response:', echoResult.stdout);
try {
    await $.local().timeout(1000) `sleep 5`;
}
catch (error) {
    console.log('Command interrupted by timeout');
}
const $configured = $.local()
    .cd('/tmp')
    .env({ MY_VAR: 'test' })
    .timeout(5000);
await $configured `echo "Working in: $(pwd) with MY_VAR=$MY_VAR"`;
try {
    await $.local() `nonexistent_command`;
}
catch (error) {
    if (error instanceof CommandError) {
        console.log('Command returned error');
        console.log('Exit code:', error.exitCode);
        console.log('Error:', error.stderr);
    }
}
const results = await Promise.all([
    $.local() `echo "Task 1"`,
    $.local() `echo "Task 2"`,
    $.local() `echo "Task 3"`
]);
results.forEach((r, i) => {
    console.log(`Task ${i + 1}:`, r.stdout.trim());
});
//# sourceMappingURL=01-local-adapter.js.map