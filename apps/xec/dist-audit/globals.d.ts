import type { TargetType, TargetConfig, Configuration, CommandConfig, ResolvedTarget } from '@xec-sh/ops';
import type { Command, DockerOptions, ProcessPromise, ExecutionResult, SSHAdapterOptions, DockerAdapterOptions, ExecutionEngineConfig, DockerEphemeralOptions, CallableExecutionEngine, DockerPersistentOptions, KubernetesAdapterOptions } from '@xec-sh/core';
import * as CoreExports from '@xec-sh/core';
declare global {
    const $: typeof import('@xec-sh/core').$;
    const use: (spec: string) => Promise<any>;
    const x: (spec: string) => Promise<any>;
    const ps: typeof import('@xec-sh/ops').ps;
    const cd: typeof import('@xec-sh/ops').cd;
    const env: typeof import('@xec-sh/ops').env;
    const csv: typeof import('@xec-sh/ops').csv;
    const pwd: typeof import('@xec-sh/ops').pwd;
    const log: typeof import('@xec-sh/ops').log;
    const echo: typeof import('@xec-sh/ops').echo;
    const exit: typeof import('@xec-sh/ops').exit;
    const kill: typeof import('@xec-sh/ops').kill;
    const yaml: typeof import('@xec-sh/ops').yaml;
    const diff: typeof import('@xec-sh/ops').diff;
    const sleep: typeof import('@xec-sh/ops').sleep;
    const retry: typeof import('@xec-sh/ops').retry;
    const quote: typeof import('@xec-sh/ops').quote;
    const kit: typeof import('@xec-sh/ops').kit;
    const prism: typeof import('@xec-sh/ops').prism;
    const within: typeof import('@xec-sh/ops').within;
    const setEnv: typeof import('@xec-sh/ops').setEnv;
    const tmpdir: typeof import('@xec-sh/ops').tmpdir;
    const spinner: typeof import('@xec-sh/ops').spinner;
    const tmpfile: typeof import('@xec-sh/ops').tmpfile;
    const loadEnv: typeof import('@xec-sh/ops').loadEnv;
    const template: typeof import('@xec-sh/ops').template;
    const parseArgs: typeof import('@xec-sh/ops').parseArgs;
    const fs: typeof import('@xec-sh/ops').fs;
    const os: typeof import('@xec-sh/ops').os;
    const glob: typeof import('@xec-sh/ops').glob;
    const path: typeof import('@xec-sh/ops').path;
    const which: typeof import('@xec-sh/ops').which;
    namespace Xec {
        export import Core = CoreExports;
        export type { Command, DockerOptions, ProcessPromise, ExecutionResult, SSHAdapterOptions, DockerAdapterOptions, ExecutionEngineConfig, DockerEphemeralOptions, CallableExecutionEngine, DockerPersistentOptions, KubernetesAdapterOptions, };
        export type { TargetType, TargetConfig, Configuration, CommandConfig, ResolvedTarget, };
    }
}
export type { Xec };
