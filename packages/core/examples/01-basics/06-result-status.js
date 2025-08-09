import { $ } from '@xec-sh/core';
const successResult = await $ `echo "Operation completed"`;
if (successResult.ok) {
    console.log('✅ Command succeeded:', successResult.stdout.trim());
}
else {
    console.log('❌ Command failed:', successResult.cause);
}
const failResult = await $ `false`.nothrow();
if (!failResult.ok) {
    console.log('Command failed with cause:', failResult.cause);
}
const exitCodeError = await $ `exit 42`.nothrow();
console.log('Exit code error:', {
    ok: exitCodeError.ok,
    cause: exitCodeError.cause
});
const signalError = await $ `sleep 10`.timeout(100).nothrow();
console.log('Signal error:', {
    ok: signalError.ok,
    cause: signalError.cause
});
const testResult = await $ `test -f /etc/hosts`.nothrow();
if (testResult.ok) {
    console.log('/etc/hosts file exists');
}
else {
    console.log('/etc/hosts file does not exist');
}
let attempts = 0;
let result;
do {
    attempts++;
    result = await $ `curl -s https://api.github.com/rate_limit`.nothrow();
    if (!result.ok) {
        console.log(`Attempt ${attempts} failed: ${result.cause}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
} while (!result.ok && attempts < 3);
if (result.ok) {
    console.log('API call succeeded after', attempts, 'attempts');
}
else {
    console.log('API call failed after', attempts, 'attempts:', result.cause);
}
async function deployApp() {
    const buildResult = await $ `npm run build`.nothrow();
    if (!buildResult.ok) {
        return { success: false, error: `Build failed: ${buildResult.cause}` };
    }
    const testResult = await $ `npm test`.nothrow();
    if (!testResult.ok) {
        return { success: false, error: `Tests failed: ${testResult.cause}` };
    }
    const deployResult = await $ `npm run deploy`.nothrow();
    if (!deployResult.ok) {
        return { success: false, error: `Deploy failed: ${deployResult.cause}` };
    }
    return { success: true };
}
const migrationExample = await $ `echo "test"`;
console.log('Old way (deprecated):', migrationExample.ok);
console.log('New way:', migrationExample.ok);
console.log('Both return the same value:', migrationExample.ok === migrationExample.ok);
//# sourceMappingURL=06-result-status.js.map