/**
 * 06. Event Handling - Обработка событий
 * 
 * Показывает работу с системой событий.
 * 
 * ВАЖНО: Для работы с событиями нужно создать экземпляр ExecutionEngine.
 * Прямой доступ к $ не даёт возможности подписаться на события.
 */

import { ExecutionEngine } from '@xec-sh/core';

// 1. Создание экземпляра ExecutionEngine для работы с событиями
const engine = new ExecutionEngine();

// Подписка на события
engine.on('command:start', (event) => {
  console.log(`Начало выполнения: ${event.command}`);
});

engine.on('command:complete', (event) => {
  console.log(`Завершено: ${event.command} (код: ${event.exitCode})`);
});

// Создаём callable версию для выполнения команд
const $engine = engine.asCallable();

// Выполнение команд
await $engine`echo "Hello, Events!"`;
await $engine`ls -la`;

// 2. Обработка ошибок через события
engine.on('command:error', (event) => {
  console.error(`Ошибка в команде: ${event.command}`);
  console.error(`Причина: ${event.error.message}`);
});

// Провоцируем ошибку
try {
  await $engine`exit 1`;
} catch (e) {
  // Ошибка будет обработана в событии
}

// 3. Мониторинг производительности
// Для command:complete события время выполнения уже доступно
engine.on('command:complete', (event) => {
  console.log(`Производительность: ${event.command} - ${event.duration}ms`);
});

// Тестирование
await $engine`sleep 1`;
await $engine`sleep 0.5`;
await $engine`echo "Fast command"`;

// 4. Работа с файловыми событиями
// Пример отслеживания файловых операций (если бы они были интегрированы)

// Отслеживаем файловые события (если поддерживаются)
engine.on('file:write', (event) => {
  console.log(`Файл записан: ${event.path}`);
});

engine.on('file:read', (event) => {
  console.log(`Файл прочитан: ${event.path}`);
});

// Пример - запись в файл через команду (события не будут срабатывать автоматически)
await $engine`echo "test data" > /tmp/test-file.txt`;

// 5. Пример сложного сценария с событиями
// Отслеживаем выполнение команд
class DeploymentTracker {
  private deployments = new Map();
  
  constructor(private engine: ExecutionEngine) {
    // Отслеживаем начало и конец команд
    engine.on('command:start', (event) => {
      if (event.command.includes('deploy')) {
        this.deployments.set(event.command, {
          startTime: Date.now(),
          status: 'in-progress'
        });
        console.log(`[Деплой] Начато: ${event.command}`);
      }
    });
    
    engine.on('command:complete', (event) => {
      if (event.command.includes('deploy')) {
        const deployment = this.deployments.get(event.command);
        if (deployment) {
          deployment.status = event.exitCode === 0 ? 'success' : 'failed';
          deployment.duration = Date.now() - deployment.startTime;
          console.log(`[Деплой] Завершено: ${event.command} - ${deployment.status} (${deployment.duration}ms)`);
        }
      }
    });
  }
  
  getStats() {
    return Array.from(this.deployments.entries());
  }
}

const deploymentTracker = new DeploymentTracker(engine);

// Пример развёртывания
await $engine`echo "Starting deployment..." && sleep 1`;
await $engine`echo "Running deploy script..." && sleep 0.5`;

console.log('\nСтатистика деплоев:', deploymentTracker.getStats());

// 6. Фильтрация событий
const commandFilter = (pattern: RegExp) => (event: any) => {
    if (pattern.test(event.command)) {
      console.log(`[Фильтр] Найдена команда: ${event.command}`);
    }
  };

// Отслеживать только echo команды
engine.on('command:start', commandFilter(/^echo/));

await $engine`echo "First echo"`;
await $engine`ls -la`;
await $engine`echo "Second echo"`;

// 7. Агрегация событий
const eventStats = {
  totalCommands: 0,
  successfulCommands: 0,
  failedCommands: 0,
  totalDuration: 0,
  commandTypes: new Map<string, number>()
};

engine.on('command:complete', (event) => {
  eventStats.totalCommands++;
  eventStats.totalDuration += event.duration;
  
  if (event.exitCode === 0) {
    eventStats.successfulCommands++;
  } else {
    eventStats.failedCommands++;
  }
  
  // Тип команды
  const cmdType = event.command.split(' ')[0];
  eventStats.commandTypes.set(
    cmdType,
    (eventStats.commandTypes.get(cmdType) || 0) + 1
  );
});

// Выполняем разные команды
for (let i = 0; i < 5; i++) {
  await $engine`echo "Test ${i}"`;
}
await $engine`ls`.nothrow();
await $engine`false`.nothrow();

console.log('\nСтатистика событий:', eventStats);

// 8. SSH события (если бы SSH адаптер был настроен)
// Пример отслеживания SSH событий
engine.on('ssh:connect', (event) => {
  console.log(`SSH соединение: ${event.host}:${event.port}`);
});

engine.on('ssh:disconnect', (event) => {
  console.log(`SSH отключение: ${event.host}`);
});

// Пример с локальным адаптером
const $local = engine.local().asCallable();
await $local`echo "Running locally"`;

// 9. Работа с событиями через временные обработчики
// Пример временного логирования
let commandCount = 0;
const logHandler = (event: any) => {
  commandCount++;
  console.log(`Временный логгер [${commandCount}]: ${event.command}`);
};

engine.on('command:start', logHandler);

await $engine`echo "With logger 1"`;
await $engine`echo "With logger 2"`;

// Отменяем подписку
engine.off('command:start', logHandler);

await $engine`echo "Without logger"`;
console.log(`Всего залогировано команд: ${commandCount}`);

// 10. Пример сложного трекинга команд
// Класс для отслеживания всех команд и их результатов
class CommandTracker {
  private commands = new Map();
  private errorCount = 0;
  
  constructor(private engine: ExecutionEngine) {
    engine.on('command:start', (event) => {
      this.commands.set(event.command, {
        startTime: Date.now(),
        status: 'running'
      });
    });
    
    engine.on('command:complete', (event) => {
      const cmd = this.commands.get(event.command);
      if (cmd) {
        cmd.status = event.exitCode === 0 ? 'success' : 'failed';
        cmd.duration = event.duration;
        if (event.exitCode !== 0) {
          this.errorCount++;
        }
      }
    });
    
    engine.on('command:error', (event) => {
      this.errorCount++;
      console.error(`Ошибка в команде: ${event.command}`);
    });
  }
  
  getStats() {
    return {
      total: this.commands.size,
      errors: this.errorCount,
      commands: Array.from(this.commands.entries())
    };
  }
}

const tracker = new CommandTracker(engine);

// Выполняем разные команды
await $engine`echo "Test 1"`;
await $engine`sleep 0.5`;
await $engine`false`.nothrow();

console.log('\nСтатистика команд:', tracker.getStats());

// 11. Пример использования временных файлов
// Отслеживаем создание и удаление временных файлов
const tempFiles: string[] = [];

engine.on('temp:create', (event) => {
  tempFiles.push(event.path);
  console.log(`Временный файл создан: ${event.path}`);
});

engine.on('temp:cleanup', (event) => {
  const index = tempFiles.indexOf(event.path);
  if (index > -1) {
    tempFiles.splice(index, 1);
  }
  console.log(`Временный файл удалён: ${event.path}`);
});

// Пример с временными файлами (если бы они генерировали события)
// На данный момент команды не генерируют события temp
await $engine`mktemp /tmp/test-XXXXX`;

console.log('\nОставшиеся временные файлы:', tempFiles);

// Очищаем все созданные файлы
for (const file of tempFiles) {
  await $engine`rm -f ${file} 2>/dev/null || true`;
}
