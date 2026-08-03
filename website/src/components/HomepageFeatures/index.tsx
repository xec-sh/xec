import React from 'react';
import styles from './styles.module.css';

import clsx from 'clsx';
import Heading from '@theme/Heading';
import Translate, { translate } from '@docusaurus/Translate';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: React.ReactNode;
};

// SVG components
const UniversalSvg = (props: React.ComponentProps<'svg'>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TypeSafeSvg = (props: React.ComponentProps<'svg'>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M9 11L12 14L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 12V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PowerfulSvg = (props: React.ComponentProps<'svg'>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ScalableSvg = (props: React.ComponentProps<'svg'>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect x="4" y="4" width="6" height="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="14" y="4" width="6" height="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="4" y="14" width="6" height="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="14" y="14" width="6" height="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FeatureList: FeatureItem[] = [
  {
    title: translate({
      id: 'homepage.features.unified.title',
      message: 'One API, Every Environment',
    }),
    Svg: UniversalSvg,
    description: (
      <Translate id="homepage.features.unified.description">
        Run the same $`command` on your local shell, SSH hosts, Docker containers and Kubernetes pods. Adapters handle the transport — your code stays identical.
      </Translate>
    ),
  },
  {
    title: translate({
      id: 'homepage.features.typed.title',
      message: 'Typed Results, Structured Errors',
    }),
    Svg: TypeSafeSvg,
    description: (
      <Translate id="homepage.features.typed.description">
        Every command returns a typed result with stdout, stderr, exit code and duration. Failures are structured error classes you can catch and inspect — not strings to parse.
      </Translate>
    ),
  },
  {
    title: translate({
      id: 'homepage.features.performance.title',
      message: 'Fast Where It Counts',
    }),
    Svg: PowerfulSvg,
    description: (
      <Translate id="homepage.features.performance.description">
        SSH connection pooling, lazy-loaded adapters and streaming output keep overhead low — from a single host to an entire fleet.
      </Translate>
    ),
  },
  {
    title: translate({
      id: 'homepage.features.declarative.title',
      message: 'Declarative Targets & Tasks',
    }),
    Svg: ScalableSvg,
    description: (
      <Translate id="homepage.features.declarative.description">
        Define hosts, containers and pods once in .xec/config.yaml, then run tasks against any of them with the xec CLI.
      </Translate>
    ),
  },
];

function Feature({ title, Svg, description }: FeatureItem) {
  return (
    <div className={clsx('col col--3')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): React.ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
