import type { Option, Command } from 'commander';

const supported = new WeakSet<Command>();
const invocationOnly = new Set(['config', 'profile', 'dryRun', 'interactive', 'output', 'verbose', 'quiet']);

/** Registration and default resolution use the same live command tree. */
export function registerDefaultsCommand(command: Command): void { supported.add(command); }

export function supportsConfigurationDefaults(command: Command): boolean { return supported.has(command); }

export function configurableOptions(command: Command): Option[] {
  return [...new Map(command.options.filter(option => !invocationOnly.has(option.attributeName()))
    .map(option => [option.attributeName(), option])).values()];
}

export function validateCommandDefaults(command: Command, value: unknown, prefix: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${prefix} must be an object`);
  if (Object.keys(value).length && !supported.has(command)) {
    throw new Error(`${prefix} does not support configuration defaults; use its explicit CLI options`);
  }
  return validateTree(command, value as Record<string, unknown>, prefix);
}

function validateTree(command: Command, value: Record<string, unknown>, prefix: string): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const field = `${prefix}.${key}`;
    const child = command.commands.find(item => item.name() === key);
    if (child) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${field} must be an object`);
      output[key] = validateTree(child, entry as Record<string, unknown>, field);
      continue;
    }
    const option = command.options.find(item => item.attributeName() === key);
    if (!option) throw new Error(`Unknown configuration option ${field}; use the native command's --help`);
    if (invocationOnly.has(key)) throw new Error(`${field} is invocation-only; select it explicitly on the CLI`);
    output[key] = parseValue(option, entry, field);
  }
  return output;
}

function parseValue(option: Option, value: unknown, field: string): unknown {
  if (!option.required && !option.optional) {
    if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`);
    return value;
  }
  if (Array.isArray(value)) {
    if (!option.variadic && !Array.isArray(option.defaultValue)) throw new Error(`${field} is not a repeatable option`);
    if (value.some(item => typeof item !== 'string' && typeof item !== 'number')) throw new Error(`${field} requires scalar arguments`);
    const values = value.map(String);
    return option.parseArg
      ? values.reduce<unknown>((previous, item) => option.parseArg!(item, previous), [])
      : values;
  }
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error(`${field} requires a string or number`);
  const text = String(value);
  return option.parseArg ? option.parseArg(text, undefined) : option.variadic ? [text] : text;
}

export function configuredDefaults(root: Command, invoked: Command, value: Record<string, unknown>): Record<string, unknown> {
  const chain: Command[] = [];
  for (let item: Command | null = invoked; item; item = item.parent) {
    chain.unshift(item);
    if (item === root) break;
  }
  const defaults: Record<string, unknown> = {};
  let current = value;
  for (const item of chain) {
    if (item !== root) current = current[item.name()] as Record<string, unknown> ?? {};
    for (const option of item.options) {
      const key = option.attributeName();
      if (Object.hasOwn(current, key)) defaults[key] = current[key];
    }
  }
  return defaults;
}
