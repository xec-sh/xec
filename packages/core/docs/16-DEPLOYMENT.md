# 16. Deployment Guide

## Overview

This guide describes various methods for deploying Xec Core in production environments, including installation, configuration, scaling, and best practices for reliable operation.

## System Requirements

### Minimum Requirements

- **OS**: Linux (Ubuntu 20.04+, CentOS 8+, Debian 10+), macOS 12+, Windows Server 2019+ (with WSL2)
- **Node.js**: 16.x or higher (18.x LTS recommended)
- **RAM**: 1GB minimum, 2GB recommended
- **CPU**: 1 core minimum, 2+ cores recommended
- **Disk**: 1GB free space + space for logs and state

### Recommended Requirements for Production

- **OS**: Ubuntu 22.04 LTS or RHEL 8
- **Node.js**: 18.x LTS or 20.x LTS
- **RAM**: 4GB+
- **CPU**: 4+ cores
- **Disk**: 10GB+ SSD
- **Network**: Stable connection with low latency

## Installation Methods

### 1. Standalone Installation

```bash
# Create user for Xec
sudo useradd -r -s /bin/false xec
sudo mkdir -p /opt/xec
sudo chown xec:xec /opt/xec

# Install Node.js (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Xec Core
cd /opt/xec
sudo -u xec npm install @xec/core @xec/cli

# Create directory structure
sudo mkdir -p /etc/xec /var/log/xec /var/lib/xec
sudo chown -R xec:xec /etc/xec /var/log/xec /var/lib/xec
```

### 2. Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    openssh-client

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY . .

# Create user
RUN addgroup -g 1001 -S xec && \
    adduser -S -u 1001 -G xec xec

USER xec

EXPOSE 3000

CMD ["node", "server.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  xec:
    build: .
    container_name: xec-core
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - XEC_CONFIG_PATH=/etc/xec/config.yaml
    volumes:
      - ./config:/etc/xec:ro
      - xec-state:/var/lib/xec
      - xec-logs:/var/log/xec
    ports:
      - "3000:3000"
    networks:
      - xec-network
    healthcheck:
      test: ["CMD", "node", "health-check.js"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:15-alpine
    container_name: xec-db
    restart: unless-stopped
    environment:
      - POSTGRES_DB=xec
      - POSTGRES_USER=xec
      - POSTGRES_PASSWORD_FILE=/run/secrets/db_password
    secrets:
      - db_password
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - xec-network

volumes:
  xec-state:
  xec-logs:
  postgres-data:

networks:
  xec-network:
    driver: bridge

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

### 3. Kubernetes Deployment

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: xec-system
```

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: xec-core
  namespace: xec-system
  labels:
    app: xec-core
spec:
  replicas: 3
  selector:
    matchLabels:
      app: xec-core
  template:
    metadata:
      labels:
        app: xec-core
    spec:
      serviceAccountName: xec-core
      containers:
      - name: xec
        image: xecjs/core:2.0.0
        ports:
        - containerPort: 3000
          name: http
        - containerPort: 9090
          name: metrics
        env:
        - name: NODE_ENV
          value: "production"
        - name: XEC_CLUSTER_MODE
          value: "kubernetes"
        - name: XEC_STATE_BACKEND
          value: "postgresql"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: xec-secrets
              key: database-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: config
          mountPath: /etc/xec
          readOnly: true
        - name: state
          mountPath: /var/lib/xec
      volumes:
      - name: config
        configMap:
          name: xec-config
      - name: state
        persistentVolumeClaim:
          claimName: xec-state-pvc
```

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: xec-core
  namespace: xec-system
spec:
  selector:
    app: xec-core
  ports:
  - name: http
    port: 80
    targetPort: 3000
  - name: metrics
    port: 9090
    targetPort: 9090
  type: ClusterIP
```

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: xec-core
  namespace: xec-system
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - xec.example.com
    secretName: xec-tls
  rules:
  - host: xec.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: xec-core
            port:
              number: 80
```

### 4. Systemd Service

```ini
# /etc/systemd/system/xec.service
[Unit]
Description=Xec Core Automation Platform
Documentation=https://docs.xec.io
After=network.target

[Service]
Type=simple
User=xec
Group=xec
WorkingDirectory=/opt/xec
ExecStart=/usr/bin/node /opt/xec/server.js
Restart=on-failure
RestartSec=10

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/xec /var/log/xec

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

# Environment
Environment="NODE_ENV=production"
Environment="NODE_OPTIONS=--max-old-space-size=2048"
EnvironmentFile=-/etc/xec/environment

[Install]
WantedBy=multi-user.target
```

## Configuration

### Production Configuration

```yaml
# /etc/xec/config.yaml
server:
  host: 0.0.0.0
  port: 3000
  workers: auto  # Uses number of CPU cores
  
logging:
  level: info
  format: json
  outputs:
    - type: file
      path: /var/log/xec/app.log
      maxSize: 100M
      maxFiles: 10
      compress: true
    - type: syslog
      facility: local0
      
state:
  backend: postgresql
  connection:
    host: postgres.internal
    port: 5432
    database: xec
    user: xec
    password: ${POSTGRES_PASSWORD}
    ssl: true
    pool:
      min: 2
      max: 10
      
cache:
  type: redis
  connection:
    host: redis.internal
    port: 6379
    password: ${REDIS_PASSWORD}
    db: 0
    
security:
  encryption:
    algorithm: aes-256-gcm
    keyDerivation:
      iterations: 100000
      salt: ${ENCRYPTION_SALT}
  authentication:
    jwt:
      secret: ${JWT_SECRET}
      expiresIn: 1h
  rateLimit:
    windowMs: 60000
    max: 100
    
monitoring:
  metrics:
    enabled: true
    port: 9090
    path: /metrics
  tracing:
    enabled: true
    exporter: jaeger
    endpoint: http://jaeger:14268/api/traces
```

### Secrets and Environment Variables

```bash
# /etc/xec/environment
POSTGRES_PASSWORD=secure_password_here
REDIS_PASSWORD=another_secure_password
ENCRYPTION_SALT=random_salt_value
JWT_SECRET=jwt_secret_key
XEC_MASTER_KEY=master_encryption_key
```

### SSL/TLS Configuration

```yaml
# SSL configuration
server:
  https:
    enabled: true
    port: 443
    cert: /etc/xec/certs/server.crt
    key: /etc/xec/certs/server.key
    ca: /etc/xec/certs/ca.crt
    ciphers: 
      - ECDHE-RSA-AES128-GCM-SHA256
      - ECDHE-RSA-AES256-GCM-SHA384
    minVersion: TLSv1.2
```

## High Availability Setup

### Multi-node Cluster

```yaml
# Cluster configuration
cluster:
  enabled: true
  mode: active-active
  nodes:
    - id: node1
      address: 10.0.1.10:7000
      role: primary
    - id: node2
      address: 10.0.1.11:7000
      role: secondary
    - id: node3
      address: 10.0.1.12:7000
      role: secondary
  
  consensus:
    algorithm: raft
    electionTimeout: 1000
    heartbeatInterval: 100
    
  replication:
    mode: async
    maxLag: 5000
```

### Load Balancer Configuration

```nginx
# nginx.conf
upstream xec_backend {
    least_conn;
    
    server xec1.internal:3000 max_fails=3 fail_timeout=30s;
    server xec2.internal:3000 max_fails=3 fail_timeout=30s;
    server xec3.internal:3000 max_fails=3 fail_timeout=30s;
    
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name xec.example.com;
    
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    location / {
        proxy_pass http://xec_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    location /health {
        access_log off;
        proxy_pass http://xec_backend/health;
    }
}
```

## Monitoring and Logging

### Prometheus Metrics

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'xec-core'
    static_configs:
      - targets: 
        - 'xec1:9090'
        - 'xec2:9090'
        - 'xec3:9090'
    metrics_path: '/metrics'
```

### Grafana Dashboards

```json
{
  "dashboard": {
    "title": "Xec Core Monitoring",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [{
          "expr": "rate(xec_http_requests_total[5m])"
        }]
      },
      {
        "title": "Error Rate",
        "targets": [{
          "expr": "rate(xec_http_errors_total[5m])"
        }]
      },
      {
        "title": "Task Execution Time",
        "targets": [{
          "expr": "histogram_quantile(0.95, xec_task_duration_seconds_bucket)"
        }]
      }
    ]
  }
}
```

### ELK Stack Integration

```yaml
# filebeat.yml
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /var/log/xec/*.log
  json.keys_under_root: true
  json.add_error_key: true
  fields:
    service: xec-core
    environment: production

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  index: "xec-%{+yyyy.MM.dd}"
```

## Backup and Recovery

### Automated Backup

```bash
#!/bin/bash
# /opt/xec/scripts/backup.sh

BACKUP_DIR="/backup/xec"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"

mkdir -p "${BACKUP_PATH}"

# Backup state
pg_dump -h postgres.internal -U xec -d xec \
  > "${BACKUP_PATH}/database.sql"

# Backup configuration
tar -czf "${BACKUP_PATH}/config.tar.gz" /etc/xec

# Backup logs (last 7 days)
find /var/log/xec -name "*.log" -mtime -7 \
  -exec tar -rf "${BACKUP_PATH}/logs.tar" {} \;
gzip "${BACKUP_PATH}/logs.tar"

# Remove old backups (older than 30 days)
find "${BACKUP_DIR}" -type d -mtime +30 -exec rm -rf {} \;

# Replicate to S3
aws s3 sync "${BACKUP_PATH}" "s3://xec-backups/${TIMESTAMP}/"
```

### Disaster Recovery Procedure

```bash
#!/bin/bash
# /opt/xec/scripts/restore.sh

RESTORE_POINT=$1
BACKUP_PATH="/backup/xec/${RESTORE_POINT}"

# Stop services
systemctl stop xec

# Restore database
psql -h postgres.internal -U xec -d postgres \
  -c "DROP DATABASE IF EXISTS xec;"
psql -h postgres.internal -U xec -d postgres \
  -c "CREATE DATABASE xec;"
psql -h postgres.internal -U xec -d xec \
  < "${BACKUP_PATH}/database.sql"

# Restore configuration
tar -xzf "${BACKUP_PATH}/config.tar.gz" -C /

# Start services
systemctl start xec

# Verify
xec health-check
```

## Security Hardening

### OS Level Security

```bash
# Firewall rules
ufw allow 22/tcp
ufw allow 443/tcp
ufw allow from 10.0.0.0/8 to any port 3000
ufw allow from 10.0.0.0/8 to any port 9090
ufw --force enable

# SELinux context
semanage port -a -t http_port_t -p tcp 3000
setsebool -P httpd_can_network_connect 1

# Intrusion detection system
apt-get install -y aide
aideinit
cp /var/lib/aide/aide.db.new /var/lib/aide/aide.db
```

### Application Security

```yaml
# Security headers
security:
  headers:
    - name: Strict-Transport-Security
      value: max-age=31536000; includeSubDomains
    - name: X-Frame-Options
      value: DENY
    - name: X-Content-Type-Options
      value: nosniff
    - name: Content-Security-Policy
      value: default-src 'self'
```

## Performance Tuning

### Node.js Optimization

```bash
# System limits
echo "xec soft nofile 65535" >> /etc/security/limits.conf
echo "xec hard nofile 65535" >> /etc/security/limits.conf

# Kernel parameters
cat >> /etc/sysctl.conf << EOF
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
EOF

sysctl -p
```

### Database Optimization

```sql
-- PostgreSQL tuning
ALTER SYSTEM SET shared_buffers = '2GB';
ALTER SYSTEM SET effective_cache_size = '6GB';
ALTER SYSTEM SET maintenance_work_mem = '512MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET max_connections = 200;
```

## Maintenance

### Rolling Updates

```bash
#!/bin/bash
# Rolling update script

NODES=("xec1" "xec2" "xec3")
NEW_VERSION="2.1.0"

for node in "${NODES[@]}"; do
    echo "Updating ${node} to version ${NEW_VERSION}"
    
    # Drain node
    xec cluster drain ${node}
    
    # Update
    ssh ${node} "cd /opt/xec && npm install @xec/core@${NEW_VERSION}"
    
    # Restart
    ssh ${node} "systemctl restart xec"
    
    # Wait for health
    while ! ssh ${node} "curl -f http://localhost:3000/health"; do
        sleep 5
    done
    
    # Re-enable node
    xec cluster enable ${node}
    
    echo "${node} updated successfully"
    sleep 30
done
```

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   ```bash
   # Check memory usage
   ps aux | grep node
   
   # Heap dump
   kill -USR2 <pid>
   ```

2. **Connection Pool Exhaustion**
   ```yaml
   # Increase connection pool
   state:
     connection:
       pool:
         min: 5
         max: 50
   ```

3. **Slow Task Execution**
   ```bash
   # Enable profiling
   NODE_OPTIONS="--prof" node server.js
   
   # Analysis
   node --prof-process isolate-*.log > profile.txt
   ```

### Health Checks

```javascript
// health-check.js
const checks = {
  database: async () => {
    const result = await db.query('SELECT 1');
    return result.rows.length === 1;
  },
  
  redis: async () => {
    const pong = await redis.ping();
    return pong === 'PONG';
  },
  
  disk: async () => {
    const stats = await fs.statfs('/var/lib/xec');
    return stats.available > 1024 * 1024 * 1024; // 1GB
  }
};
```

## Best Practices

1. **Always use configuration management** for deployment
2. **Implement proper monitoring** before production
3. **Regular backups** with recovery testing
4. **Security updates** applied immediately
5. **Capacity planning** based on metrics
6. **Document your deployment** procedures
7. **Test disaster recovery** regularly

## Conclusion

Proper deployment of Xec Core in production requires attention to security, performance, and reliability details. Following this guide and best practices will enable you to create a stable and scalable automation infrastructure.