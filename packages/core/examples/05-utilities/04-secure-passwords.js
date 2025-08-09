import * as readline from 'readline';
import { $, SecurePasswordHandler } from '@xec-sh/core';
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
});
function passwordPrompt(prompt) {
    return new Promise((resolve) => {
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
                case '\u0004':
                    stdin.removeListener('data', onData);
                    if (stdin.isTTY && wasRaw !== undefined) {
                        stdin.setRawMode?.(wasRaw);
                    }
                    console.log();
                    resolve(password);
                    break;
                case '\u0003':
                    process.exit();
                    break;
                case '\u007f':
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
console.log('=== Ввод пароля ===');
const password1 = await passwordPrompt('Enter password: ');
console.log('Пароль введён (скрыт)');
console.log('\n=== Ввод с подтверждением ===');
const newPassword = await passwordPrompt('Enter new password: ');
const confirmPassword = await passwordPrompt('Confirm password: ');
if (newPassword === confirmPassword) {
    console.log('Пароль успешно установлен');
    const validation = SecurePasswordHandler.validatePassword(newPassword);
    if (!validation.isValid) {
        console.log('Предупреждения о пароле:');
        validation.issues.forEach(issue => console.log(`- ${issue}`));
    }
    else {
        console.log('Пароль соответствует требованиям безопасности');
    }
}
else {
    console.log('Пароли не совпадают');
}
console.log('\n=== Маскирование данных ===');
const apiKey = 'sk-1234567890abcdef';
const dbPassword = 'super-secret-password';
const command = `curl -H "Authorization: Bearer ${apiKey}" -u user:${dbPassword} https://api.example.com`;
const maskedCommand = SecurePasswordHandler.maskPassword(SecurePasswordHandler.maskPassword(command, apiKey), dbPassword);
console.log('Оригинальная команда (НЕ логировать!):', command);
console.log('Замаскированная команда для логов:', maskedCommand);
const $secure = $.env({
    API_KEY: apiKey,
    DB_PASSWORD: dbPassword
});
await $secure `echo "Connecting to API..."`;
console.log('Подключение выполнено с использованием переменных окружения');
console.log('\n=== SSH с паролем ===');
const sshPassword = 'demo-password';
const $ssh = $.ssh({
    host: 'example.com',
    username: 'user',
    privateKey: '/path/to/id_rsa'
});
console.log('Для SSH рекомендуется использовать ключи вместо паролей');
console.log('\n=== Безопасный sudo ===');
const secureHandler = new SecurePasswordHandler();
const sudoPassword = 'sudo-password';
try {
    const askpassPath = await secureHandler.createAskPassScript(sudoPassword);
    const secureEnv = secureHandler.createSecureEnv(askpassPath);
    console.log('Askpass скрипт создан:', askpassPath);
    console.log('Безопасное окружение настроено');
    await secureHandler.cleanup();
}
catch (error) {
    console.error('Ошибка при настройке sudo:', error.message);
}
console.log('\n=== Хранение паролей ===');
class SecureCredentials {
    constructor() {
        this.credentials = new Map();
    }
    add(name, value) {
        this.credentials.set(name, value);
    }
    get(name) {
        return this.credentials.get(name) || null;
    }
    getMasked(name) {
        const value = this.credentials.get(name);
        return value ? '***MASKED***' : 'NOT_FOUND';
    }
    clear() {
        this.credentials.clear();
    }
}
const creds = new SecureCredentials();
creds.add('api_key', 'secret-api-key');
creds.add('db_pass', 'database-password');
const apiKeyValue = creds.get('api_key');
if (apiKeyValue) {
    console.log('API key получен (замаскирован):', creds.getMasked('api_key'));
}
creds.clear();
console.log('Пароли очищены из памяти');
async function getValidPassword() {
    while (true) {
        const password = await passwordPrompt('Enter password (min 8 chars, must contain numbers): ');
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
import * as path from 'path';
import * as fs from 'fs/promises';
async function loadPrivateKey(keyPath, passphrase) {
    try {
        const keyContent = await fs.readFile(keyPath, 'utf-8');
        if (keyContent.includes('ENCRYPTED')) {
            if (!passphrase) {
                passphrase = await passwordPrompt(`Enter passphrase for ${path.basename(keyPath)}: `);
            }
            const $ssh = $.ssh({
                host: 'example.com',
                username: 'user',
                privateKey: keyPath,
                passphrase
            });
            return $ssh;
        }
        return $.ssh({
            host: 'example.com',
            username: 'user',
            privateKey: keyPath
        });
    }
    catch (error) {
        console.error('Ошибка загрузки ключа:', error.message);
        return null;
    }
}
console.log('\n=== Безопасные переменные окружения ===');
async function secureEnvironment() {
    const secrets = {
        DATABASE_URL: 'postgresql://user:pass@localhost/db',
        API_SECRET: 'secret-api-key-123',
        JWT_KEY: 'jwt-secret-key-456'
    };
    let maskedLogs = JSON.stringify(secrets);
    Object.values(secrets).forEach(secret => {
        maskedLogs = SecurePasswordHandler.maskPassword(maskedLogs, secret);
    });
    console.log('Секреты (замаскированы):', maskedLogs);
    const $secure = $.env(secrets);
    await $secure `echo "Starting application with secure environment"`;
    console.log('Приложение запущено с безопасным окружением');
}
await secureEnvironment();
console.log('\n=== Проверка силы пароля ===');
function checkPasswordStrength(password) {
    let strength = 0;
    const feedback = [];
    if (password.length >= 8)
        strength++;
    if (password.length >= 12)
        strength++;
    if (password.length < 8)
        feedback.push('Слишком короткий');
    if (/[a-z]/.test(password))
        strength++;
    if (/[A-Z]/.test(password))
        strength++;
    if (/[0-9]/.test(password))
        strength++;
    if (/[^A-Za-z0-9]/.test(password))
        strength++;
    if (!/[a-z]/.test(password))
        feedback.push('Добавьте строчные буквы');
    if (!/[A-Z]/.test(password))
        feedback.push('Добавьте заглавные буквы');
    if (!/[0-9]/.test(password))
        feedback.push('Добавьте цифры');
    if (!/[^A-Za-z0-9]/.test(password))
        feedback.push('Добавьте спецсимволы');
    const levels = ['Очень слабый', 'Слабый', 'Средний', 'Хороший', 'Отличный'];
    const level = Math.min(Math.floor(strength / 1.5), levels.length - 1);
    return `Сила: ${levels[level]}${feedback.length ? '. ' + feedback.join('. ') : ''}`;
}
const testPasswords = [
    'abc123',
    'Password1',
    'MyP@ssw0rd!',
    'SuperSecureP@ssw0rd123!'
];
testPasswords.forEach(pwd => {
    console.log(`Пароль: ${pwd.replace(/./g, '*')}`);
    console.log(checkPasswordStrength(pwd));
    const validation = SecurePasswordHandler.validatePassword(pwd);
    if (!validation.isValid) {
        console.log('Встроенная проверка:', validation.issues.join(', '));
    }
    console.log('---');
});
console.log('\n=== Генерация паролей ===');
const generatedPassword = SecurePasswordHandler.generatePassword(16);
console.log('Сгенерированный пароль:', generatedPassword.replace(/./g, '*'));
console.log('Проверка:', checkPasswordStrength(generatedPassword));
console.log('\n=== Очистка логов ===');
function sanitizeLogs(logs, secrets) {
    let sanitized = logs;
    secrets.forEach(secret => {
        if (secret && secret.length > 0) {
            sanitized = SecurePasswordHandler.maskPassword(sanitized, secret);
        }
    });
    return sanitized;
}
const logOutput = `
Connecting to database: postgresql://user:secret123@localhost/db
API Key: sk-1234567890abcdef
Token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
`;
const secretsToMask = ['secret123', 'sk-1234567890abcdef', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'];
const cleanLogs = sanitizeLogs(logOutput, secretsToMask);
console.log('Оригинальные логи:', logOutput);
console.log('Очищенные логи:', cleanLogs);
rl.close();
//# sourceMappingURL=04-secure-passwords.js.map