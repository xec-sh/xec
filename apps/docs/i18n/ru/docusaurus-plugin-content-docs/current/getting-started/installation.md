---
sidebar_position: 1
---

# Установка

Получите Xec работающим на вашей системе за считанные минуты.

## Предварительные требования

Перед установкой Xec убедитесь, что у вас есть следующее:

- **Node.js** (версия 18 или выше)
- **npm** или **yarn** менеджер пакетов
- **Git** (для клонирования репозиториев и контроля версий)

### Дополнительные зависимости

В зависимости от того, какие функции вы планируете использовать:

- **Docker** - Для функциональности Docker адаптера
- **kubectl** - Для функциональности Kubernetes адаптера
- **SSH клиент** - Для удаленного выполнения через SSH

## Методы установки

### 1. Глобальная установка (Рекомендуется)

Установите Xec глобально, чтобы использовать CLI откуда угодно:

```bash
# Используя npm
npm install -g @xec-sh/cli

# Используя yarn
yarn global add @xec-sh/cli
```

Проверьте установку:

```bash
xec --version
```

### 2. Установка для конкретного проекта

Для автоматизации конкретного проекта установите Xec как зависимость:

```bash
# Создайте новый проект
mkdir my-automation && cd my-automation
npm init -y

# Установите пакеты Xec
npm install @xec-sh/core @xec-sh/cli

# Или с yarn
yarn add @xec-sh/core @xec-sh/cli
```

### 3. Установка для разработки

Для вклада в Xec или использования последних функций:

```bash
# Клонируйте репозиторий
git clone https://github.com/xec-sh/xec.git
cd xec

# Установите зависимости
yarn install

# Соберите все пакеты
yarn build

# Свяжите CLI глобально
cd apps/xec
npm link
```

## Инструкции для конкретных платформ

### macOS

```bash
# Установите Node.js используя Homebrew
brew install node

# Установите Xec
npm install -g @xec-sh/cli

# Опционально: Установите Docker Desktop
brew install --cask docker

# Опционально: Установите kubectl
brew install kubectl
```

### Linux (Ubuntu/Debian)

```bash
# Установите Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Установите Xec
sudo npm install -g @xec-sh/cli

# Опционально: Установите Docker
sudo apt-get update
sudo apt-get install docker.io
sudo usermod -aG docker $USER

# Опционально: Установите kubectl
sudo snap install kubectl --classic
```

### Windows

```powershell
# Установите Node.js используя Chocolatey
choco install nodejs

# Или скачайте с https://nodejs.org

# Установите Xec
npm install -g @xec-sh/cli

# Опционально: Установите Docker Desktop
# Скачайте с https://www.docker.com/products/docker-desktop

# Опционально: Установите kubectl
choco install kubernetes-cli
```

### Использование WSL (Windows Subsystem for Linux)

Для лучшего опыта на Windows мы рекомендуем использовать WSL:

```bash
# В терминале WSL следуйте инструкциям по установке Linux
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g @xec-sh/cli
```

## Проверка установки

После установки проверьте, что все работает:

```bash
# Проверьте версию Xec CLI
xec --version

# Проверьте доступные команды
xec --help

# Запустите простой тест
xec eval 'console.log("Xec is working!")'
```

## Начальная конфигурация

Создайте глобальный файл конфигурации:

```bash
# Создайте директорию конфигурации
mkdir -p ~/.xec

# Инициализируйте конфигурацию
xec config init
```

Это создает `~/.xec/config.json` с настройками по умолчанию:

```json
{
  "defaultShell": "/bin/bash",
  "timeout": 300000,
  "retries": 3,
  "paths": {
    "recipes": "~/.xec/recipes",
    "tasks": "~/.xec/tasks",
    "modules": "~/.xec/modules"
  }
}
```

## Настройка сред

### Локальная среда

Дополнительная настройка не требуется - локальное выполнение работает из коробки.

### SSH среда

Убедитесь, что у вас настроен доступ SSH:

```bash
# Сгенерируйте SSH ключ если нужно
ssh-keygen -t ed25519 -C "your-email@example.com"

# Скопируйте публичный ключ на удаленный сервер
ssh-copy-id user@remote-server

# Проверьте SSH соединение
ssh user@remote-server
```

### Docker среда

Убедитесь, что Docker запущен:

```bash
# Проверьте статус Docker
docker --version
docker ps

# Скачайте часто используемые образы
docker pull node:18
docker pull ubuntu:latest
```

### Kubernetes среда

Настройте доступ kubectl:

```bash
# Проверьте конфигурацию kubectl
kubectl config view

# Проверьте доступ к кластеру
kubectl cluster-info
kubectl get nodes
```

## Устранение проблем установки

### Частые проблемы

#### Permission Denied (npm)

Если вы получаете ошибки разрешений во время глобальной установки:

```bash
# Вариант 1: Используйте менеджер версий Node (рекомендуется)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# Вариант 2: Измените директорию по умолчанию npm
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

#### Command Not Found

Если команда `xec` не найдена после установки:

```bash
# Проверьте директорию глобальных bin npm
npm config get prefix

# Добавьте в PATH (настройте путь по необходимости)
export PATH="$(npm config get prefix)/bin:$PATH"

# Сделайте постоянным
echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.bashrc
```

#### Node Version Too Old

Если у вас более старая версия Node.js:

```bash
# Проверьте текущую версию
node --version

# Обновите Node.js
# macOS с Homebrew
brew upgrade node

# Linux с NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Или используйте nvm
nvm install 18
nvm alias default 18
```

## Следующие шаги

Теперь, когда Xec установлен, вы готовы:

1. Следовать [Руководству по быстрому старту](./quick-start)
2. Изучить [примеры скриптов](../projects/core/examples)
3. Создать ваш [первый проект](./first-project)

## Удаление

Если вам нужно удалить Xec:

```bash
# Глобальная установка
npm uninstall -g @xec-sh/cli

# Установка проекта
npm uninstall @xec-sh/core @xec-sh/cli

# Удалите конфигурацию
rm -rf ~/.xec
```

## Получение помощи

Если вы столкнулись с проблемами:

1. Поищите в [GitHub Issues](https://github.com/xec-sh/xec/issues)
2. Проверьте [Документацию](../intro)

Добро пожаловать в сообщество Xec! 🎉 