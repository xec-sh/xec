#!/usr/bin/env node

// Демонстрация работы $.raw функции

console.log('🚀 Демонстрация $.raw функции\n');

// Пример 1: Глобальные паттерны
console.log('1. Глобальные паттерны:');
const pattern = '*.txt';
console.log(`   Обычный вызов: $\`ls \${pattern}\``);
console.log(`   Результат: ls '*.txt' (экранированный)`);
console.log(`   Raw вызов: $.raw\`ls \${pattern}\``);
console.log(`   Результат: ls *.txt (неэкранированный)\n`);

// Пример 2: Пайпы
console.log('2. Пайпы:');
const pipeCommand = 'ps aux | grep node';
console.log(`   Raw вызов: $.raw\`\${pipeCommand}\``);
console.log(`   Результат: ${pipeCommand} (пайп работает)\n`);

// Пример 3: Сравнение с обычной функцией
console.log('3. Сравнение экранирования:');
const userInput = 'file name.txt';
console.log(`   Обычный вызов: $\`echo \${userInput}\``);
console.log(`   Результат: echo 'file name.txt' (безопасно)`);
console.log(`   Raw вызов: $.raw\`echo \${userInput}\``);
console.log(`   Результат: echo file name.txt (может быть опасно)\n`);

// Пример 4: Сложные shell конструкции
console.log('4. Сложные shell конструкции:');
const complexCommand = 'echo "hello" | tee /tmp/test.txt && cat /tmp/test.txt';
console.log(`   Raw вызов: $.raw\`\${complexCommand}\``);
console.log(`   Результат: ${complexCommand}\n`);

console.log('⚠️  ВАЖНО: Используйте $.raw с осторожностью!');
console.log('   - Не используйте с пользовательским вводом');
console.log('   - Используйте только с проверенными данными');
console.log('   - Для обычных случаев используйте обычную функцию $');