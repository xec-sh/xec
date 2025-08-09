import { $ } from '@xec-sh/core';
const userInput = "'; rm -rf /; echo '";
const filename = "file with spaces.txt";
const pattern = "*.txt";
await $ `echo ${userInput}`;
await $ `touch ${filename}`;
await $ `ls ${pattern}`;
const wildcardPattern = "*.js";
const escaped = await $ `echo ${wildcardPattern}`;
console.log('Экранированный:', escaped.stdout);
const jsFiles = await $ `ls *.js`;
console.log('JS файлы:', jsFiles.stdout);
const dangerousCommand = "echo 'test' && rm -rf /";
console.log('Опасная команда:', dangerousCommand);
await $ `echo ${dangerousCommand}`;
const files = ["file1.txt", "file 2.txt", "file'3.txt", 'file"4.txt'];
const args = ["-v", "--force", "--name=test value"];
await $ `touch ${files}`;
await $ `ls ${args} ${files}`;
const outputFile = "result.txt";
const excludePatterns = ["*.tmp", "*.log"];
await $ `command -v -f --output=${outputFile} --exclude=${excludePatterns[0]} --exclude=${excludePatterns[1]}`;
const specialChars = [
    "$HOME",
    "$(whoami)",
    "`date`",
    "${PATH}",
    "!!",
    "#comment",
    "&background",
    "|pipe",
    ">redirect",
    "<input"
];
for (const char of specialChars) {
    const result = await $ `echo ${char}`;
    console.log(`${char} -> ${result.stdout.trim()}`);
}
const userInput = "test*.txt; rm -rf /";
console.log('Пользовательский ввод:', userInput);
try {
    const found = await $ `find . -name ${userInput} -type f`.nothrow();
    if (found.ok) {
        console.log('Найденные файлы:', found.stdout);
    }
    else {
        console.log('Файлы не найдены');
    }
}
catch (error) {
    console.log('Ошибка поиска');
}
function buildCommand(action, files, flags) {
    return $ `${action} ${flags} ${files}`;
}
const action = "tar";
const tarFlags = ["-czf", "archive.tar.gz"];
const filesToArchive = ["src/", "package.json", "README.md"];
await buildCommand(action, filesToArchive, tarFlags);
const shells = ['/bin/bash', '/bin/sh', '/bin/zsh'];
for (const shell of shells) {
    const $withShell = $.with({ shell });
    const testString = "Hello $USER from $(pwd)";
    const result = await $withShell `echo ${testString}`;
    console.log(`${shell}: ${result.stdout.trim()}`);
}
async function safeQuery(table, condition) {
    const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
    const safeCondition = condition;
    const query = `SELECT * FROM ${safeTable} WHERE ${safeCondition}`;
    await $ `echo ${query} | psql -d mydb`;
}
function debugEscaping(value) {
    console.log('\n=== Отладка экранирования ===');
    console.log('Исходное значение:', value);
    console.log('Тип:', typeof value);
    if (typeof value === 'string') {
        console.log('Длина:', value.length);
        console.log('Содержит пробелы:', value.includes(' '));
        console.log('Содержит кавычки:', value.includes('"') || value.includes("'"));
        console.log('Содержит спецсимволы:', /[$`!*?#&|<>(){}\[\];]/.test(value));
    }
    if (Array.isArray(value)) {
        console.log('Элементов:', value.length);
    }
    if (value && typeof value === 'object') {
        console.log('Ключи:', Object.keys(value));
    }
}
const testValues = [
    "simple",
    "with spaces",
    "with'quotes",
    'with"double"quotes',
    "with$pecial",
    ["array", "of", "values"],
    { key: "value", flag: true }
];
for (const value of testValues) {
    debugEscaping(value);
    try {
        const result = await $ `echo ${value}`;
        console.log('Результат:', result.stdout.trim());
    }
    catch (error) {
        console.log('Ошибка:', error.message);
    }
}
console.log('\n=== Безопасность ===');
const maliciousInput = "test; echo 'HACKED'";
console.log('Попытка инъекции:', maliciousInput);
const safeResult = await $ `echo ${maliciousInput}`;
console.log('Безопасный результат:', safeResult.stdout.trim());
const pathWithSpaces = "/tmp/my test directory";
const fileWithSpecialChars = "file'with\"quotes.txt";
await $ `mkdir -p ${pathWithSpaces}`;
await $ `touch ${pathWithSpaces}/${fileWithSpecialChars}`;
const checkFile = await $ `ls -la ${pathWithSpaces}/${fileWithSpecialChars}`.nothrow();
if (checkFile.ok) {
    console.log('\nФайл создан успешно');
}
await $ `rm -rf ${pathWithSpaces}`.nothrow();
await $ `rm -f ${files} archive.tar.gz`.nothrow();
//# sourceMappingURL=05-shell-escaping.js.map