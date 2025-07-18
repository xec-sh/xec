import type { XecModule } from '../src/modules/environment-types.js';

// Example Nginx module in new format
const nginxModule: XecModule = {
  name: 'nginx',
  version: '1.0.0',
  description: 'Nginx web server management',
  
  tasks: {
    install: {
      name: 'install',
      description: 'Install Nginx',
      
      async run({ $, env, log }) {
        log.info('Installing Nginx...');
        
        // Automatic adaptation based on environment
        if (env.platform.os === 'darwin') {
          await $`brew install nginx`;
        } else if (env.platform.distro === 'ubuntu' || env.platform.distro === 'debian') {
          await $`apt-get update && apt-get install -y nginx`;
        } else if (env.platform.distro === 'centos' || env.platform.distro === 'rhel') {
          await $`yum install -y nginx`;
        } else if (env.type === 'docker') {
          // In Docker, might need to handle differently
          await $`apt-get update && apt-get install -y nginx`;
        } else {
          throw new Error(`Unsupported platform: ${env.platform.os} ${env.platform.distro}`);
        }
        
        log.info('Nginx installed successfully');
      }
    },
    
    start: {
      name: 'start',
      description: 'Start Nginx service',
      
      async run({ $, env, svc, log }) {
        log.info('Starting Nginx...');
        
        if (svc && env.capabilities.systemd) {
          await svc.start('nginx');
        } else if (env.platform.os === 'darwin') {
          await $`brew services start nginx`;
        } else {
          await $`nginx`;
        }
        
        log.info('Nginx started');
      }
    },
    
    stop: {
      name: 'stop',
      description: 'Stop Nginx service',
      
      async run({ $, env, svc, log }) {
        log.info('Stopping Nginx...');
        
        if (svc && env.capabilities.systemd) {
          await svc.stop('nginx');
        } else if (env.platform.os === 'darwin') {
          await $`brew services stop nginx`;
        } else {
          await $`nginx -s stop`;
        }
        
        log.info('Nginx stopped');
      }
    },
    
    configure: {
      name: 'configure',
      description: 'Configure Nginx with a template',
      
      async run({ $, fs, template, params, log }) {
        log.info('Configuring Nginx...');
        
        const configTemplate = `
server {
    listen 80;
    server_name \${server_name};
    
    location / {
        proxy_pass \${proxy_pass};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}`;
        
        const config = await template.render(configTemplate, params);
        const siteName = params.server_name || 'default';
        
        await fs.write(`/etc/nginx/sites-available/${siteName}`, config);
        await $`ln -sf /etc/nginx/sites-available/${siteName} /etc/nginx/sites-enabled/`;
        
        // Test configuration
        await $`nginx -t`;
        
        // Reload Nginx
        await $`nginx -s reload`;
        
        log.info('Nginx configured successfully');
      }
    },
    
    status: {
      name: 'status',
      description: 'Check Nginx status',
      
      async run({ $, svc, env, log }) {
        try {
          if (svc && env.capabilities.systemd) {
            const status = await svc.status('nginx');
            log.info(`Nginx is ${status.running ? 'running' : 'stopped'}`);
            return status;
          } else {
            // Check if nginx process is running
            await $`pgrep nginx`;
            log.info('Nginx is running');
            return { running: true };
          }
        } catch {
          log.info('Nginx is not running');
          return { running: false };
        }
      }
    }
  },
  
  helpers: {
    isInstalled: async ({ $ }) => {
      try {
        await $`which nginx`;
        return true;
      } catch {
        return false;
      }
    },
    
    getVersion: async ({ $ }) => {
      try {
        const result = await $`nginx -v 2>&1`;
        const match = result.match(/nginx\/([\d.]+)/);
        return match ? match[1] : null;
      } catch {
        return null;
      }
    },
    
    getConfig: async ({ fs }) => {
      try {
        return await fs.read('/etc/nginx/nginx.conf');
      } catch {
        return null;
      }
    }
  },
  
  patterns: {
    reverseProxy: {
      name: 'reverseProxy',
      description: 'Setup Nginx as reverse proxy',
      
      template: async ({ params, log }) => {
        // Run install task
        await nginxModule.tasks!.install.run(arguments[0]);
        
        // Configure
        await nginxModule.tasks!.configure.run({
          ...arguments[0],
          params: {
            server_name: params.domain,
            proxy_pass: params.upstream || 'http://localhost:3000'
          }
        });
        
        // Start service
        await nginxModule.tasks!.start.run(arguments[0]);
        
        log.info(`Nginx reverse proxy setup for ${params.domain}`);
      }
    }
  }
};

export default nginxModule;