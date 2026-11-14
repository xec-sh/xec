import type { ExecutionEngine, ExecutionResult } from '@xec-sh/core';

import { DockerEphemeralFluentAPI } from '@xec-sh/core';
import { vi, it, expect, describe, afterEach } from 'vitest';

import { SSHFluentAPI, createDockerService } from '../../src/docker-services/index.js';

describe('SSH service configuration and setup', () => {
  afterEach(() => vi.restoreAllMocks());
  const engine = {} as ExecutionEngine;

  it.each([
    ['ubuntu', 'ubuntu:latest', 'apt-get'], ['debian', 'debian:latest', 'apt-get'],
    ['alpine', 'alpine:latest', 'apk'], ['fedora', 'fedora:latest', 'dnf'],
    ['centos', 'centos:7', 'yum'], ['rocky', 'rockylinux:latest', 'dnf'],
    ['alma', 'almalinux:latest', 'dnf'],
  ])('configures %s without starting an external process', async (distro, image, manager) => {
    const start = vi.spyOn(DockerEphemeralFluentAPI.prototype, 'start').mockResolvedValue(undefined);
    const service = new SSHFluentAPI(engine, { distro });
    vi.spyOn(service, 'exec').mockResolvedValue({ stdout: ':22', exitCode: 0 } as ExecutionResult);
    await service.start();
    expect(service.build().image).toBe(image);
    expect(service.build().command).toEqual(['/bin/sh', '-c', expect.stringContaining(manager)]);
    expect(start).toHaveBeenCalledOnce();
  });

  it('honors constructor configuration and fluent updates through the public builder', () => {
    const service = new SSHFluentAPI(engine, { name: 'fixture', network: 'private', env: { KEY: 'value' }, port: 2323 })
      .withDistro('alpine').withCredentials('admin', 'synthetic').withPort(2223).withSudo().persistent();
    expect(service.build()).toMatchObject({ name: 'fixture', network: 'private', env: { KEY: 'value' }, ports: ['2223:22'], autoRemove: false });
    expect(service.getConnectionConfig()).toMatchObject({ host: 'localhost', port: 2223, username: 'admin', password: 'synthetic' });
    expect(service.getConnectionString()).toBe('ssh admin@localhost -p 2223');
    expect(createDockerService(engine, 'ssh')).toBeInstanceOf(SSHFluentAPI);
  });

  it('quotes passwords and package values before constructing the setup script', async () => {
    vi.spyOn(DockerEphemeralFluentAPI.prototype, 'start').mockResolvedValue(undefined);
    const service = new SSHFluentAPI(engine, {
      password: 'a"$(printf injected)\'b', packages: ['name with spaces'],
      setupCommands: ['printf custom'], pubKeys: [],
    });
    vi.spyOn(service, 'exec').mockResolvedValue({ stdout: ':22', exitCode: 0 } as ExecutionResult);
    await service.start();
    const script = (service.build().command as string[])[2]!;
    expect(script).toContain("'name with spaces'");
    expect(script).toContain('printf custom');
    expect(script).not.toContain('echo "user:');
    expect(script).toContain("printf '%s");
  });

  it('rejects a username that could escape its filesystem or shell context before start', async () => {
    const start = vi.spyOn(DockerEphemeralFluentAPI.prototype, 'start').mockResolvedValue(undefined);
    const service = new SSHFluentAPI(engine, { user: '../outside; bad' });
    await expect(service.start()).rejects.toThrow('Invalid SSH service username');
    expect(start).not.toHaveBeenCalled();
  });
});
