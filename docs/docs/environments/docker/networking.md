# Docker Networking Configuration

The Docker adapter provides comprehensive networking capabilities for container communication, including network creation, management, port forwarding, and advanced networking patterns for complex multi-container applications.

## Network Creation and Management

### Creating Docker Networks
Create and configure Docker networks programmatically:

```javascript
import { DockerAdapter } from '@xec-sh/core';

const docker = new DockerAdapter();

// Create basic bridge network
await docker.createNetwork('app-network');

// Create network with specific driver
await docker.createNetwork('overlay-network', {
  driver: 'overlay'
});

// Create network with custom subnet
await docker.createNetwork('custom-network', {
  driver: 'bridge',
  subnet: '172.20.0.0/16',
  gateway: '172.20.0.1'
});

// Create network with advanced options
await docker.createNetwork('secure-network', {
  driver: 'bridge',
  subnet: '10.0.0.0/24',
  gateway: '10.0.0.1',
  ipRange: '10.0.0.128/25',
  attachable: true,
  internal: false
});

// Create isolated internal network
await docker.createNetwork('internal-db', {
  driver: 'bridge',
  internal: true,  // No external connectivity
  subnet: '192.168.100.0/24'
});
```

### Network Inspection
Query and inspect network configurations:

```javascript
// List all networks
const networks = await docker.listNetworks();
console.log('Available networks:', networks);

// Inspect specific network
const inspectNetwork = async (networkName) => {
  try {
    const result = await docker.executeDockerCommand([
      'network', 'inspect', networkName
    ], {});
    
    const networkInfo = JSON.parse(result.stdout)[0];
    console.log(`Network: ${networkName}`);
    console.log(`- Driver: ${networkInfo.Driver}`);
    console.log(`- Scope: ${networkInfo.Scope}`);
    console.log(`- Subnet: ${networkInfo.IPAM.Config[0]?.Subnet}`);
    console.log(`- Gateway: ${networkInfo.IPAM.Config[0]?.Gateway}`);
    console.log(`- Internal: ${networkInfo.Internal}`);
    console.log(`- Attachable: ${networkInfo.Attachable}`);
    console.log(`- Containers: ${Object.keys(networkInfo.Containers || {}).length}`);
    
    return networkInfo;
  } catch (error) {
    console.error(`Failed to inspect network ${networkName}:`, error.message);
  }
};

await inspectNetwork('app-network');

// Find networks by driver
const getNetworksByDriver = async (driver) => {
  const allNetworks = await docker.listNetworks();
  const matchingNetworks = [];
  
  for (const network of allNetworks) {
    try {
      const info = await inspectNetwork(network);
      if (info && info.Driver === driver) {
        matchingNetworks.push(network);
      }
    } catch (error) {
      // Skip networks that can't be inspected
    }
  }
  
  return matchingNetworks;
};

const bridgeNetworks = await getNetworksByDriver('bridge');
console.log('Bridge networks:', bridgeNetworks);
```

## Container Network Connectivity

### Connecting Containers to Networks
Connect containers to specific networks:

```javascript
// Run container on specific network
await docker.runContainer({
  name: 'web-server',
  image: 'nginx:alpine',
  network: 'app-network',
  ports: ['80:80']
});

// Run container on multiple networks
await docker.runContainer({
  name: 'gateway',
  image: 'nginx:alpine',
  // Connect to multiple networks post-creation
});

// Connect existing container to additional networks
const connectToNetwork = async (container, network, options = {}) => {
  const args = ['network', 'connect'];
  
  if (options.ip) {
    args.push('--ip', options.ip);
  }
  
  if (options.alias) {
    args.push('--alias', options.alias);
  }
  
  args.push(network, container);
  
  await docker.executeDockerCommand(args, {});
};

await connectToNetwork('gateway', 'frontend-network', {
  alias: 'api-gateway'
});
await connectToNetwork('gateway', 'backend-network', {
  ip: '10.0.0.10'
});

// Disconnect container from network
const disconnectFromNetwork = async (container, network) => {
  await docker.executeDockerCommand([
    'network', 'disconnect', network, container
  ], {});
};

await disconnectFromNetwork('gateway', 'frontend-network');
```

### Service Discovery and DNS
Implement service discovery using Docker's built-in DNS:

```javascript
// Create application network with services
await docker.createNetwork('app-tier');

// Database service
await docker.runContainer({
  name: 'database',
  image: 'postgres:15-alpine',
  network: 'app-tier',
  env: {
    POSTGRES_DB: 'myapp',
    POSTGRES_USER: 'user',
    POSTGRES_PASSWORD: 'password'
  }
});

// Cache service
await docker.runContainer({
  name: 'cache',
  image: 'redis:alpine',
  network: 'app-tier'
});

// Application service with service discovery
await docker.runContainer({
  name: 'app',
  image: 'myapp:latest',
  network: 'app-tier',
  env: {
    // Services accessible by container name
    DATABASE_URL: 'postgresql://user:password@database:5432/myapp',
    REDIS_URL: 'redis://cache:6379'
  }
});

// Test service connectivity
const testServiceConnectivity = async () => {
  // Test database connectivity from app
  const dbTest = await $({
    adapterOptions: {
      type: 'docker',
      container: 'app'
    }
  })`nc -z database 5432`;
  
  console.log('Database connectivity:', dbTest.exitCode === 0 ? 'OK' : 'FAILED');
  
  // Test cache connectivity from app
  const cacheTest = await $({
    adapterOptions: {
      type: 'docker',
      container: 'app'
    }
  })`nc -z cache 6379`;
  
  console.log('Cache connectivity:', cacheTest.exitCode === 0 ? 'OK' : 'FAILED');
  
  // Test DNS resolution
  const dnsTest = await $({
    adapterOptions: {
      type: 'docker',
      container: 'app'
    }
  })`nslookup database`;
  
  console.log('DNS resolution test:', dnsTest.stdout);
};

await testServiceConnectivity();
```

## Port Mapping and Exposure

### Basic Port Mapping
Configure port mapping for container access:

```javascript
// Single port mapping
await docker.runContainer({
  name: 'web-app',
  image: 'nginx:alpine',
  ports: ['8080:80']  // Host:Container
});

// Multiple port mappings
await docker.runContainer({
  name: 'full-stack-app',
  image: 'myapp:latest',
  ports: [
    '3000:3000',    // HTTP
    '3001:3001',    // WebSocket
    '9229:9229'     // Debug port
  ]
});

// Dynamic port mapping
await docker.runContainer({
  name: 'dynamic-app',
  image: 'nginx:alpine',
  ports: ['80']       // Docker assigns random host port
});

// Get assigned port
const getContainerPorts = async (containerName) => {
  const info = await docker.inspectContainer(containerName);
  const ports = info.NetworkSettings.Ports;
  
  const portMappings = {};
  for (const [containerPort, hostBindings] of Object.entries(ports || {})) {
    if (hostBindings && hostBindings.length > 0) {
      portMappings[containerPort] = hostBindings[0].HostPort;
    }
  }
  
  return portMappings;
};

const dynamicPorts = await getContainerPorts('dynamic-app');
console.log('Port mappings:', dynamicPorts);
```

### Advanced Port Configuration
Implement advanced port mapping strategies:

```javascript
// Bind to specific interface
await docker.runContainer({
  name: 'secure-app',
  image: 'myapp:latest',
  ports: ['127.0.0.1:8080:80']  // Only localhost access
});

// IPv6 port mapping
await docker.runContainer({
  name: 'ipv6-app',
  image: 'nginx:alpine',
  ports: ['[::1]:8080:80']      // IPv6 localhost
});

// UDP port mapping
await docker.runContainer({
  name: 'udp-service',
  image: 'my-udp-app:latest',
  ports: ['5000:5000/udp']
});

// Load balancer configuration
class LoadBalancer {
  constructor() {
    this.docker = new DockerAdapter();
    this.backends = [];
  }

  async deployBackends(count = 3) {
    console.log(`Deploying ${count} backend instances...`);
    
    for (let i = 1; i <= count; i++) {
      const containerName = `backend-${i}`;
      const port = 3000 + i;
      
      await this.docker.runContainer({
        name: containerName,
        image: 'myapp-backend:latest',
        network: 'app-network',
        ports: [`${port}:3000`]
      });
      
      this.backends.push({
        name: containerName,
        port: port,
        internalAddress: `backend-${i}:3000`
      });
    }
    
    console.log('Backend instances deployed:', this.backends);
  }

  async deployNginxLB() {
    // Generate nginx configuration
    const upstreamConfig = this.backends
      .map(b => `    server ${b.internalAddress};`)
      .join('\n');
    
    const nginxConf = `
upstream backend_pool {
${upstreamConfig}
}

server {
    listen 80;
    location / {
        proxy_pass http://backend_pool;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}`;

    // Write config file
    await $`echo '${nginxConf}' > /tmp/nginx.conf`;
    
    // Deploy load balancer
    await this.docker.runContainer({
      name: 'load-balancer',
      image: 'nginx:alpine',
      network: 'app-network',
      ports: ['80:80'],
      volumes: ['/tmp/nginx.conf:/etc/nginx/conf.d/default.conf:ro']
    });
    
    console.log('Load balancer deployed');
  }

  async testLoadBalancing() {
    console.log('Testing load balancing...');
    
    for (let i = 0; i < 10; i++) {
      const response = await $({
        adapterOptions: {
          type: 'docker',
          image: 'curlimages/curl:latest',
          network: 'app-network'
        }
      })`curl -s http://load-balancer/health`;
      
      console.log(`Request ${i + 1}:`, response.stdout.trim());
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// Usage
const lb = new LoadBalancer();
await lb.deployBackends(3);
await lb.deployNginxLB();
await lb.testLoadBalancing();
```

## Network Isolation and Security

### Network Segmentation
Implement network segmentation for security:

```javascript
// Create isolated tiers
await docker.createNetwork('frontend-tier', {
  driver: 'bridge',
  subnet: '172.30.1.0/24'
});

await docker.createNetwork('backend-tier', {
  driver: 'bridge',
  subnet: '172.30.2.0/24'
});

await docker.createNetwork('database-tier', {
  driver: 'bridge',
  subnet: '172.30.3.0/24',
  internal: true  // No external access
});

// Deploy three-tier application
class ThreeTierApp {
  constructor() {
    this.docker = new DockerAdapter();
  }

  async deploy() {
    // Frontend (public access)
    await this.docker.runContainer({
      name: 'frontend',
      image: 'nginx:alpine',
      network: 'frontend-tier',
      ports: ['80:80', '443:443']
    });

    // API Gateway (frontend + backend networks)
    await this.docker.runContainer({
      name: 'api-gateway',
      image: 'api-gateway:latest',
      network: 'frontend-tier'
    });
    
    // Connect API gateway to backend tier
    await connectToNetwork('api-gateway', 'backend-tier');

    // Application servers (backend tier only)
    for (let i = 1; i <= 2; i++) {
      await this.docker.runContainer({
        name: `app-server-${i}`,
        image: 'myapp:latest',
        network: 'backend-tier'
      });
      
      // Connect to database tier
      await connectToNetwork(`app-server-${i}`, 'database-tier');
    }

    // Database (isolated tier)
    await this.docker.runContainer({
      name: 'database',
      image: 'postgres:15-alpine',
      network: 'database-tier',
      env: {
        POSTGRES_DB: 'myapp',
        POSTGRES_USER: 'user',
        POSTGRES_PASSWORD: 'password'
      }
    });

    console.log('Three-tier application deployed with network isolation');
  }

  async testNetworkIsolation() {
    console.log('Testing network isolation...');
    
    // Frontend should NOT reach database directly
    try {
      await $({
        adapterOptions: {
          type: 'docker',
          container: 'frontend'
        },
        timeout: 5000
      })`nc -z database 5432`;
      console.log('❌ Frontend can reach database (security issue)');
    } catch (error) {
      console.log('✅ Frontend cannot reach database (correct isolation)');
    }
    
    // App server SHOULD reach database
    try {
      await $({
        adapterOptions: {
          type: 'docker',
          container: 'app-server-1'
        }
      })`nc -z database 5432`;
      console.log('✅ App server can reach database (correct)');
    } catch (error) {
      console.log('❌ App server cannot reach database (configuration issue)');
    }
    
    // API gateway should reach both tiers
    try {
      await $({
        adapterOptions: {
          type: 'docker',
          container: 'api-gateway'
        }
      })`nc -z app-server-1 3000`;
      console.log('✅ API gateway can reach app servers (correct)');
    } catch (error) {
      console.log('❌ API gateway cannot reach app servers (configuration issue)');
    }
  }
}

const app = new ThreeTierApp();
await app.deploy();
await app.testNetworkIsolation();
```

### Firewall Rules and Access Control
Implement network access control:

```javascript
// Create network with custom iptables rules
const createSecureNetwork = async (networkName, subnet) => {
  await docker.createNetwork(networkName, {
    driver: 'bridge',
    subnet: subnet
  });
  
  // Add custom iptables rules for network isolation
  const networkInterface = await getNetworkInterface(networkName);
  
  // Block inter-container communication by default
  await $`iptables -I DOCKER-USER -i ${networkInterface} -j DROP`;
  
  // Allow specific communications
  await $`iptables -I DOCKER-USER -i ${networkInterface} -p tcp --dport 80 -j ACCEPT`;
  await $`iptables -I DOCKER-USER -i ${networkInterface} -p tcp --dport 443 -j ACCEPT`;
  
  console.log(`Secure network ${networkName} created with firewall rules`);
};

const getNetworkInterface = async (networkName) => {
  const result = await docker.executeDockerCommand([
    'network', 'inspect', networkName, '--format', '{{.Id}}'
  ], {});
  
  const networkId = result.stdout.trim().substring(0, 12);
  return `br-${networkId}`;
};

// Network monitoring
class NetworkMonitor {
  constructor() {
    this.docker = new DockerAdapter();
  }

  async monitorTraffic(networkName, duration = 60000) {
    console.log(`Monitoring traffic on ${networkName} for ${duration/1000} seconds...`);
    
    const networkInterface = await getNetworkInterface(networkName);
    
    // Start tcpdump in monitoring container
    const monitorContainer = await this.docker.runContainer({
      name: `network-monitor-${Date.now()}`,
      image: 'nicolaka/netshoot:latest',
      network: 'host',
      privileged: true,
      command: [
        'tcpdump', '-i', networkInterface, 
        '-n', '-c', '100',
        'host', '172.30.1.0/24'
      ]
    });
    
    // Stop monitoring after duration
    setTimeout(async () => {
      await this.docker.stopContainer(monitorContainer);
      console.log('Network monitoring stopped');
    }, duration);
  }

  async analyzeConnections(containerName) {
    const connections = await $({
      adapterOptions: {
        type: 'docker',
        container: containerName
      }
    })`netstat -tuln`;
    
    console.log(`Active connections in ${containerName}:`);
    console.log(connections.stdout);
    
    // Check for suspicious connections
    const suspiciousPatterns = [
      /ESTABLISHED.*:22\s/,  // SSH connections
      /ESTABLISHED.*:3389\s/, // RDP connections
      /LISTEN.*:0\.0\.0\.0/   // Listening on all interfaces
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(connections.stdout)) {
        console.warn(`⚠️  Suspicious connection pattern detected: ${pattern}`);
      }
    }
  }
}

const monitor = new NetworkMonitor();
// await monitor.monitorTraffic('app-network', 30000);
await monitor.analyzeConnections('api-gateway');
```

## Service Mesh and Advanced Networking

### Service Mesh Implementation
Implement basic service mesh patterns:

```javascript
class ServiceMesh {
  constructor() {
    this.docker = new DockerAdapter();
    this.services = new Map();
  }

  async deployService(serviceName, config) {
    const { image, replicas = 1, ports = [], env = {} } = config;
    
    console.log(`Deploying service: ${serviceName} (${replicas} replicas)`);
    
    // Create service-specific network
    const networkName = `${serviceName}-network`;
    await this.docker.createNetwork(networkName);
    
    // Deploy service replicas
    const instances = [];
    for (let i = 1; i <= replicas; i++) {
      const containerName = `${serviceName}-${i}`;
      
      await this.docker.runContainer({
        name: containerName,
        image: image,
        network: networkName,
        ports: ports,
        env: {
          ...env,
          SERVICE_NAME: serviceName,
          INSTANCE_ID: i.toString(),
          MESH_NETWORK: networkName
        },
        labels: {
          'mesh.service': serviceName,
          'mesh.instance': i.toString(),
          'mesh.version': config.version || 'latest'
        }
      });
      
      instances.push(containerName);
    }
    
    this.services.set(serviceName, {
      config,
      instances,
      network: networkName
    });
    
    console.log(`Service ${serviceName} deployed with ${replicas} instances`);
  }

  async connectServices(serviceA, serviceB) {
    const serviceAInfo = this.services.get(serviceA);
    const serviceBInfo = this.services.get(serviceB);
    
    if (!serviceAInfo || !serviceBInfo) {
      throw new Error('One or both services not found');
    }
    
    console.log(`Connecting ${serviceA} to ${serviceB}`);
    
    // Connect all instances of serviceA to serviceB network
    for (const instance of serviceAInfo.instances) {
      await connectToNetwork(instance, serviceBInfo.network, {
        alias: serviceB
      });
    }
    
    // Connect all instances of serviceB to serviceA network
    for (const instance of serviceBInfo.instances) {
      await connectToNetwork(instance, serviceAInfo.network, {
        alias: serviceA
      });
    }
    
    console.log(`Services ${serviceA} and ${serviceB} are now connected`);
  }

  async deployEnvoyProxy(serviceName) {
    const serviceInfo = this.services.get(serviceName);
    if (!serviceInfo) {
      throw new Error(`Service ${serviceName} not found`);
    }
    
    // Generate Envoy configuration
    const envoyConfig = this.generateEnvoyConfig(serviceName, serviceInfo);
    
    // Write config to temporary file
    await $`echo '${JSON.stringify(envoyConfig, null, 2)}' > /tmp/envoy-${serviceName}.json`;
    
    // Deploy Envoy proxy
    const proxyName = `${serviceName}-proxy`;
    await this.docker.runContainer({
      name: proxyName,
      image: 'envoyproxy/envoy:v1.24-latest',
      network: serviceInfo.network,
      ports: ['9901:9901'], // Admin interface
      volumes: [`/tmp/envoy-${serviceName}.json:/etc/envoy/envoy.json:ro`],
      command: ['envoy', '-c', '/etc/envoy/envoy.json']
    });
    
    console.log(`Envoy proxy deployed for service ${serviceName}`);
  }

  generateEnvoyConfig(serviceName, serviceInfo) {
    const clusters = [{
      name: serviceName,
      connect_timeout: "0.25s",
      type: "STRICT_DNS",
      lb_policy: "ROUND_ROBIN",
      load_assignment: {
        cluster_name: serviceName,
        endpoints: [{
          lb_endpoints: serviceInfo.instances.map((instance, index) => ({
            endpoint: {
              address: {
                socket_address: {
                  address: instance,
                  port_value: 8080
                }
              }
            }
          }))
        }]
      }
    }];
    
    return {
      static_resources: {
        listeners: [{
          name: "listener_0",
          address: {
            socket_address: {
              address: "0.0.0.0",
              port_value: 10000
            }
          },
          filter_chains: [{
            filters: [{
              name: "envoy.filters.network.http_connection_manager",
              typed_config: {
                "@type": "type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager",
                stat_prefix: "ingress_http",
                route_config: {
                  name: "local_route",
                  virtual_hosts: [{
                    name: "local_service",
                    domains: ["*"],
                    routes: [{
                      match: { prefix: "/" },
                      route: { cluster: serviceName }
                    }]
                  }]
                },
                http_filters: [{
                  name: "envoy.filters.http.router"
                }]
              }
            }]
          }]
        }],
        clusters: clusters
      },
      admin: {
        access_log_path: "/tmp/admin_access.log",
        address: {
          socket_address: {
            address: "0.0.0.0",
            port_value: 9901
          }
        }
      }
    };
  }

  async getServiceTopology() {
    const topology = {};
    
    for (const [serviceName, serviceInfo] of this.services) {
      const connections = [];
      
      for (const instance of serviceInfo.instances) {
        try {
          const info = await this.docker.inspectContainer(instance);
          const networks = Object.keys(info.NetworkSettings.Networks || {});
          
          for (const network of networks) {
            if (network !== serviceInfo.network) {
              // Find which service this network belongs to
              for (const [otherService, otherInfo] of this.services) {
                if (otherInfo.network === network && otherService !== serviceName) {
                  if (!connections.includes(otherService)) {
                    connections.push(otherService);
                  }
                }
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to inspect ${instance}:`, error.message);
        }
      }
      
      topology[serviceName] = {
        instances: serviceInfo.instances.length,
        connections: connections
      };
    }
    
    return topology;
  }

  async cleanup() {
    console.log('Cleaning up service mesh...');
    
    for (const [serviceName, serviceInfo] of this.services) {
      // Stop service instances
      for (const instance of serviceInfo.instances) {
        try {
          await this.docker.stopContainer(instance);
          await this.docker.removeContainer(instance, true);
        } catch (error) {
          console.warn(`Failed to cleanup ${instance}:`, error.message);
        }
      }
      
      // Stop proxy
      try {
        await this.docker.stopContainer(`${serviceName}-proxy`);
        await this.docker.removeContainer(`${serviceName}-proxy`, true);
      } catch (error) {
        // Proxy might not exist
      }
      
      // Remove network
      try {
        await this.docker.removeNetwork(serviceInfo.network);
      } catch (error) {
        console.warn(`Failed to remove network ${serviceInfo.network}:`, error.message);
      }
    }
    
    this.services.clear();
    console.log('Service mesh cleanup completed');
  }
}

// Usage
const mesh = new ServiceMesh();

// Deploy services
await mesh.deployService('user-service', {
  image: 'user-service:latest',
  replicas: 2,
  ports: ['8080:8080'],
  version: 'v1.0'
});

await mesh.deployService('order-service', {
  image: 'order-service:latest',
  replicas: 3,
  ports: ['8080:8080'],
  version: 'v1.0'
});

// Connect services
await mesh.connectServices('user-service', 'order-service');

// Deploy proxies
await mesh.deployEnvoyProxy('user-service');
await mesh.deployEnvoyProxy('order-service');

// Get topology
const topology = await mesh.getServiceTopology();
console.log('Service mesh topology:', JSON.stringify(topology, null, 2));

// Cleanup on exit
process.on('SIGINT', async () => {
  await mesh.cleanup();
  process.exit(0);
});
```

## Network Cleanup

### Remove Networks
Clean up unused networks:

```javascript
// Remove specific network
await docker.removeNetwork('temp-network');

// Clean up unused networks
const cleanupUnusedNetworks = async () => {
  console.log('Cleaning up unused networks...');
  
  try {
    const result = await docker.executeDockerCommand([
      'network', 'prune', '-f'
    ], {});
    
    console.log('Network cleanup result:', result.stdout);
  } catch (error) {
    console.error('Network cleanup failed:', error.message);
  }
};

await cleanupUnusedNetworks();

// Selective network cleanup
const cleanupNetworksByLabel = async (labelKey, labelValue = null) => {
  const networks = await docker.listNetworks();
  
  for (const network of networks) {
    try {
      const result = await docker.executeDockerCommand([
        'network', 'inspect', network
      ], {});
      
      const networkInfo = JSON.parse(result.stdout)[0];
      const labels = networkInfo.Labels || {};
      
      const shouldRemove = labelValue 
        ? labels[labelKey] === labelValue 
        : labelKey in labels;
      
      if (shouldRemove) {
        // Check if network is in use
        const containers = Object.keys(networkInfo.Containers || {});
        if (containers.length === 0) {
          console.log(`Removing unused network: ${network}`);
          await docker.removeNetwork(network);
        } else {
          console.log(`Network ${network} in use by ${containers.length} containers`);
        }
      }
    } catch (error) {
      console.warn(`Failed to cleanup network ${network}:`, error.message);
    }
  }
};

await cleanupNetworksByLabel('environment', 'test');
```

This comprehensive networking system provides all the necessary tools for container networking, from basic connectivity to advanced service mesh patterns, enabling complex distributed applications with proper network isolation and security.