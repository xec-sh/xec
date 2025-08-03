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
          <Translate id="homepage.title">Universal Command Execution for the Modern Stack</Translate>
        </h1>
        <p className="hero__subtitle">
          <Translate id="homepage.tagline">
            One execution API for local, SSH, Docker, and Kubernetes environments. Write once in TypeScript, run anywhere.
          </Translate>
        </p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/introduction/quick-start">
            <Translate id="homepage.getStarted">
              Get Started - 5min ⏱️
            </Translate>
          </Link>
          <Link
            className="button button--outline button--secondary button--lg margin-left--md"
            to="/docs/introduction/">
            <Translate id="homepage.learnMore">
              Learn More
            </Translate>
          </Link>
        </div>
        <div className={styles.heroCode}>
          <pre>
            <code>
              {`import { $ } from '@xec-sh/core';

// Local execution
await $\`npm run build\`;

// SSH execution with connection pooling
await $.ssh({
  host: 'prod-server',
  username: 'deploy'
})\`systemctl restart app\`;

// Docker container execution
await $.docker({
  container: 'my-app'
})\`python manage.py migrate\`;

// Kubernetes pod execution  
await $.k8s({
  pod: 'app-pod',
  namespace: 'production'
})\`kubectl rollout status deployment/app\`;`}
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
    message: 'Xec is a universal command execution system with a powerful TypeScript-native API. Execute commands seamlessly across local, SSH, Docker, and Kubernetes environments through a unified execution engine with enterprise features like connection pooling, retry logic, and parallel execution.',
  });

  return (
    <Layout
      title={translate({ id: 'homepage.layoutTitle', message: 'Universal Command Execution System' })}
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
                        Command-line interface with built-in commands, dynamic command loading, and full TypeScript/JavaScript scripting support.
                      </Translate>
                    </p>
                  </div>
                  <div className="card__footer">
                    <Link to="/docs/commands/cli-reference" className="button button--primary button--block">
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
                        Powerful execution engine with template literal syntax, multi-environment adapters, connection pooling, and enterprise features.
                      </Translate>
                    </p>
                  </div>
                  <div className="card__footer">
                    <Link to="/docs/core/execution-engine/overview" className="button button--primary button--block">
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
                Built for Real-World Challenges
              </Translate>
            </h2>
            <div className="row">
              <div className="col col--6">
                <div className={styles.useCase}>
                  <h3>
                    <Translate id="homepage.useCases.multiEnv.title">
                      Multi-Environment Execution
                    </Translate>
                  </h3>
                  <p>
                    <Translate id="homepage.useCases.multiEnv.description">
                      Same code runs everywhere - from local development to cloud production. No more environment-specific scripts.
                    </Translate>
                  </p>
                </div>
              </div>
              <div className="col col--6">
                <div className={styles.useCase}>
                  <h3>
                    <Translate id="homepage.useCases.infrastructure.title">
                      Infrastructure Management
                    </Translate>
                  </h3>
                  <p>
                    <Translate id="homepage.useCases.infrastructure.description">
                      Control servers, containers, and clusters with unified commands. SSH pooling and Docker lifecycle management built-in.
                    </Translate>
                  </p>
                </div>
              </div>
              <div className="col col--6">
                <div className={styles.useCase}>
                  <h3>
                    <Translate id="homepage.useCases.cicd.title">
                      CI/CD Pipelines
                    </Translate>
                  </h3>
                  <p>
                    <Translate id="homepage.useCases.cicd.description">
                      Build sophisticated deployment workflows with TypeScript. Full control with proper error handling and retry logic.
                    </Translate>
                  </p>
                </div>
              </div>
              <div className="col col--6">
                <div className={styles.useCase}>
                  <h3>
                    <Translate id="homepage.useCases.devops.title">
                      DevOps Automation
                    </Translate>
                  </h3>
                  <p>
                    <Translate id="homepage.useCases.devops.description">
                      Automate operations with TypeScript safety. Parallel execution, event monitoring, and audit logging included.
                    </Translate>
                  </p>
                </div>
              </div>
              <div className="col col--6">
                <div className={styles.useCase}>
                  <h3>
                    <Translate id="homepage.useCases.testing.title">
                      Cross-Platform Testing
                    </Translate>
                  </h3>
                  <p>
                    <Translate id="homepage.useCases.testing.description">
                      Test on multiple environments simultaneously. Execute test suites across different containers and configurations.
                    </Translate>
                  </p>
                </div>
              </div>
              <div className="col col--6">
                <div className={styles.useCase}>
                  <h3>
                    <Translate id="homepage.useCases.hybrid.title">
                      Hybrid Cloud Operations
                    </Translate>
                  </h3>
                  <p>
                    <Translate id="homepage.useCases.hybrid.description">
                      Manage mixed infrastructure seamlessly. Execute across on-premise servers and cloud containers with one API.
                    </Translate>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.problemSolution}>
          <div className="container">
            <h2 className="text--center margin-bottom--xl">
              <Translate id="homepage.problemSolution.title">
                Solving Real Problems
              </Translate>
            </h2>
            <div className="row">
              <div className="col col--6">
                <div className={styles.problem}>
                  <h3>❌ The Problem</h3>
                  <ul>
                    <li>Different APIs for local/remote execution</li>
                    <li>SSH connection management is complex</li>
                    <li>Docker commands are verbose</li>
                    <li>Kubernetes kubectl is cumbersome</li>
                    <li>Can't execute across environments</li>
                    <li>No type safety in shell scripts</li>
                  </ul>
                </div>
              </div>
              <div className="col col--6">
                <div className={styles.solution}>
                  <h3>✅ The Xec Solution</h3>
                  <ul>
                    <li>Single unified execution API</li>
                    <li>Built-in connection pooling</li>
                    <li>Simple $.docker() interface</li>
                    <li>Intuitive $.k8s() execution</li>
                    <li>Multi-target parallel execution</li>
                    <li>Full TypeScript with IntelliSense</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.comparison}>
          <div className="container">
            <h2 className="text--center margin-bottom--xl">
              <Translate id="homepage.comparison.title">
                Why Choose Xec?
              </Translate>
            </h2>
            <div className="row">
              <div className="col col--12">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th>Xec</th>
                      <th>SSH Clients</th>
                      <th>Ansible</th>
                      <th>zx/shelljs</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Multi-environment</td>
                      <td>✅ Native support</td>
                      <td>❌ SSH only</td>
                      <td>✅ Via plugins</td>
                      <td>❌ Local only</td>
                    </tr>
                    <tr>
                      <td>TypeScript API</td>
                      <td>✅ Full support</td>
                      <td>❌ None</td>
                      <td>❌ YAML only</td>
                      <td>✅ Partial</td>
                    </tr>
                    <tr>
                      <td>Connection pooling</td>
                      <td>✅ Built-in</td>
                      <td>⚠️ Manual</td>
                      <td>✅ Built-in</td>
                      <td>❌ N/A</td>
                    </tr>
                    <tr>
                      <td>Docker/K8s</td>
                      <td>✅ Native</td>
                      <td>❌ None</td>
                      <td>⚠️ Modules</td>
                      <td>❌ None</td>
                    </tr>
                    <tr>
                      <td>Template literals</td>
                      <td>✅ $`cmd`</td>
                      <td>❌ None</td>
                      <td>❌ None</td>
                      <td>✅ $`cmd`</td>
                    </tr>
                    <tr>
                      <td>Enterprise features</td>
                      <td>✅ Complete</td>
                      <td>❌ Limited</td>
                      <td>✅ Complete</td>
                      <td>❌ Basic</td>
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
                to="/docs/introduction/">
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