---
title: Static Site Deployment
description: Deploy static sites to various hosting platforms using Xec
keywords: [deployment, static, cdn, s3, nginx, netlify]
source_files:
  - packages/core/src/operations/file.ts
  - packages/core/src/adapters/ssh-adapter.ts
  - apps/xec/src/commands/copy.ts
key_functions:
  - FileOperations.copy()
  - SSHAdapter.execute()
  - S3Operations.sync()
verification_date: 2025-01-03
---

# Static Site Deployment

## Problem

Deploying static websites and single-page applications (SPAs) to various hosting platforms including traditional servers, CDNs, and cloud storage services while managing cache invalidation and SSL certificates.

## Solution

Xec simplifies static site deployment by providing unified commands for building, optimizing, and deploying to multiple platforms with a single workflow.

## Quick Example

```typescript
// deploy-static.ts
import { $ } from '@xec-sh/core';

// Build the site
await $`npm run build`;

// Deploy to S3
await $`
  aws s3 sync ./dist s3://my-website-bucket \
    --delete \
    --cache-control "public, max-age=31536000"
`;

// Invalidate CloudFront cache
await $`
  aws cloudfront create-invalidation \
    --distribution-id ABCDEF123456 \
    --paths "/*"
`;
```

## Complete Deployment Recipes

### Configuration

```yaml
# .xec/config.yaml
targets:
  web-server:
    type: ssh
    host: web.example.com
    user: deploy
    key: ~/.ssh/deploy_key

tasks:
  deploy-static:
    description: Deploy static site
    params:
      - name: target
        required: true
        values: [nginx, s3, netlify, vercel, github-pages]
      - name: env
        default: production
    steps:
      - name: Build site
        command: npm run build:${params.env}
      - name: Deploy
        command: xec run scripts/deploy-static.ts ${params.target}
```

### Multi-Platform Deployment Script

```typescript
// scripts/deploy-static.ts
import { $, $$ } from '@xec-sh/core';
import chalk from 'chalk';
import { readFile } from 'fs/promises';
import path from 'path';

const platform = process.argv[2] || 'nginx';
const buildDir = './dist';

console.log(chalk.blue(`🚀 Deploying static site to ${platform}...`));

// Platform-specific deployment functions
const deployers = {
  nginx: deployToNginx,
  s3: deployToS3,
  netlify: deployToNetlify,
  vercel: deployToVercel,
  'github-pages': deployToGitHubPages
};

async function deployToNginx() {
  console.log(chalk.gray('Deploying to Nginx server...'));
  
  const server = 'web-server';
  const remotePath = '/var/www/html';
  
  // 1. Create backup of current site
  await $.ssh(server)`
    if [ -d ${remotePath} ]; then
      tar -czf /tmp/site-backup-$(date +%Y%m%d-%H%M%S).tar.gz ${remotePath}
    fi
  `;
  
  // 2. Copy files to server
  console.log(chalk.gray('Copying files...'));
  await $$`
    rsync -avz --delete \
      --exclude='.git' \
      --exclude='node_modules' \
      --exclude='.env*' \
      ${buildDir}/ \
      ${server}:${remotePath}/
  `;
  
  // 3. Set proper permissions
  await $.ssh(server)`
    chown -R www-data:www-data ${remotePath} &&
    find ${remotePath} -type d -exec chmod 755 {} \\; &&
    find ${remotePath} -type f -exec chmod 644 {} \\;
  `;
  
  // 4. Update Nginx configuration for SPA routing
  await $.ssh(server)`
    cat > /etc/nginx/sites-available/default << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    root ${remotePath};
    index index.html;
    
    # SPA routing
    location / {
        try_files \\$uri \\$uri/ /index.html;
    }
    
    # Cache static assets
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain text/css text/javascript application/javascript application/json;
}
EOF
  `;
  
  // 5. Test and reload Nginx
  await $.ssh(server)`
    nginx -t &&
    systemctl reload nginx
  `;
  
  console.log(chalk.green('✅ Deployed to Nginx successfully'));
}

async function deployToS3() {
  console.log(chalk.gray('Deploying to AWS S3...'));
  
  const bucket = process.env.S3_BUCKET || 'my-website-bucket';
  const distributionId = process.env.CF_DISTRIBUTION_ID;
  
  // 1. Build with production optimizations
  await $`npm run build:production`;
  
  // 2. Sync to S3 with proper cache headers
  console.log(chalk.gray('Syncing files to S3...'));
  
  // HTML files - no cache
  await $`
    aws s3 sync ${buildDir} s3://${bucket} \
      --exclude="*" \
      --include="*.html" \
      --cache-control "no-cache, no-store, must-revalidate" \
      --content-type "text/html; charset=utf-8" \
      --delete
  `;
  
  // CSS and JS files - long cache
  await $`
    aws s3 sync ${buildDir} s3://${bucket} \
      --exclude="*.html" \
      --include="*.css" --include="*.js" \
      --cache-control "public, max-age=31536000, immutable" \
      --delete
  `;
  
  // Images and other assets
  await $`
    aws s3 sync ${buildDir} s3://${bucket} \
      --exclude="*.html" --exclude="*.css" --exclude="*.js" \
      --cache-control "public, max-age=86400" \
      --delete
  `;
  
  // 3. Set bucket policy for public access
  await $`
    aws s3api put-bucket-policy --bucket ${bucket} --policy '{
      "Version": "2012-10-17",
      "Statement": [{
        "Sid": "PublicReadGetObject",
        "Effect": "Allow",
        "Principal": "*",
        "Action": "s3:GetObject",
        "Resource": "arn:aws:s3:::${bucket}/*"
      }]
    }'
  `;
  
  // 4. Configure bucket for static website hosting
  await $`
    aws s3 website s3://${bucket} \
      --index-document index.html \
      --error-document error.html
  `;
  
  // 5. Invalidate CloudFront cache if configured
  if (distributionId) {
    console.log(chalk.gray('Invalidating CloudFront cache...'));
    await $`
      aws cloudfront create-invalidation \
        --distribution-id ${distributionId} \
        --paths "/*"
    `;
  }
  
  console.log(chalk.green(`✅ Deployed to S3 bucket: ${bucket}`));
  console.log(chalk.gray(`   URL: http://${bucket}.s3-website.amazonaws.com`));
}

async function deployToNetlify() {
  console.log(chalk.gray('Deploying to Netlify...'));
  
  // 1. Install Netlify CLI if needed
  const netlifyCli = await $`which netlify`.nothrow();
  if (!netlifyCli.ok) {
    await $`npm install -g netlify-cli`;
  }
  
  // 2. Build the site
  await $`npm run build`;
  
  // 3. Create netlify.toml if it doesn't exist
  const netlifyConfig = `
[build]
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "SAMEORIGIN"
    X-Content-Type-Options = "nosniff"
    X-XSS-Protection = "1; mode=block"

[[headers]]
  for = "/*.js"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/*.css"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
`;
  
  await $`echo ${netlifyConfig} > netlify.toml`;
  
  // 4. Deploy to Netlify
  const deployResult = await $`
    netlify deploy --prod --dir=${buildDir} --message="Deployment from Xec"
  `.text();
  
  // Extract URL from output
  const urlMatch = deployResult.match(/Website URL:\s+(.+)/);
  if (urlMatch) {
    console.log(chalk.green(`✅ Deployed to Netlify`));
    console.log(chalk.gray(`   URL: ${urlMatch[1]}`));
  }
}

async function deployToVercel() {
  console.log(chalk.gray('Deploying to Vercel...'));
  
  // 1. Install Vercel CLI if needed
  const vercelCli = await $`which vercel`.nothrow();
  if (!vercelCli.ok) {
    await $`npm install -g vercel`;
  }
  
  // 2. Create vercel.json configuration
  const vercelConfig = {
    version: 2,
    builds: [
      {
        src: "package.json",
        use: "@vercel/static-build",
        config: {
          distDir: "dist"
        }
      }
    ],
    routes: [
      {
        src: "/[^.]+",
        dest: "/",
        status: 200
      }
    ],
    headers: [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN"
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block"
          }
        ]
      },
      {
        source: "/(.*).js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      }
    ]
  };
  
  await $`echo '${JSON.stringify(vercelConfig, null, 2)}' > vercel.json`;
  
  // 3. Build the site
  await $`npm run build`;
  
  // 4. Deploy to Vercel
  await $`vercel --prod --yes`;
  
  console.log(chalk.green('✅ Deployed to Vercel'));
}

async function deployToGitHubPages() {
  console.log(chalk.gray('Deploying to GitHub Pages...'));
  
  // 1. Install gh-pages if needed
  const ghPages = await $`npm list gh-pages`.nothrow();
  if (!ghPages.ok) {
    await $`npm install --save-dev gh-pages`;
  }
  
  // 2. Build the site
  await $`npm run build`;
  
  // 3. Add CNAME file if custom domain
  const customDomain = process.env.GH_PAGES_DOMAIN;
  if (customDomain) {
    await $`echo ${customDomain} > ${buildDir}/CNAME`;
  }
  
  // 4. Deploy using gh-pages
  await $`npx gh-pages -d ${buildDir} -m "Deploy from Xec [skip ci]"`;
  
  const repoUrl = await $`git config --get remote.origin.url`.text();
  const repoName = repoUrl.match(/github\.com[:/](.+?)\.git/)?.[1];
  
  console.log(chalk.green('✅ Deployed to GitHub Pages'));
  if (customDomain) {
    console.log(chalk.gray(`   URL: https://${customDomain}`));
  } else if (repoName) {
    const [owner, repo] = repoName.split('/');
    console.log(chalk.gray(`   URL: https://${owner}.github.io/${repo}`));
  }
}

// Execute deployment
const deployer = deployers[platform];
if (!deployer) {
  console.error(chalk.red(`Unknown platform: ${platform}`));
  console.log('Available platforms:', Object.keys(deployers).join(', '));
  process.exit(1);
}

try {
  await deployer();
  
  // Run post-deployment tests
  console.log(chalk.blue('🔍 Running post-deployment tests...'));
  await $`npm run test:e2e`.nothrow();
  
} catch (error) {
  console.error(chalk.red(`❌ Deployment failed: ${error.message}`));
  process.exit(1);
}
```

### CDN Deployment with Optimization

```typescript
// scripts/cdn-deploy.ts
import { $ } from '@xec-sh/core';
import { glob } from 'glob';
import { readFile, writeFile } from 'fs/promises';
import crypto from 'crypto';
import path from 'path';

// 1. Generate hashed filenames for cache busting
const files = await glob('dist/**/*.{js,css}');
const manifest = {};

for (const file of files) {
  const content = await readFile(file);
  const hash = crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  const dir = path.dirname(file);
  const hashedName = `${base}.${hash}${ext}`;
  const newPath = path.join(dir, hashedName);
  
  await $`mv ${file} ${newPath}`;
  manifest[path.relative('dist', file)] = path.relative('dist', newPath);
}

// 2. Update HTML files with hashed filenames
const htmlFiles = await glob('dist/**/*.html');
for (const htmlFile of htmlFiles) {
  let content = await readFile(htmlFile, 'utf-8');
  
  for (const [original, hashed] of Object.entries(manifest)) {
    content = content.replace(
      new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      hashed
    );
  }
  
  await writeFile(htmlFile, content);
}

// 3. Deploy to CDN
await $`
  aws s3 sync dist/ s3://cdn-bucket/ \
    --cache-control "public, max-age=31536000" \
    --metadata-directive REPLACE
`;

// 4. Invalidate CDN cache
await $`
  aws cloudfront create-invalidation \
    --distribution-id ${process.env.CF_DISTRIBUTION_ID} \
    --paths "/index.html" "/manifest.json"
`;
```

## SSL Certificate Management

```typescript
// scripts/ssl-setup.ts
import { $ } from '@xec-sh/core';

const domain = process.argv[2];
const email = process.argv[3];

// Install Certbot
await $.ssh('web-server')`
  apt-get update &&
  apt-get install -y certbot python3-certbot-nginx
`;

// Obtain certificate
await $.ssh('web-server')`
  certbot --nginx \
    --non-interactive \
    --agree-tos \
    --email ${email} \
    --domains ${domain} \
    --redirect
`;

// Setup auto-renewal
await $.ssh('web-server')`
  echo "0 0,12 * * * root python3 -c 'import random; import time; time.sleep(random.random() * 3600)' && certbot renew -q" \
    > /etc/cron.d/certbot-renew
`;
```

## Performance Optimization

```typescript
// scripts/optimize-static.ts
import { $ } from '@xec-sh/core';

// 1. Minify HTML
await $`html-minifier-terser dist/**/*.html \
  --collapse-whitespace \
  --remove-comments \
  --minify-css \
  --minify-js \
  --output-dir dist-optimized`;

// 2. Optimize images
await $`imagemin dist/images/* \
  --out-dir=dist-optimized/images \
  --plugin=pngquant \
  --plugin=mozjpeg \
  --plugin=svgo`;

// 3. Generate WebP versions
await $`
  for img in dist/images/*.{jpg,png}; do
    cwebp -q 80 "$img" -o "dist-optimized/images/$(basename "$img" | sed 's/\.[^.]*$/.webp/')"
  done
`;

// 4. Create brotli compressed versions
await $`
  find dist-optimized -type f \
    \\( -name "*.html" -o -name "*.css" -o -name "*.js" -o -name "*.svg" \\) \
    -exec brotli --best {} \\;
`;
```

## Usage Examples

```bash
# Deploy to Nginx server
xec deploy-static --target=nginx

# Deploy to S3 with CloudFront
xec deploy-static --target=s3

# Deploy to multiple platforms
xec run scripts/multi-deploy.ts

# Setup SSL certificate
xec run scripts/ssl-setup.ts example.com admin@example.com

# Optimize and deploy
xec run scripts/optimize-static.ts && xec deploy-static --target=cdn
```

## Best Practices

1. **Always optimize assets** before deployment
2. **Use cache busting** for CSS and JavaScript files
3. **Configure proper cache headers** for different file types
4. **Implement SSL/TLS** for all production sites
5. **Setup automatic deployments** via CI/CD
6. **Monitor site performance** after deployment
7. **Use CDN** for global distribution

## Troubleshooting

### Cache Issues

```bash
# Force cache invalidation
aws cloudfront create-invalidation \
  --distribution-id ABCDEF \
  --paths "/*"

# Clear browser cache
# Add version query parameter
echo "?v=$(date +%s)" >> index.html
```

### CORS Errors

```typescript
// Add CORS headers in Nginx
await $.ssh('web-server')`
  cat >> /etc/nginx/sites-available/default << 'EOF'
    add_header Access-Control-Allow-Origin "*";
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
    add_header Access-Control-Allow-Headers "DNT,X-CustomHeader,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type";
EOF
`;
```

## Related Topics

- [Node.js Deployment](node-app-deploy.md)
- [Docker Deployment](docker-deploy.md)
- [GitHub Actions Integration](../integration/github-actions.md)
- [SSL Certificate Management](../maintenance/certificate-renewal.md)