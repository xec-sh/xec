import { load } from 'js-yaml';
import { Writable } from 'node:stream';
import { it, vi, expect, describe, afterEach } from 'vitest';

import { OutputFormatter } from '../../../src/utils/output-formatter.js';

class Transcript extends Writable {
  text = '';
  isTTY = false;
  override _write(chunk: Buffer, _encoding: BufferEncoding, done: () => void): void {
    this.text += chunk.toString();
    done();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('OutputFormatter uses Kit table and indicator contracts', () => {
  const data = {
    columns: [{ header: 'Value' }, { header: 'Enabled' }],
    rows: [[0, false], ['界👩🏽‍💻', true]],
  };

  it.each(['json', 'yaml'] as const)('preserves typed falsy values in %s', format => {
    const formatter = new OutputFormatter();
    formatter.setFormat(format);
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    formatter.table(data);
    expect(output).toHaveBeenCalledTimes(1);
    const serialized = String(output.mock.calls[0]?.[0]);
    expect(format === 'json' ? JSON.parse(serialized) : load(serialized)).toEqual([
      { Value: 0, Enabled: false },
      { Value: '界👩🏽‍💻', Enabled: true },
    ]);
  });

  it('keeps CSV values and quoting exact', () => {
    const formatter = new OutputFormatter();
    formatter.setFormat('csv');
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    formatter.table({ columns: [{ header: 'Value' }], rows: [[0], [false], ['a,"b"\nc']] });
    expect(output.mock.calls.map(call => call[0])).toEqual(['"Value"', '"0"', '"false"', '"a,""b""\nc"']);
  });

  it('renders Unicode and removes terminal commands from table data', () => {
    const formatter = new OutputFormatter();
    formatter.setColors(false);
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    formatter.table({
      columns: [{ header: 'Name', width: 18 }],
      rows: [['界👩🏽‍💻'], ['safe\x1b]52;c;clipboard\x07']],
    });
    const text = output.mock.calls.map(call => String(call[0])).join('');
    expect(text).toContain('界👩🏽‍💻');
    expect(text).toContain('safe');
    expect(text).not.toContain('clipboard');
    expect(text).not.toContain('\x1b');
  });

  it('routes record tables through the selected CSV output', () => {
    const formatter = new OutputFormatter();
    formatter.setFormat('csv');
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    formatter.simpleTable([{ zero: 0, no: false }]);
    expect(output.mock.calls.map(call => call[0])).toEqual(['"zero","no"', '"0","false"']);
  });

  it.each(['quiet', 'json', 'yaml', 'csv', 'disabled'] as const)('silences indicator output and hooks in %s mode', mode => {
    const formatter = new OutputFormatter();
    if (mode === 'quiet') formatter.setQuiet(true);
    else if (mode !== 'disabled') formatter.setFormat(mode);
    const output = new Transcript();
    const listeners = process.listenerCount('SIGINT');
    const indicator = formatter.spinner({ output, enabled: mode !== 'disabled' });
    indicator.start('Working');
    expect(process.listenerCount('SIGINT')).toBe(listeners);
    expect(output.listenerCount('resize')).toBe(0);
    indicator.message('Still working');
    indicator.error('Failed');
    expect(output.text).toBe('');
  });

  it('uses append-only failure output in a pipe with restored listeners', () => {
    const formatter = new OutputFormatter();
    const output = new Transcript();
    const listeners = process.listenerCount('SIGINT');
    const indicator = formatter.spinner({ output });
    indicator.start('Working');
    indicator.error('Failed');
    expect(output.text).toContain('Working');
    expect(output.text).toContain('Failed');
    expect(output.text).not.toContain('\x1b');
    expect(output.text).not.toContain('\r');
    expect(process.listenerCount('SIGINT')).toBe(listeners);
  });

  it('preserves the Kit cancellation state and restart API', () => {
    const formatter = new OutputFormatter();
    const output = new Transcript();
    const indicator = formatter.spinner({ output });
    indicator.start('First');
    indicator.cancel('Cancelled');
    expect(indicator.isCancelled).toBe(true);
    indicator.start('Second');
    expect(indicator.isCancelled).toBe(false);
    indicator.stop('Complete');
    expect(output.text).toContain('Cancelled');
    expect(output.text).toContain('Complete');
  });
});
