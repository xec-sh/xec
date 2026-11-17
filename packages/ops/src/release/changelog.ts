import { releaseTag } from './packages.js';

interface Definition {
  start: number;
  end: number;
  label: string;
  url: string;
}

interface Heading {
  start: number;
  end: number;
  title: string;
}

/** Release headings outside fenced examples; offsets preserve the author's text. */
function headings(source: string, definitions: Definition[] = []): Heading[] {
  const result: Heading[] = [];
  let fence: { character: string; length: number } | undefined;
  for (const match of source.matchAll(/[^\n]*(?:\n|$)/g)) {
    if (!match[0]) continue;
    const line = match[0].replace(/\r?\n$/, '');
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1]![0] === fence.character && marker[1]!.length >= fence.length && !marker[2]!.trim()) fence = undefined;
      continue;
    }
    if (marker) { fence = { character: marker[1]![0]!, length: marker[1]!.length }; continue; }
    const heading = /^ {0,3}##[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (heading) result.push({ start: match.index!, end: match.index! + match[0].length, title: heading[1]! });
    const definition = /^ {0,3}\[([^\]\r\n]+)\]:[ \t]+(\S+)[ \t]*$/.exec(line);
    if (definition) definitions.push({ start: match.index!, end: match.index! + line.length, label: definition[1]!, url: definition[2]! });
  }
  return result;
}

/** Move authored pending changes into a dated release. No inference from Git subjects. */
export function finalizeChangelog(source: string, version: string, date: string): string {
  const tag = releaseTag(version);
  const definitions: Definition[] = [];
  const sections = headings(source, definitions);
  const pending = sections.filter(section => /^(?:Unreleased|\[Unreleased\])$/i.test(section.title));
  if (pending.length > 1) throw new Error('Changelog has multiple Unreleased sections');
  const section = pending[0];
  if (!section) return source;
  if (sections[0] !== section) throw new Error('Unreleased must be the first changelog release section');
  const next = sections[sections.indexOf(section) + 1]?.start ?? source.length;
  // Link definitions are global Markdown metadata, not release notes.
  const end = definitions.find(entry => entry.start >= section.end && entry.start < next)?.start ?? next;
  const changes = source.slice(section.end, end).trim();
  if (!changes) return source;
  if (sections.some(entry => entry.title === version || entry.title.startsWith(version + ' ') || entry.title === '[' + version + ']' || entry.title.startsWith('[' + version + '] '))) {
    throw new Error('Changelog already contains release ' + version);
  }
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  let result = source.slice(0, section.end).replace(/\r?\n?$/, eol) + eol
    + '## [' + version + '] - ' + date + eol + eol + changes + eol + eol + source.slice(end);
  const resultDefinitions: Definition[] = [];
  headings(result, resultDefinitions);
  const links = resultDefinitions.filter(entry => entry.label.toLowerCase() === 'unreleased');
  if (links.length > 1) throw new Error('Changelog has multiple Unreleased links');
  const link = links[0];
  if (link) {
    const compare = /^(https?:\/\/[^\s]+\/compare\/)([^\s]+)\.\.\.HEAD$/.exec(link.url);
    if (!compare) throw new Error('Unreleased link must use a compare/<base>...HEAD URL');
    const releaseLink = '[' + version + ']: ' + compare[1] + compare[2] + '...' + tag;
    if (resultDefinitions.some(entry => entry.label === version)) {
      throw new Error('Changelog already contains a link for release ' + version);
    }
    const replacement = '[Unreleased]: ' + compare[1] + tag + '...HEAD' + eol + releaseLink;
    // Slice replacement preserves literal "$" in URLs.
    result = result.slice(0, link.start) + replacement + result.slice(link.end);
  }
  return result;
}
