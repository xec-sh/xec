import { promisify } from 'node:util';
import { exec } from 'node:child_process';

const execAsync = promisify(exec);

export interface ProcessInfo {
  pid: number;
  ppid: number;
  command: string;
  cpu?: number;
  memory?: number;
}