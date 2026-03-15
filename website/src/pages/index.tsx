import React from 'react';
import styles from './index.module.css';

import clsx from 'clsx';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Translate, { translate } from '@docusaurus/Translate';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import HomepageFeatures from '@site/src/components/HomepageFeatures';

function HomepageHeader() {
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <h1 className="hero__title">
          <Translate id="homepage.title">Universal Execution System for TypeScript</Translate>
        </h1>
        <p className="hero__subtitle">
          <Translate id="homepage.tagline">
            Execute commands across local, SSH, Docker, and Kubernetes with a single API. Deploy, orchestrate, and automate — all in TypeScript.
          </Translate>
        </p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/introduction/quick-start">
            <Translate id="homepage.getStarted">
              Get Started — 5min ⏱️
            </Translate>
          </Link>
          <Link
            className="button button--outline button--secondary button--lg margin-left--md"
            to="/docs/introduction/ecosystem">
            <Translate id="homepage.learnMore">
              Explore Ecosystem
            </Translate>
          </Link>
        </div>
        <div className={styles.heroCode}>
          <pre>
            <code>
              {`import { $ } from '@xec-sh/core';
import { Deployer, Pipeline, HealthChecker } from '@xec-sh/ops';

// Execute anywhere
await $\`npm run build\`;
await $.ssh({ host: 'prod' })\`systemctl restart app\`;
await $.docker({ container: 'api' })\`python migrate.py\`;

// Deploy with health checks
await Deployer.create({
  targets: ['web-1', 'web-2'],
  strategy: 'rolling',
  hooks: { deploy: (ctx) => ctx.exec\`docker pull app:\${ctx.version}\` }
}).deploy('v1.2.3');`}
            </code>
          </pre>
        </div>
      </div>
    </header>
  );
}

export default function Home(): React.ReactNode {
  const pageDescription = translate({
    id: 'homepage.description',
    message: 'Xec is a TypeScript-native execution system with 6 packages: core (shell execution), ops (deploy, pipelines, workflows), kit (TUI components), loader (script loading), testing (test utilities), and cli (command-line interface).',
  });

  return (
    <Layout
      title={translate({ id: 'homepage.layoutTitle', message: 'Universal Execution System' })}
      description={pageDescription}>
      <HomepageHeader />
      <main>
        <HomepageFeatures />

        <section className={styles.ecosystem}>
          <div className="container">
            <h2 className={clsx('text--center', styles.ecosystemTitle)}>
              <Translate id="homepage.ecosystem.title">
                6 Packages, One Ecosystem
              </Translate>
            </h2>

            <div className="row margin-top--lg">
              <div className="col col--4">
                <div className={clsx('card', styles.packageCard)}>
                  <div className="card__header">
                    <h3>@xec-sh/core</h3>
                  </div>
                  <div className="card__body">
                    <p>Shell execution engine — <code>$`cmd`</code>, SSH, Docker, Kubernetes adapters, connection pooling, streaming.</p>
                  </div>
                  <div className="card__footer">
                    <Link to="/docs/core/execution-engine/overview" className="button button--primary button--block">
                      Core Docs
                    </Link>
                  </div>
                </div>
              </div>

              <div className="col col--4">
                <div className={clsx('card', styles.packageCard)}>
                  <div className="card__header">
                    <h3>@xec-sh/ops</h3>
                  </div>
                  <div className="card__body">
                    <p>DevOps library — deploy strategies, CI/CD pipelines, DAG workflows, health checks, infrastructure discovery.</p>
                  </div>
                  <div className="card__footer">
                    <Link to="/docs/ops/" className="button button--primary button--block">
                      Ops Docs
                    </Link>
                  </div>
                </div>
              </div>

              <div className="col col--4">
                <div className={clsx('card', styles.packageCard)}>
                  <div className="card__header">
                    <h3>@xec-sh/cli</h3>
                  </div>
                  <div className="card__body">
                    <p>Command-line tool — thin wrapper over @xec-sh/ops. Commands: run, on, in, deploy, watch, tasks, config.</p>
                  </div>
                  <div className="card__footer">
                    <Link to="/docs/commands/cli-reference" className="button button--primary button--block">
                      CLI Docs
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="row margin-top--md">
              <div className="col col--4">
                <div className={clsx('card', styles.packageCard)}>
                  <div className="card__header">
                    <h3>@xec-sh/kit</h3>
                  </div>
                  <div className="card__body">
                    <p>TUI components — prompts, spinners, tables, progress bars, Prism color system. Zero external dependencies.</p>
                  </div>
                </div>
              </div>

              <div className="col col--4">
                <div className={clsx('card', styles.packageCard)}>
                  <div className="card__header">
                    <h3>@xec-sh/loader</h3>
                  </div>
                  <div className="card__body">
                    <p>Script loading — TypeScript transform, CDN modules, REPL, file watcher, plugin system.</p>
                  </div>
                </div>
              </div>

              <div className="col col--4">
                <div className={clsx('card', styles.packageCard)}>
                  <div className="card__header">
                    <h3>@xec-sh/testing</h3>
                  </div>
                  <div className="card__body">
                    <p>Test utilities — Docker container management, SSH test helpers, binary detection.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.comparison}>
          <div className="container">
            <h2 className="text--center margin-bottom--xl">
              <Translate id="homepage.comparison.title">
                Why Xec?
              </Translate>
            </h2>
            <div className="row">
              <div className="col col--12">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th>Xec</th>
                      <th>Ansible</th>
                      <th>zx</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Multi-environment (SSH/Docker/K8s)</td>
                      <td>✅ Native</td>
                      <td>✅ Via plugins</td>
                      <td>❌ Local only</td>
                    </tr>
                    <tr>
                      <td>TypeScript-native</td>
                      <td>✅ Full strict mode</td>
                      <td>❌ YAML</td>
                      <td>✅ Partial</td>
                    </tr>
                    <tr>
                      <td>Deploy strategies</td>
                      <td>✅ Rolling, canary, blue-green</td>
                      <td>✅ Playbooks</td>
                      <td>❌ None</td>
                    </tr>
                    <tr>
                      <td>CI/CD pipelines</td>
                      <td>✅ Pipeline engine with matrix</td>
                      <td>❌ External</td>
                      <td>❌ None</td>
                    </tr>
                    <tr>
                      <td>Health checks</td>
                      <td>✅ HTTP, TCP, command, custom</td>
                      <td>⚠️ Modules</td>
                      <td>❌ None</td>
                    </tr>
                    <tr>
                      <td>Library usage (no CLI)</td>
                      <td>✅ @xec-sh/ops</td>
                      <td>❌ CLI only</td>
                      <td>✅ Import</td>
                    </tr>
                    <tr>
                      <td>Connection pooling</td>
                      <td>✅ Built-in</td>
                      <td>✅ Built-in</td>
                      <td>❌ N/A</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.cta}>
          <div className="container text--center">
            <h2>
              <Translate id="homepage.cta.title">
                Start Building
              </Translate>
            </h2>
            <p className={styles.ctaDescription}>
              <Translate id="homepage.cta.description">
                Install @xec-sh/core for shell execution, @xec-sh/ops for DevOps automation, or @xec-sh/cli for the full command-line experience.
              </Translate>
            </p>
            <div className={styles.ctaButtons}>
              <Link
                className="button button--primary button--lg"
                to="/docs/introduction/installation">
                <Translate id="homepage.cta.install">
                  Installation Guide
                </Translate>
              </Link>
              <Link
                className="button button--outline button--primary button--lg margin-left--md"
                to="https://github.com/xec-sh/xec">
                <Translate id="homepage.cta.viewOnGitHub">
                  GitHub
                </Translate>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
