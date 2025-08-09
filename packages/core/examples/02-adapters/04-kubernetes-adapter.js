import { $, CommandError } from '@xec-sh/core';
const $k8s = $.k8s({
    pod: 'my-app-pod',
    namespace: 'default'
});
await $k8s `hostname`;
await $k8s `ls -la /app`;
const $k8sContainer = $.k8s({
    pod: 'multi-container-pod',
    container: 'app',
    namespace: 'production'
});
await $k8sContainer `cat /etc/hostname`;
await $k8sContainer `ps aux`;
const $k8sWithFlags = $.k8s({
    pod: 'my-app-pod',
    namespace: 'default',
    execFlags: ['-it']
});
await $k8sWithFlags `sh -c "echo 'Interactive mode'"`;
const $k8sTTY = $.k8s({
    pod: 'my-pod',
    namespace: 'default',
    tty: true
});
await $k8sTTY `top -b -n 1`;
const $k8sConfigured = $.k8s({
    pod: 'my-pod',
    namespace: 'staging'
})
    .env({ ENVIRONMENT: 'staging' })
    .timeout(10000);
await $k8sConfigured `echo "Environment: $ENVIRONMENT"`;
const deploymentPods = ['web-1', 'web-2', 'web-3'];
for (const podName of deploymentPods) {
    const $pod = $.k8s({
        pod: podName,
        namespace: 'production'
    });
    console.log(`\n=== Logs from ${podName} ===`);
    const logs = await $pod `tail -n 50 /var/log/app.log`.nothrow();
    if (logs.ok) {
        console.log(logs.stdout);
    }
    else {
        console.log(`Failed to get logs: ${logs.stderr}`);
    }
}
const $healthCheck = $.k8s({
    pod: 'app-pod',
    container: 'app',
    namespace: 'production'
});
const health = await $healthCheck `curl -s http://localhost:8080/health`.nothrow();
if (health.ok) {
    const status = JSON.parse(health.stdout);
    console.log('Application status:', status);
}
else {
    console.log('Application unavailable');
}
const $cleaner = $.k8s({
    pod: 'cleaner-pod',
    namespace: 'maintenance'
});
await $cleaner `find /tmp -type f -mtime +7 -delete`;
await $cleaner `du -sh /tmp`;
const pods = ['web-1', 'web-2', 'web-3'];
const logTasks = pods.map(pod => {
    const $pod = $.k8s({ pod, namespace: 'production' });
    return $pod `tail -n 100 /var/log/app.log | grep ERROR`;
});
const results = await Promise.all(logTasks);
results.forEach((result, i) => {
    console.log(`Errors in ${pods[i]}:`, result.stdout);
});
const $debug = $.k8s({
    pod: 'debug-pod',
    namespace: 'default'
});
const dnsCheck = await $debug `nslookup kubernetes.default.svc.cluster.local`.nothrow();
if (dnsCheck.ok) {
    console.log('DNS is working correctly');
}
const apiCheck = await $debug `curl -s -o /dev/null -w "%{http_code}" https://kubernetes.default.svc.cluster.local/healthz`.nothrow();
console.log('API status:', apiCheck.stdout);
const $testPod = $.k8s({
    pod: 'test-runner',
    namespace: 'ci-cd'
});
const steps = ['Preparation', 'Tests', 'Report'];
for (const step of steps) {
    console.log(`\n=== ${step} ===`);
    switch (step) {
        case 'Preparation':
            await $testPod `cd /app && npm ci`;
            break;
        case 'Tests':
            const testResult = await $testPod `cd /app && npm test`.nothrow();
            if (!testResult.ok) {
                console.error('Tests failed!');
                process.exit(1);
            }
            break;
        case 'Report':
            await $testPod `cd /app && npm run coverage`;
            break;
    }
}
try {
    const $failPod = $.k8s({
        pod: 'non-existent-pod',
        namespace: 'default'
    });
    await $failPod `echo "test"`;
}
catch (error) {
    if (error instanceof CommandError) {
        console.log('K8s error:');
        console.log('Exit code:', error.exitCode);
        console.log('Message:', error.stderr);
    }
}
//# sourceMappingURL=04-kubernetes-adapter.js.map