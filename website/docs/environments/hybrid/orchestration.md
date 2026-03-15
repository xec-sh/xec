# Complex Orchestration Patterns

Orchestrate sophisticated workflows combining multiple environments, dependencies, and coordination patterns. This guide demonstrates advanced orchestration techniques for hybrid infrastructure deployments and complex multi-environment operations.

## Overview

Complex orchestration enables:
- Multi-stage deployments across environment types
- Dependency-aware execution workflows
- Resource coordination and sharing
- State management across environments
- Event-driven automation patterns

## Workflow Orchestration Patterns

### Dependency-Aware Orchestration

Execute operations based on complex dependency graphs across environments:

```typescript
import { $ } from '@xec-sh/core';

interface OrchestrationTask {
  id: string;
  name: string;
  environment: {
    type: 'local' | 'ssh' | 'docker' | 'kubernetes';
    config: any;
  };
  dependencies: string[];
  operation: string;
  timeout?: number;
  retries?: number;
  rollback?: string;
  healthCheck?: string;
  artifacts?: {
    input?: string[];
    output?: string[];
  };
}

interface OrchestrationResult {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';
  startTime?: Date;
  endTime?: Date;
  result?: any;
  error?: string;
  artifacts?: Record<string, string>;
}

class WorkflowOrchestrator {
  private tasks = new Map<string, OrchestrationTask>();
  private results = new Map<string, OrchestrationResult>();
  private executionOrder: string[] = [];
  
  constructor(tasks: OrchestrationTask[]) {
    tasks.forEach(task => {
      this.tasks.set(task.id, task);
      this.results.set(task.id, {
        taskId: task.id,
        status: 'pending'
      });
    });
    
    this.executionOrder = this.calculateExecutionOrder();
  }
  
  async execute(): Promise<Map<string, OrchestrationResult>> {
    console.log('Starting workflow execution...');
    console.log('Execution order:', this.executionOrder);
    
    for (const taskId of this.executionOrder) {
      const task = this.tasks.get(taskId)!;
      
      try {
        // Wait for dependencies
        await this.waitForDependencies(task.dependencies);
        
        // Execute task
        await this.executeTask(task);
        
      } catch (error) {
        console.error(`Task ${taskId} failed: ${error.message}`);
        
        // Mark as failed
        this.updateResult(taskId, {
          status: 'failed',
          error: error.message,
          endTime: new Date()
        });
        
        // Execute rollback if needed
        if (task.rollback) {
          await this.rollbackTask(task);
        }
        
        // Stop execution on critical failure
        throw new Error(`Workflow failed at task: ${taskId}`);
      }
    }
    
    console.log('Workflow execution completed successfully');
    return this.results;
  }
  
  private calculateExecutionOrder(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];
    
    const visit = (taskId: string) => {
      if (visiting.has(taskId)) {
        throw new Error(`Circular dependency detected involving task: ${taskId}`);
      }
      
      if (visited.has(taskId)) {
        return;
      }
      
      visiting.add(taskId);
      
      const task = this.tasks.get(taskId);
      if (task) {
        task.dependencies.forEach(depId => {
          if (!this.tasks.has(depId)) {
            throw new Error(`Dependency not found: ${depId} for task ${taskId}`);
          }
          visit(depId);
        });
      }
      
      visiting.delete(taskId);
      visited.add(taskId);
      order.push(taskId);
    };
    
    Array.from(this.tasks.keys()).forEach(visit);
    return order;
  }
  
  private async waitForDependencies(dependencies: string[]): Promise<void> {
    while (true) {
      const pendingDeps = dependencies.filter(depId => {
        const result = this.results.get(depId);
        return result?.status !== 'completed';
      });
      
      if (pendingDeps.length === 0) {
        break;
      }
      
      // Check for failed dependencies
      const failedDeps = dependencies.filter(depId => {
        const result = this.results.get(depId);
        return result?.status === 'failed';
      });
      
      if (failedDeps.length > 0) {
        throw new Error(`Dependencies failed: ${failedDeps.join(', ')}`);
      }
      
      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  private async executeTask(task: OrchestrationTask): Promise<void> {
    console.log(`Executing task: ${task.name}`);
    
    this.updateResult(task.id, {
      status: 'running',
      startTime: new Date()
    });
    
    // Create executor for the environment
    const executor = this.createExecutor(task.environment);
    
    // Handle input artifacts
    if (task.artifacts?.input) {
      await this.prepareInputArtifacts(task, executor);
    }
    
    // Execute with retry logic
    let lastError;
    const maxRetries = task.retries || 1;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeWithTimeout(
          executor,
          task.operation,
          task.timeout || 300000 // 5 minutes default
        );
        
        // Handle output artifacts
        const artifacts = task.artifacts?.output 
          ? await this.collectOutputArtifacts(task, executor)
          : {};
        
        // Health check if specified
        if (task.healthCheck) {
          await executor`${task.healthCheck}`;
        }
        
        this.updateResult(task.id, {
          status: 'completed',
          endTime: new Date(),
          result: result.stdout,
          artifacts
        });
        
        console.log(`✅ Task completed: ${task.name}`);
        return;
        
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          console.log(`Retrying task ${task.name} (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      }
    }
    
    throw lastError;
  }
  
  private createExecutor(environment: OrchestrationTask['environment']) {
    switch (environment.type) {
      case 'local':
        return $;
      case 'ssh':
        return $.ssh(environment.config);
      case 'docker':
        return $.docker(environment.config);
      case 'kubernetes':
        return $.k8s(environment.config);
      default:
        throw new Error(`Unknown environment type: ${environment.type}`);
    }
  }
  
  private async executeWithTimeout(
    executor: any,
    operation: string,
    timeout: number
  ): Promise<any> {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Task timeout')), timeout);
    });
    
    const operationPromise = executor`${operation}`;
    
    return Promise.race([operationPromise, timeoutPromise]);
  }
  
  private async prepareInputArtifacts(task: OrchestrationTask, executor: any): Promise<void> {
    if (!task.artifacts?.input) return;
    
    for (const artifactPattern of task.artifacts.input) {
      // Find artifacts from completed dependencies
      for (const depId of task.dependencies) {
        const depResult = this.results.get(depId);
        if (depResult?.artifacts) {
          const matchingArtifacts = Object.entries(depResult.artifacts)
            .filter(([key]) => key.match(artifactPattern));
          
          for (const [key, path] of matchingArtifacts) {
            // Transfer artifact to current environment
            await this.transferArtifact(depId, task.id, key, path);
          }
        }
      }
    }
  }
  
  private async collectOutputArtifacts(
    task: OrchestrationTask,
    executor: any
  ): Promise<Record<string, string>> {
    const artifacts: Record<string, string> = {};
    
    if (!task.artifacts?.output) return artifacts;
    
    for (const outputPattern of task.artifacts.output) {
      try {
        const files = await executor`find . -name "${outputPattern}" -type f`;
        const fileList = files.stdout.trim().split('\n').filter(Boolean);
        
        fileList.forEach((file, index) => {
          artifacts[`${outputPattern}_${index}`] = file;
        });
      } catch (error) {
        console.warn(`Failed to collect artifacts for pattern ${outputPattern}: ${error.message}`);
      }
    }
    
    return artifacts;
  }
  
  private async transferArtifact(
    fromTaskId: string,
    toTaskId: string,
    artifactKey: string,
    artifactPath: string
  ): Promise<void> {
    const fromTask = this.tasks.get(fromTaskId)!;
    const toTask = this.tasks.get(toTaskId)!;
    
    // Implementation depends on environment types
    // This is a simplified version
    console.log(`Transferring artifact ${artifactKey} from ${fromTaskId} to ${toTaskId}`);
    
    // For cross-environment transfers, you might need to:
    // 1. Download from source environment to local temp
    // 2. Upload from local temp to target environment
    // 3. Handle different transfer protocols (scp, kubectl cp, docker cp)
  }
  
  private async rollbackTask(task: OrchestrationTask): Promise<void> {
    if (!task.rollback) return;
    
    console.log(`Rolling back task: ${task.name}`);
    
    try {
      const executor = this.createExecutor(task.environment);
      await executor`${task.rollback}`;
      
      this.updateResult(task.id, {
        status: 'rolled_back'
      });
      
      console.log(`✅ Rollback completed for: ${task.name}`);
    } catch (error) {
      console.error(`❌ Rollback failed for ${task.name}: ${error.message}`);
    }
  }
  
  private updateResult(taskId: string, updates: Partial<OrchestrationResult>): void {
    const current = this.results.get(taskId)!;
    this.results.set(taskId, { ...current, ...updates });
  }
}

// Example: Multi-environment deployment orchestration
const deploymentTasks: OrchestrationTask[] = [
  {
    id: 'build-local',
    name: 'Build Application Locally',
    environment: { type: 'local', config: {} },
    dependencies: [],
    operation: 'npm ci && npm run build && npm run test',
    artifacts: { output: ['dist/*', 'package.json'] }
  },
  {
    id: 'build-docker',
    name: 'Build Docker Image',
    environment: { type: 'local', config: {} },
    dependencies: ['build-local'],
    operation: 'docker build -t myapp:latest .',
    artifacts: { input: ['dist/*'], output: ['Dockerfile'] }
  },
  {
    id: 'deploy-staging',
    name: 'Deploy to Staging',
    environment: {
      type: 'ssh',
      config: { host: 'staging.example.com', username: 'deploy' }
    },
    dependencies: ['build-local'],
    operation: 'cd /apps/myapp && git pull && npm ci --production && pm2 restart myapp',
    healthCheck: 'curl -f http://localhost:3000/health',
    rollback: 'pm2 restart myapp-previous'
  },
  {
    id: 'integration-tests',
    name: 'Run Integration Tests',
    environment: { type: 'local', config: {} },
    dependencies: ['deploy-staging'],
    operation: 'npm run test:integration -- --host staging.example.com'
  },
  {
    id: 'deploy-k8s',
    name: 'Deploy to Kubernetes',
    environment: {
      type: 'kubernetes',
      config: { namespace: 'production' }
    },
    dependencies: ['build-docker', 'integration-tests'],
    operation: 'kubectl set image deployment/myapp myapp=myapp:latest && kubectl rollout status deployment/myapp',
    healthCheck: 'kubectl get pods -l app=myapp --field-selector=status.phase=Running',
    rollback: 'kubectl rollout undo deployment/myapp'
  }
];

const orchestrator = new WorkflowOrchestrator(deploymentTasks);
const results = await orchestrator.execute();
```

### Event-Driven Orchestration

Implement reactive orchestration based on events across environments:

```typescript
interface OrchestrationEvent {
  id: string;
  type: string;
  source: string;
  data: any;
  timestamp: Date;
}

interface EventTrigger {
  eventType: string;
  condition?: (event: OrchestrationEvent) => boolean;
  tasks: string[];
}

class EventDrivenOrchestrator {
  private eventQueue: OrchestrationEvent[] = [];
  private triggers = new Map<string, EventTrigger[]>();
  private taskDefinitions = new Map<string, OrchestrationTask>();
  private activeWorkflows = new Map<string, WorkflowOrchestrator>();
  
  constructor(tasks: OrchestrationTask[], triggers: EventTrigger[]) {
    tasks.forEach(task => this.taskDefinitions.set(task.id, task));
    
    triggers.forEach(trigger => {
      const existing = this.triggers.get(trigger.eventType) || [];
      existing.push(trigger);
      this.triggers.set(trigger.eventType, existing);
    });
    
    this.startEventProcessing();
  }
  
  async emitEvent(event: Omit<OrchestrationEvent, 'timestamp'>): Promise<void> {
    const fullEvent: OrchestrationEvent = {
      ...event,
      timestamp: new Date()
    };
    
    console.log(`Event emitted: ${event.type} from ${event.source}`);
    this.eventQueue.push(fullEvent);
  }
  
  private async startEventProcessing(): Promise<void> {
    while (true) {
      if (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift()!;
        await this.processEvent(event);
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  private async processEvent(event: OrchestrationEvent): Promise<void> {
    const triggers = this.triggers.get(event.type) || [];
    
    for (const trigger of triggers) {
      // Check condition if specified
      if (trigger.condition && !trigger.condition(event)) {
        continue;
      }
      
      console.log(`Triggering tasks for event ${event.type}: ${trigger.tasks.join(', ')}`);
      
      // Create workflow for triggered tasks
      const tasks = trigger.tasks
        .map(taskId => this.taskDefinitions.get(taskId))
        .filter(Boolean) as OrchestrationTask[];
      
      if (tasks.length > 0) {
        const workflowId = `${event.type}-${Date.now()}`;
        const workflow = new WorkflowOrchestrator(tasks);
        
        this.activeWorkflows.set(workflowId, workflow);
        
        // Execute workflow asynchronously
        workflow.execute()
          .then(results => {
            console.log(`Workflow ${workflowId} completed successfully`);
            this.activeWorkflows.delete(workflowId);
            
            // Emit completion event
            this.emitEvent({
              id: `workflow-complete-${workflowId}`,
              type: 'workflow.completed',
              source: 'orchestrator',
              data: { workflowId, results: Array.from(results.values()) }
            });
          })
          .catch(error => {
            console.error(`Workflow ${workflowId} failed: ${error.message}`);
            this.activeWorkflows.delete(workflowId);
            
            // Emit failure event
            this.emitEvent({
              id: `workflow-failed-${workflowId}`,
              type: 'workflow.failed',
              source: 'orchestrator',
              data: { workflowId, error: error.message }
            });
          });
      }
    }
  }
  
  getActiveWorkflows(): string[] {
    return Array.from(this.activeWorkflows.keys());
  }
}

// Example: CI/CD event-driven orchestration
const eventTasks: OrchestrationTask[] = [
  {
    id: 'code-analysis',
    name: 'Static Code Analysis',
    environment: { type: 'local', config: {} },
    dependencies: [],
    operation: 'npm run lint && npm run audit'
  },
  {
    id: 'unit-tests',
    name: 'Unit Tests',
    environment: { type: 'docker', config: { image: 'node:18-alpine' } },
    dependencies: [],
    operation: 'npm test'
  },
  {
    id: 'build-artifact',
    name: 'Build Release Artifact',
    environment: { type: 'local', config: {} },
    dependencies: [],
    operation: 'npm run build:production'
  },
  {
    id: 'deploy-staging',
    name: 'Deploy to Staging',
    environment: { type: 'ssh', config: { host: 'staging.example.com' } },
    dependencies: [],
    operation: 'deploy.sh staging'
  },
  {
    id: 'deploy-production',
    name: 'Deploy to Production',
    environment: { type: 'kubernetes', config: { namespace: 'production' } },
    dependencies: [],
    operation: 'kubectl apply -f production.yaml'
  }
];

const eventTriggers: EventTrigger[] = [
  {
    eventType: 'git.push',
    condition: (event) => event.data.branch === 'main',
    tasks: ['code-analysis', 'unit-tests']
  },
  {
    eventType: 'workflow.completed',
    condition: (event) => {
      const completedTasks = event.data.results
        ?.filter((r: any) => r.status === 'completed')
        ?.map((r: any) => r.taskId) || [];
      return completedTasks.includes('code-analysis') && completedTasks.includes('unit-tests');
    },
    tasks: ['build-artifact']
  },
  {
    eventType: 'workflow.completed',
    condition: (event) => {
      const completedTasks = event.data.results
        ?.filter((r: any) => r.status === 'completed')
        ?.map((r: any) => r.taskId) || [];
      return completedTasks.includes('build-artifact');
    },
    tasks: ['deploy-staging']
  },
  {
    eventType: 'approval.granted',
    condition: (event) => event.data.environment === 'production',
    tasks: ['deploy-production']
  }
];

const eventOrchestrator = new EventDrivenOrchestrator(eventTasks, eventTriggers);

// Simulate CI/CD pipeline events
await eventOrchestrator.emitEvent({
  id: 'git-push-1',
  type: 'git.push',
  source: 'github',
  data: { branch: 'main', commit: 'abc123', author: 'developer' }
});

// Later, simulate approval
setTimeout(async () => {
  await eventOrchestrator.emitEvent({
    id: 'prod-approval-1',
    type: 'approval.granted',
    source: 'approval-system',
    data: { environment: 'production', approver: 'manager' }
  });
}, 30000);
```

## Advanced Coordination Patterns

### Resource Pool Management

Coordinate shared resources across environments:

```typescript
interface Resource {
  id: string;
  type: 'database' | 'storage' | 'compute' | 'network';
  environment: string;
  capacity: number;
  allocated: number;
  metadata: Record<string, any>;
}

interface ResourceRequest {
  taskId: string;
  resourceType: 'database' | 'storage' | 'compute' | 'network';
  amount: number;
  duration?: number;
  preferences?: {
    environment?: string;
    location?: string;
  };
}

class ResourcePoolManager {
  private resources = new Map<string, Resource>();
  private allocations = new Map<string, { resourceId: string; amount: number; taskId: string; expiresAt?: Date }>();
  private pendingRequests: ResourceRequest[] = [];
  
  constructor(resources: Resource[]) {
    resources.forEach(resource => {
      this.resources.set(resource.id, resource);
    });
    
    // Start background resource cleanup
    this.startResourceCleanup();
  }
  
  async requestResource(request: ResourceRequest): Promise<string | null> {
    console.log(`Resource request: ${request.amount} ${request.resourceType} for task ${request.taskId}`);
    
    // Find suitable resource
    const suitableResources = Array.from(this.resources.values())
      .filter(resource => {
        if (resource.type !== request.resourceType) return false;
        if (resource.allocated + request.amount > resource.capacity) return false;
        
        // Check preferences
        if (request.preferences?.environment && 
            resource.environment !== request.preferences.environment) {
          return false;
        }
        
        return true;
      })
      .sort((a, b) => {
        // Prefer resources with more available capacity
        const aAvailable = a.capacity - a.allocated;
        const bAvailable = b.capacity - b.allocated;
        return bAvailable - aAvailable;
      });
    
    if (suitableResources.length === 0) {
      console.log(`No suitable resources available for task ${request.taskId}`);
      this.pendingRequests.push(request);
      return null;
    }
    
    // Allocate resource
    const resource = suitableResources[0];
    const allocationId = `${request.taskId}-${resource.id}-${Date.now()}`;
    
    resource.allocated += request.amount;
    
    const allocation = {
      resourceId: resource.id,
      amount: request.amount,
      taskId: request.taskId,
      expiresAt: request.duration ? new Date(Date.now() + request.duration) : undefined
    };
    
    this.allocations.set(allocationId, allocation);
    
    console.log(`Allocated ${request.amount} ${request.resourceType} from ${resource.id} to task ${request.taskId}`);
    
    return allocationId;
  }
  
  async releaseResource(allocationId: string): Promise<void> {
    const allocation = this.allocations.get(allocationId);
    if (!allocation) {
      console.warn(`Allocation not found: ${allocationId}`);
      return;
    }
    
    const resource = this.resources.get(allocation.resourceId);
    if (resource) {
      resource.allocated -= allocation.amount;
      console.log(`Released ${allocation.amount} ${resource.type} from ${resource.id}`);
    }
    
    this.allocations.delete(allocationId);
    
    // Process pending requests
    await this.processPendingRequests();
  }
  
  private async processPendingRequests(): Promise<void> {
    const stillPending: ResourceRequest[] = [];
    
    for (const request of this.pendingRequests) {
      const allocationId = await this.requestResource(request);
      if (!allocationId) {
        stillPending.push(request);
      }
    }
    
    this.pendingRequests = stillPending;
  }
  
  private startResourceCleanup(): void {
    setInterval(() => {
      const now = new Date();
      const expiredAllocations: string[] = [];
      
      this.allocations.forEach((allocation, allocationId) => {
        if (allocation.expiresAt && allocation.expiresAt <= now) {
          expiredAllocations.push(allocationId);
        }
      });
      
      expiredAllocations.forEach(allocationId => {
        console.log(`Auto-releasing expired allocation: ${allocationId}`);
        this.releaseResource(allocationId);
      });
    }, 60000); // Check every minute
  }
  
  getResourceStatus(): Array<Resource & { availableCapacity: number }> {
    return Array.from(this.resources.values()).map(resource => ({
      ...resource,
      availableCapacity: resource.capacity - resource.allocated
    }));
  }
  
  getPendingRequestsCount(): number {
    return this.pendingRequests.length;
  }
}

// Example: Database connection pool across environments
const resourcePool = new ResourcePoolManager([
  {
    id: 'local-db',
    type: 'database',
    environment: 'local',
    capacity: 10,
    allocated: 0,
    metadata: { host: 'localhost', port: 5432 }
  },
  {
    id: 'staging-db',
    type: 'database',
    environment: 'staging',
    capacity: 20,
    allocated: 0,
    metadata: { host: 'staging-db.example.com', port: 5432 }
  },
  {
    id: 'prod-db-pool',
    type: 'database',
    environment: 'production',
    capacity: 100,
    allocated: 0,
    metadata: { host: 'prod-db.example.com', port: 5432 }
  }
]);

// Enhanced orchestration task with resource management
class ResourceAwareOrchestrator extends WorkflowOrchestrator {
  constructor(
    tasks: OrchestrationTask[],
    private resourceManager: ResourcePoolManager
  ) {
    super(tasks);
  }
  
  async executeTaskWithResources(task: OrchestrationTask & { resources?: ResourceRequest[] }): Promise<void> {
    const allocations: string[] = [];
    
    try {
      // Request resources
      if (task.resources) {
        for (const resourceReq of task.resources) {
          const allocationId = await this.resourceManager.requestResource({
            ...resourceReq,
            taskId: task.id
          });
          
          if (!allocationId) {
            throw new Error(`Failed to allocate ${resourceReq.resourceType} for task ${task.id}`);
          }
          
          allocations.push(allocationId);
        }
      }
      
      // Execute task (parent implementation)
      // await super.executeTask(task);
      
    } finally {
      // Release all allocated resources
      for (const allocationId of allocations) {
        await this.resourceManager.releaseResource(allocationId);
      }
    }
  }
}
```

### State Synchronization Across Environments

Maintain consistent state across different environment types:

```typescript
interface StateEntry {
  key: string;
  value: any;
  version: number;
  timestamp: Date;
  environment: string;
  metadata?: Record<string, any>;
}

interface StateSyncConfig {
  syncInterval: number;
  conflictResolution: 'latest-wins' | 'manual' | 'environment-priority';
  environmentPriority?: string[];
}

class CrossEnvironmentStateManager {
  private localState = new Map<string, StateEntry>();
  private syncTargets: Array<{
    name: string;
    executor: any;
    getState: string;
    setState: string;
  }> = [];
  
  constructor(
    private environments: EnvironmentTarget[],
    private config: StateSyncConfig
  ) {
    this.initializeSyncTargets();
    this.startPeriodicSync();
  }
  
  private initializeSyncTargets(): void {
    this.environments.forEach(env => {
      const executor = this.createExecutor(env);
      
      this.syncTargets.push({
        name: env.name,
        executor,
        getState: this.getStateCommand(env.type),
        setState: this.setStateCommand(env.type)
      });
    });
  }
  
  private getStateCommand(envType: string): string {
    switch (envType) {
      case 'local':
        return 'cat ./.state.json || echo "{}"';
      case 'ssh':
        return 'cat ~/.app-state.json || echo "{}"';
      case 'docker':
        return 'cat /app/state.json || echo "{}"';
      case 'kubernetes':
        return 'kubectl get configmap app-state -o jsonpath="{.data.state}" || echo "{}"';
      default:
        return 'echo "{}"';
    }
  }
  
  private setStateCommand(envType: string): string {
    switch (envType) {
      case 'local':
        return 'echo "$STATE_JSON" > ./.state.json';
      case 'ssh':
        return 'echo "$STATE_JSON" > ~/.app-state.json';
      case 'docker':
        return 'echo "$STATE_JSON" > /app/state.json';
      case 'kubernetes':
        return 'kubectl create configmap app-state --from-literal=state="$STATE_JSON" --dry-run=client -o yaml | kubectl apply -f -';
      default:
        return 'echo "State sync not supported for this environment"';
    }
  }
  
  async setState(key: string, value: any, environment?: string): Promise<void> {
    const entry: StateEntry = {
      key,
      value,
      version: (this.localState.get(key)?.version || 0) + 1,
      timestamp: new Date(),
      environment: environment || 'local'
    };
    
    this.localState.set(key, entry);
    
    // Sync to specific environment or all environments
    if (environment) {
      const target = this.syncTargets.find(t => t.name === environment);
      if (target) {
        await this.syncToTarget(target);
      }
    } else {
      await this.syncToAllTargets();
    }
  }
  
  getState(key: string): any {
    return this.localState.get(key)?.value;
  }
  
  async syncState(): Promise<void> {
    console.log('Starting cross-environment state synchronization...');
    
    // Collect state from all environments
    const allStates = new Map<string, StateEntry[]>();
    
    for (const target of this.syncTargets) {
      try {
        const stateResult = await target.executor.env({ STATE_JSON: '' })`${target.getState}`;
        const remoteState = JSON.parse(stateResult.stdout.trim() || '{}');
        
        Object.entries(remoteState).forEach(([key, entry]: [string, any]) => {
          if (!allStates.has(key)) {
            allStates.set(key, []);
          }
          allStates.get(key)!.push({
            ...entry,
            environment: target.name
          });
        });
      } catch (error) {
        console.error(`Failed to sync state from ${target.name}: ${error.message}`);
      }
    }
    
    // Resolve conflicts and update local state
    for (const [key, entries] of allStates) {
      const resolvedEntry = this.resolveConflicts(key, entries);
      if (resolvedEntry) {
        this.localState.set(key, resolvedEntry);
      }
    }
    
    // Sync resolved state back to all environments
    await this.syncToAllTargets();
  }
  
  private resolveConflicts(key: string, entries: StateEntry[]): StateEntry | null {
    if (entries.length === 0) return null;
    if (entries.length === 1) return entries[0];
    
    switch (this.config.conflictResolution) {
      case 'latest-wins':
        return entries.reduce((latest, current) => 
          current.timestamp > latest.timestamp ? current : latest
        );
      
      case 'environment-priority':
        if (this.config.environmentPriority) {
          for (const envName of this.config.environmentPriority) {
            const entry = entries.find(e => e.environment === envName);
            if (entry) return entry;
          }
        }
        return entries[0];
      
      case 'manual':
        console.warn(`Manual conflict resolution required for key: ${key}`);
        console.log('Conflicting entries:', entries);
        // In a real implementation, you might queue this for manual resolution
        return entries[0];
      
      default:
        return entries[0];
    }
  }
  
  private async syncToAllTargets(): Promise<void> {
    const syncPromises = this.syncTargets.map(target => this.syncToTarget(target));
    await Promise.allSettled(syncPromises);
  }
  
  private async syncToTarget(target: any): Promise<void> {
    try {
      const stateObject = Object.fromEntries(this.localState);
      const stateJson = JSON.stringify(stateObject, null, 2);
      
      await target.executor.env({ STATE_JSON: stateJson })`${target.setState}`;
      console.log(`State synced to ${target.name}`);
    } catch (error) {
      console.error(`Failed to sync state to ${target.name}: ${error.message}`);
    }
  }
  
  private createExecutor(env: EnvironmentTarget) {
    switch (env.type) {
      case 'local': return $;
      case 'ssh': return $.ssh(env.config);
      case 'docker': return $.docker(env.config);
      case 'kubernetes': return $.k8s(env.config);
      default: throw new Error(`Unknown environment: ${env.type}`);
    }
  }
  
  private startPeriodicSync(): void {
    setInterval(() => {
      this.syncState().catch(console.error);
    }, this.config.syncInterval);
  }
  
  getStateSnapshot(): Record<string, StateEntry> {
    return Object.fromEntries(this.localState);
  }
}

// Example usage
const stateManager = new CrossEnvironmentStateManager(environments, {
  syncInterval: 30000, // 30 seconds
  conflictResolution: 'environment-priority',
  environmentPriority: ['production', 'staging', 'local']
});

// Set some application state
await stateManager.setState('deployment.version', '1.2.3');
await stateManager.setState('feature.flags', { newUI: true, betaAPI: false });
await stateManager.setState('maintenance.mode', false);

// State will be automatically synced across all environments
```

## Monitoring and Observability

### Comprehensive Orchestration Monitoring

Track and monitor complex workflows across environments:

```typescript
interface OrchestrationMetrics {
  workflowId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'running' | 'completed' | 'failed';
  taskMetrics: Map<string, TaskMetrics>;
  resourceUsage: ResourceUsageMetrics;
  environmentHealth: Map<string, boolean>;
}

interface TaskMetrics {
  taskId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: string;
  retryCount: number;
  resourceAllocations: string[];
  environmentType: string;
}

interface ResourceUsageMetrics {
  peakMemory: number;
  totalCpu: number;
  networkIO: number;
  storageIO: number;
}

class OrchestrationMonitor {
  private metrics = new Map<string, OrchestrationMetrics>();
  private alerts: Array<{ level: 'info' | 'warning' | 'error'; message: string; timestamp: Date }> = [];
  
  startWorkflowMonitoring(workflowId: string): void {
    const metrics: OrchestrationMetrics = {
      workflowId,
      startTime: new Date(),
      status: 'running',
      taskMetrics: new Map(),
      resourceUsage: {
        peakMemory: 0,
        totalCpu: 0,
        networkIO: 0,
        storageIO: 0
      },
      environmentHealth: new Map()
    };
    
    this.metrics.set(workflowId, metrics);
  }
  
  recordTaskStart(workflowId: string, taskId: string, environmentType: string): void {
    const metrics = this.metrics.get(workflowId);
    if (metrics) {
      const taskMetrics: TaskMetrics = {
        taskId,
        startTime: new Date(),
        status: 'running',
        retryCount: 0,
        resourceAllocations: [],
        environmentType
      };
      
      metrics.taskMetrics.set(taskId, taskMetrics);
    }
  }
  
  recordTaskCompletion(workflowId: string, taskId: string, status: string): void {
    const metrics = this.metrics.get(workflowId);
    if (metrics) {
      const taskMetrics = metrics.taskMetrics.get(taskId);
      if (taskMetrics) {
        taskMetrics.endTime = new Date();
        taskMetrics.duration = taskMetrics.endTime.getTime() - taskMetrics.startTime.getTime();
        taskMetrics.status = status;
      }
    }
  }
  
  recordWorkflowCompletion(workflowId: string, status: 'completed' | 'failed'): void {
    const metrics = this.metrics.get(workflowId);
    if (metrics) {
      metrics.endTime = new Date();
      metrics.duration = metrics.endTime.getTime() - metrics.startTime.getTime();
      metrics.status = status;
      
      // Generate completion report
      this.generateCompletionReport(metrics);
    }
  }
  
  addAlert(level: 'info' | 'warning' | 'error', message: string): void {
    this.alerts.push({
      level,
      message,
      timestamp: new Date()
    });
    
    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }
    
    console.log(`[${level.toUpperCase()}] ${message}`);
  }
  
  private generateCompletionReport(metrics: OrchestrationMetrics): void {
    console.log('\n=== Orchestration Completion Report ===');
    console.log(`Workflow ID: ${metrics.workflowId}`);
    console.log(`Status: ${metrics.status}`);
    console.log(`Duration: ${metrics.duration}ms`);
    console.log(`Tasks: ${metrics.taskMetrics.size}`);
    
    // Task breakdown
    const tasksByStatus = new Map<string, number>();
    const tasksByEnvironment = new Map<string, number>();
    
    metrics.taskMetrics.forEach(task => {
      tasksByStatus.set(task.status, (tasksByStatus.get(task.status) || 0) + 1);
      tasksByEnvironment.set(task.environmentType, (tasksByEnvironment.get(task.environmentType) || 0) + 1);
    });
    
    console.log('\nTask Status Breakdown:');
    tasksByStatus.forEach((count, status) => {
      console.log(`  ${status}: ${count}`);
    });
    
    console.log('\nEnvironment Usage:');
    tasksByEnvironment.forEach((count, env) => {
      console.log(`  ${env}: ${count} tasks`);
    });
    
    // Performance insights
    const taskDurations = Array.from(metrics.taskMetrics.values())
      .filter(task => task.duration)
      .map(task => task.duration!);
    
    if (taskDurations.length > 0) {
      const avgDuration = taskDurations.reduce((a, b) => a + b, 0) / taskDurations.length;
      const maxDuration = Math.max(...taskDurations);
      
      console.log('\nPerformance:');
      console.log(`  Average task duration: ${avgDuration.toFixed(2)}ms`);
      console.log(`  Longest task duration: ${maxDuration}ms`);
    }
    
    console.log('=====================================\n');
  }
  
  getMetrics(workflowId: string): OrchestrationMetrics | undefined {
    return this.metrics.get(workflowId);
  }
  
  getAllMetrics(): Map<string, OrchestrationMetrics> {
    return new Map(this.metrics);
  }
  
  getRecentAlerts(count: number = 10): Array<{ level: string; message: string; timestamp: Date }> {
    return this.alerts.slice(-count);
  }
}

// Enhanced orchestrator with monitoring
class MonitoredOrchestrator extends WorkflowOrchestrator {
  constructor(
    tasks: OrchestrationTask[],
    private monitor: OrchestrationMonitor,
    private workflowId: string = `workflow-${Date.now()}`
  ) {
    super(tasks);
    this.monitor.startWorkflowMonitoring(this.workflowId);
  }
  
  async execute(): Promise<Map<string, OrchestrationResult>> {
    try {
      this.monitor.addAlert('info', `Starting workflow: ${this.workflowId}`);
      
      // Call parent execute with monitoring
      const results = await super.execute();
      
      this.monitor.recordWorkflowCompletion(this.workflowId, 'completed');
      this.monitor.addAlert('info', `Workflow completed: ${this.workflowId}`);
      
      return results;
    } catch (error) {
      this.monitor.recordWorkflowCompletion(this.workflowId, 'failed');
      this.monitor.addAlert('error', `Workflow failed: ${this.workflowId} - ${error.message}`);
      throw error;
    }
  }
  
  // Override executeTask to add monitoring
  protected async executeTask(task: OrchestrationTask): Promise<void> {
    this.monitor.recordTaskStart(this.workflowId, task.id, task.environment.type);
    
    try {
      await super.executeTask(task);
      this.monitor.recordTaskCompletion(this.workflowId, task.id, 'completed');
    } catch (error) {
      this.monitor.recordTaskCompletion(this.workflowId, task.id, 'failed');
      throw error;
    }
  }
}

// Example usage with monitoring
const monitor = new OrchestrationMonitor();
const monitoredOrchestrator = new MonitoredOrchestrator(deploymentTasks, monitor);

try {
  await monitoredOrchestrator.execute();
} catch (error) {
  console.error('Workflow execution failed:', error.message);
}

// View monitoring data
const workflowMetrics = monitor.getAllMetrics();
console.log('Recent alerts:', monitor.getRecentAlerts(5));
```

## Best Practices

### 1. Orchestration Design
- Design workflows with clear dependencies and rollback strategies
- Implement proper timeout and retry mechanisms
- Use event-driven patterns for reactive workflows
- Plan for partial failure scenarios

### 2. Resource Management
- Implement resource pooling and allocation strategies
- Monitor resource usage across environments
- Plan for resource cleanup and leak prevention
- Handle resource contention gracefully

### 3. State Management
- Maintain consistent state across environments
- Implement conflict resolution strategies
- Use versioning for state changes
- Plan for state migration scenarios

### 4. Monitoring and Debugging
- Implement comprehensive logging and metrics
- Track workflow performance and resource usage
- Set up alerting for failures and anomalies
- Maintain audit trails for compliance

### 5. Security and Compliance
- Secure communication between environments
- Implement proper authentication and authorization
- Handle secrets and sensitive data appropriately
- Maintain compliance with regulatory requirements

## Conclusion

Complex orchestration patterns in @xec-sh/core enable sophisticated automation workflows across hybrid infrastructure. By implementing dependency-aware execution, event-driven patterns, resource coordination, and comprehensive monitoring, you can build resilient, scalable orchestration systems that effectively manage multi-environment operations.

The key to successful orchestration is careful planning, robust error handling, and continuous monitoring of workflow performance and resource utilization across all environment types.