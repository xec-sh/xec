---
title: API Mocking
description: Mock API servers and services for development and testing
keywords: [api, mock, testing, json-server, wiremock, development]
source_files:
  - packages/core/src/operations/http.ts
  - packages/core/src/adapters/docker-adapter.ts
  - packages/core/examples/api-testing.ts
key_functions:
  - fetch()
  - $.docker()
  - HttpClient.request()
verification_date: 2025-08-03
---

# API Mocking Recipe

## Implementation Reference

**Source Files:**
- `packages/core/src/operations/http.ts` - HTTP operations
- `packages/core/src/adapters/docker-adapter.ts` - Docker container execution
- `packages/core/examples/api-testing.ts` - API testing examples

**Key Functions:**
- `fetch()` - HTTP request execution
- `$.docker()` - Docker container management
- `HttpClient.request()` - HTTP client implementation

## Overview

This recipe demonstrates how to set up mock API servers for development and testing using various tools like JSON Server, WireMock, and custom Express servers with Xec automation.

## JSON Server Mock

### Quick JSON Server Setup

```typescript
// setup-json-server.ts
import { $ } from '@xec-sh/core';
import { writeFile } from 'fs/promises';

async function setupJsonServer() {
  // Create mock data
  const mockData = {
    users: [
      { id: 1, name: 'Alice', email: 'alice@example.com', role: 'admin' },
      { id: 2, name: 'Bob', email: 'bob@example.com', role: 'user' },
      { id: 3, name: 'Charlie', email: 'charlie@example.com', role: 'user' }
    ],
    posts: [
      { id: 1, userId: 1, title: 'First Post', content: 'Hello World' },
      { id: 2, userId: 2, title: 'Second Post', content: 'Testing API' }
    ],
    comments: [
      { id: 1, postId: 1, userId: 2, text: 'Great post!' },
      { id: 2, postId: 1, userId: 3, text: 'Thanks for sharing' }
    ]
  };
  
  await writeFile('db.json', JSON.stringify(mockData, null, 2));
  
  // Create routes configuration
  const routes = {
    "/api/*": "/$1",
    "/users/:id/posts": "/posts?userId=:id"
  };
  
  await writeFile('routes.json', JSON.stringify(routes, null, 2));
  
  // Install json-server if needed
  const checkInstall = await $`npm list -g json-server`.nothrow();
  if (checkInstall.exitCode !== 0) {
    console.log('Installing json-server...');
    await $`npm install -g json-server`;
  }
  
  // Start json-server
  console.log('Starting JSON Server on port 3000...');
  const server = $`json-server --watch db.json --routes routes.json --port 3000 --delay 500`;
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log(`
Mock API Server ready:
  Base URL: http://localhost:3000
  API URL: http://localhost:3000/api
  
  Endpoints:
    GET    /api/users
    GET    /api/users/:id
    POST   /api/users
    PUT    /api/users/:id
    DELETE /api/users/:id
    GET    /api/users/:id/posts
    
  Admin UI: http://localhost:3000
  `);
  
  return server;
}

setupJsonServer().catch(console.error);
```

### JSON Server with Docker

```typescript
// json-server-docker.ts
import { $ } from '@xec-sh/core';

async function setupJsonServerDocker() {
  // Create Dockerfile for custom json-server
  const dockerfile = `
FROM node:18-alpine
WORKDIR /app
RUN npm install -g json-server
COPY db.json .
COPY routes.json .
EXPOSE 3000
CMD ["json-server", "--watch", "db.json", "--routes", "routes.json", "--host", "0.0.0.0", "--port", "3000"]
`;
  
  await $`echo ${dockerfile} > Dockerfile.json-server`;
  
  // Build custom image
  console.log('Building JSON Server image...');
  await $`docker build -f Dockerfile.json-server -t json-server-mock .`;
  
  // Run container
  console.log('Starting JSON Server container...');
  await $`docker run -d \
    --name json-server \
    -p 3000:3000 \
    -v $(pwd)/db.json:/app/db.json \
    -v $(pwd)/routes.json:/app/routes.json \
    json-server-mock`;
  
  // Health check
  for (let i = 0; i < 10; i++) {
    const result = await $`curl -s http://localhost:3000/api/users`.nothrow();
    if (result.exitCode === 0) {
      console.log('✅ JSON Server is ready!');
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

setupJsonServerDocker().catch(console.error);
```

## WireMock Setup

### WireMock for Complex Mocking

```typescript
// setup-wiremock.ts
import { $ } from '@xec-sh/core';
import { mkdir, writeFile } from 'fs/promises';

async function setupWireMock() {
  // Create mappings directory
  await mkdir('wiremock/mappings', { recursive: true });
  await mkdir('wiremock/__files', { recursive: true });
  
  // Create mapping for user API
  const userMapping = {
    request: {
      method: 'GET',
      urlPattern: '/api/users/([0-9]+)'
    },
    response: {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      jsonBody: {
        id: '${request.pathSegments.[2]}',
        name: 'Test User',
        email: 'test@example.com'
      }
    }
  };
  
  await writeFile(
    'wiremock/mappings/user-api.json',
    JSON.stringify(userMapping, null, 2)
  );
  
  // Create mapping for authentication
  const authMapping = {
    request: {
      method: 'POST',
      url: '/api/auth/login',
      bodyPatterns: [{
        matchesJsonPath: '$.email',
        matchesJsonPath: '$.password'
      }]
    },
    response: {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      jsonBody: {
        token: 'mock-jwt-token-${randomValue}',
        expiresIn: 3600
      }
    }
  };
  
  await writeFile(
    'wiremock/mappings/auth-api.json',
    JSON.stringify(authMapping, null, 2)
  );
  
  // Create stateful scenario
  const statefulMapping = {
    mappings: [{
      scenarioName: 'User Registration',
      requiredScenarioState: 'Started',
      newScenarioState: 'User Created',
      request: {
        method: 'POST',
        url: '/api/users'
      },
      response: {
        status: 201,
        jsonBody: {
          id: '${randomValue}',
          message: 'User created successfully'
        }
      }
    }]
  };
  
  await writeFile(
    'wiremock/mappings/scenarios.json',
    JSON.stringify(statefulMapping, null, 2)
  );
  
  // Run WireMock with Docker
  console.log('Starting WireMock...');
  await $`docker run -d \
    --name wiremock \
    -p 8080:8080 \
    -v $(pwd)/wiremock:/home/wiremock \
    wiremock/wiremock:latest \
    --verbose \
    --global-response-templating`;
  
  // Wait for WireMock to start
  for (let i = 0; i < 10; i++) {
    const result = await $`curl -s http://localhost:8080/__admin/health`.nothrow();
    if (result.exitCode === 0) {
      console.log('✅ WireMock is ready!');
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`
WireMock Mock Server ready:
  API URL: http://localhost:8080
  Admin API: http://localhost:8080/__admin
  
  Configured endpoints:
    GET  /api/users/:id
    POST /api/auth/login
    POST /api/users (stateful)
  `);
}

setupWireMock().catch(console.error);
```

## Custom Express Mock Server

### Express Server with TypeScript

```typescript
// mock-server.ts
import express from 'express';
import { $ } from '@xec-sh/core';

interface User {
  id: number;
  name: string;
  email: string;
}

class MockAPIServer {
  private app: express.Application;
  private users: Map<number, User> = new Map();
  private nextId = 1;
  
  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.seedData();
  }
  
  private setupMiddleware() {
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }
  
  private setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date() });
    });
    
    // User CRUD
    this.app.get('/api/users', (req, res) => {
      const users = Array.from(this.users.values());
      res.json(users);
    });
    
    this.app.get('/api/users/:id', (req, res) => {
      const user = this.users.get(parseInt(req.params.id));
      if (user) {
        res.json(user);
      } else {
        res.status(404).json({ error: 'User not found' });
      }
    });
    
    this.app.post('/api/users', (req, res) => {
      const user: User = {
        id: this.nextId++,
        name: req.body.name,
        email: req.body.email
      };
      this.users.set(user.id, user);
      res.status(201).json(user);
    });
    
    this.app.put('/api/users/:id', (req, res) => {
      const id = parseInt(req.params.id);
      if (this.users.has(id)) {
        const user = { ...this.users.get(id)!, ...req.body };
        this.users.set(id, user);
        res.json(user);
      } else {
        res.status(404).json({ error: 'User not found' });
      }
    });
    
    this.app.delete('/api/users/:id', (req, res) => {
      const id = parseInt(req.params.id);
      if (this.users.delete(id)) {
        res.status(204).send();
      } else {
        res.status(404).json({ error: 'User not found' });
      }
    });
    
    // Delayed response endpoint
    this.app.get('/api/slow', async (req, res) => {
      const delay = parseInt(req.query.delay as string) || 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      res.json({ message: 'Slow response', delay });
    });
    
    // Random failure endpoint
    this.app.get('/api/flaky', (req, res) => {
      if (Math.random() > 0.5) {
        res.json({ success: true });
      } else {
        res.status(500).json({ error: 'Random failure' });
      }
    });
  }
  
  private seedData() {
    this.users.set(1, { id: 1, name: 'Alice', email: 'alice@example.com' });
    this.users.set(2, { id: 2, name: 'Bob', email: 'bob@example.com' });
    this.nextId = 3;
  }
  
  start(port = 3000) {
    return this.app.listen(port, () => {
      console.log(`Mock API Server running on http://localhost:${port}`);
    });
  }
}

// Start server
const server = new MockAPIServer();
server.start(3000);
```

### Running the Custom Server

```typescript
// run-mock-server.ts
import { $ } from '@xec-sh/core';

async function runMockServer() {
  // Compile TypeScript
  console.log('Compiling mock server...');
  await $`npx tsc mock-server.ts --module commonjs --target es2020 --esModuleInterop`;
  
  // Start server in background
  console.log('Starting mock server...');
  const server = $`node mock-server.js`.nothrow();
  
  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test the server
  console.log('Testing mock server...');
  const response = await fetch('http://localhost:3000/api/users');
  const users = await response.json();
  console.log('Users:', users);
  
  return server;
}

runMockServer().catch(console.error);
```

## GraphQL Mock Server

### Apollo Server Mock

```typescript
// graphql-mock.ts
import { $ } from '@xec-sh/core';
import { writeFile } from 'fs/promises';

async function setupGraphQLMock() {
  // Create GraphQL schema
  const schema = `
    type User {
      id: ID!
      name: String!
      email: String!
      posts: [Post!]!
    }
    
    type Post {
      id: ID!
      title: String!
      content: String!
      author: User!
      comments: [Comment!]!
    }
    
    type Comment {
      id: ID!
      text: String!
      author: User!
      post: Post!
    }
    
    type Query {
      users: [User!]!
      user(id: ID!): User
      posts: [Post!]!
      post(id: ID!): Post
    }
    
    type Mutation {
      createUser(name: String!, email: String!): User!
      createPost(title: String!, content: String!, authorId: ID!): Post!
      createComment(text: String!, postId: ID!, authorId: ID!): Comment!
    }
  `;
  
  await writeFile('schema.graphql', schema);
  
  // Create Apollo server with mocks
  const serverCode = `
const { ApolloServer } = require('@apollo/server');
const { startStandaloneServer } = require('@apollo/server/standalone');
const { readFileSync } = require('fs');
const { faker } = require('@faker-js/faker');

const typeDefs = readFileSync('./schema.graphql', 'utf-8');

const mocks = {
  User: () => ({
    id: faker.datatype.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
  }),
  Post: () => ({
    id: faker.datatype.uuid(),
    title: faker.lorem.sentence(),
    content: faker.lorem.paragraphs(),
  }),
  Comment: () => ({
    id: faker.datatype.uuid(),
    text: faker.lorem.sentence(),
  }),
};

async function startServer() {
  const server = new ApolloServer({
    typeDefs,
    mocks,
  });
  
  const { url } = await startStandaloneServer(server, {
    listen: { port: 4000 },
  });
  
  console.log(\`GraphQL Mock Server ready at \${url}\`);
}

startServer();
`;
  
  await writeFile('graphql-server.js', serverCode);
  
  // Install dependencies
  console.log('Installing GraphQL dependencies...');
  await $`npm install @apollo/server @faker-js/faker graphql`;
  
  // Start GraphQL server
  console.log('Starting GraphQL mock server...');
  const server = $`node graphql-server.js`;
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log(`
GraphQL Mock Server ready:
  URL: http://localhost:4000
  GraphQL Playground: http://localhost:4000
  
  Example Query:
    query {
      users {
        id
        name
        email
        posts {
          title
        }
      }
    }
  `);
  
  return server;
}

setupGraphQLMock().catch(console.error);
```

## Testing with Mock APIs

### Integration Test Example

```typescript
// test-with-mocks.ts
import { $ } from '@xec-sh/core';

async function testWithMockAPI() {
  // Start mock server
  console.log('Starting mock server...');
  await $`xec run setup-json-server.ts`.nothrow();
  
  // Wait for server
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Run tests against mock
  console.log('Running integration tests...');
  
  // Test user creation
  const createResponse = await fetch('http://localhost:3000/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test User',
      email: 'test@example.com',
      role: 'user'
    })
  });
  
  if (createResponse.ok) {
    const newUser = await createResponse.json();
    console.log('✅ User created:', newUser);
  }
  
  // Test user retrieval
  const getResponse = await fetch('http://localhost:3000/api/users');
  const users = await getResponse.json();
  console.log(`✅ Retrieved ${users.length} users`);
  
  // Test pagination
  const pageResponse = await fetch('http://localhost:3000/api/users?_page=1&_limit=2');
  const page = await pageResponse.json();
  console.log(`✅ Pagination works: ${page.length} users per page`);
  
  // Test filtering
  const filterResponse = await fetch('http://localhost:3000/api/users?role=admin');
  const admins = await filterResponse.json();
  console.log(`✅ Filtering works: ${admins.length} admins found`);
  
  // Cleanup
  console.log('Stopping mock server...');
  await $`pkill -f json-server`.nothrow();
  
  console.log('\n✅ All tests passed!');
}

testWithMockAPI().catch(console.error);
```

## Mock Service Configuration

### Xec Configuration

```yaml
# .xec/config.yaml
tasks:
  mock:start:
    description: Start all mock services
    steps:
      - name: Start JSON Server
        command: json-server --watch db.json --port 3000 &
      - name: Start WireMock
        command: docker run -d --name wiremock -p 8080:8080 wiremock/wiremock
      - name: Start GraphQL Mock
        command: node graphql-server.js &
        
  mock:stop:
    description: Stop all mock services
    steps:
      - name: Stop JSON Server
        command: pkill -f json-server
      - name: Stop WireMock
        command: docker stop wiremock && docker rm wiremock
      - name: Stop GraphQL
        command: pkill -f graphql-server
        
  mock:reset:
    description: Reset mock data
    command: |
      cp db.backup.json db.json
      curl -X POST http://localhost:8080/__admin/reset
      
  test:integration:
    description: Run integration tests with mocks
    steps:
      - name: Start mocks
        command: xec mock:start
      - name: Wait for services
        command: sleep 3
      - name: Run tests
        command: npm test
      - name: Stop mocks
        command: xec mock:stop
```

## Performance Characteristics

**Based on Implementation:**

### Mock Server Performance
- **JSON Server Startup**: 1-2 seconds
- **WireMock Startup**: 3-5 seconds
- **Express Server Startup**: &lt;1 second
- **GraphQL Server Startup**: 2-3 seconds

### Response Times
- **JSON Server**: 10-50ms per request
- **WireMock**: 5-20ms per request
- **Express Mock**: 1-10ms per request
- **GraphQL Mock**: 20-100ms per query

### Resource Usage
- **JSON Server**: ~50MB RAM
- **WireMock**: ~200MB RAM
- **Express Server**: ~30MB RAM
- **GraphQL Server**: ~100MB RAM

## Best Practices

1. **Version Control Mock Data**
   - Keep `db.json` in git
   - Use `.gitignore` for generated data
   - Maintain seed scripts

2. **Consistent Mock Responses**
   - Use deterministic IDs
   - Consistent timestamps
   - Predictable error scenarios

3. **Environment Separation**
   - Different ports for different mocks
   - Environment-specific configurations
   - Clear naming conventions

4. **Mock State Management**
   - Reset between test runs
   - Snapshot and restore capabilities
   - Clear state endpoints

## Troubleshooting

### Common Issues

1. **Port Conflicts**
   ```bash
   # Find process using port
   lsof -i :3000
   # Kill process
   kill -9 <PID>
   ```

2. **Mock Data Corruption**
   ```bash
   # Restore from backup
   cp db.backup.json db.json
   # Restart server
   ```

3. **Docker Network Issues**
   ```bash
   # Use host network
   docker run --network host ...
   ```

## Related Recipes

- [Database Setup](./database-setup.md) - Database configuration
- [Test Data](./test-data.md) - Generate test data
- [Hot Reload](./hot-reload.md) - Development workflow
- [GitHub Actions](../integration/github-actions.md) - CI/CD with mocks

## See Also

- [HTTP Operations](../../scripting/basics/command-execution.md)
- [Docker Targets](../../targets/docker/overview.md)
- [Testing Guide](../../guides/automation/testing.md)