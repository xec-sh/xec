import * as path from 'path';
import * as fs from 'fs/promises';
import { $, withTempDir } from '@xec-sh/core';
async function multiServerDeployment(targets, config) {
    console.log('\n=== Многосерверное развертывание ===\n');
    console.log(`Версия: ${config.version}`);
    console.log(`Ветка: ${config.branch}`);
    console.log(`Серверов: ${targets.length}\n`);
    const artifactPath = await createDeploymentArtifact(config);
    const serversByRole = groupBy(targets, 'role');
    const deploymentOrder = ['database', 'api', 'worker', 'web'];
    const results = [];
    for (const role of deploymentOrder) {
        const servers = serversByRole[role] || [];
        if (servers.length === 0)
            continue;
        console.log(`\n📦 Развертывание ${role} серверов (${servers.length})...`);
        const roleResults = await deployToServers(servers, artifactPath, config);
        results.push(...roleResults);
        if (config.healthCheck) {
            await performHealthChecks(servers, config);
        }
    }
    generateDeploymentReport(results, config);
    await $ `rm -f ${artifactPath}`;
    return results;
}
async function createDeploymentArtifact(config) {
    console.log('🔨 Создание артефакта...');
    const artifactPath = await withTempDir(async (tmpDir) => {
        const buildDir = path.join(tmpDir.path, 'build');
        await $ `git clone --branch ${config.branch} --depth 1 ${config.repository} ${buildDir}`;
        const $build = $.cd(buildDir);
        await $build `npm ci --production`;
        await $build `npm run build`;
        const metadata = {
            version: config.version,
            branch: config.branch,
            commit: await $build `git rev-parse HEAD`.then(r => r.stdout.trim()),
            buildTime: new Date().toISOString(),
            buildHost: await $ `hostname`.then(r => r.stdout.trim())
        };
        await fs.writeFile(path.join(buildDir, 'deployment.json'), JSON.stringify(metadata, null, 2));
        const artifactName = `deploy-${config.version}-${Date.now()}.tar.gz`;
        await $ `tar -czf ${artifactName} -C ${buildDir} .`;
        return path.resolve(artifactName);
    });
    return artifactPath;
}
async function deployToServers(servers, artifactPath, config) {
    console.log(`Развертывание на ${servers.length} серверах...`);
    let deployed = 0;
    const deploymentPromises = servers.map(async (server) => {
        const result = {
            server: server.name,
            status: 'pending',
            startTime: new Date(),
            endTime: null,
            error: null,
            rollbackVersion: null
        };
        try {
            const $ssh = $.with({
                adapter: 'ssh',
                sshOptions: {
                    host: server.host,
                    username: server.username,
                    privateKey: server.privateKey
                }
            });
            result.rollbackVersion = await getCurrentVersion($ssh, server.deployPath);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const releaseDir = `${server.deployPath}/releases/${timestamp}`;
            await $ssh `mkdir -p ${releaseDir}`;
            await $ `scp -i ${server.privateKey} ${artifactPath} ${server.username}@${server.host}:${releaseDir}/artifact.tar.gz`;
            await $ssh `cd ${releaseDir} && tar -xzf artifact.tar.gz && rm artifact.tar.gz`;
            await $ssh `cp ${server.deployPath}/shared/.env ${releaseDir}/.env || true`;
            if (config.hooks?.preDeploy) {
                await $ssh `cd ${releaseDir} && ${config.hooks.preDeploy}`;
            }
            await $ssh `cd ${server.deployPath}/current && npm run stop || true`;
            await $ssh `ln -sfn ${releaseDir} ${server.deployPath}/current`;
            await $ssh `cd ${server.deployPath}/current && npm run start:${server.environment}`;
            if (config.hooks?.postDeploy) {
                await $ssh `cd ${server.deployPath}/current && ${config.hooks.postDeploy}`;
            }
            await cleanupOldReleases($ssh, server.deployPath, config.keepReleases || 5);
            result.status = 'success';
            result.endTime = new Date();
        }
        catch (error) {
            result.status = 'failed';
            result.error = error.message;
            result.endTime = new Date();
            if (config.autoRollback && result.rollbackVersion) {
                await rollbackDeployment(server, result.rollbackVersion);
            }
        }
        deployed++;
        process.stdout.write(`\rРазвернуто: ${deployed}/${servers.length}`);
        return result;
    });
    const results = await Promise.all(deploymentPromises);
    console.log('');
    return results;
}
async function getCurrentVersion($ssh, deployPath) {
    try {
        const result = await $ssh `readlink ${deployPath}/current`;
        return path.basename(result.stdout.trim());
    }
    catch {
        return null;
    }
}
async function cleanupOldReleases($ssh, deployPath, keepCount) {
    const releases = await $ssh `ls -t ${deployPath}/releases`;
    const releaseList = releases.stdout.trim().split('\n').filter(Boolean);
    if (releaseList.length > keepCount) {
        const toDelete = releaseList.slice(keepCount);
        for (const release of toDelete) {
            await $ssh `rm -rf ${deployPath}/releases/${release}`;
        }
        console.log(`  Удалено старых релизов: ${toDelete.length}`);
    }
}
async function blueGreenDeployment(config) {
    console.log('\n=== Blue-Green развертывание ===\n');
    const $ssh = $.with({
        adapter: 'ssh',
        sshOptions: {
            host: config.host,
            username: config.username,
            privateKey: config.privateKey
        }
    });
    const currentEnv = await $ssh `cat ${config.basePath}/current-env 2>/dev/null || echo "blue"`;
    const activeEnv = currentEnv.stdout.trim();
    const inactiveEnv = activeEnv === 'blue' ? 'green' : 'blue';
    console.log(`Текущее окружение: ${activeEnv}`);
    console.log(`Развертывание в: ${inactiveEnv}`);
    try {
        console.log(`\n1️⃣ Развертывание в ${inactiveEnv}...`);
        const deployPath = `${config.basePath}/${inactiveEnv}`;
        await $ssh `cd ${deployPath} && git pull origin ${config.branch}`;
        await $ssh `cd ${deployPath} && npm ci --production`;
        await $ssh `cd ${deployPath} && npm run build`;
        console.log(`\n2️⃣ Запуск ${inactiveEnv} окружения...`);
        const inactivePort = inactiveEnv === 'blue' ? config.bluePort : config.greenPort;
        await $ssh `cd ${deployPath} && PORT=${inactivePort} npm run start:bg`;
        console.log('\n3️⃣ Прогрев приложения...');
        await warmupApplication(`http://${config.host}:${inactivePort}`, config.warmupEndpoints);
        console.log('\n4️⃣ Проверка здоровья...');
        const healthCheck = await checkApplicationHealth(`http://${config.host}:${inactivePort}/health`);
        if (!healthCheck.healthy) {
            throw new Error(`Health check failed: ${healthCheck.error}`);
        }
        console.log('\n5️⃣ Переключение трафика...');
        await switchTraffic($ssh, config, inactiveEnv);
        await $ssh `echo "${inactiveEnv}" > ${config.basePath}/current-env`;
        console.log(`\n6️⃣ Остановка ${activeEnv} окружения через 30 секунд...`);
        setTimeout(async () => {
            const activePort = activeEnv === 'blue' ? config.bluePort : config.greenPort;
            await $ssh `fuser -k ${activePort}/tcp || true`;
            console.log(`✅ ${activeEnv} окружение остановлено`);
        }, 30000);
        console.log('\n✅ Blue-Green развертывание завершено успешно!');
    }
    catch (error) {
        console.error('\n❌ Ошибка развертывания:', error.message);
        console.log('Откатываемся на предыдущее окружение...');
        console.log(`✅ Трафик остается на ${activeEnv} окружении`);
        throw error;
    }
}
async function warmupApplication(baseUrl, endpoints) {
    console.log('Прогрев приложения...');
    for (const endpoint of endpoints) {
        process.stdout.write(`\rПрогрев ${endpoint}...`);
        try {
            await $ `curl -s ${baseUrl}${endpoint} > /dev/null`;
        }
        catch {
        }
    }
    console.log('\n✅ Прогрев завершен');
}
async function checkApplicationHealth(healthUrl, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            const result = await $ `curl -s -f ${healthUrl}`;
            const health = JSON.parse(result.stdout);
            if (health.status === 'ok' || health.healthy === true) {
                return { healthy: true, details: health };
            }
        }
        catch (error) {
            if (i === retries - 1) {
                return { healthy: false, error: error.message };
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    return { healthy: false, error: 'Health check timeout' };
}
async function switchTraffic($ssh, config, targetEnv) {
    const targetPort = targetEnv === 'blue' ? config.bluePort : config.greenPort;
    const nginxConfig = `
upstream app {
    server 127.0.0.1:${targetPort};
}

server {
    listen 80;
    server_name ${config.domain};
    
    location / {
        proxy_pass http://app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
`;
    await $ssh `echo '${nginxConfig}' | sudo tee /etc/nginx/sites-available/${config.domain}`;
    await $ssh `sudo nginx -t`;
    await $ssh `sudo nginx -s reload`;
}
async function canaryDeployment(config, servers) {
    console.log('\n=== Канареечное развертывание ===\n');
    console.log(`Стратегия: ${config.strategy}`);
    console.log(`Этапы: ${config.stages.map(s => `${s.percentage}%`).join(' → ')}\n`);
    const totalServers = servers.length;
    let deployedServers = 0;
    for (const stage of config.stages) {
        const serversInStage = Math.ceil(totalServers * stage.percentage / 100);
        const targetServers = servers.slice(deployedServers, deployedServers + serversInStage);
        console.log(`\n🕊️ Этап ${stage.name}: ${stage.percentage}% (${targetServers.length} серверов)`);
        const results = await deployToServers(targetServers, config.artifactPath, config);
        const failed = results.filter(r => r.status === 'failed');
        if (failed.length > 0) {
            console.error(`❌ Развертывание провалилось на ${failed.length} серверах`);
            if (config.rollbackOnFailure) {
                await rollbackCanaryDeployment(servers.slice(0, deployedServers + serversInStage));
            }
            throw new Error('Canary deployment failed');
        }
        console.log(`\n📊 Мониторинг метрик (${stage.monitorDuration}с)...`);
        const metrics = await monitorCanaryMetrics(targetServers, stage.monitorDuration, config.metrics);
        const analysis = analyzeCanaryMetrics(metrics, config.thresholds);
        if (!analysis.healthy) {
            console.error('❌ Метрики не соответствуют порогам:');
            analysis.violations.forEach(v => console.error(`  - ${v}`));
            if (config.rollbackOnFailure) {
                await rollbackCanaryDeployment(servers.slice(0, deployedServers + serversInStage));
            }
            throw new Error('Canary metrics validation failed');
        }
        console.log('✅ Метрики в норме');
        deployedServers += serversInStage;
        if (stage.pauseAfter && deployedServers < totalServers) {
            console.log(`\n⏸️ Пауза ${stage.pauseAfter}с перед следующим этапом...`);
            await new Promise(resolve => setTimeout(resolve, stage.pauseAfter * 1000));
        }
    }
    console.log('\n✅ Канареечное развертывание завершено успешно!');
}
async function monitorCanaryMetrics(servers, duration, metricsConfig) {
    const startTime = Date.now();
    const metrics = {
        errorRate: [],
        responseTime: [],
        cpu: [],
        memory: []
    };
    process.stdout.write('Сбор метрик...');
    while (Date.now() - startTime < duration * 1000) {
        const timestamp = Date.now();
        const serverMetrics = await Promise.all(servers.map(server => collectServerMetrics(server, metricsConfig)));
        const aggregated = aggregateMetrics(serverMetrics);
        metrics.errorRate.push({ timestamp, value: aggregated.errorRate });
        metrics.responseTime.push({ timestamp, value: aggregated.responseTime });
        metrics.cpu.push({ timestamp, value: aggregated.cpu });
        metrics.memory.push({ timestamp, value: aggregated.memory });
        process.stdout.write(`\rМетрики: Ошибки ${aggregated.errorRate.toFixed(2)}% | Отклик ${aggregated.responseTime}ms | CPU ${aggregated.cpu.toFixed(1)}%`);
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    console.log('');
    return metrics;
}
async function collectServerMetrics(server, config) {
    const $ssh = $.with({
        adapter: 'ssh',
        sshOptions: {
            host: server.host,
            username: server.username,
            privateKey: server.privateKey
        }
    });
    try {
        const appMetrics = await $ssh `curl -s http://localhost:${config.metricsPort}/metrics`;
        const metrics = JSON.parse(appMetrics.stdout);
        const cpu = await $ssh `top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1`;
        const memory = await $ssh `free | grep Mem | awk '{print ($3/$2) * 100}'`;
        return {
            errorRate: metrics.errorRate || 0,
            responseTime: metrics.responseTime || 0,
            cpu: parseFloat(cpu.stdout),
            memory: parseFloat(memory.stdout)
        };
    }
    catch {
        return {
            errorRate: 0,
            responseTime: 0,
            cpu: 0,
            memory: 0
        };
    }
}
function aggregateMetrics(serverMetrics) {
    const count = serverMetrics.length;
    return {
        errorRate: serverMetrics.reduce((sum, m) => sum + m.errorRate, 0) / count,
        responseTime: serverMetrics.reduce((sum, m) => sum + m.responseTime, 0) / count,
        cpu: serverMetrics.reduce((sum, m) => sum + m.cpu, 0) / count,
        memory: serverMetrics.reduce((sum, m) => sum + m.memory, 0) / count
    };
}
function analyzeCanaryMetrics(metrics, thresholds) {
    const violations = [];
    const avgErrorRate = average(metrics.errorRate.map(m => m.value));
    const avgResponseTime = average(metrics.responseTime.map(m => m.value));
    const avgCpu = average(metrics.cpu.map(m => m.value));
    const avgMemory = average(metrics.memory.map(m => m.value));
    if (avgErrorRate > thresholds.maxErrorRate) {
        violations.push(`Error rate ${avgErrorRate.toFixed(2)}% exceeds threshold ${thresholds.maxErrorRate}%`);
    }
    if (avgResponseTime > thresholds.maxResponseTime) {
        violations.push(`Response time ${avgResponseTime}ms exceeds threshold ${thresholds.maxResponseTime}ms`);
    }
    if (avgCpu > thresholds.maxCpu) {
        violations.push(`CPU usage ${avgCpu.toFixed(1)}% exceeds threshold ${thresholds.maxCpu}%`);
    }
    if (avgMemory > thresholds.maxMemory) {
        violations.push(`Memory usage ${avgMemory.toFixed(1)}% exceeds threshold ${thresholds.maxMemory}%`);
    }
    return {
        healthy: violations.length === 0,
        violations,
        metrics: {
            errorRate: avgErrorRate,
            responseTime: avgResponseTime,
            cpu: avgCpu,
            memory: avgMemory
        }
    };
}
async function rollbackDeployment(server, version) {
    console.log(`\n🔄 Откат на ${server.name} к версии ${version}...`);
    const $ssh = $.with({
        adapter: 'ssh',
        sshOptions: {
            host: server.host,
            username: server.username,
            privateKey: server.privateKey
        }
    });
    try {
        await $ssh `cd ${server.deployPath}/current && npm run stop || true`;
        await $ssh `ln -sfn ${server.deployPath}/releases/${version} ${server.deployPath}/current`;
        await $ssh `cd ${server.deployPath}/current && npm run start:${server.environment}`;
        console.log(`✅ Откат на ${server.name} завершен`);
    }
    catch (error) {
        console.error(`❌ Ошибка отката на ${server.name}:`, error.message);
        throw error;
    }
}
async function rollbackCanaryDeployment(servers) {
    console.log('\n🔄 Откат канареечного развертывания...');
    const rollbackPromises = servers.map(async (server) => {
        const version = await getDeploymentHistory(server);
        if (version) {
            await rollbackDeployment(server, version);
        }
    });
    await Promise.all(rollbackPromises);
    console.log('✅ Откат завершен');
}
async function getDeploymentHistory(server) {
    const $ssh = $.with({
        adapter: 'ssh',
        sshOptions: {
            host: server.host,
            username: server.username,
            privateKey: server.privateKey
        }
    });
    try {
        const history = await $ssh `ls -t ${server.deployPath}/releases | head -2 | tail -1`;
        return history.stdout.trim();
    }
    catch {
        return null;
    }
}
async function performHealthChecks(servers, config) {
    console.log('\n🏥 Проверка здоровья...');
    const healthPromises = servers.map(async (server) => {
        const url = `http://${server.host}:${config.healthCheckPort}/health`;
        const result = await checkApplicationHealth(url);
        return {
            server: server.name,
            healthy: result.healthy,
            details: result.details || result.error
        };
    });
    const results = await Promise.all(healthPromises);
    results.forEach(r => {
        const icon = r.healthy ? '✅' : '❌';
        console.log(`${icon} ${r.server}: ${r.healthy ? 'OK' : 'FAIL'}`);
        if (!r.healthy) {
            console.log(`   Детали: ${r.details}`);
        }
    });
    const unhealthy = results.filter(r => !r.healthy);
    if (unhealthy.length > 0) {
        throw new Error(`Health check failed on ${unhealthy.length} servers`);
    }
}
function generateDeploymentReport(results, config) {
    console.log('\n📋 Отчет о развертывании');
    console.log('='.repeat(50));
    console.log(`Версия: ${config.version}`);
    console.log(`Время: ${new Date().toISOString()}`);
    console.log(`Всего серверов: ${results.length}`);
    const successful = results.filter(r => r.status === 'success');
    const failed = results.filter(r => r.status === 'failed');
    console.log(`Успешно: ${successful.length}`);
    console.log(`Провалено: ${failed.length}`);
    if (failed.length > 0) {
        console.log('\nПроваленные серверы:');
        failed.forEach(r => {
            console.log(`  - ${r.server}: ${r.error}`);
        });
    }
    const deploymentTimes = successful.map(r => (r.endTime.getTime() - r.startTime.getTime()) / 1000);
    if (deploymentTimes.length > 0) {
        const avgTime = average(deploymentTimes);
        const maxTime = Math.max(...deploymentTimes);
        const minTime = Math.min(...deploymentTimes);
        console.log('\nВремя развертывания:');
        console.log(`  Среднее: ${avgTime.toFixed(1)}с`);
        console.log(`  Мин: ${minTime.toFixed(1)}с`);
        console.log(`  Макс: ${maxTime.toFixed(1)}с`);
    }
}
function groupBy(array, key) {
    return array.reduce((result, item) => {
        const group = String(item[key]);
        if (!result[group])
            result[group] = [];
        result[group].push(item);
        return result;
    }, {});
}
function average(numbers) {
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}
export { canaryDeployment, rollbackDeployment, blueGreenDeployment, performHealthChecks, multiServerDeployment };
//# sourceMappingURL=04-deployment-automation.js.map