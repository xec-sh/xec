import prism from '../prism/index.js';
import { DatePrompt, settings } from '../core/index.js';
import { S_BAR, symbol, S_BAR_END, type CommonOptions } from '../utilities/common.js';

import type { DateFormatConfig, DateParts } from '../core/index.js';

export type DateFormat = 'YYYY/MM/DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY';

type CursorState = { segmentIndex: number; positionInSegment: number };
type RenderState = 'active' | 'submit' | 'cancel' | 'error';

const DEFAULT_SEGMENT_LABELS: Record<'year' | 'month' | 'day', string> = {
  year: 'yyyy',
  month: 'mm',
  day: 'dd',
};

/** Derive a plain formatter from segment order */
function makePlainFormatter(segments: DateFormatConfig['segments']): (parts: DateParts) => string {
  return (p) => segments.map((s) => p[s.type]).join('/');
}

/** Render a single segment with cursor highlighting */
function renderSegment(
  value: string,
  segmentIndex: number,
  cursor: CursorState,
  label: string,
  state: RenderState
): string {
  const isBlank = !value || value.replace(/_/g, '') === '';
  const cursorInThis =
    segmentIndex === cursor.segmentIndex && state !== 'submit' && state !== 'cancel';
  const parts: string[] = [];

  if (isBlank) {
    if (cursorInThis) {
      for (let j = 0; j < label.length; j++) {
        const ch = label[j] ?? ' ';
        parts.push(
          j === cursor.positionInSegment ? prism.inverse(' ') : prism.dim(ch)
        );
      }
    } else {
      parts.push(prism.dim(label));
    }
  } else {
    for (let j = 0; j < value.length; j++) {
      const ch = value[j] ?? ' ';
      if (cursorInThis && j === cursor.positionInSegment) {
        parts.push(ch === '_' ? prism.inverse(' ') : prism.inverse(ch));
      } else {
        parts.push(ch === '_' ? prism.dim(' ') : ch);
      }
    }
  }

  return parts.join('');
}

/** Generic data-driven renderer */
function renderDateFormat(
  parts: DateParts,
  cursor: CursorState,
  state: RenderState,
  config: DateFormatConfig
): string {
  if (state === 'submit' || state === 'cancel') {
    return config.format(parts);
  }
  const labels = config.segmentLabels ?? DEFAULT_SEGMENT_LABELS;
  const sep = prism.gray('/');
  const rendered = config.segments.map((seg, i) =>
    renderSegment(parts[seg.type], i, cursor, labels[seg.type], state)
  );
  let result = rendered.join(sep);
  const lastSeg = config.segments[config.segments.length - 1];
  if (
    lastSeg &&
    (cursor.segmentIndex >= config.segments.length ||
      (cursor.segmentIndex === config.segments.length - 1 &&
        cursor.positionInSegment >= lastSeg.len))
  ) {
    result += '\u2588';
  }
  return result;
}

/** Segment definitions per format */
const SEGMENT_DEFS: Record<DateFormat, DateFormatConfig['segments']> = {
  'YYYY/MM/DD': [
    { type: 'year', len: 4 },
    { type: 'month', len: 2 },
    { type: 'day', len: 2 },
  ],
  'MM/DD/YYYY': [
    { type: 'month', len: 2 },
    { type: 'day', len: 2 },
    { type: 'year', len: 4 },
  ],
  'DD/MM/YYYY': [
    { type: 'day', len: 2 },
    { type: 'month', len: 2 },
    { type: 'year', len: 4 },
  ],
};

/** Pre-computed format configs derived from segment definitions */
const FORMAT_CONFIGS: Record<DateFormat, DateFormatConfig> = Object.fromEntries(
  (Object.entries(SEGMENT_DEFS) as [DateFormat, DateFormatConfig['segments']][]).map(
    ([key, segments]) => [key, { segments, format: makePlainFormatter(segments) }]
  )
) as Record<DateFormat, DateFormatConfig>;

export interface DateOptions extends CommonOptions {
  message: string;
  format?: DateFormat;
  defaultValue?: Date;
  initialValue?: Date;
  minDate?: Date;
  maxDate?: Date;
  validate?: (value: Date | undefined) => string | Error | undefined;
}

export const date = (opts: DateOptions) => {
  const validate = opts.validate;
  const formatConfig = FORMAT_CONFIGS[opts.format ?? 'YYYY/MM/DD'];
  return new DatePrompt({
    formatConfig,
    defaultValue: opts.defaultValue,
    initialValue: opts.initialValue,
    minDate: opts.minDate,
    maxDate: opts.maxDate,
    validate(value: Date | undefined) {
      if (value === undefined) {
        if (opts.defaultValue !== undefined) return undefined;
        if (validate) return validate(value);
        return 'Please enter a valid date';
      }
      const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
      if (opts.minDate && dateOnly(value) < dateOnly(opts.minDate)) {
        return settings.date.messages.afterMin(opts.minDate);
      }
      if (opts.maxDate && dateOnly(value) > dateOnly(opts.maxDate)) {
        return settings.date.messages.beforeMax(opts.maxDate);
      }
      if (validate) return validate(value);
      return undefined;
    },
    signal: opts.signal,
    input: opts.input,
    output: opts.output,
    render() {
      const hasGuide = (opts?.withGuide ?? settings.withGuide) !== false;
      const titlePrefix = `${hasGuide ? `${prism.gray(S_BAR)}\n` : ''}${symbol(this.state)}  `;
      const title = `${titlePrefix}${opts.message}\n`;

      const segmentValues = this.segmentValues;
      const segmentCursor = this.segmentCursor;

      const renderState: RenderState =
        this.state === 'submit'
          ? 'submit'
          : this.state === 'cancel'
            ? 'cancel'
            : this.state === 'error'
              ? 'error'
              : 'active';

      const userInput = renderDateFormat(segmentValues, segmentCursor, renderState, formatConfig);

      const value =
        this.value instanceof Date
          ? formatConfig.format({
              year: String(this.value.getFullYear()).padStart(4, '0'),
              month: String(this.value.getMonth() + 1).padStart(2, '0'),
              day: String(this.value.getDate()).padStart(2, '0'),
            })
          : '';

      switch (this.state) {
        case 'error': {
          const errorText = this.error ? `  ${prism.yellow(this.error)}` : '';
          const errorPrefix = hasGuide ? `${prism.yellow(S_BAR)}  ` : '';
          const errorPrefixEnd = hasGuide ? prism.yellow(S_BAR_END) : '';
          return `${title.trim()}\n${errorPrefix}${userInput}\n${errorPrefixEnd}${errorText}\n`;
        }
        case 'submit': {
          const valueText = value ? `  ${prism.dim(value)}` : '';
          const submitPrefix = hasGuide ? prism.gray(S_BAR) : '';
          return `${title}${submitPrefix}${valueText}`;
        }
        case 'cancel': {
          const valueText = value ? `  ${prism.strikethrough(prism.dim(value))}` : '';
          const cancelPrefix = hasGuide ? prism.gray(S_BAR) : '';
          return `${title}${cancelPrefix}${valueText}${value.trim() ? `\n${cancelPrefix}` : ''}`;
        }
        default: {
          const defaultPrefix = hasGuide ? `${prism.cyan(S_BAR)}  ` : '';
          const defaultPrefixEnd = hasGuide ? prism.cyan(S_BAR_END) : '';
          const inlineErrorBar = hasGuide ? `${prism.cyan(S_BAR)}  ` : '';
          const inlineError = (this as { inlineError?: string }).inlineError
            ? `\n${inlineErrorBar}${prism.yellow((this as { inlineError: string }).inlineError)}`
            : '';
          return `${title}${defaultPrefix}${userInput}${inlineError}\n${defaultPrefixEnd}\n`;
        }
      }
    },
  }).prompt() as Promise<Date | symbol>;
};
