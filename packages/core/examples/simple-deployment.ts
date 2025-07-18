/**
 * Простой пример развертывания Node.js приложения
 */

import { recipe } from '@xec-js/core'

// Создаем рецепт деплоя
const deploy = recipe('deploy-nodejs-app', {
  description: 'Deploy Node.js application',

  // Определяем переменные с валидацией
  vars: {
    app_name: {
      type: 'string',
      required: true,
      description: 'Application name'
    },
    branch: {
      type: 'string',
      default: 'main',
      description: 'Git branch to deploy'
    },
    port: {
      type: 'number',
      default: 3000,
      min: 1,
      max: 65535
    }
  },

  // Хосты для деплоя
  hosts: ['web-server']
})

// Задача подготовки окружения
deploy.task('prepare', {
  description: 'Prepare deployment environment'
}, async ({ $, vars, log }) => {
  log.info('Preparing environment...')

  // Создаем директории
  await $`mkdir -p /app/${vars.app_name}`
  await $`mkdir -p /app/${vars.app_name}/logs`
  await $`mkdir -p /backup/${vars.app_name}`
})

// Задача резервного копирования
deploy.task('backup', {
  description: 'Backup current version',
  depends: ['prepare']
}, async ({ $, vars, log }) => {
  log.info('Creating backup...')

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  await $`
    if [ -d "/app/${vars.app_name}/current" ]; then
      tar -czf /backup/${vars.app_name}/backup-${timestamp}.tar.gz \
        -C /app/${vars.app_name} current
    fi
  `
})

// Задача деплоя кода
deploy.task('deploy-code', {
  description: 'Deploy application code',
  depends: ['backup'],
  retry: {
    attempts: 3,
    delay: 5000
  }
}, async ({ $, vars, log }) => {
  log.info(`Deploying ${vars.app_name} from branch ${vars.branch}...`)

  await $`
    cd /app/${vars.app_name}
    
    # Клонируем или обновляем репозиторий
    if [ ! -d "repo" ]; then
      git clone https://github.com/myorg/${vars.app_name}.git repo
    fi
    
    cd repo
    git fetch origin
    git checkout ${vars.branch}
    git pull origin ${vars.branch}
    
    # Устанавливаем зависимости
    npm ci --production
    
    # Собираем приложение
    npm run build
    
    # Создаем симлинк на новую версию
    cd /app/${vars.app_name}
    rm -f current
    ln -s repo current
  `
})

// Задача настройки окружения
deploy.task('configure', {
  description: 'Configure application',
  depends: ['deploy-code']
}, async ({ $, vars, file, template }) => {
  // Создаем конфигурационный файл из шаблона
  const config = await template.render('app-config.j2', {
    app_name: vars.app_name,
    port: vars.port,
    node_env: 'production'
  })

  await file(`/app/${vars.app_name}/current/.env`).write(config)

  // Настраиваем systemd сервис
  const serviceConfig = `
[Unit]
Description=${vars.app_name} Node.js Application
After=network.target

[Service]
Type=simple
User=node
WorkingDirectory=/app/${vars.app_name}/current
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=10
StandardOutput=append:/app/${vars.app_name}/logs/app.log
StandardError=append:/app/${vars.app_name}/logs/error.log

[Install]
WantedBy=multi-user.target
`

  await file(`/etc/systemd/system/${vars.app_name}.service`).write(serviceConfig)
  await $`systemctl daemon-reload`
})

// Задача запуска приложения
deploy.task('start-app', {
  description: 'Start application',
  depends: ['configure']
}, async ({ $, vars, log }) => {
  log.info('Starting application...')

  await $`systemctl restart ${vars.app_name}`
  await $`systemctl enable ${vars.app_name}`

  // Ждем пока приложение запустится
  await $`sleep 5`
})

// Задача проверки здоровья
deploy.task('health-check', {
  description: 'Verify application is running',
  depends: ['start-app'],
  retry: {
    attempts: 5,
    delay: 3000,
    backoff: 'exponential'
  }
}, async ({ vars, http, log, host }) => {
  log.info('Checking application health...')

  const url = `http://${host}:${vars.port}/health`
  const response = await http.get(url, { timeout: 5000 })

  if (response.status !== 200) {
    throw new Error(`Health check failed: ${response.status}`)
  }

  log.info('✅ Application is healthy!')
})

// Обработка ошибок
deploy.onError('deploy-code', async (error, { log, notify, vars }) => {
  log.error(`Deployment failed: ${error.message}`)

  // Отправляем уведомление
  await notify.slack(`🚨 Deployment of ${vars.app_name} failed: ${error.message}`, {
    channel: '#deployments'
  })

  // Откатываемся к предыдущей версии
  throw error // Это остановит выполнение
})

// Финальные действия
deploy.finally(async ({ log, notify, vars, results }) => {
  const success = Object.values(results).every(r => r.status === 'success')

  if (success) {
    await notify.slack(`✅ ${vars.app_name} deployed successfully!`, {
      channel: '#deployments'
    })
  }

  // Очистка старых бэкапов (оставляем последние 5)
  await $`
    cd /backup/${vars.app_name}
    ls -t | tail -n +6 | xargs -r rm -f
  `
})

// Экспорт для использования
export default deploy

// Пример запуска
if (require.main === module) {
  deploy.run({
    vars: {
      app_name: 'my-api',
      branch: 'release/v2.0.0',
      port: 3000
    }
  }).catch(console.error)
}