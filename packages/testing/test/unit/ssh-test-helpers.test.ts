import { it, expect, describe } from 'vitest';

import {
  getSSHConfig,
  DOCKER_CONTAINERS,
  getAvailableContainers,
} from '../../src/index.js';

/**
 * The connection details every SSH fixture test is handed.
 *
 * Getting these wrong does not fail loudly — it produces a connection to
 * something else, or a test that skips. And one of the values is a
 * deliberate security relaxation that must stay scoped to throwaway
 * containers, which is worth pinning so it cannot spread by copy.
 */
describe('the fixture SSH configuration', () => {
  it('describes each container the fixtures declare', () => {
    for (const container of DOCKER_CONTAINERS) {
      const config = getSSHConfig(container.name);

      expect(config.host).toBe('localhost');
      expect(config.port).toBe(container.port);
      expect(config.username).toBe('user');
    }
  });

  it('gives every container a distinct port', () => {
    // Two fixtures on one port means a test connects to whichever came up,
    // and the failure looks like the wrong distribution's package manager.
    const ports = DOCKER_CONTAINERS.map(c => c.port);

    expect(new Set(ports).size).toBe(ports.length);
  });

  it('refuses a container it does not know, by name', () => {
    expect(() => getSSHConfig('not-a-fixture')).toThrow(/Unknown container: not-a-fixture/);
  });

  it('turns host key checking off, and only for these', () => {
    // Fixture containers regenerate their host key on every rebuild, so a
    // recorded key is guaranteed to go stale. It is a deliberate relaxation
    // scoped to throwaway containers; asserting it here is what makes
    // widening it a visible change rather than a quiet one.
    for (const container of DOCKER_CONTAINERS) {
      expect(getSSHConfig(container.name).hostKeyChecking).toBe('off');
    }
  });

  it('sets a timeout long enough for a container that is still booting', () => {
    const config = getSSHConfig(DOCKER_CONTAINERS[0]!.name);

    expect(config.connectTimeout).toBeGreaterThanOrEqual(10_000);
    expect(config.readyTimeout).toBeGreaterThanOrEqual(10_000);
  });

  it('lists the same containers it can configure', () => {
    expect(getAvailableContainers()).toEqual(DOCKER_CONTAINERS);
  });

  it('names every container safely for a shell command', () => {
    // The names reach `docker` through a command line.
    for (const container of DOCKER_CONTAINERS) {
      expect(container.name).toMatch(/^[a-zA-Z0-9._-]+$/);
    }
  });
});
