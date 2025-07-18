import type { XecModule, EnvironmentTaskContext } from '../../../types/environment-types.js';

const dockerModule: XecModule = {
  name: 'docker',
  version: '1.0.0',
  description: 'Docker container management and orchestration',
  
  
  exports: {
    tasks: {
    build: {
      name: 'build',
      description: 'Build Docker images',
      
      async handler({ $, fs, log, params }: EnvironmentTaskContext) {
        const {
          tag,
          dockerfile = 'Dockerfile',
          context = '.',
          buildArgs = {},
          target,
          platform,
          noCache = false,
          push = false
        } = params;
        
        if (!tag) {
          throw new Error('Image tag is required');
        }
        
        log.info(`Building Docker image: ${tag}`);
        
        // Build command with arguments
        let command = `docker build -t ${tag}`;
        
        if (dockerfile !== 'Dockerfile') {
          command += ` -f ${dockerfile}`;
        }
        
        if (target) {
          command += ` --target ${target}`;
        }
        
        if (platform) {
          command += ` --platform ${platform}`;
        }
        
        if (noCache) {
          command += ' --no-cache';
        }
        
        // Add build arguments
        for (const [key, value] of Object.entries(buildArgs)) {
          command += ` --build-arg ${key}=${value}`;
        }
        
        command += ` ${context}`;
        
        await $`${command}`;
        
        log.info(`Docker image ${tag} built successfully`);
        
        // Push if requested
        if (push) {
          log.info(`Pushing image ${tag}...`);
          await $`docker push ${tag}`;
          log.info(`Image ${tag} pushed successfully`);
        }
        
        return { tag, pushed: push };
      }
    },
    
    run: {
      name: 'run',
      description: 'Run Docker containers',
      
      async handler({ $, log, params }: EnvironmentTaskContext) {
        const {
          image,
          name,
          command,
          detach = true,
          rm = false,
          ports = [],
          volumes = [],
          env: envVars = {},
          network,
          restart = 'no',
          memory,
          cpus,
          privileged = false,
          user
        } = params;
        
        if (!image) {
          throw new Error('Image is required');
        }
        
        log.info(`Running container from image: ${image}`);
        
        let dockerCommand = 'docker run';
        
        if (detach) {
          dockerCommand += ' -d';
        }
        
        if (rm) {
          dockerCommand += ' --rm';
        }
        
        if (name) {
          dockerCommand += ` --name ${name}`;
        }
        
        if (network) {
          dockerCommand += ` --network ${network}`;
        }
        
        if (restart !== 'no') {
          dockerCommand += ` --restart ${restart}`;
        }
        
        if (memory) {
          dockerCommand += ` --memory ${memory}`;
        }
        
        if (cpus) {
          dockerCommand += ` --cpus ${cpus}`;
        }
        
        if (privileged) {
          dockerCommand += ' --privileged';
        }
        
        if (user) {
          dockerCommand += ` --user ${user}`;
        }
        
        // Add port mappings
        for (const port of ports) {
          dockerCommand += ` -p ${port}`;
        }
        
        // Add volume mounts
        for (const volume of volumes) {
          dockerCommand += ` -v ${volume}`;
        }
        
        // Add environment variables
        for (const [key, value] of Object.entries(envVars)) {
          dockerCommand += ` -e ${key}=${value}`;
        }
        
        dockerCommand += ` ${image}`;
        
        if (command) {
          dockerCommand += ` ${command}`;
        }
        
        const result = await $`${dockerCommand}`;
        const containerId = result.stdout.trim();
        
        log.info(`Container started: ${containerId.substring(0, 12)}`);
        
        return { containerId, name };
      }
    },
    
    compose: {
      name: 'compose',
      description: 'Manage Docker Compose applications',
      
      async handler({ $, fs, yaml, log, params }: EnvironmentTaskContext) {
        const {
          action = 'up',
          file = 'docker-compose.yml',
          project,
          services = [],
          scale = {},
          env: envVars = {},
          build = false,
          forceRecreate = false,
          detach = true
        } = params;
        
        let command = 'docker compose';
        
        if (file !== 'docker-compose.yml') {
          command += ` -f ${file}`;
        }
        
        if (project) {
          command += ` -p ${project}`;
        }
        
        // Set environment variables
        const envPrefix = Object.entries(envVars)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ');
        
        if (envPrefix) {
          command = `${envPrefix} ${command}`;
        }
        
        switch (action) {
          case 'up':
            log.info('Starting Docker Compose services...');
            
            command += ' up';
            
            if (detach) {
              command += ' -d';
            }
            
            if (build) {
              command += ' --build';
            }
            
            if (forceRecreate) {
              command += ' --force-recreate';
            }
            
            // Add scale options
            for (const [service, replicas] of Object.entries(scale)) {
              command += ` --scale ${service}=${replicas}`;
            }
            
            // Add specific services
            if (services.length > 0) {
              command += ` ${services.join(' ')}`;
            }
            
            await $`${command}`;
            log.info('Docker Compose services started');
            return { success: true };
            
          case 'down':
            log.info('Stopping Docker Compose services...');
            
            command += ' down';
            
            if (params['volumes']) {
              command += ' -v';
            }
            
            if (params['removeImages']) {
              command += ' --rmi all';
            }
            
            await $`${command}`;
            log.info('Docker Compose services stopped');
            return { success: true };
            
          case 'restart':
            log.info('Restarting Docker Compose services...');
            
            command += ' restart';
            
            if (services.length > 0) {
              command += ` ${services.join(' ')}`;
            }
            
            await $`${command}`;
            log.info('Docker Compose services restarted');
            return { success: true };
            
          case 'logs':
            command += ' logs';
            
            if (params['follow']) {
              command += ' -f';
            }
            
            if (params['tail']) {
              command += ` --tail ${params['tail']}`;
            }
            
            if (services.length > 0) {
              command += ` ${services.join(' ')}`;
            }
            
            const logs = await $`${command}`;
            return logs.stdout;
            
          case 'ps':
            command += ' ps';
            
            if (params['all']) {
              command += ' -a';
            }
            
            const psResult = await $`${command}`;
            return psResult.stdout;
            
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      }
    },
    
    registry: {
      name: 'registry',
      description: 'Manage Docker registries',
      
      async handler({ $, log, params }: EnvironmentTaskContext) {
        const {
          action = 'login',
          registry,
          username,
          password,
          image,
          tag = 'latest'
        } = params;
        
        switch (action) {
          case 'login':
            if (!username || !password) {
              throw new Error('Username and password are required for login');
            }
            
            log.info(`Logging in to ${registry || 'Docker Hub'}...`);
            
            const loginCommand = registry 
              ? `echo ${password} | docker login ${registry} -u ${username} --password-stdin`
              : `echo ${password} | docker login -u ${username} --password-stdin`;
            
            await $`${loginCommand}`;
            log.info('Login successful');
            break;
            
          case 'push':
            if (!image) {
              throw new Error('Image is required for push');
            }
            
            const pushTag = `${image}:${tag}`;
            log.info(`Pushing image ${pushTag}...`);
            
            await $`docker push ${pushTag}`;
            log.info(`Image ${pushTag} pushed successfully`);
            break;
            
          case 'pull':
            if (!image) {
              throw new Error('Image is required for pull');
            }
            
            const pullTag = `${image}:${tag}`;
            log.info(`Pulling image ${pullTag}...`);
            
            await $`docker pull ${pullTag}`;
            log.info(`Image ${pullTag} pulled successfully`);
            break;
            
          case 'tag':
            const { sourceImage, targetImage } = params;
            if (!sourceImage || !targetImage) {
              throw new Error('sourceImage and targetImage are required for tagging');
            }
            
            log.info(`Tagging ${sourceImage} as ${targetImage}...`);
            await $`docker tag ${sourceImage} ${targetImage}`;
            log.info('Image tagged successfully');
            break;
            
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      }
    },
    
    network: {
      name: 'network',
      description: 'Manage Docker networks',
      
      async handler({ $, log, params }: EnvironmentTaskContext) {
        const {
          action = 'create',
          name,
          driver = 'bridge',
          subnet,
          gateway,
          ipRange,
          attachable = true
        } = params;
        
        if (!name && action !== 'list') {
          throw new Error('Network name is required');
        }
        
        switch (action) {
          case 'create':
            log.info(`Creating Docker network: ${name}`);
            
            let command = `docker network create ${name} --driver ${driver}`;
            
            if (subnet) {
              command += ` --subnet ${subnet}`;
            }
            
            if (gateway) {
              command += ` --gateway ${gateway}`;
            }
            
            if (ipRange) {
              command += ` --ip-range ${ipRange}`;
            }
            
            if (attachable && driver === 'overlay') {
              command += ' --attachable';
            }
            
            await $`${command}`;
            log.info(`Network ${name} created`);
            return { success: true };
            
          case 'remove':
            log.info(`Removing Docker network: ${name}`);
            await $`docker network rm ${name}`;
            log.info(`Network ${name} removed`);
            return { success: true };
            
          case 'connect':
            const { container, ip, alias } = params;
            if (!container) {
              throw new Error('Container is required for connect action');
            }
            
            log.info(`Connecting ${container} to network ${name}`);
            
            let connectCommand = `docker network connect ${name} ${container}`;
            
            if (ip) {
              connectCommand += ` --ip ${ip}`;
            }
            
            if (alias) {
              connectCommand += ` --alias ${alias}`;
            }
            
            await $`${connectCommand}`;
            log.info(`Container ${container} connected to network ${name}`);
            return { success: true };
            
          case 'disconnect':
            const { container: disconnectContainer } = params;
            if (!disconnectContainer) {
              throw new Error('Container is required for disconnect action');
            }
            
            log.info(`Disconnecting ${disconnectContainer} from network ${name}`);
            await $`docker network disconnect ${name} ${disconnectContainer}`;
            log.info(`Container ${disconnectContainer} disconnected from network ${name}`);
            return { success: true };
            
          case 'list':
            const result = await $`docker network ls --format json`;
            const networks = result.stdout
              .trim()
              .split('\n')
              .filter(Boolean)
              .map((line: string) => JSON.parse(line));
            return networks;
            
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      }
    },
    
    volume: {
      name: 'volume',
      description: 'Manage Docker volumes',
      
      async handler({ $, log, params }: EnvironmentTaskContext) {
        const {
          action = 'create',
          name,
          driver = 'local',
          options = {}
        } = params;
        
        if (!name && action !== 'list' && action !== 'prune') {
          throw new Error('Volume name is required');
        }
        
        switch (action) {
          case 'create':
            log.info(`Creating Docker volume: ${name}`);
            
            let command = `docker volume create ${name} --driver ${driver}`;
            
            // Add driver options
            for (const [key, value] of Object.entries(options)) {
              command += ` --opt ${key}=${value}`;
            }
            
            await $`${command}`;
            log.info(`Volume ${name} created`);
            break;
            
          case 'remove':
            log.info(`Removing Docker volume: ${name}`);
            await $`docker volume rm ${name}`;
            log.info(`Volume ${name} removed`);
            break;
            
          case 'inspect':
            const result = await $`docker volume inspect ${name}`;
            return JSON.parse(result.stdout);
            
          case 'list':
            const listResult = await $`docker volume ls --format json`;
            const volumes = listResult.stdout
              .trim()
              .split('\n')
              .filter(Boolean)
              .map((line: string) => JSON.parse(line));
            return volumes;
            
          case 'prune':
            log.info('Pruning unused Docker volumes...');
            const pruneResult = await $`docker volume prune -f`;
            log.info(pruneResult.stdout);
            break;
            
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      }
    },
    
    swarm: {
      name: 'swarm',
      description: 'Manage Docker Swarm clusters',
      
      async handler({ $, log, params }: EnvironmentTaskContext) {
        const {
          action = 'init',
          advertiseAddr,
          service,
          image,
          replicas = 1,
          ports = [],
          networks = [],
          constraints = [],
          updateParallelism = 1,
          updateDelay = '10s'
        } = params;
        
        switch (action) {
          case 'init':
            log.info('Initializing Docker Swarm...');
            
            let initCommand = 'docker swarm init';
            if (advertiseAddr) {
              initCommand += ` --advertise-addr ${advertiseAddr}`;
            }
            
            const initResult = await $`${initCommand}`;
            log.info('Swarm initialized');
            
            // Extract join token
            const tokenResult = await $`docker swarm join-token worker -q`;
            return { 
              message: 'Swarm initialized',
              workerToken: tokenResult.stdout.trim()
            };
            
          case 'join':
            const { token, managerAddr } = params;
            if (!token || !managerAddr) {
              throw new Error('token and managerAddr are required for joining swarm');
            }
            
            log.info('Joining Docker Swarm...');
            await $`docker swarm join --token ${token} ${managerAddr}`;
            log.info('Joined swarm successfully');
            return { success: true };
            
          case 'leave':
            log.info('Leaving Docker Swarm...');
            await $`docker swarm leave --force`;
            log.info('Left swarm');
            return { success: true };
            
          case 'deploy':
            if (!service || !image) {
              throw new Error('service and image are required for deployment');
            }
            
            log.info(`Deploying service ${service} to swarm...`);
            
            let deployCommand = `docker service create --name ${service} --replicas ${replicas}`;
            
            // Add port mappings
            for (const port of ports) {
              deployCommand += ` --publish ${port}`;
            }
            
            // Add networks
            for (const network of networks) {
              deployCommand += ` --network ${network}`;
            }
            
            // Add constraints
            for (const constraint of constraints) {
              deployCommand += ` --constraint '${constraint}'`;
            }
            
            // Update configuration
            deployCommand += ` --update-parallelism ${updateParallelism}`;
            deployCommand += ` --update-delay ${updateDelay}`;
            
            deployCommand += ` ${image}`;
            
            await $`${deployCommand}`;
            log.info(`Service ${service} deployed`);
            return { success: true };
            
          case 'scale':
            if (!service || replicas === undefined) {
              throw new Error('service and replicas are required for scaling');
            }
            
            log.info(`Scaling service ${service} to ${replicas} replicas...`);
            await $`docker service scale ${service}=${replicas}`;
            log.info(`Service ${service} scaled to ${replicas} replicas`);
            return { success: true };
            
          case 'update':
            if (!service || !image) {
              throw new Error('service and image are required for update');
            }
            
            log.info(`Updating service ${service}...`);
            await $`docker service update --image ${image} ${service}`;
            log.info(`Service ${service} updated`);
            return { success: true };
            
          case 'remove':
            if (!service) {
              throw new Error('service is required for removal');
            }
            
            log.info(`Removing service ${service}...`);
            await $`docker service rm ${service}`;
            log.info(`Service ${service} removed`);
            return { success: true };
            
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      }
    }
  },
  
  helpers: {
    isInstalled: async (context: EnvironmentTaskContext): Promise<boolean> => {
      const { $ } = context;
      if (!$) throw new Error('Execution engine not available');
      try {
        await $`docker --version`;
        return true;
      } catch {
        return false;
      }
    },
    
    getVersion: async (context: EnvironmentTaskContext): Promise<string | null> => {
      const { $ } = context;
      if (!$) throw new Error('Execution engine not available');
      const result = await $`docker --version`;
      const match = result.stdout.match(/Docker version ([\d.]+)/);
      return match?.[1] ?? null;
    },
    
    listContainers: async (context: EnvironmentTaskContext): Promise<any[]> => {
      const { $, params } = context;
      if (!$) throw new Error('Execution engine not available');
      const { all = false, format = 'json' } = params || {};
      const flags = all ? '-a' : '';
      
      const result = await $`docker ps ${flags} --format json`;
      return result.stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line: string) => JSON.parse(line));
    },
    
    listImages: async (context: EnvironmentTaskContext): Promise<any[]> => {
      const { $ } = context;
      if (!$) throw new Error('Execution engine not available');
      const result = await $`docker images --format json`;
      return result.stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line: string) => JSON.parse(line));
    },
    
    getContainerLogs: async (context: EnvironmentTaskContext): Promise<string> => {
      const { $, params } = context;
      if (!$) throw new Error('Execution engine not available');
      if (!params) throw new Error('Parameters required');
      const { container, tail = 100, follow = false } = params;
      if (!container) {
        throw new Error('Container name or ID is required');
      }
      
      let command = `docker logs ${container}`;
      if (tail) {
        command += ` --tail ${tail}`;
      }
      if (follow) {
        command += ' -f';
      }
      
      const result = await $`${command}`;
      return result.stdout;
    },
    
    getContainerStats: async (context: EnvironmentTaskContext): Promise<any[]> => {
      const { $, params } = context;
      if (!$) throw new Error('Execution engine not available');
      const { container } = params || {};
      const containerFlag = container || '--all';
      
      const result = await $`docker stats ${containerFlag} --no-stream --format json`;
      return result.stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line: string) => JSON.parse(line));
    },
    
    inspectContainer: async (context: EnvironmentTaskContext): Promise<any> => {
      const { $, params } = context;
      if (!$) throw new Error('Execution engine not available');
      if (!params) throw new Error('Parameters required');
      const { container } = params;
      if (!container) {
        throw new Error('Container name or ID is required');
      }
      
      const result = await $`docker inspect ${container}`;
      return JSON.parse(result.stdout);
    },
    
    execInContainer: async (context: EnvironmentTaskContext): Promise<string> => {
      const { $, params } = context;
      if (!$) throw new Error('Execution engine not available');
      if (!params) throw new Error('Parameters required');
      const { container, command, user, workdir } = params;
      if (!container || !command) {
        throw new Error('Container and command are required');
      }
      
      let execCommand = `docker exec`;
      if (user) {
        execCommand += ` -u ${user}`;
      }
      if (workdir) {
        execCommand += ` -w ${workdir}`;
      }
      execCommand += ` ${container} ${command}`;
      
      const result = await $`${execCommand}`;
      return result.stdout;
    },
    
    cleanupSystem: async (context: EnvironmentTaskContext): Promise<string> => {
      const { $, params } = context;
      if (!$) throw new Error('Execution engine not available');
      const { volumes = false, all = false } = params || {};
      
      let command = 'docker system prune -f';
      if (volumes) {
        command += ' --volumes';
      }
      if (all) {
        command += ' -a';
      }
      
      const result = await $`${command}`;
      return result.stdout;
    }
  },
  
  patterns: {
    developmentEnvironment: {
      name: 'developmentEnvironment',
      description: 'Set up a complete development environment',
      
      template: async (context: EnvironmentTaskContext): Promise<void> => {
        const { params, log } = context;
        const {
          language = 'node',
          version = 'latest',
          projectName,
          ports = { web: '3000:3000' },
          databases = [],
          additionalServices = []
        } = params;
        
        log.info(`Setting up ${language} development environment...`);
        
        // Create network
        await dockerModule.exports?.tasks?.['network']?.handler({
          ...context,
          params: {
            action: 'create',
            name: `${projectName}-network`
          }
        });
        
        // Set up databases
        for (const db of databases) {
          const dbName = `${projectName}-${db.type}`;
          await dockerModule.exports?.tasks?.['run']?.handler({
            ...context,
            params: {
              name: dbName,
              image: db.image || `${db.type}:latest`,
              network: `${projectName}-network`,
              env: db.env || {},
              volumes: [`${dbName}-data:/var/lib/${db.type}`]
            }
          });
        }
        
        // Create development container
        const devImage = `${language}:${version}`;
        await dockerModule.exports?.tasks?.['run']?.handler({
          ...context,
          params: {
            name: `${projectName}-dev`,
            image: devImage,
            network: `${projectName}-network`,
            ports: Object.values(ports),
            volumes: [`.:/workspace`],
            command: 'sleep infinity' // Keep container running
          }
        });
        
        log.info('Development environment ready');
      }
    },
    
    cicdPipeline: {
      name: 'cicdPipeline',
      description: 'Set up CI/CD pipeline with Docker',
      
      template: async (context: EnvironmentTaskContext): Promise<void> => {
        const { params, log } = context;
        const {
          gitRepo,
          branch = 'main',
          registry,
          imageName,
          runTests = true,
          deploymentTarget
        } = params;
        
        log.info('Setting up CI/CD pipeline...');
        
        // Clone repository
        await context.$`git clone ${gitRepo} /tmp/build`;
        await context.$`cd /tmp/build && git checkout ${branch}`;
        
        // Build image
        const tag = `${imageName}:${Date.now()}`;
        await dockerModule.exports?.tasks?.['build']?.handler({
          ...context,
          params: {
            tag,
            context: '/tmp/build',
            noCache: true
          }
        });
        
        // Run tests if enabled
        if (runTests) {
          log.info('Running tests...');
          await dockerModule.exports?.tasks?.['run']?.handler({
            ...context,
            params: {
              image: tag,
              rm: true,
              command: 'npm test'
            }
          });
        }
        
        // Push to registry
        if (registry) {
          await dockerModule.exports?.tasks?.['registry']?.handler({
            ...context,
            params: {
              action: 'push',
              image: `${registry}/${tag}`
            }
          });
        }
        
        // Deploy if target specified
        if (deploymentTarget) {
          log.info(`Deploying to ${deploymentTarget}...`);
          // Deployment logic here
        }
        
        log.info('CI/CD pipeline execution completed');
      }
    }
  }
  }
};

export default dockerModule;