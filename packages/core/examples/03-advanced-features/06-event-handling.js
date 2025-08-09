import { ExecutionEngine } from '@xec-sh/core';
const engine = new ExecutionEngine();
engine.on('command:start', (event) => {
    console.log(`Начало выполнения: ${event.command}`);
});
engine.on('command:complete', (event) => {
    console.log(`Завершено: ${event.command} (код: ${event.exitCode})`);
});
const $engine = engine.asCallable();
await $engine `echo "Hello, Events!"`;
await $engine `ls -la`;
engine.on('command:error', (event) => {
    console.error(`Ошибка в команде: ${event.command}`);
    console.error(`Причина: ${event.error.message}`);
});
try {
    await $engine `exit 1`;
}
catch (e) {
}
engine.on('command:complete', (event) => {
    console.log(`Производительность: ${event.command} - ${event.duration}ms`);
});
await $engine `sleep 1`;
await $engine `sleep 0.5`;
await $engine `echo "Fast command"`;
engine.on('file:write', (event) => {
    console.log(`Файл записан: ${event.path}`);
});
engine.on('file:read', (event) => {
    console.log(`Файл прочитан: ${event.path}`);
});
await $engine `echo "test data" > /tmp/test-file.txt`;
class DeploymentTracker {
    constructor(engine) {
        this.engine = engine;
        this.deployments = new Map();
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
await $engine `echo "Starting deployment..." && sleep 1`;
await $engine `echo "Running deploy script..." && sleep 0.5`;
console.log('\nСтатистика деплоев:', deploymentTracker.getStats());
const commandFilter = (pattern) => (event) => {
    if (pattern.test(event.command)) {
        console.log(`[Фильтр] Найдена команда: ${event.command}`);
    }
};
engine.on('command:start', commandFilter(/^echo/));
await $engine `echo "First echo"`;
await $engine `ls -la`;
await $engine `echo "Second echo"`;
const eventStats = {
    totalCommands: 0,
    successfulCommands: 0,
    failedCommands: 0,
    totalDuration: 0,
    commandTypes: new Map()
};
engine.on('command:complete', (event) => {
    eventStats.totalCommands++;
    eventStats.totalDuration += event.duration;
    if (event.exitCode === 0) {
        eventStats.successfulCommands++;
    }
    else {
        eventStats.failedCommands++;
    }
    const cmdType = event.command.split(' ')[0];
    eventStats.commandTypes.set(cmdType, (eventStats.commandTypes.get(cmdType) || 0) + 1);
});
for (let i = 0; i < 5; i++) {
    await $engine `echo "Test ${i}"`;
}
await $engine `ls`.nothrow();
await $engine `false`.nothrow();
console.log('\nСтатистика событий:', eventStats);
engine.on('ssh:connect', (event) => {
    console.log(`SSH соединение: ${event.host}:${event.port}`);
});
engine.on('ssh:disconnect', (event) => {
    console.log(`SSH отключение: ${event.host}`);
});
const $local = engine.local().asCallable();
await $local `echo "Running locally"`;
let commandCount = 0;
const logHandler = (event) => {
    commandCount++;
    console.log(`Временный логгер [${commandCount}]: ${event.command}`);
};
engine.on('command:start', logHandler);
await $engine `echo "With logger 1"`;
await $engine `echo "With logger 2"`;
engine.off('command:start', logHandler);
await $engine `echo "Without logger"`;
console.log(`Всего залогировано команд: ${commandCount}`);
class CommandTracker {
    constructor(engine) {
        this.engine = engine;
        this.commands = new Map();
        this.errorCount = 0;
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
await $engine `echo "Test 1"`;
await $engine `sleep 0.5`;
await $engine `false`.nothrow();
console.log('\nСтатистика команд:', tracker.getStats());
const tempFiles = [];
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
await $engine `mktemp /tmp/test-XXXXX`;
console.log('\nОставшиеся временные файлы:', tempFiles);
for (const file of tempFiles) {
    await $engine `rm -f ${file} 2>/dev/null || true`;
}
//# sourceMappingURL=06-event-handling.js.map