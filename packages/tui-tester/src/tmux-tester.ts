/**
 * TmuxTester - Main E2E Testing Class
 * Provides comprehensive terminal UI testing through tmux
 */

import { getAdapter } from './adapters/index.js';
import {
  sleep,
  waitFor,
  stripAnsi,
  screenDiff,
  splitLines,
  parseTmuxKey,
  normalizeText,
  compareScreens,
  escapeShellArg,
  parseTmuxMouse,
  generateSessionName
} from './core/utils.js';

import type { RuntimeAdapter } from './adapters/index.js';
import type {
  Point,
  Snapshot,
  Recording,
  MouseEvent,
  WaitOptions,
  TesterConfig,
  TerminalSize,
  KeyModifiers,
  ScreenCapture,
  RecordedEvent,
  TerminalTester,
  AssertionOptions
} from './core/types.js';

export class TmuxTester implements TerminalTester {
  private config: Required<TesterConfig>;
  private adapter: RuntimeAdapter;
  private sessionName: string;
  private running: boolean = false;
  private _outputBuffer: string = '';  // Store last captured output
  private recording: Recording | null = null;
  private snapshots: Map<string, Snapshot> = new Map();
  private debugMode: boolean;

  constructor(config: TesterConfig) {
    this.config = {
      command: config.command,
      size: config.size || { cols: 80, rows: 24 },
      env: config.env || {},
      cwd: config.cwd || process.cwd(),
      shell: config.shell || 'sh',
      sessionName: config.sessionName || generateSessionName(),
      debug: config.debug || false,
      recordingEnabled: config.recordingEnabled || false,
      snapshotDir: config.snapshotDir || './snapshots'
    };
    
    this.adapter = getAdapter();
    this.sessionName = this.config.sessionName;
    this.debugMode = this.config.debug;
  }

  /**
   * Start the tmux session and launch the application
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Tester is already running');
    }

    // Check if tmux is available
    const tmuxAvailable = this.adapter.commandExists ? await this.adapter.commandExists('tmux') : true;
    if (!tmuxAvailable) {
      throw new Error('tmux is not installed. Please install tmux to use the terminal tester.');
    }

    // Kill any existing session with the same name
    if (this.adapter.tryExec) {
      await this.adapter.tryExec(`tmux kill-session -t ${this.sessionName} 2>/dev/null`);
    }

    // Create new tmux session
    const { cols, rows } = this.config.size;
    const envVars = Object.entries(this.config.env)
      .map(([key, value]) => `-e ${key}=${escapeShellArg(value)}`)
      .join(' ');

    // If command is provided but doesn't look like a shell, wrap it in bash
    const needsShell = this.config.command.length > 0 && 
                      !this.config.command[0].match(/^(bash|sh|zsh|fish|dash)$/);
    
    let createCmd: string;
    if (needsShell) {
      // Create session with bash and then run the command
      createCmd = `tmux new-session -d -s ${this.sessionName} -x ${cols} -y ${rows} ${envVars} -c ${escapeShellArg(this.config.cwd)} bash`;
    } else {
      // Create session with the specified shell or default
      const shell = this.config.command[0] || 'bash';
      createCmd = `tmux new-session -d -s ${this.sessionName} -x ${cols} -y ${rows} ${envVars} -c ${escapeShellArg(this.config.cwd)} ${shell}`;
    }
    
    this.debug(`Creating tmux session: ${createCmd}`);
    const result = await this.adapter.exec(createCmd);
    
    if (result.code !== 0) {
      throw new Error(`Failed to create tmux session: ${result.stderr}`);
    }

    // Mark as running before sending commands
    this.running = true;
    
    // If we wrapped in shell, wait for shell to be ready then send the actual command
    if (needsShell) {
      await this.sleep(1000); // Wait for bash to be ready
      const appCmd = this.config.command.join(' ');
      await this.sendCommand(appCmd);
    }
    
    // Wait for startup
    await this.sleep(500);
    
    this.debug('Tmux session started successfully');

    if (this.config.recordingEnabled) {
      this.startRecording();
    }
  }

  /**
   * Stop the tmux session
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    if (this.recording) {
      this.stopRecording();
    }

    const result = await this.adapter.exec(`tmux kill-session -t ${this.sessionName}`);
    if (result.code !== 0) {
      this.debug(`Warning: Failed to kill tmux session: ${result.stderr}`);
    }

    this.running = false;
    this.debug('Tmux session stopped');
  }

  /**
   * Restart the session
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Check if the session is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Send text to the terminal
   */
  async sendText(text: string): Promise<void> {
    this.ensureRunning();
    
    const escaped = escapeShellArg(text);
    const cmd = `tmux send-keys -t ${this.sessionName} ${escaped}`;
    
    this.debug(`Sending text: ${text}`);
    await this.adapter.exec(cmd);
    
    this.recordEvent('input', { type: 'text', text });
    await this.sleep(100);
  }

  /**
   * Send a key with optional modifiers
   */
  async sendKey(key: string, modifiers?: KeyModifiers): Promise<void> {
    this.ensureRunning();
    
    const tmuxKey = parseTmuxKey(key, modifiers);
    const cmd = `tmux send-keys -t ${this.sessionName} ${tmuxKey}`;
    
    this.debug(`Sending key: ${key} (tmux: ${tmuxKey})`);
    await this.adapter.exec(cmd);
    
    this.recordEvent('key', { key, modifiers });
    await this.sleep(100);
  }

  /**
   * Send multiple keys
   */
  async sendKeys(keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.sendKey(key);
    }
  }

  /**
   * Enable mouse support in the terminal
   */
  async enableMouse(): Promise<void> {
    this.ensureRunning();
    await this.adapter.exec(`tmux set -t ${this.sessionName} mouse on`);
    this.debug('Mouse support enabled');
  }

  /**
   * Disable mouse support in the terminal
   */
  async disableMouse(): Promise<void> {
    this.ensureRunning();
    await this.adapter.exec(`tmux set -t ${this.sessionName} mouse off`);
    this.debug('Mouse support disabled');
  }

  /**
   * Click at specific position
   */
  async click(x: number, y: number): Promise<void> {
    await this.sendMouse({
      type: 'click',
      position: { x, y },
      button: 'left'
    });
  }

  /**
   * Click on text in the terminal
   */
  async clickText(text: string): Promise<void> {
    const capture = await this.captureScreen();
    const lines = capture.lines;
    
    for (let y = 0; y < lines.length; y++) {
      const x = lines[y].indexOf(text);
      if (x !== -1) {
        await this.click(x, y);
        return;
      }
    }
    
    throw new Error(`Text "${text}" not found on screen`);
  }

  /**
   * Double click at specific position
   */
  async doubleClick(x: number, y: number): Promise<void> {
    await this.click(x, y);
    await this.sleep(50);
    await this.click(x, y);
  }

  /**
   * Right click at specific position
   */
  async rightClick(x: number, y: number): Promise<void> {
    await this.sendMouse({
      type: 'click',
      position: { x, y },
      button: 'right'
    });
  }

  /**
   * Drag from one position to another
   */
  async drag(from: Point, to: Point): Promise<void> {
    // Send mouse down at start position
    await this.sendMouse({
      type: 'click',
      position: from,
      button: 'left'
    });
    
    // Move to end position
    await this.sendMouse({
      type: 'move',
      position: to,
      button: 'left'
    });
    
    // Release at end position
    await this.sendMouse({
      type: 'click',
      position: to,
      button: 'left'
    });
  }

  /**
   * Scroll up or down
   */
  async scroll(direction: 'up' | 'down', lines: number = 1): Promise<void> {
    const currentPos = await this.getCursor();
    
    for (let i = 0; i < lines; i++) {
      await this.sendMouse({
        type: 'scroll',
        position: currentPos,
        button: direction
      });
      await this.sleep(50);
    }
  }

  /**
   * Send a mouse event
   */
  async sendMouse(event: MouseEvent): Promise<void> {
    this.ensureRunning();
    
    // Enable mouse mode if not already enabled
    await this.adapter.exec(`tmux set -t ${this.sessionName} mouse on`);
    
    let cmd: string;
    
    switch (event.type) {
      case 'click':
        // Send mouse click
        const button = (event.button === 'left' || event.button === 'middle' || event.button === 'right') 
          ? event.button 
          : 'left';
        const sequence = parseTmuxMouse(event.position.x, event.position.y, button);
        cmd = `tmux send-keys -t ${this.sessionName} -H ${sequence}`;
        break;
        
      case 'move':
        // Mouse movement (not all terminals support this)
        cmd = `tmux send-keys -t ${this.sessionName} -H '\x1b[<35;${event.position.x + 1};${event.position.y + 1}M'`;
        break;
        
      case 'scroll':
        // Mouse scroll
        const scrollButton = event.button === 'up' ? 4 : 5;
        cmd = `tmux send-keys -t ${this.sessionName} -H '\x1b[<${scrollButton};${event.position.x + 1};${event.position.y + 1}M'`;
        break;
        
      default:
        this.debug(`Unsupported mouse event type: ${event.type}`);
        return;
    }
    
    this.debug(`Sending mouse event: ${event.type} at (${event.position.x}, ${event.position.y})`);
    await this.adapter.exec(cmd);
    
    this.recordEvent('mouse', event);
    await this.sleep(100);
  }

  /**
   * Paste text (using bracketed paste mode)
   */
  async paste(text: string): Promise<void> {
    this.ensureRunning();
    
    // Send bracketed paste sequences
    await this.adapter.exec(`tmux send-keys -t ${this.sessionName} '\x1b[200~'`);
    await this.sendText(text);
    await this.adapter.exec(`tmux send-keys -t ${this.sessionName} '\x1b[201~'`);
    
    this.recordEvent('input', { type: 'paste', text });
  }

  /**
   * Type text with optional delay between characters
   */
  async typeText(text: string, delayMs: number = 50): Promise<void> {
    for (const char of text) {
      await this.sendText(char);
      await this.sleep(delayMs);
    }
  }

  /**
   * Capture the current screen
   */
  async captureScreen(): Promise<ScreenCapture> {
    this.ensureRunning();
    
    const result = await this.adapter.exec(`tmux capture-pane -t ${this.sessionName} -p -e`);
    
    if (result.code !== 0) {
      throw new Error(`Failed to capture screen: ${result.stderr}`);
    }
    
    const raw = result.stdout;
    const text = stripAnsi(raw);
    const lines = splitLines(text);
    
    const capture: ScreenCapture = {
      raw,
      text,
      lines,
      timestamp: Date.now(),
      size: this.config.size
    };
    
    this._outputBuffer = raw;
    
    if (this.recording) {
      this.recording.captures.push(capture);
    }
    
    return capture;
  }

  /**
   * Get screen text without ANSI codes
   */
  async getScreenText(): Promise<string> {
    const capture = await this.captureScreen();
    return capture.text;
  }

  /**
   * Get screen lines without ANSI codes
   */
  async getScreenLines(): Promise<string[]> {
    const capture = await this.captureScreen();
    return capture.lines;
  }

  /**
   * Get screen content (alias for getScreenText for backward compatibility)
   */
  async getScreenContent(): Promise<string> {
    return this.getScreenText();
  }

  /**
   * Get screen content with options
   */
  async getScreen(options?: { stripAnsi?: boolean }): Promise<string> {
    if (options?.stripAnsi) {
      return this.getScreenText();
    }
    const capture = await this.captureScreen();
    return capture.raw;
  }

  /**
   * Get screen lines (alias for getScreenLines)
   */
  async getLines(): Promise<string[]> {
    return this.getScreenLines();
  }

  /**
   * Wait for text to appear on screen
   */
  async waitForText(text: string, options?: WaitOptions): Promise<void> {
    await waitFor(
      async () => {
        const screenText = await this.getScreenText();
        return screenText.includes(text) ? true : undefined;
      },
      {
        timeout: options?.timeout ?? 5000,
        interval: options?.interval ?? 100,
        message: options?.message ?? `Text "${text}" not found`
      }
    );
  }

  /**
   * Wait for condition to be true
   */
  async waitFor(predicate: (screen: string) => boolean | Promise<boolean>, options?: WaitOptions): Promise<void> {
    await waitFor(
      async () => {
        const screenText = await this.getScreenText();
        const result = await predicate(screenText);
        return result ? true : undefined;
      },
      {
        timeout: options?.timeout ?? 5000,
        interval: options?.interval ?? 100,
        message: options?.message ?? `Condition not met`
      }
    );
  }

  /**
   * Wait for pattern to match screen content
   */
  async waitForPattern(pattern: RegExp, options?: WaitOptions): Promise<void> {
    await waitFor(
      async () => {
        const screenText = await this.getScreenText();
        return pattern.test(screenText) ? true : undefined;
      },
      {
        timeout: options?.timeout ?? 5000,
        interval: options?.interval ?? 100,
        message: options?.message ?? `Pattern ${pattern} not matched`
      }
    );
  }

  /**
   * Wait for specific line to contain text
   */
  async waitForLine(lineNumber: number, text: string, options?: WaitOptions): Promise<void> {
    await waitFor(
      async () => {
        const lines = await this.getScreenLines();
        const line = lines[lineNumber];
        return line && line.includes(text) ? true : undefined;
      },
      {
        timeout: options?.timeout ?? 5000,
        interval: options?.interval ?? 100,
        message: options?.message ?? `Line ${lineNumber} does not contain "${text}"`
      }
    );
  }

  /**
   * Assert specific line contains text
   */
  async assertLine(lineNumber: number, predicate: string | ((line: string) => boolean)): Promise<void> {
    const lines = await this.getScreenLines();
    const line = lines[lineNumber];
    
    if (!line) {
      throw new Error(`Line ${lineNumber} does not exist. Screen has ${lines.length} lines.`);
    }
    
    if (typeof predicate === 'string') {
      if (!line.includes(predicate)) {
        throw new Error(`Line ${lineNumber} does not contain "${predicate}". Line content: "${line}"`);
      }
    } else {
      if (!predicate(line)) {
        throw new Error(`Line ${lineNumber} assertion failed. Line content: "${line}"`);
      }
    }
  }

  /**
   * Assert screen matches expected content or predicate
   */
  async assertScreen(expected: string[] | string | ((screen: string) => boolean), options?: AssertionOptions): Promise<void> {
    if (typeof expected === 'function') {
      // Handle predicate function
      const screenText = await this.getScreenText();
      if (!expected(screenText)) {
        throw new Error('Screen assertion failed: predicate returned false');
      }
      return;
    }
    
    // Handle string/array comparison
    const capture = await this.captureScreen();
    const actual = options?.ignoreAnsi ? capture.text : capture.raw;
    
    const expectedText = Array.isArray(expected) ? expected.join('\n') : expected;
    
    if (!compareScreens(actual, expectedText, options)) {
      const diff = screenDiff(actual, expectedText);
      throw new Error(`Screen assertion failed:\n${diff}`);
    }
  }

  /**
   * Assert screen contains text
   */
  async assertScreenContains(text: string, options?: AssertionOptions): Promise<void> {
    const capture = await this.captureScreen();
    const screenText = normalizeText(capture.text, options);
    const searchText = normalizeText(text, options);
    
    if (!screenText.includes(searchText)) {
      throw new Error(`Screen does not contain "${text}"`);
    }
  }

  /**
   * Assert screen matches pattern
   */
  async assertScreenMatches(pattern: RegExp, options?: AssertionOptions): Promise<void> {
    const capture = await this.captureScreen();
    const screenText = normalizeText(capture.text, options);
    
    if (!pattern.test(screenText)) {
      throw new Error(`Screen does not match pattern: ${pattern}`);
    }
  }

  /**
   * Assert cursor is at specific position
   */
  async assertCursorAt(position: Point): Promise<void> {
    const cursor = await this.getCursor();
    
    if (cursor.x !== position.x || cursor.y !== position.y) {
      throw new Error(
        `Cursor position mismatch. Expected (${position.x}, ${position.y}), got (${cursor.x}, ${cursor.y})`
      );
    }
  }

  /**
   * Get current cursor position
   */
  async getCursor(): Promise<Point> {
    this.ensureRunning();
    
    // Get cursor position from tmux
    const result = await this.adapter.exec(`tmux display -t ${this.sessionName} -p '#{cursor_x},#{cursor_y}'`);
    
    if (result.code !== 0) {
      throw new Error(`Failed to get cursor position: ${result.stderr}`);
    }
    
    const [x, y] = result.stdout.trim().split(',').map(Number);
    
    return { x, y };
  }

  /**
   * Take a snapshot (alias for takeSnapshot for backward compatibility)
   */
  async snapshot(name: string, options?: { 
    stripAnsi?: boolean;
    trim?: boolean;
    compare?: (expected: string, actual: string) => boolean;
    updateSnapshot?: boolean;
    customContent?: string;
  }): Promise<void> {
    const { getSnapshotManager } = await import('./snapshot/snapshot-manager.js');
    const manager = getSnapshotManager();
    
    const capture = await this.captureScreen();
    let content = options?.customContent || (options?.stripAnsi ? capture.text : capture.raw);
    
    if (options?.trim) {
      content = content.trim();
    }
    
    // Check if snapshot exists and compare
    const existing = await manager.load(name);
    
    if (existing && !options?.updateSnapshot) {
      let matches = false;
      
      if (options?.compare) {
        matches = options.compare(existing, content);
      } else {
        matches = existing === content;
      }
      
      if (!matches) {
        const diff = screenDiff(existing, content);
        throw new Error(`Snapshot mismatch for "${name}":\n${diff}`);
      }
    } else {
      // Save new or updated snapshot
      await manager.save(name, content);
    }
  }

  /**
   * Take a snapshot
   */
  async takeSnapshot(name?: string): Promise<Snapshot> {
    const capture = await this.captureScreen();
    const snapshotName = name || `snapshot-${Date.now()}`;
    
    const snapshot: Snapshot = {
      id: `${this.sessionName}-${snapshotName}`,
      name: snapshotName,
      capture,
      metadata: {
        sessionName: this.sessionName,
        timestamp: Date.now(),
        size: this.config.size
      }
    };
    
    this.snapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  /**
   * Compare current screen with snapshot
   */
  async compareSnapshot(snapshot: Snapshot | string): Promise<boolean> {
    const targetSnapshot = typeof snapshot === 'string' 
      ? this.snapshots.get(snapshot) || await this.loadSnapshot(snapshot)
      : snapshot;
    
    if (!targetSnapshot) {
      throw new Error(`Snapshot not found: ${snapshot}`);
    }
    
    const currentCapture = await this.captureScreen();
    return currentCapture.raw === targetSnapshot.capture.raw;
  }

  /**
   * Save snapshot to file
   */
  async saveSnapshot(snapshot: Snapshot, path?: string): Promise<void> {
    const snapshotPath = path || `${this.config.snapshotDir}/${snapshot.id}.json`;
    
    // Ensure directory exists
    const dir = snapshotPath.substring(0, snapshotPath.lastIndexOf('/'));
    await this.adapter.mkdir(dir, { recursive: true });
    
    // Save snapshot
    await this.adapter.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
    
    this.debug(`Snapshot saved to: ${snapshotPath}`);
  }

  /**
   * Load snapshot from file
   */
  async loadSnapshot(path: string): Promise<Snapshot> {
    const content = await this.adapter.readFile(path);
    const snapshot = JSON.parse(content) as Snapshot;
    
    this.snapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  /**
   * Resize the terminal
   */
  async resize(size: TerminalSize): Promise<void> {
    this.ensureRunning();
    
    const cmd = `tmux resize-window -t ${this.sessionName} -x ${size.cols} -y ${size.rows}`;
    await this.adapter.exec(cmd);
    
    this.config.size = size;
    this.recordEvent('resize', size);
    
    this.debug(`Resized to ${size.cols}x${size.rows}`);
    await this.sleep(100);
  }

  /**
   * Clear the screen
   */
  async clear(): Promise<void> {
    this.ensureRunning();
    await this.sendKey('l', { ctrl: true });
  }

  /**
   * Reset the terminal
   */
  async reset(): Promise<void> {
    this.ensureRunning();
    await this.adapter.exec(`tmux send-keys -t ${this.sessionName} 'reset' Enter`);
    await this.sleep(500);
  }

  /**
   * Get current terminal size
   */
  getSize(): TerminalSize {
    return { ...this.config.size };
  }

  /**
   * Get session name
   */
  getSessionName(): string {
    return this.sessionName;
  }
  
  /**
   * Get the last captured output (for debugging)
   */
  getLastOutput(): string {
    return this._outputBuffer;
  }

  /**
   * Clear the output buffer
   */
  clearOutput(): void {
    this._outputBuffer = '';
  }

  /**
   * Execute a tmux command directly
   * Useful for advanced tmux operations not covered by higher-level methods
   */
  async exec(command: string): Promise<{ code: number; stdout: string; stderr: string }> {
    // Allow both full tmux commands and shortcuts
    const fullCommand = command.startsWith('tmux') ? command : `tmux ${command}`;
    return this.adapter.exec(fullCommand);
  }

  /**
   * Capture screen with cursor position
   * Returns both screen content and cursor position
   */
  async capture(): Promise<ScreenCapture & { cursor: Point }> {
    const screen = await this.captureScreen();
    const cursor = await this.getCursor();
    return {
      ...screen,
      cursor
    };
  }

  /**
   * Start recording session
   */
  startRecording(): void {
    if (this.recording) {
      this.debug('Recording already in progress');
      return;
    }
    
    this.recording = {
      startTime: Date.now(),
      events: [],
      captures: []
    };
    
    this.debug('Recording started');
  }

  /**
   * Stop recording and return the recording
   */
  stopRecording(): Recording {
    if (!this.recording) {
      throw new Error('No recording in progress');
    }
    
    const recording = this.recording;
    this.recording = null;
    
    this.debug(`Recording stopped. ${recording.events.length} events, ${recording.captures.length} captures`);
    return recording;
  }

  /**
   * Play back a recording
   */
  async playRecording(recording: Recording, speed: number = 1): Promise<void> {
    this.debug(`Playing recording with ${recording.events.length} events at ${speed}x speed`);
    
    const startTime = Date.now();
    
    for (const event of recording.events) {
      // Calculate when this event should be played
      const eventTime = (event.timestamp - recording.startTime) / speed;
      const currentTime = Date.now() - startTime;
      
      // Wait if needed
      if (eventTime > currentTime) {
        await this.sleep(eventTime - currentTime);
      }
      
      // Play the event
      switch (event.type) {
        case 'input':
          if (event.data.type === 'text') {
            await this.sendText(event.data.text);
          } else if (event.data.type === 'paste') {
            await this.paste(event.data.text);
          }
          break;
          
        case 'key':
          await this.sendKey(event.data.key, event.data.modifiers);
          break;
          
        case 'mouse':
          await this.sendMouse(event.data);
          break;
          
        case 'resize':
          await this.resize(event.data);
          break;
      }
    }
    
    this.debug('Recording playback complete');
  }

  /**
   * Sleep for specified milliseconds
   */
  async sleep(ms: number): Promise<void> {
    return sleep(ms);
  }

  /**
   * Debug log
   */
  debug(message: string): void {
    if (this.debugMode) {
      console.log(`[TmuxTester:${this.sessionName}] ${message}`);
    }
  }

  // Private helper methods

  private ensureRunning(): void {
    if (!this.running) {
      throw new Error('Tester is not running. Call start() first.');
    }
  }

  /**
   * Send a command to the terminal (public method)
   */
  async sendCommand(command: string): Promise<void> {
    this.ensureRunning();
    const escaped = escapeShellArg(command);
    const cmd = `tmux send-keys -t ${this.sessionName} ${escaped} Enter`;
    await this.adapter.exec(cmd);
    this.recordEvent('input', { type: 'command', text: command });
    await this.sleep(100);
  }

  private recordEvent(type: RecordedEvent['type'], data: any): void {
    if (this.recording) {
      this.recording.events.push({
        timestamp: Date.now(),
        type,
        data
      });
    }
  }
}