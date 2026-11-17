import { it, expect, describe } from 'vitest';

import { finalizeChangelog } from '../../src/release/changelog.js';

describe('authored release history', () => {
  it('preserves history, fenced examples and CRLF while advancing comparison links', () => {
    const source = [
      '# Changelog', '', '## [Unreleased]', '', '### Fixed', '', '- Preserve ownership.', '',
      '```md', '## Unreleased', 'An example, not a release.', '[Unreleased]: example literal', '```', '',
      '## [0.9.0] - 2026-01-01', '', '- Previous change.', '',
      '[Unreleased]: https://example.invalid/repo/compare/v0.9.0...HEAD',
      '[0.9.0]: https://example.invalid/repo/releases/tag/v0.9.0', '',
    ].join('\r\n');
    const result = finalizeChangelog(source, '1.0.0', '2026-11-17');
    expect(result).toContain('## [Unreleased]\r\n\r\n## [1.0.0] - 2026-11-17\r\n\r\n### Fixed');
    expect(result).toContain('```md\r\n## Unreleased\r\nAn example, not a release.\r\n[Unreleased]: example literal\r\n```');
    expect(result).toContain('## [0.9.0] - 2026-01-01\r\n\r\n- Previous change.');
    expect(result).toContain('[Unreleased]: https://example.invalid/repo/compare/v1.0.0...HEAD\r\n[1.0.0]: https://example.invalid/repo/compare/v0.9.0...v1.0.0');
    expect(result.replace(/\r\n/g, '')).not.toContain('\n');
    expect(finalizeChangelog(result, '1.0.0', '2026-11-18')).toBe(result);
  });

  it.each(['# Changelog\n', '# Changelog\n\n## Unreleased\n\n## [0.9.0]\n\n- History.\n'])(
    'does not invent notes for an absent or empty pending section',
    (source) => expect(finalizeChangelog(source, '1.0.0', '2026-11-17')).toBe(source),
  );

  it.each([
    ['## Unreleased\n- A\n## Unreleased\n- B\n', 'multiple Unreleased'],
    ['## [0.9.0]\n- A\n## Unreleased\n- B\n', 'first changelog'],
    ['## Unreleased\n- A\n## [1.0.0] - 2026-11-16\n- B\n', 'already contains release'],
    ['## Unreleased\n- A\n[Unreleased]: https://example.invalid/unreviewed\n', 'compare/'],
    ['## Unreleased\n- A\n[Unreleased]: https://example.invalid/compare/v0...HEAD\n[1.0.0]: existing\n', 'already contains a link'],
  ])('refuses ambiguous history before version preparation: %s', (source, message) => {
    expect(() => finalizeChangelog(source, '1.0.0', '2026-11-17')).toThrow(message);
  });
});
