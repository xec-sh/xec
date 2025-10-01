import Docker from 'dockerode';

export const docker = new Docker();

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
}

export async function getContainerInfo(containerName: string): Promise<ContainerInfo | null> {
  try {
    const container = docker.getContainer(containerName);
    const info = await container.inspect();
    return {
      id: info.Id,
      name: info.Name.replace(/^\//, ''),
      image: info.Config.Image,
      state: info.State.Status
    };
  } catch (error) {
    return null;
  }
}

export async function waitForContainer(containerName: string, timeout = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const info = await getContainerInfo(containerName);
    if (info && info.state === 'running') {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Container ${containerName} did not start within ${timeout}ms`);
}

export async function getContainerLogs(containerName: string): Promise<{ stdout: string; stderr: string }> {
  const container = docker.getContainer(containerName);
  const logStream = await container.logs({
    stdout: true,
    stderr: true,
    follow: false
  });
  
  // Check if it's a Buffer or Stream
  if (Buffer.isBuffer(logStream)) {
    // If it's a buffer, parse it directly
    const logs = logStream.toString('utf-8');
    return {
      stdout: logs,
      stderr: ''
    };
  }
  
  // It's a stream, handle it as before
  const stream = logStream as NodeJS.ReadableStream;
  const stdout: string[] = [];
  const stderr: string[] = [];
  
  return new Promise((resolve, reject) => {
    container.modem.demuxStream(stream, 
      {
        write: (chunk: any) => stdout.push(chunk.toString())
      },
      {
        write: (chunk: any) => stderr.push(chunk.toString())
      }
    );
    
    stream.on('end', () => {
      resolve({
        stdout: stdout.join(''),
        stderr: stderr.join('')
      });
    });
    
    stream.on('error', reject);
  });
}

export async function execInContainer(
  containerName: string, 
  command: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const container = docker.getContainer(containerName);
  const exec = await container.exec({
    Cmd: command,
    AttachStdout: true,
    AttachStderr: true
  });
  
  const stream = await exec.start({ hijack: true });
  
  const stdout: string[] = [];
  const stderr: string[] = [];
  
  return new Promise((resolve, reject) => {
    container.modem.demuxStream(stream,
      {
        write: (chunk: any) => stdout.push(chunk.toString())
      },
      {
        write: (chunk: any) => stderr.push(chunk.toString())
      }
    );
    
    stream.on('end', async () => {
      const info = await exec.inspect();
      resolve({
        stdout: stdout.join(''),
        stderr: stderr.join(''),
        exitCode: info.ExitCode || 0
      });
    });
    
    stream.on('error', reject);
  });
}

export async function cleanupTestContainers(prefix: string): Promise<void> {
  const containers = await docker.listContainers({ all: true });
  
  for (const containerInfo of containers) {
    const name = containerInfo.Names[0]?.replace(/^\//, '');
    if (name && name.startsWith(prefix)) {
      try {
        const container = docker.getContainer(containerInfo.Id);
        await container.remove({ force: true });
      } catch (error) {
        // Container may already be removed
      }
    }
  }
}