import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { AWSConfig, AWSAdapter } from '../../../src/integrations/aws-adapter.js';

describe.skip('integrations/aws-adapter', () => {
  let adapter: AWSAdapter;
  const config: AWSConfig = {
    region: 'us-west-2',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
  };

  // Save original env vars
  const originalEnv = { ...process.env };

  beforeEach(() => {
    adapter = new AWSAdapter(config);
  });

  afterEach(() => {
    // Restore env vars
    process.env = { ...originalEnv };
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(adapter.isConnected()).toBe(false);
      expect((adapter as any).awsConfig.region).toBe('us-west-2');
    });

    it('should use environment variables for configuration', () => {
      process.env.AWS_REGION = 'eu-west-1';
      process.env.AWS_PROFILE = 'test-profile';
      
      const envAdapter = new AWSAdapter({});
      expect((envAdapter as any).awsConfig.region).toBe('eu-west-1');
      expect((envAdapter as any).awsConfig.profile).toBe('test-profile');
    });

    it('should set default values', () => {
      const minimalAdapter = new AWSAdapter({});
      expect((minimalAdapter as any).awsConfig.name).toBe('aws');
      expect((minimalAdapter as any).awsConfig.type).toBe('cloud');
      expect((minimalAdapter as any).awsConfig.region).toBe('us-east-1');
    });
  });

  describe('connect', () => {
    it('should connect with access keys', async () => {
      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);
    });

    it('should connect with profile', async () => {
      const profileAdapter = new AWSAdapter({ profile: 'test-profile' });
      await profileAdapter.connect();
      expect(profileAdapter.isConnected()).toBe(true);
    });

    it('should connect with environment credentials', async () => {
      process.env.AWS_ACCESS_KEY_ID = 'env-access-key';
      const envAdapter = new AWSAdapter({});
      await envAdapter.connect();
      expect(envAdapter.isConnected()).toBe(true);
    });

    it('should throw error when no credentials available', async () => {
      const noCredsAdapter = new AWSAdapter({});
      await expect(noCredsAdapter.connect()).rejects.toThrow(
        'AWS credentials not configured'
      );
    });
  });

  describe('disconnect', () => {
    it('should disconnect and clear clients', async () => {
      await adapter.connect();
      await adapter.disconnect();
      
      expect(adapter.isConnected()).toBe(false);
      expect((adapter as any).sdkClients.size).toBe(0);
    });
  });

  describe('execute', () => {
    it('should auto-connect if not connected', async () => {
      const result = await adapter.execute('ec2.describeInstances');
      expect(adapter.isConnected()).toBe(true);
      expect(result).toBeDefined();
    });

    it('should execute EC2 operations', async () => {
      await adapter.connect();
      
      const describeResult = await adapter.execute('ec2.describeInstances');
      expect(describeResult.Reservations).toBeDefined();
      expect(describeResult.Reservations[0].Instances).toHaveLength(1);
      
      const startResult = await adapter.execute('ec2.startInstances', {
        InstanceIds: ['i-1234567890abcdef0']
      });
      expect(startResult.StartingInstances).toBeDefined();
    });

    it('should execute S3 operations', async () => {
      await adapter.connect();
      
      const listResult = await adapter.execute('s3.listBuckets');
      expect(listResult.Buckets).toBeDefined();
      expect(Array.isArray(listResult.Buckets)).toBe(true);
      
      const getResult = await adapter.execute('s3.getObject', {
        Bucket: 'test-bucket',
        Key: 'test-key'
      });
      expect(getResult.Body).toBeDefined();
    });

    it('should execute Lambda operations', async () => {
      await adapter.connect();
      
      const listResult = await adapter.execute('lambda.listFunctions');
      expect(listResult.Functions).toBeDefined();
      
      const invokeResult = await adapter.execute('lambda.invoke', {
        FunctionName: 'test-function',
        Payload: JSON.stringify({ test: true })
      });
      expect(invokeResult.StatusCode).toBe(200);
    });

    it('should execute CloudFormation operations', async () => {
      await adapter.connect();
      
      const listResult = await adapter.execute('cloudformation.listStacks');
      expect(listResult.StackSummaries).toBeDefined();
      
      const describeResult = await adapter.execute('cloudformation.describeStacks', {
        StackName: 'test-stack'
      });
      expect(describeResult.Stacks).toBeDefined();
    });

    it('should throw error for unsupported service', async () => {
      await adapter.connect();
      await expect(
        adapter.execute('unsupported.action')
      ).rejects.toThrow('Unsupported AWS service: unsupported');
    });
  });

  describe('healthCheck', () => {
    it('should return true when healthy', async () => {
      await adapter.connect();
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should return false when error occurs', async () => {
      // Mock STS getCallerIdentity to fail
      vi.spyOn(adapter as any, 'getClient').mockImplementation(() => ({
          getCallerIdentity: () => ({
            promise: () => Promise.reject(new Error('Network error'))
          })
        }));

      await adapter.connect();
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('should validate valid config', () => {
      const valid = adapter.validateConfig({
        region: 'us-east-1',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      });
      expect(valid).toBe(true);
    });

    it('should validate config with profile', () => {
      const valid = adapter.validateConfig({
        region: 'us-east-1',
        profile: 'default',
      });
      expect(valid).toBe(true);
    });

    it('should reject config without credentials', () => {
      const valid = adapter.validateConfig({
        region: 'us-east-1',
      });
      expect(valid).toBe(false);
    });

    it('should reject invalid region', () => {
      const valid = adapter.validateConfig({
        region: 'invalid-region',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      });
      expect(valid).toBe(false);
    });
  });

  describe('task creation', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should create EC2 instance task', () => {
      const instanceTask = adapter.createEC2InstanceTask({
        name: 'web-server',
        instanceType: 't2.micro',
        ami: 'ami-12345678',
        keyName: 'my-keypair',
        securityGroups: ['sg-12345678'],
        tags: { Name: 'WebServer', Environment: 'production' }
      });

      expect(instanceTask.name).toBe('create-ec2-web-server');
      expect(instanceTask.handler).toBeDefined();
    });

    it('should create S3 bucket task', () => {
      const bucketTask = adapter.createS3BucketTask({
        name: 'my-bucket',
        region: 'us-west-2',
        versioning: true,
        encryption: true,
        publicAccess: false
      });

      expect(bucketTask.name).toBe('create-s3-my-bucket');
      expect(bucketTask.handler).toBeDefined();
    });

    it('should create Lambda function task', () => {
      const lambdaTask = adapter.createLambdaFunctionTask({
        name: 'my-function',
        runtime: 'nodejs18.x',
        handler: 'index.handler',
        code: { zipFile: 'PK...' },
        role: 'arn:aws:iam::123456789012:role/lambda-role',
        environment: { NODE_ENV: 'production' }
      });

      expect(lambdaTask.name).toBe('create-lambda-my-function');
      expect(lambdaTask.handler).toBeDefined();
    });

    it('should create CloudFormation stack task', () => {
      const stackTask = adapter.createCloudFormationStackTask({
        name: 'my-stack',
        templateBody: JSON.stringify({ Resources: {} }),
        parameters: { KeyPair: 'my-keypair' },
        capabilities: ['CAPABILITY_IAM']
      });

      expect(stackTask.name).toBe('create-cfn-my-stack');
      expect(stackTask.handler).toBeDefined();
    });
  });

  describe('resource operations', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should get resource by ARN', async () => {
      const resource = await adapter.getResource(
        'arn:aws:ec2:us-west-2:123456789012:instance/i-1234567890abcdef0'
      );
      
      expect(resource).toBeDefined();
      expect(resource.type).toBe('ec2:instance');
      expect(resource.id).toBe('i-1234567890abcdef0');
    });

    it('should list resources by type', async () => {
      const resources = await adapter.listResources('ec2:instance', {
        filters: { 'tag:Environment': 'production' }
      });
      
      expect(Array.isArray(resources)).toBe(true);
      expect(resources.length).toBeGreaterThan(0);
    });

    it('should tag resource', async () => {
      await expect(
        adapter.tagResource(
          'arn:aws:ec2:us-west-2:123456789012:instance/i-1234567890abcdef0',
          { Environment: 'staging', Owner: 'devops' }
        )
      ).resolves.not.toThrow();
    });

    it('should delete resource', async () => {
      await expect(
        adapter.deleteResource(
          'arn:aws:s3:::my-bucket/object.txt'
        )
      ).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle AWS SDK errors', async () => {
      await adapter.connect();
      
      // Simulate AWS error
      vi.spyOn(adapter as any, 'executeEC2').mockRejectedValue({
        code: 'UnauthorizedOperation',
        message: 'You are not authorized to perform this operation',
        statusCode: 403
      });

      await expect(
        adapter.execute('ec2.terminateInstances', {
          InstanceIds: ['i-1234567890abcdef0']
        })
      ).rejects.toThrow();
    });

    it('should retry on transient errors', async () => {
      await adapter.connect();
      
      let attempts = 0;
      vi.spyOn(adapter as any, 'executeS3').mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw { code: 'RequestTimeout', retryable: true };
        }
        return { Buckets: [] };
      });

      const result = await adapter.execute('s3.listBuckets');
      expect(result.Buckets).toBeDefined();
      expect(attempts).toBe(3);
    });
  });
});