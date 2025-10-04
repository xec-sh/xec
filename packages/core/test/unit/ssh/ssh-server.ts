import ssh2 from 'ssh2';
import FS from 'node:fs';
import { SFTPStream } from 'ssh2-streams';
import { spawn as ptySpawn } from 'node-pty';
import ChildProcess from 'node:child_process';

import { PRIVATE_KEY_PATH } from './helpers.js';

const { STATUS_CODE } = ((ssh2.utils as unknown) as { sftp: { STATUS_CODE: Record<string, string> } }).sftp

function handleSFTP(accept: any) {
  const sftpStream = accept()

  let dirHandle = 105185
  const handles: Set<number> = new Set()
  const dirHandles: Map<number, { path: string; contents: string[] }> = new Map()
  sftpStream.on('OPEN', function (reqId: any, filename: any, flags: any) {
    let handleId
    try {
      handleId = FS.openSync(filename, SFTPStream.flagsToString(flags) as string)
    } catch (error) {
      console.error(error)
      sftpStream.status(reqId, STATUS_CODE['FAILURE'])
      return
    }
    handles.add(handleId)

    const handle = Buffer.alloc(4)
    handle.write(handleId.toString())
    sftpStream.handle(reqId, handle)
  })
  sftpStream.on('READ', function (reqId: any, givenHandle: any, offset: any, length: any) {
    const handle = parseInt(givenHandle, 10)
    if (!handles.has(handle)) {
      sftpStream.status(reqId, STATUS_CODE['FAILURE'])
      return
    }

    const contents = Buffer.alloc(length)
    try {
      FS.readSync(handle, contents, 0, length, offset)
    } catch (error) {
      sftpStream.status(reqId, STATUS_CODE['FAILURE'])
      return
    }
    sftpStream.data(reqId, contents)
  })
  sftpStream.on('WRITE', function (reqId: any, givenHandle: any, offset: any, data: any) {
    const handle = parseInt(givenHandle, 10)
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
    const handle = parseInt(givenHandle, 10)
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
  sftpStream.on('CLOSE', function (reqId: any, givenHandle: any) {
    const handle = parseInt(givenHandle, 10)
    if (dirHandles.has(handle)) {
      dirHandles.delete(handle)
      sftpStream.status(reqId, STATUS_CODE['OK'])
      return
    }
    if (handles.has(handle)) {
      handles.delete(handle)
      FS.close(handle, function () {
        /* No Op */
      })
      sftpStream.status(reqId, STATUS_CODE['OK'])
    } else {
      sftpStream.status(reqId, STATUS_CODE['FAILURE'])
    }
  })
  sftpStream.on('MKDIR', function (reqId: any, path: any, attrs: any) {
    try {
      FS.mkdirSync(path, attrs.mode)
      sftpStream.status(reqId, STATUS_CODE['OK'])
    } catch (error) {
      sftpStream.status(reqId, STATUS_CODE['FAILURE'], (error as any).message)
    }
  })
  sftpStream.on('STAT', function (reqId: any, path: any) {
    try {
      const stats = FS.statSync(path)
      sftpStream.attrs(reqId, stats)
    } catch (error) {
      sftpStream.status(reqId, STATUS_CODE['FAILURE'], (error as any).message)
    }
  })
  sftpStream.on('OPENDIR', function (reqId: any, path: any) {
    let stat
    try {
      stat = FS.statSync(path)
    } catch (error) {
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
    const handle = Buffer.alloc(8)
    handle.write(currentDirHandle.toString())
    sftpStream.handle(reqId, handle)
  })
  sftpStream.on('READDIR', function (reqId: any, givenHandle: any) {
    const handle = parseInt(givenHandle, 10)
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
      env: process.env,
    }
  })
  session.on('shell', function (accept: any, reject: any) {
    if (!ptyInfo) {
      reject()
      return
    }
    const request = accept()

    const spawnedProcess: any = ptySpawn(process.env['SHELL'] || 'bash', [], ptyInfo)
    request.pipe(spawnedProcess)
    spawnedProcess.pipe(request)
  })
  session.on('exec', function (accept: any, reject: any, info: any) {
    const response = accept()
    const spawnedProcess = ChildProcess.exec(info.command)
    response.pipe(spawnedProcess.stdin)
    spawnedProcess.stdout?.pipe(response.stdout)
    spawnedProcess.stderr?.pipe(response.stderr)
  })
  session.on('sftp', handleSFTP)
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
