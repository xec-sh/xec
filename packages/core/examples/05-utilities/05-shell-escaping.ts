/**
 * 05. Shell Escaping - Экранирование команд
 * 
 * Показывает безопасную работу с командами shell.
 * 
 * ВАЖНО: В @xec-sh/core экранирование происходит автоматически
 * при использовании шаблонных литералов. Нет отдельного API
 * для экранирования.
 */

import { $ } from '@xec-sh/core';

// 1. Автоматическое экранирование в шаблонных литералах
const userInput = "'; rm -rf /; echo '";
const filename = "file with spaces.txt";
const pattern = "*.txt";

// Безопасно! Всё автоматически экранируется
await $`echo ${userInput}`; // Выведет: '; rm -rf /; echo '
await $`touch ${filename}`; // Создаст файл с пробелами
await $`ls ${pattern}`; // Экранирует *, не раскрывает glob

// 2. Паттерны и glob
const wildcardPattern = "*.js";

// Значение экранируется автоматически
const escaped = await $`echo ${wildcardPattern}`;
console.log('Экранированный:', escaped.stdout); // *.js

// Для использования glob нужно вставлять паттерн прямо в строку
const jsFiles = await $`ls *.js`;
console.log('JS файлы:', jsFiles.stdout);

// 3. Автоматическое экранирование опасных команд
const dangerousCommand = "echo 'test' && rm -rf /";

console.log('Опасная команда:', dangerousCommand);

// Команда автоматически экранируется и будет выведена как текст
await $`echo ${dangerousCommand}`;
// Выведет буквально: echo 'test' && rm -rf /

// 4. Экранирование массивов
const files = ["file1.txt", "file 2.txt", "file'3.txt", 'file"4.txt'];
const args = ["-v", "--force", "--name=test value"];

// Массивы автоматически экранируются
await $`touch ${files}`;
await $`ls ${args} ${files}`;

// 5. Работа с параметрами команд
// В @xec-sh/core объекты не преобразуются в флаги автоматически
// Нужно передавать параметры явно
const outputFile = "result.txt";
const excludePatterns = ["*.tmp", "*.log"];

// Создаём команду с явными флагами
await $`command -v -f --output=${outputFile} --exclude=${excludePatterns[0]} --exclude=${excludePatterns[1]}`;

// 6. Обработка специальных символов
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

// Все спецсимволы будут экранированы
for (const char of specialChars) {
  const result = await $`echo ${char}`;
  console.log(`${char} -> ${result.stdout.trim()}`);
}

// 7. Безопасная работа с пользовательским вводом
// Симулируем пользовательский ввод
const userInput = "test*.txt; rm -rf /";

console.log('Пользовательский ввод:', userInput);

// Безопасно используем пользовательский ввод
// Специальные символы будут экранированы
try {
  const found = await $`find . -name ${userInput} -type f`.nothrow();
  if (found.ok) {
    console.log('Найденные файлы:', found.stdout);
  } else {
    console.log('Файлы не найдены');
  }
} catch (error) {
  console.log('Ошибка поиска');
}

// 8. Построение сложных команд
function buildCommand(action: string, files: string[], flags: string[]) {
  // Безопасно строим команды с массивами
  return $`${action} ${flags} ${files}`;
}

const action = "tar";
const tarFlags = ["-czf", "archive.tar.gz"];
const filesToArchive = ["src/", "package.json", "README.md"];

// Массивы автоматически обрабатываются правильно
await buildCommand(action, filesToArchive, tarFlags);
// Выполнит: tar -czf archive.tar.gz src/ package.json README.md

// 9. Экранирование для разных shell
const shells = ['/bin/bash', '/bin/sh', '/bin/zsh'];

for (const shell of shells) {
  // Создаём новый экземпляр $ с указанной оболочкой
  const $withShell = $.with({ shell });
  
  // Разные shell могут требовать разного экранирования
  const testString = "Hello $USER from $(pwd)";
  const result = await $withShell`echo ${testString}`;
  console.log(`${shell}: ${result.stdout.trim()}`);
}

// 10. Безопасная работа с SQL
async function safeQuery(table: string, condition: string) {
  // Никогда не вставляйте пользовательский ввод напрямую в SQL!
  // Но если нужно использовать в shell-команде:
  
  // Экранируем опасные символы SQL вручную
  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '');
  // condition будет автоматически экранирован при использовании в шаблоне
  const safeCondition = condition;
  
  // Используем безопасные значения
  const query = `SELECT * FROM ${safeTable} WHERE ${safeCondition}`;
  // Экранирование происходит автоматически
  await $`echo ${query} | psql -d mydb`;
}

// 11. Отладка экранирования
function debugEscaping(value: any) {
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

// Тестирование
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
    const result = await $`echo ${value}`;
    console.log('Результат:', result.stdout.trim());
  } catch (error) {
    console.log('Ошибка:', error.message);
  }
}

// 12. Примеры безопасного и небезопасного кода
console.log('\n=== Безопасность ===');

// ❌ ОПАСНО: Никогда не используйте eval или exec с конкатенацией строк!
// const userInput = getUserInput();
// const command = `rm -rf ${userInput}`; // ОПАСНО!
// eval(command); // НИКОГДА НЕ ДЕЛАЙТЕ ТАК!

// ✅ БЕЗОПАСНО: Используйте шаблонные литералы $
// const userInput = getUserInput();
// await $`rm -rf ${userInput}`; // Автоматически экранируется

// Демонстрация безопасности
const maliciousInput = "test; echo 'HACKED'";
console.log('Попытка инъекции:', maliciousInput);
const safeResult = await $`echo ${maliciousInput}`;
console.log('Безопасный результат:', safeResult.stdout.trim());
// Выведет буквально: test; echo 'HACKED'

// 13. Работа с путями содержащими пробелы
const pathWithSpaces = "/tmp/my test directory";
const fileWithSpecialChars = "file'with\"quotes.txt";

// Создаём директорию и файл с пробелами/кавычками
await $`mkdir -p ${pathWithSpaces}`;
await $`touch ${pathWithSpaces}/${fileWithSpecialChars}`;

// Проверяем создание
const checkFile = await $`ls -la ${pathWithSpaces}/${fileWithSpecialChars}`.nothrow();
if (checkFile.ok) {
  console.log('\nФайл создан успешно');
}

// Очистка тестовых файлов
await $`rm -rf ${pathWithSpaces}`.nothrow();
await $`rm -f ${files} archive.tar.gz`.nothrow();
