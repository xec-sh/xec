declare function systemResourceMonitor(): Promise<void>;
declare function processMonitor(processName?: string): Promise<void>;
declare function logMonitor(logFile: string, patterns: string[]): Promise<void>;
declare function serviceHealthCheck(services: ServiceConfig[]): Promise<void>;
interface ServiceConfig {
    name: string;
    type: 'http' | 'tcp' | 'process';
    url?: string;
    host?: string;
    port?: number;
    processName?: string;
    timeout?: number;
}
declare function dockerMonitor(): Promise<void>;
declare function infrastructureMonitor(config: InfrastructureConfig): Promise<void>;
interface InfrastructureConfig {
    servers: Array<{
        name: string;
        host: string;
        username: string;
        privateKey: string;
    }>;
    services: ServiceConfig[];
}
export { logMonitor, dockerMonitor, processMonitor, serviceHealthCheck, systemResourceMonitor, infrastructureMonitor };
