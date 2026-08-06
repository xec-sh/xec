import type { ExecutionEngine } from '@xec-sh/core';

import { ElasticsearchFluentAPI } from '../../src/docker-services/search.js';

/**
 * The configuration this preset accepts, and what it does with it.
 *
 * It was assembled inline in the command that started it, which is how
 * `--single-node` came to be declared and never read, and how
 * `ElasticSearchServiceConfig` came to exist without a single reader.
 * The fields are checked here against the container definition rather
 * than against a running cluster: what matters is that a value given is
 * a value used.
 */
describe('the elasticsearch preset', () => {
  const engine = {} as ExecutionEngine;

  /** The container definition the fluent API has built so far. */
  const definitionOf = (api: ElasticsearchFluentAPI): Record<string, unknown> =>
    (api as unknown as { config: Record<string, unknown> }).config;

  it('defaults to a single node on the documented port', () => {
    const api = new ElasticsearchFluentAPI(engine);
    const config = definitionOf(api);

    expect(config['name']).toBe('xec-elasticsearch');
    expect(JSON.stringify(config)).toContain('single-node');
    expect(api.getConnectionInfo().httpUrl).toBe('http://localhost:9200');
  });

  it('uses the port it was given', () => {
    const api = new ElasticsearchFluentAPI(engine, { port: 9999 });

    expect(api.getConnectionInfo().httpUrl).toBe('http://localhost:9999');
    expect(JSON.stringify(definitionOf(api))).toContain('9999');
  });

  it('uses the version it was given', () => {
    const api = new ElasticsearchFluentAPI(engine, { version: '7.17.9' });

    expect(JSON.stringify(definitionOf(api))).toContain('elasticsearch:7.17.9');
  });

  it('honours the cluster and node names', () => {
    const api = new ElasticsearchFluentAPI(engine, {
      clusterName: 'search-prod',
      nodeName: 'node-a',
    });
    const rendered = JSON.stringify(definitionOf(api));

    expect(rendered).toContain('search-prod');
    expect(rendered).toContain('node-a');
    expect(api.getConnectionInfo().clusterName).toBe('search-prod');
  });

  it('sizes the heap as asked', () => {
    // Left at the default, an Elasticsearch container on a small machine
    // exits during startup, which reads as "it did not come up".
    const api = new ElasticsearchFluentAPI(engine, { heap: '2g' });

    expect(JSON.stringify(definitionOf(api))).toContain('-Xms2g -Xmx2g');
  });

  it('mounts a named volume when persistence was asked for', () => {
    const api = new ElasticsearchFluentAPI(engine, { persistent: true });

    expect(JSON.stringify(definitionOf(api))).toContain('xec-elasticsearch-data');
  });

  it('mounts nothing when it was not', () => {
    const api = new ElasticsearchFluentAPI(engine, { persistent: false });

    expect(JSON.stringify(definitionOf(api))).not.toContain('elasticsearch/data');
  });

  it('lets the caller override any setting', () => {
    const api = new ElasticsearchFluentAPI(engine, {
      config: { 'xpack.security.enabled': 'true' },
    });

    expect(JSON.stringify(definitionOf(api))).toContain('"xpack.security.enabled":"true"');
  });

  it('publishes the transport port only for a real cluster', () => {
    // 9300 is how nodes find each other. A single node has nobody to talk
    // to, and publishing it takes a port from whatever else wanted it.
    const single = JSON.stringify(definitionOf(new ElasticsearchFluentAPI(engine)));
    const zen = JSON.stringify(definitionOf(new ElasticsearchFluentAPI(engine, { discoveryType: 'zen' })));

    expect(single).not.toContain('9300');
    expect(zen).toContain('9300');
  });
});
