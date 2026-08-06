// Shell escape utilities
export { shellEscape, validateShellName } from './utils/shell-escape.js';

// Binary detection utilities
export {
  findBinary, getKindPath, EXTENDED_PATH, getDockerPath, execWithBinary, getExtendedEnv,
  getKubectlPath, isKindAvailable, clearBinaryCache, isBinaryAvailable, isDockerAvailable,
  isKubectlAvailable, isSshpassAvailable,
} from './utils/binary-detector.js';

// Docker utilities
export type { ContainerConfig } from './docker/container-manager.js';
export {
  dockerManager, DOCKER_CONTAINERS, DockerContainerManager,
} from './docker/container-manager.js';

// Kubernetes utilities
export type { KindClusterConfig } from './k8s/kind-cluster-manager.js';
export {
  getKindCluster, setupKindCluster, KindClusterManager, teardownKindCluster,
} from './k8s/kind-cluster-manager.js';

// SSH test helpers
export type { SSHTestConfig } from './helpers/ssh-test-helpers.js';
export {
  execInContainer,
  getContainerInfo,
  getContainerLogs,
  type ContainerInfo,
  cleanupTestContainers
} from './docker/utils.js';

export {
  skipInCI, describeSSH, getSSHConfig, waitForContainer, testPackageManagers,
  getAvailableContainers, testEachPackageManager,
} from './helpers/ssh-test-helpers.js';

/** Default test SSH password - used only for test container authentication */
const TEST_SSH_PASSWORD = 'password';

// SSH connection configuration
export interface SSHConnectionConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  packageManager: string;
  testPackage: string;
  /**
   * Host key policy for fixture containers.
   *
   * Always `off`: these containers regenerate their host key on every
   * rebuild, so a recorded key is guaranteed to go stale, and test runs must
   * not write fixture keys into the developer's ~/.ssh/known_hosts. This is
   * scoped to disposable fixtures and must never be the default for real
   * hosts.
   */
  hostKeyChecking: 'off';
}

// Re-export container configurations with SSH details
export const SSH_TEST_CONFIGS: SSHConnectionConfig[] = [
  {
    host: 'localhost',
    port: 2201,
    username: 'user',
    password: TEST_SSH_PASSWORD,
    hostKeyChecking: 'off' as const,
    packageManager: 'apt',
    testPackage: 'curl'
  },
  {
    host: 'localhost',
    port: 2202,
    username: 'user',
    password: TEST_SSH_PASSWORD,
    hostKeyChecking: 'off' as const,
    packageManager: 'yum',
    testPackage: 'wget'
  },
  {
    host: 'localhost',
    port: 2203,
    username: 'user',
    password: TEST_SSH_PASSWORD,
    hostKeyChecking: 'off' as const,
    packageManager: 'dnf',
    testPackage: 'nano'
  },
  {
    host: 'localhost',
    port: 2204,
    username: 'user',
    password: TEST_SSH_PASSWORD,
    hostKeyChecking: 'off' as const,
    packageManager: 'apk',
    testPackage: 'vim'
  },
  {
    host: 'localhost',
    port: 2205,
    username: 'user',
    password: TEST_SSH_PASSWORD,
    hostKeyChecking: 'off' as const,
    packageManager: 'pacman',
    testPackage: 'htop'
  },
  {
    host: 'localhost',
    port: 2206,
    username: 'user',
    password: TEST_SSH_PASSWORD,
    hostKeyChecking: 'off' as const,
    packageManager: 'brew',
    testPackage: 'jq'
  },
  {
    host: 'localhost',
    port: 2207,
    username: 'user',
    password: TEST_SSH_PASSWORD,
    hostKeyChecking: 'off' as const,
    packageManager: 'snap',
    testPackage: 'hello'
  }
];

// Helper to get SSH config by container name
export function getSSHConfigByName(containerName: string): SSHConnectionConfig | undefined {
  const containerMap: Record<string, number> = {
    'ubuntu-apt': 2201,
    'centos7-yum': 2202,
    'fedora-dnf': 2203,
    'alpine-apk': 2204,
    'manjaro-pacman': 2205,
    'ubuntu-brew': 2206,
    'ubuntu-snap': 2207
  };

  const port = containerMap[containerName];
  return SSH_TEST_CONFIGS.find(config => config.port === port);
}