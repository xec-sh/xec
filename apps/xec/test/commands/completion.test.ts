import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { CompletionCommand } from '../../src/commands/completion.js';

/**
 * Completion is the one part of a CLI that is judged entirely by whether
 * the useful cases work. Offering the twelve command names is easy and
 * nearly worthless; offering the host you configured yesterday is the
 * whole point, and it is the part a generated static script cannot do.
 */
describe('completion candidates', () => {
  let projectDir: string;
  let originalCwd: string;

  const candidates = async (line: string): Promise<string[]> => {
    const written: string[] = [];
    const real = process.stdout.write.bind(process.stdout);
    (process.stdout as { write: unknown }).write = (chunk: string) => {
      written.push(String(chunk));
      return true;
    };

    try {
      const command = new CompletionCommand();
      await command.execute([undefined, { complete: line }]);
    } finally {
      (process.stdout as { write: unknown }).write = real;
    }

    return written.join('').split('\n').filter(Boolean);
  };

  beforeEach(async () => {
    originalCwd = process.cwd();
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-completion-'));
    await fs.mkdir(path.join(projectDir, '.xec'), { recursive: true });
    await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), [
      'version: "1.0"',
      'targets:',
      '  hosts:',
      '    web-1: { host: web1.example.com, user: deploy }',
      '    db-master: { host: db.example.com, user: deploy }',
      '  containers:',
      '    api: { image: "node:22" }',
      'tasks:',
      '  deploy: { command: "echo deploying" }',
      '  migrate: { command: "echo migrating" }',
    ].join('\n'));
    process.chdir(projectDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  describe('the first word', () => {
    it('offers command names', async () => {
      const names = await candidates('xec ');

      expect(names).toContain('on');
      expect(names).toContain('doctor');
      expect(names).toContain('secrets');
    });

    it('narrows to what has been typed', async () => {
      const names = await candidates('xec co');

      expect(names).toContain('config');
      expect(names).toContain('copy');
      expect(names).not.toContain('watch');
    });
  });

  describe('after a command that takes a target', () => {
    it('offers the targets this project configured', async () => {
      const names = await candidates('xec on ');

      expect(names).toContain('hosts.web-1');
      expect(names).toContain('hosts.db-master');
      expect(names).toContain('containers.api');
      expect(names).toContain('local');
    });

    it('narrows within a group', async () => {
      const names = await candidates('xec on hosts.w');

      expect(names).toEqual(['hosts.web-1']);
    });

    it('offers nothing that is not a target', async () => {
      // `local` is one target and `defaults` describes the others, so
      // walking every key under `targets` offered `local.type` and
      // `defaults.ssh` as machines you could run a command on.
      const names = await candidates('xec on ');

      expect(names.some(name => name.includes('.type'))).toBe(false);
      expect(names.some(name => name.startsWith('defaults'))).toBe(false);
    });

    it('does the same for every command that takes one', async () => {
      for (const command of ['in', 'copy', 'logs', 'watch', 'forward']) {
        expect(await candidates(`xec ${command} `), command).toContain('hosts.web-1');
      }
    });
  });

  describe('after run', () => {
    it('offers the configured tasks', async () => {
      const names = await candidates('xec run ');

      expect(names).toEqual(['deploy', 'migrate']);
    });
  });

  describe('outside a project', () => {
    it('offers nothing rather than failing', async () => {
      // A tab that prints an error into the command line is worse than a
      // tab that does nothing.
      const elsewhere = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-nowhere-'));
      process.chdir(elsewhere);

      try {
        await expect(candidates('xec on ')).resolves.toBeDefined();
      } finally {
        process.chdir(projectDir);
        await fs.rm(elsewhere, { recursive: true, force: true });
      }
    });
  });
});

describe('the completion script', () => {
  const script = async (shell: string): Promise<string> => {
    const written: string[] = [];
    const real = process.stdout.write.bind(process.stdout);
    (process.stdout as { write: unknown }).write = (chunk: string) => {
      written.push(String(chunk));
      return true;
    };

    try {
      await new CompletionCommand().execute([shell, {}]);
    } finally {
      (process.stdout as { write: unknown }).write = real;
    }

    return written.join('');
  };

  it('asks xec for candidates rather than embedding a stale list', async () => {
    for (const shell of ['bash', 'zsh', 'fish']) {
      expect(await script(shell), shell).toContain('completion --complete');
    }
  });

  it('starts a zsh script with the directive zsh requires', async () => {
    expect(await script('zsh')).toMatch(/^#compdef xec/);
  });

  it('refuses a shell it cannot write for, naming the ones it can', async () => {
    await expect(new CompletionCommand().execute(['tcsh', {}]))
      .rejects.toThrow(/bash, zsh, fish/);
  });

  it('asks which shell when none was named', async () => {
    await expect(new CompletionCommand().execute([undefined, {}]))
      .rejects.toThrow(/Which shell/);
  });
});
