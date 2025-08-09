#!/usr/bin/env tsx
import { $ } from '@xec-sh/core';
async function main() {
    console.log('=== Docker Simplified API Examples ===\n');
    console.log('1. Running ephemeral container with simplified API:');
    const result1 = await $.docker({
        image: 'alpine:latest',
        volumes: ['/tmp:/data']
    }) `echo "Hello from ephemeral container" > /data/test.txt && cat /data/test.txt`;
    console.log('Output:', result1.stdout);
    console.log('Success:', result1.ok);
    console.log('\n2. Executing in existing container:');
    await $ `docker run -d --name test-container alpine:latest sleep 3600`.quiet();
    const result2 = await $.docker({
        container: 'test-container',
        workdir: '/tmp'
    }) `pwd && echo "Working in persistent container"`;
    console.log('Output:', result2.stdout);
    await $ `docker rm -f test-container`.quiet();
    console.log('\n3. Using fluent API for ephemeral containers:');
    const result3 = await $.docker()
        .ephemeral('node:18-alpine')
        .workdir('/app')
        .env({ NODE_ENV: 'production' })
        .run `node -e "console.log('Node version:', process.version); console.log('ENV:', process.env.NODE_ENV)"`;
    console.log('Output:', result3.stdout);
    console.log('\n4. Using fluent API for persistent containers:');
    await $ `docker run -d --name node-container -w /app node:18-alpine sleep 3600`.quiet();
    const result4 = await $.docker()
        .container('node-container')
        .workdir('/tmp')
        .exec `node -e "console.log('Current dir:', process.cwd())"`;
    console.log('Output:', result4.stdout);
    await $ `docker rm -f node-container`.quiet();
    console.log('\n5. Complex ephemeral container configuration:');
    const result5 = await $.docker()
        .ephemeral('alpine:latest')
        .volumes([`${process.cwd()}:/workspace`])
        .workdir('/workspace')
        .user('nobody')
        .env({
        MY_VAR: 'test',
        ANOTHER_VAR: 'value'
    })
        .network('bridge')
        .run `ls -la && echo "MY_VAR=$MY_VAR"`;
    console.log('Output:', result5.stdout);
    console.log('\n6. Build and run pattern with fluent API:');
    await $ `mkdir -p /tmp/docker-test`;
    await $ `cat > /tmp/docker-test/Dockerfile << 'EOF'
FROM alpine:latest
RUN echo "Built at $(date)" > /build-time.txt
CMD ["cat", "/build-time.txt"]
EOF`;
    const buildAPI = $.docker().build('/tmp/docker-test', 'my-test-image:latest');
    await buildAPI.execute();
    const result6 = await $.docker({
        image: 'my-test-image:latest'
    }) `cat /build-time.txt`;
    console.log('Build output:', result6.stdout);
    await $ `docker rmi my-test-image:latest`.quiet();
    await $ `rm -rf /tmp/docker-test`;
    console.log('\n7. API Comparison - Old vs New:');
    console.log('Old verbose API:');
    console.log(`await $.with({
  adapter: 'docker',
  adapterOptions: {
    type: 'docker',
    container: 'temp',
    runMode: 'run',
    image: 'alpine',
    volumes: ['/data:/data'],
    autoRemove: true
  }
})\`echo hello\`;`);
    console.log('\nNew simplified API:');
    console.log(`await $.docker({
  image: 'alpine',
  volumes: ['/data:/data']
})\`echo hello\`;`);
    console.log('\nOr with fluent API:');
    console.log(`await $.docker()
  .ephemeral('alpine')
  .volumes(['/data:/data'])
  .run\`echo hello\`;`);
    console.log('\n=== Examples completed ===');
}
main().catch(console.error);
//# sourceMappingURL=07-docker-simplified-api.js.map