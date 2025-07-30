/**
 * 01. Git Operations - Работа с Git
 * 
 * Показывает реальные сценарии работы с Git.
 * 
 * ВАЖНО: В @xec-sh/core нет встроенных интерактивных утилит.
 * Для интерактивного ввода используются стандартные средства Node.js.
 */

import { $ } from '@xec-sh/core';

// 1. Проверка состояния репозитория
async function checkGitStatus() {
  console.log('=== Git Status ===\n');

  // Проверяем, является ли директория git репозиторием
  const isGitRepo = await $`git rev-parse --is-inside-work-tree 2>/dev/null`.nothrow();

  if (!isGitRepo.ok) {
    console.log('Это не git репозиторий');
    return;
  }

  // Получаем информацию параллельно
  const [branch, status, lastCommit] = await Promise.all([
    $`git branch --show-current`,
    $`git status --short`,
    $`git log --oneline -1`
  ]);

  console.log(`Ветка: ${branch.stdout.trim()}`);
  console.log(`Последний коммит: ${lastCommit.stdout.trim()}`);

  if (status.stdout.trim()) {
    console.log('\nИзменённые файлы:');
    console.log(status.stdout);
  } else {
    console.log('\nРабочая директория чистая');
  }
}

// 2. Простой коммит с выбором файлов
async function simpleCommit(commitType: string, commitMessage: string) {
  // Проверяем статус
  const status = await $`git status --porcelain`;

  if (!status.stdout.trim()) {
    console.log('Нет изменений для коммита');
    return;
  }

  // Парсим изменённые файлы
  const files = status.stdout
    .trim()
    .split('\n')
    .map(line => ({
      status: line.substring(0, 2).trim(),
      file: line.substring(3)
    }));

  // Показываем изменения
  console.log('\nИзменённые файлы:');
  files.forEach(({ status, file }) => {
    const statusMap: { [key: string]: string } = {
      'M': 'Модифицирован',
      'A': 'Добавлен',
      'D': 'Удалён',
      '??': 'Новый'
    };
    console.log(`  [${statusMap[status] || status}] ${file}`);
  });

  // Добавляем все изменённые файлы (кроме новых)
  const filesToAdd = files
    .filter(f => f.status !== '??')
    .map(f => f.file);

  if (filesToAdd.length > 0) {
    await $`git add ${filesToAdd}`;
  }

  // Создаём коммит
  await $`git commit -m "${commitType}: ${commitMessage}"`;
  console.log('\n✓ Коммит создан успешно!');
}

// 3. Автоматическое развёртывание через Git
async function gitDeploy(branch: string = 'main', autoStash: boolean = true) {
  console.log(`\n=== Развёртывание из ветки ${branch} ===\n`);

  // Проверяем на несохранённые изменения
  const hasChanges = await $`git status --porcelain`;
  if (hasChanges.stdout.trim()) {
    if (autoStash) {
      await $`git stash push -m "Auto-stash before deploy"`;
      console.log('Изменения сохранены в stash');
    } else {
      throw new Error('Отмена развёртывания: есть несохранённые изменения');
    }
  }

  console.log('Обновление репозитория...');

  try {
    // Обновляем ветку
    await $`git fetch origin ${branch}`;
    console.log(`Переключение на ${branch}...`);

    await $`git checkout ${branch}`;
    await $`git pull origin ${branch}`;

    console.log('Установка зависимостей...');
    await $`npm ci`;

    console.log('Сборка проекта...');
    await $`npm run build`;

    console.log('✓ Развёртывание завершено!');

    // Показываем информацию о версии
    const version = await $`git describe --tags --always`;
    console.log(`\nРазвёрнута версия: ${version.stdout.trim()}`);

  } catch (error) {
    console.error('❌ Ошибка развёртывания');
    throw error;
  }
}

// 4. Массовое клонирование репозиториев
async function cloneMultipleRepos(repos: { name: string; url: string }[]) {
  console.log(`\n=== Клонирование ${repos.length} репозиториев ===\n`);

  const results = await Promise.all(
    repos.map(async (repo) => {
      console.log(`Клонирование ${repo.name}...`);

      try {
        await $`git clone ${repo.url} ${repo.name}`;
        console.log(`✓ ${repo.name} успешно клонирован`);
        return { repo: repo.name, status: 'success' };
      } catch (error) {
        console.error(`❌ ${repo.name} - ошибка`);
        return { repo: repo.name, status: 'failed', error: (error as Error).message };
      }
    })
  );

  // Отчёт
  const successful = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;

  console.log(`\nРезультат: успешно ${successful}, ошибок ${failed}`);
}

// 5. Git hooks автоматизация
async function setupGitHooks() {
  console.log('\n=== Настройка Git Hooks ===\n');

  const hooksDir = '.git/hooks';

  // Pre-commit hook
  const preCommitHook = `#!/bin/sh
# Проверка кода перед коммитом

echo "Запуск проверок..."

# Linting
npm run lint || {
  echo "Ошибки линтера. Коммит отменён."
  exit 1
}

# Тесты
npm test || {
  echo "Тесты не пройдены. Коммит отменён."
  exit 1
}

echo "Все проверки пройдены!"
`;

  await $`echo ${preCommitHook} > ${hooksDir}/pre-commit`;
  await $`chmod +x ${hooksDir}/pre-commit`;

  console.log('✓ Pre-commit hook установлен');

  // Commit-msg hook
  const commitMsgHook = `#!/bin/sh
# Проверка формата сообщения коммита

commit_regex='^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .{1,50}'

if ! grep -qE "$commit_regex" "$1"; then
  echo "Ошибка: неправильный формат сообщения коммита!"
  echo "Формат: <type>(<scope>): <subject>"
  echo "Пример: feat(auth): add login functionality"
  exit 1
fi
`;

  await $`echo ${commitMsgHook} > ${hooksDir}/commit-msg`;
  await $`chmod +x ${hooksDir}/commit-msg`;

  console.log('✓ Commit-msg hook установлен');
}

// 6. Анализ истории коммитов
async function analyzeGitHistory() {
  console.log('\n=== Анализ Git истории ===\n');

  // Статистика по авторам
  const authors = await $`git shortlog -sn --all`;
  console.log('Топ авторов:');
  console.log(authors.stdout);

  // Самые изменяемые файлы
  const hotFiles = await $`git log --pretty=format: --name-only | sort | uniq -c | sort -rg | head -10`;
  console.log('\nЧасто изменяемые файлы:');
  console.log(hotFiles.stdout);

  // Активность по дням недели
  const dayOfWeek = await $`git log --format="%ad" --date=format:"%A" | sort | uniq -c`;
  console.log('\nАктивность по дням:');
  console.log(dayOfWeek.stdout);
}

// 7. Работа с ветками
async function branchManagement(autoDelete: boolean = false) {
  console.log('\n=== Управление ветками ===\n');

  // Показываем все ветки
  const branches = await $`git branch -a`;
  console.log('Все ветки:');
  console.log(branches.stdout);

  // Находим слитые ветки
  const merged = await $`git branch --merged main | grep -v "main\|master"`.nothrow();

  if (merged.ok && merged.stdout.trim()) {
    console.log('\nСлитые ветки:');
    const mergedBranches = merged.stdout.trim().split('\n');
    mergedBranches.forEach(branch => console.log(`  - ${branch.trim()}`));

    if (autoDelete) {
      console.log('\nУдаление слитых веток...');
      for (const branch of mergedBranches) {
        const cleanBranch = branch.trim();
        await $`git branch -d ${cleanBranch}`;
        console.log(`Удалена ветка: ${cleanBranch}`);
      }
    } else {
      console.log(`\nДля удаления веток используйте параметр autoDelete: true`);
    }
  } else {
    console.log('\nНет слитых веток');
  }
}

// 8. Git bisect для поиска багов
async function gitBisectHelper(
  goodCommit: string = 'HEAD~10',
  badCommit: string = 'HEAD',
  testCommand: string = 'npm test'
) {
  console.log('\n=== Git Bisect Helper ===\n');
  console.log(`Хороший коммит: ${goodCommit}`);
  console.log(`Плохой коммит: ${badCommit}`);
  console.log(`Команда теста: ${testCommand}`);

  // Начинаем bisect
  await $`git bisect start`;
  await $`git bisect bad ${badCommit}`;
  await $`git bisect good ${goodCommit}`;

  console.log('\nНачинаем поиск...');

  // Автоматический bisect
  try {
    await $`git bisect run ${testCommand}`;

    // Получаем результат
    const result = await $`git bisect log | tail -20`;
    console.log('\nРезультат bisect:');
    console.log(result.stdout);
  } finally {
    // Завершаем bisect
    await $`git bisect reset`;
  }
}

// Примеры использования
if (import.meta.url === `file://${process.argv[1]}`) {
  // Простое демо без интерактива
  const args = process.argv.slice(2);
  const action = args[0] || 'status';

  console.log('Git Operations Demo');
  console.log('===================');
  console.log('Доступные команды:');
  console.log('  status   - проверить статус');
  console.log('  commit   - создать коммит');
  console.log('  deploy   - развернуть из git');
  console.log('  hooks    - настроить hooks');
  console.log('  analyze  - анализ истории');
  console.log('  branches - управление ветками');
  console.log('\nВыполняется:', action);

  switch (action) {
    case 'status':
      await checkGitStatus();
      break;
    case 'commit':
      await simpleCommit('feat', 'Пример коммита');
      break;
    case 'deploy':
      await gitDeploy('main', true);
      break;
    case 'hooks':
      await setupGitHooks();
      break;
    case 'analyze':
      await analyzeGitHistory();
      break;
    case 'branches':
      await branchManagement(false);
      break;
    default:
      console.log('Неизвестная команда:', action);
  }
}

export {
  gitDeploy,
  simpleCommit,
  setupGitHooks,
  checkGitStatus,
  gitBisectHelper,
  branchManagement,
  analyzeGitHistory,
  cloneMultipleRepos
};
