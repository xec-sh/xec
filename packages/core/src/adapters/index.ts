// Re-export all adapters from their respective folders
export { LocalAdapter, type LocalAdapterConfig } from './local/index.js';
export { KubernetesAdapter, type KubernetesAdapterConfig } from './kubernetes/index.js';
export { MockAdapter, type MockResponse, type MockAdapterConfig } from './mock/index.js';
// Re-export base adapter
export { BaseAdapter, type BaseAdapterConfig, type SensitiveDataMaskingConfig } from './base-adapter.js';
export { DockerAdapter, type DockerAdapterConfig, type DockerAutoCreateOptions, type DockerDefaultExecOptions } from './docker/index.js';

export { SSHAdapter, type SSHSudoOptions, type SSHSFTPOptions, type SSHAdapterConfig, type SSHMultiplexingOptions, type SSHConnectionPoolOptions } from './ssh/index.js';