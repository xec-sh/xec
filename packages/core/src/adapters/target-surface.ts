import type { ExecutionEngine } from '../core/execution-engine.js';

/**
 * Members that only make sense before a target has been chosen.
 *
 * Re-targeting an already-targeted context is a mistake worth catching:
 * `$.ssh(host).docker('api')` reads like it means something and does not.
 */
const RETARGETING = new Set(['ssh', 'docker', 'k8s', 'local', 'remoteDocker']);

/**
 * Give a target context the full engine surface.
 *
 * `$.docker(...)` and `$.local()` return a configured engine, so a step can use
 * anything the engine offers. SSH and Kubernetes returned hand-written objects
 * carrying about a third of it, which broke the one promise the project makes:
 * that a step runs anywhere. Worse, the gap was invisible until the step was
 * pointed at a real host, because the members it needed existed on the
 * container it was developed against.
 *
 * Rather than copy a member list that would drift the moment the engine grew
 * one, anything the context does not define itself is delegated to an engine
 * configured for this target. Adding a method to the engine now adds it
 * everywhere at once.
 *
 * @param context - The callable context, carrying its target-specific members.
 * @param engineFor - Builds an engine already pointed at this target.
 */
export function withEngineSurface<T extends object>(
  context: T,
  engineFor: () => ExecutionEngine
): T {
  return new Proxy(context, {
    get(target, property, receiver) {
      if (property in target || typeof property === 'symbol') {
        return Reflect.get(target, property, receiver);
      }

      if (RETARGETING.has(property)) return undefined;

      const engine = engineFor();
      const value = (engine as unknown as Record<string, unknown>)[property];

      // Bound to the engine it came from: an unbound method would run against
      // whatever `this` happened to be at the call site, which for the default
      // engine means the operator's own machine.
      return typeof value === 'function' ? value.bind(engine) : value;
    },

    has(target, property) {
      if (property in target) return true;
      if (typeof property === 'symbol' || RETARGETING.has(property)) return false;

      return property in engineFor();
    },
  });
}
