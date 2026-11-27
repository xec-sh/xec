import ssh2 from 'ssh2';
import FS from 'node:fs';
import { spawn as ptySpawn } from 'node-pty';
import ChildProcess from 'node:child_process';

import { fixturePrompt, PRIVATE_KEY_PATH } from './helpers.js';
import { posixShellPath } from '../../../core/test/helpers/platform.js';

const { STATUS_CODE } = ((ssh2.utils as unknown) as { sftp: { STATUS_CODE: Record<string, string> } }).sftp

function handleSFTP(accept: any) {
  const sftpStream = accept()

  let dirHandle = 105185
  const handles: Set<number> = new Set()
  const dirHandles: Map<number, { path: string; contents: string[] }> = new Map()
  sftpStream.on('OPEN', function (reqId: any, filename: any, flags: any) {
    let handleId
    try {
      handleId = FS.openSync(filename, ssh2.utils.sftp.flagsToString(flags) as string)
    } catch (error) {
      console.error(error)
      sftpStream.status(reqId, STATUS_CODE['FAILURE'])
      return
    }
    handles.add(handleId)

    const handle = Buffer.alloc(4)
    handle.writeUInt32BE(handleId)
    sftpStream.handle(reqId, handle)
  })
  sftpStream.on('READ', function (reqId: any, givenHandle: any, offset: any, length: any) {
    const handle = givenHandle.readUInt32BE(0)
    if (!handles.has(handle)) {
      sftpStream.status(reqId, STATUS_CODE['FAILURE'])
      return
    }

    const contents = Buffer.alloc(length)
    try {
      const bytes = FS.readSync(handle, contents, 0, length, offset)
      if (bytes === 0) sftpStream.status(reqId, STATUS_CODE['EOF'])
      else sftpStream.data(reqId, contents.subarray(0, bytes))
    } catch {
      sftpStream.status(reqId, STATUS_CODE['FAILURE'])
    }
  })
  sftpStream.on('WRITE', function (reqId: any, givenHandle: any, offset: any, data: any) {
    const handle = givenHandle.readUInt32BE(0)
    if (!handles.has(handle)) {
      sftpStream.status(reqId, STATUS_CODE['FAILURE'])
      return
    }

    try {
      FS.writeSync(handle, data, 0, data.length, offset)
      sftpStream.status(reqId, STATUS_CODE['OK'])
    } catch (error) {
      console.error(error)
      sftpStream.status(reqId, STATUS_CODE['FAILURE'])
    }
  })
  sftpStream.on('FSTAT', function (reqId: any, givenHandle: any) {
    const handle = givenHandle.readUInt32BE(0)
    if (!handles.has(handle)) {
      sftpStream.status(reqId, STATUS_CODE['FAILURE'])
      return
    }

    let stats
    try {
      stats = FS.fstatSync(handle)
    } catch (error) {
      console.error(error)
      sftpStream.status(reqId, STATUS_CODE['FAILURE'])
      return
    }
    sftpStream.attrs(reqId, stats)
  })
  sftpStream.on('FSETSTAT', function (reqId: any, givenHandle: any, attrs: any) {
    const handle = givenHandle.readUInt32BE(0)
    if (!handles.has(handle) || typeof attrs.mode !== 'number') {
      sftpStream.status(reqId, STATUS_CODE['FAILURE'])
      return
    }
    FS.fchmod(handle, attrs.mode, error => sftpStream.status(reqId, STATUS_CODE[error ? 'FAILURE' : 'OK']))
  })
  sftpStream.once('close', () => {
    for (const handle of handles) FS.close(handle, () => {})
    handles.clear()
    dirHandles.clear()
  })
  sftpStream.on('CLOSE', function (reqId: any, givenHandle: any) {
    const handle = givenHandle.readUInt32BE(0)
    if (dirHandles.has(handle)) {
      dirHandles.delete(handle)
      sftpStream.status(reqId, STATUS_CODE['OK'])
      return
    }
    if (handles.has(handle)) {
      handles.delete(handle)
      FS.close(handle, error => {
        sftpStream.status(reqId, STATUS_CODE[error ? 'FAILURE' : 'OK'])
      })
    } else {
      sftpStream.status(reqId, STATUS_CODE['FAILURE'])
    }
  })
  sftpStream.on('MKDIR', function (reqId: any, path: any, attrs: any) {
    try {
      FS.mkdirSync(path, attrs.mode)
      sftpStream.status(reqId, STATUS_CODE['OK'])
    } catch (error) {
      sftpStream.status(reqId, STATUS_CODE[(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'NO_SUCH_FILE' : 'FAILURE'], (error as Error).message)
    }
  })
  sftpStream.on('STAT', function (reqId: any, path: any) {
    try {
      const stats = FS.statSync(path)
      sftpStream.attrs(reqId, stats)
    } catch (error) {
      sftpStream.status(reqId, STATUS_CODE[(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'NO_SUCH_FILE' : 'FAILURE'], (error as Error).message)
    }
  })
  sftpStream.on('OPENDIR', function (reqId: any, path: any) {
    let stat
    try {
      stat = FS.statSync(path)
    } catch {
      sftpStream.status(reqId, STATUS_CODE['FAILURE'])
      return
    }
    if (!stat.isDirectory()) {
      sftpStream.status(reqId, STATUS_CODE['FAILURE'])
      return
    }
    const contents = FS.readdirSync(path)

    dirHandle += 1
    const currentDirHandle = dirHandle
    dirHandles.set(currentDirHandle, { path, contents })
    const handle = Buffer.alloc(4)
    handle.writeUInt32BE(currentDirHandle)
    sftpStream.handle(reqId, handle)
  })
  sftpStream.on('READDIR', function (reqId: any, givenHandle: any) {
    const handle = givenHandle.readUInt32BE(0)
    const dirInfo = dirHandles.get(handle)
    if (dirInfo == null || !dirInfo.contents.length) {
      sftpStream.status(reqId, STATUS_CODE['EOF'])
      return
    }

    const item = dirInfo.contents.pop()
    const fullPath = FS.realpathSync.native(dirInfo.path + '/' + item)

    let attrs
    try {
      attrs = FS.statSync(fullPath)
    } catch (error) {
      console.error('READDIR stat error:', error)
      sftpStream.status(reqId, STATUS_CODE['FAILURE'])
      return
    }

    sftpStream.name(reqId, [
      {
        filename: item,
        longname: item,
        attrs,
      },
    ])
  })
}

function handleSession(acceptSession: any) {
  const session = acceptSession()

  let ptyInfo: Record<string, any> | null = null
  session.on('pty', function (accept: any, _: any, info: any) {
    accept()
    ptyInfo = {
      name: info.term,
      cols: info.cols,
      rows: info.rows,
      cwd: process.env['HOME'],
      env: { ...process.env, PS1: fixturePrompt, ENV: '', PROMPT_COMMAND: '', HISTFILE: '/dev/null' },
    }
  })
  session.on('shell', function (accept: any, reject: any) {
    if (!ptyInfo) {
      reject()
      return
    }
    const request = accept()

    const flags = process.platform === 'win32' ? ['--noprofile', '--norc', '-i'] : ['-i']
    const spawnedProcess: any = ptySpawn(posixShell(), flags, ptyInfo)
    // node-pty exposes callbacks, not Node streams. The old fixture called
    // .pipe() on it and its only shell test was permanently skipped.
    const data = spawnedProcess.onData((bytes: string) => request.write(bytes))
    const exit = spawnedProcess.onExit(({ exitCode }: { exitCode: number }) => { request.exit(exitCode); request.end() })
    request.on('data', (bytes: Buffer) => spawnedProcess.write(bytes.toString('utf8')))
    session.on('window-change', (_accept: unknown, _reject: unknown, info: { cols: number; rows: number }) => spawnedProcess.resize(info.cols, info.rows))
    request.once('close', () => { data.dispose(); exit.dispose(); try { spawnedProcess.kill() } catch { /* The PTY may have exited before its SSH channel closes. */ } })
  })
  session.on('exec', function (accept: any, reject: any, info: any) {
    const response = accept()
    // A POSIX shell, named. `exec` picks cmd.exe on Windows, and the SSH
    // adapter builds POSIX command lines by design — a real remote host is
    // one. Running them through cmd tests neither: not the adapter, whose
    // quoting is correct for where it is going, and not the server.
    const spawnedProcess = ChildProcess.exec(info.command, { shell: posixShell() })
    response.pipe(spawnedProcess.stdin)
    spawnedProcess.stdout?.pipe(response.stdout, { end: false })
    spawnedProcess.stderr?.pipe(response.stderr, { end: false })
    spawnedProcess.once('close', (code, signal) => {
      if (signal) response.exit(signal.replace(/^SIG/, ''))
      else response.exit(code ?? 255)
      response.end()
    })
  })
  session.on('sftp', handleSFTP)
}

/**
 * Where a POSIX shell lives here, for the fake server to run commands with.
 *
 * On Windows this is Git Bash's, which the runner has. `hasPosixShell`
 * below lets the suite skip rather than fail where it is absent.
 */
export function posixShell(): string {
  return posixShellPath()
}

/** Whether a POSIX shell can be found, so the suite can skip without one. */
export function hasPosixShell(): boolean {
  try {
    ChildProcess.execFileSync(posixShell(), ['-c', 'exit 0'], { stdio: 'ignore', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

function handleAuthentication(ctx: any) {
  let accept = true
  if (ctx.method === 'password') {
    accept = ctx.username === 'steel' && ctx.password === 'password'
  }
  if (accept) {
    ctx.accept()
  } else {
    ctx.reject()
  }
}

export default function createServer(): ssh2.Server {
  const server = new ssh2.Server(
    {
      hostKeys: [FS.readFileSync(PRIVATE_KEY_PATH)],
    },
    function (client) {
      client.on('authentication', handleAuthentication)
      client.on('session', handleSession)
    },
  )
  return server
}
