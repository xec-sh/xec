#!/usr/bin/env tsx
import { $ } from '../../src/index.js';
async function main() {
    console.log('🐳 Docker Run Mode Example\n');
    console.log('1️⃣ Running a simple command in an ephemeral container:');
    const result1 = await $.docker({
        image: 'alpine:latest'
    }) `echo "Hello from ephemeral container!"`;
    console.log('Output:', result1.stdout);
    console.log('\n2️⃣ Running with volume mounts:');
    const result2 = await $.docker({
        image: 'alpine:latest',
        volumes: [`${process.cwd()}:/workspace:ro`],
        workdir: '/workspace'
    }) `ls -la`;
    console.log('Files in current directory:');
    console.log(result2.stdout);
    console.log('\n3️⃣ Running with environment variables:');
    const result3 = await $.docker({
        image: 'alpine:latest',
        env: {
            MY_VAR: 'Hello from env!',
            USER_NAME: 'xec-user'
        }
    }) `sh -c 'echo "MY_VAR=$MY_VAR, USER_NAME=$USER_NAME"'`;
    console.log('Environment output:', result3.stdout);
    console.log('\n4️⃣ Using fluent API for ephemeral containers:');
    try {
        const result4 = await $.docker()
            .ephemeral('alpine:latest')
            .workdir('/etc')
            .run `cat os-release | head -3`;
        console.log('OS Info:', result4.stdout);
    }
    catch (error) {
        console.error('Error:', error);
    }
    console.log('\n5️⃣ Running complex shell command:');
    const result5 = await $.docker({
        image: 'alpine:latest'
    }) `sh -c 'echo "Files in /etc:" && ls /etc | head -5 | nl'`;
    console.log(result5.stdout);
    console.log('\n6️⃣ Using containerized tools:');
    const jsonData = JSON.stringify({ name: 'xec', type: 'tool', awesome: true });
    const result6 = await $.docker({
        image: 'stedolan/jq'
    }) `echo ${jsonData} | jq .name`;
    console.log('Extracted name:', result6.stdout.trim());
    console.log('\n7️⃣ API Comparison:');
    console.log('Old verbose API required:');
    console.log(`  $.with({ adapter: 'docker', adapterOptions: { type: 'docker', runMode: 'run', ... }})`);
    console.log('\nNew simplified API:');
    console.log(`  $.docker({ image: 'alpine' }) or $.docker().ephemeral('alpine').run`);
    console.log('\n✅ All examples completed!');
}
main().catch(console.error);
//# sourceMappingURL=05-docker-run-mode.js.map