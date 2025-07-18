# @xec/core to CLI Capability Mapping

This document provides a comprehensive mapping of all @xec/core capabilities to their corresponding CLI commands, identifying gaps where CLI coverage is missing.

## Core Capabilities Overview

### 1. Type System
- **Base Types**: Variables, Helper, JSONSchema, Condition, HostSelector, Logger, TaskHandler, TaskResult, RetryConfig, Hook, ErrorHook, Metadata, Phase, BaseEvent, ValidationResult, OSPlatform, Architecture, EnvironmentType, ExecutionOptions
- **Task Types**: Task, TaskOptions, TaskContext, ExtendedTaskContext, TaskBuilderOptions, TaskExecutionResult, TaskRegistryEntry, TaskDefinition, SkipTaskError
- **Recipe Types**: Recipe, RecipeHooks, RecipeMetadata, RecipeOutput, RecipeExample, RecipeContext, PhaseContext, TaskHookContext, ErrorContext, SkipContext, RecipeBuilderOptions, RecipeExecutionOptions, RecipeExecutionResult, RecipeValidationResult, RecipeExport
- **Module Types**: Module, ModuleExports, ModuleMetadata, ModuleLifecycle, ModuleLoaderOptions, ModuleResolution, ModuleRegistryEntry, ModuleDependency, ModuleValidationResult, ModuleUpdate, ModuleLoadEvent, XecModule, ModuleConfig, HealthCheckResult, PatternDefinition, IntegrationDefinition, HelperDefinition, IntegrationAdapter, ModuleDependencyGraph, ModuleNode, ModuleSearchCriteria, ModuleUpdateOptions, ModuleError
- **Pattern Types**: Pattern, PatternCategory, PatternParameter, PatternOptions, PatternMetadata, PatternExample, DeploymentPatternOptions, BlueGreenOptions, CanaryOptions, CanarySuccessCriteria, RollingUpdateOptions, ABTestingOptions, CircuitBreakerOptions, RetryPatternOptions, PatternContext, PatternResult, PatternRegistryEntry, PatternError
- **Environment Types**: EnvironmentInfo, EnvironmentTaskContext, EnvironmentTaskHandler, HelperFunction, SetupHook, TeardownHook, FileSystem, HttpClient, TemplateEngine, OSInfo, Process, Package, Service, Network, Crypto, Time, JSON, YAML, Environment, EnvironmentProvider

### 2. DSL (Domain Specific Language)
- **Task DSL**: `task()`, `log()`, `noop()`, `fail()`, `wait()`, `shell()`, `group()`, `script()`, `parallel()`, `sequence()`, `TaskBuilder`
- **Recipe DSL**: `recipe()`, `Recipe`, `phaseRecipe()`, `simpleRecipe()`, `moduleRecipe()`, `RecipeBuilder`

### 3. Engine
- **Executor**: `RecipeExecutor`, `executeRecipe()`, `ExecutorOptions`, `ExecutionResult`
- **Scheduler**: `TaskScheduler`, `createScheduler()`, `ScheduledTask`, `ExecutionPhase`, `SchedulerOptions`
- **Phase Builder**: `PhaseBuilder`, `buildPhases()`, `optimizePhases()`, `PhaseDefinition`, `PhaseExecutionPlan`

### 4. Module System
- **Core Components**:
  - `ModuleLoader`: Load and manage modules
  - `ModuleRegistry`: Register and track modules
  - `TaskRegistry`: Register and manage tasks
  - `HelperRegistry`: Register and manage helpers
  - `PatternRegistry`: Register and manage patterns
  - `IntegrationRegistry`: Register and manage integrations
  - `EnvironmentManager`: Manage execution environments
  - `TaskRunner`: Execute tasks in different environments
- **Built-in Modules**:
  - AWS Module
  - Kubernetes Module
  - Docker Module
  - Monitoring Module

### 5. Standard Library
- **File System** (`fs`): read, write, append, exists, rm, mkdir, ls, copy, move, chmod, chown, stat, isFile, isDir, temp, join, resolve, dirname, basename, extname
- **HTTP Client** (`http`): get, post, put, delete, request, download, upload
- **OS Info** (`os`): platform, arch, hostname, release, cpus, memory, disk, user, home, uptime, loadavg, networkInterfaces
- **Process** (`proc`): exec, spawn, list, kill, exists, wait, signal, getPidByPort, tree, cwd, exit
- **Package Manager** (`pkg`): install, remove, update, upgrade, installed, version, search, manager
- **Service Manager** (`svc`): start, stop, restart, reload, status, enable, disable, list, exists, isActive, isEnabled, logs
- **Network** (`net`): ping, traceroute, isPortOpen, waitForPort, resolve, reverse, interfaces, publicIP, privateIP
- **Crypto** (`crypto`): hash, md5, sha256, sha512, randomBytes, uuid, base64Encode, base64Decode
- **Time** (`time`): now, timestamp, format, parse, add, subtract, diff, sleep, timeout
- **JSON** (`json`): parse, stringify, read, write, merge, get, set
- **YAML** (`yaml`): parse, stringify, read, write, parseAll, stringifyAll
- **Environment** (`env`): get, set, all, load, expand, require
- **Template Engine** (`template`): render, renderFile

### 6. Security
- **Secrets Management**: `SecretManager`, `getSecretManager()`, secrets storage, encryption
- **Encryption**: `EncryptionService`, `encryption`, encrypt/decrypt data, generate passwords/tokens
- **Audit Logging**: `AuditLogger`, `getAuditLogger()`, `AuditEventType`, log security events
- **Security Scanner**: `SecurityScanner`, `getSecurityScanner()`, scan for vulnerabilities
- **Certificate Management**: `CertificateManager`, `getCertificateManager()`, manage SSL/TLS certificates
- **Access Control**: `AccessControlManager`, `getAccessControlManager()`, manage permissions
- **Security Tasks**: setSecret, getSecret, deleteSecret, listSecrets, encrypt, decrypt, generatePassword, generateToken, verifyAuditLog, exportAuditLog

### 7. Monitoring
- **Progress Tracking**: `ProgressTracker`, `getProgressTracker()`, track task progress
- **Real-Time Monitoring**: `RealTimeMonitor`, `getRealTimeMonitor()`, monitor execution in real-time
- **Alerts**: `AlertManager`, `getAlertManager()`, `createCustomAlert()`, `createThresholdAlert()`, manage alerts
- **Dashboard**: `DashboardManager`, `getDashboardManager()`, `createChartWidget()`, `createMetricWidget()`, visualize metrics
- **Metrics**: `MetricCollector`, `getMetricCollector()`, `SystemMetricsCollector`, collect and aggregate metrics

### 8. State Management
- **Core Components**:
  - `StateManager`: Manage application state
  - `StateStore`: Store and retrieve state
  - `EventStore`: Event sourcing store
  - `OptimizedEventStore`: Optimized event store with snapshots
  - `Ledger`: Immutable audit log
  - `LockManager`: Distributed locking
  - `DistributedLockManager`: Multi-node locking
- **Storage Adapters**:
  - `FileStorageAdapter`: File-based storage
  - `MemoryStorageAdapter`: In-memory storage
  - `RedisAdapter`: Redis-based storage
  - `FileSnapshotStore`: File-based snapshots

### 9. Resource Management
- **Quota Management**: `QuotaManager`, `getQuotaManager()`, manage resource quotas
- **Resource Manager**: `ResourceManager`, `getResourceManager()`, allocate and track resources

### 10. Integration Framework
- **External APIs**: `ExternalAPIClient`, `createAPIClient()`, `createCommonAPIClient()`, make API calls
- **Webhooks**: `WebhookProcessor`, `getWebhookProcessor()`, `createIncomingWebhook()`, `createOutgoingWebhook()`, handle webhooks
- **Message Queues**: `MessageQueueAdapter`, `createMessageQueueAdapter()`, `QueueManager`, support for SQS, RabbitMQ, Kafka
- **Databases**: `DatabaseConnector`, `createDatabaseConnector()`, `ConnectionPoolManager`, support for PostgreSQL, MySQL, MongoDB, Redis
- **Integration Tasks**: callAPI, queryDatabase, sendMessage, sendWebhook, registerWebhook
- **Integration Patterns**: createPoller, createCircuitBreaker, createRetryHandler

### 11. Integrations (Adapters)
- **AWS Adapter**: AWS service integration
- **Docker Adapter**: Docker container management
- **Kubernetes Adapter**: Kubernetes cluster management
- **Terraform Adapter**: Terraform infrastructure management
- **Ush Adapter**: Universal shell execution

### 12. Script System
- **Script Runtime**: `ScriptRunner`, execute Xec scripts
- **Script Context**: `createScriptContext()`, script execution environment
- **Script Builder**: `defineScript()`, create script definitions
- **Script Utilities**: File system, network, process, logging, colors, templates, shell, retry, temp files
- **Script Exports**: tasks, recipes, commands, hooks

### 13. Patterns
- **Deployment Patterns**: 
  - Blue-Green Deployment
  - Canary Deployment
  - Rolling Update
  - A/B Testing
- **Resilience Patterns**:
  - Circuit Breaker
  - Retry with Backoff
  - Bulkhead
  - Timeout
  - Fallback
- **Workflow Patterns**: Complex workflow orchestration

### 14. Context Management
- **Context Builder**: `ContextBuilder`, `createExecutionContext()`, `createTaskContext()`
- **Context Provider**: `ContextProvider`, `contextProvider`, manage execution context
- **Global Context Functions**: env, info, warn, skip, when, debug, error, retry, getVar, setVar, secret, unless, getVars, getHost, getTags, isDryRun, getRunId, getPhase, getState, setState, hasState, getHosts, template, getTaskId, getHelper, getAttempt, clearState, getRecipeId, deleteState, matchesHost, matchesTags, registerHelper

### 15. Validation
- **Validator**: `Validator`, validate recipes, tasks, modules, patterns

### 16. Utilities
- **Logger**: `Logger`, `createLogger()`, `createModuleLogger()`, structured logging
- **Platform Conversion**: `toPlatform()`, `toArchitecture()`, convert platform/arch values

## CLI Command Coverage

### ✅ Fully Covered Capabilities

1. **xec run** - Recipe execution
   - Maps to: `executeRecipe()`, `RecipeExecutor`
   - Coverage: Full recipe execution with options

2. **xec task** - Task management
   - Maps to: `TaskRegistry`, task DSL
   - Coverage: List, show, and test tasks

3. **xec module** - Module management
   - Maps to: `ModuleLoader`, `ModuleRegistry`
   - Coverage: List, info, load, create modules

4. **xec secrets** - Secrets management
   - Maps to: `SecretManager`, security tasks
   - Coverage: Set, get, delete, list secrets

5. **xec audit** - Audit logging
   - Maps to: `AuditLogger`, audit events
   - Coverage: Show logs, search, export, verify

6. **xec state** - State management
   - Maps to: `StateManager`, `StateStore`
   - Coverage: Show, clear, export, import state

7. **xec script** - Script execution
   - Maps to: `ScriptRunner`, script system
   - Coverage: Run, test, compile scripts

8. **xec validate** - Validation
   - Maps to: `Validator`
   - Coverage: Validate recipes and modules

### ⚠️ Partially Covered Capabilities

1. **xec monitor** - Monitoring (NEW)
   - Maps to: Progress tracking, real-time monitoring, metrics
   - Current: Basic implementation
   - Missing: Dashboard visualization, alert management

2. **xec integration** - Integration management (NEW)
   - Maps to: Integration framework
   - Current: Basic listing
   - Missing: API client creation, webhook management, queue configuration

3. **xec deploy** - Deployment patterns
   - Maps to: Deployment patterns
   - Current: Basic blue-green
   - Missing: Canary, rolling update, A/B testing

4. **xec security** - Security operations (NEW)
   - Maps to: Security scanner, certificates, access control
   - Current: Basic implementation
   - Missing: Certificate management, access control

5. **xec resources** - Resource management (NEW)
   - Maps to: `ResourceManager`, `QuotaManager`
   - Current: Basic implementation
   - Missing: Quota enforcement, resource allocation

### ❌ Missing CLI Commands

1. **Pattern Management**
   - Core capability: `PatternRegistry`, pattern types
   - Suggested command: `xec pattern`
   - Actions: list, show, test, create

2. **Helper Management**
   - Core capability: `HelperRegistry`, helper functions
   - Suggested command: `xec helper`
   - Actions: list, show, test

3. **Dashboard/Visualization**
   - Core capability: `DashboardManager`, metrics visualization
   - Suggested command: `xec dashboard`
   - Actions: show, create, export

4. **Alert Management**
   - Core capability: `AlertManager`, alert rules
   - Suggested command: `xec alert`
   - Actions: list, create, delete, test

5. **Lock Management**
   - Core capability: `LockManager`, distributed locks
   - Suggested command: `xec lock`
   - Actions: list, acquire, release, status

6. **Event Store Management**
   - Core capability: `EventStore`, event sourcing
   - Suggested command: `xec events`
   - Actions: list, search, replay, compact

7. **Standard Library Utilities**
   - Core capability: Full stdlib (fs, http, os, etc.)
   - Suggested command: `xec stdlib` (PARTIAL)
   - Missing: Direct CLI access to stdlib functions

8. **Environment Management**
   - Core capability: `EnvironmentManager`, environment providers
   - Suggested command: `xec env` (NEW BUT BASIC)
   - Missing: Environment provider management

9. **Phase Management**
   - Core capability: `PhaseBuilder`, phase optimization
   - Suggested command: `xec phase`
   - Actions: list, visualize, optimize

10. **Resilience Patterns**
    - Core capability: Circuit breaker, retry, bulkhead
    - Suggested command: `xec resilience`
    - Actions: configure, test, status

## Gap Analysis Summary

### Critical Gaps
1. **Pattern System**: No CLI access to pattern registry or pattern execution
2. **Helper System**: No CLI access to helper registry or testing
3. **Dashboard/Metrics**: Limited visualization capabilities
4. **Alert System**: No alert configuration or management
5. **Event Sourcing**: No access to event store features

### Medium Priority Gaps
1. **Lock Management**: No distributed lock control
2. **Phase Optimization**: No phase visualization or optimization
3. **Resilience Patterns**: No resilience pattern configuration
4. **Environment Providers**: Limited environment management
5. **Integration Patterns**: Limited access to integration patterns

### Low Priority Gaps
1. **Direct Stdlib Access**: Most stdlib functions are available through tasks/scripts
2. **Advanced Security**: Certificate and access control management
3. **Resource Quotas**: Quota configuration and enforcement

## Recommendations

1. **Implement Pattern Command**: Add `xec pattern` to expose the powerful pattern system
2. **Enhance Monitor Command**: Add dashboard and alert subcommands
3. **Complete Integration Command**: Add webhook, API, queue, and database subcommands
4. **Add Helper Command**: Expose helper registry for testing and discovery
5. **Implement Events Command**: Provide access to event sourcing capabilities
6. **Enhance Security Command**: Add certificate and access control subcommands
7. **Add Phase Command**: Visualize and optimize execution phases
8. **Implement Lock Command**: Manage distributed locks
9. **Add Resilience Command**: Configure and test resilience patterns
10. **Enhance Env Command**: Add environment provider management

## Implementation Priority

### Phase 1 (High Impact, Core Features)
1. `xec pattern` - Expose pattern system
2. Enhance `xec monitor` - Add dashboard and alerts
3. Enhance `xec integration` - Complete integration management

### Phase 2 (Medium Impact, Advanced Features)
1. `xec helper` - Helper management
2. `xec events` - Event store access
3. `xec phase` - Phase visualization

### Phase 3 (Low Impact, Specialized Features)
1. `xec lock` - Lock management
2. `xec resilience` - Resilience patterns
3. Enhance `xec security` - Advanced security features