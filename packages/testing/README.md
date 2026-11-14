# @xec-sh/testing

Vitest helpers for Xec integration tests: SSH containers, Kubernetes fixtures, executable discovery, and environment checks.

```sh
npm install -D @xec-sh/testing vitest
```

Vitest 5.1 is a required peer. Use the Node versions supported by that runner and call lifecycle helpers inside Vitest test files.

## Use

```typescript
import { expect, it } from 'vitest';
import { validateShellName } from '@xec-sh/testing';

it('rejects shell syntax in an executable name', () => {
  expect(() => validateShellName('bash', 'shell')).not.toThrow();
  expect(() => validateShellName('bash; echo unsafe', 'shell')).toThrow();
});
```

```sh
npx vitest run
```

## Fixtures

| Area | API | Requirements |
| --- | --- | --- |
| SSH | `describeSSH`, `getSSHConfig`, `dockerManager` | Docker and the declared SSH fixture images |
| Kubernetes | `KindClusterManager`, `setupKindCluster`, `teardownKindCluster` | Docker, kind, kubectl |
| Discovery | `findBinary`, `isDockerAvailable`, `isKindAvailable`, `isKubectlAvailable` | The relevant executable |
| Validation | `validateShellName`, `shellEscape` | No external services |

`describeSSH` starts missing requested fixtures and waits for readiness. `skipIfNoDocker` permits skipping when Docker is unavailable. Fixtures are reusable by default; `STOP_CONTAINERS_AFTER_TESTS=true` stops containers started by that suite.

The predefined SSH fleet uses ports 2201–2207. Its disposable credentials and disabled host-key checks are test-only. `DockerContainerManager` manages this fleet, not arbitrary application containers. For independent concurrent tests, use uniquely named resources and clean up only resources that the test created.

[Integration examples](../core/test/integration) · [Contributor instructions](../../AGENTS.md) · [MIT license](../../LICENSE)
