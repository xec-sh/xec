// Namespace import, not `import { registerHooks }`: on runtimes without the
// hook (Deno) the named form fails at link time, before the guard below runs.
import * as nodeModule from 'node:module';

/**
 * Packages the CLI carries and supplies to user code that lacks them.
 *
 * A script or dynamic command written in the documented typed style —
 * `import { $ } from '@xec-sh/core'` — must run in a project that never
 * installed anything: the CLI already ships every one of these packages as
 * its own dependencies. Without this hook such an import dies with
 * ERR_MODULE_NOT_FOUND, because Node resolves it from the script's
 * directory, where no node_modules exists.
 *
 * `@xec-sh/testing` is deliberately absent: it is a dev-dependency
 * everywhere, so a project that wants it in scripts installs it.
 */
const CARRIED = new Set(['@xec-sh/core', '@xec-sh/ops', '@xec-sh/kit', '@xec-sh/loader']);

function carriedPackageRoot(specifier: string): string | null {
  if (!specifier.startsWith('@xec-sh/')) {
    return null;
  }

  const [scope, name] = specifier.split('/');
  const root = `${scope}/${name}`;

  return CARRIED.has(root) ? root : null;
}

function isModuleNotFound(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;

  return code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND';
}

let registered = false;

/**
 * Resolve `@xec-sh/*` imports that the user's project cannot satisfy against
 * the CLI's own copies.
 *
 * The project's own installation always wins: the hook first defers to
 * ordinary resolution and steps in only when that fails with "not found" for
 * a package the CLI carries. A project that pins its own `@xec-sh/core`
 * keeps exactly the version it pinned; a bare project gets the CLI's. Every
 * other specifier — including a genuinely missing third-party package — is
 * untouched, so real resolution errors surface unchanged.
 *
 * Registration is process-wide and covers all four ways user code enters:
 * `xec run`, `-e`, dynamic commands, and the REPL.
 *
 * @returns `false` when the runtime has no `module.registerHooks` (Bun and
 * Deno currently). There the import behaves as before this hook existed:
 * fine in projects that installed the package, ERR_MODULE_NOT_FOUND in bare
 * ones.
 */
export function registerSelfResolution(): boolean {
  if (registered) {
    return true;
  }

  if (typeof nodeModule.registerHooks !== 'function') {
    return false;
  }

  const anchor = import.meta.url;

  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        if (carriedPackageRoot(specifier) !== null && isModuleNotFound(error)) {
          return nextResolve(specifier, { ...context, parentURL: anchor });
        }

        throw error;
      }
    },
  });

  registered = true;

  return true;
}
