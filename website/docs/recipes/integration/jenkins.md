---
title: Jenkins Integration
description: Integrate Xec with Jenkins CI/CD pipelines
keywords: [jenkins, ci, cd, pipeline, automation, groovy]
source_files:
  - packages/core/src/core/execution-engine.ts
  - apps/xec/src/commands/run.ts
  - apps/xec/src/main.ts
key_functions:
  - $.execute()
  - RunCommand.execute()
  - main()
verification_date: 2025-08-03
---

# Jenkins Integration Recipe

## Implementation Reference

**Source Files:**
- `packages/core/src/core/execution-engine.ts` - Core execution engine
- `apps/xec/src/commands/run.ts` - Script execution
- `apps/xec/src/main.ts` - CLI entry point

**Key Functions:**
- `$.execute()` - Command execution
- `RunCommand.execute()` - Script runner
- `main()` - CLI initialization

## Overview

This recipe demonstrates how to integrate Xec with Jenkins for continuous integration and deployment pipelines using both declarative and scripted pipelines.

## Declarative Pipeline

### Basic Jenkins Pipeline

```groovy
// Jenkinsfile
pipeline {
    agent any
    
    environment {
        XEC_VERSION = 'latest'
        NODE_VERSION = '18'
    }
    
    tools {
        nodejs "${NODE_VERSION}"
    }
    
    stages {
        stage('Setup') {
            steps {
                sh 'npm install -g @xec-sh/cli@${XEC_VERSION}'
                sh 'xec --version'
                sh 'npm ci'
            }
        }
        
        stage('Validate') {
            steps {
                sh 'xec config validate'
                sh 'xec inspect --targets'
            }
        }
        
        stage('Test') {
            parallel {
                stage('Unit Tests') {
                    steps {
                        sh 'xec test:unit --coverage'
                    }
                }
                stage('Integration Tests') {
                    steps {
                        sh 'xec test:integration'
                    }
                }
                stage('Lint') {
                    steps {
                        sh 'xec lint --fix'
                    }
                }
            }
            post {
                always {
                    junit 'test-results/**/*.xml'
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'coverage',
                        reportFiles: 'index.html',
                        reportName: 'Coverage Report'
                    ])
                }
            }
        }
        
        stage('Build') {
            steps {
                sh 'xec build --env=production'
                archiveArtifacts artifacts: 'dist/**/*', fingerprint: true
            }
        }
        
        stage('Deploy to Staging') {
            when {
                branch 'develop'
            }
            steps {
                sh 'xec deploy staging --auto-approve'
            }
        }
        
        stage('Deploy to Production') {
            when {
                branch 'main'
            }
            input {
                message "Deploy to production?"
                ok "Deploy"
                parameters {
                    string(name: 'VERSION', defaultValue: 'latest', description: 'Version to deploy')
                }
            }
            steps {
                sh "xec deploy production --version=${params.VERSION}"
            }
        }
    }
    
    post {
        success {
            slackSend(
                color: 'good',
                message: "Build Successful: ${env.JOB_NAME} - ${env.BUILD_NUMBER}"
            )
        }
        failure {
            slackSend(
                color: 'danger',
                message: "Build Failed: ${env.JOB_NAME} - ${env.BUILD_NUMBER}"
            )
        }
        always {
            cleanWs()
        }
    }
}
```

## Advanced Pipeline with Docker

### Multi-Stage Docker Pipeline

```groovy
// Jenkinsfile
pipeline {
    agent none
    
    environment {
        DOCKER_REGISTRY = 'registry.example.com'
        IMAGE_NAME = "${DOCKER_REGISTRY}/${env.JOB_NAME}"
        IMAGE_TAG = "${env.BRANCH_NAME}-${env.BUILD_NUMBER}"
    }
    
    stages {
        stage('Build & Test') {
            agent {
                docker {
                    image 'node:18-alpine'
                    args '-v /var/run/docker.sock:/var/run/docker.sock'
                }
            }
            stages {
                stage('Install Xec') {
                    steps {
                        sh '''
                            npm install -g @xec-sh/cli
                            xec --version
                        '''
                    }
                }
                
                stage('Run Tests') {
                    steps {
                        script {
                            // Create test script
                            writeFile file: 'run-tests.ts', text: '''
                                import { $ } from '@xec-sh/core';
                                
                                async function runTests() {
                                    console.log('Starting test suite...');
                                    
                                    // Run unit tests
                                    const unitTests = await $`npm run test:unit`.nothrow();
                                    if (!unitTests.ok) {
                                        throw new Error('Unit tests failed');
                                    }
                                    
                                    // Run integration tests with Docker
                                    await $`docker-compose -f docker-compose.test.yml up -d`;
                                    
                                    try {
                                        const integrationTests = await $`npm run test:integration`;
                                        console.log('✅ All tests passed');
                                    } finally {
                                        await $`docker-compose -f docker-compose.test.yml down`;
                                    }
                                }
                                
                                runTests().catch(err => {
                                    console.error(err);
                                    process.exit(1);
                                });
                            '''
                            
                            sh 'xec run run-tests.ts'
                        }
                    }
                }
            }
        }
        
        stage('Build Docker Image') {
            agent any
            steps {
                script {
                    docker.build("${IMAGE_NAME}:${IMAGE_TAG}")
                }
            }
        }
        
        stage('Push to Registry') {
            agent any
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                script {
                    docker.withRegistry("https://${DOCKER_REGISTRY}", 'docker-credentials') {
                        docker.image("${IMAGE_NAME}:${IMAGE_TAG}").push()
                        if (env.BRANCH_NAME == 'main') {
                            docker.image("${IMAGE_NAME}:${IMAGE_TAG}").push('latest')
                        }
                    }
                }
            }
        }
        
        stage('Deploy') {
            agent any
            when {
                branch 'main'
            }
            steps {
                script {
                    // Create deployment script
                    writeFile file: 'deploy.ts', text: """
                        import { \$ } from '@xec-sh/core';
                        
                        async function deploy() {
                            const image = '${IMAGE_NAME}:${IMAGE_TAG}';
                            const servers = ['prod-1', 'prod-2', 'prod-3'];
                            
                            // Rolling deployment
                            for (const server of servers) {
                                console.log(\`Deploying to \${server}...\`);
                                
                                await \$.ssh(server)\`
                                    docker pull \${image}
                                    docker stop app || true
                                    docker rm app || true
                                    docker run -d --name app -p 80:3000 \${image}
                                \`;
                                
                                // Health check
                                for (let i = 0; i < 30; i++) {
                                    const health = await \$.ssh(server)\`curl -f http://localhost/health\`.nothrow();
                                    if (health.ok) break;
                                    await new Promise(r => setTimeout(r, 2000));
                                }
                                
                                console.log(\`✅ \${server} deployed\`);
                            }
                        }
                        
                        deploy().catch(err => {
                            console.error(err);
                            process.exit(1);
                        });
                    """
                    
                    sh 'xec run deploy.ts'
                }
            }
        }
    }
}
```

## Scripted Pipeline

### Dynamic Pipeline Generation

```groovy
// Jenkinsfile
@Library('shared-pipeline-library') _

node {
    stage('Checkout') {
        checkout scm
    }
    
    stage('Setup Xec') {
        sh '''
            npm install -g @xec-sh/cli
            xec --version
        '''
    }
    
    stage('Generate Pipeline') {
        script {
            // Generate pipeline based on project structure
            def services = sh(
                script: 'ls -d services/*/ | xargs -n1 basename',
                returnStdout: true
            ).trim().split('\n')
            
            def parallelTests = [:]
            services.each { service ->
                parallelTests["Test ${service}"] = {
                    sh "xec test services/${service}"
                }
            }
            
            parallel parallelTests
            
            def parallelBuilds = [:]
            services.each { service ->
                parallelBuilds["Build ${service}"] = {
                    sh "xec build services/${service}"
                }
            }
            
            parallel parallelBuilds
        }
    }
    
    stage('Deploy Services') {
        script {
            writeFile file: 'deploy-services.ts', text: '''
                import { $ } from '@xec-sh/core';
                import { readdir } from 'fs/promises';
                
                async function deployServices() {
                    const services = await readdir('services');
                    
                    for (const service of services) {
                        console.log(`Deploying ${service}...`);
                        
                        await $`kubectl apply -f services/${service}/k8s/`;
                        await $`kubectl rollout status deployment/${service}`;
                        
                        console.log(`✅ ${service} deployed`);
                    }
                }
                
                deployServices().catch(console.error);
            '''
            
            sh 'xec run deploy-services.ts'
        }
    }
}
```

## Jenkins Shared Library

### Xec Pipeline Library

```groovy
// vars/xecPipeline.groovy
def call(Map config) {
    pipeline {
        agent any
        
        environment {
            XEC_CONFIG = config.xecConfig ?: '.xec/config.yaml'
        }
        
        stages {
            stage('Initialize') {
                steps {
                    script {
                        sh 'npm install -g @xec-sh/cli'
                        
                        if (config.setupScript) {
                            writeFile file: 'setup.ts', text: config.setupScript
                            sh 'xec run setup.ts'
                        }
                    }
                }
            }
            
            stage('Execute Tasks') {
                steps {
                    script {
                        config.tasks.each { task ->
                            stage(task.name) {
                                if (task.parallel) {
                                    def parallelTasks = [:]
                                    task.commands.each { cmd ->
                                        parallelTasks[cmd.name] = {
                                            sh "xec ${cmd.command}"
                                        }
                                    }
                                    parallel parallelTasks
                                } else {
                                    sh "xec ${task.command}"
                                }
                            }
                        }
                    }
                }
            }
        }
        
        post {
            always {
                script {
                    if (config.cleanupScript) {
                        writeFile file: 'cleanup.ts', text: config.cleanupScript
                        sh 'xec run cleanup.ts'
                    }
                }
            }
        }
    }
}
```

Usage:
```groovy
// Jenkinsfile
@Library('xec-pipeline-library') _

xecPipeline([
    xecConfig: '.xec/config.yaml',
    setupScript: '''
        import { $ } from '@xec-sh/core';
        await $`npm ci`;
        console.log('Setup complete');
    ''',
    tasks: [
        [name: 'Test', command: 'test --coverage'],
        [name: 'Build', command: 'build --env=production'],
        [name: 'Deploy', command: 'deploy staging']
    ],
    cleanupScript: '''
        import { $ } from '@xec-sh/core';
        await $`docker-compose down`;
        console.log('Cleanup complete');
    '''
])
```

## Blue Ocean Pipeline

### Visual Pipeline Configuration

```groovy
// Jenkinsfile for Blue Ocean
pipeline {
    agent any
    
    stages {
        stage('Build and Test') {
            parallel {
                stage('Frontend') {
                    stages {
                        stage('Install') {
                            steps {
                                sh 'cd frontend && npm ci'
                            }
                        }
                        stage('Test') {
                            steps {
                                sh 'xec test:frontend'
                            }
                        }
                        stage('Build') {
                            steps {
                                sh 'xec build:frontend'
                            }
                        }
                    }
                }
                
                stage('Backend') {
                    stages {
                        stage('Install') {
                            steps {
                                sh 'cd backend && npm ci'
                            }
                        }
                        stage('Test') {
                            steps {
                                sh 'xec test:backend'
                            }
                        }
                        stage('Build') {
                            steps {
                                sh 'xec build:backend'
                            }
                        }
                    }
                }
            }
        }
        
        stage('Integration Tests') {
            steps {
                sh 'xec test:e2e'
            }
        }
        
        stage('Deploy') {
            steps {
                sh 'xec deploy --parallel'
            }
        }
    }
}
```

## Jenkins Configuration as Code

### JCasC with Xec Jobs

```yaml
# jenkins.yaml
jenkins:
  systemMessage: "Jenkins with Xec CI/CD"
  
jobs:
  - script: >
      pipelineJob('xec-deploy') {
        definition {
          cpsScm {
            scm {
              git {
                remote {
                  url('https://github.com/example/repo.git')
                }
                branches('*/main')
              }
            }
            scriptPath('Jenkinsfile')
          }
        }
        triggers {
          githubPush()
        }
      }
      
  - script: >
      multibranchPipelineJob('xec-multi-branch') {
        branchSources {
          github {
            id('github')
            scanCredentialsId('github-token')
            repoOwner('example')
            repository('repo')
          }
        }
        orphanedItemStrategy {
          discardOldItems {
            numToKeep(10)
          }
        }
      }

tools:
  nodejs:
    installations:
      - name: "Node 18"
        properties:
          - installSource:
              installers:
                - nodeJSInstaller:
                    id: "18.0.0"
                    npmPackagesRefreshHours: 72
```

## Credentials Management

### Using Jenkins Credentials

```groovy
// Jenkinsfile
pipeline {
    agent any
    
    environment {
        SSH_KEY = credentials('ssh-deploy-key')
        AWS_CREDENTIALS = credentials('aws-credentials')
        DOCKER_AUTH = credentials('docker-registry')
    }
    
    stages {
        stage('Deploy with Credentials') {
            steps {
                script {
                    writeFile file: 'deploy-secure.ts', text: '''
                        import { $ } from '@xec-sh/core';
                        
                        async function deploySecure() {
                            // Use SSH key
                            await $`
                                echo "${SSH_KEY}" > /tmp/deploy_key
                                chmod 600 /tmp/deploy_key
                            `;
                            
                            // Configure AWS
                            process.env.AWS_ACCESS_KEY_ID = process.env.AWS_CREDENTIALS_USR;
                            process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_CREDENTIALS_PSW;
                            
                            // Docker login
                            await $`echo ${DOCKER_AUTH_PSW} | docker login -u ${DOCKER_AUTH_USR} --password-stdin`;
                            
                            // Deploy
                            await $`ssh -i /tmp/deploy_key user@host "
                                docker pull myapp:latest
                                docker stop app || true
                                docker rm app || true
                                docker run -d --name app myapp:latest
                            "`;
                            
                            // Cleanup
                            await $`rm -f /tmp/deploy_key`;
                        }
                        
                        deploySecure().catch(console.error);
                    '''
                    
                    sh 'xec run deploy-secure.ts'
                }
            }
        }
    }
}
```

## Performance Monitoring

### Pipeline Metrics Collection

```typescript
// collect-metrics.ts
import { $ } from '@xec-sh/core';

async function collectMetrics() {
  const jobName = process.env.JOB_NAME;
  const buildNumber = process.env.BUILD_NUMBER;
  const startTime = Date.now();
  
  // Run build
  const buildResult = await $`xec build`.nothrow();
  const buildTime = Date.now() - startTime;
  
  // Collect metrics
  const metrics = {
    job: jobName,
    build: buildNumber,
    duration: buildTime,
    success: buildResult.ok,
    timestamp: new Date().toISOString(),
    stages: {
      build: buildTime,
      test: 0,
      deploy: 0
    }
  };
  
  // Send to monitoring system
  await fetch('http://metrics.example.com/jenkins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metrics)
  });
  
  console.log('Metrics collected:', metrics);
}

collectMetrics().catch(console.error);
```

## Jenkins Agents with Xec

### Docker Agent Configuration

```groovy
// Jenkinsfile
pipeline {
    agent {
        dockerfile {
            filename 'Dockerfile.jenkins'
            dir 'ci'
            additionalBuildArgs '--build-arg XEC_VERSION=latest'
        }
    }
    
    stages {
        stage('Test') {
            steps {
                sh 'xec test'
            }
        }
    }
}
```

```dockerfile
# ci/Dockerfile.jenkins
FROM node:18-alpine

ARG XEC_VERSION=latest

RUN apk add --no-cache \
    git \
    docker \
    openssh-client

RUN npm install -g @xec-sh/cli@${XEC_VERSION}

WORKDIR /workspace
```

### Kubernetes Agent

```groovy
// Jenkinsfile
pipeline {
    agent {
        kubernetes {
            yaml '''
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: xec
    image: node:18
    command:
    - sleep
    args:
    - infinity
    volumeMounts:
    - name: docker-sock
      mountPath: /var/run/docker.sock
  - name: docker
    image: docker:dind
    securityContext:
      privileged: true
  volumes:
  - name: docker-sock
    hostPath:
      path: /var/run/docker.sock
'''
        }
    }
    
    stages {
        stage('Build') {
            steps {
                container('xec') {
                    sh '''
                        npm install -g @xec-sh/cli
                        xec build --docker
                    '''
                }
            }
        }
    }
}
```

## Xec Configuration for Jenkins

```yaml
# .xec/config.yaml
ci:
  provider: jenkins
  
tasks:
  jenkins:setup:
    description: Setup Jenkins environment
    command: |
      npm ci
      xec config validate
      
  jenkins:test:
    description: Run tests in Jenkins
    command: |
      xec test --junit-output=test-results.xml
      
  jenkins:deploy:
    description: Deploy from Jenkins
    params:
      - name: environment
        required: true
    command: |
      xec deploy ${params.environment} \
        --build-number=${BUILD_NUMBER} \
        --job-name=${JOB_NAME}
```

## Performance Characteristics

**Based on Implementation:**

### Pipeline Performance
- **Agent Startup**: 10-30 seconds (Docker), 30-60 seconds (K8s)
- **Xec Installation**: 10-20 seconds
- **Workspace Checkout**: 5-60 seconds
- **Archive Artifacts**: 5-30 seconds

### Optimization Tips
- Use pipeline caching for dependencies
- Parallelize independent stages
- Use lightweight agents for simple tasks
- Archive only necessary artifacts

## Troubleshooting

### Common Issues

1. **Node Version Mismatch**
   ```groovy
   tools {
       nodejs 'Node 18'
   }
   ```

2. **Docker Socket Permission**
   ```groovy
   agent {
       docker {
           args '-v /var/run/docker.sock:/var/run/docker.sock --group-add docker'
       }
   }
   ```

3. **Workspace Cleanup**
   ```groovy
   post {
       always {
           cleanWs()
       }
   }
   ```

## Related Recipes

- [GitHub Actions](./github-actions.md) - GitHub CI/CD
- [GitLab CI](./gitlab-ci.md) - GitLab pipelines
- [Docker Deploy](../deployment/docker-deploy.md) - Container deployment
- [K8s Deploy](../deployment/k8s-deploy.md) - Kubernetes deployment

## See Also

- [CLI Reference](../../commands/cli-reference.md)
- [Script Execution](../../scripting/basics/first-script.md)
- [Task Configuration](../../configuration/tasks/overview.md)