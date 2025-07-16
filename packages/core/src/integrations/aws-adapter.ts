/**
 * AWS Integration Adapter for Xec
 */

import { task } from '../dsl/task.js';
import { Task, IntegrationAdapter } from '../core/types.js';
import { BaseAdapter, AdapterConfig } from './base-adapter.js';

export interface AWSConfig extends Partial<AdapterConfig> {
  region?: string;
  profile?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  endpoint?: string;
}

export interface AWSResource {
  type: string;
  id: string;
  region?: string;
  tags?: Record<string, string>;
  properties?: Record<string, any>;
}

export class AWSAdapter extends BaseAdapter implements IntegrationAdapter {
  private awsConfig: AWSConfig;
  private sdkClients: Map<string, any> = new Map();

  constructor(config: AWSConfig = {}) {
    const baseConfig: AdapterConfig = {
      name: config.name || 'aws',
      type: config.type || 'cloud',
      timeout: config.timeout,
      retries: config.retries,
      debug: config.debug
    };
    super(baseConfig);
    this.awsConfig = {
      ...config,
      name: baseConfig.name,
      type: baseConfig.type,
      region: process.env.AWS_REGION || config.region || 'us-east-1',
      profile: process.env.AWS_PROFILE || config.profile
    };
  }

  async connect(): Promise<void> {
    // Validate AWS credentials
    const hasCredentials =
      (this.awsConfig.accessKeyId && this.awsConfig.secretAccessKey) ||
      this.awsConfig.profile ||
      process.env.AWS_ACCESS_KEY_ID;

    if (!hasCredentials) {
      throw new Error('AWS credentials not configured');
    }

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.sdkClients.clear();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async execute(operation: string, params: any = {}): Promise<any> {
    if (!this.connected) {
      await this.connect();
    }

    const [service, action] = operation.split('.');

    switch (service) {
      case 'ec2':
        return this.executeEC2(action, params);
      case 's3':
        return this.executeS3(action, params);
      case 'lambda':
        return this.executeLambda(action, params);
      case 'cloudformation':
        return this.executeCloudFormation(action, params);
      case 'sts':
        return this.executeSTS(action, params);
      default:
        throw new Error(`Unsupported AWS service: ${service}`);
    }
  }

  private async executeEC2(action: string, params: any): Promise<any> {
    // Simulate EC2 operations
    switch (action) {
      case 'describeInstances':
        return {
          Reservations: [{
            Instances: [{
              InstanceId: 'i-1234567890abcdef0',
              InstanceType: 't2.micro',
              State: { Name: 'running' },
              Tags: params.Tags || []
            }]
          }]
        };

      case 'runInstances':
        return {
          Instances: [{
            InstanceId: `i-${Date.now()}`,
            InstanceType: params.InstanceType || 't2.micro',
            State: { Name: 'pending' }
          }]
        };

      case 'terminateInstances':
        return {
          TerminatingInstances: params.InstanceIds.map((id: string) => ({
            InstanceId: id,
            CurrentState: { Name: 'shutting-down' },
            PreviousState: { Name: 'running' }
          }))
        };

      case 'startInstances':
        return {
          StartingInstances: params.InstanceIds.map((id: string) => ({
            InstanceId: id,
            CurrentState: { Name: 'pending' },
            PreviousState: { Name: 'stopped' }
          }))
        };

      case 'createTags':
        return {};

      default:
        throw new Error(`Unsupported EC2 action: ${action}`);
    }
  }

  private async executeS3(action: string, params: any): Promise<any> {
    // Simulate S3 operations
    switch (action) {
      case 'listBuckets':
        return {
          Buckets: [
            { Name: 'example-bucket', CreationDate: new Date() }
          ]
        };

      case 'createBucket':
        return {
          Location: `/${params.Bucket}`
        };

      case 'putObject':
        return {
          ETag: '"' + Buffer.from(params.Body || '').toString('base64').slice(0, 32) + '"'
        };

      case 'getObject':
        return {
          Body: Buffer.from('Example content'),
          ContentType: 'text/plain'
        };

      case 'putBucketVersioning':
      case 'putBucketEncryption':
      case 'putPublicAccessBlock':
      case 'deleteObject':
      case 'deleteBucket':
        return {};

      default:
        throw new Error(`Unsupported S3 action: ${action}`);
    }
  }

  private async executeLambda(action: string, params: any): Promise<any> {
    // Simulate Lambda operations
    switch (action) {
      case 'listFunctions':
        return {
          Functions: [{
            FunctionName: 'example-function',
            Runtime: 'nodejs18.x',
            Handler: 'index.handler'
          }]
        };

      case 'invoke':
        return {
          StatusCode: 200,
          Payload: JSON.stringify({ success: true })
        };

      case 'createFunction':
        return {
          FunctionName: params.FunctionName,
          FunctionArn: `arn:aws:lambda:${this.awsConfig.region}:123456789012:function:${params.FunctionName}`,
          Runtime: params.Runtime,
          Handler: params.Handler
        };

      default:
        throw new Error(`Unsupported Lambda action: ${action}`);
    }
  }

  private async executeCloudFormation(action: string, params: any): Promise<any> {
    // Simulate CloudFormation operations
    switch (action) {
      case 'describeStacks':
        return {
          Stacks: [{
            StackName: params.StackName || 'example-stack',
            StackStatus: 'CREATE_COMPLETE'
          }]
        };

      case 'createStack':
        return {
          StackId: `arn:aws:cloudformation:${this.awsConfig.region}:123456789012:stack/${params.StackName}/${Date.now()}`
        };

      case 'listStacks':
        return {
          StackSummaries: [{
            StackName: 'test-stack',
            StackStatus: 'CREATE_COMPLETE',
            CreationTime: new Date()
          }]
        };

      default:
        throw new Error(`Unsupported CloudFormation action: ${action}`);
    }
  }

  private async executeSTS(action: string, params: any): Promise<any> {
    switch (action) {
      case 'getCallerIdentity':
        return {
          Account: '123456789012',
          Arn: 'arn:aws:iam::123456789012:user/test',
          UserId: 'AIDAI23HXD3MBVFX6Z3XYZ'
        };
      default:
        throw new Error(`Unsupported STS action: ${action}`);
    }
  }

  // Resource operations
  async getResource(arn: string): Promise<any> {
    const parts = arn.split(':');
    const service = parts[2];
    const resourceType = parts[5]?.split('/')[0]; // Handle instance/i-xxx format
    const resourceId = parts[5]?.split('/')[1] || parts[6];

    if (service === 'ec2' && resourceType === 'instance') {
      const result = await this.execute('ec2.describeInstances', {
        InstanceIds: [resourceId]
      });
      return {
        type: 'ec2:instance',
        id: resourceId,
        data: result.Reservations[0].Instances[0]
      };
    }

    throw new Error(`Unsupported resource type: ${service}:${resourceType}`);
  }

  async listResources(type: string, options?: any): Promise<any[]> {
    if (type === 'ec2:instance') {
      const filters = options?.filters ? Object.entries(options.filters).map(
        ([Name, Values]) => ({ Name, Values: [Values] })
      ) : undefined;

      const result = await this.execute('ec2.describeInstances', { Filters: filters });
      return result.Reservations.flatMap((r: any) => r.Instances);
    }

    return [];
  }

  async tagResource(arn: string, tags: Record<string, string>): Promise<void> {
    const parts = arn.split(':');
    const service = parts[2];
    const resourceId = parts[6];

    if (service === 'ec2') {
      await this.execute('ec2.createTags', {
        Resources: [resourceId],
        Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value }))
      });
    }
  }

  async deleteResource(arn: string): Promise<void> {
    if (arn.startsWith('arn:aws:s3:::')) {
      const parts = arn.replace('arn:aws:s3:::', '').split('/');
      const bucket = parts[0];
      const key = parts.slice(1).join('/');

      if (key) {
        await this.execute('s3.deleteObject', { Bucket: bucket, Key: key });
      } else {
        await this.execute('s3.deleteBucket', { Bucket: bucket });
      }
    }
  }

  // Task generators for common AWS operations
  createEC2InstanceTask(options: {
    name: string;
    instanceType: string;
    ami: string;
    keyName?: string;
    securityGroups?: string[];
    tags?: Record<string, string>;
  }): Task {
    return task(`create-ec2-${options.name}`)
      .description('Launch EC2 instance')
      .vars({
        imageId: { required: true },
        instanceType: { default: 't2.micro' },
        keyName: { required: false },
        securityGroups: { type: 'array', default: [] },
        tags: { type: 'object', default: {} }
      })
      .handler(async (context) => {
        const result = await this.execute('ec2.runInstances', {
          ImageId: options.ami || context.vars.imageId,
          InstanceType: options.instanceType || context.vars.instanceType,
          MinCount: 1,
          MaxCount: 1,
          KeyName: options.keyName || context.vars.keyName,
          SecurityGroups: options.securityGroups || context.vars.securityGroups,
          TagSpecifications: options.tags ? [{
            ResourceType: 'instance',
            Tags: Object.entries(options.tags).map(([k, v]) => ({
              Key: k,
              Value: String(v)
            }))
          }] : undefined
        });

        const instance = result.Instances[0];
        context.logger.info(`Created EC2 instance: ${instance.InstanceId}`);

        return {
          instanceId: instance.InstanceId,
          state: instance.State.Name
        };
      })
      .build();
  }

  createS3BucketTask(options: {
    name: string;
    region?: string;
    versioning?: boolean;
    encryption?: boolean;
    publicAccess?: boolean;
  }): Task {
    return task(`create-s3-${options.name}`)
      .description('Create S3 bucket')
      .vars({
        bucketName: { required: true },
        region: { default: this.awsConfig.region },
        acl: { default: 'private' }
      })
      .handler(async (context) => {
        const bucketName = options.name || context.vars.bucketName;

        await this.execute('s3.createBucket', {
          Bucket: bucketName,
          CreateBucketConfiguration: options.region ? {
            LocationConstraint: options.region
          } : undefined
        });

        if (options.versioning) {
          await this.execute('s3.putBucketVersioning', {
            Bucket: bucketName,
            VersioningConfiguration: { Status: 'Enabled' }
          });
        }

        if (options.encryption) {
          await this.execute('s3.putBucketEncryption', {
            Bucket: bucketName,
            ServerSideEncryptionConfiguration: {
              Rules: [{
                ApplyServerSideEncryptionByDefault: {
                  SSEAlgorithm: 'AES256'
                }
              }]
            }
          });
        }

        if (options.publicAccess === false) {
          await this.execute('s3.putPublicAccessBlock', {
            Bucket: bucketName,
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: true,
              BlockPublicPolicy: true,
              IgnorePublicAcls: true,
              RestrictPublicBuckets: true
            }
          });
        }

        context.logger.info(`Created S3 bucket: ${bucketName}`);

        return { Bucket: bucketName };
      })
      .build();
  }

  createLambdaFunctionTask(options: {
    name: string;
    runtime: string;
    handler: string;
    code: any;
    role: string;
    environment?: Record<string, string>;
  }): Task {
    return task(`create-lambda-${options.name}`)
      .description('Create Lambda function')
      .handler(async (context) => {
        const result = await this.execute('lambda.createFunction', {
          FunctionName: options.name,
          Runtime: options.runtime,
          Handler: options.handler,
          Code: options.code,
          Role: options.role,
          Environment: options.environment ? {
            Variables: options.environment
          } : undefined
        });

        context.logger.info(`Created Lambda function: ${options.name}`);
        return result;
      })
      .build();
  }

  invokeLambdaTask(name: string, options: any = {}): Task {
    return task(name)
      .description('Invoke Lambda function')
      .vars({
        functionName: { required: true },
        payload: { type: 'object', default: {} },
        invocationType: { default: 'RequestResponse' }
      })
      .handler(async (context) => {
        const result = await this.execute('lambda.invoke', {
          FunctionName: context.vars.functionName,
          InvocationType: context.vars.invocationType,
          Payload: JSON.stringify(context.vars.payload)
        });

        const response = JSON.parse(result.Payload);
        context.logger.info(`Lambda function ${context.vars.functionName} invoked successfully`);

        return {
          statusCode: result.StatusCode,
          response
        };
      })
      .build();
  }

  createCloudFormationStackTask(options: {
    name: string;
    templateBody: string;
    parameters?: Record<string, string>;
    capabilities?: string[];
  }): Task {
    return task(`create-cfn-${options.name}`)
      .description('Create CloudFormation stack')
      .handler(async (context) => {
        const result = await this.execute('cloudformation.createStack', {
          StackName: options.name,
          TemplateBody: options.templateBody,
          Parameters: options.parameters ? Object.entries(options.parameters).map(
            ([ParameterKey, ParameterValue]) => ({ ParameterKey, ParameterValue })
          ) : undefined,
          Capabilities: options.capabilities
        });

        context.logger.info(`Created CloudFormation stack: ${options.name}`);
        return result;
      })
      .build();
  }

  deployCloudFormationTask(name: string, options: any = {}): Task {
    return task(name)
      .description('Deploy CloudFormation stack')
      .vars({
        stackName: { required: true },
        templateBody: { required: true },
        parameters: { type: 'object', default: {} },
        capabilities: { type: 'array', default: [] }
      })
      .handler(async (context) => {
        const result = await this.execute('cloudformation.createStack', {
          StackName: context.vars.stackName,
          TemplateBody: context.vars.templateBody,
          Parameters: Object.entries(context.vars.parameters).map(([k, v]) => ({
            ParameterKey: k,
            ParameterValue: String(v)
          })),
          Capabilities: context.vars.capabilities
        });

        context.logger.info(`CloudFormation stack ${context.vars.stackName} deployment initiated`);

        return {
          stackId: result.StackId,
          stackName: context.vars.stackName
        };
      })
      .build();
  }

  // IntegrationAdapter implementation
  get name(): string {
    return 'aws';
  }

  get version(): string {
    return '1.0.0';
  }

  async initialize(config: any): Promise<void> {
    // Already handled in constructor
  }

  getTasks(): Record<string, Task> {
    return {
      'aws-ec2-launch': this.createEC2InstanceTask({ name: 'aws-ec2-launch', instanceType: 't2.micro', ami: 'ami-12345678' }),
      'aws-s3-create': this.createS3BucketTask({ name: 'aws-s3-create' }),
      'aws-lambda-invoke': this.invokeLambdaTask('aws-lambda-invoke'),
      'aws-lambda-create': this.createLambdaFunctionTask({ name: 'aws-lambda-create', runtime: 'nodejs18.x', handler: 'index.handler', code: {}, role: 'arn:aws:iam::123456789012:role/lambda-role' }),
      'aws-cf-deploy': this.deployCloudFormationTask('aws-cf-deploy'),
      'aws-cf-create': this.createCloudFormationStackTask({ name: 'aws-cf-create', templateBody: '{}' })
    };
  }

  getHelpers(): Record<string, (...args: any[]) => any> {
    return {
      getRegion: () => this.awsConfig.region,
      formatArn: (service: string, resource: string) =>
        `arn:aws:${service}:${this.awsConfig.region}:*:${resource}`
    };
  }

  async cleanup(): Promise<void> {
    await this.disconnect();
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.connected) {
        return false;
      }
      // Try to get caller identity
      const client = this.getClient('sts');
      if (client.getCallerIdentity) {
        await client.getCallerIdentity().promise();
      }
      return true;
    } catch {
      return false;
    }
  }

  private getClient(service: string): any {
    if (!this.sdkClients.has(service)) {
      // Mock client for testing
      this.sdkClients.set(service, {
        getCallerIdentity: () => ({
          promise: () => Promise.resolve({ Account: '123456789012' })
        })
      });
    }
    return this.sdkClients.get(service);
  }

  validateConfig(config: any): boolean {
    // Check for valid region
    const validRegions = [
      'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
      'eu-west-1', 'eu-west-2', 'eu-central-1',
      'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1'
    ];

    if (config.region && !validRegions.includes(config.region)) {
      return false;
    }

    // Check for credentials
    const hasAccessKeys = !!(config.accessKeyId && config.secretAccessKey);
    const hasProfile = !!config.profile;
    const hasEnvCredentials = !!process.env.AWS_ACCESS_KEY_ID;

    return hasAccessKeys || hasProfile || hasEnvCredentials;
  }
}

// Factory function
export function createAWSAdapter(config?: AWSConfig): AWSAdapter {
  return new AWSAdapter(config);
}

// Pre-configured tasks
export const awsTasks = {
  ec2: {
    launchInstance: (config?: AWSConfig) =>
      new AWSAdapter(config).createEC2InstanceTask({
        name: 'launch-ec2-instance',
        instanceType: 't2.micro',
        ami: 'ami-12345678'
      }),

    listInstances: task('list-ec2-instances')
      .description('List EC2 instances')
      .vars({
        filters: { type: 'array', default: [] }
      })
      .handler(async (context) => {
        const adapter = new AWSAdapter();
        await adapter.connect();

        const result = await adapter.execute('ec2.describeInstances', {
          Filters: context.vars.filters
        });

        const instances = result.Reservations.flatMap((r: any) => r.Instances);
        return { instances, count: instances.length };
      })
      .build()
  },

  s3: {
    createBucket: (config?: AWSConfig) =>
      new AWSAdapter(config).createS3BucketTask({
        name: 'create-s3-bucket'
      }),

    uploadFile: task('upload-to-s3')
      .description('Upload file to S3')
      .vars({
        bucket: { required: true },
        key: { required: true },
        content: { required: true },
        contentType: { default: 'text/plain' }
      })
      .handler(async (context) => {
        const adapter = new AWSAdapter();
        await adapter.connect();

        const result = await adapter.execute('s3.putObject', {
          Bucket: context.vars.bucket,
          Key: context.vars.key,
          Body: context.vars.content,
          ContentType: context.vars.contentType
        });

        return {
          bucket: context.vars.bucket,
          key: context.vars.key,
          etag: result.ETag
        };
      })
      .build()
  },

  lambda: {
    invoke: (config?: AWSConfig) =>
      new AWSAdapter(config).invokeLambdaTask('invoke-lambda'),

    listFunctions: task('list-lambda-functions')
      .description('List Lambda functions')
      .handler(async (context) => {
        const adapter = new AWSAdapter();
        await adapter.connect();

        const result = await adapter.execute('lambda.listFunctions');
        return {
          functions: result.Functions,
          count: result.Functions.length
        };
      })
      .build()
  }
};

export default AWSAdapter;