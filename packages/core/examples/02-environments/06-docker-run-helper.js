#!/usr/bin/env tsx
import { $ } from '../../src/index.js';
function dockerRun(image, options) {
    return $.docker({
        image,
        volumes: options?.volumes,
        workdir: options?.workdir,
        user: options?.user,
        env: options?.env
    });
}
async function main() {
    console.log('🐳 Docker Run Mode with Helper\n');
    console.log('1️⃣ Simple command:');
    const result1 = await dockerRun('alpine:latest') `echo "Hello from Alpine!"`;
    console.log(result1.stdout);
    console.log('\n2️⃣ With volume mount:');
    const result2 = await dockerRun('alpine:latest', {
        volumes: [`${process.cwd()}:/data:ro`],
        workdir: '/data'
    }) `ls -la | head -5`;
    console.log(result2.stdout);
    console.log('\n3️⃣ Running Python:');
    const result3 = await dockerRun('python:3-alpine') `python -c "
import sys
print(f'Python {sys.version}')
print('Hello from containerized Python!')
"`;
    console.log(result3.stdout);
    console.log('\n4️⃣ Running Node.js:');
    const result4 = await dockerRun('node:alpine') `node -e "
console.log('Node.js', process.version);
console.log('Hello from containerized Node.js!');
"`;
    console.log(result4.stdout);
    console.log('\n5️⃣ Using containerized tools:');
    const markdown = '# Hello\n\nThis is **bold** text.';
    const result5 = await dockerRun('pandoc/core') `echo ${markdown} | pandoc -f markdown -t html`;
    console.log('Converted HTML:', result5.stdout);
    console.log('\n6️⃣ API Comparison:');
    console.log('Old API required verbose configuration:');
    console.log(`$.with({ adapter: 'docker', adapterOptions: { runMode: 'run', ... }})`);
    console.log('\nNew simplified API:');
    console.log(`$.docker({ image: 'alpine' }) or $.docker().ephemeral('alpine').run`);
    console.log('\n✅ Done!');
}
const containerTools = {
    jq: (query) => $.docker().ephemeral('stedolan/jq').run `echo ${query}`,
    python: (script) => $.docker().ephemeral('python:3-alpine').run `python -c ${script}`,
    node: (script) => $.docker().ephemeral('node:alpine').run `node -e ${script}`,
    alpine: () => $.docker({ image: 'alpine:latest' }),
    ubuntu: () => $.docker({ image: 'ubuntu:latest' })
};
async function advancedExample() {
    console.log('\n\n🚀 Advanced Container Tools Example:\n');
    const json = JSON.stringify({ users: [{ name: 'Alice' }, { name: 'Bob' }] });
    const names = await containerTools.jq(json) `jq -r '.users[].name'`;
    console.log('Extracted names:', names.stdout);
    const pythonResult = await containerTools.python(`
import math
print(f"Pi squared is {math.pi ** 2:.4f}")
`) ``;
    console.log(pythonResult.stdout);
    const ubuntuVersion = await containerTools.ubuntu() `cat /etc/os-release | grep VERSION= | head -1`;
    console.log('Ubuntu:', ubuntuVersion.stdout.trim());
}
main()
    .then(() => advancedExample())
    .catch(console.error);
//# sourceMappingURL=06-docker-run-helper.js.map