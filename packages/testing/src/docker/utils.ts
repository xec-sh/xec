import { execFile } from 'node:child_process';

/**
 * Container helpers built on the docker CLI.
 *
 * This file used to be the package's only production dependency: it drove
 * dockerode for five small operations, while every other package in the
 * repository shells out to `docker` for the same work. A test-utility package
 * that promises zero production dependencies should keep that promise, and
 * the CLI needs no protocol client, no stream demuxing, and no socket
 * configuration of its own.
 *
 * Arguments go through execFile, so nothing here passes through a shell.
 */

/** Run docker with the given arguments and collect both streams. */
function runDocker(
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise(resolve => {
    execFile('docker', args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      // execFile reports a non-zero exit as an error whose `code` is the exit
      // code; a spawn failure carries a string errno instead.
      const code = (error as (NodeJS.ErrnoException & { code?: number | string }) | null)?.code;
      const exitCode = error ? (typeof code === 'number' ? code : 1) : 0;

      resolve({ stdout: String(stdout), stderr: String(stderr), exitCode });
    });
  });
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
}

/**
 * Inspect a container.
 *
 * @param containerName - Name or id.
 * @returns Its identity and state, or null when it does not exist.
 */
export async function getContainerInfo(containerName: string): Promise<ContainerInfo | null> {
  const result = await runDocker(['inspect', '--format', 'json', containerName]);
  if (result.exitCode !== 0) return null;

  try {
    const [info] = JSON.parse(result.stdout) as Array<{
      Id: string;
      Name: string;
      Config: { Image: string };
      State: { Status: string };
    }>;

    if (!info) return null;

    return {
      id: info.Id,
      name: info.Name.replace(/^\//, ''),
      image: info.Config.Image,
      state: info.State.Status,
    };
  } catch {
    return null;
  }
}

/**
 * Wait until a container reports `running`.
 *
 * @param containerName - Name or id.
 * @param timeout - How long to keep polling, in ms.
 * @throws When the container is not running within the timeout.
 */
export async function waitForContainer(containerName: string, timeout = 5000): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const info = await getContainerInfo(containerName);
    if (info?.state === 'running') return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`Container ${containerName} did not start within ${timeout}ms`);
}

/**
 * A container's collected logs.
 *
 * The CLI already demultiplexes the daemon's stream: stdout arrives on
 * stdout and stderr on stderr, which is the split dockerode needed a modem
 * helper for.
 */
export async function getContainerLogs(
  containerName: string
): Promise<{ stdout: string; stderr: string }> {
  const result = await runDocker(['logs', containerName]);

  if (result.exitCode !== 0) {
    throw new Error(`docker logs ${containerName} failed: ${result.stderr.trim()}`);
  }

  return { stdout: result.stdout, stderr: result.stderr };
}

/**
 * Run a command inside a container and report what it did.
 *
 * @param containerName - Name or id.
 * @param command - Argv, passed as-is; nothing is shell-interpreted.
 */
export async function execInContainer(
  containerName: string,
  command: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return runDocker(['exec', containerName, ...command]);
}

/**
 * Force-remove every container whose name starts with the prefix.
 *
 * Test containers are namespaced by prefix, so this is how a suite cleans up
 * after itself — including containers a crashed run left behind.
 */
export async function cleanupTestContainers(prefix: string): Promise<void> {
  const listed = await runDocker(['ps', '-a', '--format', '{{.Names}}']);
  if (listed.exitCode !== 0) return;

  const names = listed.stdout
    .split('\n')
    .map(name => name.trim())
    .filter(name => name.startsWith(prefix));

  await Promise.all(names.map(name => runDocker(['rm', '-f', name])));
}
