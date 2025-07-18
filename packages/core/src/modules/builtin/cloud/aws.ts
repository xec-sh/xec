import type { XecModule, EnvironmentTaskContext } from '../../../types/environment-types.js';

const awsModule: XecModule = {
  name: 'aws',
  version: '1.0.0',
  description: 'AWS cloud infrastructure management',

  exports: {
    tasks: {
      configure: {
        name: 'configure',
        description: 'Configure AWS credentials',

        async handler({ $, env, fs, log, params }: EnvironmentTaskContext) {
          log.info('Configuring AWS credentials...');

          const { accessKeyId, secretAccessKey, region = 'us-east-1' } = params;

          if (!accessKeyId || !secretAccessKey) {
            throw new Error('AWS credentials required: accessKeyId and secretAccessKey');
          }

          // Create AWS credentials file
          const credentialsContent = `[default]
aws_access_key_id = ${accessKeyId}
aws_secret_access_key = ${secretAccessKey}
`;

          const configContent = `[default]
region = ${region}
output = json
`;

          const homeDir = env.platform.os === 'win32' ? '%USERPROFILE%' : '~';
          await fs.mkdir(`${homeDir}/.aws`, { recursive: true });
          await fs.write(`${homeDir}/.aws/credentials`, credentialsContent);
          await fs.write(`${homeDir}/.aws/config`, configContent);

          log.info('AWS credentials configured successfully');
        }
      },

      ec2Instance: {
        name: 'ec2Instance',
        description: 'Launch or manage EC2 instances',

        async handler({ $, log, params }: EnvironmentTaskContext) {
          const {
            action = 'launch',
            instanceType = 't2.micro',
            imageId,
            keyName,
            securityGroup,
            count = 1,
            tags = {}
          } = params;

          switch (action) {
            case 'launch': {
              log.info(`Launching ${count} EC2 instance(s)...`);

              if (!imageId || !keyName) {
                throw new Error('imageId and keyName are required for launching instances');
              }

              const tagSpec = Object.entries(tags)
                .map(([key, value]) => `Key=${key},Value=${value}`)
                .join(' ');

              const result = await $`aws ec2 run-instances \
              --image-id ${imageId} \
              --instance-type ${instanceType} \
              --key-name ${keyName} \
              --count ${count} \
              ${securityGroup ? `--security-groups ${securityGroup}` : ''} \
              ${tagSpec ? `--tag-specifications 'ResourceType=instance,Tags=[${tagSpec}]'` : ''}`;

              const instances = JSON.parse(result.stdout);
              log.info(`Launched ${instances.Instances.length} instance(s)`);
              return instances;
            }
            case 'stop': {
              const { instanceIds } = params;
              if (!instanceIds || !instanceIds.length) {
                throw new Error('instanceIds required for stopping instances');
              }

              log.info(`Stopping instances: ${instanceIds.join(', ')}`);
              await $`aws ec2 stop-instances --instance-ids ${instanceIds.join(' ')}`;
              log.info('Instances stopped');
              break;
            }
            case 'terminate': {
              const { instanceIds: terminateIds } = params;
              if (!terminateIds || !terminateIds.length) {
                throw new Error('instanceIds required for terminating instances');
              }

              log.info(`Terminating instances: ${terminateIds.join(', ')}`);
              await $`aws ec2 terminate-instances --instance-ids ${terminateIds.join(' ')}`;
              log.info('Instances terminated');
              break;
            }
            default:
              throw new Error(`Unknown action: ${action}`);
          }
        }
      },

      s3Bucket: {
        name: 's3Bucket',
        description: 'Create and manage S3 buckets',

        async handler({ $, log, params }: EnvironmentTaskContext) {
          const {
            action = 'create',
            bucketName,
            region = 'us-east-1',
            acl = 'private',
            versioning = false,
            encryption = true
          } = params;

          if (!bucketName) {
            throw new Error('bucketName is required');
          }

          switch (action) {
            case 'create':
              log.info(`Creating S3 bucket: ${bucketName}`);

              // Create bucket
              if (region === 'us-east-1') {
                await $`aws s3api create-bucket --bucket ${bucketName} --acl ${acl}`;
              } else {
                await $`aws s3api create-bucket --bucket ${bucketName} --acl ${acl} \
                --create-bucket-configuration LocationConstraint=${region}`;
              }

              // Enable versioning if requested
              if (versioning) {
                await $`aws s3api put-bucket-versioning --bucket ${bucketName} \
                --versioning-configuration Status=Enabled`;
              }

              // Enable encryption if requested
              if (encryption) {
                await $`aws s3api put-bucket-encryption --bucket ${bucketName} \
                --server-side-encryption-configuration \
                '{"Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]}'`;
              }

              log.info(`S3 bucket ${bucketName} created successfully`);
              break;

            case 'delete':
              log.info(`Deleting S3 bucket: ${bucketName}`);

              // First, delete all objects
              await $`aws s3 rm s3://${bucketName} --recursive || true`;

              // Then delete the bucket
              await $`aws s3api delete-bucket --bucket ${bucketName}`;

              log.info(`S3 bucket ${bucketName} deleted`);
              break;

            case 'sync': {
              const { source, destination } = params;
              if (!source || !destination) {
                throw new Error('source and destination required for sync');
              }

              log.info(`Syncing ${source} to ${destination}`);
              await $`aws s3 sync ${source} ${destination}`;
              log.info('Sync completed');
              break;
            }
            default:
              throw new Error(`Unknown action: ${action}`);
          }
        }
      },

      rds: {
        name: 'rds',
        description: 'Manage RDS database instances',

        async handler({ $, log, params }: EnvironmentTaskContext) {
          const {
            action = 'create',
            dbInstanceIdentifier,
            engine = 'postgres',
            engineVersion,
            instanceClass = 'db.t3.micro',
            masterUsername = 'admin',
            masterPassword,
            allocatedStorage = 20,
            backupRetentionPeriod = 7
          } = params;

          if (!dbInstanceIdentifier) {
            throw new Error('dbInstanceIdentifier is required');
          }

          switch (action) {
            case 'create':
              if (!masterPassword) {
                throw new Error('masterPassword is required for creating RDS instance');
              }

              log.info(`Creating RDS instance: ${dbInstanceIdentifier}`);

              await $`aws rds create-db-instance \
              --db-instance-identifier ${dbInstanceIdentifier} \
              --db-instance-class ${instanceClass} \
              --engine ${engine} \
              ${engineVersion ? `--engine-version ${engineVersion}` : ''} \
              --master-username ${masterUsername} \
              --master-user-password ${masterPassword} \
              --allocated-storage ${allocatedStorage} \
              --backup-retention-period ${backupRetentionPeriod}`;

              log.info('RDS instance creation initiated');
              break;

            case 'delete':
              log.info(`Deleting RDS instance: ${dbInstanceIdentifier}`);

              await $`aws rds delete-db-instance \
              --db-instance-identifier ${dbInstanceIdentifier} \
              --skip-final-snapshot \
              --delete-automated-backups`;

              log.info('RDS instance deletion initiated');
              break;

            case 'snapshot':
              const { snapshotIdentifier } = params;
              if (!snapshotIdentifier) {
                throw new Error('snapshotIdentifier is required for creating snapshot');
              }

              log.info(`Creating snapshot: ${snapshotIdentifier}`);

              await $`aws rds create-db-snapshot \
              --db-instance-identifier ${dbInstanceIdentifier} \
              --db-snapshot-identifier ${snapshotIdentifier}`;

              log.info('Snapshot creation initiated');
              break;

            default:
              throw new Error(`Unknown action: ${action}`);
          }
        }
      },

      cloudformation: {
        name: 'cloudformation',
        description: 'Deploy CloudFormation stacks',

        async handler({ $, fs, template, log, params }: EnvironmentTaskContext) {
          const {
            action = 'deploy',
            stackName,
            templateFile,
            templateBody,
            parameters = {},
            capabilities = ['CAPABILITY_IAM'],
            tags = {}
          } = params;

          if (!stackName) {
            throw new Error('stackName is required');
          }

          switch (action) {
            case 'deploy': {
              log.info(`Deploying CloudFormation stack: ${stackName}`);

              let templateContent;
              if (templateFile) {
                templateContent = await fs.read(templateFile);
              } else if (templateBody) {
                templateContent = typeof templateBody === 'string'
                  ? templateBody
                  : JSON.stringify(templateBody);
              } else {
                throw new Error('Either templateFile or templateBody is required');
              }

              // Process template if it contains variables
              if (templateContent.includes('${')) {
                templateContent = await template.render(templateContent, parameters);
              }

              // Build parameters string
              const paramString = Object.entries(parameters)
                .map(([key, value]) => `ParameterKey=${key},ParameterValue=${value}`)
                .join(' ');

              // Build tags string
              const tagString = Object.entries(tags)
                .map(([key, value]) => `Key=${key},Value=${value}`)
                .join(' ');

              // Create or update stack
              try {
                await $`aws cloudformation describe-stacks --stack-name ${stackName}`;
                // Stack exists, update it
                await $`aws cloudformation update-stack \
                --stack-name ${stackName} \
                --template-body '${templateContent}' \
                ${paramString ? `--parameters ${paramString}` : ''} \
                ${capabilities.length ? `--capabilities ${capabilities.join(' ')}` : ''} \
                ${tagString ? `--tags ${tagString}` : ''}`;

                log.info('Stack update initiated');
              } catch {
                // Stack doesn't exist, create it
                await $`aws cloudformation create-stack \
                --stack-name ${stackName} \
                --template-body '${templateContent}' \
                ${paramString ? `--parameters ${paramString}` : ''} \
                ${capabilities.length ? `--capabilities ${capabilities.join(' ')}` : ''} \
                ${tagString ? `--tags ${tagString}` : ''}`;

                log.info('Stack creation initiated');
              }

              // Wait for completion if requested
              if (params['wait']) {
                log.info('Waiting for stack operation to complete...');
                await $`aws cloudformation wait stack-create-complete --stack-name ${stackName} || \
                      aws cloudformation wait stack-update-complete --stack-name ${stackName}`;
                log.info('Stack operation completed');
              }
              break;
            }
            case 'delete':
              log.info(`Deleting CloudFormation stack: ${stackName}`);

              await $`aws cloudformation delete-stack --stack-name ${stackName}`;

              if (params['wait']) {
                log.info('Waiting for stack deletion...');
                await $`aws cloudformation wait stack-delete-complete --stack-name ${stackName}`;
                log.info('Stack deleted');
              }
              break;

            default:
              throw new Error(`Unknown action: ${action}`);
          }
        }
      },

      lambda: {
        name: 'lambda',
        description: 'Deploy and manage Lambda functions',

        async handler({ $, fs, log, params }: EnvironmentTaskContext) {
          const {
            action = 'deploy',
            functionName,
            runtime = 'nodejs18.x',
            handler = 'index.handler',
            role,
            zipFile,
            memorySize = 128,
            timeout = 3,
            environment = {}
          } = params;

          if (!functionName) {
            throw new Error('functionName is required');
          }

          switch (action) {
            case 'deploy': {
              if (!role || !zipFile) {
                throw new Error('role and zipFile are required for deploying Lambda');
              }

              log.info(`Deploying Lambda function: ${functionName}`);

              const envVars = Object.keys(environment).length > 0
                ? `--environment Variables={${Object.entries(environment)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(',')}}`
                : '';

              try {
                // Try to update existing function
                await $`aws lambda update-function-code \
                --function-name ${functionName} \
                --zip-file fileb://${zipFile}`;

                await $`aws lambda update-function-configuration \
                --function-name ${functionName} \
                --runtime ${runtime} \
                --handler ${handler} \
                --memory-size ${memorySize} \
                --timeout ${timeout} \
                ${envVars}`;

                log.info('Lambda function updated');
              } catch {
                // Function doesn't exist, create it
                await $`aws lambda create-function \
                --function-name ${functionName} \
                --runtime ${runtime} \
                --role ${role} \
                --handler ${handler} \
                --memory-size ${memorySize} \
                --timeout ${timeout} \
                --zip-file fileb://${zipFile} \
                ${envVars}`;

                log.info('Lambda function created');
              }
              break;
            }
            case 'invoke': {
              const { payload = {} } = params;

              log.info(`Invoking Lambda function: ${functionName}`);

              const result = await $`aws lambda invoke \
              --function-name ${functionName} \
              --payload '${JSON.stringify(payload)}' \
              /tmp/lambda-output.json`;

              const output = await fs.read('/tmp/lambda-output.json');
              log.info('Lambda invocation completed');
              return JSON.parse(output);
            }
            case 'delete':
              log.info(`Deleting Lambda function: ${functionName}`);

              await $`aws lambda delete-function --function-name ${functionName}`;

              log.info('Lambda function deleted');
              break;

            default:
              throw new Error(`Unknown action: ${action}`);
          }
        }
      }
    },

    helpers: {
      getRegions: async (context: EnvironmentTaskContext): Promise<string[]> => {
        const { $ } = context;
        if (!$) throw new Error('Execution engine not available');
        const result = await $`aws ec2 describe-regions --output json`;
        const data = JSON.parse(result.stdout);
        return data.Regions.map((r: any) => r.RegionName);
      },

      getInstanceTypes: async (context: EnvironmentTaskContext): Promise<string[]> => {
        const { $ } = context;
        if (!$) throw new Error('Execution engine not available');
        const result = await $`aws ec2 describe-instance-types --output json`;
        const data = JSON.parse(result.stdout);
        return data.InstanceTypes.map((t: any) => t.InstanceType);
      },

      getAMIs: async (context: EnvironmentTaskContext): Promise<any[]> => {
        const { $, params } = context;
        if (!$) throw new Error('Execution engine not available');
        const { owner = 'amazon', architecture = 'x86_64' } = params || {};
        const result = await $`aws ec2 describe-images \
        --owners ${owner} \
        --filters "Name=architecture,Values=${architecture}" \
        --query 'Images[*].[ImageId,Name,Description]' \
        --output json`;
        return JSON.parse(result.stdout);
      },

      getVPCs: async (context: EnvironmentTaskContext): Promise<any[]> => {
        const { $ } = context;
        if (!$) throw new Error('Execution engine not available');
        const result = await $`aws ec2 describe-vpcs --output json`;
        const data = JSON.parse(result.stdout);
        return data.Vpcs;
      },

      getSecurityGroups: async (context: EnvironmentTaskContext): Promise<any[]> => {
        const { $ } = context;
        if (!$) throw new Error('Execution engine not available');
        const result = await $`aws ec2 describe-security-groups --output json`;
        const data = JSON.parse(result.stdout);
        return data.SecurityGroups;
      },

      estimateCosts: async (context: EnvironmentTaskContext): Promise<any> => {
        const { params } = context;
        // Simple cost estimation based on instance types
        const costPerHour: Record<string, number> = {
          't2.micro': 0.0116,
          't2.small': 0.023,
          't2.medium': 0.0464,
          't3.micro': 0.0104,
          't3.small': 0.0208,
          't3.medium': 0.0416,
          'm5.large': 0.096,
          'm5.xlarge': 0.192,
        };

        const { instanceType, hours = 730 } = params || {};
        const hourlyRate = costPerHour[instanceType] || 0;

        return {
          instanceType,
          hourlyRate,
          monthlyEstimate: hourlyRate * hours,
          yearlyEstimate: hourlyRate * hours * 12
        };
      }
    },

    patterns: {
      webApplication: {
        name: 'webApplication',
        description: 'Deploy a complete web application infrastructure',

        template: async (context: EnvironmentTaskContext): Promise<void> => {
          const { params, log } = context;
          const {
            appName,
            domain,
            instanceCount = 2,
            dbEngine = 'postgres',
            enableCDN = true,
            enableBackup = true
          } = params;

          log.info(`Deploying web application: ${appName}`);

          // Create VPC and security groups
          log.info('Setting up network infrastructure...');
          await awsModule.exports?.tasks?.['cloudformation']?.handler({
            ...context,
            params: {
              action: 'deploy',
              stackName: `${appName}-network`,
              templateBody: {
                // VPC CloudFormation template
                AWSTemplateFormatVersion: '2010-09-09',
                Resources: {
                  VPC: {
                    Type: 'AWS::EC2::VPC',
                    Properties: {
                      CidrBlock: '10.0.0.0/16',
                      EnableDnsHostnames: true,
                      EnableDnsSupport: true
                    }
                  }
                }
              }
            }
          });

          // Create RDS instance
          log.info('Creating database...');
          await awsModule.exports?.tasks?.['rds']?.handler({
            ...context,
            params: {
              action: 'create',
              dbInstanceIdentifier: `${appName}-db`,
              engine: dbEngine,
              instanceClass: 'db.t3.small',
              masterPassword: params['dbPassword'] || 'ChangeMePlease123!'
            }
          });

          // Create S3 bucket for static assets
          log.info('Creating storage bucket...');
          await awsModule.exports?.tasks?.['s3Bucket']?.handler({
            ...context,
            params: {
              action: 'create',
              bucketName: `${appName}-assets`,
              versioning: true,
              encryption: true
            }
          });

          // Launch EC2 instances
          log.info('Launching application servers...');
          await awsModule.exports?.tasks?.['ec2Instance']?.handler({
            ...context,
            params: {
              action: 'launch',
              instanceType: 't3.small',
              imageId: params['imageId'] || 'ami-0c55b159cbfafe1f0',
              keyName: params['keyName'],
              count: instanceCount,
              tags: {
                Name: `${appName}-server`,
                Environment: 'production',
                Application: appName
              }
            }
          });

          log.info(`Web application ${appName} deployed successfully`);
        }
      },

      disasterRecovery: {
        name: 'disasterRecovery',
        description: 'Set up disaster recovery infrastructure',

        template: async (context: EnvironmentTaskContext): Promise<void> => {
          const { params, log, $ } = context;
          const {
            primaryRegion = 'us-east-1',
            drRegion = 'us-west-2',
            bucketPrefix
          } = params;

          log.info('Setting up disaster recovery infrastructure...');

          // Create S3 buckets with cross-region replication
          const primaryBucket = `${bucketPrefix}-primary`;
          const drBucket = `${bucketPrefix}-dr`;

          // Create primary bucket
          await awsModule.exports?.tasks?.['s3Bucket']?.handler({
            ...context,
            params: {
              action: 'create',
              bucketName: primaryBucket,
              region: primaryRegion,
              versioning: true
            }
          });

          // Create DR bucket
          await awsModule.exports?.tasks?.['s3Bucket']?.handler({
            ...context,
            params: {
              action: 'create',
              bucketName: drBucket,
              region: drRegion,
              versioning: true
            }
          });

          // Set up cross-region replication
          const replicationConfig = {
            Role: "arn:aws:iam::123456789012:role/replication-role",
            Rules: [{
              ID: "ReplicateAll",
              Priority: 1,
              Status: "Enabled",
              Filter: {},
              Destination: {
                Bucket: `arn:aws:s3:::${drBucket}`,
                ReplicationTime: {
                  Status: "Enabled",
                  Time: {
                    Minutes: 15
                  }
                },
                Metrics: {
                  Status: "Enabled",
                  EventThreshold: {
                    Minutes: 15
                  }
                }
              }
            }]
          };

          if (!$) throw new Error('Execution engine not available');

          await $`aws s3api put-bucket-replication \
          --bucket ${primaryBucket} \
          --replication-configuration '${JSON.stringify(replicationConfig)}'`;

          log.info('Disaster recovery setup completed');
        }
      }  // disasterRecovery pattern
    }  // patterns
  }  // exports
};

export default awsModule;