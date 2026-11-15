import type { EventEmitter } from 'node:events';
/**
 * Xec-owned SSH client contracts. Consumers need only Xec and Node.js types.
 * Wire-compatible declarations adapted from DefinitelyTyped (MIT); see SSH-TYPES-LICENSE.
 * These describe public protocol capabilities, not the underlying client implementation.
 */
import type { HostKeyChecking } from './known-hosts.js';
import type { Duplex, Readable, Writable, DuplexEventMap, ReadableOptions, WritableOptions, ReadableEventMap, WritableEventMap } from 'node:stream';

export interface SSHPrompt {
    prompt: string;
    echo?: boolean;
}

export type SSHKexAlgorithm =
    | "curve25519-sha256"
    | "ecdh-sha2-nistp256"
    | "ecdh-sha2-nistp384"
    | "ecdh-sha2-nistp521"
    | "diffie-hellman-group14-sha256"
    | "diffie-hellman-group16-sha512"
;

export type SSHServerHostKeyAlgorithm =
    | "ssh-ed25519"
    | "ecdsa-sha2-nistp256"
    | "ecdsa-sha2-nistp384"
    | "ecdsa-sha2-nistp521"
    | "rsa-sha2-512"
    | "rsa-sha2-256"
;

export type SSHCompressionAlgorithm = "none";

export type SSHCipherAlgorithm =
    | "chacha20-poly1305@openssh.com"
    | "aes128-gcm@openssh.com"
    | "aes256-gcm@openssh.com"
;

export type SSHMacAlgorithm =
    | "hmac-sha2-256-etm@openssh.com"
    | "hmac-sha2-512-etm@openssh.com"
;

export type SSHAlgorithmList<T> = T[] | Partial<Record<"append" | "prepend" | "remove", T | T[]>>;

export interface SSHAlgorithms {
    kex?: SSHAlgorithmList<SSHKexAlgorithm>;
    cipher?: SSHAlgorithmList<SSHCipherAlgorithm>;
    serverHostKey?: SSHAlgorithmList<SSHServerHostKeyAlgorithm>;
    hmac?: SSHAlgorithmList<SSHMacAlgorithm>;
    compress?: SSHAlgorithmList<SSHCompressionAlgorithm>;
}

export type SSHKeyType =
    | "ssh-rsa"
    | "ssh-ed25519"
    | "ecdsa-sha2-nistp256"
    | "ecdsa-sha2-nistp384"
    | "ecdsa-sha2-nistp521";

export interface SSHParsedKey {
    type: SSHKeyType;
    comment: string;
    sign(data: Buffer | string, algo?: string): Buffer | Error;
    verify(data: Buffer | string, signature: Buffer, algo?: string): boolean | Error;
    isPrivateKey(): boolean;
    getPrivatePEM(): string | null;
    getPublicPEM(): string;
    getPublicSSH(): Buffer;
    equals(key: Buffer | string | SSHParsedKey): boolean;
}

export type SSHOpenMode = "r" | "r+" | "w" | "wx" | "xw" | "w+" | "xw+" | "a" | "ax" | "xa" | "a+" | "ax+" | "xa+";

export type SSHChannelType = "session" | "sftp" | "direct-tcpip" | "direct-streamlocal@openssh.com";

export type SSHChannelSubType = "exec" | "shell";

export interface SSHChannelEvents extends Omit<DuplexEventMap, 'data' | 'close'> {
    data: [chunk: Buffer];
    close: [code?: number | null, signal?: string | null];
    eof: [];
    exit: [code: number | null, signal?: string | null, coreDumped?: boolean, description?: string];
}

export interface SSHForwardChannel extends Duplex {
    stdin: this;
    stdout: this;
    stderr: Writable | Readable;
    server: boolean;
    type: SSHChannelType;
    subtype?: SSHChannelSubType;
    eof(): void;
    close(): void;
    destroy(): this;
    setWindow(rows: number, cols: number, height: number, width: number): void;
    signal(signalName: string): void;
    on<E extends keyof SSHChannelEvents>(event: E, listener: (...args: SSHChannelEvents[E]) => void): this;
    on(event: string | symbol, listener: (...args: unknown[]) => void): this;
    once<E extends keyof SSHChannelEvents>(event: E, listener: (...args: SSHChannelEvents[E]) => void): this;
    once(event: string | symbol, listener: (...args: unknown[]) => void): this;
    off<E extends keyof SSHChannelEvents>(event: E, listener: (...args: SSHChannelEvents[E]) => void): this;
    off(event: string | symbol, listener: (...args: unknown[]) => void): this;
}

export interface SSHChannel extends SSHForwardChannel {
    stderr: Readable;
    server: false;
}

export type SSHAcceptConnection<T extends SSHForwardChannel = SSHForwardChannel> = () => T;

export type SSHRejectConnection = () => void;

/** Receives the raw host key before authentication, and on trust revalidation. */
export type SSHHostVerifier = (key: Buffer) => boolean | Promise<boolean>;

export type SSHDebugFunction = (message: string) => void;

export type SSHAuthenticationType = "password" | "publickey" | "hostbased" | "agent" | "keyboard-interactive" | "none";

export interface SSHConnectionConfig {
    /** Cancel an in-flight handshake; cancellation does not retry authentication. */
    signal?: AbortSignal;
    /** Independently verified OpenSSH SHA256 pin; exclusive with hostVerifier. */
    expectedHostFingerprint?: string;
    hostKeyChecking?: HostKeyChecking;
    knownHostsPath?: string;
    privateKeyPath?: string;
    onKeyboardInteractive?: (name: string, instructions: string, lang: string, prompts: SSHPrompt[], finish: (responses: string[]) => void) => void;

    host?: string;
    port?: number;
    forceIPv4?: boolean;
    forceIPv6?: boolean;
    hostVerifier?: SSHHostVerifier;
    username?: string;
    password?: string;
    agent?: SSHAgent | string;
    privateKey?: Buffer | string;
    passphrase?: Buffer | string;
    localHostname?: string;
    localUsername?: string;
    tryKeyboard?: boolean;
    /** Integer 0..2_147_483_647 ms; zero disables keepalives. */
    keepaliveInterval?: number;
    keepaliveCountMax?: number;
    /** Handshake deadline in integer milliseconds, 1..2_147_483_647. */
    readyTimeout?: number;
    strictVendor?: boolean;
    sock?: Readable;
    agentForward?: boolean;
    algorithms?: SSHAlgorithms;
    debug?: SSHDebugFunction;
    authHandler?: SSHAuthenticationType[] | SSHAuthHandlerMiddleware | SSHAuthMethod[];
    localAddress?: string;
    localPort?: number;
    /** Socket inactivity timeout, integer 0..2_147_483_647 ms; zero disables it. */
    timeout?: number;
    ident?: Buffer | string;
}

export interface SSHAuthMethod {
    type: SSHAuthenticationType;
    username: string;
}

export interface SSHNoAuthMethod extends SSHAuthMethod {
    type: "none";
}

export interface SSHPasswordAuthMethod extends SSHAuthMethod {
    type: "password";
    password: string;
}

export interface SSHPublicKeyAuthMethod extends SSHAuthMethod {
    type: "publickey";
    key: SSHParsedKey | Buffer | string;
    passphrase?: Buffer | string;
}

export interface SSHHostBasedAuthMethod extends SSHAuthMethod {
    type: "hostbased";
    localHostname: string;
    localUsername: string;
    key: SSHParsedKey | Buffer | string;
    passphrase?: Buffer | string;
}

export interface SSHAgentAuthMethod extends SSHAuthMethod {
    type: "agent";
    agent: SSHAgent | string;
}

export interface SSHKeyboardInteractiveAuthMethod extends SSHAuthMethod {
    type: "keyboard-interactive";
    prompt(
        name: string,
        instructions: string,
        lang: string,
        prompts: SSHPrompt[],
        finish: SSHKeyboardInteractiveCallback,
    ): void;
}

export type SSHAnyAuthMethod =
    | SSHNoAuthMethod
    | SSHPasswordAuthMethod
    | SSHHostBasedAuthMethod
    | SSHPublicKeyAuthMethod
    | SSHAgentAuthMethod
    | SSHKeyboardInteractiveAuthMethod;

export type SSHNextAuthHandler = (authName: SSHAuthenticationType | SSHAnyAuthMethod | false) => void;

export type SSHAuthHandlerMiddleware = (
    authsLeft: SSHAuthenticationType[] | null,
    partialSuccess: boolean | null,
    next: SSHNextAuthHandler,
) => void;

export interface SSHTcpConnectionDetails {
    srcIP: string;
    srcPort: number;
    destIP: string;
    destPort: number;
}

export interface SSHChannelExecOptions {
    env?: NodeJS.ProcessEnv;
    pty?: SSHPseudoTtyOptions | boolean;
    x11?: SSHX11Options | number | boolean;
    allowHalfOpen?: boolean;
}

export interface SSHShellOptions {
    env?: NodeJS.ProcessEnv;
    x11?: SSHX11Options | number | boolean;
}

export interface SSHX11Options {
    single?: boolean;
    screen?: number;
    protocol?: string;
    cookie?: Buffer | string;
}

export interface SSHPseudoTtyOptions {
    rows?: number;
    cols?: number;
    height?: number;
    width?: number;
    term?: string;
    modes?: SSHTerminalModes;
}

export interface SSHTerminalModes {
    VINTR?: number | undefined;
    VQUIT?: number | undefined;
    VERASE?: number | undefined;
    VKILL?: number | undefined;
    VEOF?: number | undefined;
    VEOL?: number | undefined;
    VEOL2?: number | undefined;
    VSTART?: number | undefined;
    VSTOP?: number | undefined;
    VSUSP?: number | undefined;
    VDSUSP?: number | undefined;
    VREPRINT?: number | undefined;
    VWERASE?: number | undefined;
    VLNEXT?: number | undefined;
    VFLUSH?: number | undefined;
    VSWTCH?: number | undefined;
    VSTATUS?: number | undefined;
    VDISCARD?: number | undefined;
    IGNPAR?: 0 | 1 | undefined;
    PARMRK?: 0 | 1 | undefined;
    INPCK?: 0 | 1 | undefined;
    ISTRIP?: 0 | 1 | undefined;
    INLCR?: 0 | 1 | undefined;
    IGNCR?: 0 | 1 | undefined;
    ICRNL?: 0 | 1 | undefined;
    IUCLC?: 0 | 1 | undefined;
    IXON?: 0 | 1 | undefined;
    IXANY?: 0 | 1 | undefined;
    IXOFF?: 0 | 1 | undefined;
    IMAXBEL?: 0 | 1 | undefined;
    ISIG?: 0 | 1 | undefined;
    ICANON?: 0 | 1 | undefined;
    XCASE?: 0 | 1 | undefined;
    ECHO?: 0 | 1 | undefined;
    ECHOE?: 0 | 1 | undefined;
    ECHOK?: 0 | 1 | undefined;
    ECHONL?: 0 | 1 | undefined;
    NOFLSH?: 0 | 1 | undefined;
    TOSTOP?: 0 | 1 | undefined;
    IEXTEN?: 0 | 1 | undefined;
    ECHOCTL?: 0 | 1 | undefined;
    ECHOKE?: 0 | 1 | undefined;
    PENDIN?: 0 | 1 | undefined;
    OPOST?: 0 | 1 | undefined;
    OLCUC?: 0 | 1 | undefined;
    ONLCR?: 0 | 1 | undefined;
    OCRNL?: 0 | 1 | undefined;
    ONOCR?: 0 | 1 | undefined;
    ONLRET?: 0 | 1 | undefined;
    CS7?: 0 | 1 | undefined;
    CS8?: 0 | 1 | undefined;
    PARENB?: 0 | 1 | undefined;
    PARODD?: 0 | 1 | undefined;
    TTY_OP_ISPEED?: number | undefined;
    TTY_OP_OSPEED?: number | undefined;
}

export interface SFTPTransferOptions {
    /** Parallel transfer requests, an integer from 1 to 256. */
    concurrency?: number;
    /** Bytes per request, 1 to 1 MiB; concurrency × chunkSize must not exceed 64 MiB. */
    chunkSize?: number;
    /** Explicit file size, a nonnegative safe integer. */
    fileSize?: number;
    step?: (total: number, nb: number, fsize: number) => void;
    mode?: number | string;
}

export interface SFTPReadFileOptions {
    /** Maximum collected bytes: defaults to 64 MiB; integer 0 through 1 GiB. Use a stream for larger files. */
    maxBytes?: number;
    encoding?: BufferEncoding;
    flag?: string;
}

export interface SFTPWriteFileOptions {
    encoding?: BufferEncoding;
    mode?: number;
    flag?: string;
}

export interface SFTPInputAttributes {
    mode?: number | string;
    uid?: number;
    gid?: number;
    size?: number;
    atime?: number | Date;
    mtime?: number | Date;
}

export interface SFTPAttributes {
    mode: number;
    uid: number;
    gid: number;
    size: number;
    atime: number;
    mtime: number;
}

export interface SFTPStats extends SFTPAttributes {
    isDirectory(): boolean;
    isFile(): boolean;
    isBlockDevice(): boolean;
    isCharacterDevice(): boolean;
    isSymbolicLink(): boolean;
    isFIFO(): boolean;
    isSocket(): boolean;
}

export interface SFTPFileEntry {
    filename: string;
    longname: string;
    attrs: SFTPAttributes;
}

export interface SFTPEntry extends Omit<SFTPFileEntry, "attrs"> {
    attrs: SFTPStats;
}

export interface SFTPClient extends EventEmitter {
    fastGet(remotePath: string, localPath: string, options: SFTPTransferOptions, callback: SSHCallback): void;
    fastGet(remotePath: string, localPath: string, callback: SSHCallback): void;
    fastPut(localPath: string, remotePath: string, options: SFTPTransferOptions, callback: SSHCallback): void;
    fastPut(localPath: string, remotePath: string, callback: SSHCallback): void;
    readFile(remotePath: string, options: SFTPReadFileOptions & { encoding: BufferEncoding }, callback: (error: Error | undefined, contents: string) => void): void;
    readFile(remotePath: string, options: SFTPReadFileOptions, callback: (error: Error | undefined, contents: string | Buffer) => void): void;
    readFile(remotePath: string, encoding: BufferEncoding, callback: (error: Error | undefined, contents: string) => void): void;
    readFile(remotePath: string, callback: (error: Error | undefined, contents: Buffer) => void): void;
    createReadStream(path: string, options?: SFTPReadStreamOptions): SFTPReadStream;
    writeFile(remotePath: string, data: string | Buffer, options: SFTPWriteFileOptions, callback?: SSHCallback): void;
    writeFile(remotePath: string, data: string | Buffer, encoding: string, callback?: SSHCallback): void;
    writeFile(remotePath: string, data: string | Buffer, callback?: SSHCallback): void;
    appendFile(remotePath: string, data: string | Buffer, options: SFTPWriteFileOptions, callback?: SSHCallback): void;
    appendFile(remotePath: string, data: string | Buffer, callback?: SSHCallback): void;
    createWriteStream(path: string, options?: SFTPWriteStreamOptions): SFTPWriteStream;
    open(
        filename: string,
        mode: number | SSHOpenMode,
        attributes: SFTPInputAttributes,
        callback: (err: Error | undefined, handle: Buffer) => void,
    ): void;
    open(
        filename: string,
        mode: number | SSHOpenMode,
        attributes: string | number,
        callback: (err: Error | undefined, handle: Buffer) => void,
    ): void;
    open(filename: string, mode: number | SSHOpenMode, callback: (err: Error | undefined, handle: Buffer) => void): void;
    close(handle: Buffer, callback: SSHCallback): void;
    read(
        handle: Buffer,
        buffer: Buffer,
        offset: number,
        length: number,
        position: number,
        callback: (err: Error | undefined, bytesRead: number, buffer: Buffer, position: number) => void,
    ): void;
    write(handle: Buffer, buffer: Buffer, offset: number, length: number, position: number, callback: SSHCallback): void;
    fstat(handle: Buffer, callback: (err: Error | undefined, stats: SFTPStats) => void): void;
    fsetstat(handle: Buffer, attributes: SFTPInputAttributes, callback: SSHCallback): void;
    futimes(handle: Buffer, atime: number | Date, mtime: number | Date, callback: SSHCallback): void;
    fchown(handle: Buffer, uid: number, gid: number, callback: SSHCallback): void;
    fchmod(handle: Buffer, mode: number | string, callback: SSHCallback): void;
    opendir(path: string, callback: (err: Error | undefined, handle: Buffer) => void): void;
    readdir(location: string | Buffer, callback: (err: Error | undefined, list: SFTPEntry[]) => void): void;
    unlink(path: string, callback: SSHCallback): void;
    rename(srcPath: string, destPath: string, callback: SSHCallback): void;
    mkdir(path: string, attributes: SFTPInputAttributes, callback: SSHCallback): void;
    mkdir(path: string, callback: SSHCallback): void;
    rmdir(path: string, callback: SSHCallback): void;
    stat(path: string, callback: (err: Error | undefined, stats: SFTPStats) => void): void;
    /** Prefer stat; the optional error distinguishes an unavailable server from a missing file. */
    exists(path: string, callback: (exists: boolean, error?: Error) => void): void;
    lstat(path: string, callback: (err: Error | undefined, stats: SFTPStats) => void): void;
    setstat(path: string, attributes: SFTPInputAttributes, callback: SSHCallback): void;
    utimes(path: string, atime: number | Date, mtime: number | Date, callback: SSHCallback): void;
    chown(path: string, uid: number, gid: number, callback: SSHCallback): void;
    chmod(path: string, mode: number | string, callback: SSHCallback): void;
    readlink(path: string, callback: (err: Error | undefined, target: string) => void): void;
    symlink(targetPath: string, linkPath: string, callback: SSHCallback): void;
    realpath(path: string, callback: (err: Error | undefined, absPath: string) => void): void;
    ext_openssh_rename(srcPath: string, destPath: string, callback: SSHCallback): void;
    ext_openssh_statvfs(path: string, callback: (err: Error | undefined, fsInfo: SFTPFilesystemStats) => void): void;
    ext_openssh_fstatvfs(handle: Buffer, callback: (err: Error | undefined, fsInfo: SFTPFilesystemStats) => void): void;
    ext_openssh_hardlink(targetPath: string, linkPath: string, callback: SSHCallback): void;
    ext_openssh_fsync(handle: Buffer, callback: SSHCallback): void;
    ext_openssh_lsetstat(path: string, attrs: SFTPInputAttributes, callback: SSHCallback): void;
    ext_openssh_lsetstat(path: string, callback: SSHCallback): void;
    ext_openssh_expandPath(path: string, callback: (err: Error | undefined, absPath: string) => void): void;
    ext_copy_data(
        handle: Buffer,
        srcOffset: number,
        len: number,
        dstHandle: Buffer,
        dstOffset: number,
        callback: SSHCallback,
    ): void;
    end(): void;
    destroy(): void;
}

export interface SSHPublicKeyEntry {
    pubKey:
        | SSHParsedKey
        | {
            pubKey: SSHParsedKey | Buffer | string;
            comment?: string;
        };
}

export type SSHKnownPublicKeys<T extends string | Buffer | SSHParsedKey = string | Buffer | SSHParsedKey> = Array<
    | T
    | SSHPublicKeyEntry
>;

export type SSHCallback = (err?: Error | null) => void;

export type SSHIdentityCallback<T extends string | Buffer | SSHParsedKey = string | Buffer | SSHParsedKey> = (
    err?: Error | null,
    keys?: SSHKnownPublicKeys<T>,
) => void;

export type SSHSignCallback = (err?: Error | null, signature?: Buffer) => void;

export type SSHGetStreamCallback = (err?: Error | null, stream?: Duplex) => void;

export interface SSHSigningRequestOptions {
    hash?: "sha256" | "sha512";
}

export interface SSHAgent<TPublicKey extends string | Buffer | SSHParsedKey = string | Buffer | SSHParsedKey> {
    getIdentities(cb: SSHIdentityCallback<TPublicKey>): void;
    sign(pubKey: TPublicKey, data: Buffer, options: SSHSigningRequestOptions, callback: SSHSignCallback): void;
    getStream?(cb: SSHGetStreamCallback): void;
}

export type SSHVerifyCallback = (valid: boolean) => void;

export interface SFTPReadStreamOptions extends ReadableOptions {
    flags?: SSHOpenMode;
    mode?: number;
    start?: number;
    end?: number;
    autoClose?: boolean;
    handle?: Buffer;
    on<E extends keyof SFTPReadEvents>(event: E, listener: (...args: SFTPReadEvents[E]) => void): this;
    on(event: string | symbol, listener: (...args: unknown[]) => void): this;
    once<E extends keyof SFTPReadEvents>(event: E, listener: (...args: SFTPReadEvents[E]) => void): this;
    once(event: string | symbol, listener: (...args: unknown[]) => void): this;
}

export interface SFTPWriteStreamOptions extends WritableOptions {
    flags?: SSHOpenMode;
    mode?: number;
    start?: number;
    autoClose?: boolean;
    handle?: Buffer;
    encoding?: BufferEncoding;
    on<E extends keyof SFTPWriteEvents>(event: E, listener: (...args: SFTPWriteEvents[E]) => void): this;
    on(event: string | symbol, listener: (...args: unknown[]) => void): this;
    once<E extends keyof SFTPWriteEvents>(event: E, listener: (...args: SFTPWriteEvents[E]) => void): this;
    once(event: string | symbol, listener: (...args: unknown[]) => void): this;
}

export interface SFTPReadEvents extends Omit<ReadableEventMap, 'data'> {
    data: [chunk: Buffer | string];
    ready: [];
    open: [handle: Buffer];
}
export interface SFTPWriteEvents extends WritableEventMap {
    ready: [];
    open: [handle: Buffer];
}
export interface SFTPReadStream extends Readable {
    pending: boolean;
    open(): void;
    close(cb: SSHCallback): void;
    on(eventName: "ready", listener: () => void): this;
    on(eventName: "open", listener: (handle: Buffer) => void): this;
    on(event: string | symbol, listener: (...args: unknown[]) => void): this;
    once(eventName: "ready", listener: () => void): this;
    once(eventName: "open", listener: (handle: Buffer) => void): this;
    once(event: string | symbol, listener: (...args: unknown[]) => void): this;
}

export interface SFTPWriteStream extends Writable {
    pending: boolean;
    open(): void;
    destroy(): this;
    close(cb: SSHCallback): void;
    on(eventName: "ready", listener: () => void): this;
    on(eventName: "open", listener: (handle: Buffer) => void): this;
    on(event: string | symbol, listener: (...args: unknown[]) => void): this;
    once(eventName: "ready", listener: () => void): this;
    once(eventName: "open", listener: (handle: Buffer) => void): this;
    once(event: string | symbol, listener: (...args: unknown[]) => void): this;
}

export type SSHKeyboardInteractiveCallback = (answers: string[]) => void;

export interface SSHUNIXConnectionDetails {
    socketPath: string;
}

/** OpenSSH statvfs fields; transport rejects integers outside the safe numeric range. */
export interface SFTPFilesystemStats {
  f_bsize: number; f_frsize: number; f_blocks: number; f_bfree: number;
  f_bavail: number; f_files: number; f_ffree: number; f_favail: number;
  f_fsid: number; f_flag: number; f_namemax: number;
}
