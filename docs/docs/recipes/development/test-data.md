---
title: Test Data Generation
description: Generate realistic test data for development and testing
keywords: [test, data, faker, generation, seed, fixtures]
source_files:
  - packages/core/src/operations/file.ts
  - packages/core/src/utils/data.ts
  - packages/core/examples/data-generation.ts
key_functions:
  - fs.writeFile()
  - JSON.stringify()
  - faker.generate()
verification_date: 2025-08-03
---

# Test Data Generation Recipe

## Implementation Reference

**Source Files:**
- `packages/core/src/operations/file.ts` - File operations
- `packages/core/src/utils/data.ts` - Data utilities
- `packages/core/examples/data-generation.ts` - Generation examples

**Key Functions:**
- `fs.writeFile()` - Write generated data to files
- `JSON.stringify()` - Serialize data structures
- `CSV.generate()` - CSV data generation

## Overview

This recipe demonstrates how to generate realistic test data for development and testing using Faker.js, custom generators, and data transformation utilities with Xec.

## Basic Data Generation

### User Data Generation

```typescript
// generate-users.ts
import { $ } from '@xec-sh/core';
import { faker } from '@faker-js/faker';
import { writeFile } from 'fs/promises';

interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string;
  birthDate: Date;
  registeredAt: Date;
  isActive: boolean;
  role: 'admin' | 'user' | 'moderator';
  preferences: {
    theme: 'light' | 'dark';
    notifications: boolean;
    language: string;
  };
}

function generateUser(): User {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  
  return {
    id: faker.string.uuid(),
    username: faker.internet.userName({ firstName, lastName }),
    email: faker.internet.email({ firstName, lastName }),
    firstName,
    lastName,
    avatar: faker.image.avatar(),
    birthDate: faker.date.birthdate({ min: 18, max: 65, mode: 'age' }),
    registeredAt: faker.date.past({ years: 2 }),
    isActive: faker.datatype.boolean({ probability: 0.9 }),
    role: faker.helpers.arrayElement(['admin', 'user', 'moderator']),
    preferences: {
      theme: faker.helpers.arrayElement(['light', 'dark']),
      notifications: faker.datatype.boolean({ probability: 0.7 }),
      language: faker.helpers.arrayElement(['en', 'es', 'fr', 'de', 'ja'])
    }
  };
}

async function generateUsers(count: number = 100) {
  console.log(`Generating ${count} users...`);
  
  const users: User[] = [];
  for (let i = 0; i < count; i++) {
    users.push(generateUser());
  }
  
  // Ensure at least one admin
  users[0].role = 'admin';
  users[0].isActive = true;
  
  // Save as JSON
  await writeFile('users.json', JSON.stringify(users, null, 2));
  console.log(`✅ Generated ${count} users in users.json`);
  
  // Save as CSV
  const csv = [
    'id,username,email,firstName,lastName,role,isActive',
    ...users.map(u => 
      `${u.id},${u.username},${u.email},${u.firstName},${u.lastName},${u.role},${u.isActive}`
    )
  ].join('\n');
  
  await writeFile('users.csv', csv);
  console.log(`✅ Generated users.csv`);
  
  return users;
}

generateUsers(100).catch(console.error);
```

### Product Data Generation

```typescript
// generate-products.ts
import { $ } from '@xec-sh/core';
import { faker } from '@faker-js/faker';
import { writeFile } from 'fs/promises';

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  price: number;
  cost: number;
  stock: number;
  images: string[];
  tags: string[];
  specifications: Record<string, string>;
  ratings: {
    average: number;
    count: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const categories = {
  'Electronics': ['Smartphones', 'Laptops', 'Tablets', 'Accessories'],
  'Clothing': ['Men', 'Women', 'Kids', 'Shoes'],
  'Home': ['Furniture', 'Decor', 'Kitchen', 'Garden'],
  'Books': ['Fiction', 'Non-Fiction', 'Technical', 'Comics'],
  'Sports': ['Equipment', 'Apparel', 'Footwear', 'Accessories']
};

function generateProduct(): Product {
  const category = faker.helpers.objectKey(categories);
  const subcategory = faker.helpers.arrayElement(categories[category]);
  const cost = faker.number.float({ min: 10, max: 500, precision: 0.01 });
  const margin = faker.number.float({ min: 1.2, max: 2.5, precision: 0.01 });
  
  return {
    id: faker.string.uuid(),
    sku: faker.string.alphanumeric(8).toUpperCase(),
    name: faker.commerce.productName(),
    description: faker.commerce.productDescription(),
    category,
    subcategory,
    price: parseFloat((cost * margin).toFixed(2)),
    cost,
    stock: faker.number.int({ min: 0, max: 1000 }),
    images: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, 
      () => faker.image.url()),
    tags: faker.helpers.multiple(
      () => faker.commerce.productAdjective(),
      { count: { min: 2, max: 5 } }
    ),
    specifications: {
      weight: `${faker.number.float({ min: 0.1, max: 10, precision: 0.1 })} kg`,
      dimensions: `${faker.number.int({ min: 10, max: 100 })}x${faker.number.int({ min: 10, max: 100 })}x${faker.number.int({ min: 10, max: 100 })} cm`,
      material: faker.commerce.productMaterial(),
      color: faker.color.human(),
      warranty: `${faker.number.int({ min: 1, max: 3 })} years`
    },
    ratings: {
      average: faker.number.float({ min: 1, max: 5, precision: 0.1 }),
      count: faker.number.int({ min: 0, max: 500 })
    },
    createdAt: faker.date.past({ years: 1 }),
    updatedAt: faker.date.recent({ days: 30 })
  };
}

async function generateProducts(count: number = 500) {
  console.log(`Generating ${count} products...`);
  
  const products = Array.from({ length: count }, generateProduct);
  
  await writeFile('products.json', JSON.stringify(products, null, 2));
  console.log(`✅ Generated ${count} products in products.json`);
  
  // Generate category summary
  const summary = products.reduce((acc, product) => {
    acc[product.category] = (acc[product.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('\nCategory Distribution:');
  Object.entries(summary).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count} products`);
  });
  
  return products;
}

generateProducts(500).catch(console.error);
```

## Relational Data Generation

### Order and Transaction Data

```typescript
// generate-orders.ts
import { $ } from '@xec-sh/core';
import { faker } from '@faker-js/faker';
import { writeFile, readFile } from 'fs/promises';

interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  items: OrderItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  shippingAddress: Address;
  billingAddress: Address;
  paymentMethod: PaymentMethod;
  createdAt: Date;
  updatedAt: Date;
}

interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
  total: number;
}

interface Address {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

interface PaymentMethod {
  type: 'credit_card' | 'paypal' | 'bank_transfer';
  last4?: string;
  brand?: string;
}

async function generateOrders() {
  // Load existing users and products
  const users = JSON.parse(await readFile('users.json', 'utf-8'));
  const products = JSON.parse(await readFile('products.json', 'utf-8'));
  
  if (!users.length || !products.length) {
    throw new Error('Please generate users and products first');
  }
  
  const orders: Order[] = [];
  const orderCount = faker.number.int({ min: 100, max: 500 });
  
  console.log(`Generating ${orderCount} orders...`);
  
  for (let i = 0; i < orderCount; i++) {
    const user = faker.helpers.arrayElement(users);
    const itemCount = faker.number.int({ min: 1, max: 5 });
    const items: OrderItem[] = [];
    
    for (let j = 0; j < itemCount; j++) {
      const product = faker.helpers.arrayElement(products);
      const quantity = faker.number.int({ min: 1, max: 3 });
      items.push({
        productId: product.id,
        quantity,
        price: product.price,
        total: product.price * quantity
      });
    }
    
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const tax = subtotal * 0.08; // 8% tax
    const shipping = subtotal > 100 ? 0 : 10; // Free shipping over $100
    const total = subtotal + tax + shipping;
    
    const order: Order = {
      id: faker.string.uuid(),
      orderNumber: `ORD-${faker.string.numeric(8)}`,
      userId: user.id,
      status: faker.helpers.weightedArrayElement([
        { weight: 10, value: 'pending' },
        { weight: 15, value: 'processing' },
        { weight: 20, value: 'shipped' },
        { weight: 50, value: 'delivered' },
        { weight: 5, value: 'cancelled' }
      ]),
      items,
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      shipping: parseFloat(shipping.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      shippingAddress: {
        street: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state(),
        country: faker.location.country(),
        postalCode: faker.location.zipCode()
      },
      billingAddress: {
        street: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state(),
        country: faker.location.country(),
        postalCode: faker.location.zipCode()
      },
      paymentMethod: {
        type: faker.helpers.arrayElement(['credit_card', 'paypal', 'bank_transfer']),
        last4: faker.finance.creditCardNumber().slice(-4),
        brand: faker.helpers.arrayElement(['Visa', 'MasterCard', 'Amex'])
      },
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: faker.date.recent({ days: 7 })
    };
    
    orders.push(order);
  }
  
  // Sort by date
  orders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  
  await writeFile('orders.json', JSON.stringify(orders, null, 2));
  console.log(`✅ Generated ${orders.length} orders in orders.json`);
  
  // Generate summary statistics
  const stats = {
    totalOrders: orders.length,
    totalRevenue: orders.reduce((sum, o) => sum + o.total, 0),
    averageOrderValue: orders.reduce((sum, o) => sum + o.total, 0) / orders.length,
    statusBreakdown: orders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  };
  
  console.log('\nOrder Statistics:');
  console.log(`  Total Orders: ${stats.totalOrders}`);
  console.log(`  Total Revenue: $${stats.totalRevenue.toFixed(2)}`);
  console.log(`  Average Order Value: $${stats.averageOrderValue.toFixed(2)}`);
  console.log('  Status Breakdown:');
  Object.entries(stats.statusBreakdown).forEach(([status, count]) => {
    console.log(`    ${status}: ${count}`);
  });
  
  return orders;
}

generateOrders().catch(console.error);
```

## Time Series Data

### Metrics and Analytics Data

```typescript
// generate-metrics.ts
import { $ } from '@xec-sh/core';
import { faker } from '@faker-js/faker';
import { writeFile } from 'fs/promises';

interface Metric {
  timestamp: Date;
  cpu: number;
  memory: number;
  disk: number;
  network: {
    in: number;
    out: number;
  };
  requests: number;
  errors: number;
  responseTime: number;
}

function generateMetrics(hours: number = 24): Metric[] {
  const metrics: Metric[] = [];
  const now = new Date();
  const interval = 60; // 1 minute intervals
  const dataPoints = hours * 60;
  
  let baselineCpu = 30;
  let baselineMemory = 50;
  let baselineRequests = 100;
  
  for (let i = 0; i < dataPoints; i++) {
    const timestamp = new Date(now.getTime() - (dataPoints - i) * interval * 1000);
    const hour = timestamp.getHours();
    
    // Simulate daily patterns
    const isBusinessHours = hour >= 9 && hour <= 17;
    const isPeakHour = hour === 12 || hour === 15;
    
    // Add some randomness and patterns
    baselineCpu += faker.number.float({ min: -2, max: 2 });
    baselineCpu = Math.max(10, Math.min(90, baselineCpu));
    
    baselineMemory += faker.number.float({ min: -1, max: 1 });
    baselineMemory = Math.max(30, Math.min(80, baselineMemory));
    
    if (isBusinessHours) {
      baselineRequests = faker.number.int({ min: 150, max: 300 });
      if (isPeakHour) {
        baselineRequests = faker.number.int({ min: 300, max: 500 });
      }
    } else {
      baselineRequests = faker.number.int({ min: 50, max: 150 });
    }
    
    metrics.push({
      timestamp,
      cpu: baselineCpu + faker.number.float({ min: -5, max: 5 }),
      memory: baselineMemory + faker.number.float({ min: -3, max: 3 }),
      disk: faker.number.float({ min: 40, max: 60 }),
      network: {
        in: faker.number.int({ min: 1000, max: 10000 }),
        out: faker.number.int({ min: 5000, max: 20000 })
      },
      requests: baselineRequests,
      errors: faker.number.int({ min: 0, max: baselineRequests * 0.05 }),
      responseTime: faker.number.float({ min: 50, max: 500 })
    });
  }
  
  return metrics;
}

async function generateMetricsData() {
  console.log('Generating metrics data...');
  
  const metrics = generateMetrics(24);
  
  // Save as JSON
  await writeFile('metrics.json', JSON.stringify(metrics, null, 2));
  console.log(`✅ Generated ${metrics.length} metric data points`);
  
  // Save as CSV for analysis
  const csv = [
    'timestamp,cpu,memory,disk,network_in,network_out,requests,errors,response_time',
    ...metrics.map(m => 
      `${m.timestamp.toISOString()},${m.cpu.toFixed(2)},${m.memory.toFixed(2)},${m.disk.toFixed(2)},${m.network.in},${m.network.out},${m.requests},${m.errors},${m.responseTime.toFixed(2)}`
    )
  ].join('\n');
  
  await writeFile('metrics.csv', csv);
  console.log('✅ Generated metrics.csv');
  
  // Generate summary
  const avgCpu = metrics.reduce((sum, m) => sum + m.cpu, 0) / metrics.length;
  const avgMemory = metrics.reduce((sum, m) => sum + m.memory, 0) / metrics.length;
  const totalRequests = metrics.reduce((sum, m) => sum + m.requests, 0);
  const totalErrors = metrics.reduce((sum, m) => sum + m.errors, 0);
  
  console.log('\nMetrics Summary:');
  console.log(`  Average CPU: ${avgCpu.toFixed(2)}%`);
  console.log(`  Average Memory: ${avgMemory.toFixed(2)}%`);
  console.log(`  Total Requests: ${totalRequests}`);
  console.log(`  Total Errors: ${totalErrors}`);
  console.log(`  Error Rate: ${((totalErrors / totalRequests) * 100).toFixed(2)}%`);
}

generateMetricsData().catch(console.error);
```

## Database Seeding

### PostgreSQL Seeding

```typescript
// seed-postgres.ts
import { $ } from '@xec-sh/core';
import { readFile } from 'fs/promises';

async function seedPostgres() {
  const users = JSON.parse(await readFile('users.json', 'utf-8'));
  const products = JSON.parse(await readFile('products.json', 'utf-8'));
  
  console.log('Seeding PostgreSQL database...');
  
  // Create tables
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      first_name VARCHAR(50),
      last_name VARCHAR(50),
      role VARCHAR(20),
      is_active BOOLEAN,
      created_at TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY,
      sku VARCHAR(20) UNIQUE NOT NULL,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      category VARCHAR(50),
      price DECIMAL(10, 2),
      stock INTEGER,
      created_at TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
  `;
  
  await $`docker exec -i postgres-dev psql -U developer -d myapp`.stdin(schema);
  console.log('✅ Tables created');
  
  // Insert users
  for (const user of users.slice(0, 100)) { // Insert first 100
    const sql = `
      INSERT INTO users (id, username, email, first_name, last_name, role, is_active, created_at)
      VALUES ('${user.id}', '${user.username}', '${user.email}', '${user.firstName}', 
              '${user.lastName}', '${user.role}', ${user.isActive}, '${user.registeredAt}')
      ON CONFLICT (id) DO NOTHING;
    `;
    await $`docker exec -i postgres-dev psql -U developer -d myapp`.stdin(sql).nothrow();
  }
  console.log(`✅ Inserted ${users.length} users`);
  
  // Insert products
  for (const product of products.slice(0, 100)) {
    const sql = `
      INSERT INTO products (id, sku, name, description, category, price, stock, created_at)
      VALUES ('${product.id}', '${product.sku}', '${product.name.replace(/'/g, "''")}', 
              '${product.description.replace(/'/g, "''")}', '${product.category}', 
              ${product.price}, ${product.stock}, '${product.createdAt}')
      ON CONFLICT (id) DO NOTHING;
    `;
    await $`docker exec -i postgres-dev psql -U developer -d myapp`.stdin(sql).nothrow();
  }
  console.log(`✅ Inserted ${products.length} products`);
  
  // Verify
  const count = await $`docker exec postgres-dev psql -U developer -d myapp -t -c "SELECT COUNT(*) FROM users"`;
  console.log(`\nDatabase seeded: ${count.stdout.trim()} users in database`);
}

seedPostgres().catch(console.error);
```

## Bulk Data Generation

### Large Dataset Generation

```typescript
// generate-large-dataset.ts
import { $ } from '@xec-sh/core';
import { faker } from '@faker-js/faker';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable, Transform } from 'stream';

async function generateLargeDataset(records: number = 1000000) {
  console.log(`Generating ${records.toLocaleString()} records...`);
  
  let count = 0;
  const batchSize = 1000;
  
  // Create a readable stream that generates data
  const dataStream = new Readable({
    read() {
      if (count >= records) {
        this.push(null); // End stream
        return;
      }
      
      const batch = [];
      const currentBatchSize = Math.min(batchSize, records - count);
      
      for (let i = 0; i < currentBatchSize; i++) {
        batch.push({
          id: faker.string.uuid(),
          timestamp: faker.date.recent().toISOString(),
          event: faker.helpers.arrayElement(['click', 'view', 'purchase', 'signup']),
          userId: faker.string.uuid(),
          sessionId: faker.string.alphanumeric(16),
          ip: faker.internet.ip(),
          userAgent: faker.internet.userAgent(),
          referrer: faker.internet.url(),
          data: {
            page: faker.system.filePath(),
            action: faker.hacker.verb(),
            value: faker.number.float({ min: 0, max: 1000 })
          }
        });
        count++;
      }
      
      this.push(JSON.stringify(batch));
      
      if (count % 10000 === 0) {
        console.log(`  Generated ${count.toLocaleString()} / ${records.toLocaleString()} records`);
      }
    }
  });
  
  // Transform stream to format as NDJSON
  const formatStream = new Transform({
    transform(chunk, encoding, callback) {
      const batch = JSON.parse(chunk);
      const ndjson = batch.map(item => JSON.stringify(item)).join('\n') + '\n';
      callback(null, ndjson);
    }
  });
  
  // Write to file
  const writeStream = createWriteStream('large-dataset.ndjson');
  
  await pipeline(dataStream, formatStream, writeStream);
  
  console.log(`✅ Generated ${records.toLocaleString()} records in large-dataset.ndjson`);
  
  // Get file size
  const stats = await $`ls -lh large-dataset.ndjson`;
  console.log(stats.stdout);
}

generateLargeDataset(1000000).catch(console.error);
```

## Test Data Management

### Data Cleanup Script

```typescript
// cleanup-test-data.ts
import { $ } from '@xec-sh/core';

async function cleanupTestData() {
  console.log('Cleaning up test data...');
  
  // Remove generated files
  const files = [
    'users.json',
    'users.csv',
    'products.json',
    'orders.json',
    'metrics.json',
    'metrics.csv',
    'large-dataset.ndjson'
  ];
  
  for (const file of files) {
    await $`rm -f ${file}`.nothrow();
  }
  console.log('✅ Removed generated files');
  
  // Clean database
  const cleanupSQL = `
    TRUNCATE TABLE users CASCADE;
    TRUNCATE TABLE products CASCADE;
    TRUNCATE TABLE orders CASCADE;
  `;
  
  await $`docker exec -i postgres-dev psql -U developer -d myapp`.stdin(cleanupSQL).nothrow();
  console.log('✅ Cleaned database tables');
  
  // Clear Redis cache
  await $`docker exec redis-dev redis-cli -a redispass FLUSHALL`.nothrow();
  console.log('✅ Cleared Redis cache');
  
  console.log('\n✅ Test data cleanup complete');
}

cleanupTestData().catch(console.error);
```

## Configuration

### Xec Task Configuration

```yaml
# .xec/config.yaml
tasks:
  data:generate:all:
    description: Generate all test data
    steps:
      - name: Generate users
        command: xec run generate-users.ts
      - name: Generate products
        command: xec run generate-products.ts
      - name: Generate orders
        command: xec run generate-orders.ts
      - name: Generate metrics
        command: xec run generate-metrics.ts
        
  data:seed:
    description: Seed databases with test data
    steps:
      - name: Seed PostgreSQL
        command: xec run seed-postgres.ts
      - name: Seed MongoDB
        command: xec run seed-mongodb.ts
      - name: Seed Redis
        command: xec run seed-redis.ts
        
  data:cleanup:
    description: Clean up all test data
    command: xec run cleanup-test-data.ts
    
  data:backup:
    description: Backup test data
    params:
      - name: output
        default: ./backups/test-data
    steps:
      - name: Create backup directory
        command: mkdir -p ${params.output}
      - name: Copy data files
        command: cp *.json *.csv ${params.output}/
      - name: Create archive
        command: tar -czf ${params.output}/test-data-$(date +%Y%m%d).tar.gz ${params.output}
```

## Performance Characteristics

**Based on Implementation:**

### Generation Performance
- **Simple Objects**: 10,000 records/second
- **Complex Objects**: 1,000 records/second
- **With Relations**: 500 records/second
- **Large Datasets**: 100MB/minute

### Memory Usage
- **Small Dataset (&lt;10K)**: ~50MB
- **Medium Dataset (100K)**: ~200MB
- **Large Dataset (1M)**: Streamed, ~100MB constant
- **Faker.js Overhead**: ~30MB

### I/O Performance
- **JSON Write**: 10-50MB/s
- **CSV Write**: 20-100MB/s
- **NDJSON Stream**: 50-200MB/s
- **Database Insert**: 1000-5000 records/s

## Best Practices

1. **Deterministic Generation**
   ```typescript
   faker.seed(12345); // Same seed = same data
   ```

2. **Realistic Relationships**
   - Maintain referential integrity
   - Use weighted distributions
   - Follow business rules

3. **Performance Optimization**
   - Stream large datasets
   - Batch database inserts
   - Use appropriate formats (NDJSON for streaming)

4. **Data Variety**
   - Include edge cases
   - Vary data distributions
   - Test boundary conditions

## Related Recipes

- [Database Setup](./database-setup.md) - Database configuration
- [API Mocking](./api-mocking.md) - Mock servers
- [Hot Reload](./hot-reload.md) - Development workflow
- [Backup Restore](../maintenance/backup-restore.md) - Data backup

## See Also

- [File Operations](../../scripting/basics/command-execution.md)
- [Data Processing](../../scripting/patterns/streaming.md)
- [Testing Guide](../../guides/automation/testing.md)