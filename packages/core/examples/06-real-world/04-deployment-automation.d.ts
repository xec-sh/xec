interface DeploymentTarget {
    name: string;
    host: string;
    username: string;
    privateKey: string;
    deployPath: string;
    environment: 'production' | 'staging' | 'development';
    role: 'web' | 'api' | 'worker' | 'database';
}
declare function multiServerDeployment(targets: DeploymentTarget[], config: DeploymentConfig): Promise<DeploymentResult[]>;
declare function blueGreenDeployment(config: BlueGreenConfig): Promise<void>;
declare function canaryDeployment(config: CanaryConfig, servers: DeploymentTarget[]): Promise<void>;
declare function rollbackDeployment(server: DeploymentTarget, version: string): Promise<void>;
declare function performHealthChecks(servers: DeploymentTarget[], config: DeploymentConfig): Promise<void>;
interface DeploymentConfig {
    version: string;
    branch: string;
    repository: string;
    keepReleases?: number;
    healthCheck?: boolean;
    healthCheckPort?: number;
    autoRollback?: boolean;
    hooks?: {
        preDeploy?: string;
        postDeploy?: string;
    };
}
interface DeploymentResult {
    server: string;
    status: 'pending' | 'success' | 'failed';
    startTime: Date;
    endTime: Date | null;
    error: string | null;
    rollbackVersion: string | null;
}
interface BlueGreenConfig {
    host: string;
    username: string;
    privateKey: string;
    basePath: string;
    branch: string;
    domain: string;
    bluePort: number;
    greenPort: number;
    warmupEndpoints: string[];
}
interface CanaryConfig extends DeploymentConfig {
    strategy: 'linear' | 'exponential';
    stages: Array<{
        name: string;
        percentage: number;
        monitorDuration: number;
        pauseAfter?: number;
    }>;
    metrics: MetricsConfig;
    thresholds: MetricThresholds;
    rollbackOnFailure: boolean;
    artifactPath: string;
}
interface MetricsConfig {
    metricsPort: number;
    endpoints: string[];
}
interface MetricThresholds {
    maxErrorRate: number;
    maxResponseTime: number;
    maxCpu: number;
    maxMemory: number;
}
export { canaryDeployment, rollbackDeployment, blueGreenDeployment, performHealthChecks, multiServerDeployment };
