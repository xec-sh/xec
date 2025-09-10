/**
 * Hierarchical Focus Management Demo
 * Demonstrates multi-level focus where containers (boxes) and their children
 * can be focused simultaneously, with different navigation keys for different levels
 */

import { getKeyHandler } from "../src/lib/key-handler";
import { setupCommonDemoKeys } from "./lib/standalone-keys";
import { InputComponent, InputComponentEvents } from "../src/components/input";
import { SelectComponent, type SelectOption, SelectComponentEvents } from "../src/components/select";
import {
  Renderer,
  BoxComponent,
  TextComponent,
  type ParsedKey,
  createRenderer,
} from "../src/index";
import {
  hFocus,
  FocusLevel,
  type FocusScope,
  useHierarchicalFocus,
  hierarchicalFocusManager
} from "../src/app/hierarchical-focus-manager";

// Component references
let renderer: Renderer | null = null;
let mainContainer: BoxComponent | null = null;
let leftPanel: BoxComponent | null = null;
let rightPanel: BoxComponent | null = null;
let bottomPanel: BoxComponent | null = null;

// Left panel components
let colorSelectBox: BoxComponent | null = null;
let colorSelect: SelectComponent | null = null;
let styleSelectBox: BoxComponent | null = null;
let styleSelect: SelectComponent | null = null;

// Right panel components
let nameInputBox: BoxComponent | null = null;
let nameInput: InputComponent | null = null;
let emailInputBox: BoxComponent | null = null;
let emailInput: InputComponent | null = null;

// Bottom panel components
let statusText: TextComponent | null = null;
let helpText: TextComponent | null = null;

// Options for select components
const colorOptions: SelectOption[] = [
  { name: "Blue", value: "#0066ff", description: "Primary color" },
  { name: "Green", value: "#00aa00", description: "Success color" },
  { name: "Red", value: "#ff0000", description: "Danger color" },
  { name: "Purple", value: "#8a2be2", description: "Accent color" },
];

const styleOptions: SelectOption[] = [
  { name: "Bold", value: "bold", description: "Strong emphasis" },
  { name: "Italic", value: "italic", description: "Subtle emphasis" },
  { name: "Underline", value: "underline", description: "Underlined text" },
  { name: "Normal", value: "normal", description: "Regular text" },
];

function createUI(rendererInstance: Renderer): void {
  renderer = rendererInstance;
  renderer.setBackgroundColor("#0a0e1a");

  // Main container
  mainContainer = new BoxComponent(renderer.root.ctx, {
    id: "main-container",
    width: "auto",
    height: renderer.height,
    flexDirection: "column",
    backgroundColor: "#0a0e1a",
  });

  // Create panels
  createTopPanels();
  createBottomPanel();

  // Add panels to main container
  const topContainer = new BoxComponent(renderer.root.ctx, {
    id: "top-container",
    width: "auto",
    height: "auto",
    flexDirection: "row",
    flexGrow: 1,
  });

  topContainer.add(leftPanel!);
  topContainer.add(rightPanel!);

  mainContainer.add(topContainer);
  mainContainer.add(bottomPanel!);

  renderer.root.add(mainContainer);

  // Setup hierarchical focus
  setupFocusScopes();

  // Setup keyboard handling
  setupKeyboardHandling();

  // Initial focus
  setTimeout(() => {
    hFocus.enterScope("left-panel");
  }, 100);
}

function createTopPanels(): void {
  // Left panel - Select components
  leftPanel = new BoxComponent(renderer!.root.ctx, {
    id: "left-panel",
    width: "50%",
    height: "auto",
    border: true,
    borderStyle: "single",
    borderColor: "#1e293b",
    focusedBorderColor: "#3b82f6",
    backgroundColor: "#0f172a",
    title: "Settings",
    titleAlignment: "center",
    flexGrow: 1,
    padding: 1,
  });

  colorSelectBox = new BoxComponent(renderer!.root.ctx, {
    id: "color-select-box",
    width: "auto",
    height: "auto",
    border: true,
    borderStyle: "single",
    borderColor: "#334155",
    focusedBorderColor: "#60a5fa",
    backgroundColor: "#1e293b",
    title: "Color",
    marginBottom: 1,
  });

  colorSelect = new SelectComponent(renderer!.root.ctx, {
    id: "color-select",
    width: "auto",
    height: 6,
    options: colorOptions,
    backgroundColor: "#1e293b",
    focusedBackgroundColor: "#334155",
    textColor: "#e2e8f0",
    selectedBackgroundColor: "#3b82f6",
    showDescription: true,
  });

  colorSelectBox.add(colorSelect);

  styleSelectBox = new BoxComponent(renderer!.root.ctx, {
    id: "style-select-box",
    width: "auto",
    height: "auto",
    border: true,
    borderStyle: "single",
    borderColor: "#334155",
    focusedBorderColor: "#60a5fa",
    backgroundColor: "#1e293b",
    title: "Style",
  });

  styleSelect = new SelectComponent(renderer!.root.ctx, {
    id: "style-select",
    width: "auto",
    height: 6,
    options: styleOptions,
    backgroundColor: "#1e293b",
    focusedBackgroundColor: "#334155",
    textColor: "#e2e8f0",
    selectedBackgroundColor: "#3b82f6",
    showDescription: true,
  });

  styleSelectBox.add(styleSelect);

  leftPanel.add(colorSelectBox);
  leftPanel.add(styleSelectBox);

  // Right panel - Input components
  rightPanel = new BoxComponent(renderer!.root.ctx, {
    id: "right-panel",
    width: "50%",
    height: "auto",
    border: true,
    borderStyle: "single",
    borderColor: "#1e293b",
    focusedBorderColor: "#10b981",
    backgroundColor: "#0f172a",
    title: "User Info",
    titleAlignment: "center",
    flexGrow: 1,
    padding: 1,
  });

  nameInputBox = new BoxComponent(renderer!.root.ctx, {
    id: "name-input-box",
    width: "auto",
    height: 3,
    border: true,
    borderStyle: "single",
    borderColor: "#334155",
    focusedBorderColor: "#34d399",
    backgroundColor: "#1e293b",
    title: "Name",
    marginBottom: 1,
  });

  nameInput = new InputComponent(renderer!.root.ctx, {
    id: "name-input",
    width: "auto",
    height: 1,
    placeholder: "Enter your name...",
    backgroundColor: "#1e293b",
    focusedBackgroundColor: "#334155",
    textColor: "#f1f5f9",
  });

  nameInputBox.add(nameInput);

  emailInputBox = new BoxComponent(renderer!.root.ctx, {
    id: "email-input-box",
    width: "auto",
    height: 3,
    border: true,
    borderStyle: "single",
    borderColor: "#334155",
    focusedBorderColor: "#34d399",
    backgroundColor: "#1e293b",
    title: "Email",
  });

  emailInput = new InputComponent(renderer!.root.ctx, {
    id: "email-input",
    width: "auto",
    height: 1,
    placeholder: "Enter your email...",
    backgroundColor: "#1e293b",
    focusedBackgroundColor: "#334155",
    textColor: "#f1f5f9",
  });

  emailInputBox.add(emailInput);

  rightPanel.add(nameInputBox);
  rightPanel.add(emailInputBox);
}

function createBottomPanel(): void {
  bottomPanel = new BoxComponent(renderer!.root.ctx, {
    id: "bottom-panel",
    width: "auto",
    height: 5,
    border: true,
    borderStyle: "double",
    borderColor: "#475569",
    focusedBorderColor: "#fbbf24",
    backgroundColor: "#1e293b",
    flexGrow: 0,
    padding: 1,
  });

  statusText = new TextComponent(renderer!.root.ctx, {
    id: "status-text",
    content: "Status: Ready",
    fg: "#10b981",
    height: 1,
  });

  helpText = new TextComponent(renderer!.root.ctx, {
    id: "help-text",
    content: "Alt+1/2/3: Switch panels | Tab: Navigate | Shift+1-7: Check focus states | Ctrl+C: Quit",
    fg: "#94a3b8",
    height: 1,
    marginTop: 1,
  });

  bottomPanel.add(statusText);
  bottomPanel.add(helpText);
}

function setupFocusScopes(): void {
  // Define scopes for panels
  const leftPanelScope: FocusScope = {
    id: "left-panel",
    level: FocusLevel.CONTAINER,
    parentId: null,
    allowSimultaneousFocus: true,
    navigationKeys: {
      next: "tab",
      previous: "shift+tab",
      enter: "enter",
      exit: "escape",
    },
  };

  const rightPanelScope: FocusScope = {
    id: "right-panel",
    level: FocusLevel.CONTAINER,
    parentId: null,
    allowSimultaneousFocus: true,
    navigationKeys: {
      next: "tab",
      previous: "shift+tab",
      enter: "enter",
      exit: "escape",
    },
  };

  const bottomPanelScope: FocusScope = {
    id: "bottom-panel",
    level: FocusLevel.CONTAINER,
    parentId: null,
    allowSimultaneousFocus: false,
  };

  // Register scopes
  hierarchicalFocusManager.registerScope(leftPanelScope);
  hierarchicalFocusManager.registerScope(rightPanelScope);
  hierarchicalFocusManager.registerScope(bottomPanelScope);

  // Register panel containers at CONTAINER level
  useHierarchicalFocus(leftPanel!, {
    scopeId: "left-panel",
    level: FocusLevel.CONTAINER,
    order: 0,
  });

  useHierarchicalFocus(rightPanel!, {
    scopeId: "right-panel",
    level: FocusLevel.CONTAINER,
    order: 1,
  });

  useHierarchicalFocus(bottomPanel!, {
    scopeId: "bottom-panel",
    level: FocusLevel.CONTAINER,
    order: 2,
  });

  // Register inner boxes at GROUP level
  useHierarchicalFocus(colorSelectBox!, {
    scopeId: "left-panel",
    level: FocusLevel.GROUP,
    order: 0,
    maintainParentFocus: true,
  });

  useHierarchicalFocus(styleSelectBox!, {
    scopeId: "left-panel",
    level: FocusLevel.GROUP,
    order: 1,
    maintainParentFocus: true,
  });

  useHierarchicalFocus(nameInputBox!, {
    scopeId: "right-panel",
    level: FocusLevel.GROUP,
    order: 0,
    maintainParentFocus: true,
  });

  useHierarchicalFocus(emailInputBox!, {
    scopeId: "right-panel",
    level: FocusLevel.GROUP,
    order: 1,
    maintainParentFocus: true,
  });

  // Register interactive components at COMPONENT level
  useHierarchicalFocus(colorSelect!, {
    scopeId: "left-panel",
    level: FocusLevel.COMPONENT,
    order: 0,
    maintainParentFocus: true,
  });

  useHierarchicalFocus(styleSelect!, {
    scopeId: "left-panel",
    level: FocusLevel.COMPONENT,
    order: 1,
    maintainParentFocus: true,
  });

  useHierarchicalFocus(nameInput!, {
    scopeId: "right-panel",
    level: FocusLevel.COMPONENT,
    order: 0,
    maintainParentFocus: true,
  });

  useHierarchicalFocus(emailInput!, {
    scopeId: "right-panel",
    level: FocusLevel.COMPONENT,
    order: 1,
    maintainParentFocus: true,
  });

  // Setup event handlers
  setupComponentEvents();
}

function setupComponentEvents(): void {
  // Update status on selection changes
  colorSelect?.on(SelectComponentEvents.SELECTION_CHANGED, () => {
    updateStatus("Color changed");
  });

  styleSelect?.on(SelectComponentEvents.SELECTION_CHANGED, () => {
    updateStatus("Style changed");
  });

  nameInput?.on(InputComponentEvents.INPUT, () => {
    updateStatus("Name updated");
  });

  emailInput?.on(InputComponentEvents.INPUT, () => {
    updateStatus("Email updated");
  });
}

function updateStatus(message: string): void {
  if (statusText) {
    const focused = hFocus.getAllFocused();
    const levels: string[] = [];

    for (const [level, component] of focused) {
      if (component) {
        levels.push(`${FocusLevel[level]}: ${component.id}`);
      }
    }

    statusText.content = `Status: ${message} | Focus: ${levels.join(", ") || "None"}`;
  }
}

function setupKeyboardHandling(): void {
  getKeyHandler().on("keypress", (key: ParsedKey) => {
    // Let hierarchical focus manager handle navigation first
    if (hFocus.handleKey(key)) {
      updateStatus("Navigation");
      return;
    }

    // Custom panel switching with Alt+number
    if (key.option) {
      switch (key.name) {
        case "1":
          hFocus.enterScope("left-panel");
          updateStatus("Switched to left panel");
          break;
        case "2":
          hFocus.enterScope("right-panel");
          updateStatus("Switched to right panel");
          break;
        case "3":
          hFocus.enterScope("bottom-panel");
          updateStatus("Switched to bottom panel");
          break;
      }
    }

    // Focus specific levels with Ctrl+number
    if (key.ctrl && !key.shift) {
      switch (key.name) {
        case "1":
          // Focus only container level
          hFocus.clearLevel(FocusLevel.GROUP);
          hFocus.clearLevel(FocusLevel.COMPONENT);
          updateStatus("Container level focus");
          break;
        case "2":
          // Focus group level
          const currentScope = (hierarchicalFocusManager as any).getCurrentScope();
          if (currentScope) {
            hFocus.navigate("next");
          }
          updateStatus("Group level focus");
          break;
        case "3":
          // Focus component level
          hFocus.navigate("next");
          updateStatus("Component level focus");
          break;
      }
    }
    
    // New focus checking functionality with Shift+number
    if (key.shift && !key.ctrl && !key.option) {
      switch (key.name) {
        case "!": // Shift+1 - Check if left panel has focus
          const leftHasFocus = hFocus.isFocused("left-panel");
          updateStatus(`Left panel has focus: ${leftHasFocus}`);
          break;
        case "@": // Shift+2 - Check if right panel has focus
          const rightHasFocus = hFocus.isFocused("right-panel");
          updateStatus(`Right panel has focus: ${rightHasFocus}`);
          break;
        case "#": // Shift+3 - Check if bottom panel has focus
          const bottomHasFocus = hFocus.isFocused("bottom-panel");
          updateStatus(`Bottom panel has focus: ${bottomHasFocus}`);
          break;
        case "$": // Shift+4 - Get focused component in current scope
          const currentScopeCheck = (hierarchicalFocusManager as any).getCurrentScope();
          if (currentScopeCheck) {
            const focused = hFocus.getFocusedInScope(currentScopeCheck.id);
            updateStatus(`Focused in ${currentScopeCheck.id}: ${focused?.id || 'none'}`);
          }
          break;
        case "%": // Shift+5 - Show all focus states
          const state = hFocus.getCurrentFocusState();
          let stateInfo = "Focus State: ";
          for (const [level, info] of state.entries()) {
            stateInfo += `[${FocusLevel[level]}: ${info.component?.id || 'none'}] `;
          }
          updateStatus(stateInfo);
          break;
        case "^": // Shift+6 - Check active scopes
          const leftActive = hFocus.isScopeActive("left-panel");
          const rightActive = hFocus.isScopeActive("right-panel");
          const bottomActive = hFocus.isScopeActive("bottom-panel");
          updateStatus(`Active: L=${leftActive} R=${rightActive} B=${bottomActive}`);
          break;
        case "&": // Shift+7 - Get scope focus state
          const scopeStates = ["left-panel", "right-panel", "bottom-panel"].map(id => {
            const state = hFocus.getScopeFocusState(id);
            return `${id.split('-')[0]}: ${state.hasFocus ? '✓' : '✗'}`;
          });
          updateStatus(`Scope Focus: ${scopeStates.join(' | ')}`);
          break;
      }
    }
  });
}

export function run(rendererInstance: Renderer): void {
  createUI(rendererInstance);
  updateStatus("Ready");
}

export function destroy(rendererInstance: Renderer): void {
  getKeyHandler().removeAllListeners();

  // Clean up components
  colorSelect?.destroy();
  styleSelect?.destroy();
  nameInput?.destroy();
  emailInput?.destroy();

  // Clean up containers
  if (mainContainer) {
    rendererInstance.root.remove(mainContainer.id);
  }

  // Reset focus manager
  hFocus.reset();

  // Clear references
  renderer = null;
  mainContainer = null;
  leftPanel = null;
  rightPanel = null;
  bottomPanel = null;
  colorSelectBox = null;
  colorSelect = null;
  styleSelectBox = null;
  styleSelect = null;
  nameInputBox = null;
  nameInput = null;
  emailInputBox = null;
  emailInput = null;
  statusText = null;
  helpText = null;
}

if (import.meta.main) {
  const renderer = await createRenderer({
    exitOnCtrlC: true,
    useAlternateScreen: true,
    targetFps: 30,
  });
  run(renderer);
  setupCommonDemoKeys(renderer);
  renderer.start();
}