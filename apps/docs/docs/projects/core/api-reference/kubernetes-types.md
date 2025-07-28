---
sidebar_position: 8
---

# Kubernetes Types

Type definitions for the Kubernetes adapter and API.

## K8sExecutionContext

The main Kubernetes execution context returned by `$.k8s()`.

```typescript
interface K8sExecutionContext {
  // Execute a command (requires pod option)
  (strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  
  // Get a pod instance
  pod(name: string): K8sPod;
  
  // Execute commands (requires pod option)
  exec(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  raw(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
}
```

### Usage

```typescript
// Create context
const k8s = $.k8s();

// Get pod instance
const pod = k8s.pod('my-app');

// Or with namespace
const k8s = $.k8s({ namespace: 'production' });
```

## K8sPod

Represents a Kubernetes pod with methods for various operations.

```typescript
interface K8sPod {
  // Properties
  readonly name: string;      // Pod name
  readonly namespace: string; // Namespace
  
  // Command execution
  exec(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  raw(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  
  // Port forwarding
  portForward(localPort: number, remotePort: number): Promise<K8sPortForward>;
  portForwardDynamic(remotePort: number): Promise<K8sPortForward>;
  
  // Logs
  logs(options?: K8sLogOptions): Promise<string>;
  streamLogs(
    onData: (data: string) => void,
    options?: K8sStreamLogOptions
  ): Promise<K8sLogStream>;
  follow(
    onData: (data: string) => void,
    options?: Omit<K8sStreamLogOptions, 'follow'>
  ): Promise<K8sLogStream>;
  
  // File operations
  copyTo(localPath: string, remotePath: string, container?: string): Promise<void>;
  copyFrom(remotePath: string, localPath: string, container?: string): Promise<void>;
}
```

### Methods

#### exec / raw

Execute commands in the pod:

```typescript
// Execute with shell interpretation
await pod.exec`echo "Hello from $HOSTNAME"`;

// Execute without shell interpretation
await pod.raw`echo $HOME`; // Will output literal "$HOME"
```

#### portForward / portForwardDynamic

Create port forwards to the pod:

```typescript
// Forward specific port
const forward = await pod.portForward(8080, 80);
console.log(`Forwarding localhost:${forward.localPort} -> pod:${forward.remotePort}`);

// Dynamic port allocation
const dynamic = await pod.portForwardDynamic(3000);
console.log(`Dynamic port: ${dynamic.localPort}`);

// Always close when done
await forward.close();
```

#### logs

Get pod logs:

```typescript
// Get recent logs
const logs = await pod.logs({ tail: 100 });

// With timestamps
const timedLogs = await pod.logs({ 
  timestamps: true,
  tail: 50 
});

// From specific container
const nginxLogs = await pod.logs({ 
  container: 'nginx',
  previous: true 
});
```

#### streamLogs / follow

Stream logs in real-time:

```typescript
// Stream logs
const stream = await pod.streamLogs(
  (line) => console.log(line),
  { follow: true, tail: 10 }
);

// Or use the follow shorthand
const stream = await pod.follow(
  (line) => console.log(line),
  { tail: 0 } // Only new logs
);

// Stop streaming
stream.stop();
```

#### copyTo / copyFrom

Transfer files to/from the pod:

```typescript
// Copy to pod
await pod.copyTo('./local-file.txt', '/pod/file.txt');

// Copy from pod
await pod.copyFrom('/pod/output.log', './local-output.log');

// Specify container in multi-container pods
await pod.copyTo('./nginx.conf', '/etc/nginx/nginx.conf', 'nginx');
```

## K8sPortForward

Represents an active port forward connection.

```typescript
interface K8sPortForward {
  readonly localPort: number;   // Local port number
  readonly remotePort: number;  // Remote port number
  readonly isOpen: boolean;     // Connection status
  
  open(): Promise<void>;        // Open the port forward
  close(): Promise<void>;       // Close the port forward
}
```

### Usage

```typescript
const forward = await pod.portForward(8080, 80);

// Check status
if (forward.isOpen) {
  console.log(`Port forward active on ${forward.localPort}`);
}

// Close when done
await forward.close();
```

## K8sLogStream

Handle for streaming logs that can be stopped.

```typescript
interface K8sLogStream {
  stop(): void; // Stop streaming logs
}
```

### Usage

```typescript
const stream = await pod.follow((line) => {
  if (line.includes('ERROR')) {
    console.error(line);
  }
});

// Stop after 30 seconds
setTimeout(() => stream.stop(), 30000);
```

## K8sLogOptions

Options for retrieving pod logs.

```typescript
interface K8sLogOptions {
  container?: string;    // Container name (for multi-container pods)
  tail?: number;         // Number of lines from the end
  previous?: boolean;    // Get logs from previous container instance
  timestamps?: boolean;  // Include timestamps
}
```

## K8sStreamLogOptions

Options for streaming pod logs.

```typescript
interface K8sStreamLogOptions extends K8sLogOptions {
  follow?: boolean;      // Follow log output (like tail -f)
}
```

## KubernetesAdapterOptions

Configuration options for the Kubernetes adapter.

```typescript
interface KubernetesAdapterOptions {
  type: 'kubernetes';
  
  // Required
  pod: string;              // Pod name or label selector
  
  // Optional
  namespace?: string;       // Kubernetes namespace (default: 'default')
  container?: string;       // Container name
  kubeconfig?: string;      // Path to kubeconfig file
  context?: string;         // Kubernetes context
  
  // Execution options
  stdin?: boolean;          // Attach stdin
  tty?: boolean;            // Allocate TTY
  execFlags?: string[];     // Additional kubectl exec flags
  
  // Timeouts
  kubectlTimeout?: number;  // Timeout for kubectl commands
}
```

### Label Selectors

The `pod` field supports label selectors:

```typescript
// Select by name
const k8s = $.k8s({ pod: 'my-app-pod' });

// Select by label
const k8s = $.k8s({ pod: '-l app=web,tier=frontend' });
```

## Error Types

Kubernetes operations can throw these errors:

```typescript
// ExecutionError with code 'KUBERNETES_ERROR'
try {
  await pod.exec`invalid-command`;
} catch (error) {
  if (error.code === 'KUBERNETES_ERROR') {
    console.error('Kubernetes operation failed:', error.message);
  }
}
```

Common error scenarios:
- Pod not found
- Permission denied
- Container not ready
- Network timeout
- Invalid kubeconfig

## Complete Example

```typescript
import { $ } from '@xec-sh/core';

async function kubernetesWorkflow() {
  // Create context
  const k8s = $.k8s({ namespace: 'production' });
  
  // Get pod
  const appPod = k8s.pod('app-server');
  
  // Port forwarding
  const dbForward = await k8s.pod('database').portForward(5432, 5432);
  const apiForward = await appPod.portForwardDynamic(3000);
  
  try {
    // Execute commands
    await appPod.exec`npm run migrate`;
    
    // Stream logs
    const logStream = await appPod.follow(
      (line) => console.log(`[APP] ${line}`),
      { tail: 100 }
    );
    
    // Copy files
    await appPod.copyTo('./new-config.json', '/app/config.json');
    
    // Get logs for debugging
    const recentLogs = await appPod.logs({ 
      tail: 50, 
      timestamps: true 
    });
    
    // Wait for some processing
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Cleanup
    logStream.stop();
  } finally {
    // Always close port forwards
    await dbForward.close();
    await apiForward.close();
  }
}
```