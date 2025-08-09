import { $ } from '@xec-sh/core';
const home = await $ `echo $HOME`;
console.log('Home directory:', home.stdout.trim());
const result = await $ `echo $MY_VAR`.env({ MY_VAR: 'Hello from env!' });
console.log('Result:', result.stdout.trim());
const envVars = {
    NODE_ENV: 'production',
    DEBUG: 'true',
    API_KEY: 'secret-key-123'
};
const $withEnv = $.env(envVars);
await $withEnv `echo "Environment: $NODE_ENV, Debug: $DEBUG"`;
const inheritedResult = await $ `printenv | grep PATH`;
console.log('PATH variable:', inheritedResult.stdout);
const customPath = '/custom/bin:' + process.env['PATH'];
const pathResult = await $ `echo $PATH`.env({ PATH: customPath });
console.log('Custom PATH:', pathResult.stdout.trim());
const minimalEnv = await $ `printenv | wc -l`.env({
    PATH: '/usr/bin:/bin',
    HOME: process.env['HOME'] || '/tmp'
});
console.log('Number of variables:', minimalEnv.stdout.trim());
const $dev = $.env({ NODE_ENV: 'development' });
const $prod = $dev.env({ NODE_ENV: 'production' });
await $dev `echo "Environment: $NODE_ENV"`;
await $prod `echo "Environment: $NODE_ENV"`;
const appName = 'MyApp';
const version = '1.0.0';
const buildResult = await $ `
  echo "Building \${APP_NAME} v\${VERSION}..."
  echo "Configuration: \${NODE_ENV}"
  echo "Debug mode: \${DEBUG}"
`.env({
    APP_NAME: appName,
    VERSION: version,
    NODE_ENV: 'production',
    DEBUG: 'false'
});
console.log('Build result:', buildResult.stdout);
const $configured = $.env({ API_KEY: 'secret-key' })
    .cd('/tmp')
    .timeout(10000);
await $configured `pwd && echo "API_KEY: $API_KEY"`;
const $withOutput = $.env({ OUTPUT_DIR: '/tmp/output' });
await $withOutput `mkdir -p $OUTPUT_DIR`;
await $withOutput `echo "Data" > $OUTPUT_DIR/file.txt`;
await $withOutput `ls -la $OUTPUT_DIR`;
await $withOutput `rm -rf $OUTPUT_DIR`;
//# sourceMappingURL=04-environment-variables.js.map