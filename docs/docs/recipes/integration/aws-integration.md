---
title: AWS Integration
description: Integrate Xec with AWS services for cloud automation
keywords: [aws, cloud, s3, ec2, lambda, ecs, eks, automation]
source_files:
  - packages/core/src/core/execution-engine.ts
  - packages/core/src/adapters/ssh-adapter.ts
  - packages/core/src/operations/http.ts
key_functions:
  - $.ssh()
  - $.execute()
  - fetch()
verification_date: 2025-08-03
---

# AWS Integration Recipe

## Implementation Reference

**Source Files:**
- `packages/core/src/core/execution-engine.ts` - Core execution engine
- `packages/core/src/adapters/ssh-adapter.ts` - SSH operations for EC2
- `packages/core/src/operations/http.ts` - HTTP operations for AWS APIs

**Key Functions:**
- `$.ssh()` - SSH to EC2 instances
- `$.execute()` - Execute AWS CLI commands
- `fetch()` - Call AWS APIs

## Overview

This recipe demonstrates how to integrate Xec with various AWS services including EC2, S3, Lambda, ECS, EKS, and more for comprehensive cloud automation.

## AWS CLI Setup

### Basic AWS Configuration

```typescript
// setup-aws.ts
import { $ } from '@xec-sh/core';

async function setupAWS() {
  // Check if AWS CLI is installed
  const awsVersion = await $`aws --version`.nothrow();
  if (!awsVersion.ok) {
    console.log('Installing AWS CLI...');
    await $`
      curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
      unzip awscliv2.zip
      sudo ./aws/install
      rm -rf awscliv2.zip aws/
    `;
  }
  
  // Configure AWS credentials
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_DEFAULT_REGION || 'us-east-1';
  
  await $`
    aws configure set aws_access_key_id ${accessKey}
    aws configure set aws_secret_access_key ${secretKey}
    aws configure set default.region ${region}
  `;
  
  // Verify configuration
  const identity = await $`aws sts get-caller-identity`;
  console.log('AWS Identity:', JSON.parse(identity.stdout));
  
  console.log('✅ AWS CLI configured successfully');
}

setupAWS().catch(console.error);
```

## EC2 Management

### EC2 Instance Operations

```typescript
// ec2-management.ts
import { $ } from '@xec-sh/core';

interface EC2Instance {
  instanceId: string;
  name: string;
  type: string;
  state: string;
  publicIp?: string;
  privateIp: string;
}

class EC2Manager {
  private region: string;
  
  constructor(region = 'us-east-1') {
    this.region = region;
  }
  
  async listInstances(filters?: Record<string, string>): Promise<EC2Instance[]> {
    let filterArgs = '';
    if (filters) {
      filterArgs = Object.entries(filters)
        .map(([k, v]) => `Name=${k},Values=${v}`)
        .join(' ');
    }
    
    const result = await $`
      aws ec2 describe-instances \
        --region ${this.region} \
        ${filterArgs ? `--filters ${filterArgs}` : ''} \
        --query 'Reservations[*].Instances[*].[InstanceId,Tags[?Key==\`Name\`]|[0].Value,InstanceType,State.Name,PublicIpAddress,PrivateIpAddress]' \
        --output json
    `;
    
    const instances = JSON.parse(result.stdout).flat();
    return instances.map(([instanceId, name, type, state, publicIp, privateIp]) => ({
      instanceId,
      name: name || 'unnamed',
      type,
      state,
      publicIp,
      privateIp
    }));
  }
  
  async startInstance(instanceId: string): Promise<void> {
    console.log(`Starting instance ${instanceId}...`);
    await $`aws ec2 start-instances --instance-ids ${instanceId} --region ${this.region}`;
    
    // Wait for instance to be running
    await $`
      aws ec2 wait instance-running \
        --instance-ids ${instanceId} \
        --region ${this.region}
    `;
    console.log(`✅ Instance ${instanceId} is running`);
  }
  
  async stopInstance(instanceId: string): Promise<void> {
    console.log(`Stopping instance ${instanceId}...`);
    await $`aws ec2 stop-instances --instance-ids ${instanceId} --region ${this.region}`;
    
    // Wait for instance to be stopped
    await $`
      aws ec2 wait instance-stopped \
        --instance-ids ${instanceId} \
        --region ${this.region}
    `;
    console.log(`✅ Instance ${instanceId} is stopped`);
  }
  
  async createInstance(config: {
    name: string;
    ami: string;
    type: string;
    keyName: string;
    securityGroup: string;
    subnet?: string;
  }): Promise<string> {
    console.log(`Creating EC2 instance ${config.name}...`);
    
    const result = await $`
      aws ec2 run-instances \
        --image-id ${config.ami} \
        --instance-type ${config.type} \
        --key-name ${config.keyName} \
        --security-group-ids ${config.securityGroup} \
        ${config.subnet ? `--subnet-id ${config.subnet}` : ''} \
        --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${config.name}}]" \
        --region ${this.region} \
        --output json
    `;
    
    const response = JSON.parse(result.stdout);
    const instanceId = response.Instances[0].InstanceId;
    
    console.log(`✅ Created instance ${instanceId}`);
    return instanceId;
  }
  
  async executeOnInstance(instanceId: string, command: string): Promise<string> {
    // Get instance IP
    const instance = await this.getInstance(instanceId);
    if (!instance.publicIp) {
      throw new Error(`Instance ${instanceId} has no public IP`);
    }
    
    // Execute via SSH
    const result = await $.ssh({
      host: instance.publicIp,
      user: 'ec2-user',
      privateKey: process.env.EC2_SSH_KEY
    })`${command}`;
    
    return result.stdout;
  }
  
  private async getInstance(instanceId: string): Promise<EC2Instance> {
    const instances = await this.listInstances();
    const instance = instances.find(i => i.instanceId === instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }
    return instance;
  }
}

// Usage
async function manageEC2() {
  const ec2 = new EC2Manager('us-east-1');
  
  // List all running instances
  const instances = await ec2.listInstances({ 'instance-state-name': 'running' });
  console.log('Running instances:', instances);
  
  // Create new instance
  const instanceId = await ec2.createInstance({
    name: 'xec-test-instance',
    ami: 'ami-0c55b159cbfafe1f0', // Amazon Linux 2
    type: 't2.micro',
    keyName: 'my-key-pair',
    securityGroup: 'sg-123456'
  });
  
  // Execute command on instance
  const output = await ec2.executeOnInstance(instanceId, 'uname -a');
  console.log('Command output:', output);
}

manageEC2().catch(console.error);
```

## S3 Operations

### S3 Bucket Management

```typescript
// s3-operations.ts
import { $ } from '@xec-sh/core';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

class S3Manager {
  private region: string;
  
  constructor(region = 'us-east-1') {
    this.region = region;
  }
  
  async createBucket(bucketName: string): Promise<void> {
    console.log(`Creating S3 bucket ${bucketName}...`);
    
    await $`
      aws s3api create-bucket \
        --bucket ${bucketName} \
        --region ${this.region} \
        ${this.region !== 'us-east-1' ? `--create-bucket-configuration LocationConstraint=${this.region}` : ''}
    `;
    
    // Enable versioning
    await $`
      aws s3api put-bucket-versioning \
        --bucket ${bucketName} \
        --versioning-configuration Status=Enabled
    `;
    
    console.log(`✅ Bucket ${bucketName} created`);
  }
  
  async uploadFile(localPath: string, s3Path: string): Promise<void> {
    const stats = await stat(localPath);
    const sizeInMB = stats.size / (1024 * 1024);
    
    if (sizeInMB > 100) {
      // Use multipart upload for large files
      console.log(`Uploading large file ${localPath} (${sizeInMB.toFixed(2)} MB)...`);
      await $`aws s3 cp ${localPath} ${s3Path} --storage-class INTELLIGENT_TIERING`;
    } else {
      console.log(`Uploading ${localPath} to ${s3Path}...`);
      await $`aws s3 cp ${localPath} ${s3Path}`;
    }
    
    console.log(`✅ Uploaded to ${s3Path}`);
  }
  
  async syncDirectory(localDir: string, s3Path: string): Promise<void> {
    console.log(`Syncing ${localDir} to ${s3Path}...`);
    
    await $`
      aws s3 sync ${localDir} ${s3Path} \
        --delete \
        --exclude "*.tmp" \
        --exclude ".git/*"
    `;
    
    console.log(`✅ Synced to ${s3Path}`);
  }
  
  async listObjects(bucket: string, prefix?: string): Promise<any[]> {
    const result = await $`
      aws s3api list-objects-v2 \
        --bucket ${bucket} \
        ${prefix ? `--prefix ${prefix}` : ''} \
        --query 'Contents[*].[Key,Size,LastModified]' \
        --output json
    `;
    
    return JSON.parse(result.stdout);
  }
  
  async setupStaticWebsite(bucket: string): Promise<void> {
    console.log(`Configuring ${bucket} for static website hosting...`);
    
    // Set bucket policy for public access
    const policy = {
      Version: '2012-10-17',
      Statement: [{
        Sid: 'PublicReadGetObject',
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${bucket}/*`
      }]
    };
    
    await $`
      echo '${JSON.stringify(policy)}' | \
      aws s3api put-bucket-policy --bucket ${bucket} --policy file:///dev/stdin
    `;
    
    // Enable website hosting
    await $`
      aws s3api put-bucket-website \
        --bucket ${bucket} \
        --website-configuration '{"IndexDocument":{"Suffix":"index.html"},"ErrorDocument":{"Key":"error.html"}}'
    `;
    
    console.log(`✅ Website hosting enabled for ${bucket}`);
    console.log(`URL: http://${bucket}.s3-website-${this.region}.amazonaws.com`);
  }
}

// Usage
async function deployToS3() {
  const s3 = new S3Manager('us-east-1');
  
  // Create bucket for website
  await s3.createBucket('my-xec-website');
  
  // Build website
  await $`npm run build`;
  
  // Deploy to S3
  await s3.syncDirectory('./dist', 's3://my-xec-website/');
  
  // Setup as static website
  await s3.setupStaticWebsite('my-xec-website');
}

deployToS3().catch(console.error);
```

## Lambda Functions

### Lambda Deployment

```typescript
// lambda-deploy.ts
import { $ } from '@xec-sh/core';
import { readFile } from 'fs/promises';

class LambdaManager {
  async createFunction(config: {
    name: string;
    runtime: string;
    handler: string;
    zipFile: string;
    role: string;
    environment?: Record<string, string>;
  }): Promise<void> {
    console.log(`Creating Lambda function ${config.name}...`);
    
    const envVars = config.environment 
      ? `Variables={${Object.entries(config.environment).map(([k,v]) => `${k}=${v}`).join(',')}}` 
      : '';
    
    await $`
      aws lambda create-function \
        --function-name ${config.name} \
        --runtime ${config.runtime} \
        --handler ${config.handler} \
        --zip-file fileb://${config.zipFile} \
        --role ${config.role} \
        ${envVars ? `--environment ${envVars}` : ''}
    `;
    
    console.log(`✅ Lambda function ${config.name} created`);
  }
  
  async updateFunction(name: string, zipFile: string): Promise<void> {
    console.log(`Updating Lambda function ${name}...`);
    
    await $`
      aws lambda update-function-code \
        --function-name ${name} \
        --zip-file fileb://${zipFile}
    `;
    
    // Wait for update to complete
    await $`
      aws lambda wait function-updated \
        --function-name ${name}
    `;
    
    console.log(`✅ Lambda function ${name} updated`);
  }
  
  async invokeFunction(name: string, payload: any): Promise<any> {
    console.log(`Invoking Lambda function ${name}...`);
    
    const result = await $`
      aws lambda invoke \
        --function-name ${name} \
        --payload '${JSON.stringify(payload)}' \
        --cli-binary-format raw-in-base64-out \
        /tmp/lambda-response.json
    `;
    
    const response = JSON.parse(await readFile('/tmp/lambda-response.json', 'utf-8'));
    return response;
  }
  
  async deployWithDependencies(functionDir: string, functionName: string): Promise<void> {
    console.log(`Building Lambda function from ${functionDir}...`);
    
    // Install dependencies
    await $`cd ${functionDir} && npm ci --production`;
    
    // Create deployment package
    await $`
      cd ${functionDir} && \
      zip -r /tmp/lambda-${functionName}.zip . \
        -x "*.git*" \
        -x "*.test.js" \
        -x "node_modules/aws-sdk/*"
    `;
    
    // Check if function exists
    const exists = await $`aws lambda get-function --function-name ${functionName}`.nothrow();
    
    if (exists.ok) {
      await this.updateFunction(functionName, `/tmp/lambda-${functionName}.zip`);
    } else {
      await this.createFunction({
        name: functionName,
        runtime: 'nodejs18.x',
        handler: 'index.handler',
        zipFile: `/tmp/lambda-${functionName}.zip`,
        role: process.env.LAMBDA_ROLE!
      });
    }
    
    // Cleanup
    await $`rm -f /tmp/lambda-${functionName}.zip`;
  }
}

// Usage
async function deployLambda() {
  const lambda = new LambdaManager();
  
  // Deploy function
  await lambda.deployWithDependencies('./lambda/my-function', 'my-function');
  
  // Test invocation
  const result = await lambda.invokeFunction('my-function', {
    action: 'test',
    data: { message: 'Hello from Xec!' }
  });
  
  console.log('Lambda response:', result);
}

deployLambda().catch(console.error);
```

## ECS/Fargate Deployment

### ECS Task Management

```typescript
// ecs-deploy.ts
import { $ } from '@xec-sh/core';

class ECSManager {
  private cluster: string;
  private region: string;
  
  constructor(cluster: string, region = 'us-east-1') {
    this.cluster = cluster;
    this.region = region;
  }
  
  async deployService(config: {
    service: string;
    taskDefinition: string;
    image: string;
    desiredCount?: number;
  }): Promise<void> {
    console.log(`Deploying ECS service ${config.service}...`);
    
    // Register new task definition with updated image
    const taskDefJson = await $`
      aws ecs describe-task-definition \
        --task-definition ${config.taskDefinition} \
        --query taskDefinition \
        --output json
    `;
    
    const taskDef = JSON.parse(taskDefJson.stdout);
    taskDef.containerDefinitions[0].image = config.image;
    
    // Remove fields that can't be in registration
    delete taskDef.taskDefinitionArn;
    delete taskDef.revision;
    delete taskDef.status;
    delete taskDef.requiresAttributes;
    delete taskDef.compatibilities;
    delete taskDef.registeredAt;
    delete taskDef.registeredBy;
    
    await $`
      echo '${JSON.stringify(taskDef)}' | \
      aws ecs register-task-definition --cli-input-json file:///dev/stdin
    `;
    
    // Update service with new task definition
    await $`
      aws ecs update-service \
        --cluster ${this.cluster} \
        --service ${config.service} \
        --task-definition ${config.taskDefinition} \
        ${config.desiredCount ? `--desired-count ${config.desiredCount}` : ''}
    `;
    
    // Wait for service to stabilize
    await $`
      aws ecs wait services-stable \
        --cluster ${this.cluster} \
        --services ${config.service}
    `;
    
    console.log(`✅ ECS service ${config.service} deployed`);
  }
  
  async runTask(taskDefinition: string, overrides?: any): Promise<string> {
    console.log(`Running ECS task ${taskDefinition}...`);
    
    const result = await $`
      aws ecs run-task \
        --cluster ${this.cluster} \
        --task-definition ${taskDefinition} \
        --launch-type FARGATE \
        --network-configuration "awsvpcConfiguration={subnets=[${process.env.ECS_SUBNETS}],securityGroups=[${process.env.ECS_SECURITY_GROUPS}],assignPublicIp=ENABLED}" \
        ${overrides ? `--overrides '${JSON.stringify(overrides)}'` : ''} \
        --output json
    `;
    
    const response = JSON.parse(result.stdout);
    const taskArn = response.tasks[0].taskArn;
    
    console.log(`✅ Task started: ${taskArn}`);
    return taskArn;
  }
  
  async getLogs(service: string, since = '5m'): Promise<void> {
    const logGroup = `/ecs/${this.cluster}/${service}`;
    
    const logs = await $`
      aws logs tail ${logGroup} \
        --since ${since} \
        --follow
    `.nothrow();
    
    console.log(logs.stdout);
  }
}

// Usage
async function deployToECS() {
  const ecs = new ECSManager('my-cluster');
  
  // Build and push Docker image
  const imageTag = `${process.env.ECR_REGISTRY}/my-app:${process.env.BUILD_NUMBER}`;
  await $`docker build -t ${imageTag} .`;
  await $`docker push ${imageTag}`;
  
  // Deploy to ECS
  await ecs.deployService({
    service: 'my-app-service',
    taskDefinition: 'my-app-task',
    image: imageTag,
    desiredCount: 3
  });
  
  // Check logs
  await ecs.getLogs('my-app-service');
}

deployToECS().catch(console.error);
```

## EKS Integration

### EKS Cluster Management

```typescript
// eks-management.ts
import { $ } from '@xec-sh/core';

class EKSManager {
  private clusterName: string;
  private region: string;
  
  constructor(clusterName: string, region = 'us-east-1') {
    this.clusterName = clusterName;
    this.region = region;
  }
  
  async setupKubeconfig(): Promise<void> {
    console.log(`Setting up kubeconfig for ${this.clusterName}...`);
    
    await $`
      aws eks update-kubeconfig \
        --name ${this.clusterName} \
        --region ${this.region}
    `;
    
    // Verify connection
    await $`kubectl get nodes`;
    
    console.log(`✅ Kubeconfig configured for ${this.clusterName}`);
  }
  
  async deployApplication(manifest: string): Promise<void> {
    console.log(`Deploying application to EKS...`);
    
    await $`kubectl apply -f ${manifest}`;
    
    // Wait for deployment to be ready
    const deployment = await $`kubectl get deployment -o json`.then(
      r => JSON.parse(r.stdout).items[0].metadata.name
    );
    
    await $`kubectl rollout status deployment/${deployment}`;
    
    console.log(`✅ Application deployed to EKS`);
  }
  
  async scaleDeployment(name: string, replicas: number): Promise<void> {
    console.log(`Scaling ${name} to ${replicas} replicas...`);
    
    await $`kubectl scale deployment/${name} --replicas=${replicas}`;
    await $`kubectl rollout status deployment/${name}`;
    
    console.log(`✅ Scaled ${name} to ${replicas} replicas`);
  }
  
  async setupIngress(): Promise<void> {
    console.log('Setting up AWS Load Balancer Controller...');
    
    // Install AWS Load Balancer Controller
    await $`
      helm repo add eks https://aws.github.io/eks-charts
      helm repo update
      helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
        -n kube-system \
        --set clusterName=${this.clusterName}
    `;
    
    console.log('✅ AWS Load Balancer Controller installed');
  }
}

// Usage
async function deployToEKS() {
  const eks = new EKSManager('my-eks-cluster');
  
  // Setup kubeconfig
  await eks.setupKubeconfig();
  
  // Deploy application
  await eks.deployApplication('./k8s/deployment.yaml');
  
  // Scale based on load
  await eks.scaleDeployment('my-app', 5);
}

deployToEKS().catch(console.error);
```

## CloudFormation/CDK

### CloudFormation Stack Management

```typescript
// cloudformation-deploy.ts
import { $ } from '@xec-sh/core';

class CloudFormationManager {
  async deployStack(stackName: string, templateFile: string, parameters?: Record<string, string>): Promise<void> {
    console.log(`Deploying CloudFormation stack ${stackName}...`);
    
    const paramString = parameters 
      ? Object.entries(parameters).map(([k,v]) => `${k}=${v}`).join(' ')
      : '';
    
    await $`
      aws cloudformation deploy \
        --template-file ${templateFile} \
        --stack-name ${stackName} \
        --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
        ${paramString ? `--parameter-overrides ${paramString}` : ''}
    `;
    
    console.log(`✅ Stack ${stackName} deployed`);
  }
  
  async getStackOutputs(stackName: string): Promise<Record<string, string>> {
    const result = await $`
      aws cloudformation describe-stacks \
        --stack-name ${stackName} \
        --query 'Stacks[0].Outputs' \
        --output json
    `;
    
    const outputs = JSON.parse(result.stdout);
    return outputs.reduce((acc: any, out: any) => {
      acc[out.OutputKey] = out.OutputValue;
      return acc;
    }, {});
  }
}

// CDK Deployment
async function deployCDK() {
  // Install CDK if needed
  await $`npm install -g aws-cdk`.nothrow();
  
  // Bootstrap CDK
  await $`cdk bootstrap`;
  
  // Synthesize stack
  await $`cdk synth`;
  
  // Deploy stack
  await $`cdk deploy --require-approval never`;
  
  console.log('✅ CDK stack deployed');
}
```

## Monitoring with CloudWatch

### CloudWatch Metrics and Alarms

```typescript
// cloudwatch-monitoring.ts
import { $ } from '@xec-sh/core';

class CloudWatchManager {
  async putMetric(namespace: string, metricName: string, value: number, unit = 'Count'): Promise<void> {
    await $`
      aws cloudwatch put-metric-data \
        --namespace ${namespace} \
        --metric-name ${metricName} \
        --value ${value} \
        --unit ${unit}
    `;
  }
  
  async createAlarm(config: {
    name: string;
    metric: string;
    namespace: string;
    threshold: number;
    comparison: string;
    snsTopicArn: string;
  }): Promise<void> {
    await $`
      aws cloudwatch put-metric-alarm \
        --alarm-name ${config.name} \
        --alarm-description "Alarm for ${config.metric}" \
        --metric-name ${config.metric} \
        --namespace ${config.namespace} \
        --statistic Average \
        --period 300 \
        --threshold ${config.threshold} \
        --comparison-operator ${config.comparison} \
        --evaluation-periods 2 \
        --alarm-actions ${config.snsTopicArn}
    `;
    
    console.log(`✅ Alarm ${config.name} created`);
  }
  
  async getMetrics(namespace: string, metricName: string, startTime: Date, endTime: Date): Promise<any> {
    const result = await $`
      aws cloudwatch get-metric-statistics \
        --namespace ${namespace} \
        --metric-name ${metricName} \
        --start-time ${startTime.toISOString()} \
        --end-time ${endTime.toISOString()} \
        --period 3600 \
        --statistics Average,Maximum,Minimum \
        --output json
    `;
    
    return JSON.parse(result.stdout);
  }
}
```

## Configuration

### Xec Configuration for AWS

```yaml
# .xec/config.yaml
aws:
  region: us-east-1
  profile: default
  
targets:
  ec2-prod:
    type: ssh
    host: ${AWS_EC2_HOST}
    user: ec2-user
    privateKey: ${AWS_EC2_KEY}
    
tasks:
  aws:deploy:
    description: Deploy to AWS
    params:
      - name: service
        required: true
        values: [ec2, ecs, lambda, s3]
    steps:
      - name: Build
        command: npm run build
      - name: Deploy
        command: xec run deploy-${params.service}.ts
        
  aws:backup:
    description: Backup AWS resources
    command: |
      aws s3 sync s3://prod-data s3://backup-data --storage-class GLACIER
      aws rds create-db-snapshot --db-instance-identifier prod-db --db-snapshot-identifier backup-$(date +%Y%m%d)
      
  aws:monitor:
    description: Check AWS resources
    command: xec run aws-health-check.ts
```

## Performance Characteristics

**Based on Implementation:**

### AWS API Performance
- **API Call Latency**: 100-500ms per call
- **S3 Upload**: 10-100MB/s depending on region
- **EC2 Launch Time**: 30-60 seconds
- **Lambda Cold Start**: 100-500ms

### Operation Timings
- **CloudFormation Deploy**: 2-30 minutes
- **ECS Service Update**: 2-5 minutes
- **Lambda Deploy**: 10-30 seconds
- **S3 Sync**: Varies with data size

## Best Practices

1. **Use IAM Roles** instead of access keys when possible
2. **Tag all resources** for cost tracking
3. **Enable versioning** on S3 buckets
4. **Use CloudFormation/CDK** for infrastructure as code
5. **Monitor with CloudWatch** alarms
6. **Implement retry logic** for API calls
7. **Use appropriate instance types** for workloads

## Troubleshooting

### Common Issues

1. **Permission Denied**
   - Check IAM policies
   - Verify credentials are configured

2. **Region Mismatch**
   ```bash
   export AWS_DEFAULT_REGION=us-east-1
   ```

3. **Rate Limiting**
   - Implement exponential backoff
   - Use batch operations

## Related Recipes

- [GitHub Actions](./github-actions.md) - CI/CD with AWS
- [Docker Deploy](../deployment/docker-deploy.md) - Container deployment
- [K8s Deploy](../deployment/k8s-deploy.md) - Kubernetes on EKS
- [Backup Restore](../maintenance/backup-restore.md) - AWS backup strategies

## See Also

- [SSH Targets](../../targets/ssh/overview.md) - EC2 SSH access
- [Docker Targets](../../targets/docker/overview.md) - ECS/Fargate
- [Kubernetes Targets](../../targets/kubernetes/overview.md) - EKS integration