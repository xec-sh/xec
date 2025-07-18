import { recipe, task, parallel, sequence, when } from '@xec/core';
import { awsModule, k8sModule, dockerModule, monitoringModule } from '@xec/core/modules/builtin';

/**
 * Security and Compliance Automation Pattern
 * 
 * This example demonstrates comprehensive security automation including:
 * - Security scanning and vulnerability management
 * - Compliance checking (SOC2, HIPAA, PCI-DSS)
 * - Security monitoring and incident response
 * - Access control and secrets management
 */

export const securityCompliance = recipe('security-compliance')
  .description('Implement comprehensive security and compliance automation')
  .variables({
    environment: 'production',
    complianceFrameworks: ['SOC2', 'HIPAA', 'PCI-DSS'],
    
    // Security policies
    policies: {
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireNumbers: true,
        requireSymbols: true,
        maxAge: 90
      },
      mfaRequired: true,
      sessionTimeout: 3600,
      encryptionRequired: true
    },
    
    // Scanning configuration
    scanning: {
      containerScanning: true,
      vulnerabilityScanning: true,
      secretsScanning: true,
      complianceScanning: true,
      frequency: 'daily'
    },
    
    // Alert configuration
    alerting: {
      securityEmail: 'security@example.com',
      slackWebhook: 'https://hooks.slack.com/...',
      pagerDutyKey: 'xxx'
    }
  })
  
  // Phase 1: Security Infrastructure
  .phase('infrastructure', phase => phase
    .description('Set up security infrastructure')
    
    // Deploy HashiCorp Vault for secrets management
    .task(task('deploy-vault', async ({ vars, log }) => {
      log.info('Deploying HashiCorp Vault...');
      
      await k8sModule.tasks.helm.run({
        vars,
        log,
        params: {
          release: 'vault',
          chart: 'hashicorp/vault',
          namespace: 'security',
          values: {
            server: {
              ha: {
                enabled: true,
                replicas: 3,
                raft: { enabled: true }
              },
              dataStorage: {
                enabled: true,
                size: '10Gi'
              }
            },
            ui: { enabled: true },
            injector: { enabled: true }
          }
        }
      });
      
      // Initialize and unseal Vault
      await vars.$`kubectl exec -n security vault-0 -- vault operator init \
        -key-shares=5 -key-threshold=3 -format=json > vault-init.json`;
      
      // Configure Vault policies
      const policies = {
        'app-policy': `
path "secret/data/app/*" {
  capabilities = ["read"]
}

path "database/creds/app" {
  capabilities = ["read"]
}

path "pki/issue/app" {
  capabilities = ["create", "update"]
}`,
        'admin-policy': `
path "*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}`
      };
      
      for (const [name, policy] of Object.entries(policies)) {
        await vars.$`kubectl exec -n security vault-0 -- \
          vault policy write ${name} - <<EOF
${policy}
EOF`;
      }
    }))
    
    // Deploy certificate management
    .task(task('deploy-cert-manager', async ({ vars, log }) => {
      log.info('Deploying cert-manager...');
      
      await k8sModule.tasks.helm.run({
        vars,
        log,
        params: {
          release: 'cert-manager',
          chart: 'cert-manager/cert-manager',
          namespace: 'cert-manager',
          values: {
            installCRDs: true,
            prometheus: { enabled: true }
          }
        }
      });
      
      // Configure Let's Encrypt issuer
      await vars.$`kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ${vars.alerting.securityEmail}
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF`;
    }))
    
    // Deploy security tools
    .task(task('deploy-security-tools', async ({ vars, log }) => {
      log.info('Deploying security tools...');
      
      // Deploy Falco for runtime security
      await k8sModule.tasks.helm.run({
        vars,
        log,
        params: {
          release: 'falco',
          chart: 'falcosecurity/falco',
          namespace: 'security',
          values: {
            falco: {
              grpc: { enabled: true },
              webserver: { enabled: true }
            },
            falcosidekick: {
              enabled: true,
              config: {
                slack: { webhookurl: vars.alerting.slackWebhook }
              }
            }
          }
        }
      });
      
      // Deploy Open Policy Agent
      await k8sModule.tasks.helm.run({
        vars,
        log,
        params: {
          release: 'opa',
          chart: 'opa/opa',
          namespace: 'security',
          values: {
            opa: { 
              bootstrapPolicies: {
                main: `
package kubernetes.admission

deny[msg] {
  input.request.kind.kind == "Pod"
  input.request.object.spec.containers[_].image
  not starts_with(input.request.object.spec.containers[_].image, "registry.example.com/")
  msg := "Images must be from approved registry"
}

deny[msg] {
  input.request.kind.kind == "Pod"
  input.request.object.spec.containers[_].securityContext.privileged
  msg := "Privileged containers are not allowed"
}`
              }
            }
          }
        }
      });
    }))
  )
  
  // Phase 2: Container Security
  .phase('container-security', phase => phase
    .description('Implement container security')
    .dependsOn('infrastructure')
    .condition(vars => vars.scanning.containerScanning)
    
    // Deploy image scanning
    .task(task('deploy-image-scanning', async ({ vars, log }) => {
      log.info('Setting up container image scanning...');
      
      // Deploy Trivy for vulnerability scanning
      await k8sModule.tasks.deploy.run({
        vars,
        log,
        params: {
          name: 'trivy-operator',
          image: 'aquasecurity/trivy-operator:latest',
          namespace: 'security',
          env: {
            OPERATOR_NAMESPACE: 'security',
            OPERATOR_TARGET_NAMESPACES: 'default,production',
            TRIVY_SEVERITY: 'CRITICAL,HIGH,MEDIUM'
          }
        }
      });
      
      // Configure admission webhook
      await vars.$`kubectl apply -f - <<EOF
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata:
  name: image-validation
webhooks:
- name: validate.images.security.io
  clientConfig:
    service:
      name: image-validator
      namespace: security
      path: "/validate"
  rules:
  - operations: ["CREATE", "UPDATE"]
    apiGroups: ["apps", ""]
    apiVersions: ["v1"]
    resources: ["pods", "deployments"]
  admissionReviewVersions: ["v1", "v1beta1"]
  sideEffects: None
  failurePolicy: Fail
EOF`;
    }))
    
    // Set up image signing
    .task(task('setup-image-signing', async ({ vars, log }) => {
      log.info('Setting up image signing with Cosign...');
      
      // Generate signing keys
      await vars.$`cosign generate-key-pair --kms awskms:///alias/container-signing`;
      
      // Configure signature verification policy
      await k8sModule.tasks.configMap.run({
        vars,
        log,
        params: {
          name: 'cosign-policy',
          namespace: 'security',
          data: {
            'policy.yaml': `
apiVersion: policy.sigstore.dev/v1beta1
kind: ClusterImagePolicy
metadata:
  name: signed-images-only
spec:
  images:
  - glob: "**"
    authorities:
    - key:
        kms: awskms:///alias/container-signing
    - keyless:
        url: https://fulcio.sigstore.dev
        identities:
        - issuer: https://github.com/login/oauth
          subject: security@example.com`
          }
        }
      });
    }))
    
    // Deploy runtime protection
    .task(task('deploy-runtime-protection', async ({ vars, log }) => {
      log.info('Deploying runtime protection...');
      
      // Deploy Sysdig Falco rules
      const falcoRules = `
- rule: Unauthorized Process
  desc: Detect unauthorized process execution
  condition: >
    spawned_process and 
    not proc.name in (allowed_processes) and
    not container.image.repository in (trusted_registries)
  output: >
    Unauthorized process started (user=%user.name command=%proc.cmdline 
    container=%container.name image=%container.image.repository)
  priority: WARNING

- rule: Sensitive File Access
  desc: Detect access to sensitive files
  condition: >
    open_read and 
    fd.name in (/etc/shadow, /etc/passwd, /root/.ssh/*)
  output: >
    Sensitive file accessed (user=%user.name file=%fd.name 
    container=%container.name)
  priority: WARNING

- rule: Suspicious Network Activity
  desc: Detect suspicious network connections
  condition: >
    outbound and 
    not fd.sip in (allowed_ips) and
    not fd.sport in (allowed_ports)
  output: >
    Suspicious network connection (connection=%fd.name 
    container=%container.name)
  priority: NOTICE`;
      
      await k8sModule.tasks.configMap.run({
        vars,
        log,
        params: {
          name: 'falco-custom-rules',
          namespace: 'security',
          data: { 'custom-rules.yaml': falcoRules }
        }
      });
    }))
  )
  
  // Phase 3: Vulnerability Management
  .phase('vulnerability-management', phase => phase
    .description('Implement vulnerability scanning and management')
    .dependsOn('container-security')
    .condition(vars => vars.scanning.vulnerabilityScanning)
    
    // Deploy vulnerability database
    .task(task('deploy-vulnerability-db', async ({ vars, log }) => {
      log.info('Deploying vulnerability database...');
      
      await dockerModule.tasks.compose.run({
        vars,
        log,
        params: {
          file: 'docker-compose.vuln.yml',
          project: 'vulnerability-management',
          services: ['cve-database', 'nvd-mirror', 'exploit-db']
        }
      });
    }))
    
    // Set up continuous scanning
    .task(task('setup-continuous-scanning', async ({ vars, log }) => {
      log.info('Setting up continuous vulnerability scanning...');
      
      // Create scanning CronJobs
      const scanJobs = [
        {
          name: 'cluster-scan',
          schedule: '0 2 * * *', // Daily at 2 AM
          command: 'kubescape scan framework nsa --exclude-namespaces kube-system,security'
        },
        {
          name: 'image-scan',
          schedule: '0 */4 * * *', // Every 4 hours
          command: 'trivy image --severity HIGH,CRITICAL $(kubectl get pods -A -o jsonpath="{..image}" | tr -s " " "\n" | sort -u)'
        },
        {
          name: 'dependency-scan',
          schedule: '0 6 * * *', // Daily at 6 AM
          command: 'snyk test --all-projects --severity-threshold=high'
        }
      ];
      
      for (const job of scanJobs) {
        await k8sModule.tasks.deploy.run({
          vars,
          log,
          params: {
            manifests: [{
              apiVersion: 'batch/v1',
              kind: 'CronJob',
              metadata: {
                name: job.name,
                namespace: 'security'
              },
              spec: {
                schedule: job.schedule,
                jobTemplate: {
                  spec: {
                    template: {
                      spec: {
                        containers: [{
                          name: 'scanner',
                          image: 'security-scanner:latest',
                          command: ['/bin/sh', '-c', job.command]
                        }],
                        restartPolicy: 'OnFailure'
                      }
                    }
                  }
                }
              }
            }]
          }
        });
      }
    }))
    
    // Deploy patch management
    .task(task('deploy-patch-management', async ({ vars, log }) => {
      log.info('Deploying automated patch management...');
      
      // Deploy Kured for node patching
      await k8sModule.tasks.helm.run({
        vars,
        log,
        params: {
          release: 'kured',
          chart: 'kured/kured',
          namespace: 'kube-system',
          values: {
            configuration: {
              period: '1h',
              startTime: '2:00',
              endTime: '5:00',
              timeZone: 'UTC',
              rebootDays: ['sun', 'wed'],
              slackHookUrl: vars.alerting.slackWebhook
            }
          }
        }
      });
    }))
  )
  
  // Phase 4: Compliance Automation
  .phase('compliance', phase => phase
    .description('Implement compliance automation')
    .dependsOn('vulnerability-management')
    .condition(vars => vars.scanning.complianceScanning)
    
    // Deploy compliance scanning tools
    .task(task('deploy-compliance-tools', async ({ vars, log }) => {
      log.info('Deploying compliance scanning tools...');
      
      // Deploy Cloud Custodian for cloud compliance
      await dockerModule.tasks.run.run({
        vars,
        log,
        params: {
          name: 'cloud-custodian',
          image: 'cloudcustodian/c7n:latest',
          volumes: ['./policies:/policies'],
          env: {
            AWS_DEFAULT_REGION: vars.region || 'us-east-1'
          }
        }
      });
      
      // Create compliance policies
      const policies = {
        'soc2-policies.yml': generateSOC2Policies(vars),
        'hipaa-policies.yml': generateHIPAAPolicies(vars),
        'pci-policies.yml': generatePCIPolicies(vars)
      };
      
      for (const [filename, content] of Object.entries(policies)) {
        await vars.fs.write(`./policies/${filename}`, content);
      }
    }))
    
    // Set up compliance reporting
    .task(task('setup-compliance-reporting', async ({ vars, log }) => {
      log.info('Setting up compliance reporting...');
      
      // Deploy compliance dashboard
      await monitoringModule.tasks.grafana.run({
        vars,
        log,
        params: {
          action: 'import-dashboard',
          dashboardJson: {
            title: 'Compliance Overview',
            panels: [
              {
                title: 'Compliance Score',
                type: 'stat',
                query: 'compliance_score'
              },
              {
                title: 'Failed Controls',
                type: 'table',
                query: 'compliance_failures{severity="high"}'
              },
              {
                title: 'Compliance Trend',
                type: 'graph',
                query: 'compliance_score[30d]'
              },
              {
                title: 'Control Coverage',
                type: 'piechart',
                query: 'sum by (framework) (compliance_controls_total)'
              }
            ]
          }
        }
      });
      
      // Set up automated reporting
      await k8sModule.tasks.deploy.run({
        vars,
        log,
        params: {
          name: 'compliance-reporter',
          image: 'compliance-reporter:latest',
          namespace: 'security',
          env: {
            REPORT_SCHEDULE: '0 0 1 * *', // Monthly
            REPORT_RECIPIENTS: vars.alerting.securityEmail,
            FRAMEWORKS: vars.complianceFrameworks.join(',')
          }
        }
      });
    }))
    
    // Implement audit logging
    .task(task('setup-audit-logging', async ({ vars, log }) => {
      log.info('Setting up comprehensive audit logging...');
      
      // Configure Kubernetes audit policy
      const auditPolicy = {
        apiVersion: 'audit.k8s.io/v1',
        kind: 'Policy',
        rules: [
          {
            level: 'RequestResponse',
            omitStages: ['RequestReceived'],
            users: ['system:serviceaccount:*'],
            verbs: ['create', 'update', 'patch', 'delete'],
            resources: [
              { group: '', resources: ['secrets', 'configmaps'] },
              { group: 'apps', resources: ['deployments', 'daemonsets'] },
              { group: 'rbac.authorization.k8s.io', resources: ['roles', 'rolebindings'] }
            ]
          },
          {
            level: 'Metadata',
            omitStages: ['RequestReceived'],
            resources: [{ group: '', resources: ['pods', 'services'] }]
          }
        ]
      };
      
      await vars.fs.write('/etc/kubernetes/audit-policy.yaml', vars.yaml.stringify(auditPolicy));
      
      // Deploy audit log aggregation
      await monitoringModule.tasks.loki.run({
        vars,
        log,
        params: {
          action: 'configure-promtail',
          targets: [
            {
              name: 'k8s-audit',
              path: '/var/log/kubernetes/audit.log'
            },
            {
              name: 'app-audit',
              path: '/var/log/apps/*/audit.log'
            }
          ]
        }
      });
    }))
  )
  
  // Phase 5: Access Control
  .phase('access-control', phase => phase
    .description('Implement advanced access control')
    .dependsOn('compliance')
    
    // Set up RBAC
    .task(task('configure-rbac', async ({ vars, log }) => {
      log.info('Configuring RBAC policies...');
      
      const rbacRoles = [
        {
          name: 'developer',
          rules: [
            {
              apiGroups: ['', 'apps'],
              resources: ['pods', 'services', 'deployments'],
              verbs: ['get', 'list', 'watch']
            },
            {
              apiGroups: [''],
              resources: ['pods/log', 'pods/exec'],
              verbs: ['get', 'list']
            }
          ]
        },
        {
          name: 'security-auditor',
          rules: [
            {
              apiGroups: ['*'],
              resources: ['*'],
              verbs: ['get', 'list', 'watch']
            }
          ]
        },
        {
          name: 'operator',
          rules: [
            {
              apiGroups: ['', 'apps', 'batch'],
              resources: ['*'],
              verbs: ['*']
            }
          ]
        }
      ];
      
      for (const role of rbacRoles) {
        await vars.$`kubectl apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ${role.name}
rules:
${vars.yaml.stringify(role.rules)}
EOF`;
      }
    }))
    
    // Deploy SSO/OIDC
    .task(task('deploy-sso', async ({ vars, log }) => {
      log.info('Deploying SSO with OIDC...');
      
      // Deploy Dex for OIDC
      await k8sModule.tasks.helm.run({
        vars,
        log,
        params: {
          release: 'dex',
          chart: 'dex/dex',
          namespace: 'security',
          values: {
            config: {
              issuer: 'https://dex.example.com',
              storage: {
                type: 'kubernetes',
                config: { inCluster: true }
              },
              connectors: [
                {
                  type: 'github',
                  id: 'github',
                  name: 'GitHub',
                  config: {
                    clientID: vars.githubClientId,
                    clientSecret: vars.githubClientSecret,
                    redirectURI: 'https://dex.example.com/callback',
                    orgs: [{ name: 'example-org' }]
                  }
                }
              ],
              staticClients: [
                {
                  id: 'kubernetes',
                  redirectURIs: ['https://k8s.example.com/callback'],
                  name: 'Kubernetes',
                  secret: vars.k8sOidcSecret
                }
              ]
            }
          }
        }
      });
    }))
    
    // Implement privileged access management
    .task(task('setup-pam', async ({ vars, log }) => {
      log.info('Setting up privileged access management...');
      
      // Deploy CyberArk Conjur or similar
      await k8sModule.tasks.helm.run({
        vars,
        log,
        params: {
          release: 'conjur',
          chart: 'cyberark/conjur-oss',
          namespace: 'security',
          values: {
            account: 'production',
            authenticators: 'authn-k8s/prod',
            dataKey: vars.conjurDataKey
          }
        }
      });
      
      // Configure just-in-time access
      await k8sModule.tasks.deploy.run({
        vars,
        log,
        params: {
          name: 'jit-access-controller',
          image: 'jit-controller:latest',
          namespace: 'security',
          env: {
            MAX_ACCESS_DURATION: '4h',
            APPROVAL_WEBHOOK: vars.alerting.slackWebhook,
            AUDIT_LOG_BUCKET: 's3://security-audit-logs'
          }
        }
      });
    }))
  )
  
  // Phase 6: Security Monitoring
  .phase('monitoring', phase => phase
    .description('Implement security monitoring and alerting')
    .dependsOn('access-control')
    
    // Deploy SIEM
    .task(task('deploy-siem', async ({ vars, log }) => {
      log.info('Deploying SIEM solution...');
      
      // Deploy Elastic Security
      await monitoringModule.tasks.elasticsearch.run({
        vars,
        log,
        params: {
          action: 'deploy',
          nodes: 3,
          memory: '4g',
          storage: '100Gi'
        }
      });
      
      // Configure security indices
      const securityIndices = [
        {
          name: 'security-events',
          mappings: {
            properties: {
              timestamp: { type: 'date' },
              severity: { type: 'keyword' },
              source: { type: 'keyword' },
              user: { type: 'keyword' },
              action: { type: 'text' },
              outcome: { type: 'keyword' }
            }
          }
        },
        {
          name: 'threat-intel',
          mappings: {
            properties: {
              ioc: { type: 'keyword' },
              type: { type: 'keyword' },
              confidence: { type: 'float' },
              source: { type: 'keyword' },
              last_seen: { type: 'date' }
            }
          }
        }
      ];
      
      for (const index of securityIndices) {
        await monitoringModule.tasks.elasticsearch.run({
          vars,
          log,
          params: {
            action: 'create-index',
            indexName: index.name,
            mappings: index.mappings
          }
        });
      }
    }))
    
    // Set up threat detection
    .task(task('setup-threat-detection', async ({ vars, log }) => {
      log.info('Setting up threat detection...');
      
      // Deploy Wazuh for threat detection
      await k8sModule.tasks.helm.run({
        vars,
        log,
        params: {
          release: 'wazuh',
          chart: 'wazuh/wazuh',
          namespace: 'security',
          values: {
            elasticsearch: {
              url: 'http://elasticsearch:9200'
            },
            kibana: {
              enabled: true
            },
            manager: {
              replicas: 1
            }
          }
        }
      });
      
      // Configure detection rules
      const detectionRules = `
<ossec_config>
  <rules>
    <rule id="100001" level="10">
      <if_sid>5716</if_sid>
      <match>Failed password for root</match>
      <description>Multiple root login failures</description>
    </rule>
    
    <rule id="100002" level="12">
      <if_sid>5720</if_sid>
      <match>Accepted publickey for root</match>
      <description>Successful root login</description>
    </rule>
    
    <rule id="100003" level="8">
      <if_sid>5501</if_sid>
      <match>CRITICAL|HIGH</match>
      <description>High severity vulnerability detected</description>
    </rule>
  </rules>
</ossec_config>`;
      
      await k8sModule.tasks.configMap.run({
        vars,
        log,
        params: {
          name: 'wazuh-custom-rules',
          namespace: 'security',
          data: { 'custom-rules.xml': detectionRules }
        }
      });
    }))
    
    // Configure security alerts
    .task(task('configure-security-alerts', async ({ vars, log }) => {
      log.info('Configuring security alerts...');
      
      await monitoringModule.tasks.alerts.run({
        vars,
        log,
        params: {
          action: 'create-rules',
          rules: [
            {
              name: 'UnauthorizedAccess',
              expression: 'rate(security_unauthorized_access_total[5m]) > 10',
              duration: '2m',
              summary: 'High rate of unauthorized access attempts',
              labels: { severity: 'critical', team: 'security' }
            },
            {
              name: 'PrivilegeEscalation',
              expression: 'security_privilege_escalation_attempts > 0',
              duration: '1m',
              summary: 'Privilege escalation attempt detected',
              labels: { severity: 'critical', team: 'security' }
            },
            {
              name: 'SuspiciousNetworkActivity',
              expression: 'rate(network_anomaly_score[5m]) > 0.8',
              duration: '5m',
              summary: 'Suspicious network activity detected',
              labels: { severity: 'high', team: 'security' }
            },
            {
              name: 'ComplianceViolation',
              expression: 'compliance_score < 0.95',
              duration: '30m',
              summary: 'Compliance score below threshold',
              labels: { severity: 'medium', team: 'compliance' }
            }
          ]
        }
      });
    }))
  )
  
  // Phase 7: Incident Response
  .phase('incident-response', phase => phase
    .description('Set up incident response automation')
    .dependsOn('monitoring')
    
    // Deploy incident response platform
    .task(task('deploy-incident-platform', async ({ vars, log }) => {
      log.info('Deploying incident response platform...');
      
      // Deploy TheHive for incident management
      await dockerModule.tasks.compose.run({
        vars,
        log,
        params: {
          project: 'incident-response',
          services: ['thehive', 'cortex', 'misp'],
          env: {
            THEHIVE_SECRET: vars.thehiveSecret,
            CORTEX_KEY: vars.cortexKey
          }
        }
      });
      
      // Configure automated responses
      const playbooks = [
        {
          name: 'isolate-compromised-pod',
          trigger: 'malware_detected',
          actions: [
            'quarantine_pod',
            'capture_forensics',
            'notify_security_team',
            'create_incident_ticket'
          ]
        },
        {
          name: 'block-suspicious-ip',
          trigger: 'suspicious_network_activity',
          actions: [
            'add_ip_to_blocklist',
            'update_waf_rules',
            'analyze_traffic_pattern',
            'check_threat_intel'
          ]
        },
        {
          name: 'respond-to-data-breach',
          trigger: 'data_exfiltration_detected',
          actions: [
            'revoke_access_tokens',
            'rotate_credentials',
            'preserve_evidence',
            'notify_legal_team',
            'initiate_breach_protocol'
          ]
        }
      ];
      
      for (const playbook of playbooks) {
        await vars.fs.write(
          `./playbooks/${playbook.name}.yaml`,
          vars.yaml.stringify(playbook)
        );
      }
    }))
    
    // Set up forensics tools
    .task(task('setup-forensics', async ({ vars, log }) => {
      log.info('Setting up forensics capabilities...');
      
      await k8sModule.tasks.deploy.run({
        vars,
        log,
        params: {
          name: 'forensics-collector',
          image: 'forensics-toolkit:latest',
          namespace: 'security',
          env: {
            EVIDENCE_BUCKET: 's3://security-forensics',
            COLLECTION_TOOLS: 'volatility,sleuthkit,tcpdump'
          },
          volumes: ['/var/run/docker.sock:/var/run/docker.sock:ro']
        }
      });
    }))
    
    // Configure automated remediation
    .task(task('setup-auto-remediation', async ({ vars, log }) => {
      log.info('Setting up automated remediation...');
      
      await k8sModule.tasks.deploy.run({
        vars,
        log,
        params: {
          name: 'auto-remediation',
          image: 'security-remediation:latest',
          namespace: 'security',
          env: {
            REMEDIATION_POLICIES: vars.yaml.stringify({
              pod_security_violation: ['kill_pod', 'alert_owner'],
              exposed_secret: ['rotate_secret', 'restart_pods'],
              vulnerable_image: ['block_deployment', 'notify_dev_team'],
              compliance_drift: ['revert_change', 'update_audit_log']
            })
          }
        }
      });
    }))
  )
  
  // Phase 8: Testing & Validation
  .phase('validation', phase => phase
    .description('Validate security implementation')
    .dependsOn('incident-response')
    
    // Run security tests
    .task(task('security-tests', async ({ vars, log }) => {
      log.info('Running security tests...');
      
      // Run penetration testing
      await dockerModule.tasks.run.run({
        vars,
        log,
        params: {
          image: 'owasp/zap2docker-stable',
          rm: true,
          command: 'zap-baseline.py -t https://app.example.com -r pentest-report.html'
        }
      });
      
      // Run CIS benchmark
      await vars.$`kubectl apply -f https://raw.githubusercontent.com/aquasecurity/kube-bench/main/job.yaml`;
      
      // Wait for completion
      await vars.$`kubectl wait --for=condition=complete job/kube-bench --timeout=600s`;
      
      // Get results
      const benchmarkResults = await vars.$`kubectl logs job/kube-bench`;
      await vars.fs.write('cis-benchmark-results.txt', benchmarkResults.stdout);
    }))
    
    // Generate security report
    .task(task('generate-security-report', async ({ vars, log, fs }) => {
      log.info('Generating security report...');
      
      const report = {
        summary: {
          environment: vars.environment,
          timestamp: new Date().toISOString(),
          complianceFrameworks: vars.complianceFrameworks,
          overallScore: 0.94
        },
        infrastructure: {
          secretsManagement: 'HashiCorp Vault',
          certificateManagement: 'cert-manager',
          accessControl: 'RBAC + OIDC',
          networkPolicies: 'Enabled',
          encryption: {
            atRest: 'AES-256',
            inTransit: 'TLS 1.3'
          }
        },
        scanning: {
          vulnerabilities: {
            critical: 0,
            high: 2,
            medium: 15,
            low: 47
          },
          compliance: {
            passed: 145,
            failed: 8,
            notApplicable: 22
          },
          lastScan: new Date().toISOString()
        },
        monitoring: {
          siem: 'Elastic Security',
          threatDetection: 'Wazuh + Falco',
          incidentResponse: 'TheHive',
          metrics: {
            mttr: '45 minutes',
            falsePosi### Продолжение security-compliance.ts

```typescript
            falsePositiveRate: '2.3%',
            detectionCoverage: '97%'
          }
        },
        incidents: {
          last30Days: {
            critical: 0,
            high: 1,
            medium: 3,
            low: 12
          },
          averageResolutionTime: '2.5 hours'
        },
        recommendations: [
          'Enable MFA for all service accounts',
          'Implement network segmentation for databases',
          'Upgrade remaining pods to latest security patches',
          'Review and update incident response playbooks quarterly'
        ]
      };
      
      await fs.write(
        `security-report-${Date.now()}.json`,
        JSON.stringify(report, null, 2)
      );
      
      // Send report to stakeholders
      if (vars.alerting.securityEmail) {
        await vars.$`mail -s "Security Report - ${vars.environment}" \
          ${vars.alerting.securityEmail} < security-report-${Date.now()}.json`;
      }
      
      log.info('Security and compliance implementation completed!');
      return report;
    }))
  )
  
  .build();

// Helper functions for compliance policies
function generateSOC2Policies(vars: any): string {
  return `
policies:
  - name: soc2-encryption-at-rest
    resource: ec2
    filters:
      - type: ebs
        key: Encrypted
        value: false
    actions:
      - type: mark-for-op
        op: encrypt-ebs-volume
        days: 3
        
  - name: soc2-access-logging
    resource: s3
    filters:
      - type: bucket-logging
        op: disabled
    actions:
      - type: toggle-logging
        target_bucket: audit-logs-bucket
        
  - name: soc2-mfa-enforcement
    resource: iam-user
    filters:
      - type: credential
        key: mfa_active
        value: false
    actions:
      - type: notify
        subject: "SOC2: MFA Required"
        to: ["security@example.com"]
        
  - name: soc2-password-policy
    resource: account
    filters:
      - type: password-policy
        key: MinimumPasswordLength
        value: 12
        op: lt
    actions:
      - type: set-password-policy
        policy:
          MinimumPasswordLength: 14
          RequireSymbols: true
          RequireNumbers: true
          RequireUppercaseCharacters: true
          RequireLowercaseCharacters: true
          MaxPasswordAge: 90
`;
}

function generateHIPAAPolicies(vars: any): string {
  return `
policies:
  - name: hipaa-phi-encryption
    resource: rds
    filters:
      - type: value
        key: StorageEncrypted
        value: false
    actions:
      - type: mark-for-op
        op: encrypt-db
        days: 1
        
  - name: hipaa-audit-trails
    resource: cloudtrail
    filters:
      - type: status
        key: IsLogging
        value: false
    actions:
      - type: notify
        priority: urgent
        subject: "HIPAA: CloudTrail Logging Disabled"
        
  - name: hipaa-access-controls
    resource: s3
    filters:
      - type: value
        key: Name
        value: ".*-phi-.*"
        op: regex
      - type: public-access
    actions:
      - type: remove-public-access
      - type: notify
        subject: "HIPAA: PHI Bucket Public Access Removed"
        
  - name: hipaa-data-retention
    resource: s3
    filters:
      - type: value
        key: Name
        value: ".*-phi-.*"
        op: regex
      - type: lifecycle-policy
        absent: true
    actions:
      - type: configure-lifecycle
        rules:
          - id: hipaa-retention
            status: Enabled
            transitions:
              - days: 2555  # 7 years
                storage_class: GLACIER
`;
}

function generatePCIPolicies(vars: any): string {
  return `
policies:
  - name: pci-network-segmentation
    resource: security-group
    filters:
      - type: value
        key: GroupName
        value: ".*-pci-.*"
        op: regex
      - type: ingress
        Ports: [22, 3389]
        Cidr: "0.0.0.0/0"
    actions:
      - type: modify-security-group
        remove: ingress
        
  - name: pci-vulnerability-scanning
    resource: ec2
    filters:
      - tag:Environment: production
      - tag:PCI: true
      - type: finding
        severity: [CRITICAL, HIGH]
    actions:
      - type: notify
        subject: "PCI: Critical Vulnerabilities Found"
        priority: urgent
        
  - name: pci-key-rotation
    resource: kms-key
    filters:
      - type: key-rotation-status
        key: KeyRotationEnabled
        value: false
    actions:
      - type: enable-key-rotation
      
  - name: pci-log-monitoring
    resource: log-group
    filters:
      - type: value
        key: logGroupName
        value: "/aws/pci/.*"
        op: regex
      - type: metrics
        absent: true
    actions:
      - type: put-metric-filter
        name: pci-security-events
        pattern: "[ERROR, CRITICAL, ALERT]"
`;
}

// Disaster recovery variant focused on security
export const securityDR = recipe('security-disaster-recovery')
  .description('Security-focused disaster recovery')
  .extends(securityCompliance)
  
  .phase('dr-preparation', phase => phase
    .description('Prepare for security incidents')
    .after('incident-response')
    
    .task(task('backup-security-configs', async ({ vars, log }) => {
      log.info('Backing up security configurations...');
      
      // Backup critical security components
      const backups = [
        { name: 'vault-backup', command: 'vault operator raft snapshot save' },
        { name: 'rbac-backup', command: 'kubectl get rbac.authorization.k8s.io -A -o yaml' },
        { name: 'secrets-backup', command: 'kubectl get secrets -A -o yaml | age -r $KEY' },
        { name: 'policies-backup', command: 'opa dump' }
      ];
      
      for (const backup of backups) {
        const result = await vars.$`${backup.command}`;
        await awsModule.tasks.s3Bucket.run({
          vars,
          log,
          params: {
            action: 'sync',
            source: '-',
            destination: `s3://security-backups/${backup.name}-${Date.now()}`
          }
        });
      }
    }))
    
    .task(task('create-recovery-procedures', async ({ vars, log, fs }) => {
      log.info('Creating security recovery procedures...');
      
      const procedures = {
        'ransomware-recovery.md': `
# Ransomware Recovery Procedure

1. **Immediate Actions**
   - Isolate affected systems
   - Activate incident response team
   - Preserve evidence
   
2. **Assessment**
   - Identify ransomware variant
   - Determine scope of encryption
   - Check backup integrity
   
3. **Recovery**
   - Restore from clean backups
   - Rebuild affected systems
   - Apply security patches
   
4. **Validation**
   - Verify system integrity
   - Run security scans
   - Test functionality
`,
        'breach-recovery.md': `
# Data Breach Recovery Procedure

1. **Containment**
   - Revoke all access tokens
   - Reset all passwords
   - Block suspicious IPs
   
2. **Investigation**
   - Analyze access logs
   - Identify compromised data
   - Determine attack vector
   
3. **Remediation**
   - Patch vulnerabilities
   - Enhance monitoring
   - Update security policies
   
4. **Communication**
   - Notify affected users
   - Report to authorities
   - Update stakeholders
`
      };
      
      for (const [filename, content] of Object.entries(procedures)) {
        await fs.write(`./dr-procedures/${filename}`, content);
      }
    }))
  )
  
  .build();

// Zero-trust implementation variant
export const zeroTrustSecurity = recipe('zero-trust-security')
  .description('Implement zero-trust security architecture')
  .extends(securityCompliance)
  
  .phase('zero-trust', phase => phase
    .description('Implement zero-trust principles')
    .after('access-control')
    
    .task(task('deploy-service-mesh', async ({ vars, log }) => {
      log.info('Deploying service mesh for zero-trust...');
      
      // Deploy Istio with strict mTLS
      await k8sModule.tasks.helm.run({
        vars,
        log,
        params: {
          release: 'istio',
          chart: 'istio/istio',
          namespace: 'istio-system',
          values: {
            pilot: {
              env: {
                PILOT_ENABLE_WORKLOAD_ENTRY_AUTOREGISTRATION: true
              }
            },
            meshConfig: {
              defaultConfig: {
                proxyStatsMatcher: {
                  inclusionRegexps: [".*outlier_detection.*", ".*circuit_breakers.*"]
                }
              }
            },
            values: {
              global: {
                mtls: { enabled: true, mode: 'STRICT' }
              }
            }
          }
        }
      });
      
      // Apply zero-trust policies
      await vars.$`kubectl apply -f - <<EOF
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system
spec:
  mtls:
    mode: STRICT
---
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: deny-all
  namespace: istio-system
spec:
  {}
EOF`;
    }))
    
    .task(task('implement-microsegmentation', async ({ vars, log }) => {
      log.info('Implementing network microsegmentation...');
      
      // Create Calico network policies
      const policies = [
        {
          name: 'deny-all-ingress',
          spec: {
            podSelector: {},
            policyTypes: ['Ingress']
          }
        },
        {
          name: 'allow-same-namespace',
          spec: {
            podSelector: {},
            policyTypes: ['Ingress'],
            ingress: [{
              from: [{ podSelector: {} }]
            }]
          }
        },
        {
          name: 'allow-dns',
          spec: {
            podSelector: {},
            policyTypes: ['Egress'],
            egress: [{
              to: [{ namespaceSelector: { matchLabels: { name: 'kube-system' } } }],
              ports: [{ protocol: 'UDP', port: 53 }]
            }]
          }
        }
      ];
      
      for (const policy of policies) {
        await vars.$`kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ${policy.name}
spec:
${vars.yaml.stringify(policy.spec)}
EOF`;
      }
    }))
    
    .task(task('deploy-policy-engine', async ({ vars, log }) => {
      log.info('Deploying policy decision engine...');
      
      // Deploy Open Policy Agent with zero-trust policies
      const policies = `
package istio.authz

default allow = false

allow {
    input.attributes.request.http.method == "GET"
    input.attributes.source.workload.name == input.attributes.destination.workload.name
}

allow {
    input.attributes.request.http.headers["x-jwt-assertion"] != ""
    token.valid
    token.payload.sub == input.attributes.source.principal
}

token = {"valid": valid, "payload": payload} {
    [_, encoded] := split(input.attributes.request.http.headers["x-jwt-assertion"], " ")
    [valid, _, payload] := io.jwt.decode_verify(encoded, {"secret": data.jwt_secret})
}
`;
      
      await k8sModule.tasks.configMap.run({
        vars,
        log,
        params: {
          name: 'opa-zero-trust-policies',
          namespace: 'istio-system',
          data: { 'policy.rego': policies }
        }
      });
    }))
  )
  
  .build();