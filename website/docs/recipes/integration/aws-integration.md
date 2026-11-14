---
title: AWS Integration Recipe
description: Use the AWS CLI through Xec with explicit identity, targets and acceptance
source_files:
  - apps/xec/src/commands/run.ts
  - packages/ops/src/pipeline/index.ts
---

# AWS Integration Recipe {#aws-integration-recipe}

## Implementation Reference {#implementation-reference}

Xec executes AWS CLI commands through `packages/core/src/core/execution-engine.ts`; it does not bundle an AWS SDK or provision cloud credentials.

## Overview {#overview}

Install the project’s supported AWS CLI and configure a limited role/profile. Pass resource identities explicitly and verify asynchronous operations after the initial request succeeds. The examples below are separate scripts, not a single account provisioning program.

## AWS CLI Setup {#aws-cli-setup}

### Basic AWS Configuration {#basic-aws-configuration}

```typescript
const profile = process.env.AWS_PROFILE;
const region = process.env.AWS_REGION;
if (!profile || !region) throw new Error('Select AWS_PROFILE and AWS_REGION');
const aws = $.env({ AWS_PROFILE: profile, AWS_REGION: region, AWS_PAGER: '' });
await aws`aws --version`;
const account = (await aws`aws sts get-caller-identity --query Account --output text`.text()).trim();
if (account !== process.env.EXPECTED_AWS_ACCOUNT) throw new Error('AWS account does not match the reviewed target');
console.log(`Authenticated target account ${account} in ${region}`);
```

Use the provider’s role/SSO/workload-identity flow. Do not write long-lived keys into generated project files.

## EC2 Management {#ec2-management}

### EC2 Instance Operations {#ec2-instance-operations}

```typescript
const instance = process.env.EC2_INSTANCE_ID;
if (!instance || !/^i-[a-f0-9]+$/.test(instance)) throw new Error('Select EC2_INSTANCE_ID');
await $`aws ec2 describe-instances --instance-ids ${instance} --query ${'Reservations[].Instances[].{Id:InstanceId,State:State.Name}'} --output json`;
```

Inspect exact instances before a start/stop operation. An instance state is not an application health check. Keep provisioning and irreversible retirement in the project’s reviewed infrastructure declaration.

## S3 Operations {#s3-operations}

### S3 Bucket Management {#s3-bucket-management}

```typescript
const bucket = process.env.ARTIFACT_BUCKET;
const commit = process.env.RELEASE_COMMIT;
if (!bucket || !/^[a-z0-9][a-z0-9.-]+$/.test(bucket)) throw new Error('Select ARTIFACT_BUCKET');
if (!commit || !/^[a-f0-9]{40}$/.test(commit)) throw new Error('Select a full RELEASE_COMMIT');
await $`aws s3api head-bucket --bucket ${bucket}`;
await $`npm run verify:release-artifact -- ${commit}`;
await $`aws s3 cp dist/ ${`s3://${bucket}/releases/${commit}/`} --recursive`;
```

The bucket’s encryption, access policy and lifecycle are provisioned separately. Uploading a release prefix does not authorize deleting existing objects or activating that release.

## Lambda Functions {#lambda-functions}

### Lambda Deployment {#lambda-deployment}

```typescript
const name = process.env.LAMBDA_FUNCTION;
if (!name) throw new Error('Select LAMBDA_FUNCTION');
await $`npm run verify:lambda-artifact`;
const version = (await $`aws lambda update-function-code --function-name ${name} --zip-file fileb://dist/function.zip --publish --query Version --output text`.text()).trim();
if (!/^\d+$/.test(version)) throw new Error('Lambda did not return a published version');
await $`aws lambda wait function-updated-v2 --function-name ${name}`.timeout(360_000);
await $`npm run verify:lambda-version -- ${name} ${version}`;
console.log(`Accepted Lambda version ${version}; alias promotion remains separate`);
```

The project verifies the zip’s runtime/architecture and invokes the new qualified version before moving a serving alias. Preserve the previous alias target for recovery.

## ECS/Fargate Deployment {#ecsfargate-deployment}

### ECS Task Management {#ecs-task-management}

```typescript
const cluster = process.env.ECS_CLUSTER;
const service = process.env.ECS_SERVICE;
const taskDefinition = process.env.ECS_TASK_DEFINITION;
if (!cluster || !service || !taskDefinition || !/:task-definition\/.+:\d+$/.test(taskDefinition)) {
  throw new Error('Select cluster, service and an exact task-definition ARN revision');
}
await $`aws ecs update-service --cluster ${cluster} --service ${service} --task-definition ${taskDefinition}`;
await $`aws ecs wait services-stable --cluster ${cluster} --services ${service}`.timeout(660_000);
const observed = (await $`aws ecs describe-services --cluster ${cluster} --services ${service} --query ${'services[0].taskDefinition'} --output text`.text()).trim();
if (observed !== taskDefinition) throw new Error('Serving task definition differs from the requested revision');
await $`npm run verify:ecs-service -- ${cluster} ${service} ${taskDefinition}`;
```

Declare the image digest, task role and network in the reviewed task definition. Stable scheduling alone does not prove the application’s release identity or data compatibility.

## EKS Integration {#eks-integration}

### EKS Cluster Management {#eks-cluster-management}

Use a private temporary kubeconfig instead of changing the developer’s global current context:

```typescript
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const cluster = process.env.EKS_CLUSTER;
if (!cluster) throw new Error('Select EKS_CLUSTER');
const directory = await mkdtemp(path.join(os.tmpdir(), 'xec-eks-'));
const kubeconfig = path.join(directory, 'config');
try {
  await $`aws eks update-kubeconfig --name ${cluster} --kubeconfig ${kubeconfig} --alias xec-selected`;
  await $`kubectl --kubeconfig ${kubeconfig} --context xec-selected --namespace default get pods`;
} finally {
  await rm(directory, { recursive: true, force: true });
}
```

The commands above are read-only cluster inspection after local credential configuration. Use the [Kubernetes deployment recipe](../deployment/k8s-deploy.md) for an explicit release transition.

## CloudFormation/CDK {#cloudformationcdk}

### CloudFormation Stack Management {#cloudformation-stack-management}

```typescript
const stack = process.env.CLOUDFORMATION_STACK;
if (!stack) throw new Error('Select CLOUDFORMATION_STACK');
await $`aws cloudformation validate-template --template-body file://infra/template.yaml`;
await $`aws cloudformation describe-stacks --stack-name ${stack} --query ${'Stacks[0].{Name:StackName,Status:StackStatus}'} --output json`;
```

Validation checks template syntax, not the safety of the proposed changes. Use the project’s change-set review and execution path for mutations. If CDK owns that path, invoke the locked CDK project script rather than generating another infrastructure model in Xec.

## Monitoring with CloudWatch {#monitoring-with-cloudwatch}

### CloudWatch Metrics and Alarms {#cloudwatch-metrics-and-alarms}

```typescript
const group = process.env.CLOUDWATCH_LOG_GROUP;
if (!group) throw new Error('Select CLOUDWATCH_LOG_GROUP');
const since = Date.now() - 15 * 60_000;
const count = (await $`aws logs filter-log-events --log-group-name ${group} --start-time ${since} --limit 100 --query ${'length(events)'} --output json`.json<unknown>());
console.log({ observedCount: count, since });
```

This is a bounded diagnostic query, not a durable event counter. Configure metric filters, alarm thresholds and notification destinations in the monitoring declaration.

## Configuration {#configuration}

### Xec Configuration for AWS {#xec-configuration-for-aws}

```yaml
version: '1.0'
tasks:
  aws:identity:
    command: xec run scripts/aws-identity.ts
  aws:stage:
    command: xec run scripts/stage-artifact.ts
```

Save the corresponding examples under these paths. Region, profile and expected account are explicit inputs; Xec does not silently select a production account.

## Performance Characteristics {#performance-characteristics}

### AWS API Performance {#aws-api-performance}

Measure each operation in the target region. A successful asynchronous request may only have accepted work; use the appropriate waiter and application acceptance before reporting completion.

### Operation Timings {#operation-timings}

Set operation timeouts above the provider waiter’s configured budget. Retrying a read is different from retrying a partially accepted mutation; reconcile its returned resource/version identifier first.

## Best Practices {#best-practices}

Validate account, region and resource identity before mutation. Prefer role-based short-lived credentials. Preserve immutable artifacts and previously accepted revisions. Keep infrastructure and application deployment responsibilities in their existing declarations.

## Troubleshooting {#troubleshooting}

### Common Issues {#common-issues}

Check selected profile, region, caller identity and the exact denied API. Do not broaden unrelated permissions, disable TLS or hide a failed waiter. Preserve the operation identifier for diagnosis.

## Related Recipes {#related-recipes}

- [Static Site Deployment](../deployment/static-site-deploy.md)
- [Kubernetes Deployment](../deployment/k8s-deploy.md)
- [Backup and Restore](../maintenance/backup-restore.md)

## See Also {#see-also}

- [AWS CLI reference](https://docs.aws.amazon.com/cli/latest/)
- [Execution Engine](../../core/execution-engine/overview.md)
