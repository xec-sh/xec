/**
 * 02. Build Automation - Автоматизация сборки
 * 
 * Показывает реальные сценарии автоматизации сборки.
 * 
 * ВАЖНО: В @xec-sh/core нет встроенных прогресс-баров и интерактива.
 * Для отображения прогресса используются стандартные средства Node.js.
 */

import * as path from 'path';
import { $ } from '@xec-sh/core';
import * as fs from 'fs/promises';

// 1. Мультиплатформенная сборка
interface BuildTarget {
  name: string;
  platform: string;
  arch: string;
  outputDir: string;
}

async function multiPlatformBuild(targets: BuildTarget[]) {
  console.log(`\n=== Мультиплатформенная сборка ===\n`);
  
  const results = [];
  let completed = 0;
  
  for (const target of targets) {
    console.log(`\nСборка для ${target.name}... (${completed + 1}/${targets.length})`);
    
    try {
      // Очищаем директорию
      await $`rm -rf ${target.outputDir}`;
      await $`mkdir -p ${target.outputDir}`;
      
      // Создаём новый экземпляр $ с переменными окружения
      const $build = $.with({
        env: {
          GOOS: target.platform,
          GOARCH: target.arch,
          CGO_ENABLED: '0'
        }
      });
      
      // Собираем
      await $build`go build -o ${target.outputDir}/app-${target.platform}-${target.arch} ./cmd/app`;
      
      // Сжимаем
      await $`tar -czf ${target.outputDir}.tar.gz -C ${target.outputDir} .`;
      
      results.push({ target: target.name, status: 'success' });
      completed++;
      console.log(`✓ ${target.name} собран успешно`);
      
    } catch (error) {
      results.push({ target: target.name, status: 'failed', error: (error as Error).message });
      completed++;
      console.error(`❌ ${target.name} - ошибка сборки`);
    }
  }
  
  // Отчёт
  console.log('\nРезультаты сборки:');
  results.forEach(r => {
    const icon = r.status === 'success' ? '✓' : '✗';
    console.log(`  ${icon} ${r.target}: ${r.status}`);
  });
}

// 2. Инкрементальная сборка
async function incrementalBuild(srcDir: string, buildDir: string) {
  console.log('\n=== Инкрементальная сборка ===\n');
  
  // Создаём директорию сборки
  await $`mkdir -p ${buildDir}`;
  
  // Находим все исходные файлы
  const sourceFiles = await $`find ${srcDir} -name "*.ts" -type f`;
  const files = sourceFiles.stdout.trim().split('\n').filter(Boolean);
  
  let rebuilt = 0;
  console.log('Проверка файлов...');
  
  for (const srcFile of files) {
    const relativePath = path.relative(srcDir, srcFile);
    const outFile = path.join(buildDir, relativePath.replace('.ts', '.js'));
    
    // Проверяем, нужна ли пересборка
    const needsRebuild = await shouldRebuild(srcFile, outFile);
    
    if (needsRebuild) {
      console.log(`Компиляция ${relativePath}...`);
      
      // Создаём директорию
      await $`mkdir -p ${path.dirname(outFile)}`;
      
      // Компилируем
      await $`tsc ${srcFile} --outFile ${outFile} --target es2020 --module commonjs`;
      rebuilt++;
    }
  }
  
  console.log(`✓ Сборка завершена. Пересобрано файлов: ${rebuilt}`);
}

async function shouldRebuild(srcFile: string, outFile: string): Promise<boolean> {
  try {
    const [srcStat, outStat] = await Promise.all([
      fs.stat(srcFile),
      fs.stat(outFile)
    ]);
    
    return srcStat.mtime > outStat.mtime;
  } catch {
    // Если выходной файл не существует
    return true;
  }
}

// 3. Docker сборка
async function dockerBuild(appName: string, version: string) {
  console.log(`\n=== Docker сборка: ${appName}:${version} ===\n`);
  
  const stages = [
    { name: 'base', description: 'Базовый образ' },
    { name: 'dependencies', description: 'Установка зависимостей' },
    { name: 'build', description: 'Сборка приложения' },
    { name: 'runtime', description: 'Финальный образ' }
  ];
  
  // Мультистейдж сборка
  for (const stage of stages) {
    console.log(`${stage.description}...`);
    
    try {
      await $`docker build --target ${stage.name} -t ${appName}:${stage.name}-${version} .`;
      console.log(`✓ ${stage.description} завершено`);
    } catch (error) {
      console.error(`❌ ${stage.description} - ошибка`);
      throw error;
    }
  }
  
  // Тегирование
  console.log('\nТегирование образов...');
  await $`docker tag ${appName}:runtime-${version} ${appName}:${version}`;
  await $`docker tag ${appName}:${version} ${appName}:latest`;
  
  // Оптимизация
  console.log('\nОптимизация образа...');
  const sizeBefore = await $`docker images ${appName}:${version} --format "{{.Size}}"`;
  
  await $`docker run --rm -v /var/run/docker.sock:/var/run/docker.sock alpine/dfimage ${appName}:${version} | docker build -t ${appName}:${version}-slim -`;
  
  const sizeAfter = await $`docker images ${appName}:${version}-slim --format "{{.Size}}"`;
  console.log(`Размер: ${sizeBefore.stdout.trim()} -> ${sizeAfter.stdout.trim()}`);
}

// 4. Комплексная сборка с тестами
async function fullBuildPipeline(projectPath: string) {
  console.log('\n=== Полный цикл сборки ===\n');
  
  const startTime = Date.now();
  const results = {
    lint: false,
    test: false,
    build: false,
    integration: false
  };
  
  try {
    // Создаём $ с рабочей директорией
    const $project = $.cd(projectPath);
    
    // 1. Линтинг
    console.log('\n1. Линтинг...');
    await $project`npm run lint`;
    results.lint = true;
    console.log('✓ Линтинг пройден');
    
    // 2. Юнит-тесты
    console.log('\n2. Юнит-тесты...');
    await $project`npm test -- --coverage`;
    results.test = true;
    console.log('✓ Тесты пройдены');
    
    // 3. Сборка
    console.log('\n3. Сборка...');
    await $project`npm run build`;
    results.build = true;
    console.log('✓ Сборка завершена');
    
    // 4. Интеграционные тесты
    console.log('\n4. Интеграционные тесты...');
    await $project`npm run test:integration`;
    results.integration = true;
    console.log('✓ Интеграционные тесты пройдены');
    
  } catch (error) {
    console.error('\n✗ Ошибка сборки:', (error as Error).message);
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // Отчёт
  console.log('\n=== Отчёт о сборке ===');
  console.log(`Время: ${duration}с`);
  console.log(`Линтинг: ${results.lint ? '✓' : '✗'}`);
  console.log(`Тесты: ${results.test ? '✓' : '✗'}`);
  console.log(`Сборка: ${results.build ? '✓' : '✗'}`);
  console.log(`Интеграция: ${results.integration ? '✓' : '✗'}`);
  
  const allPassed = Object.values(results).every(r => r);
  return allPassed;
}

// 5. Оптимизация сборки
async function optimizeBuild(distDir: string) {
  console.log('\n=== Оптимизация сборки ===\n');
  
  const optimizations = [
    {
      name: 'Минификация JavaScript',
      cmd: $`terser ${distDir}/**/*.js -o ${distDir} --compress --mangle`
    },
    {
      name: 'Минификация CSS',
      cmd: $`cssnano ${distDir}/**/*.css ${distDir}/**/*.css`
    },
    {
      name: 'Оптимизация изображений',
      cmd: $`find ${distDir} -name "*.png" -o -name "*.jpg" | xargs -I {} imagemin {} --out-dir=${distDir}`
    },
    {
      name: 'Сжатие файлов',
      cmd: $`find ${distDir} -name "*.js" -o -name "*.css" -o -name "*.html" | xargs gzip -k`
    }
  ];
  
  for (const opt of optimizations) {
    console.log(`${opt.name}...`);
    
    try {
      await opt.cmd;
      console.log(`✓ ${opt.name} завершено`);
    } catch (error) {
      console.log(`⚠ ${opt.name} - пропущено`);
    }
  }
  
  // Показываем результаты
  const sizeBefore = await $`du -sh ${distDir} | cut -f1`;
  console.log(`\nРазмер после оптимизации: ${sizeBefore.stdout.trim()}`);
}

// 6. CI/CD пайплайн
async function cicdPipeline(branch: string) {
  console.log(`\n=== CI/CD Pipeline: ${branch} ===\n`);
  
  const steps = [
    { name: 'Получение кода', fn: async () => await $`git checkout ${branch} && git pull` },
    { name: 'Установка зависимостей', fn: async () => await $`npm ci` },
    { name: 'Линтинг', fn: async () => await $`npm run lint` },
    { name: 'Тесты', fn: async () => await $`npm test` },
    { name: 'Сборка', fn: async () => await $`npm run build` },
    { name: 'Docker образ', fn: async () => await dockerBuild('app', branch) },
    { name: 'Пуш в реестр', fn: async () => await $`docker push app:${branch}` }
  ];
  
  const results = [];
  
  for (const step of steps) {
    console.log(`${step.name}...`);
    
    try {
      await step.fn();
      console.log(`✓ ${step.name} завершено`);
      results.push({ step: step.name, status: 'success' });
    } catch (error) {
      console.error(`❌ ${step.name} - ошибка`);
      results.push({ step: step.name, status: 'failed', error: (error as Error).message });
      
      // Останавливаемся на ошибке
      break;
    }
  }
  
  // Отправляем уведомление
  await sendBuildNotification(branch, results);
}

async function sendBuildNotification(branch: string, results: any[]) {
  const success = results.every(r => r.status === 'success');
  const icon = success ? '✅' : '❌';
  const status = success ? 'SUCCESS' : 'FAILED';
  
  const message = `
${icon} Build ${status}: ${branch}

${results.map(r => `${r.status === 'success' ? '✓' : '✗'} ${r.step}`).join('\n')}
  `;
  
  // Отправка в Slack/Discord/etc
  console.log(message);
}

// 7. Монорепо сборка
async function monorepoBuilder(packages: string[]) {
  console.log('\n=== Сборка монорепозитория ===\n');
  
  // Определяем зависимости
  const graph = await buildDependencyGraph(packages);
  const buildOrder = topologicalSort(graph);
  
  console.log('Порядок сборки:', buildOrder.join(' -> '));
  
  // Собираем в правильном порядке
  for (const pkg of buildOrder) {
    console.log(`\nСборка ${pkg}...`);
    
    const pkgPath = `packages/${pkg}`;
    
    // Проверяем, изменился ли пакет
    const hasChanges = await $`git diff HEAD^ HEAD --quiet ${pkgPath}`.nothrow();
    
    if (!hasChanges.ok) {
      const $pkg = $.cd(pkgPath);
      await $pkg`npm run build`;
      console.log(`✓ ${pkg} собран`);
    } else {
      console.log(`→ ${pkg} не изменялся, пропускаем`);
    }
  }
}

async function buildDependencyGraph(packages: string[]): Promise<Map<string, string[]>> {
  const graph = new Map<string, string[]>();
  
  for (const pkg of packages) {
    const packageJson = await fs.readFile(`packages/${pkg}/package.json`, 'utf-8');
    const { dependencies = {} } = JSON.parse(packageJson);
    
    const localDeps = Object.keys(dependencies)
      .filter(dep => packages.includes(dep.replace('@myorg/', '')));
    
    graph.set(pkg, localDeps);
  }
  
  return graph;
}

function topologicalSort(graph: Map<string, string[]>): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  
  function visit(node: string) {
    if (visited.has(node)) return;
    visited.add(node);
    
    const deps = graph.get(node) || [];
    deps.forEach(dep => visit(dep));
    
    result.push(node);
  }
  
  graph.forEach((_, node) => visit(node));
  return result;
}

// Пример использования
if (import.meta.url === `file://${process.argv[1]}`) {
  // Примеры целей сборки
  const targets: BuildTarget[] = [
    { name: 'Linux x64', platform: 'linux', arch: 'amd64', outputDir: 'dist/linux-x64' },
    { name: 'macOS x64', platform: 'darwin', arch: 'amd64', outputDir: 'dist/darwin-x64' },
    { name: 'Windows x64', platform: 'windows', arch: 'amd64', outputDir: 'dist/windows-x64' }
  ];
  
  // await multiPlatformBuild(targets);
  // await dockerBuild('myapp', '1.0.0');
  // await fullBuildPipeline('.');
}

export {
  dockerBuild,
  cicdPipeline,
  optimizeBuild,
  monorepoBuilder,
  incrementalBuild,
  fullBuildPipeline,
  multiPlatformBuild
};
