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
      message: 'Universal Execution',
    }),
    Svg: UniversalSvg,
    description: (
      <Translate id="homepage.features.universal.description">
        Execute commands seamlessly across local, SSH, Docker, Kubernetes and other environments with a unified API. Write once, run anywhere with the same familiar JavaScript syntax.
      </Translate>
    ),
  },
  {
    title: translate({
      id: 'homepage.features.typeSafe.title',
      message: 'Type-Safe & Modern',
    }),
    Svg: TypeSafeSvg,
    description: (
      <Translate id="homepage.features.typeSafe.description">
        Built with TypeScript from the ground up. Enjoy full IDE support, autocompletion, and compile-time safety for your infrastructure code. Catch errors before they reach production.
      </Translate>
    ),
  },
  {
    title: translate({
      id: 'homepage.features.extensible.title',
      message: 'Designed for Complex Scripting',
    }),
    Svg: ExtensibleSvg,
    description: (
      <Translate id="homepage.features.extensible.description">
        Chain calls like .cd(), .env(), and .timeout() to create configured execution environments. Use full TypeScript power with variables, loops, functions, and libraries directly in your scripts.
      </Translate>
    ),
  },
  {
    title: translate({
      id: 'homepage.features.powerful.title',
      message: 'Powerful Features',
    }),
    Svg: PowerfulSvg,
    description: (
      <Translate id="homepage.features.powerful.description">
        SSH tunnels, port forwarding, file transfers, streaming logs, parallel execution, retry logic, caching, and more. Everything you need for modern infrastructure automation.
      </Translate>
    ),
  },
  {
    title: translate({
      id: 'homepage.features.secure.title',
      message: 'Secure by Design',
    }),
    Svg: SecureSvg,
    description: (
      <Translate id="homepage.features.secure.description">
        Built-in security features including SSH key validation, secure password handling, audit logging, and secret management. Your credentials and sensitive data are always protected.
      </Translate>
    ),
  },
  {
    title: translate({
      id: 'homepage.features.scalable.title',
      message: 'Scalable Architecture',
    }),
    Svg: ScalableSvg,
    description: (
      <Translate id="homepage.features.scalable.description">
        Connection pooling, resource management, and efficient execution engine. Handle everything from simple scripts to complex multi-environment orchestrations with ease.
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