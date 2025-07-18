import { task } from '../dsl/task.js';
import { Task, Phase, Recipe } from '../core/types.js';
import { createModuleLogger } from '../utils/logger.js';
import { getState, setState } from '../context/globals.js';

const logger = createModuleLogger('workflow-patterns');

export interface WorkflowOptions {
  name: string;
  description?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface ApprovalWorkflowOptions extends WorkflowOptions {
  approvalGroups: string[];
  minApprovals?: number;
  approvalTimeout?: number;
  notificationChannels?: string[];
}

export interface ConditionalWorkflowOptions extends WorkflowOptions {
  conditions: Array<{
    name: string;
    expression: string | ((context: any) => boolean | Promise<boolean>);
    tasks: Task[];
  }>;
  defaultTasks?: Task[];
}

export interface ParallelWorkflowOptions extends WorkflowOptions {
  branches: Array<{
    name: string;
    tasks: Task[];
  }>;
  waitForAll?: boolean;
  continueOnError?: boolean;
}

export class ApprovalWorkflow {
  constructor(private options: ApprovalWorkflowOptions) {}

  build(): Recipe {
    const tasksMap = new Map<string, Task>();
    const phasesMap = new Map<string, Phase>();

    // Request approval task
    const requestApprovalTask = task('request-approval')
      .description('Request approval from designated groups')
      .handler(async (context) => {
        context.logger.info(`Requesting approval from groups: ${this.options.approvalGroups.join(', ')}`);
        
        // Store approval request in state
        await setState('approval:request', {
          id: context.taskId,
          groups: this.options.approvalGroups,
          minApprovals: this.options.minApprovals || 1,
          requestedAt: new Date().toISOString(),
          status: 'pending'
        });

        // Notify channels if configured
        if (this.options.notificationChannels) {
          context.logger.info(`Notifications sent to: ${this.options.notificationChannels.join(', ')}`);
        }

        return { status: 'requested' };
      })
      .build();
    
    tasksMap.set(requestApprovalTask.name, requestApprovalTask);

    // Wait for approval task
    const waitApprovalTask = task('wait-approval')
      .description('Wait for required approvals')
      .handler(async (context) => {
        const startTime = Date.now();
        const timeout = this.options.approvalTimeout || 3600000; // 1 hour default

        while (Date.now() - startTime < timeout) {
          const approvalRequest = await getState('approval:request');
          
          if (approvalRequest?.status === 'approved') {
            context.logger.info('Approval received, proceeding with workflow');
            return { status: 'approved' };
          }
          
          if (approvalRequest?.status === 'rejected') {
            throw new Error('Approval rejected');
          }

          // Wait 10 seconds before checking again
          await new Promise(resolve => setTimeout(resolve, 10000));
        }

        throw new Error('Approval timeout reached');
      })
      .build();
    
    tasksMap.set(waitApprovalTask.name, waitApprovalTask);

    // Create phases
    phasesMap.set('approval', {
      name: 'approval',
      tasks: [requestApprovalTask.name, waitApprovalTask.name],
      parallel: false
    });

    return {
      id: `approval-workflow-${this.options.name}`,
      name: this.options.name,
      description: this.options.description || 'Approval workflow',
      tasks: tasksMap,
      phases: phasesMap
    };
  }
}

export class ConditionalWorkflow {
  constructor(private options: ConditionalWorkflowOptions) {}

  build(): Recipe {
    const tasksMap = new Map<string, Task>();
    const phasesMap = new Map<string, Phase>();

    // Evaluate conditions task
    const evaluateTask = task('evaluate-conditions')
      .description('Evaluate workflow conditions')
      .handler(async (context) => {
        const results = [];

        for (const condition of this.options.conditions) {
          let result = false;
          
          if (typeof condition.expression === 'function') {
            result = await condition.expression(context);
          } else {
            // Simple expression evaluation (in real implementation, use proper parser)
            result = Boolean(eval(condition.expression));
          }

          results.push({
            name: condition.name,
            result,
            tasksToRun: result ? condition.tasks.map(t => t.name) : []
          });
        }

        await setState('workflow:conditions', results);
        return { conditions: results };
      })
      .build();
    
    tasksMap.set(evaluateTask.name, evaluateTask);

    // Add all conditional tasks
    const taskCounter = 0;
    this.options.conditions.forEach((condition) => {
      condition.tasks.forEach(task => {
        tasksMap.set(task.name, task);
      });
    });

    // Add default tasks if any
    if (this.options.defaultTasks) {
      this.options.defaultTasks.forEach(task => {
        tasksMap.set(task.name, task);
      });
    }

    // Create phases
    phasesMap.set('evaluate', {
      name: 'evaluate',
      tasks: [evaluateTask.name],
      parallel: false
    });

    // Dynamic phase for conditional execution
    phasesMap.set('execute', {
      name: 'execute',
      tasks: [], // Will be determined at runtime
      parallel: false,
      dependsOn: ['evaluate']
    });

    return {
      id: `conditional-workflow-${this.options.name}`,
      name: this.options.name,
      description: this.options.description || 'Conditional workflow',
      tasks: tasksMap,
      phases: phasesMap
    };
  }
}

export class ParallelWorkflow {
  constructor(private options: ParallelWorkflowOptions) {}

  build(): Recipe {
    const tasksMap = new Map<string, Task>();
    const phasesMap = new Map<string, Phase>();

    // Add all tasks from branches
    this.options.branches.forEach((branch, index) => {
      const phaseTasks: string[] = [];
      
      branch.tasks.forEach(task => {
        tasksMap.set(task.name, task);
        phaseTasks.push(task.name);
      });

      // Create phase for each branch
      phasesMap.set(`branch-${branch.name}`, {
        name: `branch-${branch.name}`,
        tasks: phaseTasks,
        parallel: false
      });
    });

    // Sync task to wait for all branches if needed
    if (this.options.waitForAll) {
      const syncTask = task('sync-branches')
        .description('Wait for all parallel branches to complete')
        .handler(async (context) => {
          context.logger.info('All parallel branches completed');
          return { status: 'synced' };
        })
        .build();
      
      tasksMap.set(syncTask.name, syncTask);

      phasesMap.set('sync', {
        name: 'sync',
        tasks: [syncTask.name],
        parallel: false,
        dependsOn: this.options.branches.map(b => `branch-${b.name}`)
      });
    }

    return {
      id: `parallel-workflow-${this.options.name}`,
      name: this.options.name,
      description: this.options.description || 'Parallel workflow',
      tasks: tasksMap,
      phases: phasesMap
    };
  }
}

// Factory functions
export function approvalWorkflow(options: ApprovalWorkflowOptions): ApprovalWorkflow {
  return new ApprovalWorkflow(options);
}

export function conditionalWorkflow(options: ConditionalWorkflowOptions): ConditionalWorkflow {
  return new ConditionalWorkflow(options);
}

export function parallelWorkflow(options: ParallelWorkflowOptions): ParallelWorkflow {
  return new ParallelWorkflow(options);
}

// Pipeline workflow for CI/CD
export interface PipelineStage {
  name: string;
  tasks: Task[];
  parallel?: boolean;
  condition?: string | ((context: any) => boolean | Promise<boolean>);
}

export interface PipelineWorkflowOptions extends WorkflowOptions {
  stages: PipelineStage[];
  onFailure?: Task[];
  onSuccess?: Task[];
}

export class PipelineWorkflow {
  constructor(private options: PipelineWorkflowOptions) {}

  build(): Recipe {
    const tasksMap = new Map<string, Task>();
    const phasesMap = new Map<string, Phase>();

    // Add tasks from all stages
    this.options.stages.forEach((stage, index) => {
      const phaseTasks: string[] = [];
      
      stage.tasks.forEach(task => {
        tasksMap.set(task.name, task);
        phaseTasks.push(task.name);
      });

      // Create phase for each stage
      phasesMap.set(stage.name, {
        name: stage.name,
        tasks: phaseTasks,
        parallel: stage.parallel || false,
        dependsOn: index > 0 && this.options.stages[index - 1] ? [this.options.stages[index - 1]!.name] : undefined
      });
    });

    // Add failure handler tasks
    if (this.options.onFailure) {
      this.options.onFailure.forEach(task => {
        tasksMap.set(task.name, task);
      });
    }

    // Add success handler tasks
    if (this.options.onSuccess) {
      this.options.onSuccess.forEach(task => {
        tasksMap.set(task.name, task);
      });
    }

    return {
      id: `pipeline-workflow-${this.options.name}`,
      name: this.options.name,
      description: this.options.description || 'Pipeline workflow',
      tasks: tasksMap,
      phases: phasesMap,
      errorHandler: this.options.onFailure ? async (error: Error) => {
        // Execute failure tasks
        logger.error(`Pipeline failed: ${error.message}`);
      } : undefined
    };
  }
}

export function pipelineWorkflow(options: PipelineWorkflowOptions): PipelineWorkflow {
  return new PipelineWorkflow(options);
}