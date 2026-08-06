import styles from './index.module.css';

import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Translate, { translate } from '@docusaurus/Translate';

/**
 * The install line with a copy affordance.
 *
 * The clipboard is the whole purpose of showing an install command; making
 * the reader select-and-copy a one-liner is friction at the exact moment
 * they decided to try the tool. Feedback is a brief state change on the
 * button itself — no toast, nothing moves.
 */
function InstallLine({ command }: { readonly command: string }): React.ReactNode {
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(() => {
    navigator.clipboard?.writeText(command).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }, [command]);

  return (
    <p className={styles.installLine}>
      <code>{command}</code>
      <button
        type="button"
        className={styles.copyButton}
        onClick={copy}
        data-copied={copied || undefined}
        aria-label={translate({ id: 'homepage.copyInstall', message: 'Copy install command' })}
      >
        {copied ? '✓' : '⧉'}
      </button>
    </p>
  );
}

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
      ['await', 'kw'], [' $.'], ['docker', 'fn'], ['('], ["'api'", 'str'], [')'],
      ['`python migrate.py`', 'str'], [';', 'punc'],
    ],
  },
  {
    code: [
      ['await', 'kw'], [' $.'], ['k8s', 'fn'], ['('], ["'prod/api-pod'", 'str'], [')'],
      ['`./healthcheck.sh`', 'str'], [';', 'punc'],
    ],
  },
  {},
  { comment: '// node · bun · deno — same output, byte for byte' },
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
              <code>{`import { $ } from '@xec-sh/core';

const result = await $.ssh('deploy@web-1')\`systemctl status api\`;

result.ok         // exit 0 and not signalled
result.stdout     // string
result.stdall     // both streams, in arrival order
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

/**
 * The guarantees, each of which exists in the repository as a test.
 *
 * This is the section that decides whether someone puts the tool near
 * production. Marketing adjectives do not; a specific promise, phrased as the
 * failure it prevents, does.
 */
const CONTRACT = [
  {
    title: 'An option works or it fails loudly',
    body:
      '.cd() on a container changes the directory in the container. .env() on a pod exports in the pod, and never leaks into your own process. Nothing is accepted and quietly dropped.',
  },
  {
    title: 'No silent data loss',
    body:
      'Output past maxBuffer kills the producer and fails with the truncated head kept — never an empty result with exit code 0. A process killed by a signal is never ok, and reports 128 + signum.',
  },
  {
    title: 'Interpolation is safe by default',
    body:
      'Interpolated values are quoted for the shell that will actually parse them, so a value can never change the structure of a command. $.raw exists for when you mean it.',
  },
  {
    title: 'Secrets stay out of logs',
    body:
      'Tokens, API keys, URL credentials and PEM blocks are redacted in output, events, error messages and the verbose echo — with one rule set, including across stream chunk boundaries.',
  },
  {
    title: 'Killing a command kills its tree',
    body:
      'sh -c "node server.js" is a process tree. Kill, abort, timeout and buffer overflow all signal the whole group, so nothing is orphaned holding a port.',
  },
  {
    title: 'A cached result belongs to its target',
    body:
      'Cache keys carry the host, container, pod, namespace and cluster. One machine’s answer is never served for another, so a health check cannot report on the wrong box.',
  },
] as const;

function Contract(): React.ReactNode {
  return (
    <section className={styles.sectionAlt}>
      <div className="container">
        <h2 className={styles.sectionTitle}>
          <Translate id="homepage.contract.title">The contract</Translate>
        </h2>
        <p className={styles.sectionLead}>
          <Translate id="homepage.contract.lead">
            Each of these is enforced by a test in this repository. They are written as
            promises about what will not happen to you, because that is what you need to
            know before running something against a production host.
          </Translate>
        </p>

        <div className={styles.contractGrid}>
          {CONTRACT.map(item => (
            <article key={item.title} className={styles.contractCard}>
              <h3 className={styles.contractTitle}>{item.title}</h3>
              <p className={styles.contractBody}>{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Two entry points, because people arrive as either a library or a CLI user. */
function TwoWaysIn(): React.ReactNode {
  return (
    <section className={styles.section}>
      <div className="container">
        <h2 className={styles.sectionTitle}>
          <Translate id="homepage.ways.title">Two ways in</Translate>
        </h2>

        <div className={styles.waysGrid}>
          <article className={styles.wayCard}>
            <span className={styles.wayLabel}>
              <Translate id="homepage.ways.library">As a library</Translate>
            </span>
            <pre className={styles.miniCode}>
              <code>{`npm i @xec-sh/core`}</code>
            </pre>
            <pre className={styles.miniCode}>
              <code>{`import { $ } from '@xec-sh/core';

const staging = $.ssh('deploy@staging')
  .cd('/srv/app')
  .env({ NODE_ENV: 'staging' })
  .timeout('60s')
  .retry({ maxRetries: 3 });

await staging\`pnpm migrate\`;

for await (const line of staging\`tail -f app.log\`) {
  if (line.includes('ERROR')) console.error(line);
}`}</code>
            </pre>
            <p className={styles.wayNote}>
              <Translate id="homepage.ways.libraryNote">
                Every environment takes the same chain. Output streams as it arrives, so a
                follow works the way you expect.
              </Translate>
            </p>
          </article>

          <article className={styles.wayCard}>
            <span className={styles.wayLabel}>
              <Translate id="homepage.ways.cli">As a CLI</Translate>
            </span>
            <pre className={styles.miniCode}>
              <code>{`npm i -g @xec-sh/cli`}</code>
            </pre>
            <pre className={styles.miniCode}>
              <code>{`xec on deploy@prod-1 'systemctl restart api'
xec in postgres-main 'pg_dump mydb'
xec in production/api-7f9d 'cat app.log'

xec run deploy.ts          # a script, with $ in scope
xec forward hosts.prod 8080:80`}</code>
            </pre>
            <p className={styles.wayNote}>
              <Translate id="homepage.ways.cliNote">
                Targets, defaults and tasks live in .xec/config.yaml. Scripts get the same
                API the library exposes — nothing is CLI-only.
              </Translate>
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

/** What the tool does not do, so nobody adopts it expecting an orchestrator. */
function Scope(): React.ReactNode {
  return (
    <section className={styles.sectionAlt}>
      <div className="container">
        <div className={styles.scopeGrid}>
          <div>
            <h2 className={styles.sectionTitle}>
              <Translate id="homepage.scope.title">What Xec is not</Translate>
            </h2>
            <p className={styles.sectionLead}>
              <Translate id="homepage.scope.lead">
                Knowing where a tool stops is worth as much as knowing what it does.
              </Translate>
            </p>
          </div>

          <ul className={styles.scopeList}>
            <li>
              <strong>
                <Translate id="homepage.scope.ansible">Not an Ansible replacement.</Translate>
              </strong>{' '}
              <Translate id="homepage.scope.ansibleBody">
                No inventory graph, no declarative convergence. Xec is imperative TypeScript
                for the automation you would otherwise write in bash — with types, tests and
                one API instead of four.
              </Translate>
            </li>
            <li>
              <strong>
                <Translate id="homepage.scope.sdk">Not an SDK wrapper.</Translate>
              </strong>{' '}
              <Translate id="homepage.scope.sdkBody">
                Adapters speak the native tools — the ssh2 protocol, the docker and kubectl
                CLIs — so behaviour matches what you would get by hand, exit codes included.
              </Translate>
            </li>
            <li>
              <strong>
                <Translate id="homepage.scope.deps">Not a dependency tree.</Translate>
              </strong>{' '}
              <Translate id="homepage.scope.depsBody">
                The execution core declares one runtime dependency, ssh2, and loads it only
                when an SSH target is used. Running a command locally loads no third-party
                code at all.
              </Translate>
            </li>
          </ul>
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
    name: '@xec-sh/ops',
    role: 'Operations — deploys, pipelines, workflows, health checks, discovery.',
    to: '/docs/ops',
  },
  {
    name: '@xec-sh/cli',
    role: 'Command line — a thin wrapper over the two above.',
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

/**
 * Measured facts, not adjectives.
 *
 * An infrastructure tool is evaluated on whether it can be trusted, and the
 * things that answer that are countable: how much third-party code it drags
 * in, how much of its behaviour is pinned by tests, how long it makes you
 * wait. Every number here is measured, and each is checked in the repository.
 */
const FACTS = [
  { value: '1', label: 'runtime dependency', note: 'ssh2 — loaded only when an SSH target is used' },
  { value: '4', label: 'environments, one API', note: 'local, SSH, Docker, Kubernetes' },
  { value: '3', label: 'runtimes', note: 'Node, Bun, Deno — byte-identical results, pinned by a parity test' },
  { value: '3', label: 'platforms', note: 'Linux, macOS, Windows — all three run the suite in CI' },
  { value: '5,300+', label: 'tests', note: 'across the engine, operations library, CLI, loader and UI kit' },
  { value: '~70ms', label: 'CLI startup', note: 'against a ~30ms floor for an empty Node process' },
] as const;

function Facts(): React.ReactNode {
  return (
    <section className={styles.facts}>
      <div className={`container ${styles.factsInner}`}>
        {FACTS.map(fact => (
          <div key={fact.label} className={styles.factItem}>
            <span className={styles.factValue}>{fact.value}</span>
            <span className={styles.factLabel}>{fact.label}</span>
            <span className={styles.factNote}>{fact.note}</span>
          </div>
        ))}
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

          <InstallLine command="npm i @xec-sh/core" />
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
        <Facts />
        <Contrast />
        <Contract />
        <TwoWaysIn />
        <Scope />
        <Packages />
      </main>
    </Layout>
  );
}
