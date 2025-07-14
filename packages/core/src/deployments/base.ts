import { EventEmitter } from 'events';

import { ExecutionContext } from '../execution/context.js';
import { Orchestrator } from '../orchestration/orchestrator.js';

export interface DeploymentStatus {
  status: string;
  message?: string;
  timestamp: number;
}

export abstract class BaseDeployment extends EventEmitter {
  protected status: string = 'pending';
  protected statusHistory: DeploymentStatus[] = [];

  constructor(
    protected name: string,
    protected config: any,
    protected orchestrator: Orchestrator,
    protected context: ExecutionContext
  ) {
    super();
  }

  abstract deploy(): Promise<void>;

  getStatus(): string {
    return this.status;
  }

  getStatusHistory(): DeploymentStatus[] {
    return [...this.statusHistory];
  }

  protected updateStatus(status: string, message?: string): void {
    this.status = status;
    const statusUpdate: DeploymentStatus = {
      status,
      message,
      timestamp: Date.now(),
    };
    
    this.statusHistory.push(statusUpdate);
    this.emit('statusChange', statusUpdate);
    
    // Emit specific status events
    switch (status) {
      case 'deploying':
        this.emit('deploymentStarted');
        break;
      case 'completed':
        this.emit('deploymentCompleted');
        break;
      case 'failed':
        this.emit('deploymentFailed', message);
        break;
      case 'paused':
        this.emit('deploymentPaused');
        break;
      case 'resumed':
        this.emit('deploymentResumed');
        break;
      default:
        // Handle any other status values (e.g., 'preparing', 'rollback', etc.)
        // No specific event for other statuses, but the general statusChange event is still emitted
        break;
    }
  }

  pause(): void {
    if (this.status === 'deploying') {
      this.updateStatus('paused', 'Deployment paused');
    }
  }

  resume(): void {
    if (this.status === 'paused') {
      this.updateStatus('resumed', 'Deployment resumed');
    }
  }

  abort(): void {
    if (this.status === 'deploying' || this.status === 'paused') {
      this.updateStatus('aborted', 'Deployment aborted');
    }
  }
}