import * as path from 'path';
import { $ } from '@xec-sh/core';
import * as fs from 'fs/promises';
async function multiPlatformBuild(targets) {
    console.log(`\n=== Мультиплатформенная сборка ===\n`);
    const results = [];
    let completed = 0;
    for (const target of targets) {
        console.log(`\nСборка для ${target.name}... (${completed + 1}/${targets.length})`);
        try {
            await $ `rm -rf ${target.outputDir}`;
            await $ `mkdir -p ${target.outputDir}`;
            const $build = $.with({
                env: {
                    GOOS: target.platform,
                    GOARCH: target.arch,
                    CGO_ENABLED: '0'
                }
            });
            await $build `go build -o ${target.outputDir}/app-${target.platform}-${target.arch} ./cmd/app`;
            await $ `tar -czf ${target.outputDir}.tar.gz -C ${target.outputDir} .`;
            results.push({ target: target.name, status: 'success' });
            completed++;
            console.log(`✓ ${target.name} собран успешно`);
        }
        catch (error) {
            results.push({ target: target.name, status: 'failed', error: error.message });
            completed++;
            console.error(`❌ ${target.name} - ошибка сборки`);
        }
    }
    console.log('\nРезультаты сборки:');
    results.forEach(r => {
        const icon = r.status === 'success' ? '✓' : '✗';
        console.log(`  ${icon} ${r.target}: ${r.status}`);
    });
}
async function incrementalBuild(srcDir, buildDir) {
    console.log('\n=== Инкрементальная сборка ===\n');
    await $ `mkdir -p ${buildDir}`;
    const sourceFiles = await $ `find ${srcDir} -name "*.ts" -type f`;
    const files = sourceFiles.stdout.trim().split('\n').filter(Boolean);
    let rebuilt = 0;
    console.log('Проверка файлов...');
    for (const srcFile of files) {
        const relativePath = path.relative(srcDir, srcFile);
        const outFile = path.join(buildDir, relativePath.replace('.ts', '.js'));
        const needsRebuild = await shouldRebuild(srcFile, outFile);
        if (needsRebuild) {
            console.log(`Компиляция ${relativePath}...`);
            await $ `mkdir -p ${path.dirname(outFile)}`;
            await $ `tsc ${srcFile} --outFile ${outFile} --target es2020 --module commonjs`;
            rebuilt++;
        }
    }
    console.log(`✓ Сборка завершена. Пересобрано файлов: ${rebuilt}`);
}
async function shouldRebuild(srcFile, outFile) {
    try {
        const [srcStat, outStat] = await Promise.all([
            fs.stat(srcFile),
            fs.stat(outFile)
        ]);
        return srcStat.mtime > outStat.mtime;
    }
    catch {
        return true;
    }
}
async function dockerBuild(appName, version) {
    console.log(`\n=== Docker сборка: ${appName}:${version} ===\n`);
    const stages = [
        { name: 'base', description: 'Базовый образ' },
        { name: 'dependencies', description: 'Установка зависимостей' },
        { name: 'build', description: 'Сборка приложения' },
        { name: 'runtime', description: 'Финальный образ' }
    ];
    for (const stage of stages) {
        console.log(`${stage.description}...`);
        try {
            await $ `docker build --target ${stage.name} -t ${appName}:${stage.name}-${version} .`;
            console.log(`✓ ${stage.description} завершено`);
        }
        catch (error) {
            console.error(`❌ ${stage.description} - ошибка`);
            throw error;
        }
    }
    console.log('\nТегирование образов...');
    await $ `docker tag ${appName}:runtime-${version} ${appName}:${version}`;
    await $ `docker tag ${appName}:${version} ${appName}:latest`;
    console.log('\nОптимизация образа...');
    const sizeBefore = await $ `docker images ${appName}:${version} --format "{{.Size}}"`;
    await $ `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock alpine/dfimage ${appName}:${version} | docker build -t ${appName}:${version}-slim -`;
    const sizeAfter = await $ `docker images ${appName}:${version}-slim --format "{{.Size}}"`;
    console.log(`Размер: ${sizeBefore.stdout.trim()} -> ${sizeAfter.stdout.trim()}`);
}
async function fullBuildPipeline(projectPath) {
    console.log('\n=== Полный цикл сборки ===\n');
    const startTime = Date.now();
    const results = {
        lint: false,
        test: false,
        build: false,
        integration: false
    };
    try {
        const $project = $.cd(projectPath);
        console.log('\n1. Линтинг...');
        await $project `npm run lint`;
        results.lint = true;
        console.log('✓ Линтинг пройден');
        console.log('\n2. Юнит-тесты...');
        await $project `npm test -- --coverage`;
        results.test = true;
        console.log('✓ Тесты пройдены');
        console.log('\n3. Сборка...');
        await $project `npm run build`;
        results.build = true;
        console.log('✓ Сборка завершена');
        console.log('\n4. Интеграционные тесты...');
        await $project `npm run test:integration`;
        results.integration = true;
        console.log('✓ Интеграционные тесты пройдены');
    }
    catch (error) {
        console.error('\n✗ Ошибка сборки:', error.message);
    }
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n=== Отчёт о сборке ===');
    console.log(`Время: ${duration}с`);
    console.log(`Линтинг: ${results.lint ? '✓' : '✗'}`);
    console.log(`Тесты: ${results.test ? '✓' : '✗'}`);
    console.log(`Сборка: ${results.build ? '✓' : '✗'}`);
    console.log(`Интеграция: ${results.integration ? '✓' : '✗'}`);
    const allPassed = Object.values(results).every(r => r);
    return allPassed;
}
async function optimizeBuild(distDir) {
    console.log('\n=== Оптимизация сборки ===\n');
    const optimizations = [
        {
            name: 'Минификация JavaScript',
            cmd: $ `terser ${distDir}/**/*.js -o ${distDir} --compress --mangle`
        },
        {
            name: 'Минификация CSS',
            cmd: $ `cssnano ${distDir}/**/*.css ${distDir}/**/*.css`
        },
        {
            name: 'Оптимизация изображений',
            cmd: $ `find ${distDir} -name "*.png" -o -name "*.jpg" | xargs -I {} imagemin {} --out-dir=${distDir}`
        },
        {
            name: 'Сжатие файлов',
            cmd: $ `find ${distDir} -name "*.js" -o -name "*.css" -o -name "*.html" | xargs gzip -k`
        }
    ];
    for (const opt of optimizations) {
        console.log(`${opt.name}...`);
        try {
            await opt.cmd;
            console.log(`✓ ${opt.name} завершено`);
        }
        catch (error) {
            console.log(`⚠ ${opt.name} - пропущено`);
        }
    }
    const sizeBefore = await $ `du -sh ${distDir} | cut -f1`;
    console.log(`\nРазмер после оптимизации: ${sizeBefore.stdout.trim()}`);
}
async function cicdPipeline(branch) {
    console.log(`\n=== CI/CD Pipeline: ${branch} ===\n`);
    const steps = [
        { name: 'Получение кода', fn: async () => await $ `git checkout ${branch} && git pull` },
        { name: 'Установка зависимостей', fn: async () => await $ `npm ci` },
        { name: 'Линтинг', fn: async () => await $ `npm run lint` },
        { name: 'Тесты', fn: async () => await $ `npm test` },
        { name: 'Сборка', fn: async () => await $ `npm run build` },
        { name: 'Docker образ', fn: async () => await dockerBuild('app', branch) },
        { name: 'Пуш в реестр', fn: async () => await $ `docker push app:${branch}` }
    ];
    const results = [];
    for (const step of steps) {
        console.log(`${step.name}...`);
        try {
            await step.fn();
            console.log(`✓ ${step.name} завершено`);
            results.push({ step: step.name, status: 'success' });
        }
        catch (error) {
            console.error(`❌ ${step.name} - ошибка`);
            results.push({ step: step.name, status: 'failed', error: error.message });
            break;
        }
    }
    await sendBuildNotification(branch, results);
}
async function sendBuildNotification(branch, results) {
    const success = results.every(r => r.status === 'success');
    const icon = success ? '✅' : '❌';
    const status = success ? 'SUCCESS' : 'FAILED';
    const message = `
${icon} Build ${status}: ${branch}

${results.map(r => `${r.status === 'success' ? '✓' : '✗'} ${r.step}`).join('\n')}
  `;
    console.log(message);
}
async function monorepoBuilder(packages) {
    console.log('\n=== Сборка монорепозитория ===\n');
    const graph = await buildDependencyGraph(packages);
    const buildOrder = topologicalSort(graph);
    console.log('Порядок сборки:', buildOrder.join(' -> '));
    for (const pkg of buildOrder) {
        console.log(`\nСборка ${pkg}...`);
        const pkgPath = `packages/${pkg}`;
        const hasChanges = await $ `git diff HEAD^ HEAD --quiet ${pkgPath}`.nothrow();
        if (!hasChanges.ok) {
            const $pkg = $.cd(pkgPath);
            await $pkg `npm run build`;
            console.log(`✓ ${pkg} собран`);
        }
        else {
            console.log(`→ ${pkg} не изменялся, пропускаем`);
        }
    }
}
async function buildDependencyGraph(packages) {
    const graph = new Map();
    for (const pkg of packages) {
        const packageJson = await fs.readFile(`packages/${pkg}/package.json`, 'utf-8');
        const { dependencies = {} } = JSON.parse(packageJson);
        const localDeps = Object.keys(dependencies)
            .filter(dep => packages.includes(dep.replace('@myorg/', '')));
        graph.set(pkg, localDeps);
    }
    return graph;
}
function topologicalSort(graph) {
    const visited = new Set();
    const result = [];
    function visit(node) {
        if (visited.has(node))
            return;
        visited.add(node);
        const deps = graph.get(node) || [];
        deps.forEach(dep => visit(dep));
        result.push(node);
    }
    graph.forEach((_, node) => visit(node));
    return result;
}
if (import.meta.url === `file://${process.argv[1]}`) {
    const targets = [
        { name: 'Linux x64', platform: 'linux', arch: 'amd64', outputDir: 'dist/linux-x64' },
        { name: 'macOS x64', platform: 'darwin', arch: 'amd64', outputDir: 'dist/darwin-x64' },
        { name: 'Windows x64', platform: 'windows', arch: 'amd64', outputDir: 'dist/windows-x64' }
    ];
}
export { dockerBuild, cicdPipeline, optimizeBuild, monorepoBuilder, incrementalBuild, fullBuildPipeline, multiPlatformBuild };
//# sourceMappingURL=02-build-automation.js.map