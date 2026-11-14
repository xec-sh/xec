import React from 'react';
import { Button } from '@omnitron-dev/prism/ui';
import { renderCodeBlockHtml } from '@omnitron-dev/lumen-ast';
import { PortalIslandHost } from '@omnitron-dev/lumen-ui/runtime';

import { ArrowIcon } from './icons.tsx';
import { ExecutionExplorer } from './execution-explorer.tsx';
import sourceExamples from '../data/examples.json' with { type: 'json' };

const examples = sourceExamples.map((example) => ({
  ...example,
  html: renderCodeBlockHtml(example.code, 'typescript'),
}));
const paths = [
  [
    '01',
    'Script the routine.',
    'Replace fragile glue with typed scripts, streams, cancellation and explicit results.',
    '/docs/scripting/basics/first-script',
    'SCRIPTS',
  ],
  [
    '02',
    'Give your project a CLI.',
    'Named targets, declarative tasks and dynamic commands with their own options and help.',
    '/docs/commands/custom/creating-commands',
    'COMMANDS',
  ],
  [
    '03',
    'Coordinate the work.',
    'Dependency graphs, bounded concurrency, matrix parameters and controlled retries.',
    '/docs/ops/pipeline',
    'ORCHESTRATION',
  ],
  [
    '04',
    'Ship what you verified.',
    'Prepare immutable archives. Publish and resume the same release through the Xec CLI.',
    '/docs/ops/release',
    'RELEASES',
  ],
];
export function Home() {
  return (
    <main className="home" id="main-content" tabIndex={-1}>
      <header className="hero">
        <div className="hero-eyebrow">
          <span className="status-dot" /> TYPESCRIPT AUTOMATION, WITHOUT THE SEAMS{' '}
          <span className="hero-version">v0.12</span>
        </div>
        <div className="hero-grid">
          <div className="hero-copy">
            <h1>
              Make the
              <br />
              work <em>flow.</em>
            </h1>
            <p className="hero-lead">
              Your scripts. Your CLI.
              <br />
              Every environment.
            </p>
            <p className="hero-description">
              Turn the work around your code into clear, reusable TypeScript. From a local command to a release
              pipeline, keep execution under your control.
            </p>
            <div className="hero-actions">
              <Button
                component="a"
                href="/docs/introduction/quick-start"
                variant="contained"
                size="large"
                endIcon={<ArrowIcon />}
              >
                Start building
              </Button>
              <Button component="a" href="/docs/introduction/when-to-use" size="large">
                Find your workflow
              </Button>
            </div>
            <a className="install-command" href="/docs/introduction/installation">
              <span aria-hidden="true">$</span>
              <code>npm install -g @xec-sh/cli</code>
              <span aria-hidden="true">↗</span>
            </a>
          </div>
          <PortalIslandHost
            islandId="execution-explorer"
            component="ExecutionExplorer"
            hydrate="load"
            props={{ examples }}
          >
            <ExecutionExplorer examples={examples} />
          </PortalIslandHost>
        </div>
        <div className="runtime-strip">
          <span>ONE EXECUTION CONTRACT</span>
          <b>Local</b>
          <i>/</i>
          <b>SSH</b>
          <i>/</i>
          <b>Docker</b>
          <i>/</i>
          <b>Kubernetes</b>
          <span className="runtime-detail">Node.js · Bun · Deno libraries</span>
        </div>
      </header>
      <section className="home-section" aria-labelledby="workflow-title">
        <div className="section-intro">
          <p className="eyebrow">01 / FROM ONE COMMAND TO A SYSTEM</p>
          <h2 id="workflow-title">
            Start small.
            <br />
            Keep the same foundations.
          </h2>
          <p>Adopt the library, the CLI, or both. Each layer has one job and works with the tools you already use.</p>
        </div>
        <div className="workflow-grid">
          {paths.map(([number, title, description, href, label]) => (
            <a className="workflow-card" href={href} key={number}>
              <div>
                <span className="card-index">{number}</span>
                <span className="eyebrow">{label}</span>
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
              <ArrowIcon className="card-arrow" />
            </a>
          ))}
        </div>
      </section>
      <section className="home-section architecture-section" aria-labelledby="architecture-title">
        <div>
          <p className="eyebrow">02 / COMPOSE, DON'T REWRITE</p>
          <h2 id="architecture-title">
            A small surface.
            <br />A complete execution path.
          </h2>
          <p className="section-description">
            Xec orchestrates the work. Your compiler builds it, Turbo can manage the package graph, and your platform
            supervises the deployed applications.
          </p>
          <Button component="a" href="/docs/introduction/architecture" endIcon={<ArrowIcon />}>
            Explore the architecture
          </Button>
        </div>
        <div className="architecture-map" aria-label="Xec architecture">
          <a href="/docs/commands/overview">
            <span>ENTRY</span>
            <strong>Your CLI · TypeScript scripts</strong>
            <small>Arguments, configuration and terminal UI</small>
          </a>
          <div className="map-connector" aria-hidden="true">
            ↓
          </div>
          <a href="/docs/ops">
            <span>COORDINATE</span>
            <strong>Tasks · Pipelines · Workflows</strong>
            <small>Dependencies, cancellation and explicit recovery</small>
          </a>
          <div className="map-connector" aria-hidden="true">
            ↓
          </div>
          <a href="/docs/core/execution-engine/overview">
            <span>EXECUTE</span>
            <strong>@xec-sh/core</strong>
            <small>Commands, streams, files and typed outcomes</small>
          </a>
          <div className="target-grid">
            {['Local', 'SSH', 'Docker', 'Kubernetes'].map((target, index) => (
              <a
                key={target}
                href={
                  [
                    '/docs/targets/local/overview',
                    '/docs/targets/ssh/overview',
                    '/docs/targets/docker/overview',
                    '/docs/targets/kubernetes/overview',
                  ][index]
                }
              >
                {target}
              </a>
            ))}
          </div>
        </div>
      </section>
      <section className="home-section" aria-labelledby="principles-title">
        <div className="section-intro">
          <p className="eyebrow">03 / CONTROL IS THE FEATURE</p>
          <h2 id="principles-title">Less glue. More intent.</h2>
        </div>
        <div className="principles-grid">
          <article>
            <span>01</span>
            <h3>Typed where it matters.</h3>
            <p>
              Compose commands and inspect typed results. Treat shell source and external output as runtime boundaries,
              not compile-time guarantees.
            </p>
            <a href="/docs/introduction/portable-scripts">Write portable scripts ↗</a>
          </article>
          <article>
            <span>02</span>
            <h3>Failures stay visible.</h3>
            <p>
              Choose deadlines, cancellation and retry policies explicitly. Define rollback for your system; an
              execution library cannot invent it.
            </p>
            <a href="/docs/guides/advanced/error-handling">Handle failure ↗</a>
          </article>
          <article>
            <span>03</span>
            <h3>Tools stay composable.</h3>
            <p>
              Run locally, from any CI provider, or against your own infrastructure. Keep build caches, credentials and
              deployment policy under your control.
            </p>
            <a href="/docs/guides/automation/ci-cd-pipelines">Build a workflow ↗</a>
          </article>
        </div>
      </section>
      <section className="home-closing">
        <div>
          <p className="eyebrow">THE NEXT USEFUL COMMAND</p>
          <h2>Make it yours.</h2>
          <p>One script is enough to get started.</p>
        </div>
        <Button
          component="a"
          href="/docs/introduction/quick-start"
          variant="outlined"
          size="large"
          endIcon={<ArrowIcon />}
        >
          Write your first script
        </Button>
      </section>
    </main>
  );
}
