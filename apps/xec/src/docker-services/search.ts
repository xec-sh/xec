import type { ExecutionEngine } from '@xec-sh/core';
import type { ElasticSearchServiceConfig } from './types.js';

import { DockerEphemeralFluentAPI } from '@xec-sh/core';

import { dataVolumeFor } from './types.js';

/**
 * Elasticsearch as a service preset, like the others.
 *
 * It was the one service built by hand in the command that started it,
 * and it collected the defects that arrangement produces: `discovery.type`
 * hardcoded while `--single-node` was declared and never read, its own
 * spelling of persistence, and `ElasticSearchServiceConfig` — declared in
 * `types.ts` and used by nothing at all.
 *
 * The rest of the fields are honoured here, and `start()` waits for the
 * cluster to answer rather than for the container to exist: Elasticsearch
 * takes tens of seconds to become usable, and returning before then hands
 * back a service whose first request fails.
 *
 * @module
 */
export class ElasticsearchFluentAPI extends DockerEphemeralFluentAPI {
  private readonly esConfig: ElasticSearchServiceConfig;

  constructor(engine: ExecutionEngine, config?: Partial<ElasticSearchServiceConfig>) {
    const version = config?.version || '8.11.0';
    super(engine, `elasticsearch:${version}`);

    this.esConfig = {
      version,
      port: config?.port || 9200,
      name: config?.name || 'xec-elasticsearch',
      persistent: config?.persistent ?? false,
      dataPath: config?.dataPath,
      clusterName: config?.clusterName || 'xec-elasticsearch',
      nodeName: config?.nodeName,
      discoveryType: config?.discoveryType || 'single-node',
      heap: config?.heap || '512m',
      plugins: config?.plugins,
      network: config?.network,
      env: config?.env || {},
      config: config?.config || {},
      autoStart: config?.autoStart ?? false,
    };

    this.applyConfiguration();
  }

  /** Translate the configuration into what the container needs. */
  private applyConfiguration(): void {
    if (this.esConfig.name) {
      this.name(this.esConfig.name);
    }

    // 9200 is the REST API and is what `--port` moves. 9300 is the
    // transport port nodes use to find each other; a single node has
    // nobody to talk to, so it is published only for a real cluster.
    this.port(Number(this.esConfig.port), 9200);
    if (this.esConfig.discoveryType !== 'single-node') {
      this.port(9300, 9300);
    }

    if (this.esConfig.network) {
      this.network(this.esConfig.network);
    }

    const volume = dataVolumeFor(this.esConfig, 'xec-elasticsearch');
    if (volume) {
      this.volume(volume, '/usr/share/elasticsearch/data');
    }

    this.env({
      'discovery.type': this.esConfig.discoveryType!,
      'cluster.name': this.esConfig.clusterName!,
      ...(this.esConfig.nodeName ? { 'node.name': this.esConfig.nodeName } : {}),
      // Security is off because this preset exists for development. A
      // production cluster is not started from a one-line command, and
      // pretending otherwise would be the more dangerous default.
      'xpack.security.enabled': 'false',
      ES_JAVA_OPTS: `-Xms${this.esConfig.heap} -Xmx${this.esConfig.heap}`,
      ...this.esConfig.config,
      ...this.esConfig.env,
    });
  }

  /**
   * Start the container and wait until the cluster answers.
   *
   * @param timeout - How long to wait for the first usable response.
   */
  override async start(timeout = 120_000): Promise<void> {
    await super.start();
    await this.waitForCluster(timeout);
  }

  /**
   * Poll until Elasticsearch reports a status, or give up saying so.
   *
   * @param timeout - Milliseconds to wait.
   * @throws When the cluster never answered.
   */
  private async waitForCluster(timeout: number): Promise<void> {
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      // `exec` returns a plain promise, so a non-zero exit throws; the
      // container not answering yet is the expected case here, not a
      // failure to report.
      try {
        const health = await this.exec('curl -sf localhost:9200/_cluster/health');

        // yellow is the normal state for a single node: replicas it cannot
        // place. Waiting for green would wait forever.
        if (/"status"\s*:\s*"(green|yellow)"/.test(health.stdout)) {
          return;
        }
      } catch {
        // Not up yet.
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error(
      `Elasticsearch did not become ready within ${timeout}ms. ` +
      'Check `xec docker container logs ' + this.esConfig.name + '` — the usual cause is too little memory for the heap.'
    );
  }

  /** Where to reach it, for printing and for a caller. */
  getConnectionInfo(): Record<string, string> {
    return {
      httpUrl: `http://localhost:${this.esConfig.port}`,
      clusterName: this.esConfig.clusterName!,
      container: this.esConfig.name!,
    };
  }
}
