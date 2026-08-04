import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { rmSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';

import { validateShellName } from '../utils/shell-escape.js';
import {
  getExtendedEnv,
  isKindAvailable,
  isDockerAvailable,
  isKubectlAvailable,
} from '../utils/binary-detector.js';

export interface KindClusterConfig {
  name: string;
  image?: string;
  waitTimeout?: number;
  nodes?: number;
}

interface K8sCondition { type: string; status: string; }
interface K8sNode { status: { conditions: K8sCondition[] } }
interface K8sNodeList { items: K8sNode[] }

/**
 * Images the fixtures deploy, preloaded so no test waits on a registry pull.
 *
 * Keep in step with the pod specs below: an image missing here is pulled
 * inside the cluster on first use, which regularly exceeded the test timeout
 * and surfaced as a product failure rather than a fixture one.
 */
const PRELOADED_IMAGES = ['alpine:3.18', 'nginx:alpine'];

export class KindClusterManager {
  private clusterName: string;
  private kubeConfigPath: string;
  private tempDir: string;

  constructor(config: KindClusterConfig = { name: 'xec-test-cluster' }) {
    validateShellName(config.name, 'cluster name');
    this.clusterName = config.name;
    this.tempDir = mkdtempSync(join(tmpdir(), 'xec-kind-'));
    this.kubeConfigPath = join(this.tempDir, 'kubeconfig');
  }

  /**
   * Write the running cluster's kubeconfig to this instance's path if it is
   * not there yet.
   *
   * Each instance gets its own temp directory, so the file only ever existed
   * for the instance that called {@link createCluster}. Any other instance —
   * a caller that skipped creation because the cluster was already up, or a
   * second manager built for teardown — ran `kubectl` with `KUBECONFIG`
   * pointing at a file that did not exist. kubectl then fell back to no
   * cluster at all and returned empty results instead of failing, so pods
   * appeared not to exist and cleanup silently did nothing.
   */
  private ensureKubeConfig(): void {
    if (existsSync(this.kubeConfigPath)) {
      return;
    }

    try {
      this.exec(
        `kind export kubeconfig --name ${this.clusterName} --kubeconfig ${this.kubeConfigPath}`,
        { silent: true, skipKubeconfig: true }
      );
    } catch {
      // The cluster may genuinely not exist yet; createCluster() will make it.
    }
  }

  private exec(command: string, options: { silent?: boolean; skipKubeconfig?: boolean } = {}): string {
    try {
      const env = getExtendedEnv();

      // Only set KUBECONFIG if not explicitly skipped
      if (!options.skipKubeconfig) {
        this.ensureKubeConfig();
        env['KUBECONFIG'] = this.kubeConfigPath;
      }

      const result = execSync(command, {
        encoding: 'utf8',
        stdio: options.silent ? 'pipe' : 'inherit',
        env
      });

      return result ? result.toString() : '';
    } catch (error) {
      if (!options.silent) {
        console.error(`Command failed: ${command}`);
        console.error(error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
  }

  /**
   * Check if all required binaries are available
   */
  static checkRequirements(): { available: boolean; missing: string[] } {
    const missing: string[] = [];

    if (!isDockerAvailable()) {
      missing.push('docker');
    }
    if (!isKindAvailable()) {
      missing.push('kind');
    }
    if (!isKubectlAvailable()) {
      missing.push('kubectl');
    }

    return {
      available: missing.length === 0,
      missing
    };
  }

  async isClusterRunning(): Promise<boolean> {
    try {
      const clusters = this.exec('kind get clusters', { silent: true, skipKubeconfig: true });
      return clusters.includes(this.clusterName);
    } catch {
      return false;
    }
  }

  async createCluster(config: Partial<KindClusterConfig> = {}): Promise<void> {
    if (await this.isClusterRunning()) {
      console.log(`Cluster ${this.clusterName} already exists`);
      // Export the existing cluster's kubeconfig to our expected path
      try {
        this.exec(`kind export kubeconfig --name ${this.clusterName} --kubeconfig ${this.kubeConfigPath}`, { silent: true, skipKubeconfig: true });
        console.log(`Exported kubeconfig for existing cluster to ${this.kubeConfigPath}`);
      } catch (error) {
        console.error('Failed to export kubeconfig for existing cluster:', error);
        throw error;
      }
      return;
    }

    console.log(`Creating kind cluster: ${this.clusterName}`);
    
    // Create a kind config file for better control
    const kindConfig = `
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  image: ${config.image || 'kindest/node:v1.28.0'}
`;
    
    const configPath = join(this.tempDir, 'kind-config.yaml');
    writeFileSync(configPath, kindConfig);

    try {
      this.exec(
        `kind create cluster --name ${this.clusterName} --config ${configPath} --kubeconfig ${this.kubeConfigPath}`,
        { silent: false }
      );
      
      // Wait for cluster to be ready
      await this.waitForCluster(config.waitTimeout || 60);
      
      // Preload every image the fixtures use. A kind cluster starts with an
      // empty image store, so anything not loaded here is pulled from the
      // registry the first time a pod needs it — which routinely took longer
      // than the test's own timeout and looked like a product failure.
      for (const image of PRELOADED_IMAGES) {
        console.log(`Preloading ${image}...`);
        try {
          this.exec(`docker pull ${image}`, { silent: true, skipKubeconfig: true });
          this.exec(`kind load docker-image ${image} --name ${this.clusterName}`, { silent: true, skipKubeconfig: true });
        } catch (e) {
          console.warn(`Failed to preload ${image}:`, e);
        }
      }
    } catch (error) {
      console.error('Failed to create cluster:', error);
      throw error;
    }
  }

  async deleteCluster(): Promise<void> {
    if (!(await this.isClusterRunning())) {
      return;
    }

    console.log(`Deleting kind cluster: ${this.clusterName}`);
    try {
      this.exec(`kind delete cluster --name ${this.clusterName}`, { silent: false, skipKubeconfig: true });
    } catch (error) {
      console.error('Failed to delete cluster:', error);
      throw error;
    }
  }

  async waitForCluster(timeoutSeconds: number = 60): Promise<void> {
    console.log('Waiting for cluster to be ready...');
    const startTime = Date.now();
    
    while ((Date.now() - startTime) / 1000 < timeoutSeconds) {
      try {
        // Check if all nodes are ready
        const output = this.exec('kubectl get nodes -o json', { silent: true });
        let nodes: K8sNodeList;
        try {
          nodes = JSON.parse(output) as K8sNodeList;
        } catch {
          continue; // Invalid JSON, retry
        }

        const allReady = nodes.items.every((node: K8sNode) =>
          node.status.conditions.some((c: K8sCondition) =>
            c.type === 'Ready' && c.status === 'True'
          )
        );

        if (allReady) {
          console.log('Cluster is ready!');
          
          // Create test namespace
          try {
            this.exec('kubectl create namespace test', { silent: true });
          } catch {
            // Namespace might already exist
          }
          
          return;
        }
      } catch {
        // Cluster not ready yet
      }
      
      await new Promise(done => setTimeout(done, 1000));
    }

    throw new Error(`Cluster did not become ready within ${timeoutSeconds} seconds`);
  }

  async deployTestPod(name: string = 'test-pod', namespace: string = 'test'): Promise<void> {
    validateShellName(name, 'pod name');
    validateShellName(namespace, 'namespace');
    // Ensure namespace exists
    try {
      this.exec(`kubectl create namespace ${namespace}`, { silent: true });
    } catch {
      // Namespace might already exist, ignore error
    }

    const podYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app: test
spec:
  automountServiceAccountToken: false
  containers:
  - name: main
    image: alpine:3.18
    command: ['sh', '-c', 'while true; do sleep 3600; done']
    securityContext:
      runAsUser: 1000
      runAsGroup: 1000
  # Remove nginx container for now since it causes permission issues
  # - name: nginx
  #   image: nginx:alpine
  #   # nginx runs automatically, no need for command
  #   securityContext:
  #     runAsUser: 1000
  #     runAsGroup: 1000
`;
    
    const podPath = join(this.tempDir, `${name}.yaml`);
    writeFileSync(podPath, podYaml);
    
    try {
      this.exec(`kubectl apply -f ${podPath}`, { silent: false });
      
      // Wait for pod to be ready
      await this.waitForPod(name, namespace);
    } catch (error) {
      console.error(`Failed to deploy pod ${name}:`, error);
      throw error;
    }
  }

  async waitForPod(name: string, namespace: string = 'test', timeoutSeconds: number = 60): Promise<void> {
    console.log(`Waiting for pod ${name} to be ready...`);
    const startTime = Date.now();
    
    while ((Date.now() - startTime) / 1000 < timeoutSeconds) {
      try {
        // Check pod status
        const statusOutput = this.exec(
          `kubectl get pod ${name} -n ${namespace} -o json`,
          { silent: true }
        );
        let status: { status?: { phase?: string; conditions?: K8sCondition[]; containerStatuses?: { name: string; state?: { waiting?: { reason?: string } } }[] } };
        try {
          status = JSON.parse(statusOutput);
        } catch {
          continue; // Invalid JSON, retry
        }

        // Check if all containers are ready
        const isReady = status.status?.conditions?.find((c: K8sCondition) => c.type === 'Ready')?.status === 'True';
        
        if (isReady) {
          console.log(`Pod ${name} is ready!`);
          return;
        }
        
        // Log current status for debugging
        const phase = status.status?.phase || 'Unknown';
        const containerStatuses = status.status?.containerStatuses || [];
        console.log(`Pod ${name} status: ${phase}, containers: ${containerStatuses.length}`);
        
        // Check for any errors
        for (const cs of containerStatuses) {
          if (cs.state?.waiting?.reason) {
            console.log(`Container ${cs.name} waiting: ${cs.state.waiting.reason}`);
          }
        }
      } catch (e) {
        // Pod might not exist yet
        console.log(`Failed to get pod status: ${e}`);
      }
      
      await new Promise(done => setTimeout(done, 2000));
    }

    // Get final pod status for error message
    try {
      const finalStatus = this.exec(
        `kubectl describe pod ${name} -n ${namespace}`,
        { silent: true }
      );
      console.error(`Pod ${name} failed to become ready. Pod description:\n${finalStatus}`);
    } catch {
      // Ignore
    }
    
    throw new Error(`Pod ${name} did not become ready within ${timeoutSeconds} seconds`);
  }

  async createMultiContainerPod(name: string = 'multi-pod', namespace: string = 'test'): Promise<void> {
    validateShellName(name, 'pod name');
    validateShellName(namespace, 'namespace');
    // Ensure namespace exists
    try {
      this.exec(`kubectl create namespace ${namespace}`, { silent: true });
    } catch {
      // Namespace might already exist, ignore error
    }

    const podYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app: test
spec:
  automountServiceAccountToken: false
  containers:
  - name: app
    image: alpine:3.18
    command: ['sh', '-c', 'while true; do echo "App container running"; sleep 10; done']
    securityContext:
      runAsUser: 1000
      runAsGroup: 1000
  - name: sidecar
    image: alpine:3.18
    command: ['sh', '-c', 'while true; do echo "Sidecar container running"; sleep 10; done']
    securityContext:
      runAsUser: 1000
      runAsGroup: 1000
  - name: nginx
    image: nginx:alpine
    ports:
    - containerPort: 80
`;
    
    const podPath = join(this.tempDir, `${name}.yaml`);
    writeFileSync(podPath, podYaml);
    
    try {
      this.exec(`kubectl apply -f ${podPath}`, { silent: false });
      await this.waitForPod(name, namespace);
    } catch (error) {
      console.error(`Failed to deploy multi-container pod ${name}:`, error);
      throw error;
    }
  }

  getKubeConfigPath(): string {
    // Callers hand this straight to an adapter, which never goes through
    // exec(), so materialise the file here too.
    this.ensureKubeConfig();
    return this.kubeConfigPath;
  }

  getClusterName(): string {
    return this.clusterName;
  }

  cleanup(): void {
    if (existsSync(this.tempDir)) {
      rmSync(this.tempDir, { recursive: true, force: true });
    }
  }

  // Helper to run kubectl commands with the right kubeconfig
  kubectl(args: string): string {
    return this.exec(`kubectl ${args}`, { silent: true });
  }
}

// Singleton instance for tests
let clusterManager: KindClusterManager | null = null;

export function getKindCluster(): KindClusterManager {
  if (!clusterManager) {
    clusterManager = new KindClusterManager({ name: 'xec-k8s-tests' });
  }
  return clusterManager;
}

export async function setupKindCluster(): Promise<KindClusterManager> {
  const manager = getKindCluster();
  await manager.createCluster();
  return manager;
}

export async function teardownKindCluster(): Promise<void> {
  if (clusterManager) {
    await clusterManager.deleteCluster();
    clusterManager.cleanup();
    clusterManager = null;
  }
}