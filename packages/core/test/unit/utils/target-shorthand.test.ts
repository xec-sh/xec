import { userInfo } from 'node:os';

import { parseK8sTarget, parseSSHTarget } from '../../../src/utils/target-shorthand.js';

describe('parseSSHTarget', () => {
  it('treats a bare value as a host and defaults to the local user', () => {
    expect(parseSSHTarget('web-1')).toEqual({ host: 'web-1', username: userInfo().username });
  });

  it('splits user@host', () => {
    expect(parseSSHTarget('deploy@web-1')).toEqual({ host: 'web-1', username: 'deploy' });
  });

  it('splits user@host:port', () => {
    expect(parseSSHTarget('deploy@web-1:2222')).toEqual({
      host: 'web-1',
      username: 'deploy',
      port: 2222,
    });
  });

  it('splits host:port without a user', () => {
    expect(parseSSHTarget('web-1:2222')).toMatchObject({ host: 'web-1', port: 2222 });
  });

  it('unwraps bracketed IPv6 literals', () => {
    expect(parseSSHTarget('deploy@[2001:db8::1]:2222')).toEqual({
      host: '2001:db8::1',
      username: 'deploy',
      port: 2222,
    });
  });

  it('keeps an unbracketed IPv6 literal intact rather than eating its last group as a port', () => {
    expect(parseSSHTarget('2001:db8::1')).toMatchObject({ host: '2001:db8::1' });
  });

  it('splits on the last @ so usernames containing @ survive', () => {
    expect(parseSSHTarget('user@corp@web-1')).toEqual({ host: 'web-1', username: 'user@corp' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseSSHTarget('  deploy@web-1  ')).toEqual({ host: 'web-1', username: 'deploy' });
  });

  it.each([
    ['', 'empty target'],
    ['   ', 'blank target'],
    ['@web-1', 'empty username'],
    ['deploy@', 'empty host'],
    ['web-1:0', 'port below range'],
    ['web-1:70000', 'port above range'],
    ['web-1:abc', 'non-numeric port'],
  ])('rejects %j (%s)', target => {
    expect(() => parseSSHTarget(target)).toThrow(TypeError);
  });
});

describe('parseK8sTarget', () => {
  it('treats a bare value as a pod name', () => {
    expect(parseK8sTarget('api-pod')).toEqual({ pod: 'api-pod' });
  });

  it('splits namespace/pod', () => {
    expect(parseK8sTarget('prod/api-pod')).toEqual({ namespace: 'prod', pod: 'api-pod' });
  });

  it('splits namespace/pod:container', () => {
    expect(parseK8sTarget('prod/api-pod:sidecar')).toEqual({
      namespace: 'prod',
      pod: 'api-pod',
      container: 'sidecar',
    });
  });

  it('splits pod:container without a namespace', () => {
    expect(parseK8sTarget('api-pod:sidecar')).toEqual({ pod: 'api-pod', container: 'sidecar' });
  });

  it.each([
    ['', 'empty target'],
    ['/api-pod', 'empty namespace'],
    ['prod/', 'empty pod'],
    ['prod/api-pod:', 'empty container'],
  ])('rejects %j (%s)', target => {
    expect(() => parseK8sTarget(target)).toThrow(TypeError);
  });
});
