---
title: Log Aggregation
description: Aggregate and analyze logs from multiple sources using Xec
keywords: [logs, aggregation, monitoring, elk, fluentd, loki]
source_files:
  - packages/core/src/adapters/ssh-adapter.ts
  - packages/core/src/adapters/docker-adapter.ts
  - packages/core/src/adapters/k8s-adapter.ts
  - apps/xec/src/commands/logs.ts
key_functions:
  - LogsCommand.execute()
  - SSHAdapter.streamLogs()
  - DockerAdapter.logs()
  - K8sAdapter.logs()
verification_date: 2025-01-03
---

# Log Aggregation

## Problem

Collecting, aggregating, and analyzing logs from multiple sources including servers, containers, and Kubernetes pods, while maintaining centralized visibility and enabling efficient troubleshooting.

## Solution

Xec provides unified log management across all execution targets, with built-in support for streaming, filtering, and forwarding logs to centralized logging systems.

## Quick Example

```typescript
// aggregate-logs.ts
import { $ } from '@xec-sh/core';

// Stream logs from multiple sources
await Promise.all([
  $.ssh('web-1')`tail -f /var/log/nginx/access.log`,
  $.docker('app-container')`logs --follow`,
  $.k8s('pod/api-server')`logs --follow`
]);
```

## Complete Log Aggregation Recipes

### Configuration

```yaml
# .xec/config.yaml
targets:
  web-servers:
    - web-1
    - web-2
    - web-3
    
  app-containers:
    - app-1
    - app-2
    
  k8s-pods:
    - namespace: production
      selector: app=myapp

tasks:
  logs:
    description: Aggregate logs from all sources
    command: xec run scripts/aggregate-logs.ts
    
  setup-logging:
    description: Setup centralized logging
    command: xec run scripts/setup-logging.ts
```

### Multi-Source Log Aggregation

```typescript
// scripts/aggregate-logs.ts
import { $, $$ } from '@xec-sh/core';
import chalk from 'chalk';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';

const sources = process.argv[2] || 'all';
const outputFile = process.argv[3] || `/tmp/logs-${Date.now()}.log`;

console.log(chalk.blue('📊 Starting log aggregation...'));

// Log source configurations
const logSources = {
  nginx: {
    targets: ['web-1', 'web-2', 'web-3'],
    logPath: '/var/log/nginx/access.log',
    pattern: /(\d+\.\d+\.\d+\.\d+).*?"(.*?)".*?(\d{3})/,
    parser: parseNginxLog
  },
  application: {
    targets: ['app-1', 'app-2'],
    logPath: '/app/logs/application.log',
    pattern: /\[(.*?)\]\s+(\w+)\s+-\s+(.*)/,
    parser: parseAppLog
  },
  docker: {
    containers: ['myapp', 'redis', 'postgres'],
    parser: parseDockerLog
  },
  kubernetes: {
    namespace: 'production',
    selector: 'app=myapp',
    parser: parseK8sLog
  }
};

// Create output stream
const outputStream = createWriteStream(outputFile, { flags: 'a' });

// Log parsing functions
function parseNginxLog(line: string) {
  const match = line.match(logSources.nginx.pattern);
  if (match) {
    return {
      timestamp: new Date().toISOString(),
      type: 'nginx',
      ip: match[1],
      request: match[2],
      status: match[3],
      raw: line
    };
  }
  return null;
}

function parseAppLog(line: string) {
  const match = line.match(logSources.application.pattern);
  if (match) {
    return {
      timestamp: match[1],
      type: 'application',
      level: match[2],
      message: match[3],
      raw: line
    };
  }
  return null;
}

function parseDockerLog(line: string) {
  try {
    const log = JSON.parse(line);
    return {
      timestamp: log.time,
      type: 'docker',
      stream: log.stream,
      message: log.log,
      raw: line
    };
  } catch {
    return null;
  }
}

function parseK8sLog(line: string) {
  // Kubernetes logs often come in JSON format
  try {
    const log = JSON.parse(line);
    return {
      timestamp: log.timestamp || log.time,
      type: 'kubernetes',
      level: log.level,
      message: log.msg || log.message,
      metadata: log.metadata,
      raw: line
    };
  } catch {
    // Fallback for plain text logs
    return {
      timestamp: new Date().toISOString(),
      type: 'kubernetes',
      message: line,
      raw: line
    };
  }
}

// Create transform stream for processing logs
class LogProcessor extends Transform {
  constructor(private parser: Function, private source: string) {
    super({ objectMode: true });
  }
  
  _transform(chunk: any, encoding: string, callback: Function) {
    const line = chunk.toString().trim();
    if (line) {
      const parsed = this.parser(line);
      if (parsed) {
        const enriched = {
          ...parsed,
          source: this.source,
          processedAt: new Date().toISOString()
        };
        this.push(JSON.stringify(enriched) + '\n');
      }
    }
    callback();
  }
}

// Aggregate logs from different sources
async function aggregateLogs() {
  const streams = [];
  
  // SSH sources (server logs)
  if (sources === 'all' || sources === 'ssh') {
    console.log(chalk.gray('Collecting SSH server logs...'));
    
    for (const target of logSources.nginx.targets) {
      const stream = $$`ssh ${target} tail -f ${logSources.nginx.logPath}`;
      const processor = new LogProcessor(logSources.nginx.parser, target);
      
      pipeline(stream.stdout, processor, outputStream).catch(console.error);
      streams.push(stream);
    }
    
    for (const target of logSources.application.targets) {
      const stream = $$`ssh ${target} tail -f ${logSources.application.logPath}`;
      const processor = new LogProcessor(logSources.application.parser, target);
      
      pipeline(stream.stdout, processor, outputStream).catch(console.error);
      streams.push(stream);
    }
  }
  
  // Docker container logs
  if (sources === 'all' || sources === 'docker') {
    console.log(chalk.gray('Collecting Docker container logs...'));
    
    for (const container of logSources.docker.containers) {
      const stream = $$`docker logs -f ${container} --tail=100`;
      const processor = new LogProcessor(logSources.docker.parser, container);
      
      pipeline(stream.stdout, processor, outputStream).catch(console.error);
      streams.push(stream);
    }
  }
  
  // Kubernetes pod logs
  if (sources === 'all' || sources === 'kubernetes') {
    console.log(chalk.gray('Collecting Kubernetes pod logs...'));
    
    // Get all pods matching selector
    const pods = await $`
      kubectl get pods -n ${logSources.kubernetes.namespace} \
        -l ${logSources.kubernetes.selector} \
        -o jsonpath='{.items[*].metadata.name}'
    `.text();
    
    for (const pod of pods.split(' ')) {
      if (pod) {
        const stream = $$`kubectl logs -f ${pod} -n ${logSources.kubernetes.namespace} --tail=100`;
        const processor = new LogProcessor(logSources.kubernetes.parser, pod);
        
        pipeline(stream.stdout, processor, outputStream).catch(console.error);
        streams.push(stream);
      }
    }
  }
  
  console.log(chalk.green(`✅ Aggregating logs to ${outputFile}`));
  console.log(chalk.gray('Press Ctrl+C to stop...'));
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\nStopping log aggregation...'));
    streams.forEach(stream => stream.kill());
    outputStream.end();
    process.exit(0);
  });
}

// Advanced log aggregation with filters
async function aggregateWithFilters() {
  const filters = {
    level: process.env.LOG_LEVEL || 'INFO',
    timeRange: {
      start: new Date(Date.now() - 3600000), // Last hour
      end: new Date()
    },
    patterns: [
      /error/i,
      /exception/i,
      /failed/i
    ]
  };
  
  console.log(chalk.blue('Applying filters...'));
  console.log(chalk.gray(`  Level: ${filters.level}`));
  console.log(chalk.gray(`  Time: ${filters.timeRange.start} to ${filters.timeRange.end}`));
  
  // Create filtered transform stream
  const filterStream = new Transform({
    transform(chunk, encoding, callback) {
      const line = chunk.toString();
      
      // Apply filters
      if (filters.patterns.some(pattern => pattern.test(line))) {
        this.push(chunk);
      }
      
      callback();
    }
  });
  
  // Use with aggregation
  // ... existing aggregation code with filterStream added to pipeline
}

// Run aggregation
await aggregateLogs();
```

### Setup Centralized Logging Stack

```typescript
// scripts/setup-logging.ts
import { $ } from '@xec-sh/core';
import chalk from 'chalk';

console.log(chalk.blue('🚀 Setting up centralized logging stack...'));

// ELK Stack setup
async function setupELKStack() {
  const elkCompose = `
version: '3.8'

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    container_name: elasticsearch
    environment:
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
      - xpack.security.enabled=false
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch-data:/usr/share/elasticsearch/data
    networks:
      - elk

  logstash:
    image: docker.elastic.co/logstash/logstash:8.11.0
    container_name: logstash
    ports:
      - "5000:5000/tcp"
      - "5000:5000/udp"
      - "9600:9600"
    environment:
      - "LS_JAVA_OPTS=-Xms256m -Xmx256m"
    volumes:
      - ./logstash/pipeline:/usr/share/logstash/pipeline
      - ./logstash/config/logstash.yml:/usr/share/logstash/config/logstash.yml
    networks:
      - elk
    depends_on:
      - elasticsearch

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    container_name: kibana
    ports:
      - "5601:5601"
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
    networks:
      - elk
    depends_on:
      - elasticsearch

  filebeat:
    image: docker.elastic.co/beats/filebeat:8.11.0
    container_name: filebeat
    user: root
    volumes:
      - ./filebeat/filebeat.yml:/usr/share/filebeat/filebeat.yml:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /var/log:/var/log:ro
    command: filebeat -e -strict.perms=false
    networks:
      - elk
    depends_on:
      - logstash

volumes:
  elasticsearch-data:

networks:
  elk:
    driver: bridge
`;

  // Logstash pipeline configuration
  const logstashPipeline = `
input {
  beats {
    port => 5000
  }
  
  tcp {
    port => 5001
    codec => json
  }
  
  udp {
    port => 5002
    codec => json
  }
}

filter {
  if [type] == "nginx" {
    grok {
      match => {
        "message" => "%{IPORHOST:remote_ip} - %{DATA:user} \\[%{HTTPDATE:access_time}\\] \"%{WORD:method} %{DATA:url} HTTP/%{NUMBER:http_version}\" %{NUMBER:status} %{NUMBER:body_sent_bytes} \"%{DATA:referrer}\" \"%{DATA:user_agent}\""
      }
    }
    
    date {
      match => [ "access_time", "dd/MMM/yyyy:HH:mm:ss Z" ]
    }
  }
  
  if [type] == "application" {
    json {
      source => "message"
    }
    
    mutate {
      add_field => { "[@metadata][target_index]" => "app-%{+YYYY.MM.dd}" }
    }
  }
  
  if [docker] {
    mutate {
      add_field => { "[@metadata][target_index]" => "docker-%{+YYYY.MM.dd}" }
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "%{[@metadata][target_index]}"
  }
  
  stdout {
    codec => rubydebug
  }
}
`;

  // Filebeat configuration
  const filebeatConfig = `
filebeat.inputs:
- type: container
  paths:
    - '/var/lib/docker/containers/*/*.log'
  processors:
    - add_docker_metadata:
        host: "unix:///var/run/docker.sock"
    - decode_json_fields:
        fields: ["message"]
        target: "json"
        overwrite_keys: true

- type: log
  enabled: true
  paths:
    - /var/log/nginx/*.log
  fields:
    type: nginx
    
- type: log
  enabled: true
  paths:
    - /var/log/app/*.log
  fields:
    type: application
  multiline.pattern: '^\\['
  multiline.negate: true
  multiline.match: after

output.logstash:
  hosts: ["logstash:5000"]

processors:
  - add_host_metadata:
      when.not.contains:
        tags: forwarded
`;

  // Create configuration files
  await $`mkdir -p logstash/pipeline logstash/config filebeat`;
  await $`echo '${logstashPipeline}' > logstash/pipeline/logstash.conf`;
  await $`echo '${filebeatConfig}' > filebeat/filebeat.yml`;
  await $`echo 'http.host: "0.0.0.0"' > logstash/config/logstash.yml`;
  
  // Deploy ELK stack
  await $`echo '${elkCompose}' > docker-compose-elk.yml`;
  await $`docker-compose -f docker-compose-elk.yml up -d`;
  
  console.log(chalk.green('✅ ELK Stack deployed'));
  console.log(chalk.gray('   Kibana: http://localhost:5601'));
  console.log(chalk.gray('   Elasticsearch: http://localhost:9200'));
}

// Loki + Grafana setup
async function setupLokiStack() {
  const lokiCompose = `
version: '3.8'

services:
  loki:
    image: grafana/loki:2.9.0
    container_name: loki
    ports:
      - "3100:3100"
    volumes:
      - ./loki-config.yaml:/etc/loki/local-config.yaml
      - loki-data:/loki
    command: -config.file=/etc/loki/local-config.yaml
    networks:
      - loki

  promtail:
    image: grafana/promtail:2.9.0
    container_name: promtail
    volumes:
      - /var/log:/var/log:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - ./promtail-config.yaml:/etc/promtail/config.yml
    command: -config.file=/etc/promtail/config.yml
    networks:
      - loki

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3000:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana-datasources.yaml:/etc/grafana/provisioning/datasources/datasources.yaml
    networks:
      - loki

volumes:
  loki-data:
  grafana-data:

networks:
  loki:
    driver: bridge
`;

  // Loki configuration
  const lokiConfig = `
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
  chunk_idle_period: 5m
  chunk_retain_period: 30s

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

storage_config:
  boltdb_shipper:
    active_index_directory: /loki/boltdb-shipper-active
    cache_location: /loki/boltdb-shipper-cache
    shared_store: filesystem
  filesystem:
    directory: /loki/chunks

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h
`;

  // Promtail configuration
  const promtailConfig = `
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: containers
    static_configs:
      - targets:
          - localhost
        labels:
          job: containerlogs
          __path__: /var/lib/docker/containers/*/*log
    
    pipeline_stages:
      - json:
          expressions:
            output: log
            stream: stream
            time: time
      - json:
          expressions:
            tag: attrs.tag
          source: attrs
      - regex:
          expression: (?P<container_name>(?:[^|]*))\|(?P<image_name>(?:[^|]*))
          source: tag
      - timestamp:
          format: RFC3339Nano
          source: time
      - labels:
          stream:
          container_name:
          image_name:
      - output:
          source: output

  - job_name: system
    static_configs:
      - targets:
          - localhost
        labels:
          job: varlogs
          __path__: /var/log/*log
`;

  // Grafana datasource
  const grafanaDatasource = `
apiVersion: 1

datasources:
  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    isDefault: true
`;

  // Create configuration files
  await $`echo '${lokiConfig}' > loki-config.yaml`;
  await $`echo '${promtailConfig}' > promtail-config.yaml`;
  await $`echo '${grafanaDatasource}' > grafana-datasources.yaml`;
  
  // Deploy Loki stack
  await $`echo '${lokiCompose}' > docker-compose-loki.yml`;
  await $`docker-compose -f docker-compose-loki.yml up -d`;
  
  console.log(chalk.green('✅ Loki Stack deployed'));
  console.log(chalk.gray('   Grafana: http://localhost:3000'));
  console.log(chalk.gray('   Loki: http://localhost:3100'));
}

// Choose stack
const stack = process.argv[2] || 'elk';

if (stack === 'elk') {
  await setupELKStack();
} else if (stack === 'loki') {
  await setupLokiStack();
} else {
  console.log('Usage: setup-logging.ts [elk|loki]');
}
```

### Log Analysis and Alerting

```typescript
// scripts/log-analysis.ts
import { $ } from '@xec-sh/core';
import chalk from 'chalk';

// Analyze logs for patterns
async function analyzeLogs() {
  const timeRange = process.argv[2] || '1h';
  
  // Query Elasticsearch for errors
  const errors = await $`
    curl -X GET "localhost:9200/*/_search" \
      -H 'Content-Type: application/json' \
      -d '{
        "query": {
          "bool": {
            "must": [
              {"range": {"@timestamp": {"gte": "now-${timeRange}"}}},
              {"match": {"level": "ERROR"}}
            ]
          }
        },
        "aggs": {
          "error_types": {
            "terms": {"field": "error.type.keyword"}
          },
          "error_timeline": {
            "date_histogram": {
              "field": "@timestamp",
              "interval": "5m"
            }
          }
        }
      }'
  `.json();
  
  console.log(chalk.red(`Found ${errors.hits.total.value} errors in last ${timeRange}`));
  
  // Top error types
  if (errors.aggregations?.error_types?.buckets) {
    console.log(chalk.yellow('\nTop Error Types:'));
    errors.aggregations.error_types.buckets.forEach(bucket => {
      console.log(`  ${bucket.key}: ${bucket.doc_count}`);
    });
  }
  
  // Alert if threshold exceeded
  const errorThreshold = 100;
  if (errors.hits.total.value > errorThreshold) {
    await sendAlert('High Error Rate', `${errors.hits.total.value} errors in last ${timeRange}`);
  }
}

// Send alerts
async function sendAlert(title: string, message: string) {
  // Slack
  await $`
    curl -X POST ${process.env.SLACK_WEBHOOK} \
      -H 'Content-Type: application/json' \
      -d '{
        "text": "🚨 *${title}*",
        "attachments": [{
          "color": "danger",
          "text": "${message}"
        }]
      }'
  `.nothrow();
  
  // Email
  await $`
    echo "${message}" | \
    mail -s "${title}" ops-team@example.com
  `.nothrow();
  
  // PagerDuty
  await $`
    curl -X POST https://events.pagerduty.com/v2/enqueue \
      -H 'Content-Type: application/json' \
      -d '{
        "routing_key": "${process.env.PAGERDUTY_KEY}",
        "event_action": "trigger",
        "payload": {
          "summary": "${title}",
          "severity": "error",
          "source": "log-analysis",
          "custom_details": {
            "message": "${message}"
          }
        }
      }'
  `.nothrow();
}

await analyzeLogs();
```

## Usage Examples

```bash
# Aggregate all logs
xec run scripts/aggregate-logs.ts all

# Setup ELK stack
xec run scripts/setup-logging.ts elk

# Setup Loki stack  
xec run scripts/setup-logging.ts loki

# Analyze logs
xec run scripts/log-analysis.ts 1h

# Stream logs from specific sources
xec logs "hosts.*" --follow

# Filter logs
xec logs containers.app --grep="ERROR" --since="1h"
```

## Best Practices

1. **Use structured logging** (JSON) for easier parsing
2. **Include correlation IDs** for request tracing
3. **Set appropriate log levels** per environment
4. **Implement log rotation** to manage disk space
5. **Use centralized logging** for distributed systems
6. **Set up alerts** for critical errors
7. **Retain logs** according to compliance requirements

## Troubleshooting

### High Log Volume

```bash
# Check log volume
du -sh /var/log/*

# Compress old logs
find /var/log -name "*.log" -mtime +7 -exec gzip {} \;

# Adjust log levels
export LOG_LEVEL=WARN
```

### Missing Logs

```bash
# Check log agent status
systemctl status filebeat
docker ps | grep promtail

# Verify connectivity
curl -X GET http://localhost:9200/_cluster/health
```

## Related Topics

- [Health Checks](health-checks.md)
- [Backup and Restore](backup-restore.md)
- [Health Checks](health-checks.md)
- [GitHub Actions Integration](../integration/github-actions.md)