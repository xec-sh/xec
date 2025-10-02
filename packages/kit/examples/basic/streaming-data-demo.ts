/**
 * Streaming Data Demo
 *
 * Demonstrates various ways to load and stream data into tables:
 * - ReadableStream (simulated API responses)
 * - AsyncIterable / Async Generators
 * - Chunked loading with progress
 * - Batch async operations
 */

import {
  table,
  batchAsync,
  loadChunked,
  streamToArray,
  interactiveTable,
  type TableColumn,
  type StreamProgress,
  asyncIterableToArray,
} from '../../src/index.js';

interface LogEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  service: string;
}

const columns: TableColumn<LogEntry>[] = [
  { key: 'id', header: 'ID', width: 8, align: 'right' },
  { key: 'timestamp', header: 'Time', width: 12 },
  {
    key: 'level',
    header: 'Level',
    width: 8,
    format: (value) => {
      const colors: Record<string, string> = { info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };
      return `${colors[value as string] || ''}${value}\x1b[0m`;
    },
  },
  { key: 'message', header: 'Message', width: 40 },
  { key: 'service', header: 'Service', width: 15 },
];

/**
 * Simulate streaming API response
 */
function createLogStream(count: number): ReadableStream<LogEntry> {
  const levels: Array<'info' | 'warn' | 'error'> = ['info', 'warn', 'error'];
  const services = ['api', 'database', 'cache', 'auth', 'worker'];
  let index = 0;

  return new ReadableStream({
    async pull(controller) {
      if (index >= count) {
        controller.close();
        return;
      }

      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 10));

      const entry: LogEntry = {
        id: index + 1,
        timestamp: new Date(Date.now() - (count - index) * 1000).toISOString().slice(11, 19),
        level: levels[index % 3]!,
        message: `Log message ${index + 1}`,
        service: services[index % services.length]!,
      };

      controller.enqueue(entry);
      index++;
    },
  });
}

/**
 * Async generator for log entries
 */
async function* generateLogs(count: number): AsyncGenerator<LogEntry> {
  const levels: Array<'info' | 'warn' | 'error'> = ['info', 'warn', 'error'];
  const services = ['api', 'database', 'cache', 'auth', 'worker'];

  for (let i = 0; i < count; i++) {
    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 5));

    yield {
      id: i + 1,
      timestamp: new Date(Date.now() - (count - i) * 1000).toISOString().slice(11, 19),
      level: levels[i % 3]!,
      message: `Generated log ${i + 1}`,
      service: services[i % services.length]!,
    };
  }
}

/**
 * Progress bar display
 */
function displayProgress(progress: StreamProgress) {
  const { loaded, total, percentage } = progress;
  const barLength = 30;
  const filled = Math.floor((percentage ?? 0) / 100 * barLength);
  const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

  const pct = percentage?.toFixed(1) ?? '?';
  const msg = total ? `${loaded}/${total}` : `${loaded}`;

  process.stdout.write(`\r[${bar}] ${pct}% ${msg}   `);
}

async function demo1() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  Demo 1: ReadableStream Loading                    ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  console.log('Loading log entries from stream...');

  const stream = createLogStream(100);
  const logs = await streamToArray(stream, {
    maxItems: 100,
    onProgress: displayProgress,
  });

  console.log('\n\n✓ Loaded successfully!\n');

  table({
    data: logs.slice(0, 10),
    columns,
    borders: 'rounded',
  });

  console.log(`\nShowing first 10 of ${logs.length} entries`);
}

async function demo2() {
  console.log('\n\n╔════════════════════════════════════════════════════╗');
  console.log('║  Demo 2: Async Iterator Loading                    ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  console.log('Loading logs from async generator...');

  const logs = await asyncIterableToArray(generateLogs(50), {
    maxItems: 50,
    onProgress: displayProgress,
  });

  console.log('\n\n✓ Loaded successfully!\n');

  table({
    data: logs.slice(-10),
    columns,
    borders: 'rounded',
  });

  console.log(`\nShowing last 10 of ${logs.length} entries`);
}

async function demo3() {
  console.log('\n\n╔════════════════════════════════════════════════════╗');
  console.log('║  Demo 3: Chunked Loading (Paginated API)           ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // Simulate paginated API
  const fetchPage = async (offset: number, limit: number): Promise<LogEntry[]> => {
    await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate network

    const levels: Array<'info' | 'warn' | 'error'> = ['info', 'warn', 'error'];
    const services = ['api', 'database', 'cache', 'auth', 'worker'];

    return Array.from({ length: limit }, (_, i) => ({
      id: offset + i + 1,
      timestamp: new Date(Date.now() - (offset + i) * 1000).toISOString().slice(11, 19),
      level: levels[(offset + i) % 3]!,
      message: `API log ${offset + i + 1}`,
      service: services[(offset + i) % services.length]!,
    }));
  };

  console.log('Loading 200 entries in chunks of 20...');

  const logs = await loadChunked(fetchPage, 200, {
    batchSize: 20,
    onProgress: displayProgress,
  });

  console.log('\n\n✓ Loaded successfully!\n');

  table({
    data: logs.slice(0, 15),
    columns,
    borders: 'rounded',
  });

  console.log(`\nShowing first 15 of ${logs.length} entries`);
}

async function demo4() {
  console.log('\n\n╔════════════════════════════════════════════════════╗');
  console.log('║  Demo 4: Batch Async Processing                    ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const ids = Array.from({ length: 30 }, (_, i) => i + 1);

  console.log('Fetching 30 log entries with concurrency limit of 5...');

  // Simulate fetching individual log entries
  const fetchLog = async (id: number): Promise<LogEntry> => {
    await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 30));

    const levels: Array<'info' | 'warn' | 'error'> = ['info', 'warn', 'error'];
    const services = ['api', 'database', 'cache', 'auth', 'worker'];

    return {
      id,
      timestamp: new Date(Date.now() - id * 1000).toISOString().slice(11, 19),
      level: levels[id % 3]!,
      message: `Batch fetched log ${id}`,
      service: services[id % services.length]!,
    };
  };

  const logs = await batchAsync(ids, fetchLog, {
    concurrency: 5,
    onProgress: displayProgress,
  });

  console.log('\n\n✓ Processed successfully!\n');

  table({
    data: logs.slice(0, 10),
    columns,
    borders: 'rounded',
  });

  console.log(`\nShowing first 10 of ${logs.length} entries`);
  console.log('(All 30 fetched with max 5 concurrent requests)');
}

async function demo5() {
  console.log('\n\n╔════════════════════════════════════════════════════╗');
  console.log('║  Demo 5: Interactive Table with Streaming Data     ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  console.log('Loading large dataset...');

  // Load large dataset with progress
  const logs = await asyncIterableToArray(generateLogs(1000), {
    maxItems: 1000,
    onProgress: (p) => {
      if (p.loaded % 100 === 0) {
        displayProgress(p);
      }
    },
  });

  console.log('\n\n✓ Dataset loaded! Opening interactive table...\n');
  console.log('Use arrows to navigate, / to filter, s to sort, Enter to confirm\n');

  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Show interactive table
  const selected = await interactiveTable({
    data: logs,
    columns: columns.map(col => ({ ...col, width: col.key === 'message' ? 30 : col.width })),
    selectable: 'multiple',
    sortable: true,
    filterable: true,
    pageSize: 15,
    borders: 'rounded',
    message: `Loaded ${logs.length.toLocaleString()} log entries via streaming`,
  });

  if (typeof selected !== 'symbol') {
    console.log(`\n✓ Selected ${selected.length} log entries`);
  } else {
    console.log('\n✗ Cancelled');
  }
}

async function main() {
  console.clear();
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║        TABLE STREAMING DATA DEMO                   ║');
  console.log('║        Multiple Data Loading Strategies            ║');
  console.log('╚════════════════════════════════════════════════════╝');

  await demo1(); // ReadableStream
  await demo2(); // Async Iterator
  await demo3(); // Chunked loading
  await demo4(); // Batch async
  await demo5(); // Interactive with streaming

  console.log('\n\n╔════════════════════════════════════════════════════╗');
  console.log('║  Summary                                           ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  console.log('Streaming features demonstrated:');
  console.log('  ✓ ReadableStream -> Array conversion');
  console.log('  ✓ AsyncIterable/Generator support');
  console.log('  ✓ Chunked loading with progress');
  console.log('  ✓ Batch async with concurrency control');
  console.log('  ✓ Interactive table with large streaming datasets');
  console.log('\nAll demos completed successfully!\n');
}

main().catch(console.error);
