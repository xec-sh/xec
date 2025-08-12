/**
 * High-Level Interaction Helpers
 * Utilities for common terminal UI interactions
 */

import type { Point, WaitOptions, TerminalTester } from '../core/types.js';

/**
 * Navigate menu using arrow keys
 */
export async function navigateMenu(
  tester: TerminalTester,
  direction: 'up' | 'down' | 'left' | 'right',
  count: number = 1
): Promise<void> {
  for (let i = 0; i < count; i++) {
    await tester.sendKey(direction);
    await tester.sleep(100);
  }
}

/**
 * Select menu item by text
 */
export async function selectMenuItem(
  tester: TerminalTester,
  itemText: string,
  maxAttempts: number = 10
): Promise<void> {
  // Try to find the item
  for (let i = 0; i < maxAttempts; i++) {
    const screen = await tester.getScreenText();
    
    if (screen.includes(`> ${itemText}`) || screen.includes(`● ${itemText}`)) {
      // Item is selected, press enter
      await tester.sendKey('enter');
      return;
    }
    
    // Try navigating down
    await tester.sendKey('down');
    await tester.sleep(100);
  }
  
  throw new Error(`Menu item "${itemText}" not found after ${maxAttempts} attempts`);
}

/**
 * Fill form field
 */
export async function fillField(
  tester: TerminalTester,
  fieldName: string,
  value: string
): Promise<void> {
  // Wait for field to be visible
  await tester.waitForText(fieldName);
  
  // Clear existing value (Ctrl+A, Delete)
  await tester.sendKey('a', { ctrl: true });
  await tester.sendKey('delete');
  
  // Type new value
  await tester.typeText(value);
  
  // Move to next field
  await tester.sendKey('tab');
}

/**
 * Submit form
 * Optionally fill form fields before submitting
 */
export async function submitForm(
  tester: TerminalTester,
  formData?: Record<string, string>
): Promise<void> {
  // If form data is provided, fill each field
  if (formData) {
    for (const [field, value] of Object.entries(formData)) {
      // Wait for field to be visible
      await tester.waitForText(field, { timeout: 5000 });
      
      // Type the value
      await tester.typeText(value);
      
      // Press Enter to move to next field
      await tester.sendKey('enter');
      await tester.sleep(200);
    }
  } else {
    // Just submit the form
    await tester.sendKey('enter');
  }
}

/**
 * Cancel dialog or form
 */
export async function cancel(tester: TerminalTester): Promise<void> {
  await tester.sendKey('escape');
}

/**
 * Confirm dialog
 */
export async function confirmDialog(
  tester: TerminalTester,
  accept: boolean = true
): Promise<void> {
  if (accept) {
    await tester.sendKey('y');
  } else {
    await tester.sendKey('n');
  }
}

/**
 * Scroll content
 */
export async function scroll(
  tester: TerminalTester,
  direction: 'up' | 'down' | 'pageup' | 'pagedown' | 'home' | 'end',
  count: number = 1
): Promise<void> {
  const key = direction === 'up' || direction === 'down' ? direction : direction.toLowerCase();
  
  for (let i = 0; i < count; i++) {
    await tester.sendKey(key);
    await tester.sleep(50);
  }
}

/**
 * Click on text
 */
export async function clickOnText(
  tester: TerminalTester,
  text: string
): Promise<void> {
  const screen = await tester.getScreenText();
  const lines = screen.split('\n');
  
  // Find text position
  for (let y = 0; y < lines.length; y++) {
    const x = lines[y].indexOf(text);
    if (x !== -1) {
      // Click on the text
      await tester.sendMouse({
        type: 'click',
        position: { x, y },
        button: 'left'
      });
      return;
    }
  }
  
  throw new Error(`Text "${text}" not found on screen`);
}

/**
 * Click at position
 */
export async function clickAt(
  tester: TerminalTester,
  position: Point,
  button: 'left' | 'middle' | 'right' = 'left'
): Promise<void> {
  await tester.sendMouse({
    type: 'click',
    position,
    button
  });
}

/**
 * Drag from one position to another
 */
export async function drag(
  tester: TerminalTester,
  from: Point,
  to: Point
): Promise<void> {
  // Mouse down at start position
  await tester.sendMouse({
    type: 'down',
    position: from,
    button: 'left'
  });
  
  await tester.sleep(100);
  
  // Move to end position
  await tester.sendMouse({
    type: 'drag',
    position: to,
    button: 'left'
  });
  
  await tester.sleep(100);
  
  // Mouse up at end position
  await tester.sendMouse({
    type: 'up',
    position: to,
    button: 'left'
  });
}

/**
 * Select text by dragging
 */
export async function selectText(
  tester: TerminalTester,
  startText: string,
  endText: string
): Promise<void> {
  const screen = await tester.getScreenText();
  const lines = screen.split('\n');
  
  let startPos: Point | null = null;
  let endPos: Point | null = null;
  
  // Find start and end positions
  for (let y = 0; y < lines.length; y++) {
    const startX = lines[y].indexOf(startText);
    if (startX !== -1 && !startPos) {
      startPos = { x: startX, y };
    }
    
    const endX = lines[y].indexOf(endText);
    if (endX !== -1) {
      endPos = { x: endX + endText.length - 1, y };
    }
  }
  
  if (!startPos || !endPos) {
    throw new Error('Could not find text positions for selection');
  }
  
  await drag(tester, startPos, endPos);
}

/**
 * Copy selected text
 */
export async function copySelection(tester: TerminalTester): Promise<void> {
  await tester.sendKey('c', { ctrl: true });
}

/**
 * Paste from clipboard
 */
export async function pasteFromClipboard(tester: TerminalTester): Promise<void> {
  await tester.sendKey('v', { ctrl: true });
}

/**
 * Execute command in shell
 */
export async function executeCommand(
  tester: TerminalTester,
  command: string
): Promise<void> {
  await tester.sendText(command);
  await tester.sendKey('enter');
}

/**
 * Wait for prompt
 */
export async function waitForPrompt(
  tester: TerminalTester,
  prompt: string = '$',
  options?: WaitOptions
): Promise<void> {
  await tester.waitForText(prompt, options);
}

/**
 * Login to application
 */
export async function login(
  tester: TerminalTester,
  username: string,
  password: string
): Promise<void> {
  // Wait for username prompt
  await tester.waitForText('Username:');
  await tester.typeText(username);
  await tester.sendKey('enter');
  
  // Wait for password prompt
  await tester.waitForText('Password:');
  await tester.typeText(password);
  await tester.sendKey('enter');
}

/**
 * Navigate through tabs
 */
export async function switchTab(
  tester: TerminalTester,
  tabIndex: number
): Promise<void> {
  // Use Alt+number to switch tabs (common pattern)
  await tester.sendKey(tabIndex.toString(), { alt: true });
}

/**
 * Open command palette or menu
 */
export async function openCommandPalette(tester: TerminalTester): Promise<void> {
  await tester.sendKey('p', { ctrl: true, shift: true });
}

/**
 * Search for text
 */
export async function search(
  tester: TerminalTester,
  searchText: string
): Promise<boolean> {
  // Get current screen content
  const screen = await tester.getScreenText();
  
  // Check if text exists
  return screen.includes(searchText);
}

/**
 * Exit application
 */
export async function exitApplication(
  tester: TerminalTester,
  force: boolean = false
): Promise<void> {
  if (force) {
    await tester.sendKey('c', { ctrl: true });
  } else {
    await tester.sendKey('q');
  }
}

/**
 * Wait for loading to complete
 */
export async function waitForLoading(
  tester: TerminalTester,
  options?: WaitOptions
): Promise<void> {
  // Wait for common loading indicators to disappear
  const indicators = ['Loading...', 'Please wait...', '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  
  await tester.waitForPattern(
    new RegExp(`^(?!.*(${indicators.join('|')})).*$`, 's'),
    options
  );
}

/**
 * Take screenshot with annotation
 */
export async function takeAnnotatedSnapshot(
  tester: TerminalTester,
  name: string,
  annotations?: { text: string; position: Point }[]
): Promise<void> {
  const snapshot = await tester.takeSnapshot(name);
  
  // Add annotations to metadata
  if (annotations && snapshot.metadata) {
    snapshot.metadata.annotations = annotations;
  }
  
  await tester.saveSnapshot(snapshot);
}