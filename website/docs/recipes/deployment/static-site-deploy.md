---
title: Static Site Deployment
description: Publish a prepared static site and verify its actual serving origin
source_files:
  - packages/core/src/core/execution-engine.ts
  - packages/ops/src/deploy/index.ts
  - packages/ops/src/config/target-resolver.ts
---

# Static Site Deployment

## Problem

Publish a known static artifact without losing the previous release or confusing upload success with serving the new content.

## Solution

Build once, retain the output and release identity, then use the hosting provider’s deployment path. Xec orchestrates that path and checks its result. Cache invalidation and origin activation are separate operations.

## Quick Example

This stages a prepared build at an immutable S3 prefix. It deliberately does not delete the current site or change its origin:

```typescript
const bucket = process.env.SITE_BUCKET;
const commit = args[0];
if (!bucket || !/^[a-z0-9][a-z0-9.-]+$/.test(bucket)) throw new Error('Select SITE_BUCKET');
if (!commit || !/^[a-f0-9]{40}$/.test(commit)) throw new Error('Pass the prepared source commit');
await $`npm run verify:site-artifact -- ${commit}`;
const destination = `s3://${bucket}/releases/${commit}/`;
await $`aws s3 cp dist/ ${destination} --recursive`;
console.log(`Staged ${destination}; origin activation and acceptance are still required`);
```

`verify:site-artifact` is the project’s check that `dist/` belongs to that commit. Configure AWS credentials outside the script.

## Complete Deployment Recipes

### Configuration

```yaml
version: '1.0'
tasks:
  site:build:
    command: npm run build
  site:stage:
    params:
      - name: commit
        required: true
    command: xec run scripts/stage-site.ts ${params.commit}
  site:deploy:
    params:
      - name: commit
        required: true
    command: xec run scripts/deploy-site.ts ${params.commit}
```

Keep build and upload distinct so retries do not silently rebuild a different artifact.

### Multi-Platform Deployment Script

Use one reviewed provider entry point rather than inventing a universal origin-switch implementation. These project scripts implement the specified host’s deployment and recovery contracts:

```typescript
// scripts/deploy-site.ts
import { Deployer } from '@xec-sh/ops';
const provider = process.env.SITE_PROVIDER;
const commit = args[0];
if (provider !== 's3' && provider !== 'nginx') throw new Error('Select s3 or nginx');
if (!commit || !/^[a-f0-9]{40}$/.test(commit)) throw new Error('Pass a full commit');
const result = await Deployer.create({
  name: 'static-site', targets: [provider], strategy: 'all-at-once', timeout: 300_000,
  hooks: {
    beforeDeploy: async ctx => { await ctx.exec`npm run site:prepare -- ${ctx.target} ${ctx.version}`; },
    deploy: async ctx => { await ctx.exec`npm run site:activate -- ${ctx.target} ${ctx.version}`; },
    verify: async ctx => (await ctx.exec`npm run site:verify -- ${ctx.target} ${ctx.version}`).ok,
    rollback: async ctx => { await ctx.exec`npm run site:restore-reviewed -- ${ctx.target}`; }
  }
}).deploy(commit);
console.log(result);
if (!result.success) throw new Error('Site activation or acceptance failed');
```

For S3, the project controls the bucket prefix and CDN origin. For Nginx, it controls the immutable directory and serving selector. `site:verify` must fetch the public origin and compare the expected release marker. Retain the previous selector and artifact; code rollback does not roll back external data.

### CDN Deployment with Optimization

After the origin has switched successfully, invalidate only the paths required by the chosen cache policy and wait for that invalidation:

```typescript
const distribution = process.env.CLOUDFRONT_DISTRIBUTION;
if (!distribution) throw new Error('CLOUDFRONT_DISTRIBUTION is required');
const id = (await $`aws cloudfront create-invalidation --distribution-id ${distribution} --paths ${'/*'} --query Invalidation.Id --output text`.text()).trim();
if (!id || id === 'None') throw new Error('CloudFront did not return an invalidation ID');
await $`aws cloudfront wait invalidation-completed --distribution-id ${distribution} --id ${id}`.timeout(660_000);
```

The [AWS invalidation waiter](https://docs.aws.amazon.com/cli/latest/reference/cloudfront/wait/invalidation-completed.html) confirms invalidation completion, not application correctness. Fetch and verify the public release afterward.

## SSL Certificate Management

Use the hosting provider’s certificate lifecycle, or the [certificate renewal recipe](../maintenance/certificate-renewal.md) for an explicitly managed host. Do not generate an Nginx configuration that silently disables certificate validation or replaces another site’s listener.

## Performance Optimization

Let the site’s bundler own compression, content hashes and source maps. Upload immutable assets with their reviewed cache policy and keep HTML/release metadata revalidatable. Do not rename or gzip files after generating references unless the build tool also updates those references.

## Usage Examples

```bash
xec run scripts/stage-site.ts 0123456789abcdef0123456789abcdef01234567
SITE_PROVIDER=s3 xec run scripts/deploy-site.ts 0123456789abcdef0123456789abcdef01234567
```

Use an actual prepared commit and implement the named provider hooks before activation.

## Best Practices

Check relative asset paths, redirects, fragment anchors and the production base URL. Retain a previously accepted artifact. Verify both HTML and representative assets through the real public origin, including cache headers.

## Troubleshooting

### Cache Issues

```typescript
const origin = process.env.SITE_URL;
if (!origin || new URL(origin).protocol !== 'https:') throw new Error('Select an HTTPS SITE_URL');
const response = await fetch(origin, { signal: AbortSignal.timeout(5000) });
console.log({ status: response.status, cacheControl: response.headers.get('cache-control'), age: response.headers.get('age') });
if (!response.ok) throw new Error('Published site is not reachable');
```

Inspect the origin selection before invalidating caches again.

### CORS Errors

Configure only the origins, methods and headers the application needs. CORS is a browser policy; it does not authenticate access to a private bucket or replace a file authorization check.

## Related Topics

- [Docker Deployment](docker-deploy.md)
- [GitHub Actions](../integration/github-actions.md)
- [Certificate Renewal](../maintenance/certificate-renewal.md)
