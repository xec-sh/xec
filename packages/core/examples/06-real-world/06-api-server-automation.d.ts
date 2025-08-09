declare function runApiTests(config: ApiTestConfig): Promise<TestResult[]>;
declare function runLoadTest(config: LoadTestConfig): Promise<LoadTestResult | undefined>;
declare function monitorApiAvailability(config: ApiMonitorConfig): Promise<void>;
declare function generateApiDocumentation(config: ApiDocConfig): Promise<void>;
declare function runSecurityTests(config: SecurityTestConfig): Promise<void>;
interface ApiTestConfig {
    baseUrl: string;
    tests: ApiTest[];
    defaultHeaders?: Record<string, string>;
    auth?: {
        type: 'bearer' | 'basic';
        token?: string;
        username?: string;
        password?: string;
    };
    saveResults?: boolean;
    resultsPath?: string;
    failOnError?: boolean;
}
interface ApiTest {
    name: string;
    endpoint: string;
    method: string;
    headers?: Record<string, string>;
    body?: any;
    assertions: ApiAssertion[];
}
interface ApiAssertion {
    type: 'status' | 'responseTime' | 'jsonPath' | 'schema';
    expected?: any;
    path?: string;
    schema?: any;
}
interface TestResult {
    name: string;
    endpoint: string;
    method: string;
    passed: boolean;
    duration: number;
    response?: {
        statusCode: number;
        body: any;
        time: number;
    };
    assertions: AssertionResult[];
    error: string | null;
}
interface AssertionResult {
    type: string;
    expected: any;
    actual: any;
    passed: boolean;
    message: string;
}
interface LoadTestConfig {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    users: number;
    duration: number;
    sla?: {
        maxMeanLatency?: number;
        maxP99Latency?: number;
        minRequestsPerSecond?: number;
        maxErrorRate?: number;
    };
}
interface LoadTestResult {
    tool: string;
    totalRequests: number;
    failedRequests: number;
    requestsPerSecond: number;
    meanLatency: number;
    p50Latency: number;
    p90Latency: number;
    p99Latency: number;
    throughput: number;
    raw: string;
}
interface ApiMonitorConfig {
    baseUrl: string;
    endpoints: ApiEndpoint[];
    interval: number;
    duration: number;
    alerts?: AlertConfig;
}
interface ApiEndpoint {
    name: string;
    path: string;
    expectedStatus?: number;
    timeout?: number;
}
interface AlertConfig {
    webhook?: string;
    email?: string;
    slowResponseThreshold?: number;
}
interface ApiDocConfig {
    source: 'openapi' | 'postman' | 'code';
    specPath?: string;
    sourcePath?: string;
    outputPath: string;
    outputFormats: Array<'markdown' | 'html' | 'pdf'>;
}
interface SecurityTestConfig {
    baseUrl: string;
    endpoints: string[];
    sqlInjectionTests?: boolean;
    xssTests?: boolean;
}
export { runApiTests, runLoadTest, runSecurityTests, monitorApiAvailability, generateApiDocumentation };
