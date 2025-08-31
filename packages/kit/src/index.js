// src/core/prompts/prompt.ts
import { erase, cursor as cursor2 } from "sisteransi";
import { stdin as stdin2, stdout as stdout2 } from "node:process";
import readline2 from "node:readline";

// src/core/utils/string-truncated-width.ts
var isFullWidth = (x) => x === 12288 || x >= 65281 && x <= 65376 || x >= 65504 && x <= 65510;
var isWideNotCJKTNotEmoji = (x) => x === 8987 || x === 9001 || x >= 12272 && x <= 12287 || x >= 12289 && x <= 12350 || x >= 12441 && x <= 12543 || x >= 12549 && x <= 12591 || x >= 12593 && x <= 12686 || x >= 12688 && x <= 12771 || x >= 12783 && x <= 12830 || x >= 12832 && x <= 12871 || x >= 12880 && x <= 19903 || x >= 65040 && x <= 65049 || x >= 65072 && x <= 65106 || x >= 65108 && x <= 65126 || x >= 65128 && x <= 65131 || x >= 127488 && x <= 127490 || x >= 127504 && x <= 127547 || x >= 127552 && x <= 127560 || x >= 131072 && x <= 196605 || x >= 196608 && x <= 262141;
var ANSI_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]|\u001b\]8;[^;]*;.*?(?:\u0007|\u001b\u005c)/y;
var CONTROL_RE = /[\x00-\x08\x0A-\x1F\x7F-\x9F]{1,1000}/y;
var CJKT_WIDE_RE = /(?:(?![\uFF61-\uFF9F\uFF00-\uFFEF])[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Tangut}]){1,1000}/yu;
var TAB_RE = /\t{1,1000}/y;
var EMOJI_RE = /[\u{1F1E6}-\u{1F1FF}]{2}|\u{1F3F4}[\u{E0061}-\u{E007A}]{2}[\u{E0030}-\u{E0039}\u{E0061}-\u{E007A}]{1,3}\u{E007F}|(?:\p{Emoji}\uFE0F\u20E3?|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Presentation})(?:\u200D(?:\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Presentation}|\p{Emoji}\uFE0F\u20E3?))*/yu;
var LATIN_RE = /(?:[\x20-\x7E\xA0-\xFF](?!\uFE0F)){1,1000}/y;
var MODIFIER_RE = /\p{M}+/gu;
var NO_TRUNCATION = { limit: Infinity, ellipsis: "" };
var getStringTruncatedWidth = (input, truncationOptions = {}, widthOptions = {}) => {
  const LIMIT = truncationOptions.limit ?? Infinity;
  const ELLIPSIS = truncationOptions.ellipsis ?? "";
  const ELLIPSIS_WIDTH = truncationOptions?.ellipsisWidth ?? (ELLIPSIS ? getStringTruncatedWidth(ELLIPSIS, NO_TRUNCATION, widthOptions).width : 0);
  const ANSI_WIDTH = 0;
  const CONTROL_WIDTH = widthOptions.controlWidth ?? 0;
  const TAB_WIDTH = widthOptions.tabWidth ?? 8;
  const EMOJI_WIDTH = widthOptions.emojiWidth ?? 2;
  const FULL_WIDTH_WIDTH = 2;
  const REGULAR_WIDTH = widthOptions.regularWidth ?? 1;
  const WIDE_WIDTH = widthOptions.wideWidth ?? FULL_WIDTH_WIDTH;
  const PARSE_BLOCKS = [
    [LATIN_RE, REGULAR_WIDTH],
    [ANSI_RE, ANSI_WIDTH],
    [CONTROL_RE, CONTROL_WIDTH],
    [TAB_RE, TAB_WIDTH],
    [EMOJI_RE, EMOJI_WIDTH],
    [CJKT_WIDE_RE, WIDE_WIDTH]
  ];
  let indexPrev = 0;
  let index = 0;
  const length = input.length;
  let lengthExtra = 0;
  let truncationEnabled = false;
  let truncationIndex = length;
  const truncationLimit = Math.max(0, LIMIT - ELLIPSIS_WIDTH);
  let unmatchedStart = 0;
  let unmatchedEnd = 0;
  let width = 0;
  let widthExtra = 0;
  outer:
    while (true) {
      if (unmatchedEnd > unmatchedStart || index >= length && index > indexPrev) {
        const unmatched = input.slice(unmatchedStart, unmatchedEnd) || input.slice(indexPrev, index);
        lengthExtra = 0;
        for (const char of unmatched.replaceAll(MODIFIER_RE, "")) {
          const codePoint = char.codePointAt(0) || 0;
          if (isFullWidth(codePoint)) {
            widthExtra = FULL_WIDTH_WIDTH;
          } else if (isWideNotCJKTNotEmoji(codePoint)) {
            widthExtra = WIDE_WIDTH;
          } else {
            widthExtra = REGULAR_WIDTH;
          }
          if (width + widthExtra > truncationLimit) {
            truncationIndex = Math.min(truncationIndex, Math.max(unmatchedStart, indexPrev) + lengthExtra);
          }
          if (width + widthExtra > LIMIT) {
            truncationEnabled = true;
            break outer;
          }
          lengthExtra += char.length;
          width += widthExtra;
        }
        unmatchedStart = unmatchedEnd = 0;
      }
      if (index >= length) {
        break outer;
      }
      for (let i = 0, l = PARSE_BLOCKS.length;i < l; i++) {
        const block = PARSE_BLOCKS[i];
        if (!block)
          continue;
        const [BLOCK_RE, BLOCK_WIDTH] = block;
        BLOCK_RE.lastIndex = index;
        if (BLOCK_RE.test(input)) {
          lengthExtra = BLOCK_RE === EMOJI_RE ? 1 : BLOCK_RE.lastIndex - index;
          widthExtra = lengthExtra * BLOCK_WIDTH;
          if (width + widthExtra > truncationLimit) {
            truncationIndex = Math.min(truncationIndex, index + Math.floor((truncationLimit - width) / BLOCK_WIDTH));
          }
          if (width + widthExtra > LIMIT) {
            truncationEnabled = true;
            break outer;
          }
          width += widthExtra;
          unmatchedStart = indexPrev;
          unmatchedEnd = index;
          index = indexPrev = BLOCK_RE.lastIndex;
          continue outer;
        }
      }
      index += 1;
    }
  return {
    width: truncationEnabled ? truncationLimit : width,
    index: truncationEnabled ? truncationIndex : length,
    truncated: truncationEnabled,
    ellipsed: truncationEnabled && LIMIT >= ELLIPSIS_WIDTH
  };
};
var string_truncated_width_default = getStringTruncatedWidth;

// src/core/utils/string-width.ts
var NO_TRUNCATION2 = {
  limit: Infinity,
  ellipsis: "",
  ellipsisWidth: 0
};
var fastStringWidth = (input, options = {}) => string_truncated_width_default(input, NO_TRUNCATION2, options).width;
var string_width_default = fastStringWidth;

// src/core/utils/wrap-ansi.ts
var ESC = "\x1B";
var CSI = "";
var END_CODE = 39;
var ANSI_ESCAPE_BELL = "\x07";
var ANSI_CSI = "[";
var ANSI_OSC = "]";
var ANSI_SGR_TERMINATOR = "m";
var ANSI_ESCAPE_LINK = `${ANSI_OSC}8;;`;
var GROUP_REGEX = new RegExp(`(?:\\${ANSI_CSI}(?<code>\\d+)m|\\${ANSI_ESCAPE_LINK}(?<uri>.*)${ANSI_ESCAPE_BELL})`, "y");
var getClosingCode = (openingCode) => {
  if (openingCode >= 30 && openingCode <= 37)
    return 39;
  if (openingCode >= 90 && openingCode <= 97)
    return 39;
  if (openingCode >= 40 && openingCode <= 47)
    return 49;
  if (openingCode >= 100 && openingCode <= 107)
    return 49;
  if (openingCode === 1 || openingCode === 2)
    return 22;
  if (openingCode === 3)
    return 23;
  if (openingCode === 4)
    return 24;
  if (openingCode === 7)
    return 27;
  if (openingCode === 8)
    return 28;
  if (openingCode === 9)
    return 29;
  if (openingCode === 0)
    return 0;
  return;
};
var wrapAnsiCode = (code) => `${ESC}${ANSI_CSI}${code}${ANSI_SGR_TERMINATOR}`;
var wrapAnsiHyperlink = (url) => `${ESC}${ANSI_ESCAPE_LINK}${url}${ANSI_ESCAPE_BELL}`;
var wordLengths = (words) => words.map((character) => string_width_default(character));
var wrapWord = (rows, word, columns) => {
  const characters = word[Symbol.iterator]();
  let isInsideEscape = false;
  let isInsideLinkEscape = false;
  let lastRow = rows.at(-1);
  let visible = lastRow === undefined ? 0 : string_width_default(lastRow);
  let currentCharacter = characters.next();
  let nextCharacter = characters.next();
  let rawCharacterIndex = 0;
  while (!currentCharacter.done) {
    const character = currentCharacter.value;
    const characterLength = string_width_default(character);
    if (visible + characterLength <= columns) {
      rows[rows.length - 1] += character;
    } else {
      rows.push(character);
      visible = 0;
    }
    if (character === ESC || character === CSI) {
      isInsideEscape = true;
      isInsideLinkEscape = word.startsWith(ANSI_ESCAPE_LINK, rawCharacterIndex + 1);
    }
    if (isInsideEscape) {
      if (isInsideLinkEscape) {
        if (character === ANSI_ESCAPE_BELL) {
          isInsideEscape = false;
          isInsideLinkEscape = false;
        }
      } else if (character === ANSI_SGR_TERMINATOR) {
        isInsideEscape = false;
      }
    } else {
      visible += characterLength;
      if (visible === columns && !nextCharacter.done) {
        rows.push("");
        visible = 0;
      }
    }
    currentCharacter = nextCharacter;
    nextCharacter = characters.next();
    rawCharacterIndex += character.length;
  }
  lastRow = rows.at(-1);
  if (!visible && lastRow !== undefined && lastRow.length > 0 && rows.length > 1) {
    const popped = rows.pop();
    if (popped !== undefined && rows[rows.length - 1] !== undefined) {
      rows[rows.length - 1] += popped;
    }
  }
};
var stringVisibleTrimSpacesRight = (string) => {
  const words = string.split(" ");
  let last = words.length;
  while (last > 0) {
    const word = words[last - 1];
    if (word !== undefined && string_width_default(word) > 0) {
      break;
    }
    last--;
  }
  if (last === words.length) {
    return string;
  }
  return words.slice(0, last).join(" ") + words.slice(last).join("");
};
var exec = (string, columns, options = {}) => {
  if (options.trim !== false && string.trim() === "") {
    return "";
  }
  let returnValue = "";
  let escapeCode;
  let escapeUrl;
  const words = string.split(" ");
  const lengths = wordLengths(words);
  let rows = [""];
  for (const [index, word] of words.entries()) {
    if (options.trim !== false) {
      rows[rows.length - 1] = (rows.at(-1) ?? "").trimStart();
    }
    let rowLength = string_width_default(rows.at(-1) ?? "");
    if (index !== 0) {
      if (rowLength >= columns && (options.wordWrap === false || options.trim === false)) {
        rows.push("");
        rowLength = 0;
      }
      if (rowLength > 0 || options.trim === false) {
        rows[rows.length - 1] += " ";
        rowLength++;
      }
    }
    const wordLength = lengths[index] ?? 0;
    if (options.hard && wordLength > columns) {
      const remainingColumns = columns - rowLength;
      const breaksStartingThisLine = 1 + Math.floor((wordLength - remainingColumns - 1) / columns);
      const breaksStartingNextLine = Math.floor((wordLength - 1) / columns);
      if (breaksStartingNextLine < breaksStartingThisLine) {
        rows.push("");
      }
      wrapWord(rows, word, columns);
      continue;
    }
    if (rowLength + wordLength > columns && rowLength > 0 && wordLength > 0) {
      if (options.wordWrap === false && rowLength < columns) {
        wrapWord(rows, word, columns);
        continue;
      }
      rows.push("");
    }
    if (rowLength + wordLength > columns && options.wordWrap === false) {
      wrapWord(rows, word, columns);
      continue;
    }
    rows[rows.length - 1] += word;
  }
  if (options.trim !== false) {
    rows = rows.map((row) => stringVisibleTrimSpacesRight(row));
  }
  const preString = rows.join(`
`);
  const pre = preString[Symbol.iterator]();
  let currentPre = pre.next();
  let nextPre = pre.next();
  let preStringIndex = 0;
  while (!currentPre.done) {
    const character = currentPre.value;
    const nextCharacter = nextPre.value;
    returnValue += character;
    if (character === ESC || character === CSI) {
      GROUP_REGEX.lastIndex = preStringIndex + 1;
      const groupsResult = GROUP_REGEX.exec(preString);
      const groups = groupsResult?.groups;
      if (groups?.["code"] !== undefined) {
        const code = Number.parseFloat(groups["code"]);
        escapeCode = code === END_CODE ? undefined : code;
      } else if (groups?.["uri"] !== undefined) {
        escapeUrl = groups["uri"].length === 0 ? undefined : groups["uri"];
      }
    }
    const closingCode = escapeCode ? getClosingCode(escapeCode) : undefined;
    if (nextCharacter === `
`) {
      if (escapeUrl) {
        returnValue += wrapAnsiHyperlink("");
      }
      if (escapeCode && closingCode) {
        returnValue += wrapAnsiCode(closingCode);
      }
    } else if (character === `
`) {
      if (escapeCode && closingCode) {
        returnValue += wrapAnsiCode(escapeCode);
      }
      if (escapeUrl) {
        returnValue += wrapAnsiHyperlink(escapeUrl);
      }
    }
    preStringIndex += character.length;
    currentPre = nextPre;
    nextPre = pre.next();
  }
  return returnValue;
};
function wrapAnsi(string, columns, options) {
  return String(string).normalize().replaceAll(`\r
`, `
`).split(`
`).map((line) => exec(line, columns, options)).join(`
`);
}

// src/core/utils/index.ts
import { cursor } from "sisteransi";
import * as readline from "node:readline";
import { stdin, stdout } from "node:process";
import { ReadStream, WriteStream } from "node:tty";

// src/core/utils/settings.ts
var actions = ["up", "down", "left", "right", "space", "enter", "cancel"];
var settings = {
  actions: new Set(actions),
  aliases: new Map([
    ["k", "up"],
    ["j", "down"],
    ["h", "left"],
    ["l", "right"],
    ["\x03", "cancel"],
    ["escape", "cancel"]
  ]),
  messages: {
    cancel: "Canceled",
    error: "Something went wrong"
  }
};
function updateSettings(updates) {
  if (updates.aliases !== undefined) {
    const aliases = updates.aliases;
    for (const alias in aliases) {
      if (!Object.hasOwn(aliases, alias))
        continue;
      const action = aliases[alias];
      if (!action || !settings.actions.has(action))
        continue;
      if (!settings.aliases.has(alias)) {
        settings.aliases.set(alias, action);
      }
    }
  }
  if (updates.messages !== undefined) {
    const messages = updates.messages;
    if (messages.cancel !== undefined) {
      settings.messages.cancel = messages.cancel;
    }
    if (messages.error !== undefined) {
      settings.messages.error = messages.error;
    }
  }
}
function isActionKey(key, action) {
  if (typeof key === "string") {
    return settings.aliases.get(key) === action;
  }
  for (const value of key) {
    if (value === undefined)
      continue;
    if (isActionKey(value, action)) {
      return true;
    }
  }
  return false;
}

// src/core/utils/string.ts
function diffLines(a, b) {
  if (a === b)
    return;
  const aLines = a.split(`
`);
  const bLines = b.split(`
`);
  const diff = [];
  for (let i = 0;i < Math.max(aLines.length, bLines.length); i++) {
    if (aLines[i] !== bLines[i])
      diff.push(i);
  }
  return diff;
}

// src/core/utils/index.ts
var isWindows = globalThis.process.platform.startsWith("win");
var CANCEL_SYMBOL = Symbol("clack:cancel");
function isCancel(value) {
  return value === CANCEL_SYMBOL;
}
function setRawMode(input, value) {
  const i = input;
  if (i.isTTY)
    i.setRawMode(value);
}
function block({
  input = stdin,
  output = stdout,
  overwrite = true,
  hideCursor = true
} = {}) {
  const rl = readline.createInterface({
    input,
    output,
    prompt: "",
    tabSize: 1
  });
  readline.emitKeypressEvents(input, rl);
  if (input instanceof ReadStream && input.isTTY) {
    input.setRawMode(true);
  }
  const clear = (data, { name, sequence }) => {
    const str = String(data);
    if (isActionKey([str, name, sequence], "cancel")) {
      if (hideCursor)
        output.write(cursor.show);
      process.exit(0);
      return;
    }
    if (!overwrite)
      return;
    const dx = name === "return" ? 0 : -1;
    const dy = name === "return" ? -1 : 0;
    readline.moveCursor(output, dx, dy, () => {
      readline.clearLine(output, 1, () => {
        input.once("keypress", clear);
      });
    });
  };
  if (hideCursor)
    output.write(cursor.hide);
  input.once("keypress", clear);
  return () => {
    input.off("keypress", clear);
    if (hideCursor)
      output.write(cursor.show);
    if (input instanceof ReadStream && input.isTTY && !isWindows) {
      input.setRawMode(false);
    }
    rl.terminal = false;
    rl.close();
  };
}
var getColumns = (output) => {
  if (output instanceof WriteStream && output.columns) {
    return output.columns;
  }
  return 80;
};

// src/core/prompts/prompt.ts
class Prompt {
  input;
  output;
  _abortSignal;
  rl;
  opts;
  _render;
  _track = false;
  _prevFrame = "";
  _subscribers = new Map;
  _cursor = 0;
  state = "initial";
  error = "";
  value;
  userInput = "";
  constructor(options, trackValue = true) {
    const { input = stdin2, output = stdout2, render, signal, ...opts } = options;
    this.opts = opts;
    this.onKeypress = this.onKeypress.bind(this);
    this.close = this.close.bind(this);
    this.render = this.render.bind(this);
    this._render = render.bind(this);
    this._track = trackValue;
    this._abortSignal = signal;
    this.input = input;
    this.output = output;
  }
  unsubscribe() {
    this._subscribers.clear();
  }
  setSubscriber(event, opts) {
    const params = this._subscribers.get(event) ?? [];
    params.push(opts);
    this._subscribers.set(event, params);
  }
  on(event, cb) {
    this.setSubscriber(event, { cb });
  }
  once(event, cb) {
    this.setSubscriber(event, { cb, once: true });
  }
  emit(event, ...data) {
    const cbs = this._subscribers.get(event) ?? [];
    const cleanup = [];
    for (const subscriber of cbs) {
      subscriber.cb(...data);
      if (subscriber.once) {
        cleanup.push(() => cbs.splice(cbs.indexOf(subscriber), 1));
      }
    }
    for (const cb of cleanup) {
      cb();
    }
  }
  prompt() {
    return new Promise((resolve) => {
      if (this._abortSignal) {
        if (this._abortSignal.aborted) {
          this.state = "cancel";
          this.close();
          return resolve(CANCEL_SYMBOL);
        }
        this._abortSignal.addEventListener("abort", () => {
          this.state = "cancel";
          this.close();
        }, { once: true });
      }
      this.rl = readline2.createInterface({
        input: this.input,
        tabSize: 2,
        prompt: "",
        escapeCodeTimeout: 50,
        terminal: true
      });
      this.rl.prompt();
      if (this.opts.initialUserInput !== undefined) {
        this._setUserInput(this.opts.initialUserInput, true);
      }
      this.input.on("keypress", this.onKeypress);
      setRawMode(this.input, true);
      this.output.on("resize", this.render);
      this.render();
      this.once("submit", () => {
        this.output.write(cursor2.show);
        this.output.off("resize", this.render);
        setRawMode(this.input, false);
        resolve(this.value);
      });
      this.once("cancel", () => {
        this.output.write(cursor2.show);
        this.output.off("resize", this.render);
        setRawMode(this.input, false);
        resolve(CANCEL_SYMBOL);
      });
    });
  }
  _isActionKey(char, _key) {
    return char === "\t";
  }
  _setValue(value) {
    this.value = value;
    this.emit("value", this.value);
  }
  _setUserInput(value, write) {
    this.userInput = value ?? "";
    this.emit("userInput", this.userInput);
    if (write && this._track && this.rl) {
      this.rl.write(this.userInput);
      this._cursor = this.rl.cursor;
    }
  }
  _clearUserInput() {
    this.rl?.write(null, { ctrl: true, name: "u" });
    this._setUserInput("");
  }
  onKeypress(char, key) {
    if (this._track && key.name !== "return") {
      if (key.name && this._isActionKey(char, key)) {
        this.rl?.write(null, { ctrl: true, name: "h" });
      }
      this._cursor = this.rl?.cursor ?? 0;
      this._setUserInput(this.rl?.line);
    }
    if (this.state === "error") {
      this.state = "active";
    }
    if (key?.name) {
      if (!this._track && settings.aliases.has(key.name)) {
        this.emit("cursor", settings.aliases.get(key.name));
      }
      if (settings.actions.has(key.name)) {
        this.emit("cursor", key.name);
      }
    }
    if (char && (char.toLowerCase() === "y" || char.toLowerCase() === "n")) {
      this.emit("confirm", char.toLowerCase() === "y");
    }
    this.emit("key", char?.toLowerCase(), key);
    if (key?.name === "return") {
      if (this.opts.validate) {
        const problem = this.opts.validate(this.value);
        if (problem) {
          this.error = problem instanceof Error ? problem.message : problem;
          this.state = "error";
          this.rl?.write(this.userInput);
        }
      }
      if (this.state !== "error") {
        this.state = "submit";
      }
    }
    if (isActionKey([char, key?.name, key?.sequence], "cancel")) {
      this.state = "cancel";
    }
    if (this.state === "submit" || this.state === "cancel") {
      this.emit("finalize");
    }
    this.render();
    if (this.state === "submit" || this.state === "cancel") {
      this.close();
    }
  }
  close() {
    this.input.unpipe();
    this.input.removeListener("keypress", this.onKeypress);
    this.output.write(`
`);
    setRawMode(this.input, false);
    this.rl?.close();
    this.rl = undefined;
    this.emit(`${this.state}`, this.value);
    this.unsubscribe();
  }
  restoreCursor() {
    const lines = wrapAnsi(this._prevFrame, process.stdout.columns, { hard: true, trim: false }).split(`
`).length - 1;
    this.output.write(cursor2.move(-999, lines * -1));
  }
  render() {
    const frame = wrapAnsi(this._render(this) ?? "", process.stdout.columns, {
      hard: true,
      trim: false
    });
    if (frame === this._prevFrame)
      return;
    if (this.state === "initial") {
      this.output.write(cursor2.hide);
    } else {
      const diff = diffLines(this._prevFrame, frame);
      this.restoreCursor();
      if (diff && diff?.length === 1) {
        const diffLine = diff[0];
        if (diffLine !== undefined) {
          this.output.write(cursor2.move(0, diffLine));
          this.output.write(erase.lines(1));
          const lines = frame.split(`
`);
          const line = lines[diffLine];
          if (line !== undefined) {
            this.output.write(line);
          }
          this._prevFrame = frame;
          this.output.write(cursor2.move(0, lines.length - diffLine - 1));
          return;
        }
      }
      if (diff && diff?.length > 1) {
        const diffLine = diff[0];
        if (diffLine !== undefined) {
          this.output.write(cursor2.move(0, diffLine));
          this.output.write(erase.down());
          const lines = frame.split(`
`);
          const newLines = lines.slice(diffLine);
          this.output.write(newLines.join(`
`));
          this._prevFrame = frame;
          return;
        }
      }
      this.output.write(erase.down());
    }
    this.output.write(frame);
    if (this.state === "initial") {
      this.state = "active";
    }
    this._prevFrame = frame;
  }
}
// src/core/prompts/text.ts
import color from "picocolors";
class TextPrompt extends Prompt {
  get userInputWithCursor() {
    if (this.state === "submit") {
      return this.userInput;
    }
    const userInput = this.userInput;
    if (this.cursor >= userInput.length) {
      return `${this.userInput}█`;
    }
    const s1 = userInput.slice(0, this.cursor);
    const [s2, ...s3] = userInput.slice(this.cursor);
    return `${s1}${color.inverse(s2)}${s3.join("")}`;
  }
  get cursor() {
    return this._cursor;
  }
  constructor(opts) {
    super({
      ...opts,
      initialUserInput: opts.initialUserInput ?? opts.initialValue
    });
    this.on("userInput", (input) => {
      this._setValue(input);
    });
    this.on("finalize", () => {
      if (!this.value) {
        this.value = opts.defaultValue;
      }
      if (this.value === undefined) {
        this.value = "";
      }
    });
  }
}
// src/core/prompts/select.ts
class SelectPrompt extends Prompt {
  options;
  cursor = 0;
  get _selectedValue() {
    const option = this.options[this.cursor];
    if (!option)
      throw new Error("No option at cursor position");
    return option;
  }
  changeValue() {
    this.value = this._selectedValue.value;
  }
  constructor(opts) {
    super(opts, false);
    this.options = opts.options;
    this.cursor = this.options.findIndex(({ value }) => value === opts.initialValue);
    if (this.cursor === -1)
      this.cursor = 0;
    this.changeValue();
    this.on("cursor", (key) => {
      switch (key) {
        case "left":
        case "up":
          this.cursor = this.cursor === 0 ? this.options.length - 1 : this.cursor - 1;
          break;
        case "down":
        case "right":
          this.cursor = this.cursor === this.options.length - 1 ? 0 : this.cursor + 1;
          break;
      }
      this.changeValue();
    });
  }
}
// src/core/prompts/confirm.ts
import { cursor as cursor3 } from "sisteransi";
class ConfirmPrompt extends Prompt {
  get cursor() {
    return this.value ? 0 : 1;
  }
  get _value() {
    return this.cursor === 0;
  }
  constructor(opts) {
    super(opts, false);
    this.value = !!opts.initialValue;
    this.on("userInput", () => {
      this.value = this._value;
    });
    this.on("confirm", (confirm) => {
      this.output.write(cursor3.move(0, -1));
      this.value = confirm;
      this.state = "submit";
      this.close();
    });
    this.on("cursor", () => {
      this.value = !this.value;
    });
  }
}
// src/core/prompts/password.ts
import color2 from "picocolors";
class PasswordPrompt extends Prompt {
  _mask = "•";
  get cursor() {
    return this._cursor;
  }
  get masked() {
    return this.userInput.replaceAll(/./g, this._mask);
  }
  get userInputWithCursor() {
    if (this.state === "submit" || this.state === "cancel") {
      return this.masked;
    }
    const userInput = this.userInput;
    if (this.cursor >= userInput.length) {
      return `${this.masked}${color2.inverse(color2.hidden("_"))}`;
    }
    const masked = this.masked;
    const s1 = masked.slice(0, this.cursor);
    const s2 = masked.slice(this.cursor);
    return `${s1}${color2.inverse(s2[0])}${s2.slice(1)}`;
  }
  clear() {
    this._clearUserInput();
  }
  constructor({ mask, ...opts }) {
    super(opts);
    this._mask = mask ?? "•";
    this.on("userInput", (input) => {
      this._setValue(input);
    });
  }
}
// src/core/prompts/select-key.ts
class SelectKeyPrompt extends Prompt {
  options;
  cursor = 0;
  constructor(opts) {
    super(opts, false);
    this.options = opts.options;
    const keys = this.options.map(({ value: [initial] }) => initial?.toLowerCase());
    this.cursor = Math.max(keys.indexOf(opts.initialValue), 0);
    this.on("key", (key) => {
      if (!key || !keys.includes(key))
        return;
      const value = this.options.find(({ value: [initial] }) => initial?.toLowerCase() === key);
      if (value) {
        this.value = value.value;
        this.state = "submit";
        this.emit("submit");
      }
    });
  }
}
// src/core/prompts/multi-select.ts
class MultiSelectPrompt extends Prompt {
  options;
  cursor = 0;
  get _value() {
    const option = this.options[this.cursor];
    if (!option)
      throw new Error("No option at cursor position");
    return option.value;
  }
  toggleAll() {
    const allSelected = this.value !== undefined && this.value.length === this.options.length;
    this.value = allSelected ? [] : this.options.map((v) => v.value);
  }
  toggleInvert() {
    const currentValue = this.value || [];
    const notSelected = this.options.filter((v) => !currentValue.includes(v.value));
    this.value = notSelected.map((v) => v.value);
  }
  toggleValue() {
    if (this.value === undefined) {
      this.value = [];
    }
    const selected = this.value.includes(this._value);
    this.value = selected ? this.value.filter((value) => value !== this._value) : [...this.value, this._value];
  }
  constructor(opts) {
    super(opts, false);
    this.options = opts.options;
    this.value = [...opts.initialValues ?? []];
    this.cursor = Math.max(this.options.findIndex(({ value }) => value === opts.cursorAt), 0);
    this.on("key", (char) => {
      if (char === "a") {
        this.toggleAll();
      }
      if (char === "i") {
        this.toggleInvert();
      }
    });
    this.on("cursor", (key) => {
      switch (key) {
        case "left":
        case "up":
          this.cursor = this.cursor === 0 ? this.options.length - 1 : this.cursor - 1;
          break;
        case "down":
        case "right":
          this.cursor = this.cursor === this.options.length - 1 ? 0 : this.cursor + 1;
          break;
        case "space":
          this.toggleValue();
          break;
      }
    });
  }
}
// src/core/prompts/autocomplete.ts
import color3 from "picocolors";
function getCursorForValue(selected, items) {
  if (selected === undefined) {
    return 0;
  }
  const currLength = items.length;
  if (currLength === 0) {
    return 0;
  }
  const index = items.findIndex((item) => item.value === selected);
  return index !== -1 ? index : 0;
}
function defaultFilter(input, option) {
  const label = option.label ?? String(option.value);
  return label.toLowerCase().includes(input.toLowerCase());
}
function normalisedValue(multiple, values) {
  if (!values) {
    return;
  }
  if (multiple) {
    return values;
  }
  return values[0];
}

class AutocompletePrompt extends Prompt {
  filteredOptions;
  multiple;
  isNavigating = false;
  selectedValues = [];
  focusedValue;
  #cursor = 0;
  #lastUserInput = "";
  #filterFn;
  #options;
  get cursor() {
    return this.#cursor;
  }
  get userInputWithCursor() {
    if (!this.userInput) {
      return color3.inverse(color3.hidden("_"));
    }
    if (this._cursor >= this.userInput.length) {
      return `${this.userInput}█`;
    }
    const s1 = this.userInput.slice(0, this._cursor);
    const [s2, ...s3] = this.userInput.slice(this._cursor);
    return `${s1}${color3.inverse(s2)}${s3.join("")}`;
  }
  get options() {
    if (typeof this.#options === "function") {
      return this.#options();
    }
    return this.#options;
  }
  constructor(opts) {
    super(opts);
    this.#options = opts.options;
    const options = this.options;
    this.filteredOptions = [...options];
    this.multiple = opts.multiple === true;
    this.#filterFn = opts.filter ?? defaultFilter;
    let initialValues;
    if (opts.initialValue && Array.isArray(opts.initialValue)) {
      if (this.multiple) {
        initialValues = opts.initialValue;
      } else {
        initialValues = opts.initialValue.slice(0, 1);
      }
    } else {
      if (!this.multiple && this.options.length > 0 && this.options[0]) {
        initialValues = [this.options[0].value];
      }
    }
    if (initialValues) {
      for (const selectedValue of initialValues) {
        const selectedIndex = options.findIndex((opt) => opt.value === selectedValue);
        if (selectedIndex !== -1) {
          this.toggleSelected(selectedValue);
          this.#cursor = selectedIndex;
        }
      }
    }
    this.focusedValue = this.options[this.#cursor]?.value;
    this.on("key", (char, key) => this.#onKey(char, key));
    this.on("userInput", (value) => this.#onUserInputChanged(value));
  }
  _isActionKey(char, key) {
    return char === "\t" || this.multiple && this.isNavigating && key.name === "space" && char !== undefined && char !== "";
  }
  #onKey(_char, key) {
    const isUpKey = key.name === "up";
    const isDownKey = key.name === "down";
    const isReturnKey = key.name === "return";
    if (isUpKey || isDownKey) {
      this.#cursor = Math.max(0, Math.min(this.#cursor + (isUpKey ? -1 : 1), this.filteredOptions.length - 1));
      this.focusedValue = this.filteredOptions[this.#cursor]?.value;
      if (!this.multiple) {
        this.selectedValues = [this.focusedValue];
      }
      this.isNavigating = true;
    } else if (isReturnKey) {
      this.value = normalisedValue(this.multiple, this.selectedValues);
    } else {
      if (this.multiple) {
        if (this.focusedValue !== undefined && (key.name === "tab" || this.isNavigating && key.name === "space")) {
          this.toggleSelected(this.focusedValue);
        } else {
          this.isNavigating = false;
        }
      } else {
        if (this.focusedValue) {
          this.selectedValues = [this.focusedValue];
        }
        this.isNavigating = false;
      }
    }
  }
  deselectAll() {
    this.selectedValues = [];
  }
  toggleSelected(value) {
    if (this.filteredOptions.length === 0) {
      return;
    }
    if (this.multiple) {
      if (this.selectedValues.includes(value)) {
        this.selectedValues = this.selectedValues.filter((v) => v !== value);
      } else {
        this.selectedValues = [...this.selectedValues, value];
      }
    } else {
      this.selectedValues = [value];
    }
  }
  #onUserInputChanged(value) {
    if (value !== this.#lastUserInput) {
      this.#lastUserInput = value;
      const options = this.options;
      if (value) {
        this.filteredOptions = options.filter((opt) => this.#filterFn(value, opt));
      } else {
        this.filteredOptions = [...options];
      }
      this.#cursor = getCursorForValue(this.focusedValue, this.filteredOptions);
      this.focusedValue = this.filteredOptions[this.#cursor]?.value;
      if (!this.multiple) {
        if (this.focusedValue !== undefined) {
          this.toggleSelected(this.focusedValue);
        } else {
          this.deselectAll();
        }
      }
    }
  }
}
// src/core/prompts/group-multiselect.ts
class GroupMultiSelectPrompt extends Prompt {
  options;
  cursor = 0;
  #selectableGroups;
  getGroupItems(group) {
    return this.options.filter((o) => o.group === group);
  }
  isGroupSelected(group) {
    const items = this.getGroupItems(group);
    const value = this.value;
    if (value === undefined) {
      return false;
    }
    return items.every((i) => value.includes(i.value));
  }
  toggleValue() {
    const item = this.options[this.cursor];
    if (!item)
      return;
    if (this.value === undefined) {
      this.value = [];
    }
    if (item.group === true) {
      const group = item.value;
      const groupedItems = this.getGroupItems(group);
      if (this.isGroupSelected(group)) {
        this.value = this.value.filter((v) => groupedItems.findIndex((i) => i.value === v) === -1);
      } else {
        this.value = [...this.value, ...groupedItems.map((i) => i.value)];
      }
      this.value = Array.from(new Set(this.value));
    } else {
      const selected = this.value.includes(item.value);
      this.value = selected ? this.value.filter((v) => v !== item.value) : [...this.value, item.value];
    }
  }
  constructor(opts) {
    super(opts, false);
    const { options } = opts;
    this.#selectableGroups = opts.selectableGroups !== false;
    this.options = Object.entries(options).flatMap(([key, option]) => [
      { value: key, group: true, label: key },
      ...option.map((opt) => ({ ...opt, group: key }))
    ]);
    this.value = [...opts.initialValues ?? []];
    this.cursor = Math.max(this.options.findIndex(({ value }) => value === opts.cursorAt), this.#selectableGroups ? 0 : 1);
    this.on("cursor", (key) => {
      switch (key) {
        case "left":
        case "up": {
          this.cursor = this.cursor === 0 ? this.options.length - 1 : this.cursor - 1;
          const currentIsGroup = this.options[this.cursor]?.group === true;
          if (!this.#selectableGroups && currentIsGroup) {
            this.cursor = this.cursor === 0 ? this.options.length - 1 : this.cursor - 1;
          }
          break;
        }
        case "down":
        case "right": {
          this.cursor = this.cursor === this.options.length - 1 ? 0 : this.cursor + 1;
          const currentIsGroup = this.options[this.cursor]?.group === true;
          if (!this.#selectableGroups && currentIsGroup) {
            this.cursor = this.cursor === this.options.length - 1 ? 0 : this.cursor + 1;
          }
          break;
        }
        case "space":
          this.toggleValue();
          break;
      }
    });
  }
}
// src/common.ts
import color4 from "picocolors";

// src/core/utils/is-unicode-supported.ts
import process2 from "node:process";
function isUnicodeSupported() {
  const { env } = process2;
  const { TERM, TERM_PROGRAM } = env;
  if (process2.platform !== "win32") {
    return TERM !== "linux";
  }
  return Boolean(env["WT_SESSION"]) || Boolean(env["TERMINUS_SUBLIME"]) || env["ConEmuTask"] === "{cmd::Cmder}" || TERM_PROGRAM === "Terminus-Sublime" || TERM_PROGRAM === "vscode" || TERM === "xterm-256color" || TERM === "alacritty" || TERM === "rxvt-unicode" || TERM === "rxvt-unicode-256color" || env["TERMINAL_EMULATOR"] === "JetBrains-JediTerm";
}

// src/common.ts
var unicode = isUnicodeSupported();
var isCI = () => process.env["CI"] === "true";
var isTTY = (output) => output.isTTY === true;
var unicodeOr = (c, fallback) => unicode ? c : fallback;
var S_STEP_ACTIVE = unicodeOr("◆", "*");
var S_STEP_CANCEL = unicodeOr("■", "x");
var S_STEP_ERROR = unicodeOr("▲", "x");
var S_STEP_SUBMIT = unicodeOr("◇", "o");
var S_BAR_START = unicodeOr("┌", "T");
var S_BAR = unicodeOr("│", "|");
var S_BAR_END = unicodeOr("└", "—");
var S_BAR_START_RIGHT = unicodeOr("┐", "T");
var S_BAR_END_RIGHT = unicodeOr("┘", "—");
var S_RADIO_ACTIVE = unicodeOr("●", ">");
var S_RADIO_INACTIVE = unicodeOr("○", " ");
var S_CHECKBOX_ACTIVE = unicodeOr("◻", "[•]");
var S_CHECKBOX_SELECTED = unicodeOr("◼", "[+]");
var S_CHECKBOX_INACTIVE = unicodeOr("◻", "[ ]");
var S_PASSWORD_MASK = unicodeOr("▪", "•");
var S_BAR_H = unicodeOr("─", "-");
var S_CORNER_TOP_RIGHT = unicodeOr("╮", "+");
var S_CONNECT_LEFT = unicodeOr("├", "+");
var S_CORNER_BOTTOM_RIGHT = unicodeOr("╯", "+");
var S_CORNER_BOTTOM_LEFT = unicodeOr("╰", "+");
var S_CORNER_TOP_LEFT = unicodeOr("╭", "+");
var S_INFO = unicodeOr("●", "•");
var S_SUCCESS = unicodeOr("◆", "*");
var S_WARN = unicodeOr("▲", "!");
var S_ERROR = unicodeOr("■", "x");
var symbol = (state) => {
  switch (state) {
    case "initial":
    case "active":
      return color4.cyan(S_STEP_ACTIVE);
    case "cancel":
      return color4.red(S_STEP_CANCEL);
    case "error":
      return color4.yellow(S_STEP_ERROR);
    case "submit":
      return color4.green(S_STEP_SUBMIT);
    default:
      return color4.gray(S_STEP_ACTIVE);
  }
};

// src/box.ts
var roundedSymbols = [
  S_CORNER_TOP_LEFT,
  S_CORNER_TOP_RIGHT,
  S_CORNER_BOTTOM_LEFT,
  S_CORNER_BOTTOM_RIGHT
];
var squareSymbols = [S_BAR_START, S_BAR_START_RIGHT, S_BAR_END, S_BAR_END_RIGHT];
function getPaddingForLine(lineLength, innerWidth, padding, contentAlign) {
  let leftPadding = padding;
  let rightPadding = padding;
  if (contentAlign === "center") {
    leftPadding = Math.floor((innerWidth - lineLength) / 2);
  } else if (contentAlign === "right") {
    leftPadding = innerWidth - lineLength - padding;
  }
  rightPadding = innerWidth - leftPadding - lineLength;
  return [leftPadding, rightPadding];
}
var defaultFormatBorder = (text) => text;
var box = (message = "", title = "", opts) => {
  const output = opts?.output ?? process.stdout;
  const columns = getColumns(output);
  const borderWidth = 1;
  const borderTotalWidth = borderWidth * 2;
  const titlePadding = opts?.titlePadding ?? 1;
  const contentPadding = opts?.contentPadding ?? 2;
  const width = opts?.width === undefined || opts.width === "auto" ? 1 : Math.min(1, opts.width);
  const linePrefix = opts?.includePrefix ? `${S_BAR} ` : "";
  const formatBorder = opts?.formatBorder ?? defaultFormatBorder;
  const symbols = ((opts?.rounded) ? roundedSymbols : squareSymbols).map(formatBorder);
  const hSymbol = formatBorder(S_BAR_H);
  const vSymbol = formatBorder(S_BAR);
  const maxBoxWidth = columns - string_width_default(linePrefix);
  let boxWidth = Math.floor(columns * width) - string_width_default(linePrefix);
  if (opts?.width === "auto") {
    const lines = message.split(`
`);
    let longestLine = string_width_default(title) + titlePadding * 2;
    for (const line of lines) {
      const lineWithPadding = string_width_default(line) + contentPadding * 2;
      if (lineWithPadding > longestLine) {
        longestLine = lineWithPadding;
      }
    }
    const longestLineWidth = longestLine + borderTotalWidth;
    if (longestLineWidth < boxWidth) {
      boxWidth = longestLineWidth;
    }
  }
  if (boxWidth % 2 !== 0) {
    if (boxWidth < maxBoxWidth) {
      boxWidth++;
    } else {
      boxWidth--;
    }
  }
  const innerWidth = boxWidth - borderTotalWidth;
  const maxTitleLength = innerWidth - titlePadding * 2;
  let truncatedTitle = title;
  if (string_width_default(title) > maxTitleLength) {
    let width2 = 0;
    let truncateAt = 0;
    for (const char of title) {
      width2 += string_width_default(char);
      if (width2 > maxTitleLength - 3) {
        break;
      }
      truncateAt++;
    }
    truncatedTitle = title.slice(0, truncateAt) + "...";
  }
  const [titlePaddingLeft, titlePaddingRight] = getPaddingForLine(string_width_default(truncatedTitle), innerWidth, titlePadding, opts?.titleAlign);
  const wrappedMessage = wrapAnsi(message, innerWidth - contentPadding * 2, {
    hard: true,
    trim: false
  });
  output.write(`${linePrefix}${symbols[0]}${hSymbol.repeat(titlePaddingLeft)}${truncatedTitle}${hSymbol.repeat(titlePaddingRight)}${symbols[1]}
`);
  const wrappedLines = wrappedMessage.split(`
`);
  for (const line of wrappedLines) {
    const [leftLinePadding, rightLinePadding] = getPaddingForLine(string_width_default(line), innerWidth, contentPadding, opts?.contentAlign);
    output.write(`${linePrefix}${vSymbol}${" ".repeat(leftLinePadding)}${line}${" ".repeat(rightLinePadding)}${vSymbol}
`);
  }
  output.write(`${linePrefix}${symbols[2]}${hSymbol.repeat(innerWidth)}${symbols[3]}
`);
};
// src/log.ts
import color5 from "picocolors";
var log = {
  message: (message = [], {
    symbol: symbol2 = color5.gray(S_BAR),
    secondarySymbol = color5.gray(S_BAR),
    output = process.stdout,
    spacing = 1
  } = {}) => {
    const parts = [];
    for (let i = 0;i < spacing; i++) {
      parts.push(`${secondarySymbol}`);
    }
    const messageParts = Array.isArray(message) ? message : message.split(`
`);
    if (messageParts.length > 0) {
      const [firstLine, ...lines] = messageParts;
      if (firstLine && firstLine.length > 0) {
        parts.push(`${symbol2}  ${firstLine}`);
      } else {
        parts.push(symbol2);
      }
      for (const ln of lines) {
        if (ln.length > 0) {
          parts.push(`${secondarySymbol}  ${ln}`);
        } else {
          parts.push(secondarySymbol);
        }
      }
    }
    output.write(`${parts.join(`
`)}
`);
  },
  info: (message, opts) => {
    log.message(message, { ...opts, symbol: color5.blue(S_INFO) });
  },
  success: (message, opts) => {
    log.message(message, { ...opts, symbol: color5.green(S_SUCCESS) });
  },
  step: (message, opts) => {
    log.message(message, { ...opts, symbol: color5.green(S_STEP_SUBMIT) });
  },
  warn: (message, opts) => {
    log.message(message, { ...opts, symbol: color5.yellow(S_WARN) });
  },
  warning: (message, opts) => {
    log.warn(message, opts);
  },
  error: (message, opts) => {
    log.message(message, { ...opts, symbol: color5.red(S_ERROR) });
  }
};
// src/note.ts
import color6 from "picocolors";
import process3 from "node:process";
var defaultNoteFormatter = (line) => color6.dim(line);
var wrapWithFormat = (message, width, format) => {
  const wrapMsg = wrapAnsi(message, width).split(`
`);
  const maxWidthNormal = wrapMsg.reduce((sum, ln) => Math.max(string_width_default(ln), sum), 0);
  const formatFn = format ?? ((line) => line);
  const maxWidthFormat = wrapMsg.map(formatFn).reduce((sum, ln) => Math.max(string_width_default(ln), sum), 0);
  const wrapWidth = width - (maxWidthFormat - maxWidthNormal);
  return wrapAnsi(message, wrapWidth);
};
var note = (message = "", title = "", opts) => {
  const output = opts?.output ?? process3.stdout;
  const format = opts?.format ?? defaultNoteFormatter;
  const columns = output.columns ?? 80;
  const wrapMsg = wrapWithFormat(message, columns - 6, format);
  const lines = ["", ...wrapMsg.split(`
`).map(format), ""];
  const titleLen = string_width_default(title);
  const len = Math.max(lines.reduce((sum, ln) => {
    const lineWidth = string_width_default(ln);
    return lineWidth > sum ? lineWidth : sum;
  }, 0), titleLen) + 2;
  const msg = lines.map((ln) => `${color6.gray(S_BAR)}  ${ln}${" ".repeat(len - string_width_default(ln))}${color6.gray(S_BAR)}`).join(`
`);
  output.write(`${color6.gray(S_BAR)}
${color6.green(S_STEP_SUBMIT)}  ${color6.reset(title)} ${color6.gray(S_BAR_H.repeat(Math.max(len - titleLen - 1, 1)) + S_CORNER_TOP_RIGHT)}
${msg}
${color6.gray(S_CONNECT_LEFT + S_BAR_H.repeat(len + 2) + S_CORNER_BOTTOM_RIGHT)}
`);
};
// src/path.ts
import { join, dirname } from "node:path";
import { lstatSync, existsSync, readdirSync } from "node:fs";

// src/autocomplete.ts
import color8 from "picocolors";

// src/limit-options.ts
import color7 from "picocolors";
import { WriteStream as WriteStream2 } from "node:tty";
var limitOptions = (params) => {
  const { cursor: cursor4, options, style } = params;
  const output = params.output ?? process.stdout;
  const rows = output instanceof WriteStream2 && output.rows !== undefined ? output.rows : 10;
  const overflowFormat = color7.dim("...");
  const paramMaxItems = params.maxItems ?? Number.POSITIVE_INFINITY;
  const outputMaxItems = Math.max(rows - 4, 0);
  const maxItems = Math.min(outputMaxItems, Math.max(paramMaxItems, 5));
  let slidingWindowLocation = 0;
  if (cursor4 >= slidingWindowLocation + maxItems - 3) {
    slidingWindowLocation = Math.max(Math.min(cursor4 - maxItems + 3, options.length - maxItems), 0);
  } else if (cursor4 < slidingWindowLocation + 2) {
    slidingWindowLocation = Math.max(cursor4 - 2, 0);
  }
  const shouldRenderTopEllipsis = maxItems < options.length && slidingWindowLocation > 0;
  const shouldRenderBottomEllipsis = maxItems < options.length && slidingWindowLocation + maxItems < options.length;
  return options.slice(slidingWindowLocation, slidingWindowLocation + maxItems).map((option, i, arr) => {
    const isTopLimit = i === 0 && shouldRenderTopEllipsis;
    const isBottomLimit = i === arr.length - 1 && shouldRenderBottomEllipsis;
    return isTopLimit || isBottomLimit ? overflowFormat : style(option, i + slidingWindowLocation === cursor4);
  });
};

// src/autocomplete.ts
function getLabel(option) {
  return option.label ?? String(option.value ?? "");
}
function getFilteredOption(searchText, option) {
  if (!searchText) {
    return true;
  }
  const label = (option.label ?? String(option.value ?? "")).toLowerCase();
  const hint = (option.hint ?? "").toLowerCase();
  const value = String(option.value).toLowerCase();
  const term = searchText.toLowerCase();
  return label.includes(term) || hint.includes(term) || value.includes(term);
}
function getSelectedOptions(values, options) {
  const results = [];
  for (const option of options) {
    if (values.includes(option.value)) {
      results.push(option);
    }
  }
  return results;
}
var autocomplete = (opts) => {
  const prompt = new AutocompletePrompt({
    options: opts.options,
    initialValue: opts.initialValue ? [opts.initialValue] : undefined,
    initialUserInput: opts.initialUserInput,
    filter: (search, opt) => getFilteredOption(search, opt),
    signal: opts.signal,
    input: opts.input,
    output: opts.output,
    validate: opts.validate,
    render() {
      const title = `${color8.gray(S_BAR)}
${symbol(this.state)}  ${opts.message}
`;
      const userInput = this.userInput;
      const valueAsString = String(this.value ?? "");
      const options = this.options;
      const placeholder = opts.placeholder;
      const showPlaceholder = valueAsString === "" && placeholder !== undefined;
      switch (this.state) {
        case "submit": {
          const selected = getSelectedOptions(this.selectedValues, options);
          const label = selected.length > 0 ? `  ${color8.dim(selected.map(getLabel).join(", "))}` : "";
          return `${title}${color8.gray(S_BAR)}${label}`;
        }
        case "cancel": {
          const userInputText = userInput ? `  ${color8.strikethrough(color8.dim(userInput))}` : "";
          return `${title}${color8.gray(S_BAR)}${userInputText}`;
        }
        default: {
          let searchText = "";
          if (this.isNavigating || showPlaceholder) {
            const searchTextValue = showPlaceholder ? placeholder : userInput;
            searchText = searchTextValue !== "" ? ` ${color8.dim(searchTextValue)}` : "";
          } else {
            searchText = ` ${this.userInputWithCursor}`;
          }
          const matches = this.filteredOptions.length !== options.length ? color8.dim(` (${this.filteredOptions.length} match${this.filteredOptions.length === 1 ? "" : "es"})`) : "";
          const displayOptions = this.filteredOptions.length === 0 ? [] : limitOptions({
            cursor: this.cursor,
            options: this.filteredOptions,
            style: (option, active) => {
              const label = getLabel(option);
              const hint = option.hint && option.value === this.focusedValue ? color8.dim(` (${option.hint})`) : "";
              return active ? `${color8.green(S_RADIO_ACTIVE)} ${label}${hint}` : `${color8.dim(S_RADIO_INACTIVE)} ${color8.dim(label)}${hint}`;
            },
            maxItems: opts.maxItems,
            output: opts.output
          });
          const instructions = [
            `${color8.dim("↑/↓")} to select`,
            `${color8.dim("Enter:")} confirm`,
            `${color8.dim("Type:")} to search`
          ];
          const noResults = this.filteredOptions.length === 0 && userInput ? [`${color8.cyan(S_BAR)}  ${color8.yellow("No matches found")}`] : [];
          const validationError = this.state === "error" ? [`${color8.yellow(S_BAR)}  ${color8.yellow(this.error)}`] : [];
          return [
            `${title}${color8.cyan(S_BAR)}`,
            `${color8.cyan(S_BAR)}  ${color8.dim("Search:")}${searchText}${matches}`,
            ...noResults,
            ...validationError,
            ...displayOptions.map((option) => `${color8.cyan(S_BAR)}  ${option}`),
            `${color8.cyan(S_BAR)}  ${color8.dim(instructions.join(" • "))}`,
            `${color8.cyan(S_BAR_END)}`
          ].join(`
`);
        }
      }
    }
  });
  return prompt.prompt();
};
var autocompleteMultiselect = (opts) => {
  const formatOption = (option, active, selectedValues, focusedValue) => {
    const isSelected = selectedValues.includes(option.value);
    const label = option.label ?? String(option.value ?? "");
    const hint = option.hint && focusedValue !== undefined && option.value === focusedValue ? color8.dim(` (${option.hint})`) : "";
    const checkbox = isSelected ? color8.green(S_CHECKBOX_SELECTED) : color8.dim(S_CHECKBOX_INACTIVE);
    if (active) {
      return `${checkbox} ${label}${hint}`;
    }
    return `${checkbox} ${color8.dim(label)}`;
  };
  const prompt = new AutocompletePrompt({
    options: opts.options,
    multiple: true,
    filter: (search, opt) => getFilteredOption(search, opt),
    validate: () => {
      if (opts.required && prompt.selectedValues.length === 0) {
        return "Please select at least one item";
      }
      return;
    },
    initialValue: opts.initialValues,
    signal: opts.signal,
    input: opts.input,
    output: opts.output,
    render() {
      const title = `${color8.gray(S_BAR)}
${symbol(this.state)}  ${opts.message}
`;
      const userInput = this.userInput;
      const placeholder = opts.placeholder;
      const showPlaceholder = userInput === "" && placeholder !== undefined;
      const searchText = this.isNavigating || showPlaceholder ? color8.dim(showPlaceholder ? placeholder : userInput) : this.userInputWithCursor;
      const options = this.options;
      const matches = this.filteredOptions.length !== options.length ? color8.dim(` (${this.filteredOptions.length} match${this.filteredOptions.length === 1 ? "" : "es"})`) : "";
      switch (this.state) {
        case "submit": {
          return `${title}${color8.gray(S_BAR)}  ${color8.dim(`${this.selectedValues.length} items selected`)}`;
        }
        case "cancel": {
          return `${title}${color8.gray(S_BAR)}  ${color8.strikethrough(color8.dim(userInput))}`;
        }
        default: {
          const instructions = [
            `${color8.dim("↑/↓")} to navigate`,
            `${color8.dim(this.isNavigating ? "Space/Tab:" : "Tab:")} select`,
            `${color8.dim("Enter:")} confirm`,
            `${color8.dim("Type:")} to search`
          ];
          const noResults = this.filteredOptions.length === 0 && userInput ? [`${color8.cyan(S_BAR)}  ${color8.yellow("No matches found")}`] : [];
          const errorMessage = this.state === "error" ? [`${color8.cyan(S_BAR)}  ${color8.yellow(this.error)}`] : [];
          const displayOptions = limitOptions({
            cursor: this.cursor,
            options: this.filteredOptions,
            style: (option, active) => formatOption(option, active, this.selectedValues, this.focusedValue),
            maxItems: opts.maxItems,
            output: opts.output
          });
          return [
            title,
            `${color8.cyan(S_BAR)}  ${color8.dim("Search:")} ${searchText}${matches}`,
            ...noResults,
            ...errorMessage,
            ...displayOptions.map((option) => `${color8.cyan(S_BAR)}  ${option}`),
            `${color8.cyan(S_BAR)}  ${color8.dim(instructions.join(" • "))}`,
            `${color8.cyan(S_BAR_END)}`
          ].join(`
`);
        }
      }
    }
  });
  return prompt.prompt();
};

// src/path.ts
var path = (opts) => {
  const validate = opts.validate;
  return autocomplete({
    ...opts,
    initialUserInput: opts.initialValue ?? opts.root ?? process.cwd(),
    maxItems: 5,
    validate(value) {
      if (Array.isArray(value)) {
        return;
      }
      if (!value) {
        return "Please select a path";
      }
      if (validate) {
        return validate(value);
      }
      return;
    },
    options() {
      const userInput = this.userInput;
      if (userInput === "") {
        return [];
      }
      try {
        let searchPath;
        if (!existsSync(userInput)) {
          searchPath = dirname(userInput);
        } else {
          const stat = lstatSync(userInput);
          if (stat.isDirectory()) {
            searchPath = userInput;
          } else {
            searchPath = dirname(userInput);
          }
        }
        const items = readdirSync(searchPath).map((item) => {
          const path2 = join(searchPath, item);
          const stats = lstatSync(path2);
          return {
            name: item,
            path: path2,
            isDirectory: stats.isDirectory()
          };
        }).filter(({ path: path2, isDirectory }) => path2.startsWith(userInput) && (opts.directory || !isDirectory));
        return items.map((item) => ({
          value: item.path
        }));
      } catch (_e) {
        return [];
      }
    }
  });
};
// src/spinner.ts
import color9 from "picocolors";
import { erase as erase2, cursor as cursor4 } from "sisteransi";
var spinner = ({
  indicator = "dots",
  onCancel,
  output = process.stdout,
  cancelMessage,
  errorMessage,
  frames = unicode ? ["◒", "◐", "◓", "◑"] : ["•", "o", "O", "0"],
  delay = unicode ? 80 : 120,
  signal
} = {}) => {
  const isCI2 = isCI();
  let unblock;
  let loop;
  let isSpinnerActive = false;
  let isCancelled = false;
  let _message = "";
  let _prevMessage;
  let _origin = performance.now();
  const columns = getColumns(output);
  const handleExit = (code) => {
    const msg = code > 1 ? errorMessage ?? settings.messages.error : cancelMessage ?? settings.messages.cancel;
    isCancelled = code === 1;
    if (isSpinnerActive) {
      stop(msg, code);
      if (isCancelled && typeof onCancel === "function") {
        onCancel();
      }
    }
  };
  const errorEventHandler = () => handleExit(2);
  const signalEventHandler = () => handleExit(1);
  const registerHooks = () => {
    process.on("uncaughtExceptionMonitor", errorEventHandler);
    process.on("unhandledRejection", errorEventHandler);
    process.on("SIGINT", signalEventHandler);
    process.on("SIGTERM", signalEventHandler);
    process.on("exit", handleExit);
    if (signal) {
      signal.addEventListener("abort", signalEventHandler);
    }
  };
  const clearHooks = () => {
    process.removeListener("uncaughtExceptionMonitor", errorEventHandler);
    process.removeListener("unhandledRejection", errorEventHandler);
    process.removeListener("SIGINT", signalEventHandler);
    process.removeListener("SIGTERM", signalEventHandler);
    process.removeListener("exit", handleExit);
    if (signal) {
      signal.removeEventListener("abort", signalEventHandler);
    }
  };
  const clearPrevMessage = () => {
    if (_prevMessage === undefined)
      return;
    if (isCI2)
      output.write(`
`);
    const wrapped = wrapAnsi(_prevMessage, columns, {
      hard: true,
      trim: false
    });
    const prevLines = wrapped.split(`
`);
    if (prevLines.length > 1) {
      output.write(cursor4.up(prevLines.length - 1));
    }
    output.write(cursor4.to(0));
    output.write(erase2.down());
  };
  const removeTrailingDots = (msg) => msg.replace(/\.+$/, "");
  const formatTimer = (origin) => {
    const duration = (performance.now() - origin) / 1000;
    const min = Math.floor(duration / 60);
    const secs = Math.floor(duration % 60);
    return min > 0 ? `[${min}m ${secs}s]` : `[${secs}s]`;
  };
  const start = (msg = "") => {
    isSpinnerActive = true;
    unblock = block({ output });
    _message = removeTrailingDots(msg);
    _origin = performance.now();
    output.write(`${color9.gray(S_BAR)}
`);
    let frameIndex = 0;
    let indicatorTimer = 0;
    registerHooks();
    loop = setInterval(() => {
      if (isCI2 && _message === _prevMessage) {
        return;
      }
      clearPrevMessage();
      _prevMessage = _message;
      const frame = color9.magenta(frames[frameIndex]);
      let outputMessage;
      if (isCI2) {
        outputMessage = `${frame}  ${_message}...`;
      } else if (indicator === "timer") {
        outputMessage = `${frame}  ${_message} ${formatTimer(_origin)}`;
      } else {
        const loadingDots = ".".repeat(Math.floor(indicatorTimer)).slice(0, 3);
        outputMessage = `${frame}  ${_message}${loadingDots}`;
      }
      const wrapped = wrapAnsi(outputMessage, columns, {
        hard: true,
        trim: false
      });
      output.write(wrapped);
      frameIndex = frameIndex + 1 < frames.length ? frameIndex + 1 : 0;
      indicatorTimer = indicatorTimer < 4 ? indicatorTimer + 0.125 : 0;
    }, delay);
  };
  const stop = (msg = "", code = 0) => {
    if (!isSpinnerActive)
      return;
    isSpinnerActive = false;
    clearInterval(loop);
    clearPrevMessage();
    const step = code === 0 ? color9.green(S_STEP_SUBMIT) : code === 1 ? color9.red(S_STEP_CANCEL) : color9.red(S_STEP_ERROR);
    _message = msg ?? _message;
    if (indicator === "timer") {
      output.write(`${step}  ${_message} ${formatTimer(_origin)}
`);
    } else {
      output.write(`${step}  ${_message}
`);
    }
    clearHooks();
    unblock();
  };
  const message = (msg = "") => {
    _message = removeTrailingDots(msg ?? _message);
  };
  return {
    start,
    stop,
    message,
    get isCancelled() {
      return isCancelled;
    }
  };
};

// src/task.ts
var tasks = async (list, opts) => {
  for (const task of list) {
    if (task.enabled === false)
      continue;
    const s = spinner(opts);
    s.start(task.title);
    const result = await task.task(s.message);
    s.stop(result || task.title);
  }
};
// src/text.ts
import color10 from "picocolors";
var text = (opts) => new TextPrompt({
  validate: opts.validate,
  placeholder: opts.placeholder,
  defaultValue: opts.defaultValue,
  initialValue: opts.initialValue,
  output: opts.output,
  signal: opts.signal,
  input: opts.input,
  render() {
    const title = `${color10.gray(S_BAR)}
${symbol(this.state)}  ${opts.message}
`;
    const placeholder = opts.placeholder ? color10.inverse(opts.placeholder[0]) + color10.dim(opts.placeholder.slice(1)) : color10.inverse(color10.hidden("_"));
    const userInput = !this.userInput ? placeholder : this.userInputWithCursor;
    const value = this.value ?? "";
    switch (this.state) {
      case "error": {
        const errorText = this.error ? `  ${color10.yellow(this.error)}` : "";
        return `${title.trim()}
${color10.yellow(S_BAR)}  ${userInput}
${color10.yellow(S_BAR_END)}${errorText}
`;
      }
      case "submit": {
        const valueText = value ? `  ${color10.dim(value)}` : "";
        return `${title}${color10.gray(S_BAR)}${valueText}`;
      }
      case "cancel": {
        const valueText = value ? `  ${color10.strikethrough(color10.dim(value))}` : "";
        return `${title}${color10.gray(S_BAR)}${valueText}${value.trim() ? `
${color10.gray(S_BAR)}` : ""}`;
      }
      default:
        return `${title}${color10.cyan(S_BAR)}  ${userInput}
${color10.cyan(S_BAR_END)}
`;
    }
  }
}).prompt();
// src/group.ts
var group = async (prompts, opts) => {
  const results = {};
  const promptNames = Object.keys(prompts);
  for (const name of promptNames) {
    const prompt = prompts[name];
    const result = await prompt({ results })?.catch((e) => {
      throw e;
    });
    if (typeof opts?.onCancel === "function" && isCancel(result)) {
      results[name] = "canceled";
      opts.onCancel({ results });
      continue;
    }
    results[name] = result;
  }
  return results;
};
// src/select.ts
import color11 from "picocolors";
var select = (opts) => {
  const opt = (option, state) => {
    const label = option.label ?? String(option.value);
    switch (state) {
      case "selected":
        return `${color11.dim(label)}`;
      case "active":
        return `${color11.green(S_RADIO_ACTIVE)} ${label}${option.hint ? ` ${color11.dim(`(${option.hint})`)}` : ""}`;
      case "cancelled":
        return `${color11.strikethrough(color11.dim(label))}`;
      default:
        return `${color11.dim(S_RADIO_INACTIVE)} ${color11.dim(label)}`;
    }
  };
  return new SelectPrompt({
    options: opts.options,
    signal: opts.signal,
    input: opts.input,
    output: opts.output,
    initialValue: opts.initialValue,
    render() {
      const title = `${color11.gray(S_BAR)}
${symbol(this.state)}  ${opts.message}
`;
      switch (this.state) {
        case "submit": {
          const selectedOption = this.options[this.cursor];
          if (!selectedOption)
            return title;
          return `${title}${color11.gray(S_BAR)}  ${opt(selectedOption, "selected")}`;
        }
        case "cancel": {
          const selectedOption = this.options[this.cursor];
          if (!selectedOption)
            return title;
          return `${title}${color11.gray(S_BAR)}  ${opt(selectedOption, "cancelled")}
${color11.gray(S_BAR)}`;
        }
        default: {
          return `${title}${color11.cyan(S_BAR)}  ${limitOptions({
            output: opts.output,
            cursor: this.cursor,
            options: this.options,
            maxItems: opts.maxItems,
            style: (item, active) => opt(item, active ? "active" : "inactive")
          }).join(`
${color11.cyan(S_BAR)}  `)}
${color11.cyan(S_BAR_END)}
`;
        }
      }
    }
  }).prompt();
};
// src/stream.ts
import color12 from "picocolors";
import { stripVTControlCharacters as strip } from "node:util";
var prefix = `${color12.gray(S_BAR)}  `;
var stream = {
  message: async (iterable, { symbol: symbol2 = color12.gray(S_BAR) } = {}) => {
    process.stdout.write(`${color12.gray(S_BAR)}
${symbol2}  `);
    let lineWidth = 3;
    for await (let chunk of iterable) {
      chunk = chunk.replace(/\n/g, `
${prefix}`);
      if (chunk.includes(`
`)) {
        lineWidth = 3 + strip(chunk.slice(chunk.lastIndexOf(`
`))).length;
      }
      const chunkLen = strip(chunk).length;
      if (lineWidth + chunkLen < process.stdout.columns) {
        lineWidth += chunkLen;
        process.stdout.write(chunk);
      } else {
        process.stdout.write(`
${prefix}${chunk.trimStart()}`);
        lineWidth = 3 + strip(chunk.trimStart()).length;
      }
    }
    process.stdout.write(`
`);
  },
  info: (iterable) => stream.message(iterable, { symbol: color12.blue(S_INFO) }),
  success: (iterable) => stream.message(iterable, { symbol: color12.green(S_SUCCESS) }),
  step: (iterable) => stream.message(iterable, { symbol: color12.green(S_STEP_SUBMIT) }),
  warn: (iterable) => stream.message(iterable, { symbol: color12.yellow(S_WARN) }),
  warning: (iterable) => stream.warn(iterable),
  error: (iterable) => stream.message(iterable, { symbol: color12.red(S_ERROR) })
};
// src/confirm.ts
import color13 from "picocolors";
var confirm = (opts) => {
  const active = opts.active ?? "Yes";
  const inactive = opts.inactive ?? "No";
  return new ConfirmPrompt({
    active,
    inactive,
    signal: opts.signal,
    input: opts.input,
    output: opts.output,
    initialValue: opts.initialValue ?? true,
    render() {
      const title = `${color13.gray(S_BAR)}
${symbol(this.state)}  ${opts.message}
`;
      const value = this.value ? active : inactive;
      switch (this.state) {
        case "submit":
          return `${title}${color13.gray(S_BAR)}  ${color13.dim(value)}`;
        case "cancel":
          return `${title}${color13.gray(S_BAR)}  ${color13.strikethrough(color13.dim(value))}
${color13.gray(S_BAR)}`;
        default: {
          return `${title}${color13.cyan(S_BAR)}  ${this.value ? `${color13.green(S_RADIO_ACTIVE)} ${active}` : `${color13.dim(S_RADIO_INACTIVE)} ${color13.dim(active)}`} ${color13.dim("/")} ${!this.value ? `${color13.green(S_RADIO_ACTIVE)} ${inactive}` : `${color13.dim(S_RADIO_INACTIVE)} ${color13.dim(inactive)}`}
${color13.cyan(S_BAR_END)}
`;
        }
      }
    }
  }).prompt();
};
// src/messages.ts
import color14 from "picocolors";
var cancel = (message = "", opts) => {
  const output = opts?.output ?? process.stdout;
  output.write(`${color14.gray(S_BAR_END)}  ${color14.red(message)}

`);
};
var intro = (title = "", opts) => {
  const output = opts?.output ?? process.stdout;
  output.write(`${color14.gray(S_BAR_START)}  ${title}
`);
};
var outro = (message = "", opts) => {
  const output = opts?.output ?? process.stdout;
  output.write(`${color14.gray(S_BAR)}
${color14.gray(S_BAR_END)}  ${message}

`);
};
// src/password.ts
import color15 from "picocolors";
var password = (opts) => new PasswordPrompt({
  validate: opts.validate,
  mask: opts.mask ?? S_PASSWORD_MASK,
  signal: opts.signal,
  input: opts.input,
  output: opts.output,
  render() {
    const title = `${color15.gray(S_BAR)}
${symbol(this.state)}  ${opts.message}
`;
    const userInput = this.userInputWithCursor;
    const masked = this.masked;
    switch (this.state) {
      case "error": {
        const maskedText = masked ? `  ${masked}` : "";
        if (opts.clearOnError) {
          this.clear();
        }
        return `${title.trim()}
${color15.yellow(S_BAR)}${maskedText}
${color15.yellow(S_BAR_END)}  ${color15.yellow(this.error)}
`;
      }
      case "submit": {
        const maskedText = masked ? `  ${color15.dim(masked)}` : "";
        return `${title}${color15.gray(S_BAR)}${maskedText}`;
      }
      case "cancel": {
        const maskedText = masked ? `  ${color15.strikethrough(color15.dim(masked))}` : "";
        return `${title}${color15.gray(S_BAR)}${maskedText}${masked ? `
${color15.gray(S_BAR)}` : ""}`;
      }
      default:
        return `${title}${color15.cyan(S_BAR)}  ${userInput}
${color15.cyan(S_BAR_END)}
`;
    }
  }
}).prompt();
// src/task-log.ts
import color16 from "picocolors";
import { erase as erase3 } from "sisteransi";
var taskLog = (opts) => {
  const output = opts.output ?? process.stdout;
  const columns = getColumns(output);
  const secondarySymbol = color16.gray(S_BAR);
  const spacing = opts.spacing ?? 1;
  const barSize = 3;
  const retainLog = opts.retainLog === true;
  const isTTY2 = !isCI() && isTTY(output);
  output.write(`${secondarySymbol}
`);
  output.write(`${color16.green(S_STEP_SUBMIT)}  ${opts.title}
`);
  for (let i = 0;i < spacing; i++) {
    output.write(`${secondarySymbol}
`);
  }
  const buffers = [
    {
      value: "",
      full: ""
    }
  ];
  let lastMessageWasRaw = false;
  const clear = (clearTitle) => {
    if (buffers.length === 0) {
      return;
    }
    let lines = 0;
    if (clearTitle) {
      lines += spacing + 2;
    }
    for (const buffer of buffers) {
      const { value, result } = buffer;
      let text2 = result?.message ?? value;
      if (text2.length === 0) {
        continue;
      }
      if (result === undefined && buffer.header !== undefined && buffer.header !== "") {
        text2 += `
${buffer.header}`;
      }
      const bufferHeight = text2.split(`
`).reduce((count, line) => {
        if (line === "") {
          return count + 1;
        }
        return count + Math.ceil((line.length + barSize) / columns);
      }, 0);
      lines += bufferHeight;
    }
    if (lines > 0) {
      lines += 1;
      output.write(erase3.lines(lines));
    }
  };
  const printBuffer = (buffer, messageSpacing, full) => {
    const messages = full ? `${buffer.full}
${buffer.value}` : buffer.value;
    if (buffer.header !== undefined && buffer.header !== "") {
      log.message(buffer.header.split(`
`).map(color16.bold), {
        output,
        secondarySymbol,
        symbol: secondarySymbol,
        spacing: 0
      });
    }
    log.message(messages.split(`
`).map(color16.dim), {
      output,
      secondarySymbol,
      symbol: secondarySymbol,
      spacing: messageSpacing ?? spacing
    });
  };
  const renderBuffer = () => {
    for (const buffer of buffers) {
      const { header, value, full } = buffer;
      if ((header === undefined || header.length === 0) && value.length === 0) {
        continue;
      }
      printBuffer(buffer, undefined, retainLog === true && full.length > 0);
    }
  };
  const message = (buffer, msg, mopts) => {
    clear(false);
    if ((mopts?.raw !== true || !lastMessageWasRaw) && buffer.value !== "") {
      buffer.value += `
`;
    }
    buffer.value += msg;
    lastMessageWasRaw = mopts?.raw === true;
    if (opts.limit !== undefined) {
      const lines = buffer.value.split(`
`);
      const linesToRemove = lines.length - opts.limit;
      if (linesToRemove > 0) {
        const removedLines = lines.splice(0, linesToRemove);
        if (retainLog) {
          buffer.full += (buffer.full === "" ? "" : `
`) + removedLines.join(`
`);
        }
      }
      buffer.value = lines.join(`
`);
    }
    if (isTTY2) {
      printBuffers();
    }
  };
  const printBuffers = () => {
    for (const buffer of buffers) {
      if (buffer.result) {
        if (buffer.result.status === "error") {
          log.error(buffer.result.message, { output, secondarySymbol, spacing: 0 });
        } else {
          log.success(buffer.result.message, { output, secondarySymbol, spacing: 0 });
        }
      } else if (buffer.value !== "") {
        printBuffer(buffer, 0);
      }
    }
  };
  const completeBuffer = (buffer, result) => {
    clear(false);
    buffer.result = result;
    if (isTTY2) {
      printBuffers();
    }
  };
  return {
    message(msg, mopts) {
      const firstBuffer = buffers[0];
      if (firstBuffer) {
        message(firstBuffer, msg, mopts);
      }
    },
    group(name) {
      const buffer = {
        header: name,
        value: "",
        full: ""
      };
      buffers.push(buffer);
      return {
        message(msg, mopts) {
          message(buffer, msg, mopts);
        },
        error(message2) {
          completeBuffer(buffer, {
            status: "error",
            message: message2
          });
        },
        success(message2) {
          completeBuffer(buffer, {
            status: "success",
            message: message2
          });
        }
      };
    },
    error(message2, opts2) {
      clear(true);
      log.error(message2, { output, secondarySymbol, spacing: 1 });
      if (opts2?.showLog !== false) {
        renderBuffer();
      }
      buffers.splice(1, buffers.length - 1);
      if (buffers[0]) {
        buffers[0].value = "";
        buffers[0].full = "";
      }
    },
    success(message2, opts2) {
      clear(true);
      log.success(message2, { output, secondarySymbol, spacing: 1 });
      if (opts2?.showLog === true) {
        renderBuffer();
      }
      buffers.splice(1, buffers.length - 1);
      if (buffers[0]) {
        buffers[0].value = "";
        buffers[0].full = "";
      }
    }
  };
};
// src/select-key.ts
import color17 from "picocolors";
var selectKey = (opts) => {
  const opt = (option, state = "inactive") => {
    const label = option.label ?? String(option.value);
    if (state === "selected") {
      return `${color17.dim(label)}`;
    }
    if (state === "cancelled") {
      return `${color17.strikethrough(color17.dim(label))}`;
    }
    if (state === "active") {
      return `${color17.bgCyan(color17.gray(` ${option.value} `))} ${label} ${option.hint ? color17.dim(`(${option.hint})`) : ""}`;
    }
    return `${color17.gray(color17.bgWhite(color17.inverse(` ${option.value} `)))} ${label} ${option.hint ? color17.dim(`(${option.hint})`) : ""}`;
  };
  return new SelectKeyPrompt({
    options: opts.options,
    signal: opts.signal,
    input: opts.input,
    output: opts.output,
    initialValue: opts.initialValue,
    render() {
      const title = `${color17.gray(S_BAR)}
${symbol(this.state)}  ${opts.message}
`;
      switch (this.state) {
        case "submit": {
          const selectedOption = this.options.find((opt2) => opt2.value === this.value) ?? opts.options[0];
          if (!selectedOption)
            return title;
          return `${title}${color17.gray(S_BAR)}  ${opt(selectedOption, "selected")}`;
        }
        case "cancel": {
          const firstOption = this.options[0];
          if (!firstOption)
            return title;
          return `${title}${color17.gray(S_BAR)}  ${opt(firstOption, "cancelled")}
${color17.gray(S_BAR)}`;
        }
        default: {
          return `${title}${color17.cyan(S_BAR)}  ${this.options.map((option, i) => opt(option, i === this.cursor ? "active" : "inactive")).join(`
${color17.cyan(S_BAR)}  `)}
${color17.cyan(S_BAR_END)}
`;
        }
      }
    }
  }).prompt();
};
// src/multi-select.ts
import color18 from "picocolors";
var multiselect = (opts) => {
  const opt = (option, state) => {
    const label = option.label ?? String(option.value);
    if (state === "active") {
      return `${color18.cyan(S_CHECKBOX_ACTIVE)} ${label}${option.hint ? ` ${color18.dim(`(${option.hint})`)}` : ""}`;
    }
    if (state === "selected") {
      return `${color18.green(S_CHECKBOX_SELECTED)} ${color18.dim(label)}${option.hint ? ` ${color18.dim(`(${option.hint})`)}` : ""}`;
    }
    if (state === "cancelled") {
      return `${color18.strikethrough(color18.dim(label))}`;
    }
    if (state === "active-selected") {
      return `${color18.green(S_CHECKBOX_SELECTED)} ${label}${option.hint ? ` ${color18.dim(`(${option.hint})`)}` : ""}`;
    }
    if (state === "submitted") {
      return `${color18.dim(label)}`;
    }
    return `${color18.dim(S_CHECKBOX_INACTIVE)} ${color18.dim(label)}`;
  };
  const required = opts.required ?? true;
  return new MultiSelectPrompt({
    options: opts.options,
    signal: opts.signal,
    input: opts.input,
    output: opts.output,
    initialValues: opts.initialValues,
    required,
    cursorAt: opts.cursorAt,
    validate(selected) {
      if (required && (selected === undefined || selected.length === 0))
        return `Please select at least one option.
${color18.reset(color18.dim(`Press ${color18.gray(color18.bgWhite(color18.inverse(" space ")))} to select, ${color18.gray(color18.bgWhite(color18.inverse(" enter ")))} to submit`))}`;
      return;
    },
    render() {
      const title = `${color18.gray(S_BAR)}
${symbol(this.state)}  ${opts.message}
`;
      const value = this.value ?? [];
      const styleOption = (option, active) => {
        const selected = value.includes(option.value);
        if (active && selected) {
          return opt(option, "active-selected");
        }
        if (selected) {
          return opt(option, "selected");
        }
        return opt(option, active ? "active" : "inactive");
      };
      switch (this.state) {
        case "submit": {
          return `${title}${color18.gray(S_BAR)}  ${this.options.filter(({ value: optionValue }) => value.includes(optionValue)).map((option) => opt(option, "submitted")).join(color18.dim(", ")) || color18.dim("none")}`;
        }
        case "cancel": {
          const label = this.options.filter(({ value: optionValue }) => value.includes(optionValue)).map((option) => opt(option, "cancelled")).join(color18.dim(", "));
          return `${title}${color18.gray(S_BAR)}${label.trim() ? `  ${label}
${color18.gray(S_BAR)}` : ""}`;
        }
        case "error": {
          const footer = this.error.split(`
`).map((ln, i) => i === 0 ? `${color18.yellow(S_BAR_END)}  ${color18.yellow(ln)}` : `   ${ln}`).join(`
`);
          return `${title + color18.yellow(S_BAR)}  ${limitOptions({
            output: opts.output,
            options: this.options,
            cursor: this.cursor,
            maxItems: opts.maxItems,
            style: styleOption
          }).join(`
${color18.yellow(S_BAR)}  `)}
${footer}
`;
        }
        default: {
          return `${title}${color18.cyan(S_BAR)}  ${limitOptions({
            output: opts.output,
            options: this.options,
            cursor: this.cursor,
            maxItems: opts.maxItems,
            style: styleOption
          }).join(`
${color18.cyan(S_BAR)}  `)}
${color18.cyan(S_BAR_END)}
`;
        }
      }
    }
  }).prompt();
};
// src/progress-bar.ts
import color19 from "picocolors";
var S_PROGRESS_CHAR = {
  light: unicodeOr("─", "-"),
  heavy: unicodeOr("━", "="),
  block: unicodeOr("█", "#")
};
function progress({
  style = "heavy",
  max: userMax = 100,
  size: userSize = 40,
  ...spinnerOptions
} = {}) {
  const spin = spinner(spinnerOptions);
  let value = 0;
  let previousMessage = "";
  const max = Math.max(1, userMax);
  const size = Math.max(1, userSize);
  const activeStyle = (state) => {
    switch (state) {
      case "initial":
      case "active":
        return color19.magenta;
      case "error":
      case "cancel":
        return color19.red;
      case "submit":
        return color19.green;
      default:
        return color19.magenta;
    }
  };
  const drawProgress = (state, msg) => {
    const active = Math.floor(value / max * size);
    return `${activeStyle(state)(S_PROGRESS_CHAR[style].repeat(active))}${color19.dim(S_PROGRESS_CHAR[style].repeat(size - active))} ${msg}`;
  };
  const start = (msg = "") => {
    previousMessage = msg;
    return spin.start(drawProgress("initial", msg));
  };
  const advance = (step = 1, msg) => {
    value = Math.min(max, step + value);
    spin.message(drawProgress("active", msg ?? previousMessage));
    previousMessage = msg ?? previousMessage;
  };
  return {
    start,
    stop: spin.stop,
    advance,
    isCancelled: spin.isCancelled,
    message: (msg) => advance(0, msg)
  };
}
// src/group-multi-select.ts
import color20 from "picocolors";
var groupMultiselect = (opts) => {
  const { selectableGroups = true, groupSpacing = 0 } = opts;
  const opt = (option, state, options = []) => {
    const label = option.label ?? String(option.value);
    const isItem = typeof option.group === "string";
    const next = isItem && (options[options.indexOf(option) + 1] ?? { group: true });
    const isLast = isItem && next && next.group === true;
    const prefix2 = isItem ? selectableGroups ? `${isLast ? S_BAR_END : S_BAR} ` : "  " : "";
    let spacingPrefix = "";
    if (groupSpacing > 0 && !isItem) {
      const spacingPrefixText = `
${color20.cyan(S_BAR)}`;
      spacingPrefix = `${spacingPrefixText.repeat(groupSpacing - 1)}${spacingPrefixText}  `;
    }
    if (state === "active") {
      return `${spacingPrefix}${color20.dim(prefix2)}${color20.cyan(S_CHECKBOX_ACTIVE)} ${label}${option.hint ? ` ${color20.dim(`(${option.hint})`)}` : ""}`;
    }
    if (state === "group-active") {
      return `${spacingPrefix}${prefix2}${color20.cyan(S_CHECKBOX_ACTIVE)} ${color20.dim(label)}`;
    }
    if (state === "group-active-selected") {
      return `${spacingPrefix}${prefix2}${color20.green(S_CHECKBOX_SELECTED)} ${color20.dim(label)}`;
    }
    if (state === "selected") {
      const selectedCheckbox = isItem || selectableGroups ? color20.green(S_CHECKBOX_SELECTED) : "";
      return `${spacingPrefix}${color20.dim(prefix2)}${selectedCheckbox} ${color20.dim(label)}${option.hint ? ` ${color20.dim(`(${option.hint})`)}` : ""}`;
    }
    if (state === "cancelled") {
      return `${color20.strikethrough(color20.dim(label))}`;
    }
    if (state === "active-selected") {
      return `${spacingPrefix}${color20.dim(prefix2)}${color20.green(S_CHECKBOX_SELECTED)} ${label}${option.hint ? ` ${color20.dim(`(${option.hint})`)}` : ""}`;
    }
    if (state === "submitted") {
      return `${color20.dim(label)}`;
    }
    const unselectedCheckbox = isItem || selectableGroups ? color20.dim(S_CHECKBOX_INACTIVE) : "";
    return `${spacingPrefix}${color20.dim(prefix2)}${unselectedCheckbox} ${color20.dim(label)}`;
  };
  const required = opts.required ?? true;
  return new GroupMultiSelectPrompt({
    options: opts.options,
    signal: opts.signal,
    input: opts.input,
    output: opts.output,
    initialValues: opts.initialValues,
    required,
    cursorAt: opts.cursorAt,
    selectableGroups,
    validate(selected) {
      if (required && (selected === undefined || selected.length === 0))
        return `Please select at least one option.
${color20.reset(color20.dim(`Press ${color20.gray(color20.bgWhite(color20.inverse(" space ")))} to select, ${color20.gray(color20.bgWhite(color20.inverse(" enter ")))} to submit`))}`;
      return;
    },
    render() {
      const title = `${color20.gray(S_BAR)}
${symbol(this.state)}  ${opts.message}
`;
      const value = this.value ?? [];
      switch (this.state) {
        case "submit": {
          const selectedOptions = this.options.filter(({ value: optionValue }) => value.includes(optionValue)).map((option) => opt(option, "submitted"));
          const optionsText = selectedOptions.length === 0 ? "" : `  ${selectedOptions.join(color20.dim(", "))}`;
          return `${title}${color20.gray(S_BAR)}${optionsText}`;
        }
        case "cancel": {
          const label = this.options.filter(({ value: optionValue }) => value.includes(optionValue)).map((option) => opt(option, "cancelled")).join(color20.dim(", "));
          return `${title}${color20.gray(S_BAR)}  ${label.trim() ? `${label}
${color20.gray(S_BAR)}` : ""}`;
        }
        case "error": {
          const footer = this.error.split(`
`).map((ln, i) => i === 0 ? `${color20.yellow(S_BAR_END)}  ${color20.yellow(ln)}` : `   ${ln}`).join(`
`);
          return `${title}${color20.yellow(S_BAR)}  ${this.options.map((option, i, options) => {
            const selected = value.includes(option.value) || option.group === true && this.isGroupSelected(`${option.value}`);
            const active = i === this.cursor;
            const groupActive = !active && typeof option.group === "string" && this.options[this.cursor]?.value === option.group;
            if (groupActive) {
              return opt(option, selected ? "group-active-selected" : "group-active", options);
            }
            if (active && selected) {
              return opt(option, "active-selected", options);
            }
            if (selected) {
              return opt(option, "selected", options);
            }
            return opt(option, active ? "active" : "inactive", options);
          }).join(`
${color20.yellow(S_BAR)}  `)}
${footer}
`;
        }
        default: {
          const optionsText = this.options.map((option, i, options) => {
            const selected = value.includes(option.value) || option.group === true && this.isGroupSelected(`${option.value}`);
            const active = i === this.cursor;
            const groupActive = !active && typeof option.group === "string" && this.options[this.cursor]?.value === option.group;
            let optionText = "";
            if (groupActive) {
              optionText = opt(option, selected ? "group-active-selected" : "group-active", options);
            } else if (active && selected) {
              optionText = opt(option, "active-selected", options);
            } else if (selected) {
              optionText = opt(option, "selected", options);
            } else {
              optionText = opt(option, active ? "active" : "inactive", options);
            }
            const prefix2 = i !== 0 && !optionText.startsWith(`
`) ? "  " : "";
            return `${prefix2}${optionText}`;
          }).join(`
${color20.cyan(S_BAR)}`);
          const optionsPrefix = optionsText.startsWith(`
`) ? "" : "  ";
          return `${title}${color20.cyan(S_BAR)}${optionsPrefix}${optionsText}
${color20.cyan(S_BAR_END)}
`;
        }
      }
    }
  }).prompt();
};
export {
  updateSettings,
  unicodeOr,
  unicode,
  text,
  tasks,
  taskLog,
  symbol,
  stream,
  spinner,
  settings,
  selectKey,
  select,
  progress,
  path,
  password,
  outro,
  note,
  multiselect,
  log,
  limitOptions,
  isTTY,
  isCancel,
  isCI,
  intro,
  groupMultiselect,
  group,
  confirm,
  cancel,
  box,
  autocompleteMultiselect,
  autocomplete,
  S_WARN,
  S_SUCCESS,
  S_STEP_SUBMIT,
  S_STEP_ERROR,
  S_STEP_CANCEL,
  S_STEP_ACTIVE,
  S_RADIO_INACTIVE,
  S_RADIO_ACTIVE,
  S_PASSWORD_MASK,
  S_INFO,
  S_ERROR,
  S_CORNER_TOP_RIGHT,
  S_CORNER_TOP_LEFT,
  S_CORNER_BOTTOM_RIGHT,
  S_CORNER_BOTTOM_LEFT,
  S_CONNECT_LEFT,
  S_CHECKBOX_SELECTED,
  S_CHECKBOX_INACTIVE,
  S_CHECKBOX_ACTIVE,
  S_BAR_START_RIGHT,
  S_BAR_START,
  S_BAR_H,
  S_BAR_END_RIGHT,
  S_BAR_END,
  S_BAR
};

//# debugId=E4FBA872290AACF664756E2164756E21
//# sourceMappingURL=index.js.map
