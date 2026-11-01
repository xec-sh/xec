import type { Client, ConnectConfig } from 'ssh2'
import type { SSHAgent, SSHParsedKey, SSHAuthMethod, SSHSignCallback, SSHAgentAuthMethod, SFTPStats as Stats, SSHConnectionConfig,
    SSHAuthenticationType,
  SSHSigningRequestOptions,
  SFTPClient as SFTPWrapper,
  SSHChannel as ClientChannel,
  SSHForwardChannel as Channel,
  SSHShellOptions as ShellOptions,
  SSHChannelExecOptions as ExecOptions,
  SFTPTransferOptions as TransferOptions,
  SSHAcceptConnection as AcceptConnection,
  SSHPseudoTtyOptions as PseudoTtyOptions,
  SSHRejectConnection as RejectConnection,
  SSHTcpConnectionDetails as TcpConnectionDetails,
  SSHUNIXConnectionDetails as UNIXConnectionDetails
 } from './contracts.js'

export type * from './contracts.js'

import fsPath from 'node:path'
import stream from 'node:stream'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { constants as fsConstants } from 'node:fs'
import invariant, { AssertionError } from 'node:assert'

/**
 * Load ssh2 on first connection instead of at import time.
 *
 * `import '@xec-sh/core'` used to pull the whole ssh2 implementation through
 * this module's static import even when every command ran locally. For a tool
 * that executes infrastructure commands, the amount of third-party code on the
 * critical path is an attack-surface question, not a styling one: the local
 * path now loads zero external modules, and ssh2 enters the process only when
 * an SSH target is actually used. ssh2 is CommonJS, so a require gives us the
 * synchronous load its callers expect.
 */
const requireModule = createRequire(import.meta.url)
type SSHTransportModule = Pick<typeof import('ssh2'), 'Client' | 'BaseAgent'>
let ssh2Module: SSHTransportModule | null = null
const loadSSH2 = (): SSHTransportModule => {
  ssh2Module ??= requireModule('ssh2') as SSHTransportModule
  return ssh2Module
}

/** Adapt the Xec agent contract; callers never inherit a transport-library class. */
function adaptAgent(agent: string | SSHAgent | undefined): string | SSHAgent | undefined {
  if (!agent || typeof agent === 'string') return agent
  const delegate = agent
  const { BaseAgent } = loadSSH2()
  class AgentBridge extends BaseAgent {
    override getIdentities: SSHAgent['getIdentities'] = callback => delegate.getIdentities(callback)
    override sign(key: SSHParsedKey | Buffer | string, data: Buffer, options: SSHSigningRequestOptions | SSHSignCallback, callback?: SSHSignCallback): void {
      if (typeof options === 'function') delegate.sign(key, data, {}, options)
      else delegate.sign(key, data, options, callback ?? (() => {}))
    }
    override getStream: SSHAgent['getStream'] = callback => {
      if (delegate.getStream) delegate.getStream(callback)
      else callback(new SSHError('This SSH agent does not support forwarding', 'ENOTSUP'))
    }
  }
  return new AgentBridge()
}

import { escapeUnix } from '../../utils/shell-escape.js'
import { manageSFTP, type SFTPRequestOptions } from './sftp-lifecycle.js'
import { SSHError, requestResource, watchConnection, connectionFailure, type SSHRequestOptions } from './request-lifecycle.js'

export { SSHError } from './request-lifecycle.js'
export type { SFTPRequestOptions } from './sftp-lifecycle.js'
export type { SSHRequestOptions } from './request-lifecycle.js'
import { KnownHostsVerifier } from './known-hosts.js'
import { MaxBufferExceededError, ExecutionOutcomeUnknownError } from '../../core/error.js'

// Helper functions to replace external dependencies
function isReadableStream(obj: any): obj is stream.Readable {
  return obj !== null &&
    typeof obj === 'object' &&
    typeof obj.pipe === 'function' &&
    obj.readable !== false &&
    typeof obj._read === 'function' &&
    typeof obj._readableState === 'object';
}

class PromiseQueue {
  private running = 0
  private queue: Array<() => void> = []
  private readonly concurrency: number
  private readonly maxPending: number

  constructor({ concurrency = 1, maxPending = Number.MAX_SAFE_INTEGER }: { concurrency?: number; maxPending?: number }) {
    invariant(Number.isInteger(concurrency) && concurrency > 0, 'concurrency must be a positive integer')
    this.concurrency = concurrency
    this.maxPending = maxPending
  }

  add<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new SSHError('SSH operation cancelled', 'ABORT_ERR'))
    if (this.queue.length >= this.maxPending) return Promise.reject(new SSHError('SSH pending channel limit exceeded', 'ENOBUFS'))
    return new Promise((resolve, reject) => {
      const cancelled = () => {
        const index = this.queue.indexOf(run)
        if (index < 0) return
        this.queue.splice(index, 1)
        signal?.removeEventListener('abort', cancelled)
        reject(new SSHError('SSH operation cancelled before dispatch', 'ABORT_ERR'))
        this.processQueue()
      }
      const run = () => {
        signal?.removeEventListener('abort', cancelled)
        this.running++
        void Promise.resolve().then(() => {
          if (signal?.aborted) throw new SSHError('SSH operation cancelled before dispatch', 'ABORT_ERR')
          return fn()
        }).then(resolve, reject).finally(() => { this.running--; this.processQueue() })
      }
      if (this.running < this.concurrency) run()
      else { this.queue.push(run); signal?.addEventListener('abort', cancelled, { once: true }) }
    })
  }

  private processQueue(): void {
    while (this.queue.length && this.running < this.concurrency) this.queue.shift()!()
  }

}

async function transferBatch<T>(items: T[], concurrency: number, transfer: (item: T) => Promise<void>): Promise<void> {
  invariant(Number.isInteger(concurrency) && concurrency > 0, 'concurrency must be a positive integer')
  let next = 0
  const failures: unknown[] = []
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failures.length && next < items.length) {
      const item = items[next++]!
      try { await transfer(item) } catch (error) { failures.push(error) }
    }
  }))
  if (failures.length === 1) throw failures[0]
  if (failures.length) throw new AggregateError(failures, 'SSH file transfer failed')
}

/** Compatibility alias for the Xec connection contract. */
export type Config = SSHConnectionConfig

export interface SSHExecCommandOptions {
  cwd?: string
  /** Cancellation covers both waiting for a channel slot and execution. */
  signal?: AbortSignal
  /** Deadline for the server to acknowledge the exec request, not command duration. */
  channelOpenTimeoutMs?: number
  /** Per-stream retained output limit; defaults to 10 MiB. */
  maxBuffer?: number
  stdin?: string | Buffer | stream.Readable
  execOptions?: ExecOptions
  encoding?: BufferEncoding
  noTrim?: boolean
  /** Disable retention when a streaming consumer owns the output. */
  collectStdout?: boolean
  collectStderr?: boolean
  onChannel?: (clientChannel: ClientChannel) => void
  onStdout?: (chunk: Buffer) => void
  onStderr?: (chunk: Buffer) => void
}

export interface SSHExecCommandResponse {
  stdout: string
  stderr: string
  code: number | null
  signal: string | null
}

export interface SSHExecOptions extends SSHExecCommandOptions {
  stream?: 'stdout' | 'stderr' | 'both'
}

export interface SSHPutFilesOptions extends SFTPRequestOptions {
  sftp?: SFTPWrapper | null
  concurrency?: number
  transferOptions?: TransferOptions
}

export interface SSHGetPutDirectoryOptions extends SSHPutFilesOptions {
  tick?: (localFile: string, remoteFile: string, error: Error | null) => void
  validate?: (path: string) => boolean
  recursive?: boolean
}

type SSHMkdirMethod = 'sftp' | 'exec'

type SSHForwardInListener = (
  details: TcpConnectionDetails,
  accept: AcceptConnection<ClientChannel>,
  reject: RejectConnection,
) => void
export interface SSHForwardInDetails {
  closed: Promise<void>
  dispose(): Promise<void>
  port: number
}

type SSHForwardInStreamLocalListener = (
  info: UNIXConnectionDetails,
  accept: AcceptConnection,
  reject: RejectConnection,
) => void
interface SSHForwardInStreamLocalDetails {
  closed: Promise<void>
  dispose(): Promise<void>
}

const DEFAULT_CONCURRENCY = 1
const DEFAULT_VALIDATE = () => true
const DEFAULT_TICK = () => {
  /* No Op */
}


function unixifyPath(path: string) {
  if (path.includes('\\')) {
    return path.split('\\').join('/')
  }
  return path
}

async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8')
}

const SFTP_MKDIR_ERR_CODE_REGEXP = /Error: (E[\S]+): /
async function makeDirectoryWithSftp(path: string, sftp: SFTPWrapper) {
  let stats: Stats | null = null
  try {
    stats = await new Promise((resolve, reject) => {
      sftp.stat(path, (err, res) => {
        if (err) {
          reject(err)
        } else {
          resolve(res)
        }
      })
    })
  } catch (error) {
    const code = (error as { code?: number | string }).code
    if (code !== 2 && code !== 'ENOENT') throw error
  }
  if (stats) {
    if (stats.isDirectory()) {
      // Already exists, nothing to worry about
      return
    }
    throw new Error('mkdir() failed, target already exists and is not a directory')
  }
  try {
    await new Promise<void>((resolve, reject) => {
      sftp.mkdir(path, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  } catch (err: any) {
    if (err != null && typeof err.stack === 'string') {
      const matches = SFTP_MKDIR_ERR_CODE_REGEXP.exec(err.stack)
      if (matches != null) {
        throw new SSHError(err.message, matches[1])
      }
    }
    throw err
  }
}

export class NodeSSH {
  private transport: Client | null = null
  private lifecycle: EventEmitter | null = null

  /** Connection lifecycle events only; the underlying SSH transport is private. */
  get connection(): Pick<EventEmitter, 'on' | 'once' | 'off' | 'removeListener'> | null {
    return this.transport ? this.lifecycle : null
  }

  /**
   * Session channels in flight over this connection.
   *
   * sshd grants at most MaxSessions concurrent sessions per connection —
   * 10 by default — and refuses the rest with a hard "Channel open
   * failure". A parallel fan-out through one pooled connection hit that
   * ceiling as an ordinary race. Callers queue here instead: eight keeps
   * two grants in hand for anything else the connection carries (an SFTP
   * subsystem is a session too).
   */
  private channelQueue = new PromiseQueue({ concurrency: 8, maxPending: 256 })

  private getConnection(): Client {
    const connection = this.transport
    if (connection == null) {
      throw new Error('Not connected to server')
    }

    return connection
  }

  /** Inspect a host key before authentication. The observation must be verified independently. */
  static async probeHostKey(options: { host: string; port?: number; timeoutMs?: number; signal?: AbortSignal }): Promise<string> {
    const ssh = new NodeSSH()
    let fingerprint: string | undefined
    try {
      await ssh.connect({ host: options.host, port: options.port ?? 22, username: 'xec-host-key-probe',
        readyTimeout: options.timeoutMs ?? 10000,
        ...(options.signal ? { signal: options.signal } : {}),
        hostVerifier: (key: Buffer) => {
          fingerprint = sshHostFingerprint(key)
          return false // Stop before sending any authentication request or credential.
        },
      })
    } catch (error) {
      if (!fingerprint) throw error
    } finally { ssh.dispose(true) }
    if (!fingerprint) throw new SSHError('The server did not present a host key', 'EHOSTKEY')
    return fingerprint
  }

  public async connect(givenConfig: Config): Promise<this> {
    invariant(givenConfig != null && typeof givenConfig === 'object', 'config must be a valid object')

    const config: Config = { ...givenConfig }
    if (config.expectedHostFingerprint !== undefined) {
      invariant(/^SHA256:[A-Za-z0-9+/]{43}$/.test(config.expectedHostFingerprint), 'Invalid SSH host fingerprint')
      invariant(!config.hostVerifier, 'expectedHostFingerprint cannot be combined with hostVerifier')
    }

    invariant(config.username != null && typeof config.username === 'string', 'config.username must be a valid string')

    if (config.host != null) {
      invariant(typeof config.host === 'string', 'config.host must be a valid string')
    } else if (config.sock != null) {
      invariant(typeof config.sock === 'object', 'config.sock must be a valid object')
    } else {
      throw new AssertionError({ message: 'Either config.host or config.sock must be provided' })
    }

    if (config.privateKey != null || config.privateKeyPath != null) {
      if (config.privateKey != null) {
        invariant(typeof config.privateKey === 'string' || Buffer.isBuffer(config.privateKey), 'privateKey must be a string or Buffer')
        invariant(
          config.privateKeyPath == null,
          'config.privateKeyPath must not be specified when config.privateKey is specified',
        )
      } else if (config.privateKeyPath != null) {
        invariant(typeof config.privateKeyPath === 'string', 'config.privateKeyPath must be a valid string')
        invariant(
          config.privateKey == null,
          'config.privateKey must not be specified when config.privateKeyPath is specified',
        )
      }

      invariant(
        config.passphrase == null || typeof config.passphrase === 'string' || Buffer.isBuffer(config.passphrase),
        'config.passphrase must be null or a valid string',
      )

      if (config.privateKeyPath != null) {
        // Must be an fs path
        try {
          config.privateKey = await readFile(config.privateKeyPath)
        } catch (err: any) {
          if (err != null && err.code === 'ENOENT') {
            throw new AssertionError({ message: 'config.privateKeyPath does not exist at given fs path' })
          }
          throw err
        }
      }
    } else if (config.password != null) {
      invariant(typeof config.password === 'string', 'config.password must be a valid string')
    }

    if (config.tryKeyboard != null) {
      invariant(typeof config.tryKeyboard === 'boolean', 'config.tryKeyboard must be a valid boolean')
    }
    if (config.tryKeyboard) {
      const { password } = config
      if (config.onKeyboardInteractive != null) {
        invariant(
          typeof config.onKeyboardInteractive === 'function',
          'config.onKeyboardInteractive must be a valid function',
        )
      } else if (password != null) {
        config.onKeyboardInteractive = (name, instructions, instructionsLang, prompts, finish) => {
          if (prompts.length > 0 && prompts[0]?.prompt.toLowerCase().includes('password')) {
            finish([password])
          }
        }
      }
    }

    if (config.signal?.aborted) throw new SSHError('SSH connection cancelled', 'ABORT_ERR')
    invariant(this.transport === null, 'Dispose the existing SSH connection before connecting again')
    const connection = new (loadSSH2().Client)()
    this.transport = connection
    // Retain terminal evidence across the gap between opening and handing off a resource.
    watchConnection(connection, () => {})
    const lifecycle = new EventEmitter()
    lifecycle.on('error', () => {})
    this.lifecycle = lifecycle
    for (const event of ['error', 'close', 'end', 'ready', 'banner', 'greeting', 'handshake', 'change password', 'x11'] as const) {
      connection.on(event as 'error', (...args: unknown[]) => { lifecycle.emit(event, ...args) })
    }

    // Verify the server's host key. Without this ssh2 accepts whatever key is
    // presented, which makes every session interceptable.
    let hostKeyRejection: Error | null = null

    if (config.expectedHostFingerprint) {
      // Pins are computed from the raw key, independent of a caller's hostHash option.
      delete config.hostHash
      config.hostVerifier = (key: Buffer) => {
        const matches = sshHostFingerprint(key) === config.expectedHostFingerprint
        if (!matches) hostKeyRejection = new SSHError('SSH host key does not match the pinned fingerprint', 'EHOSTKEY')
        return matches
      }
    }
    if (!config.hostVerifier) {
      // Xec verifies the public key blob, never a hash with caller-selected encoding.
      delete config.hostHash
      const verifier = new KnownHostsVerifier(
        config.hostKeyChecking ?? 'accept-new',
        config.knownHostsPath,
      )
      const host = typeof config.host === 'string' ? config.host : 'localhost'
      const port = typeof config.port === 'number' ? config.port : 22

      config.hostVerifier = (key: Buffer, callback: (valid: boolean) => void) => {
        verifier
          .verify(host, port, key)
          .then(verdict => {
            if (!verdict.ok) {
              // ssh2 reports a rejected key as a generic handshake failure, so
              // the actionable message is kept and rethrown below.
              hostKeyRejection = new SSHError(verdict.message, 'EHOSTKEY')
            }
            callback(verdict.ok)
          })
          .catch(error => {
            hostKeyRejection = error instanceof Error ? error : new Error(String(error))
            callback(false)
          })
      }
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const signal = config.signal
        const cancelled = () => { connection.destroy(); reject(new SSHError('SSH connection cancelled', 'ABORT_ERR')) }
        const cleanup = () => signal?.removeEventListener('abort', cancelled)
        signal?.addEventListener('abort', cancelled, { once: true })
        // Keep an error listener after ready: a transport error must never become uncaught.
        connection.on('error', error => { cleanup(); reject(hostKeyRejection ?? error) })
        if (config.onKeyboardInteractive) connection.on('keyboard-interactive', config.onKeyboardInteractive)
        connection.once('ready', () => { cleanup(); resolve() })
        connection.once('end', () => { if (this.transport === connection) this.transport = null })
        connection.once('close', () => {
          cleanup()
          if (this.transport === connection) this.transport = null
          reject(new SSHError('No response from server', 'ETIMEDOUT'))
        })
        const { signal: _signal, ...wireConfig } = config
        wireConfig.agent = adaptAgent(config.agent)
        const adaptMethod = (method: SSHAuthenticationType | SSHAuthMethod | false) =>
          typeof method === 'object' && method.type === 'agent'
            ? { ...method, agent: adaptAgent((method as SSHAgentAuthMethod).agent) } : method
        if (Array.isArray(config.authHandler)) wireConfig.authHandler = config.authHandler.map(adaptMethod) as Config['authHandler']
        else if (config.authHandler) {
          const handler = config.authHandler
          wireConfig.authHandler = (left, partial, next) => handler(left, partial, method => next(adaptMethod(method) as typeof method))
        }
        connection.connect(wireConfig as ConnectConfig)
      })
    } catch (error) {
      connection.destroy()
      if (this.transport === connection) this.transport = null
      throw error
    }

    return this
  }

  public isConnected(): boolean {
    return this.transport != null
  }

  async requestShell(
    options?: PseudoTtyOptions | ShellOptions | false,
    request: SSHRequestOptions = {},
  ): Promise<ClientChannel> {
    const connection = this.getConnection()
    return requestResource(connection, 'SSH shell request', request, done => {
      if (options == null) connection.shell(done)
      else connection.shell(options as never, done)
    }, channel => { channel.on('error', () => {}); channel.destroy() })
  }

  async withShell<T>(
    callback: (channel: ClientChannel) => Promise<T>,
    options?: PseudoTtyOptions | ShellOptions | false,
    request: SSHRequestOptions = {},
  ): Promise<T> {
    invariant(typeof callback === 'function', 'callback must be a valid function')

    const shell = await this.requestShell(options, request)
    try {
      return await callback(shell)
    } finally {
      shell.destroy()
    }
  }

  async requestSubsystem(name: string, request: SSHRequestOptions = {}): Promise<ClientChannel> {
    invariant(typeof name === 'string' && name.length > 0, 'subsystem name must not be empty')
    const connection = this.getConnection()
    return requestResource(connection, 'SSH subsystem request', request, done => connection.subsys(name, done),
      late => { late.on('error', () => {}); late.destroy() })
  }

  setNoDelay(enabled = true): this {
    this.getConnection().setNoDelay(enabled)
    return this
  }

  /** Irreversibly refuse new sessions on this connection while retaining existing channels. */
  async denyNewSessions(request: SSHRequestOptions = {}): Promise<void> {
    const connection = this.getConnection()
    await requestResource(connection, 'SSH session restriction', request,
      done => connection.openssh_noMoreSessions(error => done(error, true)), () => {})
  }

  async requestSFTP(request: SFTPRequestOptions = {}): Promise<SFTPWrapper> {
    const connection = this.getConnection()
    const sftp = await requestResource<SFTPWrapper>(connection, 'SSH SFTP request', request,
      done => connection.sftp(done), late => { late.on('error', () => {}); late.destroy() })
    return manageSFTP(sftp, connection, request)
  }

  async withSFTP<T>(callback: (sftp: SFTPWrapper) => Promise<T>, request: SFTPRequestOptions = {}): Promise<T> {
    invariant(typeof callback === 'function', 'callback must be a valid function')

    const sftp = await this.requestSFTP(request)
    try {
      return await callback(sftp)
    } finally {
      sftp.end()
    }
  }

  async execCommand(givenCommand: string, options: SSHExecCommandOptions = {}): Promise<SSHExecCommandResponse> {
    invariant(typeof givenCommand === 'string', 'command must be a valid string')
    invariant(options != null && typeof options === 'object', 'options must be a valid object')
    invariant(options.cwd == null || typeof options.cwd === 'string', 'options.cwd must be a valid string')
    invariant(
      options.stdin == null || typeof options.stdin === 'string' || Buffer.isBuffer(options.stdin) || isReadableStream(options.stdin),
      'options.stdin must be a valid string or readable stream',
    )
    invariant(
      options.execOptions == null || typeof options.execOptions === 'object',
      'options.execOptions must be a valid object',
    )
    invariant(options.encoding == null || typeof options.encoding === 'string', 'options.encoding must be a valid string')
    invariant(
      options.onChannel == null || typeof options.onChannel === 'function',
      'options.onChannel must be a valid function',
    )
    invariant(
      options.onStdout == null || typeof options.onStdout === 'function',
      'options.onStdout must be a valid function',
    )
    invariant(
      options.onStderr == null || typeof options.onStderr === 'function',
      'options.onStderr must be a valid function',
    )
    invariant(options.noTrim == null || typeof options.noTrim === 'boolean', 'options.noTrim must be a boolean')

    let command = givenCommand

    if (options.cwd) {
      command = `cd ${escapeUnix([options.cwd])} && ${command}`
    }
    const connection = this.getConnection()

    // The slot is held from channel open to channel close — the server
    // counts live sessions, not open attempts. On top of the queue, a
    // refusal is retried a few times with a pause: a server configured
    // below our own cap (MaxSessions 2 exists in the wild) refuses even
    // queued openings, and those grants free up as siblings close.
    const attemptExec = (attempt: number): Promise<SSHExecCommandResponse> =>
      this.channelQueue.add(() => {
        if (this.transport !== connection || connectionFailure(connection)) throw new SSHError('SSH connection closed before dispatch', 'ECONNRESET')
        return this.execOnChannel(connection, command, options)
      }, options.signal).catch(err => {
        const reason = err instanceof Error ? (err as Error & { reason?: number }).reason : undefined
        const refused = reason === 1 || reason === 4
        if (refused && attempt < 3) {
          return new Promise(resolve => setTimeout(resolve, 50 * 2 ** attempt)).then(() => attemptExec(attempt + 1))
        }
        throw err
      })

    return attemptExec(0)
  }

  private execOnChannel(
    connection: Client,
    command: string,
    options: SSHExecCommandOptions,
  ): Promise<SSHExecCommandResponse> {
    const output: { stdout: Buffer[]; stderr: Buffer[] } = { stdout: [], stderr: [] }
    const bytes = { stdout: 0, stderr: 0 }
    const maxBuffer = options.maxBuffer ?? 10 * 1024 * 1024
    const openTimeout = options.channelOpenTimeoutMs ?? 15000
    if (!Number.isSafeInteger(maxBuffer) || maxBuffer < 0 || !Number.isFinite(openTimeout) || openTimeout <= 0) {
      return Promise.reject(new SSHError('Invalid SSH execution limits', 'EINVAL'))
    }
    return new Promise((resolve, reject) => {
      let channel: ClientChannel | undefined
      let settled = false
      let code: number | null = null, signal: string | null = null
      const input = isReadableStream(options.stdin) ? options.stdin : undefined
      const ignoreLateError = () => {}
      const cleanup = () => {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', cancelled)
        unwatch()
        input?.off('error', failed)
        if (channel) {
          input?.unpipe(channel)
          channel.off('error', failed)
          channel.stderr.off('error', failed)
          // Late transport errors after disposal must not become uncaught.
          channel.on('error', ignoreLateError)
          channel.stderr.on('error', ignoreLateError)
          channel.off('data', stdout)
          channel.stderr.off('data', stderr)
          channel.off('exit', exited)
          channel.off('close', closed)
        }
      }
      const terminate = () => {
        if (!channel) return
        try { channel.signal('TERM') } catch { /* the peer may already be gone */ }
        try { channel.destroy() } catch { /* transport closure owns final cleanup */ }
      }
      const failed = (error: Error) => {
        if (settled) return
        settled = true; cleanup(); terminate(); reject(error)
      }
      const transportFailed = (error: Error) => failed(new ExecutionOutcomeUnknownError(error))
      const cancelled = () => failed(new SSHError('SSH execution cancelled; remote termination is not confirmed', 'ABORT_ERR'))
      const capture = (name: 'stdout' | 'stderr', chunk: Buffer) => {
        if (settled) return
        try {
          const collect = name === 'stdout' ? options.collectStdout !== false : options.collectStderr !== false
          if (collect) {
            if (bytes[name] + chunk.length > maxBuffer) throw new MaxBufferExceededError(maxBuffer, name)
            bytes[name] += chunk.length
            output[name].push(Buffer.from(chunk))
          }
          if (name === 'stdout') options.onStdout?.(chunk)
          else options.onStderr?.(chunk)
        } catch (error) { failed(error instanceof Error ? error : new Error(String(error))) }
      }
      const stdout = (chunk: Buffer) => capture('stdout', chunk)
      const stderr = (chunk: Buffer) => capture('stderr', chunk)
      const exited = (status: number | null, exitSignal: string | null) => { code = status ?? null; signal = exitSignal ?? null }
      const closed = (status?: number | null, exitSignal?: string | null) => {
        if (settled) return
        code ??= status ?? null; signal ??= exitSignal ?? null
        if (code === null && signal === null) { failed(new ExecutionOutcomeUnknownError()); return }
        settled = true; cleanup()
        const decode = (chunks: Buffer[]) => {
          const text = Buffer.concat(chunks).toString(options.encoding)
          return options.noTrim === true ? text : text.trim()
        }
        resolve({ code, signal, stdout: decode(output.stdout), stderr: decode(output.stderr) })
      }
      const timer = setTimeout(() => failed(new ExecutionOutcomeUnknownError(new SSHError('SSH exec acknowledgement timed out', 'ETIMEDOUT'))), openTimeout)
      const unwatch = watchConnection(connection, transportFailed)
      options.signal?.addEventListener('abort', cancelled, { once: true })
      if (options.signal?.aborted) { cancelled(); return }
      try {
        connection.exec(command, options.execOptions ?? {}, (error, opened) => {
          if (settled) { opened?.on('error', () => {}); opened?.destroy(); return }
          clearTimeout(timer)
          if (error) {
            const refused = (error as Error & { reason?: number }).reason !== undefined
            failed(refused ? error : new ExecutionOutcomeUnknownError(error)); return
          }
          channel = opened
          channel.on('error', failed)
          channel.stderr.on('error', failed)
          channel.on('data', stdout)
          channel.stderr.on('data', stderr)
          channel.on('exit', exited)
          channel.once('close', closed)
          try {
            options.onChannel?.(channel)
            if (settled) return
            if (input) { input.once('error', failed); input.pipe(channel) }
            else channel.end(options.stdin ?? undefined)
          } catch (callbackError) { failed(callbackError instanceof Error ? callbackError : new Error(String(callbackError))) }
        })
      } catch (error) { failed(error instanceof Error ? error : new Error(String(error))) }
    })
  }

  exec(command: string, parameters: string[], options?: SSHExecOptions & { stream?: 'stdout' | 'stderr' }): Promise<string>
  exec(command: string, parameters: string[], options?: SSHExecOptions & { stream: 'both' }): Promise<SSHExecCommandResponse>
  async exec(command: string, parameters: string[], options: SSHExecOptions = {}): Promise<SSHExecCommandResponse | string> {
    invariant(typeof command === 'string', 'command must be a valid string')
    invariant(Array.isArray(parameters), 'parameters must be a valid array')
    invariant(options != null && typeof options === 'object', 'options must be a valid object')
    invariant(
      options.stream == null || ['both', 'stdout', 'stderr'].includes(options.stream),
      'options.stream must be one of both, stdout, stderr',
    )
    for (let i = 0, { length } = parameters; i < length; i += 1) {
      invariant(typeof parameters[i] === 'string', `parameters[${i}] must be a valid string`)
    }

    const completeCommand = `${command}${parameters.length > 0 ? ` ${escapeUnix(parameters)}` : ''}`
    const response = await this.execCommand(completeCommand, options)

    if (options.stream == null || options.stream === 'stdout') {
      if (response.stderr) {
        throw new Error(response.stderr)
      }
      return response.stdout
    }
    if (options.stream === 'stderr') {
      return response.stderr
    }

    return response
  }

  async mkdir(path: string, method: SSHMkdirMethod = 'sftp', givenSftp: SFTPWrapper | null = null): Promise<void> {
    invariant(typeof path === 'string', 'path must be a valid string')
    invariant(typeof method === 'string' && (method === 'sftp' || method === 'exec'), 'method must be either sftp or exec')
    invariant(givenSftp == null || typeof givenSftp === 'object', 'sftp must be a valid object')

    if (method === 'exec') {
      await this.exec('mkdir', ['-p', unixifyPath(path)])
      return
    }
    const sftp = givenSftp || (await this.requestSFTP())

    const makeSftpDirectory = async (retry: boolean) =>
      makeDirectoryWithSftp(unixifyPath(path), sftp).catch(async (error: SSHError) => {
        if (!retry || error == null || (error.message !== 'No such file' && error.code !== 'ENOENT' && (error.code as unknown) !== 2)) {
          throw error
        }
        await this.mkdir(fsPath.dirname(path), 'sftp', sftp)
        await makeSftpDirectory(false)
      })

    try {
      await makeSftpDirectory(true)
    } finally {
      if (!givenSftp) {
        sftp.end()
      }
    }
  }

  async getFile(
    localFile: string,
    remoteFile: string,
    givenSftp: SFTPWrapper | null = null,
    transferOptions: TransferOptions | null = null,
  ): Promise<void> {
    invariant(typeof localFile === 'string', 'localFile must be a valid string')
    invariant(typeof remoteFile === 'string', 'remoteFile must be a valid string')
    invariant(givenSftp == null || typeof givenSftp === 'object', 'sftp must be a valid object')
    invariant(transferOptions == null || typeof transferOptions === 'object', 'transferOptions must be a valid object')

    const sftp = givenSftp || (await this.requestSFTP())

    try {
      await new Promise<void>((resolve, reject) => {
        sftp.fastGet(unixifyPath(remoteFile), localFile, transferOptions || {}, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })
    } finally {
      if (!givenSftp) {
        sftp.end()
      }
    }
  }

  async putFile(
    localFile: string,
    remoteFile: string,
    givenSftp: SFTPWrapper | null = null,
    transferOptions: TransferOptions | null = null,
  ): Promise<void> {
    invariant(typeof localFile === 'string', 'localFile must be a valid string')
    invariant(typeof remoteFile === 'string', 'remoteFile must be a valid string')
    invariant(givenSftp == null || typeof givenSftp === 'object', 'sftp must be a valid object')
    invariant(transferOptions == null || typeof transferOptions === 'object', 'transferOptions must be a valid object')
    try {
      await fs.access(localFile, fsConstants.R_OK)
    } catch {
      throw new Error(`localFile does not exist at ${localFile}`)
    }
    const sftp = givenSftp || (await this.requestSFTP())

    const putFile = (retry: boolean) => new Promise<void>((resolve, reject) => {
      sftp.fastPut(localFile, unixifyPath(remoteFile), transferOptions || {}, (err) => {
        if (err == null) {
          resolve()
          return
        }

        if ((err.message === 'No such file' || (err as Error & { code?: number }).code === 2) && retry) {
          resolve(this.mkdir(fsPath.dirname(remoteFile), 'sftp', sftp).then(() => putFile(false)))
        } else {
          reject(err)
        }
      })
    })

    try {
      await putFile(true)
    } finally {
      if (!givenSftp) {
        sftp.end()
      }
    }
  }

  async putFiles(
    files: { local: string; remote: string }[],
    { concurrency = DEFAULT_CONCURRENCY, sftp: givenSftp = null, transferOptions = {} }: SSHPutFilesOptions = {},
  ): Promise<void> {
    invariant(Array.isArray(files), 'files must be an array')

    for (let i = 0, { length } = files; i < length; i += 1) {
      const file = files[i]
      invariant(file, 'files items must be valid objects')
      invariant(file.local && typeof file.local === 'string', `files[${i}].local must be a string`)
      invariant(file.remote && typeof file.remote === 'string', `files[${i}].remote must be a string`)
    }

    const transferred: typeof files = []
    const sftp = givenSftp || (await this.requestSFTP())
    try {
      await transferBatch(files, concurrency, async file => {
        await this.putFile(file.local, file.remote, sftp, transferOptions)
        transferred.push(file)
      })
    } catch (error) {
      if (error instanceof Error) Object.assign(error, { transferred })
      throw error
    } finally { if (!givenSftp) sftp.end() }
  }

  async putDirectory(localDirectory: string, remoteDirectory: string, options: SSHGetPutDirectoryOptions = {}): Promise<boolean> {
    const { concurrency = DEFAULT_CONCURRENCY, sftp: givenSftp, transferOptions = {}, recursive = true,
      tick = DEFAULT_TICK, validate = DEFAULT_VALIDATE } = options
    invariant(typeof localDirectory === 'string' && localDirectory, 'localDirectory must be a string')
    invariant(typeof remoteDirectory === 'string' && remoteDirectory, 'remoteDirectory must be a string')
    invariant((await fs.stat(localDirectory)).isDirectory(), `localDirectory is not a directory at ${localDirectory}`)
    const scanned = await this.scanDirectory(localDirectory, { recursive, validate })
    const remotePath = (item: string) => fsPath.posix.join(unixifyPath(remoteDirectory), unixifyPath(fsPath.relative(localDirectory, item)))
    const sftp = givenSftp || (await this.requestSFTP(options))
    let failed = false
    try {
      await this.mkdir(remoteDirectory, 'sftp', sftp)
      await transferBatch(scanned.directories, concurrency, directory => this.mkdir(remotePath(directory), 'sftp', sftp))
      await transferBatch(scanned.files, concurrency, async localFile => {
        const remoteFile = remotePath(localFile)
        let failure: Error | null = null
        try { await this.putFile(localFile, remoteFile, sftp, transferOptions) }
        catch (error) { failed = true; failure = error as Error }
        tick(localFile, remoteFile, failure)
      })
    } finally { if (!givenSftp) sftp.end() }
    return !failed
  }

  async getDirectory(localDirectory: string, remoteDirectory: string, options: SSHGetPutDirectoryOptions = {}): Promise<boolean> {
    const { concurrency = DEFAULT_CONCURRENCY, sftp: givenSftp, transferOptions = {}, recursive = true,
      tick = DEFAULT_TICK, validate = DEFAULT_VALIDATE } = options
    invariant(typeof localDirectory === 'string' && localDirectory, 'localDirectory must be a string')
    invariant(typeof remoteDirectory === 'string' && remoteDirectory, 'remoteDirectory must be a string')
    const remoteRoot = unixifyPath(remoteDirectory)
    const localPath = (item: string) => fsPath.join(localDirectory, fsPath.posix.relative(remoteRoot, item))
    const sftp = givenSftp || (await this.requestSFTP(options))
    let failed = false
    try {
      const scanned = await this.scanDirectoryRemote(remoteRoot, { recursive, validate, fileSystem: sftp })
      await fs.mkdir(localDirectory, { recursive: true })
      await transferBatch(scanned.directories, concurrency, async directory => { await fs.mkdir(localPath(directory), { recursive: true }) })
      await transferBatch(scanned.files, concurrency, async remoteFile => {
        const localFile = localPath(remoteFile)
        let failure: Error | null = null
        try { await this.getFile(localFile, remoteFile, sftp, transferOptions) }
        catch (error) { failed = true; failure = error as Error }
        tick(localFile, remoteFile, failure)
      })
    } finally { if (!givenSftp) sftp.end() }
    return !failed
  }

  forwardIn(remoteAddr: string, remotePort: number, onConnection?: SSHForwardInListener): Promise<SSHForwardInDetails> {
    const connection = this.getConnection()

    return new Promise((resolve, reject) => {
      connection.forwardIn(remoteAddr, remotePort, (error, port) => {
        if (error) {
          reject(error)
          return
        }

        const handler: SSHForwardInListener = (details, acceptConnection, rejectConnection) => {
          if (details.destIP === remoteAddr && details.destPort === port) {
            onConnection?.(details, acceptConnection, rejectConnection)
          }
        }

        const lifecycle = this.manageRemoteForward(connection, 'tcp connection', onConnection ? handler : undefined,
          done => connection.unforwardIn(remoteAddr, port, done))
        resolve({ port, ...lifecycle })
      })
    })
  }

  /** A failed unbind retains the listener and remains retryable; transport loss releases local ownership. */
  private manageRemoteForward(
    connection: Client,
    event: 'tcp connection' | 'unix connection',
    handler: ((...args: any[]) => void) | undefined,
    unbind: (done: (error?: Error | null) => void) => void,
  ): { dispose(): Promise<void>; closed: Promise<void> } {
    let finished = false
    let closing: Promise<void> | undefined
    let resolveClosed!: () => void
    let pendingFinish: (() => void) | undefined
    const closed = new Promise<void>(resolve => { resolveClosed = resolve })
    const release = () => {
      if (finished) return
      finished = true
      if (handler) connection.off(event, handler)
      connection.off('close', release)
      resolveClosed()
      pendingFinish?.()
    }
    if (handler) {
      if (event === 'tcp connection') connection.on(event, handler)
      else connection.on(event, handler)
    }
    connection.once('close', release)
    return { closed, dispose: () => {
      if (finished) return Promise.resolve()
      closing ??= new Promise<void>((resolve, reject) => {
        let settled = false
        const complete = (error?: Error | null) => {
          if (settled) {
            // A delayed successful acknowledgement still confirms closure,
            // including when a retry is already waiting for the same listener.
            if (!error) release()
            return
          }
          settled = true
          clearTimeout(timer)
          pendingFinish = undefined
          if (error) {
            reject(error)
            return
          }
          release()
          resolve()
        }
        const timer = setTimeout(() => complete(new SSHError('Remote forward closure is unconfirmed', 'ETIMEDOUT')), 15000)
        pendingFinish = () => complete()
        try { unbind(complete) } catch (error) { complete(error instanceof Error ? error : new Error(String(error))) }
      }).catch(error => { closing = undefined; throw error })
      return closing
    } }
  }

  forwardOut(
    srcIP: string, srcPort: number, dstIP: string, dstPort: number,
    request: SSHRequestOptions = {},
  ): Promise<Channel> {
    const connection = this.getConnection()
    return requestResource<Channel>(connection, 'SSH forward', request,
      done => connection.forwardOut(srcIP, srcPort, dstIP, dstPort, done),
      late => { late.on('error', () => {}); late.destroy() })
  }

  forwardInStreamLocal(
    socketPath: string,
    onConnection?: SSHForwardInStreamLocalListener,
  ): Promise<SSHForwardInStreamLocalDetails> {
    const connection = this.getConnection()

    return new Promise((resolve, reject) => {
      connection.openssh_forwardInStreamLocal(socketPath, (error) => {
        if (error) {
          reject(error)
          return
        }

        const handler: SSHForwardInStreamLocalListener = (details, acceptConnection, rejectConnection) => {
          if (details.socketPath === socketPath) {
            onConnection?.(details, acceptConnection, rejectConnection)
          }
        }

        resolve(this.manageRemoteForward(connection, 'unix connection', onConnection ? handler : undefined,
          done => connection.openssh_unforwardInStreamLocal(socketPath, done)))
      })
    })
  }

  forwardOutStreamLocal(socketPath: string, request: SSHRequestOptions = {}): Promise<Channel> {
    const connection = this.getConnection()
    return requestResource<Channel>(connection, 'SSH Unix forward', request,
      done => connection.openssh_forwardOutStreamLocal(socketPath, done),
      late => { late.on('error', () => {}); late.destroy() })
  }

  dispose(force = false): void {
    const connection = this.transport
    if (!connection) return
    this.transport = null
    if (force) { connection.destroy(); return }
    // A peer that never finishes graceful shutdown must not retain a socket forever.
    const timer = setTimeout(() => connection.destroy(), 1000)
    timer.unref()
    connection.once('close', () => clearTimeout(timer))
    connection.end()
  }

  /**
   * Create a local port forward (tunnel)
   * This creates a local server that forwards connections to a remote host/port
   */
  async createTunnel(options: {
    localPort?: number;
    localHost?: string;
    remoteHost: string;
    remotePort: number;
  }): Promise<{
    localPort: number;
    localHost: string;
    remoteHost: string;
    remotePort: number;
    closed: Promise<void>;
    close: () => Promise<void>;
  }> {
    const connection = this.getConnection();
    const localHost = options.localHost ?? '127.0.0.1';
    const net = await import('node:net');
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      const sockets = new Map<import('node:net').Socket, Channel | null>();
      const controller = new AbortController();
      let closing = false;
      let listenSettled = false;
      let finishClosed!: () => void;
      const closed = new Promise<void>(done => { finishClosed = done; });
      const stopServer = () => {
        if (!server.listening) { finishClosed(); return; }
        server.close(() => finishClosed());
      };
      const close = () => {
        if (closing) return closed;
        closing = true;
        connection.removeListener('close', transportClosed);
        connection.removeListener('error', transportClosed);
        controller.abort();
        for (const [socket, channel] of sockets) {
          socket.destroy();
          channel?.destroy();
        }
        sockets.clear();
        // end() only sends FIN: a half-open peer can otherwise hold close forever.
        if (listenSettled) stopServer();
        return closed;
      };
      const transportClosed = () => { void close(); };
      connection.once('close', transportClosed);
      connection.once('error', transportClosed);
      server.on('connection', socket => {
        if (closing) { socket.destroy(); return; }
        sockets.set(socket, null);
        socket.on('error', () => socket.destroy());
        socket.once('close', () => {
          sockets.get(socket)?.destroy();
          sockets.delete(socket);
        });
        void this.forwardOut(socket.remoteAddress ?? '127.0.0.1', socket.remotePort ?? 0,
          options.remoteHost, options.remotePort, { signal: controller.signal }).then(channel => {
          if (closing || socket.destroyed) { channel.destroy(); return; }
          sockets.set(socket, channel);
          channel.on('error', () => { socket.destroy(); channel.destroy(); });
          channel.once('close', () => socket.destroy());
          socket.pipe(channel).pipe(socket);
        }).catch(() => socket.destroy());
      });
      server.once('error', error => {
        listenSettled = true;
        reject(error);
        void close();
        finishClosed();
      });
      server.listen(options.localPort ?? 0, localHost, () => {
        listenSettled = true;
        if (closing) {
          stopServer();
          reject(new SSHError('Connection closed while opening tunnel', 'ECONNRESET'));
          return;
        }
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to get tunnel address'));
          void close();
          return;
        }
        resolve({ localPort: address.port, localHost, remoteHost: options.remoteHost,
          remotePort: options.remotePort, closed, close });
      });
    });
  }

  // Helper method to scan local directory
  private async scanDirectory(
    directory: string,
    options: {
      recursive?: boolean;
      validate?: (item: string) => boolean;
    } = {}
  ): Promise<{ files: string[]; directories: string[] }> {
    const files: string[] = [];
    const directories: string[] = [];

    async function scan(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = fsPath.join(dir, entry.name);

        if (options.validate && !options.validate(fullPath)) {
          continue;
        }

        if (entry.isDirectory()) {
          directories.push(fullPath);
          if (options.recursive) {
            await scan(fullPath);
          }
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    }

    await scan(directory);
    return { files, directories };
  }

  private async scanDirectoryRemote(
    directory: string,
    options: { recursive?: boolean; validate?: (item: string) => boolean; fileSystem: SFTPWrapper },
  ): Promise<{ files: string[]; directories: string[] }> {
    const files: string[] = [], directories: string[] = []
    async function scan(dir: string): Promise<void> {
      const list = await new Promise<import('./contracts.js').SFTPEntry[]>((resolve, reject) =>
        options.fileSystem.readdir(dir, (error, entries) => error ? reject(error) : resolve(entries)))
      for (const item of list) {
        if (item.filename === '.' || item.filename === '..') continue
        if (!item.filename || (/[\\/]/.test(item.filename) || item.filename.includes('\0'))) throw new SSHError('Invalid path component in SFTP directory response', 'EPROTO')
        const fullPath = fsPath.posix.join(dir, item.filename)
        if (options.validate && !options.validate(fullPath)) continue
        if (item.attrs.isDirectory()) {
          directories.push(fullPath)
          if (options.recursive) await scan(fullPath)
        } else if (item.attrs.isFile()) files.push(fullPath)
      }
    }
    await scan(directory)
    return { files, directories }
  }
}

/** OpenSSH-compatible fingerprint of the server's public key blob. */
export function sshHostFingerprint(key: Buffer): string {
  return `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`
}
