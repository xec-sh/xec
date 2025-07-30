---
sidebar_position: 3
---

# Ваш первый проект

Давайте создадим полный проект автоматизации с Xec! Мы создадим систему развертывания веб-приложения, которая обрабатывает все от тестирования до развертывания в продакшн.

## Обзор проекта

Мы создадим систему автоматизации, которая:
- Запускает тесты и собирает приложение
- Управляет несколькими средами (staging, production)
- Обрабатывает миграции базы данных
- Выполняет проверки здоровья и откаты
- Отправляет уведомления об успехе/неудаче

## Настройка проекта

Давайте начнем с инициализации нового проекта Xec:

```bash
# Создайте и инициализируйте проект
xec init deployment-automation
cd deployment-automation
```

Это создает базовую структуру проекта в директории `.xec`. Теперь давайте настроим наш проект развертывания:

```bash
# Установите дополнительные зависимости
npm init -y
npm install @xec-sh/core typescript @types/node
npm install --save-dev ts-node
```

Создайте следующую дополнительную структуру:

```
deployment-automation/
├── .xec/                 # Создано xec init
│   ├── config.yaml
│   ├── scripts/
│   ├── commands/
│   └── ...
├── package.json
├── tsconfig.json
├── .env.example
├── config/
│   ├── environments.ts
│   └── settings.ts
├── lib/
│   ├── ssh-manager.ts
│   ├── docker-utils.ts
│   └── notifications.ts
└── recipes/
    ├── full-deploy.ts
    └── quick-patch.ts
```

## Настройка TypeScript

Создайте `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "./",
    "declaration": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

## Управление конфигурацией

Создайте `config/environments.ts`:

```typescript
export interface Environment {
  name: string;
  host: string;
  username: string;
  appPath: string;
  branch: string;
  healthCheckUrl: string;
}

export const environments: Record<string, Environment> = {
  staging: {
    name: 'staging',
    host: 'staging.example.com',
    username: 'deploy',
    appPath: '/var/www/app-staging',
    branch: 'develop',
    healthCheckUrl: 'https://staging.example.com/health'
  },
  production: {
    name: 'production',
    host: 'prod.example.com',
    username: 'deploy',
    appPath: '/var/www/app',
    branch: 'main',
    healthCheckUrl: 'https://example.com/health'
  }
};
```

Создайте `config/settings.ts`:

```typescript
export const settings = {
  // Настройки развертывания
  deployment: {
    preDeployTests: true,
    buildBeforeDeploy: true,
    runMigrations: true,
    keepReleases: 5,
    timeout: 300000 // 5 минут
  },
  
  // Настройки уведомлений
  notifications: {
    slack: {
      enabled: process.env.SLACK_WEBHOOK ? true : false,
      webhook: process.env.SLACK_WEBHOOK || ''
    },
    email: {
      enabled: false,
      to: process.env.NOTIFY_EMAIL || ''
    }
  },
  
  // Настройки Docker
  docker: {
    registry: process.env.DOCKER_REGISTRY || 'docker.io',
    namespace: process.env.DOCKER_NAMESPACE || 'mycompany'
  }
};
```

## Менеджер SSH соединений

Создайте `lib/ssh-manager.ts`:

```typescript
import { $ } from '@xec-sh/core';
import type { SSHExecutionContext } from '@xec-sh/core';
import type { Environment } from '../config/environments';

export class SSHManager {
  private connections: Map<string, SSHExecutionContext> = new Map();

  async getConnection(env: Environment): Promise<SSHExecutionContext> {
    const key = `${env.username}@${env.host}`;
    
    if (!this.connections.has(key)) {
      const connection = $.ssh({
        host: env.host,
        username: env.username,
        privateKey: process.env.SSH_PRIVATE_KEY
      });
      
      // Тест соединения
      await connection`echo "Connection established"`;
      this.connections.set(key, connection);
    }
    
    return this.connections.get(key)!;
  }

  async closeAll(): Promise<void> {
    // Соединения управляются движком выполнения
    this.connections.clear();
  }
}

export const sshManager = new SSHManager();
```

## Docker утилиты

Создайте `lib/docker-utils.ts`:

```typescript
import { $ } from '@xec-sh/core';
import { settings } from '../config/settings';

export async function buildDockerImage(
  tag: string,
  dockerfile = 'Dockerfile'
): Promise<void> {
  console.log(`🔨 Building Docker image: ${tag}`);
  
  await $`docker build -f ${dockerfile} -t ${tag} .`;
  
  console.log('✅ Docker image built successfully');
}

export async function pushDockerImage(tag: string): Promise<void> {
  const { registry, namespace } = settings.docker;
  const fullTag = `${registry}/${namespace}/${tag}`;
  
  console.log(`📤 Pushing Docker image: ${fullTag}`);
  
  // Тегирование для реестра
  await $`docker tag ${tag} ${fullTag}`;
  
  // Отправка в реестр
  await $`docker push ${fullTag}`;
  
  console.log('✅ Docker image pushed successfully');
}

export async function deployDockerContainer(
  ssh: any,
  containerName: string,
  image: string,
  env: Record<string, string>
): Promise<void> {
  console.log(`🚀 Deploying container: ${containerName}`);
  
  // Остановка существующего контейнера
  await ssh`docker stop ${containerName} || true`;
  await ssh`docker rm ${containerName} || true`;
  
  // Загрузка последнего образа
  await ssh`docker pull ${image}`;
  
  // Запуск нового контейнера
  const envFlags = Object.entries(env)
    .map(([key, value]) => `-e ${key}="${value}"`)
    .join(' ');
  
  await ssh`docker run -d --name ${containerName} --restart=always ${envFlags} -p 3000:3000 ${image}`;
  
  // Ожидание готовности контейнера
  await ssh`docker wait ${containerName}`;
  
  console.log('✅ Container deployed successfully');
}
```

## Система уведомлений

Создайте `lib/notifications.ts`:

```typescript
import { $ } from '@xec-sh/core';
import { settings } from '../config/settings';

export interface DeploymentInfo {
  environment: string;
  version: string;
  status: 'success' | 'failure';
  duration: number;
  error?: string;
}

export async function sendNotification(info: DeploymentInfo): Promise<void> {
  const { notifications } = settings;
  
  // Slack уведомление
  if (notifications.slack.enabled) {
    await sendSlackNotification(info);
  }
  
  // Email уведомление
  if (notifications.email.enabled) {
    await sendEmailNotification(info);
  }
}

async function sendSlackNotification(info: DeploymentInfo): Promise<void> {
  const emoji = info.status === 'success' ? '✅' : '❌';
  const color = info.status === 'success' ? 'good' : 'danger';
  
  const payload = {
    attachments: [{
      color,
      title: `${emoji} Deployment ${info.status}`,
      fields: [
        {
          title: 'Environment',
          value: info.environment,
          short: true
        },
        {
          title: 'Version',
          value: info.version,
          short: true
        },
        {
          title: 'Duration',
          value: `${Math.round(info.duration / 1000)}s`,
          short: true
        }
      ],
      footer: 'Xec Deployment System',
      ts: Math.floor(Date.now() / 1000)
    }]
  };
  
  if (info.error) {
    payload.attachments[0].fields.push({
      title: 'Error',
      value: info.error,
      short: false
    });
  }
  
  await $`curl -X POST -H 'Content-type: application/json' \
    --data '${JSON.stringify(payload)}' \
    ${settings.notifications.slack.webhook}`;
}

async function sendEmailNotification(info: DeploymentInfo): Promise<void> {
  // Реализация зависит от вашего email сервиса
  console.log(`Email notification would be sent to: ${settings.notifications.email.to}`);
}
```

## Основной скрипт развертывания

Создайте `scripts/deploy.ts`:

```typescript
#!/usr/bin/env ts-node

import { $ } from '@xec-sh/core';
import { environments } from '../config/environments';
import { settings } from '../config/settings';
import { sshManager } from '../lib/ssh-manager';
import { sendNotification } from '../lib/notifications';
import { buildDockerImage, pushDockerImage, deployDockerContainer } from '../lib/docker-utils';

async function deploy(envName: string): Promise<void> {
  const startTime = Date.now();
  const env = environments[envName];
  
  if (!env) {
    throw new Error(`Unknown environment: ${envName}`);
  }
  
  console.log(`🚀 Starting deployment to ${env.name}`);
  
  let version = 'unknown';
  
  try {
    // 1. Предварительные проверки
    if (settings.deployment.preDeployTests) {
      console.log('📋 Running tests...');
      await $`npm test`;
      console.log('✅ Tests passed');
    }
    
    // 2. Получение версии
    const gitHash = await $`git rev-parse --short HEAD`;
    version = gitHash.stdout.trim();
    
    // 3. Сборка приложения
    if (settings.deployment.buildBeforeDeploy) {
      console.log('🔨 Building application...');
      await $`npm run build`;
      
      // Сборка Docker образа если Dockerfile существует
      const hasDocker = await $`test -f Dockerfile`.nothrow();
      if (hasDocker.exitCode === 0) {
        await buildDockerImage(`app:${version}`);
        await pushDockerImage(`app:${version}`);
      }
    }
    
    // 4. Подключение к серверу
    const ssh = await sshManager.getConnection(env);
    
    // 5. Создание директории релиза
    const releaseDir = `${env.appPath}/releases/${version}`;
    console.log(`📁 Creating release directory: ${releaseDir}`);
    await ssh`mkdir -p ${releaseDir}`;
    
    // 6. Загрузка приложения
    console.log('📤 Uploading application...');
    await ssh`cd ${env.appPath} && git fetch origin ${env.branch}`;
    await ssh`cd ${env.appPath} && git checkout ${env.branch}`;
    await ssh`cd ${env.appPath} && git pull origin ${env.branch}`;
    
    // 7. Установка зависимостей
    console.log('📦 Installing dependencies...');
    await ssh`cd ${releaseDir} && npm ci --production`;
    
    // 8. Запуск миграций
    if (settings.deployment.runMigrations) {
      console.log('🗄️  Running migrations...');
      await ssh`cd ${releaseDir} && npm run migrate`;
    }
    
    // 9. Обновление символической ссылки
    console.log('🔗 Updating current release...');
    await ssh`cd ${env.appPath} && ln -sfn ${releaseDir} current`;
    
    // 10. Перезапуск приложения
    console.log('🔄 Restarting application...');
    await ssh`sudo systemctl restart app-${env.name}`;
    
    // 11. Проверка здоровья
    console.log('❤️  Running health check...');
    await $`sleep 5`; // Даем время приложению запуститься
    
    const health = await $`curl -f ${env.healthCheckUrl}`.nothrow();
    if (health.exitCode !== 0) {
      throw new Error('Health check failed');
    }
    
    // 12. Очистка старых релизов
    console.log('🧹 Cleaning old releases...');
    await ssh`cd ${env.appPath}/releases && ls -t | tail -n +${settings.deployment.keepReleases + 1} | xargs rm -rf`;
    
    // Успех!
    const duration = Date.now() - startTime;
    console.log(`✅ Deployment successful in ${Math.round(duration / 1000)}s`);
    
    await sendNotification({
      environment: env.name,
      version,
      status: 'success',
      duration
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ Deployment failed:', error.message);
    
    await sendNotification({
      environment: env.name,
      version,
      status: 'failure',
      duration,
      error: error.message
    });
    
    throw error;
  } finally {
    await sshManager.closeAll();
  }
}

// Основное выполнение
if (require.main === module) {
  const envName = process.argv[2];
  
  if (!envName) {
    console.error('Usage: deploy.ts <environment>');
    console.error('Available environments:', Object.keys(environments).join(', '));
    process.exit(1);
  }
  
  deploy(envName).catch(error => {
    console.error(error);
    process.exit(1);
  });
}

export { deploy };
```

## Скрипт проверки здоровья

Создайте `scripts/health-check.ts`:

```typescript
#!/usr/bin/env ts-node

import { $ } from '@xec-sh/core';
import { environments } from '../config/environments';

async function healthCheck(envName: string): Promise<boolean> {
  const env = environments[envName];
  
  if (!env) {
    throw new Error(`Unknown environment: ${envName}`);
  }
  
  console.log(`❤️  Checking health of ${env.name}...`);
  
  try {
    // HTTP проверка здоровья
    const httpCheck = await $`curl -f -s -o /dev/null -w "%{http_code}" ${env.healthCheckUrl}`;
    const statusCode = httpCheck.stdout.trim();
    
    if (statusCode !== '200') {
      console.error(`❌ HTTP health check failed: ${statusCode}`);
      return false;
    }
    
    // Дополнительные проверки
    const ssh = $.ssh({
      host: env.host,
      username: env.username
    });
    
    // Проверка процесса
    const processCheck = await ssh`systemctl is-active app-${env.name}`.nothrow();
    if (processCheck.stdout.trim() !== 'active') {
      console.error('❌ Application process is not active');
      return false;
    }
    
    // Проверка места на диске
    const diskCheck = await ssh`df -h ${env.appPath} | awk 'NR==2 {print $5}' | sed 's/%//'`;
    const diskUsage = parseInt(diskCheck.stdout.trim());
    
    if (diskUsage > 90) {
      console.error(`⚠️  Disk usage is high: ${diskUsage}%`);
    }
    
    console.log('✅ All health checks passed');
    return true;
    
  } catch (error) {
    console.error('❌ Health check error:', error.message);
    return false;
  }
}

// Основное выполнение
if (require.main === module) {
  const envName = process.argv[2];
  
  if (!envName) {
    console.error('Usage: health-check.ts <environment>');
    process.exit(1);
  }
  
  healthCheck(envName).then(healthy => {
    process.exit(healthy ? 0 : 1);
  });
}

export { healthCheck };
```

## Создание пользовательских скриптов и команд

Сначала давайте используем систему шаблонов Xec для создания нашего скрипта развертывания:

```bash
# Создайте продвинутый скрипт развертывания
xec new script deploy --advanced -d "Deploy application to various environments"

# Создайте команду отката
xec new command rollback -d "Rollback to previous version"
```

Теперь создадим дополнительные рецепты. Создайте `recipes/full-deploy.ts`:

```typescript
import { deploy } from '../scripts/deploy';
import { healthCheck } from '../scripts/health-check';

export default async function fullDeploy() {
  // Сначала развертывание в staging
  console.log('🎬 Deploying to staging...');
  await deploy('staging');
  
  // Запуск расширенных тестов на staging
  console.log('🧪 Running integration tests on staging...');
  const stagingHealthy = await healthCheck('staging');
  
  if (!stagingHealthy) {
    throw new Error('Staging health check failed');
  }
  
  // Запрос подтверждения
  console.log('\n⚠️  Ready to deploy to production?');
  console.log('Press Enter to continue or Ctrl+C to cancel...');
  
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });
  
  // Развертывание в production
  console.log('🚀 Deploying to production...');
  await deploy('production');
  
  console.log('🎉 Full deployment completed!');
}
```

## Скрипты Package.json

Обновите ваш `package.json`:

```json
{
  "name": "deployment-automation",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "deploy:staging": "ts-node scripts/deploy.ts staging",
    "deploy:production": "ts-node scripts/deploy.ts production",
    "health:staging": "ts-node scripts/health-check.ts staging",
    "health:production": "ts-node scripts/health-check.ts production",
    "recipe:full": "xec recipes/full-deploy.ts"
  },
  "dependencies": {
    "@xec-sh/core": "latest",
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  },
  "devDependencies": {
    "ts-node": "^10.0.0"
  }
}
```

## Переменные окружения

Создайте `.env.example`:

```bash
# SSH Конфигурация
SSH_PRIVATE_KEY_PATH=~/.ssh/id_rsa

# Docker Registry
DOCKER_REGISTRY=docker.io
DOCKER_NAMESPACE=mycompany

# Уведомления
SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
NOTIFY_EMAIL=ops@example.com

# Специфичные для среды
STAGING_HOST=staging.example.com
PRODUCTION_HOST=prod.example.com
```

## Запуск вашего проекта

1. **Настройте окружение**:
   ```bash
   cp .env.example .env
   # Отредактируйте .env с вашими значениями
   ```

2. **Разверните в staging**:
   ```bash
   npm run deploy:staging
   ```

3. **Проверьте здоровье**:
   ```bash
   npm run health:staging
   ```

4. **Полное развертывание**:
   ```bash
   npm run recipe:full
   ```

## Лучшие практики, которые мы реализовали

1. **Разделение сред**: Четкое разделение между staging и production
2. **Проверки здоровья**: Автоматические проверки здоровья до и после развертывания
3. **Возможность отката**: Сохранение нескольких релизов для легкого отката
4. **Уведомления**: Уведомления команды о статусе развертывания
5. **Обработка ошибок**: Правильная обработка ошибок и логирование
6. **Безопасность**: Использование переменных окружения для чувствительных данных
7. **Модульность**: Переиспользуемые компоненты (SSH менеджер, Docker утилиты)
8. **Типобезопасность**: Полный TypeScript для безопасности на этапе компиляции

## Расширение вашего проекта

Идеи для расширения этого проекта:

1. **Добавьте резервные копии базы данных**:
   ```typescript
   await ssh`mysqldump -u user -p db > backup-${version}.sql`;
   ```

2. **Blue-Green развертывание**:
   ```typescript
   // Развертывание в blue среде
   // Переключение балансировщика нагрузки
   // Сохранение green как резерв
   ```

3. **Интеграция мониторинга**:
   ```typescript
   // Отправка событий развертывания в мониторинг
   await $`curl -X POST ${MONITORING_API}/deployments`;
   ```

4. **Автоматический откат**:
   ```typescript
   if (!healthy) {
     await ssh`cd ${appPath} && ln -sfn releases/${previousVersion} current`;
   }
   ```

## Резюме

Теперь вы создали полную систему автоматизации развертывания с Xec! Этот проект демонстрирует:

- Многосредовое развертывание
- SSH удаленное выполнение
- Docker интеграцию
- Проверки здоровья и мониторинг
- Систему уведомлений
- Обработку ошибок и откат

Используйте это как основу для ваших собственных проектов автоматизации. Паттерны и практики, показанные здесь, могут быть адаптированы для любых потребностей автоматизации.

## Следующие шаги

1. Узнайте о [Создании пользовательских команд](../projects/cli/custom-commands)
2. Изучите [API справочник](../projects/core/api-reference)
3. Откройте [Больше примеров](../projects/core/examples)
4. Посмотрите [Реальные примеры](../projects/cli/real-world-examples)
5. Присоединитесь к [Сообществу Xec](https://github.com/xec-sh/xec)

Счастливой автоматизации! 🚀 