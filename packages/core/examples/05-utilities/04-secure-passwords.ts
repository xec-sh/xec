/**
 * 04. Secure Passwords - Безопасная работа с паролями
 * 
 * Показывает безопасную работу с паролями и чувствительными данными.
 * 
 * ВАЖНО: В @xec-sh/core есть класс SecurePasswordHandler для работы с паролями,
 * но нет интерактивных промптов. Используем readline для ввода.
 */

import * as readline from 'readline';
import { $, SecurePasswordHandler } from '@xec-sh/core';

// Создаём интерфейс readline для ввода паролей
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
});

// Утилита для безопасного ввода пароля
function passwordPrompt(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    // Отключаем эхо ввода для скрытия пароля
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    
    if (stdin.isTTY) {
      stdin.setRawMode?.(true);
    }
    
    let password = '';
    process.stdout.write(prompt);
    
    stdin.on('data', function onData(char) {
      const str = char.toString();
      
      switch (str) {
        case '\n':
        case '\r':
        case '\u0004': // Ctrl+D
          stdin.removeListener('data', onData);
          if (stdin.isTTY && wasRaw !== undefined) {
            stdin.setRawMode?.(wasRaw);
          }
          console.log(); // Новая строка после ввода
          resolve(password);
          break;
        case '\u0003': // Ctrl+C
          process.exit();
          break;
        case '\u007f': // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
          break;
        default:
          password += str;
          process.stdout.write('*');
      }
    });
  });
}

// 1. Простой ввод пароля
console.log('=== Ввод пароля ===');
const password1 = await passwordPrompt('Enter password: ');
console.log('Пароль введён (скрыт)');

// 2. Ввод пароля с подтверждением
console.log('\n=== Ввод с подтверждением ===');
const newPassword = await passwordPrompt('Enter new password: ');
const confirmPassword = await passwordPrompt('Confirm password: ');

if (newPassword === confirmPassword) {
  console.log('Пароль успешно установлен');
  
  // Проверяем силу пароля
  const validation = SecurePasswordHandler.validatePassword(newPassword);
  if (!validation.isValid) {
    console.log('Предупреждения о пароле:');
    validation.issues.forEach(issue => console.log(`- ${issue}`));
  } else {
    console.log('Пароль соответствует требованиям безопасности');
  }
} else {
  console.log('Пароли не совпадают');
}

// 3. Маскирование чувствительных данных в командах
console.log('\n=== Маскирование данных ===');
const apiKey = 'sk-1234567890abcdef';
const dbPassword = 'super-secret-password';

// Команда с чувствительными данными
const command = `curl -H "Authorization: Bearer ${apiKey}" -u user:${dbPassword} https://api.example.com`;

// Маскируем пароли для логирования
const maskedCommand = SecurePasswordHandler.maskPassword(
  SecurePasswordHandler.maskPassword(command, apiKey),
  dbPassword
);

console.log('Оригинальная команда (НЕ логировать!):', command);
console.log('Замаскированная команда для логов:', maskedCommand);

// Используем переменные окружения для безопасной передачи
const $secure = $.env({
  API_KEY: apiKey,
  DB_PASSWORD: dbPassword
});

// Выполняем команду без отображения паролей
await $secure`echo "Connecting to API..."`; // Не выводим сами пароли
console.log('Подключение выполнено с использованием переменных окружения');

// 4. Безопасная работа с SSH
console.log('\n=== SSH с паролем ===');

// В реальном приложении пароль вводится интерактивно
const sshPassword = 'demo-password'; // await passwordPrompt('SSH Password: ');

// ВАЖНО: SSH адаптер в @xec-sh/core не поддерживает парольную аутентификацию напрямую
// Используйте SSH ключи для безопасности
const $ssh = $.ssh({
  host: 'example.com',
  username: 'user',
  privateKey: '/path/to/id_rsa'
  // password не поддерживается в текущей реализации
});

console.log('Для SSH рекомендуется использовать ключи вместо паролей');

// 5. Работа с sudo через SecurePasswordHandler
console.log('\n=== Безопасный sudo ===');

const secureHandler = new SecurePasswordHandler();
const sudoPassword = 'sudo-password'; // await passwordPrompt('Sudo password: ');

try {
  // Создаём askpass скрипт для sudo
  const askpassPath = await secureHandler.createAskPassScript(sudoPassword);
  
  // Создаём безопасное окружение
  const secureEnv = secureHandler.createSecureEnv(askpassPath);
  
  // Используем с SSH (если бы sudo был поддержан)
  console.log('Askpass скрипт создан:', askpassPath);
  console.log('Безопасное окружение настроено');
  
  // Очищаем временные файлы
  await secureHandler.cleanup();
} catch (error) {
  console.error('Ошибка при настройке sudo:', error.message);
}

// 6. Безопасное хранение паролей в памяти
console.log('\n=== Хранение паролей ===');

class SecureCredentials {
  private credentials = new Map<string, string>();
  
  add(name: string, value: string) {
    // В реальном приложении используйте шифрование
    this.credentials.set(name, value);
  }
  
  get(name: string): string | null {
    return this.credentials.get(name) || null;
  }
  
  // Маскируем пароль при получении для логов
  getMasked(name: string): string {
    const value = this.credentials.get(name);
    return value ? '***MASKED***' : 'NOT_FOUND';
  }
  
  clear() {
    // Очищаем все пароли
    this.credentials.clear();
  }
}

const creds = new SecureCredentials();
creds.add('api_key', 'secret-api-key');
creds.add('db_pass', 'database-password');

// Используем пароли
const apiKeyValue = creds.get('api_key');
if (apiKeyValue) {
  console.log('API key получен (замаскирован):', creds.getMasked('api_key'));
}

// Очищаем память
creds.clear();
console.log('Пароли очищены из памяти');

// 7. Интерактивный ввод с валидацией
async function getValidPassword() {
  while (true) {
    const password = await passwordPrompt(
      'Enter password (min 8 chars, must contain numbers): '
    );
    
    // Валидация
    if (password.length < 8) {
      console.log('Пароль слишком короткий');
      continue;
    }
    
    if (!/\d/.test(password)) {
      console.log('Пароль должен содержать цифры');
      continue;
    }
    
    return password;
  }
}

// const validPassword = await getValidPassword();
// console.log('Пароль принят');

import * as path from 'path';
// 8. Работа с файлами ключей
import * as fs from 'fs/promises';

async function loadPrivateKey(keyPath: string, passphrase?: string) {
  try {
    const keyContent = await fs.readFile(keyPath, 'utf-8');
    
    // Проверяем, зашифрован ли ключ
    if (keyContent.includes('ENCRYPTED')) {
      if (!passphrase) {
        passphrase = await passwordPrompt(
          `Enter passphrase for ${path.basename(keyPath)}: `
        );
      }
      
      // Используем SSH с passphrase
      const $ssh = $.ssh({
        host: 'example.com',
        username: 'user',
        privateKey: keyPath,
        passphrase
      });
      
      return $ssh;
    }
    
    // Ключ не зашифрован
    return $.ssh({
      host: 'example.com',
      username: 'user',
      privateKey: keyPath
    });
  } catch (error) {
    console.error('Ошибка загрузки ключа:', error.message);
    return null;
  }
}

// 9. Безопасная работа с переменными окружения
console.log('\n=== Безопасные переменные окружения ===');

async function secureEnvironment() {
  // В реальном приложении эти данные вводятся интерактивно
  const secrets = {
    DATABASE_URL: 'postgresql://user:pass@localhost/db',
    API_SECRET: 'secret-api-key-123',
    JWT_KEY: 'jwt-secret-key-456'
  };
  
  // Маскируем все секреты для логов
  let maskedLogs = JSON.stringify(secrets);
  Object.values(secrets).forEach(secret => {
    maskedLogs = SecurePasswordHandler.maskPassword(maskedLogs, secret);
  });
  
  console.log('Секреты (замаскированы):', maskedLogs);
  
  // Создаём безопасный контекст
  const $secure = $.env(secrets);
  
  // Выполняем команды
  await $secure`echo "Starting application with secure environment"`;
  console.log('Приложение запущено с безопасным окружением');
}

await secureEnvironment();

// 10. Проверка силы пароля
console.log('\n=== Проверка силы пароля ===');

function checkPasswordStrength(password: string): string {
  let strength = 0;
  const feedback = [];
  
  // Длина
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (password.length < 8) feedback.push('Слишком короткий');
  
  // Сложность
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;
  
  if (!/[a-z]/.test(password)) feedback.push('Добавьте строчные буквы');
  if (!/[A-Z]/.test(password)) feedback.push('Добавьте заглавные буквы');
  if (!/[0-9]/.test(password)) feedback.push('Добавьте цифры');
  if (!/[^A-Za-z0-9]/.test(password)) feedback.push('Добавьте спецсимволы');
  
  // Оценка
  const levels = ['Очень слабый', 'Слабый', 'Средний', 'Хороший', 'Отличный'];
  const level = Math.min(Math.floor(strength / 1.5), levels.length - 1);
  
  return `Сила: ${levels[level]}${feedback.length ? '. ' + feedback.join('. ') : ''}`;
}

// Демонстрация проверки паролей
const testPasswords = [
  'abc123',
  'Password1',
  'MyP@ssw0rd!',
  'SuperSecureP@ssw0rd123!'
];

testPasswords.forEach(pwd => {
  console.log(`Пароль: ${pwd.replace(/./g, '*')}`);
  console.log(checkPasswordStrength(pwd));
  
  // Также проверяем встроенным валидатором
  const validation = SecurePasswordHandler.validatePassword(pwd);
  if (!validation.isValid) {
    console.log('Встроенная проверка:', validation.issues.join(', '));
  }
  console.log('---');
});

// 11. Генерация безопасных паролей
console.log('\n=== Генерация паролей ===');

// Используем встроенный генератор
const generatedPassword = SecurePasswordHandler.generatePassword(16);
console.log('Сгенерированный пароль:', generatedPassword.replace(/./g, '*'));
console.log('Проверка:', checkPasswordStrength(generatedPassword));

// 12. Очистка чувствительных данных из логов
console.log('\n=== Очистка логов ===');

function sanitizeLogs(logs: string, secrets: string[]): string {
  let sanitized = logs;
  
  secrets.forEach(secret => {
    if (secret && secret.length > 0) {
      // Используем встроенный метод маскирования
      sanitized = SecurePasswordHandler.maskPassword(sanitized, secret);
    }
  });
  
  return sanitized;
}

// Пример использования
const logOutput = `
Connecting to database: postgresql://user:secret123@localhost/db
API Key: sk-1234567890abcdef
Token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
`;

const secretsToMask = ['secret123', 'sk-1234567890abcdef', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'];
const cleanLogs = sanitizeLogs(logOutput, secretsToMask);

console.log('Оригинальные логи:', logOutput);
console.log('Очищенные логи:', cleanLogs);

// Закрываем readline интерфейс
rl.close();
