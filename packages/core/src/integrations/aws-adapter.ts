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
      throw new Error('AWS credentials not configured. Set AWS_PROFILE or provide accessKeyId/secretAccessKey');
    }

    (this as any).connected = true;
  }

  async disconnect(): Promise<void> {
    this.sdkClients.clear();
    (this as any).connected = false;
  }

  async execute(operation: string, params: any = {}): Promise<any> {
    if (!(this as any).connected) {
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
          ETag: '"' + Buffer.from(params.Body).toString('base64').slice(0, 32) + '"'
        };

      case 'getObject':
        return {
          Body: Buffer.from('Example content'),
          ContentType: 'text/plain'
        };

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

      default:
        throw new Error(`Unsupported CloudFormation action: ${action}`);
    }
  }

  // Task generators for common AWS operations
  createEC2InstanceTask(name: string, options: any = {}): Task {
    return task(name)
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
          ImageId: context.vars.imageId,
          InstanceType: context.vars.instanceType,
          MinCount: 1,
          MaxCount: 1,
          KeyName: context.vars.keyName,
          SecurityGroups: context.vars.securityGroups,
          TagSpecifications: [{
            ResourceType: 'instance',
            Tags: Object.entries(context.vars.tags).map(([k, v]) => ({
              Key: k,
              Value: String(v)
            }))
          }]
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

  createS3BucketTask(name: string, options: any = {}): Task {
    return task(name)
      .description('Create S3 bucket')
      .vars({
        bucketName: { required: true },
        region: { default: this.awsConfig.region },
        acl: { default: 'private' }
      })
      .handler(async (context) => {
        const result = await this.execute('s3.createBucket', {
          Bucket: context.vars.bucketName,
          ACL: context.vars.acl,
          CreateBucketConfiguration: {
            LocationConstraint: context.vars.region
          }
        });

        context.logger.info(`Created S3 bucket: ${context.vars.bucketName}`);

        return {
          bucketName: context.vars.bucketName,
          location: result.Location
        };
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
      'aws-ec2-launch': this.createEC2InstanceTask('aws-ec2-launch'),
      'aws-s3-create': this.createS3BucketTask('aws-s3-create'),
      'aws-lambda-invoke': this.invokeLambdaTask('aws-lambda-invoke'),
      'aws-cf-deploy': this.deployCloudFormationTask('aws-cf-deploy')
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
      // Try to get caller identity
      await this.execute('sts.getCallerIdentity');
      return true;
    } catch {
      return false;
    }
  }

  validateConfig(config: any): boolean {
    // Basic validation
    if (!config) return false;

    // Check if we have valid credentials
    if (config.accessKeyId && !config.secretAccessKey) return false;
    if (!config.region && !process.env.AWS_REGION) return false;

    return true;
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
      new AWSAdapter(config).createEC2InstanceTask('launch-ec2-instance'),

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
      new AWSAdapter(config).createS3BucketTask('create-s3-bucket'),

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