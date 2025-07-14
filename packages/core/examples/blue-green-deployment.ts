/**
 * Пример Blue-Green deployment с Kubernetes
 */

import { recipe, patterns, inventory } from '@xec/core'

// Настраиваем динамический инвентарь из Kubernetes
const k8sInventory = inventory()
  .discover('k8s', {
    namespace: 'production',
    selector: 'app=web-app'
  })

// Основной рецепт деплоя
const deployApp = recipe('deploy-web-app', {
  description: 'Deploy web application to Kubernetes',

  vars: {
    version: {
      type: 'string',
      required: true,
      pattern: /^\d+\.\d+\.\d+$/
    },
    color: {
      type: 'enum',
      values: ['blue', 'green'],
      required: true
    },
    replicas: {
      type: 'number',
      default: 3,
      min: 1,
      max: 10
    }
  }
})

// Подготовка образа
deployApp.task('build-image', {
  description: 'Build and push Docker image',
  runOn: 'local' // Выполняется локально, не на хостах
}, async ({ $, vars, log }) => {
  log.info(`Building Docker image for version ${vars.version}...`)

  await $`
    docker build -t myapp:${vars.version} .
    docker tag myapp:${vars.version} registry.example.com/myapp:${vars.version}
    docker push registry.example.com/myapp:${vars.version}
  `
})

// Обновление Kubernetes deployment
deployApp.task('update-deployment', {
  description: 'Update Kubernetes deployment',
  depends: ['build-image']
}, async ({ $, vars, log, file, template }) => {
  log.info(`Updating ${vars.color} deployment to version ${vars.version}...`)

  // Генерируем манифест из шаблона
  const manifest = await template.render('k8s-deployment.yaml.j2', {
    name: `web-app-${vars.color}`,
    version: vars.version,
    color: vars.color,
    replicas: vars.replicas,
    image: `registry.example.com/myapp:${vars.version}`
  })

  // Сохраняем манифест
  const manifestPath = `/tmp/deployment-${vars.color}.yaml`
  await file(manifestPath).write(manifest)

  // Применяем манифест
  await $`kubectl apply -f ${manifestPath}`

  // Ждем готовности deployment
  await $`kubectl rollout status deployment/web-app-${vars.color} -n production --timeout=5m`
})

// Проверка метрик
deployApp.task('check-metrics', {
  description: 'Check application metrics',
  depends: ['update-deployment']
}, async ({ vars, log, http }) => {
  log.info('Checking application metrics...')

  // Запрашиваем метрики из Prometheus
  const query = `
    rate(http_requests_total{app="web-app",color="${vars.color}"}[5m])
  `

  const response = await http.post('http://prometheus:9090/api/v1/query', {
    json: { query }
  })

  const errorRate = response.data.result[0]?.value[1] || 0

  if (errorRate > 0.05) { // 5% error rate threshold
    throw new Error(`Error rate too high: ${errorRate * 100}%`)
  }

  log.info(`✅ Error rate is acceptable: ${errorRate * 100}%`)
})

// Smoke тесты
deployApp.task('smoke-tests', {
  description: 'Run smoke tests',
  depends: ['check-metrics'],
  parallel: true // Тесты выполняются параллельно
}, async ({ vars, http, parallel, log }) => {
  log.info('Running smoke tests...')

  const endpoints = [
    '/health',
    '/api/v1/status',
    '/api/v1/users',
    '/metrics'
  ]

  // Получаем IP сервиса для тестирования
  const serviceIP = await $`kubectl get service web-app-${vars.color} -o jsonpath='{.status.loadBalancer.ingress[0].ip}'`
    .then(r => r.stdout.trim())

  // Тестируем все endpoints параллельно
  const results = await parallel(
    endpoints.map(endpoint =>
      http.get(`http://${serviceIP}${endpoint}`, {
        timeout: 5000,
        retry: { attempts: 3 }
      })
    )
  )

  // Проверяем результаты
  const failures = results.filter(r => r.status !== 200)
  if (failures.length > 0) {
    throw new Error(`Smoke tests failed for ${failures.length} endpoints`)
  }

  log.info('✅ All smoke tests passed!')
})

// Настройка Blue-Green deployment
const blueGreenDeploy = async (version: string) => patterns.blueGreen({
  service: 'web-app',

  // Функция получения текущего активного окружения
  getCurrentEnvironment: async () => {
    const { stdout } = await $`kubectl get service web-app -o jsonpath='{.spec.selector.color}'`
    return stdout.trim() as 'blue' | 'green'
  },

  // Функция деплоя
  deploy: async ({ color }) => {
    await deployApp.run({
      vars: { version, color, replicas: 3 }
    })
  },

  // Функция проверки здоровья
  healthCheck: async ({ color }) => {
    try {
      // Проверяем готовность всех подов
      const ready = await $`kubectl get pods -l app=web-app,color=${color} -o json`
        .then(r => JSON.parse(r.stdout))
        .then(data => data.items.every((pod: any) =>
          pod.status.conditions.find((c: any) => c.type === 'Ready')?.status === 'True'
        ))

      if (!ready) return false

      // Проверяем endpoints
      const serviceIP = await $`kubectl get service web-app-${color} -o jsonpath='{.status.loadBalancer.ingress[0].ip}'`
        .then(r => r.stdout.trim())

      const response = await http.get(`http://${serviceIP}/health`)
      return response.status === 200

    } catch (error) {
      return false
    }
  },

  // Функция переключения трафика
  switchTraffic: async ({ color }) => {
    log.info(`Switching traffic to ${color} environment...`)

    // Обновляем селектор основного сервиса
    await $`kubectl patch service web-app -p '{"spec":{"selector":{"color":"${color}"}}}'`

    // Обновляем Ingress если используется
    await $`kubectl patch ingress web-app -p '{"spec":{"rules":[{"host":"app.example.com","http":{"paths":[{"path":"/","backend":{"service":{"name":"web-app-${color}","port":{"number":80}}}}]}}]}}'`

    log.info(`✅ Traffic switched to ${color}`)
  },

  // Настройки
  rollbackOnError: true,
  healthCheckTimeout: 5 * 60 * 1000, // 5 минут
  healthCheckInterval: 10 * 1000,    // 10 секунд
  trafficSwitchDelay: 30 * 1000,     // 30 секунд задержка перед переключением

  // Хуки
  beforeDeploy: async ({ color }) => {
    log.info(`🚀 Starting Blue-Green deployment to ${color} environment`)

    // Отправляем уведомление
    await notify.slack(`Starting deployment of v${version} to ${color} environment`, {
      channel: '#deployments'
    })
  },

  afterSwitch: async ({ color, previousColor }) => {
    log.info(`🎉 Successfully switched from ${previousColor} to ${color}`)

    // Масштабируем старое окружение до 0
    await $`kubectl scale deployment web-app-${previousColor} --replicas=0`

    // Отправляем уведомление об успехе
    await notify.slack(`✅ Successfully deployed v${version} to production!`, {
      channel: '#deployments',
      color: 'good'
    })
  },

  onRollback: async ({ color, previousColor, error }) => {
    log.error(`❌ Deployment failed, rolling back to ${previousColor}`)

    await notify.slack(`🚨 Deployment of v${version} failed! Rolling back to ${previousColor}. Error: ${error.message}`, {
      channel: '#deployments',
      color: 'danger'
    })
  }
})

// Canary deployment как альтернатива
const canaryDeploy = async (version: string) => patterns.canary({
  service: 'web-app',
  version,

  stages: [
    { percentage: 10, duration: '5m', metrics: ['error_rate < 0.01', 'p95_latency < 200'] },
    { percentage: 25, duration: '10m', metrics: ['error_rate < 0.01', 'p95_latency < 200'] },
    { percentage: 50, duration: '15m', metrics: ['error_rate < 0.01'] },
    { percentage: 100 }
  ],

  deploy: async ({ version, percentage }) => {
    const totalReplicas = 10
    const canaryReplicas = Math.ceil(totalReplicas * percentage / 100)
    const stableReplicas = totalReplicas - canaryReplicas

    // Обновляем canary deployment
    await $`kubectl set image deployment/web-app-canary web-app=registry.example.com/myapp:${version}`
    await $`kubectl scale deployment web-app-canary --replicas=${canaryReplicas}`

    // Обновляем stable deployment
    await $`kubectl scale deployment web-app-stable --replicas=${stableReplicas}`
  },

  checkMetrics: async (metrics) => {
    for (const metric of metrics) {
      const [query, condition] = metric.split(' < ')
      const threshold = parseFloat(condition)

      // Запрашиваем метрику из Prometheus
      const response = await http.post('http://prometheus:9090/api/v1/query', {
        json: { query: getPrometheusQuery(query) }
      })

      const value = parseFloat(response.data.result[0]?.value[1] || 0)

      if (value >= threshold) {
        log.warn(`Metric ${query} failed: ${value} >= ${threshold}`)
        return false
      }
    }

    return true
  },

  finalize: async () => {
    // Обновляем stable версию
    await $`kubectl set image deployment/web-app-stable web-app=registry.example.com/myapp:${version}`
    await $`kubectl scale deployment web-app-stable --replicas=10`
    await $`kubectl scale deployment web-app-canary --replicas=0`
  },

  rollback: async () => {
    // Откатываем canary до 0
    await $`kubectl scale deployment web-app-canary --replicas=0`
    await $`kubectl scale deployment web-app-stable --replicas=10`
  }
})

// Helper функции
function getPrometheusQuery(metric: string): string {
  const queries: Record<string, string> = {
    'error_rate': 'rate(http_requests_total{app="web-app",status=~"5.."}[5m]) / rate(http_requests_total{app="web-app"}[5m])',
    'p95_latency': 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{app="web-app"}[5m]))',
    'p99_latency': 'histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{app="web-app"}[5m]))'
  }

  return queries[metric] || metric
}

// Экспорт
export { deployApp, canaryDeploy, blueGreenDeploy }

// CLI интерфейс
if (require.main === module) {
  const [, , strategy, version] = process.argv

  if (!version || !['blue-green', 'canary'].includes(strategy)) {
    console.error('Usage: ts-node blue-green-deployment.ts <blue-green|canary> <version>')
    process.exit(1)
  }

  const deploy = strategy === 'blue-green' ? blueGreenDeploy : canaryDeploy

  deploy(version)
    .then(() => console.log('✅ Deployment completed successfully!'))
    .catch(error => {
      console.error('❌ Deployment failed:', error)
      process.exit(1)
    })
}