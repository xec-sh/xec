# План обеспечения совместимости CLI с рефакторингом @xec-sh/core

## Обзор ситуации

CLI (`apps/xec`) интенсивно использует API ядра (`@xec-sh/core`). Необходимо обеспечить плавную миграцию без нарушения функциональности.

## Анализ точек интеграции

### 1. Критические зависимости CLI от Core

#### 1.1 Основные импорты
```typescript
// 22+ файлов используют
import { $ } from '@xec-sh/core';

// Методы фабрики
$.ssh()    // 8 использований
$.docker() // 6 использований  
$.k8s()    // 5 использований
$.local()  // 15+ использований
```

#### 1.2 Fluent API использование
```typescript
// 25+ использований шаблонов
.raw`${command}`
.env(vars)      // 8 раз
.cd(path)       // 8 раз
.timeout(ms)    // 6 раз
.quiet()        // 4 раза
.nothrow()      // 12 раз
```

#### 1.3 Специфичные API
```typescript
// Туннелирование (forward.ts)
engine.tunnel({ localPort, remotePort })

// Интерактивный режим (in.ts)
.interactive()
```

## Стратегия обеспечения совместимости

### Этап 1: Создание адаптационного слоя

#### 1.1 Compatibility Wrapper для Core API
```typescript
// packages/core/src/compat/cli-adapter.ts
export class CLICompatibilityAdapter {
  // Сохраняем старый API для CLI
  static createLegacyAPI() {
    return {
      // Старый синтаксис продолжает работать
      ssh: (options: any) => {
        // Внутри используем новую безопасную реализацию
        const secure = new SecureSSHAdapter(options);
        return this.wrapAdapter(secure);
      },
      
      docker: (options: any) => {
        const secure = new SecureDockerAdapter(options);
        return this.wrapAdapter(secure);
      },
      
      k8s: (options: any) => {
        const secure = new SecureK8sAdapter(options);
        return this.wrapAdapter(secure);
      }
    };
  }
  
  private static wrapAdapter(adapter: BaseAdapter) {
    // Добавляем старые методы fluent API
    return {
      ...adapter,
      raw: (strings: TemplateStringsArray, ...values: any[]) => {
        // Автоматическая санитизация
        const safe = CommandSanitizer.sanitizeTemplate(strings, values);
        return adapter.execute(safe);
      },
      // Сохраняем все методы цепочки
      env: adapter.env.bind(adapter),
      cd: adapter.cd.bind(adapter),
      timeout: adapter.timeout.bind(adapter),
      quiet: adapter.quiet.bind(adapter),
      nothrow: adapter.nothrow.bind(adapter)
    };
  }
}

// В index.ts
export const $ = CLICompatibilityAdapter.createLegacyAPI();
```

#### 1.2 Сохранение сигнатур команд CLI
```typescript
// apps/xec/src/commands/base-command.ts
export abstract class BaseCommand {
  // Добавляем compatibility layer
  protected async createTargetEngine(target: Target) {
    // Используем новое ядро, но возвращаем совместимый API
    const coreEngine = await createSecureEngine(target);
    return wrapForCLICompatibility(coreEngine);
  }
}
```

### Этап 2: Постепенная миграция команд

#### 2.1 Приоритезация команд по риску
```markdown
ВЫСОКИЙ РИСК (мигрировать первыми):
- on.ts - SSH выполнение (критично для безопасности)
- forward.ts - туннелирование портов
- copy.ts - файловые операции

СРЕДНИЙ РИСК:
- in.ts - Docker выполнение
- logs.ts - просмотр логов
- secrets.ts - управление секретами

НИЗКИЙ РИСК:
- config.ts - конфигурация
- inspect.ts - инспекция
- new.ts - создание артефактов
```

#### 2.2 Пример миграции команды `on.ts`
```typescript
// apps/xec/src/commands/on.ts

// BEFORE: Уязвимый код
export class OnCommand extends BaseCommand {
  async execute(args: string[], flags: Record<string, any>) {
    const engine = await this.createTargetEngine(target);
    // УЯЗВИМОСТЬ: прямая интерполяция
    const result = await engine.raw`${command}`;
  }
}

// AFTER: Безопасный код с сохранением API
export class OnCommand extends BaseCommand {
  async execute(args: string[], flags: Record<string, any>) {
    const engine = await this.createTargetEngine(target);
    // Автоматическая санитизация внутри raw
    const result = await engine.raw`${command}`;
    // API не изменился, но теперь безопасен
  }
}
```

### Этап 3: Тестирование совместимости

#### 3.1 Матрица тестов совместимости
```typescript
// apps/xec/test/compat/core-api.test.ts
describe('Core API Compatibility', () => {
  const testCases = [
    // SSH команды
    { cmd: 'on', args: ['server', 'ls'], expected: 'file list' },
    { cmd: 'on', args: ['server', 'echo $HOME'], expected: '/home/user' },
    
    // Docker команды
    { cmd: 'in', args: ['container', 'pwd'], expected: '/app' },
    
    // Туннелирование
    { cmd: 'forward', args: ['server', '8080:80'], expected: 'tunnel created' },
    
    // Файловые операции
    { cmd: 'copy', args: ['file.txt', 'server:/tmp/'], expected: 'copied' }
  ];
  
  testCases.forEach(({ cmd, args, expected }) => {
    it(`should maintain compatibility for: xec ${cmd} ${args.join(' ')}`, async () => {
      const result = await runCLICommand(cmd, args);
      expect(result).toContain(expected);
    });
  });
});
```

#### 3.2 Регрессионное тестирование
```bash
#!/bin/bash
# apps/xec/test/regression.sh

# Сохраняем текущие результаты
for cmd in on in forward copy logs; do
  xec $cmd --help > "baseline/$cmd.help.txt"
  xec $cmd test-target "echo test" > "baseline/$cmd.output.txt"
done

# После рефакторинга сравниваем
for cmd in on in forward copy logs; do
  xec $cmd --help > "after/$cmd.help.txt"
  diff "baseline/$cmd.help.txt" "after/$cmd.help.txt"
done
```

### Этап 4: Безопасные улучшения CLI

#### 4.1 Добавление проверок безопасности
```typescript
// apps/xec/src/utils/security-checks.ts
export class CLISecurityChecks {
  static validateCommand(command: string): void {
    const dangerous = [
      /rm\s+-rf\s+\//,     // rm -rf /
      /:(){ :|:& };:/,     // fork bomb
      />\s*\/dev\/sda/,    // disk overwrite
    ];
    
    for (const pattern of dangerous) {
      if (pattern.test(command)) {
        throw new SecurityError(
          'Potentially dangerous command detected. Use --force to override.'
        );
      }
    }
  }
  
  static sanitizeUserInput(input: string): string {
    // Используем санитайзер из core
    return CommandSanitizer.sanitize(input, 'shell');
  }
}
```

#### 4.2 Аудит использования credentials
```typescript
// apps/xec/src/config/credential-audit.ts
export class CredentialAudit {
  static auditConfigFile(configPath: string): SecurityReport {
    const config = loadConfig(configPath);
    const issues: SecurityIssue[] = [];
    
    // Проверяем plain-text пароли
    if (config.targets) {
      for (const [name, target] of Object.entries(config.targets)) {
        if (target.password) {
          issues.push({
            severity: 'HIGH',
            message: `Plain text password in target '${name}'`,
            suggestion: 'Use SSH keys or credential references'
          });
        }
      }
    }
    
    return { issues, recommendations: this.getRecommendations(issues) };
  }
}
```

### Этап 5: Feature Flags для контролируемого rollout

#### 5.1 Конфигурация feature flags
```typescript
// apps/xec/src/features.ts
export const FEATURES = {
  // Безопасность
  SECURE_COMMAND_EXECUTION: process.env.XEC_SECURE_COMMANDS === 'true',
  CREDENTIAL_ENCRYPTION: process.env.XEC_ENCRYPT_CREDS === 'true',
  
  // Производительность
  CONNECTION_POOLING: process.env.XEC_POOL_CONNECTIONS === 'true',
  EXECUTION_CACHE: process.env.XEC_CACHE_RESULTS === 'true',
  
  // Новые возможности
  SMART_RETRY: process.env.XEC_SMART_RETRY === 'true',
  METRICS_COLLECTION: process.env.XEC_COLLECT_METRICS === 'true'
};

// Использование
if (FEATURES.SECURE_COMMAND_EXECUTION) {
  command = CommandSanitizer.sanitize(command);
}
```

#### 5.2 Постепенное включение
```bash
# Этап 1: Тестирование с небольшой группой
XEC_SECURE_COMMANDS=true xec on server "ls"

# Этап 2: Включение для non-critical команд
export XEC_SECURE_COMMANDS=true
xec config get
xec inspect

# Этап 3: Полное включение
echo "XEC_SECURE_COMMANDS=true" >> ~/.xecrc
```

## План миграции по неделям

### Неделя 1-2: Подготовка
- ✅ Создать compatibility layer в core
- ✅ Добавить тесты совместимости
- ✅ Настроить feature flags

### Неделя 3-4: Безопасность
- ✅ Мигрировать команду `on` (SSH)
- ✅ Мигрировать команду `copy` (файлы)
- ✅ Добавить аудит credentials

### Неделя 5-6: Производительность
- ✅ Включить connection pooling для SSH
- ✅ Добавить кэширование результатов
- ✅ Оптимизировать параллельное выполнение

### Неделя 7-8: Новые возможности
- ✅ Добавить smart retry
- ✅ Включить сбор метрик
- ✅ Улучшить error reporting

### Неделя 9: Финализация
- ✅ Полное регрессионное тестирование
- ✅ Обновить документацию
- ✅ Подготовить migration guide

## Метрики успеха

### Функциональность
- ✅ 100% существующих команд работают без изменений
- ✅ Все тесты CLI проходят
- ✅ Нет breaking changes в публичном API

### Безопасность
- ✅ 0 уязвимостей command injection
- ✅ Все credentials зашифрованы
- ✅ Аудит всех sensitive операций

### Производительность
- ✅ SSH команды выполняются на 30% быстрее (connection pooling)
- ✅ Повторные команды на 60% быстрее (кэширование)
- ✅ Память не увеличивается более чем на 10%

### Удобство использования
- ✅ Время на написание простого скрипта не увеличилось
- ✅ Документация понятна новым пользователям
- ✅ Миграция существующих скриптов автоматизирована

## Риски и митигация

### Риск 1: Breaking changes в core ломают CLI
**Митигация**: Compatibility layer + comprehensive testing

### Риск 2: Снижение производительности
**Митигация**: Benchmark каждого изменения, rollback при деградации

### Риск 3: Усложнение для пользователей
**Митигация**: Сохранение простого API, улучшения "под капотом"

### Риск 4: Неполная миграция
**Митигация**: Feature flags позволяют откатиться

## Инструменты для миграции

### 1. Автоматический мигратор скриптов
```typescript
// tools/migrate-scripts.ts
export class ScriptMigrator {
  migrate(scriptPath: string): MigrationResult {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    
    // Обновляем импорты
    let migrated = content.replace(
      /import \{ \$ \} from '@xec-sh\/core'/g,
      "import { $$ as $ } from '@xec-sh/core' // Migrated to secure API"
    );
    
    // Добавляем санитизацию где нужно
    migrated = this.addSanitization(migrated);
    
    return {
      original: content,
      migrated,
      changes: this.detectChanges(content, migrated)
    };
  }
}
```

### 2. Проверка совместимости
```bash
# tools/check-compatibility.sh
#!/bin/bash

echo "Checking CLI compatibility with new core..."

# Проверяем импорты
grep -r "from '@xec-sh/core'" apps/xec/src

# Проверяем использование deprecated API
grep -r "interpolateRaw" apps/xec/src

# Запускаем тесты совместимости
npm run test:compat
```

## Заключение

План обеспечивает:
1. **100% обратную совместимость** через compatibility layer
2. **Постепенную миграцию** с feature flags
3. **Улучшение безопасности** без изменения UX
4. **Мониторинг и rollback** на каждом этапе

Ключевой принцип: **Evolution, not Revolution** - улучшаем постепенно, не ломая существующее.