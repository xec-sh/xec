export interface Task {
  id: string;
  name: string;
  module: string;
  definition: any;
}

export interface TaskContext {
  variables: Map<string, any>;
  secrets: Map<string, any>;
  resources: Record<string, any>;
}

export interface TaskResult {
  success: boolean;
  changed: boolean;
  output?: string;
  data?: any;
  error?: Error;
}