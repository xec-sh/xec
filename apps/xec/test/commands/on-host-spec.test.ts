import { parseHostPort } from '../../src/commands/on.js';

/**
 * `xec on user@host` must reach that host. The old branch demanded a
 * hostname without dots, so the help's own example `deploy@server.com`
 * connected to a host literally named "deploy@server.com" as the local
 * user; and there was no way to name a port at all.
 */
describe('parseHostPort', () => {
  it('splits host:port', () => {
    expect(parseHostPort('server.com:2222')).toEqual({ host: 'server.com', port: 2222 });
    expect(parseHostPort('127.0.0.1:2201')).toEqual({ host: '127.0.0.1', port: 2201 });
  });

  it('leaves a bare host whole', () => {
    expect(parseHostPort('server.com')).toEqual({ host: 'server.com' });
    expect(parseHostPort('localhost')).toEqual({ host: 'localhost' });
  });

  it('does not mistake IPv6 colons for a port', () => {
    expect(parseHostPort('::1')).toEqual({ host: '::1' });
    expect(parseHostPort('fe80::1')).toEqual({ host: 'fe80::1' });
    expect(parseHostPort('[::1]:2222')).toEqual({ host: '::1', port: 2222 });
    expect(parseHostPort('[::1]')).toEqual({ host: '::1' });
  });
});
