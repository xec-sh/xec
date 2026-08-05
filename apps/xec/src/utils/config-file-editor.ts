import * as nodePath from 'node:path';
import * as fs from 'node:fs/promises';
import { Document, parseDocument } from 'yaml';

/**
 * Surgical editor for the project's own configuration file.
 *
 * Every mutating `config` flow used to persist through the manager's merged
 * view, which bakes builtin defaults and the global config into the project
 * file, drops the user's comments and reorders their keys. This editor works
 * on the file's own YAML document instead: reads reflect exactly what the
 * file says, and writes touch exactly the paths the command changed —
 * comments, ordering and formatting elsewhere survive byte for byte.
 */
export class ConfigFileEditor {
  private constructor(
    readonly filePath: string,
    private readonly document: Document,
    private readonly originalText: string,
  ) {}

  /** Open the file, or an empty document when it does not exist yet. */
  static async open(filePath: string): Promise<ConfigFileEditor> {
    let text = '';
    try {
      text = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    const document = parseDocument(text);
    if (document.errors.length > 0) {
      const first = document.errors[0]!;
      throw new Error(`Cannot edit ${filePath}: ${first.message}`);
    }
    return new ConfigFileEditor(filePath, document, text);
  }

  /**
   * Plain-object copy of the file's content for menu flows to mutate.
   * Persist the mutation with {@link apply}; the editor writes only the
   * differences between this snapshot and the mutated copy.
   */
  workingCopy(): Record<string, unknown> {
    const js = this.document.toJS() as Record<string, unknown> | null | undefined;
    return structuredClone(js ?? {});
  }

  /** Value at a dotted path, from the file only — no defaults, no merges. */
  get(path: readonly string[]): unknown {
    return this.document.getIn(path, false);
  }

  has(path: readonly string[]): boolean {
    return path.length === 0 ? this.document.contents != null : this.document.hasIn(path);
  }

  /** Set one path, creating intermediate mappings as needed. */
  set(path: readonly string[], value: unknown): void {
    this.document.setIn(path, value);
  }

  /** Delete one path. Returns false when the path was absent. */
  delete(path: readonly string[]): boolean {
    if (!this.document.hasIn(path)) {
      return false;
    }
    this.document.deleteIn(path);
    return true;
  }

  /**
   * Replay onto the document exactly what changed between the snapshot this
   * call is given and the mutated copy — nothing else is touched.
   */
  apply(before: unknown, after: unknown): void {
    this.replay(before, after, []);
  }

  private replay(before: unknown, after: unknown, path: string[]): void {
    if (isPlainObject(before) && isPlainObject(after)) {
      for (const key of Object.keys(before)) {
        if (!(key in after)) {
          this.delete([...path, key]);
        }
      }
      for (const [key, value] of Object.entries(after)) {
        if (!(key in before)) {
          this.set([...path, key], value);
        } else {
          this.replay(before[key], value, [...path, key]);
        }
      }
      return;
    }
    if (!deepEqual(before, after)) {
      this.set(path, after);
    }
  }

  /** The text a save would write. */
  render(): string {
    if (this.document.contents == null) {
      return '';
    }
    return this.document.toString({ indent: 2, lineWidth: 0 });
  }

  /** Whether a save would change the file. */
  get dirty(): boolean {
    return this.render() !== this.originalText;
  }

  /**
   * Write the document back. Returns whether the file actually changed;
   * an unchanged document is not rewritten, so untouched files keep their
   * timestamps and never lose comments to a serializer round-trip.
   */
  async save(): Promise<boolean> {
    const next = this.render();
    if (next === this.originalText) {
      return false;
    }
    await fs.mkdir(nodePath.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, next, 'utf-8');
    return true;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length
      && keys.every(key => key in b && deepEqual(a[key], b[key]));
  }
  return false;
}
