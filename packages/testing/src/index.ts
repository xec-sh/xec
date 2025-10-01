// Docker utilities
export * from './docker/container-manager';
// Kubernetes utilities
export * from './k8s/kind-cluster-manager';

// SSH test helpers
export * from './helpers/ssh-test-helpers';

export { 
  docker,
  execInContainer,
  getContainerInfo,
  getContainerLogs,
  type ContainerInfo,
  cleanupTestContainers
} from './docker/utils';

// SSH connection configuration
export interface SSHConnectionConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  packageManager: string;
  testPackage: string;
}

// Re-export container configurations with SSH details
export const SSH_TEST_CONFIGS: SSHConnectionConfig[] = [
  {
    host: 'localhost',
    port: 2201,
    username: 'user',
    password: 'password',
    packageManager: 'apt',
    testPackage: 'curl'
  },
  {
    host: 'localhost',
    port: 2202,
    username: 'user',
    password: 'password',
    packageManager: 'yum',
    testPackage: 'wget'
  },
  {
    host: 'localhost',
    port: 2203,
    username: 'user',
    password: 'password',
    packageManager: 'dnf',
    testPackage: 'nano'
  },
  {
    host: 'localhost',
    port: 2204,
    username: 'user',
    password: 'password',
    packageManager: 'apk',
    testPackage: 'vim'
  },
  {
    host: 'localhost',
    port: 2205,
    username: 'user',
    password: 'password',
    packageManager: 'pacman',
    testPackage: 'htop'
  },
  {
    host: 'localhost',
    port: 2206,
    username: 'user',
    password: 'password',
    packageManager: 'brew',
    testPackage: 'jq'
  },
  {
    host: 'localhost',
    port: 2207,
    username: 'user',
    password: 'password',
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