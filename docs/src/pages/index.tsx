import styles from './index.module.css';

import clsx from 'clsx';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Translate, { translate } from '@docusaurus/Translate';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import HomepageFeatures from '@site/src/components/HomepageFeatures';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <h1 className="hero__title">
          <Translate id="homepage.title">Xec: The Universal Shell for TypeScript</Translate>
        </h1>
        <p className="hero__subtitle">
          <Translate id="homepage.tagline">
            Run commands locally, on SSH, in Docker, or Kubernetes with a single, elegant API. Stop fighting with shell scripts.
          </Translate>
        </p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/getting-started/quick-start">
            <Translate id="homepage.getStarted">
              Get Started - 5min ⏱️
            </Translate>
          </Link>
          <Link
            className="button button--outline button--secondary button--lg margin-left--md"
            to="/docs/intro">
            <Translate id="homepage.learnMore">
              Learn More
            </Translate>
          </Link>
        </div>
        <div className={styles.heroCode}>
          <pre>
            <code>
              {`import { $ } from '@xec-sh/core';

// Check Node.js version everywhere
const getNodeVersion = () => $\`node --version\`;

// 1. Run locally
await getNodeVersion();

// 2. Run on a remote server
const remote = $.ssh('user@my-server.com');
await remote.run(getNodeVersion);

// 3. Run inside a Docker container
const container = $.docker('my-node-container');
await container.run(getNodeVersion);`}
            </code>
          </pre>
        </div>
      </div>
    </header>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  const pageDescription = translate({
    id: 'homepage.description',
    message: 'Xec is a universal shell with TypeScript/JavaScript API that provides a consistent interface for executing commands across different environments - locally, over SSH, in Docker containers, and Kubernetes pods.',
  });

  return (
    <Layout
      title={translate({ id: 'homepage.layoutTitle', message: 'Universal Command Execution & Automation' })}
      description={pageDescription}>
      <HomepageHeader />
      <main>
        <HomepageFeatures />

        <section className={styles.ecosystem}>
          <div className="container">
            <div className="row">
              <div className="col col--12">
                <h2 className={styles.ecosystemTitle}>
                  <Translate id="homepage.ecosystem.title">
                    Unified Ecosystem
                  </Translate>
                </h2>
                <p className={styles.ecosystemDescription}>
                  <Translate id="homepage.ecosystem.description">
                    A powerful core package and CLI working together to execute commands and automate tasks across any environment
                  </Translate>
                </p>
              </div>
            </div>

            <div className="row margin-top--lg">
              <div className="col col--6">
                <div className={clsx('card', styles.packageCard)}>
                  <div className="card__header">
                    <h3>Xec CLI</h3>
                  </div>
                  <div className="card__body">
                    <p>
                      <Translate id="homepage.cli.description">
                        Command-line interface for executing and automating tasks with powerful TypeScript/JavaScript scripting capabilities.
                      </Translate>
                    </p>
                  </div>
                  <div className="card__footer">
                    <Link to="/docs/projects/cli" className="button button--primary button--block">
                      <Translate id="homepage.exploreCliDocs">Explore CLI Docs</Translate>
                    </Link>
                  </div>
                </div>
              </div>

              <div className="col col--6">
                <div className={clsx('card', styles.packageCard)}>
                  <div className="card__header">
                    <h3>@xec-sh/core</h3>
                  </div>
                  <div className="card__body">
                    <p>
                      <Translate id="homepage.core.description">
                        Universal shell execution engine for seamless command execution across environments - locally, SSH, Docker, and Kubernetes.
                      </Translate>
                    </p>
                  </div>
                  <div className="card__footer">
                    <Link to="/docs/projects/core" className="button button--primary button--block">
                      <Translate id="homepage.exploreCoreDocs">Explore Core Docs</Translate>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.useCases}>
          <div className="container">
            <h2 className="text--center margin-bottom--xl">
              <Translate id="homepage.useCases.title">
                Perfect for Modern Development
              </Translate>
            </h2>
            <div className="row">
              <div className="col col--6">
                <div className={styles.useCase}>
                  <h3>
                    <Translate id="homepage.useCases.devops.title">
                      DevOps Automation
                    </Translate>
                  </h3>
                  <p>
                    <Translate id="homepage.useCases.devops.description">
                      Automate deployments, manage configurations, and orchestrate complex workflows with ease.
                    </Translate>
                  </p>
                </div>
              </div>
              <div className="col col--6">
                <div className={styles.useCase}>
                  <h3>
                    <Translate id="homepage.useCases.remoteServer.title">
                      Remote Server Management
                    </Translate>
                  </h3>
                  <p>
                    <Translate id="homepage.useCases.remoteServer.description">
                      Connect to remote servers via SSH, transfer files, create tunnels, and manage multiple connections with ease.
                    </Translate>
                  </p>
                </div>
              </div>
              <div className="col col--6">
                <div className={styles.useCase}>
                  <h3>
                    <Translate id="homepage.useCases.taskAutomation.title">
                      Task Automation & Scripting
                    </Translate>
                  </h3>
                  <p>
                    <Translate id="homepage.useCases.taskAutomation.description">
                      Execute commands in parallel, handle streaming data, use templates with variables, and build complex automation scripts.
                    </Translate>
                  </p>
                </div>
              </div>
              <div className="col col--6">
                <div className={styles.useCase}>
                  <h3>
                    <Translate id="homepage.useCases.crossPlatform.title">
                      Cross-Platform Execution
                    </Translate>
                  </h3>
                  <p>
                    <Translate id="homepage.useCases.crossPlatform.description">
                      Execute commands consistently across local machines, SSH connections, Docker containers, and Kubernetes pods.
                    </Translate>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.cta}>
          <div className="container text--center">
            <h2>
              <Translate id="homepage.cta.title">
                Start Automating Your Tasks Today
              </Translate>
            </h2>
            <p className={styles.ctaDescription}>
              <Translate id="homepage.cta.description">
                Join thousands of developers who are already using Xec to simplify their workflows and automate complex tasks.
              </Translate>
            </p>
            <div className={styles.ctaButtons}>
              <Link
                className="button button--primary button--lg"
                to="/docs/intro">
                <Translate id="homepage.cta.startBuilding">
                  Get Started
                </Translate>
              </Link>
              <Link
                className="button button--outline button--primary button--lg margin-left--md"
                to="https://github.com/xec-sh/xec">
                <Translate id="homepage.cta.viewOnGitHub">
                  View on GitHub
                </Translate>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}