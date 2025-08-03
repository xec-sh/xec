import styles from './styles.module.css';

import clsx from 'clsx';
import Heading from '@theme/Heading';
import Translate, { translate } from '@docusaurus/Translate';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: JSX.Element;
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

const ExtensibleSvg = (props: React.ComponentProps<'svg'>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 2V6M12 18V22M4.93 4.93L7.76 7.76M16.24 16.24L19.07 19.07M2 12H6M18 12H22M4.93 19.07L7.76 16.24M16.24 7.76L19.07 4.93" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const PowerfulSvg = (props: React.ComponentProps<'svg'>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SecureSvg = (props: React.ComponentProps<'svg'>) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
      id: 'homepage.features.universal.title',
      message: 'Universal Execution Engine',
    }),
    Svg: UniversalSvg,
    description: (
      <Translate id="homepage.features.universal.description">
        Single API for all environments via @xec-sh/core. Execute commands across local, SSH, Docker, and Kubernetes with the same consistent interface and automatic adapter selection.
      </Translate>
    ),
  },
  {
    title: translate({
      id: 'homepage.features.multiEnvironment.title',
      message: 'Multi-Environment Native',
    }),
    Svg: TypeSafeSvg,
    description: (
      <Translate id="homepage.features.multiEnvironment.description">
        Seamless execution across local shells, SSH connections, Docker containers, and Kubernetes pods. Built-in adapters with environment-specific optimizations.
      </Translate>
    ),
  },
  {
    title: translate({
      id: 'homepage.features.templateLiterals.title',
      message: 'TypeScript Template Literals',
    }),
    Svg: ExtensibleSvg,
    description: (
      <Translate id="homepage.features.templateLiterals.description">
        Intuitive $`command` syntax with full type safety. Natural command writing with automatic escaping, interpolation, and IntelliSense support.
      </Translate>
    ),
  },
  {
    title: translate({
      id: 'homepage.features.enterprise.title',
      message: 'Enterprise Features',
    }),
    Svg: PowerfulSvg,
    description: (
      <Translate id="homepage.features.enterprise.description">
        Connection pooling, retry logic, error handling, caching, event system, and audit logging built-in. Production-ready with comprehensive monitoring and debugging.
      </Translate>
    ),
  },
  {
    title: translate({
      id: 'homepage.features.parallel.title',
      message: 'Parallel Execution',
    }),
    Svg: ScalableSvg,
    description: (
      <Translate id="homepage.features.parallel.description">
        Execute commands across multiple targets simultaneously. Built-in batch processing, concurrency control, and stream multiplexing for efficient operations.
      </Translate>
    ),
  },
  {
    title: translate({
      id: 'homepage.features.flexible.title',
      message: 'Flexible Approach',
    }),
    Svg: SecureSvg,
    description: (
      <Translate id="homepage.features.flexible.description">
        Use imperative TypeScript scripts or declarative YAML configuration. Mix and match approaches to suit your workflow and team preferences.
      </Translate>
    ),
  },
];

function Feature({ title, Svg, description }: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
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

export default function HomepageFeatures(): JSX.Element {
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