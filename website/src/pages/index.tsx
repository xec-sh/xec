import styles from './index.module.css';

import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Translate, { translate } from '@docusaurus/Translate';

/**
 * A line of the hero demo.
 *
 * The demo is the product: the same command shape running in four places. It
 * is rendered as a terminal rather than as a styled code block so the point
 * lands before any of the prose is read.
 */
type DemoLine = {
  readonly comment?: string;
  readonly code?: readonly (readonly [text: string, tone?: 'kw' | 'fn' | 'str' | 'punc'])[];
};

const DEMO: readonly DemoLine[] = [
  { code: [['import', 'kw'], [' { $ } '], ['from', 'kw'], [" '@xec-sh/core'", 'str'], [';', 'punc']] },
  {},
  { comment: '// the same command, four environments' },
  { code: [['await', 'kw'], [' $'], ['`npm run build`', 'str'], [';', 'punc']] },
  {
    code: [
      ['await', 'kw'], [' $.'], ['ssh', 'fn'], ['('], ["'deploy@web-1'", 'str'], [')'],
      ['`systemctl restart api`', 'str'], [';', 'punc'],
    ],
  },
  {
    code: [
      ['await', 'kw'], [' $.'], ['docker', 'fn'], ['({ container: '], ["'api'", 'str'], [' })'],
      ['`python migrate.py`', 'str'], [';', 'punc'],
    ],
  },
  {
    code: [
      ['await', 'kw'], [' $.'], ['k8s', 'fn'], ['('], ["'prod/api-pod'", 'str'], [')'],
      ['`./healthcheck.sh`', 'str'], [';', 'punc'],
    ],
  },
];

function Terminal(): React.ReactNode {
  return (
    <div className={styles.terminal}>
      <div className={styles.terminalBar}>
        <span className={styles.dot} data-tone="red" />
        <span className={styles.dot} data-tone="amber" />
        <span className={styles.dot} data-tone="green" />
        <span className={styles.terminalTitle}>deploy.ts</span>
      </div>

      <pre className={styles.terminalBody}>
        <code>
          {DEMO.map((line, index) => {
            if (line.comment) {
              return (
                <span key={index} className={styles.lineComment}>
                  {line.comment}
                  {'\n'}
                </span>
              );
            }

            if (!line.code) {
              return <span key={index}>{'\n'}</span>;
            }

            return (
              <span key={index}>
                {line.code.map(([text, tone], part) => (
                  <span key={part} className={tone ? styles[`t_${tone}`] : undefined}>
                    {text}
                  </span>
                ))}
                {'\n'}
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}

/** What the same job costs without a unified layer, stated concretely. */
function Contrast(): React.ReactNode {
  return (
    <section className={styles.section}>
      <div className="container">
        <h2 className={styles.sectionTitle}>
          <Translate id="homepage.contrast.title">The seam this closes</Translate>
        </h2>
        <p className={styles.sectionLead}>
          <Translate id="homepage.contrast.lead">
            Running a command somewhere other than your own machine means assembling four
            libraries with four APIs, four error shapes and four streaming models — then
            keeping them in step.
          </Translate>
        </p>

        <div className={styles.contrastGrid}>
          <div className={styles.contrastCard} data-variant="before">
            <span className={styles.contrastLabel}>
              <Translate id="homepage.contrast.before">Assembled by hand</Translate>
            </span>
            <ul className={styles.stackList}>
              <li><code>execa</code><span>local processes</span></li>
              <li><code>ssh2</code><span>remote hosts</span></li>
              <li><code>dockerode</code><span>containers</span></li>
              <li><code>@kubernetes/client-node</code><span>pods</span></li>
            </ul>
            <p className={styles.contrastNote}>
              <Translate id="homepage.contrast.beforeNote">
                Four result types. Four ways a failure surfaces. Moving a service from a
                container to a host means rewriting the code that talks to it.
              </Translate>
            </p>
          </div>

          <div className={styles.contrastCard} data-variant="after">
            <span className={styles.contrastLabel}>
              <Translate id="homepage.contrast.after">With xec</Translate>
            </span>
            <pre className={styles.miniCode}>
              <code>{`const result = await $.ssh(host)\`systemctl status api\`;

result.exitCode   // number
result.stdout     // string
result.duration   // ms

// same shape for local, docker and k8s`}</code>
            </pre>
            <p className={styles.contrastNote}>
              <Translate id="homepage.contrast.afterNote">
                One result type, one error hierarchy, one streaming model. The target
                changes; the code does not.
              </Translate>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const CAPABILITIES = [
  {
    title: 'Typed results, structured failures',
    body:
      'Every command resolves to the same result shape. Failures carry a machine-readable kind — connection-lost, authentication, not-found — so callers branch on the reason instead of matching error text.',
    code: `if (error.recoverable) {
  await reconnect();
}`,
  },
  {
    title: 'Safe by construction',
    body:
      'Interpolated values are quoted for the shell that will actually parse them. SSH host keys are checked against known_hosts. Secrets are masked in output, errors and events — including across stream chunk boundaries.',
    code: `await $\`rm \${userInput}\`;
// rm '; drop table --'`,
  },
  {
    title: 'Built for long-running work',
    body:
      'Connection pooling, a bounded timeout on every operation, streaming with backpressure, and recovery when a transport dies mid-command. Adapters load lazily, so importing the package costs nothing for SSH or Kubernetes.',
    code: `await $.ssh(host)
  .timeout(30_000)
  \`./migrate.sh\`;`,
  },
  {
    title: 'Declarative targets and tasks',
    body:
      'Describe hosts, containers and pods once in .xec/config.yaml, then run tasks against any of them from the CLI — or import the same engine and build your own tool on top of it.',
    code: `xec on hosts.web-* uptime`,
  },
] as const;

function Capabilities(): React.ReactNode {
  return (
    <section className={styles.sectionAlt}>
      <div className="container">
        <h2 className={styles.sectionTitle}>
          <Translate id="homepage.capabilities.title">What you get</Translate>
        </h2>

        <div className={styles.capGrid}>
          {CAPABILITIES.map(capability => (
            <article key={capability.title} className={styles.capCard}>
              <h3 className={styles.capTitle}>{capability.title}</h3>
              <p className={styles.capBody}>{capability.body}</p>
              <pre className={styles.miniCode}>
                <code>{capability.code}</code>
              </pre>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const PACKAGES = [
  {
    name: '@xec-sh/core',
    role: 'Execution engine — the $ API, adapters, pooling, streaming.',
    to: '/docs/core/execution-engine/overview',
  },
  {
    name: '@xec-sh/cli',
    role: 'Command line — run tasks and commands against any target.',
    to: '/docs/commands/overview',
  },
  {
    name: '@xec-sh/loader',
    role: 'Script loading — TypeScript transform, REPL, watch mode.',
    to: '/docs/scripting/basics/first-script',
  },
  {
    name: '@xec-sh/kit',
    role: 'Terminal UI — prompts, spinners, tables, colour.',
    to: '/docs/introduction/ecosystem',
  },
] as const;

function Packages(): React.ReactNode {
  return (
    <section className={styles.section}>
      <div className="container">
        <h2 className={styles.sectionTitle}>
          <Translate id="homepage.packages.title">Packages</Translate>
        </h2>

        <div className={styles.pkgList}>
          {PACKAGES.map(pkg => (
            <Link key={pkg.name} to={pkg.to} className={styles.pkgRow}>
              <code className={styles.pkgName}>{pkg.name}</code>
              <span className={styles.pkgRole}>{pkg.role}</span>
              <span className={styles.pkgArrow} aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function Hero(): React.ReactNode {
  return (
    <header className={styles.hero}>
      <div className={`container ${styles.heroInner}`}>
        <div className={styles.heroCopy}>
          <h1 className={styles.heroTitle}>
            <Translate id="homepage.title">One</Translate>{' '}
            <span className={styles.heroDollar}>$</span>{' '}
            <Translate id="homepage.title2">for every environment</Translate>
          </h1>

          <p className={styles.heroSubtitle}>
            <Translate id="homepage.tagline">
              A typed execution layer for TypeScript infrastructure. Run commands on your
              laptop, an SSH fleet, Docker containers and Kubernetes pods through one API —
              with the same result type, the same errors and the same streaming everywhere.
            </Translate>
          </p>

          <div className={styles.heroActions}>
            <Link className={styles.primaryButton} to="/docs/introduction/quick-start">
              <Translate id="homepage.getStarted">Get started</Translate>
            </Link>
            <Link className={styles.secondaryButton} to="/docs/api">
              <Translate id="homepage.apiRef">API reference</Translate>
            </Link>
          </div>

          <p className={styles.installLine}>
            <code>npm i @xec-sh/core</code>
          </p>
        </div>

        <div className={styles.heroDemo}>
          <Terminal />
        </div>
      </div>
    </header>
  );
}

export default function Home(): React.ReactNode {
  const description = translate({
    id: 'homepage.description',
    message:
      'Xec is a typed execution layer for TypeScript: one $ API that runs commands on local machines, SSH hosts, Docker containers and Kubernetes pods, with typed results, structured errors and connection pooling.',
  });

  return (
    <Layout
      title={translate({ id: 'homepage.layoutTitle', message: 'One $ for every environment' })}
      description={description}
    >
      <Hero />
      <main>
        <Contrast />
        <Capabilities />
        <Packages />
      </main>
    </Layout>
  );
}
