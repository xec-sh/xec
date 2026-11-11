import { StringDecoder } from 'node:string_decoder';

/** Exact caller-supplied literals, including matches split across writes. */
export class ReleaseOutput {
  private readonly decoder = new StringDecoder('utf8');
  private readonly secrets: string[];
  private readonly carryLength: number;
  private pending = '';
  text = '';
  truncated = false;

  constructor(private readonly limit: number, redact: readonly string[]) {
    this.secrets = [...new Set(redact.filter(Boolean))].sort((a, b) => b.length - a.length);
    this.carryLength = Math.max(0, ...this.secrets.map(secret => secret.length - 1));
  }

  append(chunk: Buffer | string): string {
    this.pending += this.decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return this.take(false);
  }

  finish(): string {
    this.pending += this.decoder.end();
    return this.take(true);
  }

  private take(final: boolean): string {
    const end = final ? this.pending.length : this.pending.length - this.carryLength;
    let index = 0;
    let output = '';
    while (index < end) {
      const secret = this.secrets.find(value => this.pending.startsWith(value, index));
      if (secret) {
        output += '[redacted]';
        // A full match can cross the carry boundary; never emit half a match.
        index += secret.length;
      } else {
        const point = this.pending.codePointAt(index)!;
        output += String.fromCodePoint(point);
        index += point > 0xffff ? 2 : 1;
      }
    }
    this.pending = this.pending.slice(index);
    this.text += output;
    if (Buffer.byteLength(this.text) > this.limit) {
      const bytes = Buffer.from(this.text).subarray(-this.limit);
      let start = 0;
      while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++;
      this.text = bytes.subarray(start).toString('utf8');
      this.truncated = true;
    }
    return output;
  }
}
