import type { XecModule, EnvironmentTaskContext } from '../../../types/environment-types.js';

const monitoringModule: XecModule = {
  name: 'monitoring',
  version: '1.0.0',
  description: 'Monitoring, logging, and observability tools',
  
  
  exports: {
    tasks: {
    prometheus: {
      name: 'prometheus',
      description: 'Deploy and configure Prometheus',
      
      async handler({ $, fs, yaml, log, params, http }: EnvironmentTaskContext) {
        const {
          action = 'deploy',
          configFile,
          targets = [],
          rules = [],
          storage = '10Gi',
          retention = '15d',
          namespace = 'monitoring'
        } = params;
        
        switch (action) {
          case 'deploy':
            log.info('Deploying Prometheus...');
            
            // Create Prometheus configuration
            const promConfig = {
              global: {
                scrape_interval: '15s',
                evaluation_interval: '15s'
              },
              scrape_configs: [
                {
                  job_name: 'prometheus',
                  static_configs: [{
                    targets: ['localhost:9090']
                  }]
                },
                ...targets.map((target: any) => ({
                  job_name: target.name,
                  static_configs: [{
                    targets: target.endpoints
                  }],
                  ...target.config
                }))
              ],
              rule_files: rules.map((_: any, idx: number) => `/etc/prometheus/rules-${idx}.yml`)
            };
            
            // Save configuration
            const configPath = configFile || await fs.temp({ prefix: 'prometheus-', suffix: '.yml' });
            if (yaml) {
              await fs.write(configPath, yaml.stringify(promConfig));
            } else {
              throw new Error('YAML utility not available');
            }
            
            // Deploy using Docker or Kubernetes
            if (params['docker']) {
              await $`docker run -d \
                --name prometheus \
                -p 9090:9090 \
                -v ${configPath}:/etc/prometheus/prometheus.yml \
                -v prometheus-data:/prometheus \
                prom/prometheus \
                --config.file=/etc/prometheus/prometheus.yml \
                --storage.tsdb.path=/prometheus \
                --storage.tsdb.retention.time=${retention}`;
            } else {
              // Kubernetes deployment
              const k8sManifest = {
                apiVersion: 'v1',
                kind: 'ConfigMap',
                metadata: {
                  name: 'prometheus-config',
                  namespace
                },
                data: {
                  'prometheus.yml': yaml ? yaml.stringify(promConfig) : ''
                }
              };
              
              const manifestPath = await fs.temp({ prefix: 'prom-k8s-', suffix: '.yaml' });
              if (yaml) {
                await fs.write(manifestPath, yaml.stringify(k8sManifest));
                await $`kubectl apply -f ${manifestPath}`;
              } else {
                throw new Error('YAML utility not available');
              }
              
              // Deploy Prometheus
              await $`kubectl apply -n ${namespace} -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      containers:
      - name: prometheus
        image: prom/prometheus:latest
        args:
          - --config.file=/etc/prometheus/prometheus.yml
          - --storage.tsdb.path=/prometheus
          - --storage.tsdb.retention.time=${retention}
        ports:
        - containerPort: 9090
        volumeMounts:
        - name: config
          mountPath: /etc/prometheus
        - name: storage
          mountPath: /prometheus
      volumes:
      - name: config
        configMap:
          name: prometheus-config
      - name: storage
        persistentVolumeClaim:
          claimName: prometheus-storage
EOF`;
            }
            
            log.info('Prometheus deployed successfully');
            break;
            
          case 'reload':
            log.info('Reloading Prometheus configuration...');
            if (params['docker']) {
              await $`docker exec prometheus kill -HUP 1`;
            } else {
              await $`kubectl exec -n ${namespace} deployment/prometheus -- kill -HUP 1`;
            }
            log.info('Prometheus configuration reloaded');
            break;
            
          case 'query':
            const { query, time } = params;
            if (!query) {
              throw new Error('Query is required');
            }
            
            const endpoint = params['endpoint'] || 'http://localhost:9090';
            const queryParams = new URLSearchParams({ query });
            if (time) {
              queryParams.append('time', time);
            }
            
            if (!http) throw new Error('HTTP client not available');
            const result = await http.get(
              `${endpoint}/api/v1/query?${queryParams}`
            );
            
            return result.json();
            
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      }
    },
    
    grafana: {
      name: 'grafana',
      description: 'Deploy and configure Grafana',
      
      async handler({ $, fs, json, log, params, http, yaml }: EnvironmentTaskContext) {
        const {
          action = 'deploy',
          adminPassword = 'admin',
          datasources = [],
          dashboards = [],
          plugins = [],
          port = 3000,
          namespace = 'monitoring'
        } = params;
        
        switch (action) {
          case 'deploy':
            log.info('Deploying Grafana...');
            
            // Prepare datasources configuration
            const datasourcesConfig = {
              apiVersion: 1,
              datasources: datasources.map((ds: any) => ({
                name: ds.name,
                type: ds.type || 'prometheus',
                access: 'proxy',
                url: ds.url,
                isDefault: ds.default || false,
                ...ds.config
              }))
            };
            
            // Deploy using Docker or Kubernetes
            if (params['docker']) {
              // Create datasources file
              const dsPath = await fs.temp({ prefix: 'grafana-ds-', suffix: '.yaml' });
              if (yaml) {
                await fs.write(dsPath, yaml.stringify(datasourcesConfig));
              } else {
                throw new Error('YAML utility not available');
              }
              
              let dockerCommand = `docker run -d \
                --name grafana \
                -p ${port}:3000 \
                -e GF_SECURITY_ADMIN_PASSWORD=${adminPassword} \
                -v ${dsPath}:/etc/grafana/provisioning/datasources/datasources.yaml \
                -v grafana-data:/var/lib/grafana`;
              
              // Add plugins
              if (plugins.length > 0) {
                dockerCommand += ` -e GF_INSTALL_PLUGINS=${plugins.join(',')}`;
              }
              
              dockerCommand += ' grafana/grafana';
              
              await $`${dockerCommand}`;
            } else {
              // Kubernetes deployment
              const configMap = {
                apiVersion: 'v1',
                kind: 'ConfigMap',
                metadata: {
                  name: 'grafana-datasources',
                  namespace
                },
                data: {
                  'datasources.yaml': yaml ? yaml.stringify(datasourcesConfig) : ''
                }
              };
              
              const configPath = await fs.temp({ prefix: 'grafana-cm-', suffix: '.yaml' });
              if (yaml) {
                await fs.write(configPath, yaml.stringify(configMap));
                await $`kubectl apply -f ${configPath}`;
              } else {
                throw new Error('YAML utility not available');
              }
              
              // Deploy Grafana
              await $`kubectl apply -n ${namespace} -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grafana
spec:
  replicas: 1
  selector:
    matchLabels:
      app: grafana
  template:
    metadata:
      labels:
        app: grafana
    spec:
      containers:
      - name: grafana
        image: grafana/grafana:latest
        env:
        - name: GF_SECURITY_ADMIN_PASSWORD
          value: "${adminPassword}"
        ${plugins.length > 0 ? `- name: GF_INSTALL_PLUGINS
          value: "${plugins.join(',')}"` : ''}
        ports:
        - containerPort: 3000
        volumeMounts:
        - name: datasources
          mountPath: /etc/grafana/provisioning/datasources
        - name: storage
          mountPath: /var/lib/grafana
      volumes:
      - name: datasources
        configMap:
          name: grafana-datasources
      - name: storage
        persistentVolumeClaim:
          claimName: grafana-storage
EOF`;
            }
            
            log.info('Grafana deployed successfully');
            break;
            
          case 'import-dashboard':
            const { dashboardId, dashboardJson, folder = 'General' } = params;
            
            if (!dashboardId && !dashboardJson) {
              throw new Error('Either dashboardId or dashboardJson is required');
            }
            
            const grafanaUrl = params['url'] || 'http://localhost:3000';
            const apiKey = params['apiKey'];
            
            let dashboardData;
            if (dashboardId) {
              // Fetch from Grafana.com
              if (!http) throw new Error('HTTP client not available');
              const response = await http.get(
                `https://grafana.com/api/dashboards/${dashboardId}`
              );
              dashboardData = response.json().json;
            } else {
              dashboardData = typeof dashboardJson === 'string' 
                ? JSON.parse(dashboardJson) 
                : dashboardJson;
            }
            
            // Import dashboard
            const importPayload = {
              dashboard: dashboardData,
              folderId: 0,
              overwrite: true
            };
            
            const headers: Record<string, string> = {
              'Content-Type': 'application/json'
            };
            
            if (apiKey) {
              headers['Authorization'] = `Bearer ${apiKey}`;
            } else {
              headers['Authorization'] = `Basic ${Buffer.from(`admin:${adminPassword}`).toString('base64')}`;
            }
            
            if (!http) throw new Error('HTTP client not available');
            await http.post(
              `${grafanaUrl}/api/dashboards/import`,
              importPayload,
              { headers }
            );
            
            log.info('Dashboard imported successfully');
            break;
            
          case 'create-alert':
            const { 
              name: alertName,
              datasourceUid,
              condition,
              frequency = '1m',
              forDuration = '5m'
            } = params;
            
            if (!alertName || !datasourceUid || !condition) {
              throw new Error('name, datasourceUid, and condition are required');
            }
            
            const alertRule = {
              uid: `alert-${Date.now()}`,
              title: alertName,
              condition: 'A',
              data: [{
                refId: 'A',
                queryType: '',
                model: {
                  expr: condition,
                  refId: 'A',
                  datasource: {
                    uid: datasourceUid
                  }
                }
              }],
              noDataState: 'NoData',
              execErrState: 'Alerting',
              for: forDuration,
              annotations: {
                description: params['description'] || ''
              },
              labels: params['labels'] || {}
            };
            
            // Create alert via API
            const alertUrl = params['url'] || 'http://localhost:3000';
            if (!http) throw new Error('HTTP client not available');
            await http.post(
              `${alertUrl}/api/v1/provisioning/alert-rules`,
              alertRule,
              { 
                headers: {
                  'Authorization': `Basic ${Buffer.from(`admin:${adminPassword}`).toString('base64')}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            log.info(`Alert rule '${alertName}' created`);
            break;
            
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      }
    },
    
    elasticsearch: {
      name: 'elasticsearch',
      description: 'Deploy and manage Elasticsearch',
      
      async handler({ $, log, params, http }: EnvironmentTaskContext) {
        const {
          action = 'deploy',
          version = '8.11.0',
          nodes = 1,
          memory = '2g',
          storage = '20Gi',
          namespace = 'monitoring'
        } = params;
        
        switch (action) {
          case 'deploy':
            log.info('Deploying Elasticsearch...');
            
            if (params['docker']) {
              // Docker deployment
              await $`docker run -d \
                --name elasticsearch \
                -p 9200:9200 \
                -p 9300:9300 \
                -e "discovery.type=single-node" \
                -e "ES_JAVA_OPTS=-Xms${memory} -Xmx${memory}" \
                -v elasticsearch-data:/usr/share/elasticsearch/data \
                docker.elastic.co/elasticsearch/elasticsearch:${version}`;
            } else {
              // Kubernetes deployment using ECK
              await $`kubectl apply -f https://download.elastic.co/downloads/eck/2.9.0/crds.yaml`;
              await $`kubectl apply -f https://download.elastic.co/downloads/eck/2.9.0/operator.yaml`;
              
              // Deploy Elasticsearch cluster
              await $`kubectl apply -n ${namespace} -f - <<EOF
apiVersion: elasticsearch.k8s.elastic.co/v1
kind: Elasticsearch
metadata:
  name: elasticsearch
spec:
  version: ${version}
  nodeSets:
  - name: default
    count: ${nodes}
    config:
      node.store.allow_mmap: false
    podTemplate:
      spec:
        containers:
        - name: elasticsearch
          resources:
            requests:
              memory: ${memory}
              cpu: 1
            limits:
              memory: ${memory}
    volumeClaimTemplates:
    - metadata:
        name: elasticsearch-data
      spec:
        accessModes:
        - ReadWriteOnce
        resources:
          requests:
            storage: ${storage}
EOF`;
            }
            
            log.info('Elasticsearch deployed');
            break;
            
          case 'create-index':
            const { indexName, mappings, settings } = params;
            if (!indexName) {
              throw new Error('Index name is required');
            }
            
            const esUrl = params['url'] || 'http://localhost:9200';
            const indexConfig = {
              settings: settings || {
                number_of_shards: 1,
                number_of_replicas: 0
              },
              mappings: mappings || {}
            };
            
            if (!http) throw new Error('HTTP client not available');
            await http.put(
              `${esUrl}/${indexName}`,
              indexConfig,
              { headers: { 'Content-Type': 'application/json' } }
            );
            
            log.info(`Index '${indexName}' created`);
            break;
            
          case 'ingest':
            const { index, documents } = params;
            if (!index || !documents) {
              throw new Error('Index and documents are required');
            }
            
            const bulkUrl = params['url'] || 'http://localhost:9200';
            const bulkBody = documents.flatMap((doc: any) => [
              { index: { _index: index } },
              doc
            ]);
            
            if (!http) throw new Error('HTTP client not available');
            await http.post(
              `${bulkUrl}/_bulk`,
              bulkBody.map((item: any) => JSON.stringify(item)).join('\n') + '\n',
              { headers: { 'Content-Type': 'application/x-ndjson' } }
            );
            
            log.info(`Ingested ${documents.length} documents`);
            break;
            
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      }
    },
    
    loki: {
      name: 'loki',
      description: 'Deploy and configure Loki for log aggregation',
      
      async handler({ $, fs, yaml, log, params }: EnvironmentTaskContext) {
        const {
          action = 'deploy',
          storage = 's3',
          retention = '720h',
          namespace = 'monitoring'
        } = params;
        
        switch (action) {
          case 'deploy':
            log.info('Deploying Loki...');
            
            // Loki configuration
            const lokiConfig = {
              auth_enabled: false,
              server: {
                http_listen_port: 3100,
                grpc_listen_port: 9096
              },
              common: {
                path_prefix: '/loki',
                storage: {
                  filesystem: {
                    chunks_directory: '/loki/chunks',
                    rules_directory: '/loki/rules'
                  }
                },
                replication_factor: 1,
                ring: {
                  instance_addr: '127.0.0.1',
                  kvstore: {
                    store: 'inmemory'
                  }
                }
              },
              schema_config: {
                configs: [{
                  from: '2020-10-24',
                  store: 'boltdb-shipper',
                  object_store: storage,
                  schema: 'v11',
                  index: {
                    prefix: 'index_',
                    period: '24h'
                  }
                }]
              },
              ruler: {
                alertmanager_url: 'http://alertmanager:9093'
              },
              limits_config: {
                retention_period: retention
              }
            };
            
            if (params['docker']) {
              // Save config
              const configPath = await fs.temp({ prefix: 'loki-', suffix: '.yaml' });
              if (yaml) {
                await fs.write(configPath, yaml.stringify(lokiConfig));
              } else {
                throw new Error('YAML utility not available');
              }
              
              await $`docker run -d \
                --name loki \
                -p 3100:3100 \
                -v ${configPath}:/etc/loki/local-config.yaml \
                -v loki-data:/loki \
                grafana/loki:latest`;
            } else {
              // Kubernetes deployment
              const configMap = {
                apiVersion: 'v1',
                kind: 'ConfigMap',
                metadata: {
                  name: 'loki-config',
                  namespace
                },
                data: {
                  'loki.yaml': yaml ? yaml.stringify(lokiConfig) : ''
                }
              };
              
              const configMapPath = await fs.temp({ prefix: 'loki-cm-', suffix: '.yaml' });
              if (yaml) {
                await fs.write(configMapPath, yaml.stringify(configMap));
                await $`kubectl apply -f ${configMapPath}`;
              } else {
                throw new Error('YAML utility not available');
              }
              
              // Deploy Loki
              await $`kubectl apply -n ${namespace} -f - <<EOF
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: loki
spec:
  serviceName: loki
  replicas: 1
  selector:
    matchLabels:
      app: loki
  template:
    metadata:
      labels:
        app: loki
    spec:
      containers:
      - name: loki
        image: grafana/loki:latest
        args:
        - -config.file=/etc/loki/loki.yaml
        ports:
        - containerPort: 3100
        volumeMounts:
        - name: config
          mountPath: /etc/loki
        - name: storage
          mountPath: /loki
      volumes:
      - name: config
        configMap:
          name: loki-config
  volumeClaimTemplates:
  - metadata:
      name: storage
    spec:
      accessModes: [ "ReadWriteOnce" ]
      resources:
        requests:
          storage: 10Gi
EOF`;
            }
            
            log.info('Loki deployed successfully');
            break;
            
          case 'configure-promtail':
            const { targets: logTargets = [] } = params;
            
            const promtailConfig = {
              server: {
                http_listen_port: 9080,
                grpc_listen_port: 0
              },
              positions: {
                filename: '/tmp/positions.yaml'
              },
              clients: [{
                url: params['lokiUrl'] || 'http://loki:3100/loki/api/v1/push'
              }],
              scrape_configs: logTargets.map((target: any) => ({
                job_name: target.name,
                static_configs: [{
                  targets: ['localhost'],
                  labels: {
                    job: target.name,
                    __path__: target.path
                  }
                }]
              }))
            };
            
            // Save Promtail config
            const promtailPath = await fs.temp({ prefix: 'promtail-', suffix: '.yaml' });
            if (yaml) {
              await fs.write(promtailPath, yaml.stringify(promtailConfig));
            } else {
              throw new Error('YAML utility not available');
            }
            
            if (params['docker']) {
              await $`docker run -d \
                --name promtail \
                -v ${promtailPath}:/etc/promtail/config.yml \
                -v /var/log:/var/log:ro \
                grafana/promtail:latest \
                -config.file=/etc/promtail/config.yml`;
            }
            
            log.info('Promtail configured');
            break;
            
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      }
    },
    
    alerts: {
      name: 'alerts',
      description: 'Configure alerting rules and notifications',
      
      async handler({ $, fs, yaml, log, params }: EnvironmentTaskContext) {
        const {
          action = 'create',
          alertmanager = true,
          rules = [],
          receivers = [],
          namespace = 'monitoring'
        } = params;
        
        switch (action) {
          case 'deploy-alertmanager':
            log.info('Deploying Alertmanager...');
            
            // Alertmanager configuration
            const alertmanagerConfig = {
              global: {
                resolve_timeout: '5m'
              },
              route: {
                group_by: ['alertname', 'cluster', 'service'],
                group_wait: '10s',
                group_interval: '10s',
                repeat_interval: '12h',
                receiver: 'default'
              },
              receivers: [
                {
                  name: 'default',
                  webhook_configs: []
                },
                ...receivers
              ]
            };
            
            if (params['docker']) {
              const configPath = await fs.temp({ prefix: 'alertmanager-', suffix: '.yml' });
              if (yaml) {
                await fs.write(configPath, yaml.stringify(alertmanagerConfig));
              } else {
                throw new Error('YAML utility not available');
              }
              
              await $`docker run -d \
                --name alertmanager \
                -p 9093:9093 \
                -v ${configPath}:/etc/alertmanager/alertmanager.yml \
                prom/alertmanager`;
            } else {
              // Kubernetes deployment
              const configMap = {
                apiVersion: 'v1',
                kind: 'ConfigMap',
                metadata: {
                  name: 'alertmanager-config',
                  namespace
                },
                data: {
                  'alertmanager.yml': yaml ? yaml.stringify(alertmanagerConfig) : ''
                }
              };
              
              const configMapPath = await fs.temp({ prefix: 'am-cm-', suffix: '.yaml' });
              if (yaml) {
                await fs.write(configMapPath, yaml.stringify(configMap));
                await $`kubectl apply -f ${configMapPath}`;
              } else {
                throw new Error('YAML utility not available');
              }
              
              await $`kubectl apply -n ${namespace} -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: alertmanager
spec:
  replicas: 1
  selector:
    matchLabels:
      app: alertmanager
  template:
    metadata:
      labels:
        app: alertmanager
    spec:
      containers:
      - name: alertmanager
        image: prom/alertmanager:latest
        ports:
        - containerPort: 9093
        volumeMounts:
        - name: config
          mountPath: /etc/alertmanager
      volumes:
      - name: config
        configMap:
          name: alertmanager-config
EOF`;
            }
            
            log.info('Alertmanager deployed');
            break;
            
          case 'create-rules':
            if (rules.length === 0) {
              throw new Error('At least one rule is required');
            }
            
            const rulesConfig = {
              groups: [{
                name: 'custom_rules',
                interval: '30s',
                rules: rules.map((rule: any) => ({
                  alert: rule.name,
                  expr: rule.expression,
                  for: rule.duration || '5m',
                  labels: rule.labels || {},
                  annotations: {
                    summary: rule.summary || '',
                    description: rule.description || ''
                  }
                }))
              }]
            };
            
            // Save rules file
            const rulesPath = params['outputPath'] || await fs.temp({ prefix: 'prom-rules-', suffix: '.yml' });
            if (yaml) {
              await fs.write(rulesPath, yaml.stringify(rulesConfig));
            } else {
              throw new Error('YAML utility not available');
            }
            
            log.info(`Alert rules saved to ${rulesPath}`);
            
            // Reload Prometheus if specified
            if (params['reloadPrometheus']) {
              // Use the Bash tool to reload Prometheus
              if (params['docker']) {
                await $`docker exec prometheus kill -HUP 1`;
              } else {
                await $`kubectl exec -n ${namespace} deployment/prometheus -- kill -HUP 1`;
              }
            }
            break;
            
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      }
    }
  },
  
  helpers: {
    checkHealth: async (context) => {
      const { $, params, http } = context;
      const services = params?.['services'] || ['prometheus', 'grafana', 'loki'];
      const health: Record<string, boolean> = {};
      
      if (!http) {
        throw new Error('HTTP client not available');
      }
      
      for (const service of services) {
        try {
          switch (service) {
            case 'prometheus':
              await http.get('http://localhost:9090/-/healthy');
              health[service] = true;
              break;
            case 'grafana':
              await http.get('http://localhost:3000/api/health');
              health[service] = true;
              break;
            case 'loki':
              await http.get('http://localhost:3100/ready');
              health[service] = true;
              break;
            case 'elasticsearch':
              await http.get('http://localhost:9200/_cluster/health');
              health[service] = true;
              break;
            default:
              health[service] = false;
          }
        } catch {
          health[service] = false;
        }
      }
      
      return health;
    },
    
    queryMetrics: async (context) => {
      const { params, http } = context;
      const { query, start, end, step = '15s' } = params || {};
      if (!query) {
        throw new Error('Query is required');
      }
      
      if (!http) {
        throw new Error('HTTP client not available');
      }
      
      const endpoint = params?.['endpoint'] || 'http://localhost:9090';
      const queryParams = new URLSearchParams({
        query,
        start: start || `${Date.now() - 3600000}`,
        end: end || `${Date.now()}`,
        step
      });
      
      const result = await http.get(
        `${endpoint}/api/v1/query_range?${queryParams}`
      );
      
      return result.json();
    },
    
    searchLogs: async (context) => {
      const { params, http } = context;
      const { 
        query = '{}',
        start = `${Date.now() - 3600000}000000`,
        end = `${Date.now()}000000`,
        limit = 100
      } = params || {};
      
      if (!http) {
        throw new Error('HTTP client not available');
      }
      
      const endpoint = params?.['endpoint'] || 'http://localhost:3100';
      const queryParams = new URLSearchParams({
        query,
        start,
        end,
        limit: String(limit)
      });
      
      const result = await http.get(
        `${endpoint}/loki/api/v1/query_range?${queryParams}`
      );
      
      return result.json();
    },
    
    createDashboard: async (context) => {
      const { params } = context;
      const { title, panels = [], datasource = 'Prometheus' } = params || {};
      
      const dashboard = {
        dashboard: {
          title,
          panels: panels.map((panel: any, idx: number) => ({
            id: idx + 1,
            title: panel.title,
            type: panel.type || 'graph',
            datasource,
            targets: [{
              expr: panel.query,
              refId: 'A'
            }],
            gridPos: {
              x: (idx % 2) * 12,
              y: Math.floor(idx / 2) * 8,
              w: 12,
              h: 8
            }
          })),
          schemaVersion: 16,
          version: 0
        },
        overwrite: true
      };
      
      return dashboard;
    }
  },
  
  patterns: {
    fullStackMonitoring: {
      name: 'fullStackMonitoring',
      description: 'Deploy complete monitoring stack',
      
      template: async (context: EnvironmentTaskContext) => {
        const { params, log } = context;
        const {
          includeLogging = true,
          includeTracing = false,
          includeAlerts = true,
          namespace = 'monitoring'
        } = params;
        
        log.info('Deploying full monitoring stack...');
        
        // Deploy Prometheus
        await monitoringModule.exports?.tasks?.['prometheus']?.handler({
          ...context,
          params: {
            action: 'deploy',
            namespace,
            targets: [
              {
                name: 'kubernetes-pods',
                endpoints: ['kubernetes.default.svc:443'],
                config: {
                  scheme: 'https',
                  tls_config: {
                    ca_file: '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'
                  },
                  bearer_token_file: '/var/run/secrets/kubernetes.io/serviceaccount/token'
                }
              }
            ]
          }
        });
        
        // Deploy Grafana
        await monitoringModule.exports?.tasks?.['grafana']?.handler({
          ...context,
          params: {
            action: 'deploy',
            namespace,
            datasources: [{
              name: 'Prometheus',
              type: 'prometheus',
              url: 'http://prometheus:9090'
            }],
            plugins: ['grafana-piechart-panel', 'grafana-worldmap-panel']
          }
        });
        
        // Deploy Loki for logging
        if (includeLogging) {
          await monitoringModule.exports?.tasks?.['loki']?.handler({
            ...context,
            params: {
              action: 'deploy',
              namespace
            }
          });
          
          // Add Loki as Grafana datasource
          await monitoringModule.exports?.tasks?.['grafana']?.handler({
            ...context,
            params: {
              action: 'import-dashboard',
              dashboardJson: {
                title: 'Logs Dashboard',
                panels: [{
                  title: 'Application Logs',
                  type: 'logs',
                  datasource: 'Loki',
                  targets: [{
                    expr: '{job="application"}'
                  }]
                }]
              }
            }
          });
        }
        
        // Set up alerting
        if (includeAlerts) {
          await monitoringModule.exports?.tasks?.['alerts']?.handler({
            ...context,
            params: {
              action: 'deploy-alertmanager',
              namespace,
              receivers: [{
                name: 'team-alerts',
                webhook_configs: [{
                  url: params['alertWebhook'] || 'http://localhost:8080/alerts'
                }]
              }]
            }
          });
          
          // Create basic alert rules
          await monitoringModule.exports?.tasks?.['alerts']?.handler({
            ...context,
            params: {
              action: 'create-rules',
              rules: [
                {
                  name: 'HighCPUUsage',
                  expression: 'rate(process_cpu_seconds_total[5m]) > 0.8',
                  duration: '5m',
                  summary: 'High CPU usage detected'
                },
                {
                  name: 'HighMemoryUsage',
                  expression: 'process_resident_memory_bytes / 1024 / 1024 / 1024 > 2',
                  duration: '5m',
                  summary: 'High memory usage detected'
                }
              ]
            }
          });
        }
        
        log.info('Full monitoring stack deployed');
      }
    },
    
    applicationAPM: {
      name: 'applicationAPM',
      description: 'Set up Application Performance Monitoring',
      
      template: async (context: EnvironmentTaskContext) => {
        const { params, log } = context;
        const {
          appName,
          language = 'node',
          framework,
          endpoints = []
        } = params;
        
        log.info(`Setting up APM for ${appName}...`);
        
        // Deploy APM server (using Elastic APM as example)
        const { $ } = context;
        if (!$) throw new Error('Execution engine not available');
        await $`docker run -d \
          --name apm-server \
          -p 8200:8200 \
          -e ELASTIC_APM_SECRET_TOKEN=${params['apmToken'] || 'secret'} \
          docker.elastic.co/apm/apm-server:8.11.0`;
        
        // Generate APM configuration for the application
        const apmConfig = {
          serviceName: appName,
          serverUrl: 'http://localhost:8200',
          environment: params['environment'] || 'production',
          transactionSampleRate: 1.0,
          captureBody: 'all',
          captureHeaders: true
        };
        
        // Create custom dashboard for the application
        const createDashboardHelper = monitoringModule.exports?.helpers?.['createDashboard'];
        const dashboard = createDashboardHelper ? await createDashboardHelper({
          ...context,
          params: {
            title: `${appName} Performance`,
            panels: [
              {
                title: 'Response Time',
                query: `histogram_quantile(0.95, http_request_duration_seconds_bucket{service="${appName}"})`
              },
              {
                title: 'Request Rate',
                query: `rate(http_requests_total{service="${appName}"}[5m])`
              },
              {
                title: 'Error Rate',
                query: `rate(http_requests_total{service="${appName}",status=~"5.."}[5m])`
              },
              {
                title: 'Active Connections',
                query: `http_connections_active{service="${appName}"}`
              }
            ]
          }
        }) : null;
        
        // Import dashboard to Grafana
        if (dashboard) {
          await monitoringModule.exports?.tasks?.['grafana']?.handler({
            ...context,
            params: {
              action: 'import-dashboard',
              dashboardJson: dashboard.dashboard
            }
          });
        }
        
        // Set up synthetic monitoring for endpoints
        for (const endpoint of endpoints) {
          await monitoringModule.exports?.tasks?.['prometheus']?.handler({
            ...context,
            params: {
              action: 'query',
              query: `probe_success{instance="${endpoint.url}"}`
            }
          });
        }
        
        log.info('APM setup completed');
        
        return { apmConfig, dashboard: `${appName} Performance` };
      }
    }
  }
  }
};

export default monitoringModule;