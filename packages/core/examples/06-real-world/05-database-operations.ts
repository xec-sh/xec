/**
 * 05. Database Operations - Операции с базами данных
 * 
 * Показывает реальные сценарии работы с базами данных
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { $, withTempDir } from '@xec-sh/core';

// 1. Резервное копирование баз данных
async function databaseBackup(config: BackupConfig) {
  console.log('\n=== Резервное копирование базы данных ===\n');
  console.log(`База: ${config.database}`);
  console.log(`Тип: ${config.type}`);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `${config.database}-${timestamp}`;
  
  try {
    // Создаем директорию для бэкапов
    await $`mkdir -p ${config.backupPath}`;
    
    let backupFile: string;
    
    switch (config.type) {
      case 'postgresql':
        backupFile = await backupPostgreSQL(config, backupName);
        break;
      case 'mysql':
        backupFile = await backupMySQL(config, backupName);
        break;
      case 'mongodb':
        backupFile = await backupMongoDB(config, backupName);
        break;
      default:
        throw new Error(`Unsupported database type: ${config.type}`);
    }
    
    // Сжимаем бэкап
    console.log('\n📦 Сжатие бэкапа...');
    const compressedFile = `${backupFile}.gz`;
    await $`gzip -9 ${backupFile}`;
    
    // Проверяем размер
    const stats = await fs.stat(compressedFile);
    console.log(`✅ Бэкап создан: ${path.basename(compressedFile)}`);
    console.log(`   Размер: ${formatBytes(stats.size)}`);
    
    // Загружаем в облако (если настроено)
    if (config.uploadToCloud) {
      await uploadBackupToCloud(compressedFile, config.cloudStorage);
    }
    
    // Очищаем старые бэкапы
    await cleanupOldBackups(config.backupPath, config.retentionDays);
    
    // Отправляем уведомление
    await sendBackupNotification(config, {
      status: 'success',
      file: compressedFile,
      size: stats.size,
      duration: Date.now() - Date.parse(timestamp)
    });
    
    return compressedFile;
    
  } catch (error) {
    console.error('❌ Ошибка резервного копирования:', error.message);
    
    await sendBackupNotification(config, {
      status: 'failed',
      error: error.message
    });
    
    throw error;
  }
}

async function backupPostgreSQL(config: BackupConfig, backupName: string): Promise<string> {
  console.log('\n🐘 PostgreSQL бэкап...');
  
  const backupFile = path.join(config.backupPath, `${backupName}.sql`);
  const $pg = $.with({
    env: {
      PGPASSWORD: config.password,
      PGHOST: config.host,
      PGPORT: config.port || '5432',
      PGUSER: config.username
    }
  });
  
  // Проверяем подключение
  await $pg`pg_isready`;
  
  // Создаем бэкап
  console.log('Создание дампа базы данных...');
  
  if (config.includeLargeObjects) {
    // Полный бэкап с большими объектами
    await $pg`pg_dump -d ${config.database} -b -v -f ${backupFile}`;
  } else {
    // Стандартный бэкап
    await $pg`pg_dump -d ${config.database} -v -f ${backupFile}`;
  }
  
  console.log('✅ Дамп создан');
  
  // Создаем бэкап ролей (если нужно)
  if (config.includeRoles) {
    const rolesFile = path.join(config.backupPath, `${backupName}-roles.sql`);
    await $pg`pg_dumpall -r -f ${rolesFile}`;
    console.log('✅ Роли сохранены');
  }
  
  return backupFile;
}

async function backupMySQL(config: BackupConfig, backupName: string): Promise<string> {
  console.log('\n🐬 MySQL бэкап...');
  
  const backupFile = path.join(config.backupPath, `${backupName}.sql`);
  
  // Создаем опции для mysqldump
  const options = [
    `--host=${config.host}`,
    `--port=${config.port || 3306}`,
    `--user=${config.username}`,
    `--password=${config.password}`,
    '--single-transaction',
    '--routines',
    '--triggers'
  ];
  
  if (config.includeLargeObjects) {
    options.push('--hex-blob');
  }
  
  console.log('Создание дампа базы данных...');
  
  await $`mysqldump ${options} ${config.database} > ${backupFile}`;
  
  console.log('✅ Дамп создан');
  
  return backupFile;
}

async function backupMongoDB(config: BackupConfig, backupName: string): Promise<string> {
  console.log('\n🍃 MongoDB бэкап...');
  
  const backupDir = path.join(config.backupPath, backupName);
  
  // Формируем URI подключения
  const authPart = config.username ? `${config.username}:${config.password}@` : '';
  const uri = `mongodb://${authPart}${config.host}:${config.port || 27017}/${config.database}`;
  
  console.log('Создание дампа базы данных...');
  
  await $`mongodump --uri="${uri}" --out="${backupDir}"`;
  
  console.log('✅ Дамп создан');
  
  // Архивируем директорию
  const archiveFile = `${backupDir}.tar`;
  await $`tar -cf ${archiveFile} -C ${config.backupPath} ${backupName}`;
  await $`rm -rf ${backupDir}`;
  
  return archiveFile;
}

// 2. Восстановление из бэкапа
async function databaseRestore(config: RestoreConfig) {
  console.log('\n=== Восстановление базы данных ===\n');
  
  // Проверяем файл бэкапа
  try {
    await fs.access(config.backupFile);
  } catch {
    throw new Error(`Файл бэкапа не найден: ${config.backupFile}`);
  }
  
  // Подтверждение
  if (!config.force) {
    // В @xec-sh/core нет interactive, просто предупреждаем
    console.log(`⚠️  Внимание: восстановление базы ${config.database} из бэкапа.`);
    console.log('Все текущие данные будут потеряны!');
    console.log('Используйте параметр force: true для автоматического подтверждения.');
    const confirm = false; // По умолчанию отменяем
    
    if (!confirm) {
      console.log('Восстановление отменено');
      return;
    }
  }
  
  // Создаем временную директорию для распаковки
  await withTempDir(async (tmpDir) => {
    let sqlFile = config.backupFile;
    
    // Распаковываем если нужно
    if (config.backupFile.endsWith('.gz')) {
      console.log('📦 Распаковка бэкапа...');
      sqlFile = path.join(tmpDir.path, path.basename(config.backupFile, '.gz'));
      await $`gunzip -c ${config.backupFile} > ${sqlFile}`;
    } else if (config.backupFile.endsWith('.tar')) {
      console.log('📦 Распаковка архива...');
      await $`tar -xf ${config.backupFile} -C ${tmpDir.path}`;
      // Находим SQL файл или директорию
      const files = await fs.readdir(tmpDir.path);
      sqlFile = path.join(tmpDir.path, files[0]);
    }
    
    // Восстанавливаем в зависимости от типа БД
    switch (config.type) {
      case 'postgresql':
        await restorePostgreSQL(config, sqlFile);
        break;
      case 'mysql':
        await restoreMySQL(config, sqlFile);
        break;
      case 'mongodb':
        await restoreMongoDB(config, sqlFile);
        break;
    }
    
    console.log('\n✅ База данных успешно восстановлена!');
  });
}

async function restorePostgreSQL(config: RestoreConfig, sqlFile: string) {
  console.log('\n🐘 Восстановление PostgreSQL...');
  
  const $pg = $.with({
    env: {
      PGPASSWORD: config.password,
      PGHOST: config.host,
      PGPORT: config.port || '5432',
      PGUSER: config.username
    }
  });
  
  // Пересоздаем базу данных
  if (config.dropExisting) {
    console.log('Удаление существующей базы...');
    await $pg`dropdb --if-exists ${config.database}`;
    await $pg`createdb ${config.database}`;
  }
  
  // Восстанавливаем
  const spinner = interactive.spinner('Восстановление данных...');
  spinner.start();
  
  await $pg`psql -d ${config.database} -f ${sqlFile}`;
  
  spinner.succeed('Данные восстановлены');
  
  // Анализируем таблицы
  console.log('Оптимизация таблиц...');
  await $pg`vacuumdb -d ${config.database} -z`;
}

async function restoreMySQL(config: RestoreConfig, sqlFile: string) {
  console.log('\n🐬 Восстановление MySQL...');
  
  const mysqlAuth = [
    `--host=${config.host}`,
    `--port=${config.port || 3306}`,
    `--user=${config.username}`,
    `--password=${config.password}`
  ];
  
  // Пересоздаем базу данных
  if (config.dropExisting) {
    console.log('Удаление существующей базы...');
    await $`mysql ${mysqlAuth} -e "DROP DATABASE IF EXISTS ${config.database}"`;
    await $`mysql ${mysqlAuth} -e "CREATE DATABASE ${config.database}"`;
  }
  
  // Восстанавливаем
  const spinner = interactive.spinner('Восстановление данных...');
  spinner.start();
  
  await $`mysql ${mysqlAuth} ${config.database} < ${sqlFile}`;
  
  spinner.succeed('Данные восстановлены');
}

async function restoreMongoDB(config: RestoreConfig, dumpDir: string) {
  console.log('\n🍃 Восстановление MongoDB...');
  
  const authPart = config.username ? `${config.username}:${config.password}@` : '';
  const uri = `mongodb://${authPart}${config.host}:${config.port || 27017}/${config.database}`;
  
  const spinner = interactive.spinner('Восстановление данных...');
  spinner.start();
  
  const options = [`--uri="${uri}"`];
  if (config.dropExisting) {
    options.push('--drop');
  }
  
  await $`mongorestore ${options} ${dumpDir}`;
  
  spinner.succeed('Данные восстановлены');
}

// 3. Миграции базы данных
async function runDatabaseMigrations(config: MigrationConfig) {
  console.log('\n=== Миграции базы данных ===\n');
  
  // Получаем список миграций
  const pendingMigrations = await getPendingMigrations(config);
  
  if (pendingMigrations.length === 0) {
    console.log('✅ Все миграции уже применены');
    return;
  }
  
  console.log(`Найдено ${pendingMigrations.length} новых миграций:`);
  pendingMigrations.forEach(m => console.log(`  - ${m.name}`));
  
  // Создаем бэкап перед миграцией
  if (config.backupBeforeMigration) {
    console.log('\n📦 Создание бэкапа перед миграцией...');
    const backupConfig: BackupConfig = {
      ...config,
      backupPath: path.join(config.migrationsPath, 'backups')
    };
    await databaseBackup(backupConfig);
  }
  
  // Применяем миграции
  // В @xec-sh/core нет progress, используем простое отображение
  let applied = 0;
  const results = [];
  
  for (const migration of pendingMigrations) {
    try {
      await applyMigration(config, migration);
      results.push({ migration: migration.name, status: 'success' });
      applied++;
      process.stdout.write(`\rПрименено миграций: ${applied}/${pendingMigrations.length}`);
    } catch (error) {
      results.push({ migration: migration.name, status: 'failed', error: error.message });
      console.log(''); // Новая строка
      
      if (config.stopOnError) {
        console.error(`\n❌ Ошибка в миграции ${migration.name}:`, error.message);
        
        // Откатываем если нужно
        if (config.rollbackOnError) {
          await rollbackMigrations(config, results.filter(r => r.status === 'success').map(r => r.migration));
        }
        
        throw error;
      }
    }
  }
  
  progressBar.stop();
  
  // Отчет
  console.log('\n📋 Результаты миграции:');
  results.forEach(r => {
    const icon = r.status === 'success' ? '✅' : '❌';
    console.log(`${icon} ${r.migration}`);
    if (r.error) {
      console.log(`   Ошибка: ${r.error}`);
    }
  });
}

async function getPendingMigrations(config: MigrationConfig): Promise<Migration[]> {
  // Получаем список файлов миграций
  const files = await fs.readdir(config.migrationsPath);
  const migrationFiles = files
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  // Получаем примененные миграции
  const appliedMigrations = await getAppliedMigrations(config);
  
  // Находим новые миграции
  const pendingMigrations = migrationFiles
    .filter(f => !appliedMigrations.includes(f))
    .map(f => ({
      name: f,
      path: path.join(config.migrationsPath, f)
    }));
  
  return pendingMigrations;
}

async function getAppliedMigrations(config: MigrationConfig): Promise<string[]> {
  const $db = getDatabaseClient(config);
  
  // Создаем таблицу миграций если не существует
  await createMigrationsTable($db, config);
  
  // Получаем список примененных миграций
  let result;
  switch (config.type) {
    case 'postgresql':
      result = await $db`psql -d ${config.database} -t -c "SELECT migration_name FROM migrations ORDER BY applied_at"`;
      break;
    case 'mysql':
      result = await $db`mysql ${config.database} -N -e "SELECT migration_name FROM migrations ORDER BY applied_at"`;
      break;
  }
  
  return result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => line.trim());
}

async function createMigrationsTable($db: any, config: MigrationConfig) {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  switch (config.type) {
    case 'postgresql':
      await $db`psql -d ${config.database} -c "${createTableSQL}"`;
      break;
    case 'mysql':
      await $db`mysql ${config.database} -e "${createTableSQL}"`;
      break;
  }
}

async function applyMigration(config: MigrationConfig, migration: Migration) {
  console.log(`\n⚡ Применение ${migration.name}...`);
  
  const $db = getDatabaseClient(config);
  const migrationContent = await fs.readFile(migration.path, 'utf-8');
  
  // Начинаем транзакцию
  const transaction = wrapInTransaction(migrationContent, config.type);
  
  // Применяем миграцию
  switch (config.type) {
    case 'postgresql':
      await $db`psql -d ${config.database} -c "${transaction}"`;
      break;
    case 'mysql':
      await $db`mysql ${config.database} -e "${transaction}"`;
      break;
  }
  
  // Записываем в таблицу миграций
  const recordSQL = `INSERT INTO migrations (migration_name) VALUES ('${migration.name}')`;
  
  switch (config.type) {
    case 'postgresql':
      await $db`psql -d ${config.database} -c "${recordSQL}"`;
      break;
    case 'mysql':
      await $db`mysql ${config.database} -e "${recordSQL}"`;
      break;
  }
}

function wrapInTransaction(sql: string, dbType: string): string {
  switch (dbType) {
    case 'postgresql':
      return `BEGIN;\n${sql}\nCOMMIT;`;
    case 'mysql':
      return `START TRANSACTION;\n${sql}\nCOMMIT;`;
    default:
      return sql;
  }
}

async function rollbackMigrations(config: MigrationConfig, migrations: string[]) {
  console.log('\n🔄 Откат миграций...');
  
  for (const migrationName of migrations.reverse()) {
    console.log(`  Откат ${migrationName}...`);
    
    // Ищем файл отката
    const rollbackFile = migrationName.replace('.sql', '.rollback.sql');
    const rollbackPath = path.join(config.migrationsPath, rollbackFile);
    
    try {
      await fs.access(rollbackPath);
      
      const migration: Migration = {
        name: rollbackFile,
        path: rollbackPath
      };
      
      await applyMigration(config, migration);
      
      // Удаляем запись о миграции
      const $db = getDatabaseClient(config);
      const deleteSQL = `DELETE FROM migrations WHERE migration_name = '${migrationName}'`;
      
      switch (config.type) {
        case 'postgresql':
          await $db`psql -d ${config.database} -c "${deleteSQL}"`;
          break;
        case 'mysql':
          await $db`mysql ${config.database} -e "${deleteSQL}"`;
          break;
      }
      
    } catch {
      console.error(`  ❌ Не найден файл отката для ${migrationName}`);
    }
  }
}

// 4. Мониторинг производительности БД
async function monitorDatabasePerformance(config: DatabaseConfig) {
  console.log('\n=== Мониторинг производительности БД ===\n');
  
  const interval = 5000; // 5 секунд
  const duration = 60000; // 1 минута
  
  const startTime = Date.now();
  const metrics = [];
  
  while (Date.now() - startTime < duration) {
    const metric = await collectDatabaseMetrics(config);
    metrics.push(metric);
    
    // Выводим текущие метрики
    console.clear();
    console.log('=== Мониторинг производительности БД ===\n');
    console.log(`Активные соединения: ${metric.activeConnections}`);
    console.log(`Запросов в секунду: ${metric.queriesPerSecond}`);
    console.log(`Средняя задержка: ${metric.avgLatency}ms`);
    console.log(`Блокировки: ${metric.locks}`);
    
    if (config.type === 'postgresql') {
      console.log(`\nТоп запросов по времени:`);
      metric.slowQueries.forEach((q, i) => {
        console.log(`${i + 1}. ${q.duration}ms - ${q.query.substring(0, 50)}...`);
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  // Анализ результатов
  analyzeDatabaseMetrics(metrics);
}

async function collectDatabaseMetrics(config: DatabaseConfig): Promise<DatabaseMetrics> {
  const $db = getDatabaseClient(config);
  
  switch (config.type) {
    case 'postgresql':
      return await collectPostgreSQLMetrics($db, config);
    case 'mysql':
      return await collectMySQLMetrics($db, config);
    default:
      throw new Error(`Unsupported database type: ${config.type}`);
  }
}

async function collectPostgreSQLMetrics($db: any, config: DatabaseConfig): Promise<DatabaseMetrics> {
  // Активные соединения
  const connections = await $db`psql -d ${config.database} -t -c "SELECT count(*) FROM pg_stat_activity"`;
  
  // Статистика запросов
  await $db`psql -d ${config.database} -t -c "SELECT sum(calls) as total_calls, sum(total_time) as total_time FROM pg_stat_statements"`;
  
  // Блокировки
  const locks = await $db`psql -d ${config.database} -t -c "SELECT count(*) FROM pg_locks WHERE granted = false"`;
  
  // Медленные запросы
  const slowQueries = await $db`psql -d ${config.database} -t -c "
    SELECT query, total_time/calls as avg_time 
    FROM pg_stat_statements 
    WHERE calls > 0 
    ORDER BY avg_time DESC 
    LIMIT 5
  "`.then(r => 
    r.stdout.trim().split('\n').filter(Boolean).map(line => {
      const [query, duration] = line.split('|').map(s => s.trim());
      return { query, duration: parseFloat(duration) };
    })
  );
  
  return {
    activeConnections: parseInt(connections.stdout.trim()),
    queriesPerSecond: 0, // Нужно вычислить на основе предыдущих значений
    avgLatency: 0,
    locks: parseInt(locks.stdout.trim()),
    slowQueries
  };
}

async function collectMySQLMetrics($db: any, config: DatabaseConfig): Promise<DatabaseMetrics> {
  // Активные соединения
  const connections = await $db`mysql ${config.database} -N -e "SHOW STATUS LIKE 'Threads_connected'" | awk '{print $2}'`;
  
  // Запросов в секунду
  await $db`mysql ${config.database} -N -e "SHOW STATUS LIKE 'Questions'" | awk '{print $2}'`;
  
  // Блокировки
  const locks = await $db`mysql ${config.database} -N -e "SELECT COUNT(*) FROM information_schema.INNODB_LOCKS"`;
  
  return {
    activeConnections: parseInt(connections.stdout.trim()),
    queriesPerSecond: 0,
    avgLatency: 0,
    locks: parseInt(locks.stdout.trim()),
    slowQueries: []
  };
}

function analyzeDatabaseMetrics(metrics: DatabaseMetrics[]) {
  console.log('\n\n=== Анализ производительности ===\n');
  
  // Средние значения
  const avgConnections = average(metrics.map(m => m.activeConnections));
  const maxConnections = Math.max(...metrics.map(m => m.activeConnections));
  const avgLocks = average(metrics.map(m => m.locks));
  
  console.log(`Соединения:`);
  console.log(`  Среднее: ${avgConnections.toFixed(1)}`);
  console.log(`  Максимум: ${maxConnections}`);
  
  console.log(`\nБлокировки:`);
  console.log(`  Среднее: ${avgLocks.toFixed(1)}`);
  
  // Рекомендации
  console.log('\n📌 Рекомендации:');
  
  if (avgConnections > 100) {
    console.log('- Высокое количество соединений. Рассмотрите использование пула соединений');
  }
  
  if (avgLocks > 10) {
    console.log('- Обнаружены частые блокировки. Проверьте длительные транзакции');
  }
}

// 5. Оптимизация базы данных
async function optimizeDatabase(config: DatabaseConfig) {
  console.log('\n=== Оптимизация базы данных ===\n');
  
  const tasks = [];
  
  switch (config.type) {
    case 'postgresql':
      tasks.push(
        { name: 'VACUUM ANALYZE', fn: () => vacuumPostgreSQL(config) },
        { name: 'Обновление статистики', fn: () => updatePostgreSQLStats(config) },
        { name: 'Поиск неиспользуемых индексов', fn: () => findUnusedIndexes(config) },
        { name: 'Анализ размера таблиц', fn: () => analyzeTableSizes(config) }
      );
      break;
    case 'mysql':
      tasks.push(
        { name: 'OPTIMIZE TABLES', fn: () => optimizeMySQL(config) },
        { name: 'Анализ фрагментации', fn: () => analyzeMySQLFragmentation(config) },
        { name: 'Проверка индексов', fn: () => checkMySQLIndexes(config) }
      );
      break;
  }
  
  for (const task of tasks) {
    console.log(`\n📊 ${task.name}...`);
    try {
      await task.fn();
    } catch (error) {
      console.error(`❌ Ошибка: ${error.message}`);
    }
  }
}

async function vacuumPostgreSQL(config: DatabaseConfig) {
  const $db = getDatabaseClient(config);
  
  // Получаем список таблиц
  const tables = await $db`psql -d ${config.database} -t -c "
    SELECT schemaname || '.' || tablename 
    FROM pg_tables 
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  "`;
  
  const tableList = tables.stdout.trim().split('\n').filter(Boolean);
  // В @xec-sh/core нет progress, используем простое отображение
  let processed = 0;
  
  for (const table of tableList) {
    await $db`psql -d ${config.database} -c "VACUUM ANALYZE ${table.trim()}"`;
    processed++;
    process.stdout.write(`\rVACUUM таблиц: ${processed}/${tableList.length}`);
  }
  
  progressBar.stop();
  console.log(`✅ Оптимизировано таблиц: ${tableList.length}`);
}

async function updatePostgreSQLStats(config: DatabaseConfig) {
  const $db = getDatabaseClient(config);
  
  await $db`psql -d ${config.database} -c "ANALYZE"`;
  console.log('✅ Статистика обновлена');
}

async function findUnusedIndexes(config: DatabaseConfig) {
  const $db = getDatabaseClient(config);
  
  const unusedIndexes = await $db`psql -d ${config.database} -t -c "
    SELECT schemaname || '.' || indexname AS index_name,
           pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
    FROM pg_stat_user_indexes
    WHERE idx_scan = 0
    AND schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY pg_relation_size(indexrelid) DESC
  "`;
  
  const indexes = unusedIndexes.stdout.trim().split('\n').filter(Boolean);
  
  if (indexes.length > 0) {
    console.log('⚠️  Найдены неиспользуемые индексы:');
    indexes.forEach(idx => {
      const [name, size] = idx.split('|').map(s => s.trim());
      console.log(`  - ${name} (${size})`);
    });
  } else {
    console.log('✅ Неиспользуемых индексов не найдено');
  }
}

async function analyzeTableSizes(config: DatabaseConfig) {
  const $db = getDatabaseClient(config);
  
  const tableSizes = await $db`psql -d ${config.database} -t -c "
    SELECT schemaname || '.' || tablename AS table_name,
           pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
           pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size
    FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    LIMIT 10
  "`;
  
  console.log('📊 Топ 10 таблиц по размеру:');
  console.log('Таблица | Общий размер | Размер данных');
  console.log('-'.repeat(50));
  
  tableSizes.stdout.trim().split('\n').filter(Boolean).forEach(line => {
    const [table, total, data] = line.split('|').map(s => s.trim());
    console.log(`${table} | ${total} | ${data}`);
  });
}

async function optimizeMySQL(config: DatabaseConfig) {
  const $db = getDatabaseClient(config);
  
  // Получаем список таблиц
  const tables = await $db`mysql ${config.database} -N -e "SHOW TABLES"`;
  const tableList = tables.stdout.trim().split('\n').filter(Boolean);
  
  // В @xec-sh/core нет progress, используем простое отображение
  let optimized = 0;
  
  for (const table of tableList) {
    await $db`mysql ${config.database} -e "OPTIMIZE TABLE ${table}"`;
    optimized++;
    process.stdout.write(`\rОптимизация таблиц: ${optimized}/${tableList.length}`);
  }
  
  progressBar.stop();
  console.log(`✅ Оптимизировано таблиц: ${tableList.length}`);
}

async function analyzeMySQLFragmentation(config: DatabaseConfig) {
  const $db = getDatabaseClient(config);
  
  const fragmentation = await $db`mysql ${config.database} -e "
    SELECT TABLE_NAME, 
           ROUND(DATA_FREE/1024/1024, 2) AS fragmentation_mb
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = '${config.database}'
    AND DATA_FREE > 0
    ORDER BY DATA_FREE DESC
  "`;
  
  console.log('📊 Фрагментация таблиц:');
  console.log(fragmentation.stdout);
}

async function checkMySQLIndexes(config: DatabaseConfig) {
  const $db = getDatabaseClient(config);
  
  // Дублирующиеся индексы
  const duplicates = await $db`mysql ${config.database} -e "
    SELECT TABLE_NAME, GROUP_CONCAT(INDEX_NAME) AS duplicate_indexes
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = '${config.database}'
    GROUP BY TABLE_NAME, COLUMN_NAME
    HAVING COUNT(*) > 1
  "`;
  
  if (duplicates.stdout.trim().split('\n').length > 1) {
    console.log('⚠️  Найдены дублирующиеся индексы:');
    console.log(duplicates.stdout);
  } else {
    console.log('✅ Дублирующихся индексов не найдено');
  }
}

// Утилиты
function getDatabaseClient(config: DatabaseConfig) {
  switch (config.type) {
    case 'postgresql':
      return $.with({
        env: {
          PGPASSWORD: config.password,
          PGHOST: config.host,
          PGPORT: config.port || '5432',
          PGUSER: config.username
        }
      });
    case 'mysql':
      return $.with({
        env: {
          MYSQL_PWD: config.password
        }
      });
    default:
      return $;
  }
}

async function uploadBackupToCloud(backupFile: string, cloudConfig: CloudStorageConfig) {
  console.log('\n☁️  Загрузка в облако...');
  
  switch (cloudConfig.provider) {
    case 's3':
      await $`aws s3 cp ${backupFile} s3://${cloudConfig.bucket}/${path.basename(backupFile)}`;
      break;
    case 'gcs':
      await $`gsutil cp ${backupFile} gs://${cloudConfig.bucket}/${path.basename(backupFile)}`;
      break;
    case 'azure':
      await $`az storage blob upload -f ${backupFile} -c ${cloudConfig.container} -n ${path.basename(backupFile)}`;
      break;
  }
  
  console.log('✅ Загружено в облако');
}

async function cleanupOldBackups(backupPath: string, retentionDays: number) {
  console.log('\n🗑️  Очистка старых бэкапов...');
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  const files = await fs.readdir(backupPath);
  let deletedCount = 0;
  
  for (const file of files) {
    const filePath = path.join(backupPath, file);
    const stats = await fs.stat(filePath);
    
    if (stats.mtime < cutoffDate) {
      await fs.unlink(filePath);
      deletedCount++;
    }
  }
  
  if (deletedCount > 0) {
    console.log(`✅ Удалено старых бэкапов: ${deletedCount}`);
  }
}

async function sendBackupNotification(config: BackupConfig, result: any) {
  if (!config.notifications) return;
  
  const message = result.status === 'success'
    ? `✅ Бэкап ${config.database} успешно создан\nФайл: ${path.basename(result.file)}\nРазмер: ${formatBytes(result.size)}`
    : `❌ Ошибка бэкапа ${config.database}\n${result.error}`;
  
  // Здесь можно реализовать отправку уведомлений
  console.log('\n📧 Уведомление:', message);
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function average(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

// Типы
interface DatabaseConfig {
  type: 'postgresql' | 'mysql' | 'mongodb';
  host: string;
  port?: number;
  username: string;
  password: string;
  database: string;
}

interface BackupConfig extends DatabaseConfig {
  backupPath: string;
  retentionDays: number;
  uploadToCloud?: boolean;
  cloudStorage?: CloudStorageConfig;
  includeRoles?: boolean;
  includeLargeObjects?: boolean;
  notifications?: boolean;
}

interface RestoreConfig extends DatabaseConfig {
  backupFile: string;
  dropExisting?: boolean;
  force?: boolean;
}

interface MigrationConfig extends DatabaseConfig {
  migrationsPath: string;
  backupBeforeMigration?: boolean;
  stopOnError?: boolean;
  rollbackOnError?: boolean;
}

interface CloudStorageConfig {
  provider: 's3' | 'gcs' | 'azure';
  bucket?: string;
  container?: string;
  credentials?: any;
}

interface Migration {
  name: string;
  path: string;
}

interface DatabaseMetrics {
  activeConnections: number;
  queriesPerSecond: number;
  avgLatency: number;
  locks: number;
  slowQueries: Array<{ query: string; duration: number }>;
}

// Экспорт
export {
  databaseBackup,
  databaseRestore,
  optimizeDatabase,
  runDatabaseMigrations,
  monitorDatabasePerformance
};