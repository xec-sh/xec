import { $ } from '@xec-sh/core';
async function checkGitStatus() {
    console.log('=== Git Status ===\n');
    const isGitRepo = await $ `git rev-parse --is-inside-work-tree 2>/dev/null`.nothrow();
    if (!isGitRepo.ok) {
        console.log('Это не git репозиторий');
        return;
    }
    const [branch, status, lastCommit] = await Promise.all([
        $ `git branch --show-current`,
        $ `git status --short`,
        $ `git log --oneline -1`
    ]);
    console.log(`Ветка: ${branch.stdout.trim()}`);
    console.log(`Последний коммит: ${lastCommit.stdout.trim()}`);
    if (status.stdout.trim()) {
        console.log('\nИзменённые файлы:');
        console.log(status.stdout);
    }
    else {
        console.log('\nРабочая директория чистая');
    }
}
async function simpleCommit(commitType, commitMessage) {
    const status = await $ `git status --porcelain`;
    if (!status.stdout.trim()) {
        console.log('Нет изменений для коммита');
        return;
    }
    const files = status.stdout
        .trim()
        .split('\n')
        .map(line => ({
        status: line.substring(0, 2).trim(),
        file: line.substring(3)
    }));
    console.log('\nИзменённые файлы:');
    files.forEach(({ status, file }) => {
        const statusMap = {
            'M': 'Модифицирован',
            'A': 'Добавлен',
            'D': 'Удалён',
            '??': 'Новый'
        };
        console.log(`  [${statusMap[status] || status}] ${file}`);
    });
    const filesToAdd = files
        .filter(f => f.status !== '??')
        .map(f => f.file);
    if (filesToAdd.length > 0) {
        await $ `git add ${filesToAdd}`;
    }
    await $ `git commit -m "${commitType}: ${commitMessage}"`;
    console.log('\n✓ Коммит создан успешно!');
}
async function gitDeploy(branch = 'main', autoStash = true) {
    console.log(`\n=== Развёртывание из ветки ${branch} ===\n`);
    const hasChanges = await $ `git status --porcelain`;
    if (hasChanges.stdout.trim()) {
        if (autoStash) {
            await $ `git stash push -m "Auto-stash before deploy"`;
            console.log('Изменения сохранены в stash');
        }
        else {
            throw new Error('Отмена развёртывания: есть несохранённые изменения');
        }
    }
    console.log('Обновление репозитория...');
    try {
        await $ `git fetch origin ${branch}`;
        console.log(`Переключение на ${branch}...`);
        await $ `git checkout ${branch}`;
        await $ `git pull origin ${branch}`;
        console.log('Установка зависимостей...');
        await $ `npm ci`;
        console.log('Сборка проекта...');
        await $ `npm run build`;
        console.log('✓ Развёртывание завершено!');
        const version = await $ `git describe --tags --always`;
        console.log(`\nРазвёрнута версия: ${version.stdout.trim()}`);
    }
    catch (error) {
        console.error('❌ Ошибка развёртывания');
        throw error;
    }
}
async function cloneMultipleRepos(repos) {
    console.log(`\n=== Клонирование ${repos.length} репозиториев ===\n`);
    const results = await Promise.all(repos.map(async (repo) => {
        console.log(`Клонирование ${repo.name}...`);
        try {
            await $ `git clone ${repo.url} ${repo.name}`;
            console.log(`✓ ${repo.name} успешно клонирован`);
            return { repo: repo.name, status: 'success' };
        }
        catch (error) {
            console.error(`❌ ${repo.name} - ошибка`);
            return { repo: repo.name, status: 'failed', error: error.message };
        }
    }));
    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;
    console.log(`\nРезультат: успешно ${successful}, ошибок ${failed}`);
}
async function setupGitHooks() {
    console.log('\n=== Настройка Git Hooks ===\n');
    const hooksDir = '.git/hooks';
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
    await $ `echo ${preCommitHook} > ${hooksDir}/pre-commit`;
    await $ `chmod +x ${hooksDir}/pre-commit`;
    console.log('✓ Pre-commit hook установлен');
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
    await $ `echo ${commitMsgHook} > ${hooksDir}/commit-msg`;
    await $ `chmod +x ${hooksDir}/commit-msg`;
    console.log('✓ Commit-msg hook установлен');
}
async function analyzeGitHistory() {
    console.log('\n=== Анализ Git истории ===\n');
    const authors = await $ `git shortlog -sn --all`;
    console.log('Топ авторов:');
    console.log(authors.stdout);
    const hotFiles = await $ `git log --pretty=format: --name-only | sort | uniq -c | sort -rg | head -10`;
    console.log('\nЧасто изменяемые файлы:');
    console.log(hotFiles.stdout);
    const dayOfWeek = await $ `git log --format="%ad" --date=format:"%A" | sort | uniq -c`;
    console.log('\nАктивность по дням:');
    console.log(dayOfWeek.stdout);
}
async function branchManagement(autoDelete = false) {
    console.log('\n=== Управление ветками ===\n');
    const branches = await $ `git branch -a`;
    console.log('Все ветки:');
    console.log(branches.stdout);
    const merged = await $ `git branch --merged main | grep -v "main\|master"`.nothrow();
    if (merged.ok && merged.stdout.trim()) {
        console.log('\nСлитые ветки:');
        const mergedBranches = merged.stdout.trim().split('\n');
        mergedBranches.forEach(branch => console.log(`  - ${branch.trim()}`));
        if (autoDelete) {
            console.log('\nУдаление слитых веток...');
            for (const branch of mergedBranches) {
                const cleanBranch = branch.trim();
                await $ `git branch -d ${cleanBranch}`;
                console.log(`Удалена ветка: ${cleanBranch}`);
            }
        }
        else {
            console.log(`\nДля удаления веток используйте параметр autoDelete: true`);
        }
    }
    else {
        console.log('\nНет слитых веток');
    }
}
async function gitBisectHelper(goodCommit = 'HEAD~10', badCommit = 'HEAD', testCommand = 'npm test') {
    console.log('\n=== Git Bisect Helper ===\n');
    console.log(`Хороший коммит: ${goodCommit}`);
    console.log(`Плохой коммит: ${badCommit}`);
    console.log(`Команда теста: ${testCommand}`);
    await $ `git bisect start`;
    await $ `git bisect bad ${badCommit}`;
    await $ `git bisect good ${goodCommit}`;
    console.log('\nНачинаем поиск...');
    try {
        await $ `git bisect run ${testCommand}`;
        const result = await $ `git bisect log | tail -20`;
        console.log('\nРезультат bisect:');
        console.log(result.stdout);
    }
    finally {
        await $ `git bisect reset`;
    }
}
if (import.meta.url === `file://${process.argv[1]}`) {
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
export { gitDeploy, simpleCommit, setupGitHooks, checkGitStatus, gitBisectHelper, branchManagement, analyzeGitHistory, cloneMultipleRepos };
//# sourceMappingURL=01-git-operations.js.map