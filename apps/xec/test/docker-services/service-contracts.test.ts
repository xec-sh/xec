import type { ExecutionResult } from '@xec-sh/core';

import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';
import { ExecutionEngine, DockerEphemeralFluentAPI } from '@xec-sh/core';

import {
  SSHFluentAPI, RedisFluentAPI, KafkaFluentAPI, RabbitMQFluentAPI,
  PostgreSQLFluentAPI, RedisClusterFluentAPI,
} from '../../src/docker-services/index.js';

const ok = { stdout: '', stderr: '', exitCode: 0, ok: true } as ExecutionResult;

describe('service lifecycle evidence', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not report an empty cluster as healthy', async () => {
    const engine = {} as ExecutionEngine;
    const cluster = new RedisClusterFluentAPI(engine);
    expect(await cluster.status()).toMatchObject({ running: false, healthy: false, containers: [] });
  });

  it('stops recorded nodes even when startup never reached ready', async () => {
    const cluster = new RedisClusterFluentAPI({} as ExecutionEngine);
    const node = { stop: vi.fn().mockResolvedValue(undefined) };
    Object.assign(cluster, { nodes: [node], running: false });
    await cluster.stop();
    expect(node.stop).toHaveBeenCalledOnce();
  });

  it('joins every stop and propagates the failed confirmation', async () => {
    const cluster = new RedisClusterFluentAPI({} as ExecutionEngine);
    const failure = new Error('Docker unavailable');
    let release!: () => void;
    let completed = false;
    const stopped = new Promise<void>(resolve => { release = resolve; });
    const first = { stop: vi.fn().mockRejectedValue(failure) };
    const second = { stop: vi.fn(async () => { await stopped; completed = true; }) };
    Object.assign(cluster, { nodes: [first, second], running: true });
    let settled = false;
    const pending = cluster.stop().finally(() => { settled = true; });
    const rejected = expect(pending).rejects.toMatchObject({ errors: [failure] });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await rejected;
    expect(completed).toBe(true);
  });

  it('retains failed node identities and never deletes a user path or unowned network', async () => {
    const run = vi.fn().mockResolvedValue(ok);
    const cluster = new RedisClusterFluentAPI({ run } as unknown as ExecutionEngine, {
      persistent: false, dataPath: '/must-not-be-deleted', network: 'shared-network',
    });
    const failure = new Error('remove refused');
    const first = { remove: vi.fn().mockRejectedValue(failure) };
    const second = { remove: vi.fn().mockResolvedValue(undefined) };
    Object.assign(cluster, { nodes: [first, second] });
    await expect(cluster.remove()).rejects.toMatchObject({ errors: [failure] });
    expect(run).not.toHaveBeenCalled();
    first.remove.mockResolvedValue(undefined);
    await cluster.remove();
    expect(first.remove).toHaveBeenCalledTimes(2);
    expect(second.remove).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });

  it('does not treat a running but unhealthy node as a healthy cluster', async () => {
    const cluster = new RedisClusterFluentAPI({} as ExecutionEngine, { cluster: { enabled: true, masters: 3, replicas: 0 } });
    const nodes = [true, false, true].map(healthy => ({ status: vi.fn().mockResolvedValue({ running: true, healthy, containers: [] }), getConnectionInfo: () => ({ port: 6379 }) }));
    Object.assign(cluster, { nodes, running: true });
    expect(await cluster.status()).toMatchObject({ running: true, healthy: false });
  });

  it('uses the Core SSH context and verified host policy for exec and SFTP', async () => {
    const executed = vi.fn().mockResolvedValue(ok);
    const uploadFile = vi.fn().mockResolvedValue(undefined);
    const downloadFile = vi.fn().mockResolvedValue(undefined);
    const ssh = vi.fn(() => Object.assign(executed, { uploadFile, downloadFile }));
    const run = vi.fn().mockResolvedValue(ok);
    const service = new SSHFluentAPI({ ssh, run } as unknown as ExecutionEngine, {
      user: 'testuser', password: 'synthetic-password', port: 2200,
      connection: { knownHostsPath: '/private/synthetic-known-hosts', hostKeyChecking: 'strict' },
    });
    await service.ssh('printf hello');
    await service.scpTo('/source with spaces', '/destination');
    await service.scpFrom('/destination', '/result with spaces');
    expect(ssh).toHaveBeenCalledTimes(3);
    expect(ssh).toHaveBeenCalledWith(expect.objectContaining({ host: 'localhost', username: 'testuser', port: 2200, hostKeyChecking: 'strict', knownHostsPath: '/private/synthetic-known-hosts' }));
    expect(executed).toHaveBeenCalledWith(expect.arrayContaining(['sh -c ', '']), 'printf hello');
    expect(uploadFile).toHaveBeenCalledWith('/source with spaces', '/destination');
    expect(downloadFile).toHaveBeenCalledWith('/destination', '/result with spaces');
    expect(run).not.toHaveBeenCalled();
  });

  it('delegates SSH stop and inspection to the canonical Docker lifecycle', async () => {
    const stop = vi.spyOn(DockerEphemeralFluentAPI.prototype, 'stop').mockResolvedValue(undefined);
    const info = vi.spyOn(DockerEphemeralFluentAPI.prototype, 'info').mockRejectedValue(new Error('daemon offline'));
    const run = vi.fn().mockResolvedValue(ok);
    const service = new SSHFluentAPI({ run } as unknown as ExecutionEngine);
    await service.stop();
    await expect(service.info()).rejects.toThrow('daemon offline');
    expect(stop).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });
});

describe('native service argument boundaries', () => {
  let directory: string;
  let record: string;
  let engine: ExecutionEngine;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'xec-service-argv-'));
    record = join(directory, 'argv.jsonl');
    const executable = `#!${process.execPath}\n` + String.raw`
const fs = require('node:fs');
const name = require('node:path').basename(process.argv[1]);
const args = process.argv.slice(2);
const record = stdin => {
  fs.appendFileSync(process.env.XEC_ARGV_RECORD, JSON.stringify({name, args, stdin})+'\n');
  process.stdout.write(name === 'rabbitmqadmin' ? (process.env.XEC_RESPONSE || '[]') : 'OK\n');
};
if (name === 'kafka-console-producer') {
  let stdin = ''; process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => stdin += chunk);
  process.stdin.on('end', () => record(stdin));
} else record('');
`;
    for (const name of ['psql', 'pg_dump', 'kafka-topics', 'kafka-console-producer', 'kafka-console-consumer', 'kafka-consumer-groups', 'rabbitmq-plugins', 'rabbitmqctl', 'rabbitmqadmin', 'redis-cli']) {
      await writeFile(join(directory, name), executable, { mode: 0o700 });
    }
    engine = new ExecutionEngine({ defaultEnv: { PATH: `${directory}:${process.env['PATH']}`, XEC_ARGV_RECORD: record }, defaultTimeout: 3000 });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await engine.dispose();
    await rm(directory, { recursive: true, force: true });
  });

  function local<T extends DockerEphemeralFluentAPI>(service: T): T {
    // The container boundary is replaced by the ordinary local Core engine.
    // Programs are private fixtures; no Docker executable can be invoked.
    vi.spyOn(service, 'exec').mockImplementation(((command: string | string[] | TemplateStringsArray, ...values: unknown[]) => {
      if (Array.isArray(command) && 'raw' in command) return engine.run(command as TemplateStringsArray, ...values);
      if (Array.isArray(command)) return engine.run`${command}`;
      return engine.raw`${command}`;
    }) as T['exec']);
    return service;
  }

  const rows = async () => (await readFile(record, 'utf8')).trim().split('\n').map(row => JSON.parse(row) as { name: string; args: string[]; stdin: string });

  it('passes PostgreSQL backup values as individual arguments', async () => {
    const service = local(new PostgreSQLFluentAPI(engine, { user: 'user name', database: 'data name' }));
    await service.backup('/synthetic path/backup.sql');
    expect(await rows()).toEqual([{ name: 'pg_dump', args: ['-U', 'user name', '-d', 'data name', '-f', '/synthetic path/backup.sql'], stdin: '' }]);
  });

  it('preserves Kafka topics, config, payload, flags and offset without shell expansion', async () => {
    const service = local(new KafkaFluentAPI(engine));
    const topic = 'topic with space';
    const payload = 'literal "quote" $(printf INJECTED)\nsecond';
    await service.createTopic(topic, 2, 1, { retention: 'a b' });
    await service.produce(topic, payload, 'key');
    await service.consume(topic, { group: 'a b', maxMessages: 2, timeout: 1 });
    await service.resetConsumerOffset('a b', topic, 12);
    const output = await rows();
    expect(output[0]?.args).toContain('retention=a b');
    expect(output[1]?.args).toContain(topic);
    expect(output[1]?.stdin).toBe(`key:${payload}\n`);
    expect(output[2]?.args).toEqual(expect.arrayContaining(['--group', 'a b', '--max-messages', '2']));
    expect(output[3]?.args).toEqual(expect.arrayContaining(['--to-offset', '12']));
  });

  it('preserves RabbitMQ lists and JSON as actual separate arguments', async () => {
    const service = local(new RabbitMQFluentAPI(engine));
    await service.enablePlugins(['plugin-one', 'plugin-two']);
    await service.createUser('user name', 'synthetic', ['management', 'monitoring']);
    await service.createQueue('queue name', '/v host', true, false, { note: "a'b" });
    await service.publishMessage('exchange', 'route', "a'b $(printf INJECTED)", '/', { note: 'two words' });
    const output = await rows();
    expect(output[0]?.args).toEqual(['enable', 'plugin-one', 'plugin-two']);
    expect(output[2]?.args).toEqual(['set_user_tags', 'user name', 'management', 'monitoring']);
    expect(output[3]?.args).toContain('arguments={"note":"a\'b"}');
    expect(output[4]?.args).toContain("payload=a'b $(printf INJECTED)");
    expect(output[4]?.args).toContain('properties={"note":"two words"}');
  });

  it('reports malformed RabbitMQ output instead of an empty successful result', async () => {
    const service = local(new RabbitMQFluentAPI(engine));
    engine.config.set({ defaultEnv: { XEC_RESPONSE: 'invalid-json' } });
    await expect(service.getMessages('queue')).rejects.toThrow();
    await expect(service.getQueueInfo('queue')).rejects.toThrow();
  });

  it('preserves Redis config values and encodes URI credentials', async () => {
    const service = local(new RedisFluentAPI(engine, { password: 'p@:/ word' }));
    await service.setConfig('key', 'value with spaces; $(printf INJECTED)');
    expect((await rows())[0]?.args).toEqual(['CONFIG', 'SET', 'key', 'value with spaces; $(printf INJECTED)']);
    expect(service.getConnectionString()).toBe('redis://:p%40%3A%2F%20word@localhost:6379');
  });
});
