import { dataVolumeFor } from '../../src/docker-services/types.js';

/**
 * `--persistent` is a promise about what survives the container. Breaking
 * it is silent by construction: the service starts, reports itself
 * persistent, and the data is only missing once the container is gone.
 */
describe('where a service keeps its data', () => {
  it('mounts a named volume when persistence was asked for and no path given', () => {
    // This used to mount nothing at all. The service ran, said it was
    // persistent, and lost everything on removal.
    expect(dataVolumeFor({ persistent: true, name: 'xec-redis' }, 'xec-redis'))
      .toBe('xec-redis-data');
  });

  it('prefers an explicit path', () => {
    expect(dataVolumeFor({ persistent: true, dataPath: '/srv/redis' }, 'xec-redis'))
      .toBe('/srv/redis');
  });

  it('mounts nothing when persistence was not asked for', () => {
    expect(dataVolumeFor({ persistent: false, dataPath: '/srv/redis' }, 'xec-redis'))
      .toBeUndefined();
    expect(dataVolumeFor({}, 'xec-redis')).toBeUndefined();
  });

  it('falls back to the service name when the container was not named', () => {
    expect(dataVolumeFor({ persistent: true }, 'xec-postgres')).toBe('xec-postgres-data');
  });

  describe('a service with more than one volume', () => {
    it('keeps them apart by suffix', () => {
      expect(dataVolumeFor({ persistent: true, name: 'xec-kafka' }, 'xec-kafka', 'zk'))
        .toBe('xec-kafka-zk-data');
    });

    it('never builds a name out of an absent path', () => {
      // `${dataPath}-zk` with no dataPath mounted the literal string
      // "undefined-zk", creating a junk volume by that name every start.
      const volume = dataVolumeFor({ persistent: true }, 'xec-kafka', 'zk');

      expect(volume).not.toContain('undefined');
    });

    it('derives from the path when one was given', () => {
      expect(dataVolumeFor({ persistent: true, dataPath: '/srv/kafka' }, 'xec-kafka', 'zk'))
        .toBe('/srv/kafka-zk');
    });
  });
});
