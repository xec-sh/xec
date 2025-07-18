/**
 * Пример комплексной оркестрации инфраструктуры
 * Развертывание полного стека: базы данных, приложения, мониторинг
 */

import { when, recipe, module, parallel, inventory, sequential, orchestrate } from '@xec-js/core'

// ===== МОДУЛИ =====

// Модуль для работы с PostgreSQL
const postgres = module('postgres', {
  vars: {
    version: { type: 'string', default: '14' },
    dataDir: { type: 'string', default: '/var/lib/postgresql/data' },
    port: { type: 'number', default: 5432 }
  },

  tasks: {
    install: async ({ $, vars }) => {
      await $`
        apt-get update
        apt-get install -y postgresql-${vars.version} postgresql-contrib-${vars.version}
      `
    },

    configure: async ({ vars, file, template }) => {
      const config = await template.render('postgresql.conf.j2', {
        port: vars.port,
        max_connections: 200,
        shared_buffers: '256MB',
        effective_cache_size: '1GB'
      })

      await file(`/etc/postgresql/${vars.version}/main/postgresql.conf`).write(config)
    },

    createDatabase: async ({ $, database, user, password }) => {
      await $`sudo -u postgres psql -c "CREATE DATABASE ${database};"`
      await $`sudo -u postgres psql -c "CREATE USER ${user} WITH PASSWORD '${password}';"`
      await $`sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${database} TO ${user};"`
    },

    backup: async ({ $, database }) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      await $`sudo -u postgres pg_dump ${database} > /backup/postgres/${database}-${timestamp}.sql`
    }
  }
})

// Модуль для работы с Redis
const redis = module('redis', {
  vars: {
    version: { type: 'string', default: '7' },
    port: { type: 'number', default: 6379 },
    maxMemory: { type: 'string', default: '1gb' }
  },

  tasks: {
    install: async ({ $ }) => {
      await $`
        apt-get update
        apt-get install -y redis-server
      `
    },

    configure: async ({ vars, file }) => {
      const config = `
port ${vars.port}
maxmemory ${vars.maxMemory}
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
      `
      await file('/etc/redis/redis.conf').write(config)
    },

    start: async ({ $ }) => {
      await $`systemctl start redis-server`
      await $`systemctl enable redis-server`
    }
  }
})

// Модуль для Prometheus
const prometheus = module('prometheus', {
  vars: {
    version: { type: 'string', default: 'latest' },
    retention: { type: 'string', default: '30d' }
  },

  tasks: {
    install: async ({ $, vars }) => {
      await $`
        wget https://github.com/prometheus/prometheus/releases/download/v${vars.version}/prometheus-${vars.version}.linux-amd64.tar.gz
        tar xvf prometheus-${vars.version}.linux-amd64.tar.gz
        cp prometheus-${vars.version}.linux-amd64/prometheus /usr/local/bin/
        cp prometheus-${vars.version}.linux-amd64/promtool /usr/local/bin/
      `
    },

    configure: async ({ vars, file, state }) => {
      // Получаем список всех хостов для мониторинга
      const targets = await state.get('monitored_hosts') || []

      const config = `
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'node'
    static_configs:
      - targets: ${JSON.stringify(targets.map(h => `${h}:9100`))}
      
  - job_name: 'postgres'
    static_configs:
      - targets: ${JSON.stringify(targets.filter(h => h.tags?.includes('db')).map(h => `${h}:9187`))}
      
  - job_name: 'redis'
    static_configs:
      - targets: ${JSON.stringify(targets.filter(h => h.tags?.includes('cache')).map(h => `${h}:9121`))}
`

      await file('/etc/prometheus/prometheus.yml').write(config)
    }
  }
})

// ===== ИНВЕНТАРЬ =====

// Настраиваем динамический инвентарь
const inv = inventory()
  // Статические хосты
  .addGroup('databases', [
    { name: 'db1', address: '10.0.2.10', tags: ['db', 'primary'] },
    { name: 'db2', address: '10.0.2.11', tags: ['db', 'replica'] }
  ])
  .addGroup('cache', [
    { name: 'cache1', address: '10.0.3.10', tags: ['cache'] },
    { name: 'cache2', address: '10.0.3.11', tags: ['cache'] }
  ])
  .addGroup('web', [
    { name: 'web1', address: '10.0.1.10', tags: ['web'] },
    { name: 'web2', address: '10.0.1.11', tags: ['web'] },
    { name: 'web3', address: '10.0.1.12', tags: ['web'] }
  ])
  .addGroup('monitoring', [
    { name: 'mon1', address: '10.0.4.10', tags: ['monitoring'] }
  ])

  // Динамическое обнаружение из AWS
  .discover('aws', {
    region: 'us-east-1',
    filters: { 'tag:Environment': 'production' }
  })

// ===== РЕЦЕПТЫ =====

// Рецепт установки базы данных
const setupDatabase = recipe('setup-database', {
  hosts: inv.tagged('db'),
  vars: {
    db_name: { type: 'string', default: 'myapp' },
    db_user: { type: 'string', default: 'appuser' },
    db_password: { type: 'string', required: true }
  }
})
  .use(postgres)
  .task('install-postgres', async ({ modules }) => {
    await modules.postgres.install()
  })
  .task('configure-postgres', async ({ modules, host }) => {
    await modules.postgres.configure()

    // Настройка репликации для replica
    if (host.tags?.includes('replica')) {
      await configureReplication(host)
    }
  })
  .task('create-database', {
    when: ({ host }) => host.tags?.includes('primary')
  }, async ({ modules, vars }) => {
    await modules.postgres.createDatabase({
      database: vars.db_name,
      user: vars.db_user,
      password: vars.db_password
    })
  })

// Рецепт установки кеша
const setupCache = recipe('setup-cache', {
  hosts: inv.tagged('cache')
})
  .use(redis)
  .task('install-redis', async ({ modules }) => {
    await modules.redis.install()
  })
  .task('configure-redis', async ({ modules, host }) => {
    // Настройка Redis Cluster если больше одного хоста
    const cacheHosts = inv.tagged('cache')
    if (cacheHosts.length > 1) {
      await configureRedisCluster(host, cacheHosts)
    } else {
      await modules.redis.configure()
    }
  })
  .task('start-redis', async ({ modules }) => {
    await modules.redis.start()
  })

// Рецепт развертывания приложения
const deployApplication = recipe('deploy-application', {
  hosts: inv.tagged('web'),
  vars: {
    app_version: { type: 'string', required: true },
    db_host: { type: 'string', default: inv.tagged('db', 'primary')[0].address },
    cache_host: { type: 'string', default: inv.tagged('cache')[0].address }
  }
})
  .task('deploy', async ({ $, vars, file }) => {
    // Деплой приложения
    await $`
      cd /app
      git fetch --tags
      git checkout v${vars.app_version}
      npm ci --production
      npm run build
    `

    // Создаем конфигурацию
    const appConfig = {
      database: {
        host: vars.db_host,
        port: 5432,
        name: 'myapp',
        user: 'appuser'
      },
      redis: {
        host: vars.cache_host,
        port: 6379
      },
      port: 3000
    }

    await file('/app/config.json').writeJson(appConfig)
  })
  .task('start', async ({ $ }) => {
    await $`pm2 restart app`
  })

// Рецепт настройки мониторинга
const setupMonitoring = recipe('setup-monitoring', {
  hosts: inv.tagged('monitoring')
})
  .use(prometheus)
  .task('install-monitoring-stack', async ({ $, parallel }) => {
    await parallel([
      // Prometheus
      modules.prometheus.install(),

      // Grafana
      $`
        apt-get install -y software-properties-common
        add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
        wget -q -O - https://packages.grafana.com/gpg.key | apt-key add -
        apt-get update
        apt-get install -y grafana
      `,

      // Node Exporter на всех хостах
      recipe('install-node-exporter', {
        hosts: inv.all()
      }).task('install', async ({ $ }) => {
        await $`
          wget https://github.com/prometheus/node_exporter/releases/download/v1.5.0/node_exporter-1.5.0.linux-amd64.tar.gz
          tar xvf node_exporter-1.5.0.linux-amd64.tar.gz
          cp node_exporter-1.5.0.linux-amd64/node_exporter /usr/local/bin/
          
          # Создаем systemd сервис
          cat > /etc/systemd/system/node_exporter.service << EOF
[Unit]
Description=Node Exporter
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/node_exporter

[Install]
WantedBy=multi-user.target
EOF
          
          systemctl daemon-reload
          systemctl start node_exporter
          systemctl enable node_exporter
        `
      }).run()
    ])
  })
  .task('configure-monitoring', async ({ modules, state }) => {
    // Сохраняем список хостов для мониторинга
    await state.set('monitored_hosts', inv.all().map(h => h.address))

    // Настраиваем Prometheus
    await modules.prometheus.configure()

    // Настраиваем Grafana dashboards
    await setupGrafanaDashboards()
  })

// ===== ГЛАВНАЯ ОРКЕСТРАЦИЯ =====

const fullStackDeployment = orchestrate({
  // Фаза 1: Базовая инфраструктура (параллельно)
  infrastructure: parallel(
    setupDatabase.ref(),
    setupCache.ref(),

    // Настройка сети и безопасности
    recipe('setup-networking').task('configure', async ({ $ }) => {
      // Настройка firewall
      await $`
        ufw allow 22/tcp
        ufw allow 80/tcp
        ufw allow 443/tcp
        ufw allow 5432/tcp comment 'PostgreSQL'
        ufw allow 6379/tcp comment 'Redis'
        ufw allow 9090/tcp comment 'Prometheus'
        ufw allow 3000/tcp comment 'Grafana'
        ufw --force enable
      `
    }).ref()
  ),

  // Фаза 2: Приложение (после инфраструктуры)
  application: sequential(
    // Миграции БД
    recipe('run-migrations', {
      hosts: inv.tagged('db', 'primary')[0]
    }).task('migrate', async ({ $ }) => {
      await $`cd /migrations && npm run migrate`
    }).ref(),

    // Деплой приложения
    deployApplication.ref()
  ).dependsOn('infrastructure'),

  // Фаза 3: Мониторинг (после приложения)
  monitoring: when(
    ({ vars }) => vars.enable_monitoring !== false,
    setupMonitoring.ref()
  ).dependsOn('application'),

  // Фаза 4: Пост-деплой проверки
  validation: sequential(
    // Проверка здоровья всех сервисов
    recipe('health-checks').task('check-all', async ({ parallel, http, inventory }) => {
      const checks = []

      // Проверка баз данных
      for (const db of inventory.tagged('db')) {
        checks.push(
          $`pg_isready -h ${db.address} -p 5432`
        )
      }

      // Проверка Redis
      for (const cache of inventory.tagged('cache')) {
        checks.push(
          $`redis-cli -h ${cache.address} ping`
        )
      }

      // Проверка веб-серверов
      for (const web of inventory.tagged('web')) {
        checks.push(
          http.get(`http://${web.address}:3000/health`)
        )
      }

      const results = await parallel(checks)

      // Анализ результатов
      const failures = results.filter(r => !r.success)
      if (failures.length > 0) {
        throw new Error(`Health checks failed: ${failures.length} services are down`)
      }
    }).ref(),

    // Smoke тесты
    recipe('smoke-tests').task('run', async ({ http, inventory }) => {
      const webHost = inventory.tagged('web')[0]

      // Тест API endpoints
      const endpoints = ['/api/users', '/api/products', '/api/orders']
      for (const endpoint of endpoints) {
        const response = await http.get(`http://${webHost.address}:3000${endpoint}`)
        if (response.status !== 200) {
          throw new Error(`API test failed for ${endpoint}`)
        }
      }
    }).ref()
  ).dependsOn(['application', 'monitoring'])
})

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

async function configureReplication(replicaHost: Host) {
  const primaryHost = inv.tagged('db', 'primary')[0]

  await $`
    # На primary создаем слот репликации
    sudo -u postgres psql -c "SELECT * FROM pg_create_physical_replication_slot('replica1');"
    
    # На replica настраиваем подключение к primary
    echo "primary_conninfo = 'host=${primaryHost.address} port=5432 user=replicator'" >> /etc/postgresql/14/main/postgresql.conf
    echo "primary_slot_name = 'replica1'" >> /etc/postgresql/14/main/postgresql.conf
    
    # Создаем standby.signal
    touch /var/lib/postgresql/14/main/standby.signal
    
    # Перезапускаем PostgreSQL
    systemctl restart postgresql
  `
}

async function configureRedisCluster(currentHost: Host, allHosts: Host[]) {
  // Настройка Redis в режиме кластера
  await file('/etc/redis/redis.conf').append(`
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
  `)

  // После запуска всех нод, создаем кластер
  if (currentHost === allHosts[0]) {
    await sleep(5000) // Ждем запуска всех нод

    const hostList = allHosts.map(h => `${h.address}:6379`).join(' ')
    await $`redis-cli --cluster create ${hostList} --cluster-replicas 1 --cluster-yes`
  }
}

async function setupGrafanaDashboards() {
  // Импорт готовых дашбордов
  const dashboards = [
    { id: 1860, name: 'Node Exporter Full' },
    { id: 9628, name: 'PostgreSQL Database' },
    { id: 763, name: 'Redis Dashboard' }
  ]

  for (const dashboard of dashboards) {
    await $`
      curl -X POST http://admin:admin@localhost:3000/api/dashboards/import \
        -H "Content-Type: application/json" \
        -d '{
          "dashboard": {
            "id": ${dashboard.id}
          },
          "overwrite": true,
          "inputs": [{
            "name": "DS_PROMETHEUS",
            "type": "datasource",
            "pluginId": "prometheus",
            "value": "Prometheus"
          }]
        }'
    `
  }
}

// ===== ЭКСПОРТ И ЗАПУСК =====

export {
  setupCache,
  setupDatabase,
  setupMonitoring,
  deployApplication,
  fullStackDeployment
}

// CLI интерфейс
if (require.main === module) {
  const args = process.argv.slice(2)
  const command = args[0]

  switch (command) {
    case 'full':
      // Полное развертывание
      fullStackDeployment.run({
        vars: {
          app_version: args[1] || '1.0.0',
          db_password: process.env.DB_PASSWORD || 'secret',
          enable_monitoring: true
        }
      })
        .then(() => console.log('✅ Full stack deployment completed!'))
        .catch(console.error)
      break

    case 'app-only':
      // Только приложение
      deployApplication.run({
        vars: {
          app_version: args[1] || '1.0.0'
        }
      })
        .then(() => console.log('✅ Application deployed!'))
        .catch(console.error)
      break

    default:
      console.log(`
Usage: 
  ts-node infrastructure-orchestration.ts full [version]     - Full stack deployment
  ts-node infrastructure-orchestration.ts app-only [version] - Deploy only application
      `)
  }
}