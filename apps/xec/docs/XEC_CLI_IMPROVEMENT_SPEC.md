# Спецификация доработок Xec CLI

## Анализ текущего состояния

### Реализованный функционал
1. **Выполнение скриптов**:
   - Прямой запуск: `xec script.js`
   - Команда run: `xec run script.js`
   - Поддержка TypeScript, ES modules
   - Watch режим
   - REPL
   - Eval режим

2. **SSH команда**: базовая поддержка SSH с параллельным выполнением

3. **Динамические команды**: загрузка из `.xec/commands/`

### Недостатки текущей реализации
1. Мало встроенных команд (только run, ssh, version)
2. Нет команды init для инициализации проекта
3. Механизм динамических команд требует доработки
4. Отсутствуют многие полезные команды из CLI_SPEC.md
5. Нет системы конфигурации и профилей
6. Нет поддержки docker/k8s команд

## Пошаговая спецификация доработок

### Фаза 1: Базовая инфраструктура (Приоритет: Высокий)

#### 1.1 Команда init
Создать команду для инициализации .xec проекта:

```typescript
// src/commands/init.ts
- Интерактивный режим с @clack/prompts
- Создание структуры .xec/
  ├── config.yaml      # Конфигурация проекта
  ├── scripts/         # Xec скрипты
  ├── commands/        # Динамические команды
  ├── templates/       # Шаблоны
  └── .gitignore
- Опции: --minimal, --from-template
```

#### 1.2 Система конфигурации
Создать модуль для работы с конфигурацией:

```typescript
// src/utils/config.ts
- Загрузка из ~/.xec/config.yaml и .xec/config.yaml
- Поддержка профилей
- Слияние конфигураций
- Валидация через zod
```

#### 1.3 Улучшение динамических команд
Доработать загрузчик команд:

```typescript
// src/utils/dynamic-commands.ts
- Поддержка TypeScript команд
- Валидация команд
- Автодополнение для динамических команд
- Поддержка command и default экспортов
```

### Фаза 2: Основные команды DevOps (Приоритет: Высокий)

#### 2.1 Команда exec
Универсальное выполнение команд:

```typescript
// src/commands/exec.ts
- Поддержка всех адаптеров (local, ssh, docker, k8s)
- Выполнение из файла
- Шаблоны команд
- Параллельное выполнение
```

#### 2.2 Команда docker
Работа с Docker:

```typescript
// src/commands/docker.ts
- exec: выполнение в контейнере
- ps/start/stop/restart: управление
- logs: просмотр логов
- run: запуск контейнера
- compose: поддержка docker-compose
```

#### 2.3 Команда k8s
Работа с Kubernetes:

```typescript
// src/commands/k8s.ts
- exec: выполнение в поде
- logs: просмотр логов
- port-forward: проброс портов
- get/describe: информация о ресурсах
```

#### 2.4 Команда copy
Копирование файлов:

```typescript
// src/commands/copy.ts
- Локальное копирование
- SSH копирование
- Docker копирование
- K8s копирование
- Прогресс-бар
```

### Фаза 3: Продвинутые команды (Приоритет: Средний)

#### 3.1 Команда pipe
Конвейеры команд:

```typescript
// src/commands/pipe.ts
- Простые конвейеры
- Межсредовые конвейеры
- Конфигурация из YAML
```

#### 3.2 Команда batch
Пакетное выполнение:

```typescript
// src/commands/batch.ts
- Выполнение на нескольких хостах
- Файл с заданиями
- Контроль параллелизма
- Сохранение результатов
```

#### 3.3 Команда watch
Наблюдение за изменениями:

```typescript
// src/commands/watch.ts
- Файлы и директории
- Команды с интервалом
- Действия при изменении
```

#### 3.4 Команда env
Управление переменными окружения:

```typescript
// src/commands/env.ts
- Показать/установить переменные
- Загрузка из .env файлов
- Выполнение с окружением
```

### Фаза 4: Утилиты и интеграции (Приоритет: Низкий)

#### 4.1 Команда config
Управление конфигурацией:

```typescript
// src/commands/config.ts
- show/edit конфигурации
- Управление профилями
- Валидация конфигурации
```

#### 4.2 Команда list
Список доступных ресурсов:

```typescript
// src/commands/list.ts
- Скрипты
- Команды
- Профили
- Хосты
```

#### 4.3 Команда template
Работа с шаблонами:

```typescript
// src/commands/template.ts
- Рендеринг шаблонов
- Управление шаблонами
- Переменные и функции
```

### Фаза 5: Улучшения UX (Приоритет: Средний)

#### 5.1 Автодополнение
```typescript
// src/utils/completion.ts
- Bash/Zsh/Fish completion
- Динамическое дополнение для команд
- Дополнение файлов и хостов
```

#### 5.2 Интерактивный режим
```typescript
// src/utils/interactive.ts
- Улучшенный REPL
- История команд
- Подсветка синтаксиса
```

#### 5.3 Форматирование вывода
```typescript
// src/utils/output.ts
- Таблицы
- JSON/YAML вывод
- Цветовое кодирование
- Прогресс-бары
```

## Структура .xec проекта

```
.xec/
├── config.yaml          # Конфигурация проекта
├── scripts/             # Xec скрипты
│   ├── deploy.js
│   ├── backup.ts
│   └── maintenance/
├── commands/            # Динамические CLI команды
│   ├── deploy.js        # xec deploy
│   └── custom/
│       └── tool.ts      # xec custom:tool
├── templates/           # Шаблоны
│   ├── nginx.conf.hbs
│   └── docker-compose.yaml.hbs
├── pipelines/          # Конвейеры
│   └── ci.yaml
├── batches/            # Пакетные задания
│   └── update-all.yaml
├── inventory/          # Инвентарь хостов
│   ├── production.yaml
│   └── staging.yaml
└── .gitignore
```

## Примеры использования после доработок

```bash
# Инициализация проекта
xec init
xec init --minimal
xec init --from-template devops

# Выполнение команд
xec exec "ls -la"
xec exec -a ssh -h server.com "uptime"
xec exec -a docker -c myapp "npm test"
xec exec -a k8s --pod webapp "ps aux"

# Docker операции
xec docker ps
xec docker exec myapp "npm run migrate"
xec docker logs myapp --follow
xec docker compose up -d

# Kubernetes операции
xec k8s exec webapp "date"
xec k8s logs webapp --tail 100
xec k8s port-forward webapp 8080:80

# Копирование файлов
xec copy app.tar.gz server:/tmp/
xec copy server:/logs/*.log ./backups/
xec copy --from docker:myapp:/app/dist ./dist

# Пакетное выполнение
xec batch -h web1,web2,web3 "sudo systemctl restart nginx"
xec batch --file deploy-jobs.yaml --parallel 5

# Конвейеры
xec pipe "cat data.csv" "grep ERROR" "wc -l"
xec pipe --file etl-pipeline.yaml

# Работа с окружением
xec env set NODE_ENV=production
xec env run --file .env.prod -- npm start

# Наблюдение
xec watch src/ -x "npm test"
xec watch --command "docker ps" --interval 5s
```

## Приоритеты реализации

### Немедленно (1-2 дня)
1. ✅ Команда init
2. ✅ Система конфигурации
3. ✅ Улучшение динамических команд
4. ✅ Команда exec

### Краткосрочно (3-5 дней)
1. ✅ Команда docker
2. ✅ Команда k8s
3. ✅ Команда copy
4. ✅ Команда env

### Среднесрочно (1-2 недели)
1. ✅ Команда batch
2. ✅ Команда pipe
3. ✅ Команда watch
4. ✅ Автодополнение

### Долгосрочно
1. ✅ Команда config
2. ✅ Команда list
3. ✅ Команда template
4. ✅ Плагины

## Технические требования

1. **TypeScript**: Строгая типизация для всех команд
2. **Валидация**: Zod для проверки опций
3. **Тестирование**: Jest тесты для каждой команды
4. **Документация**: JSDoc и примеры использования
5. **Совместимость**: Node.js 16+

## Метрики успеха

1. **Функциональность**: 15+ встроенных команд
2. **Покрытие**: 80%+ тестами
3. **Производительность**: < 100ms startup time
4. **UX**: Интуитивный интерфейс, полезные сообщения об ошибках
5. **Расширяемость**: Легкое добавление новых команд