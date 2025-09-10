import {
  Box,
  Text,
  effect,
  signal,
  Select,
  VStack,
  computed,
  ParsedKey,
  FocusLevel,
  BoxComponent,
  TextAttributes,
  SelectComponent,
  screenDimensions,
  DescriptionTruncate,
  SelectComponentEvents,
  hierarchicalFocusManager
} from "@xec-sh/aura";

import { appStore } from "../store.js";
import { type Workspace, getWorkspaceManager } from "../config/index.js";

// Signal to hold workspaces
const workspacesSignal = signal<Workspace[]>([]);
const loadingSignal = signal(true);
const errorSignal = signal<string | null>(null);

// Load workspaces asynchronously
async function loadWorkspaces() {
  try {
    loadingSignal.set(true);
    errorSignal.set(null);

    const workspaceManager = getWorkspaceManager();
    await workspaceManager.initialize();

    const workspaces = await workspaceManager.getAll();
    workspacesSignal.set(workspaces);

    // Set active workspace if available
    const activeWorkspace = await workspaceManager.getActive();
    if (activeWorkspace) {
      appStore.currentWorkspace.set(activeWorkspace.id);
    }
  } catch (error: any) {
    errorSignal.set(error.message || 'Failed to load workspaces');
    console.error('Failed to load workspaces:', error);
  } finally {
    loadingSignal.set(false);
  }
}

// Initialize workspaces on startup
loadWorkspaces();

function ProjectBrowser() {
  const selectRef = signal<SelectComponent | null>(null);

  // Convert workspaces to select options
  const options = computed(() => {
    const workspaces = workspacesSignal.peek();
    const loading = loadingSignal();
    const error = errorSignal();

    if (loading) {
      return [{
        name: 'Loading...',
        description: 'Please wait while workspaces are loaded',
        value: '__loading__',
        disabled: true,
      }];
    }

    if (error) {
      return [{
        name: 'Error',
        description: error,
        value: '__error__',
        disabled: true,
      }];
    }

    if (workspaces.length === 0) {
      return [{
        name: 'No workspaces',
        description: 'Press "n" to add a new workspace',
        value: '__empty__',
        disabled: true,
      }];
    }

    return workspaces.map(workspace => ({
      name: workspace.name,
      description: workspace.path,
      value: workspace.id,
    }));
  });

  return Select({
    id: 'sidebar-select',
    showScrollIndicator: true,
    minHeight: 2,
    wrapSelection: true,
    showDescription: true,
    descriptionTruncate: DescriptionTruncate.START,
    ref: selectRef,
    onMount: () => {
      const comp = selectRef();
      if (comp) {
        appStore.sidebarSelectComponent.set(comp);

        // Register the select component with focus manager
        hierarchicalFocusManager.register(comp, {
          scopeId: "sidebar-scope",
          level: FocusLevel.COMPONENT,
          order: 1,
          maintainParentFocus: true, // Now cascade blur works properly
        });

        // Listen to selection changes
        comp.on(SelectComponentEvents.ITEM_SELECTED, async (index: number, option: any) => {
          if (option?.value && typeof option.value === 'string' && !option.value.startsWith('__')) {
            const workspaceManager = getWorkspaceManager();
            await workspaceManager.setActive(option.value);
            console.log('Setting currentWorkspace to:', option.value);
            appStore.currentWorkspace.set(option.value);
            console.log('After set, currentWorkspace is:', appStore.currentWorkspace());
            console.log('Selected workspace:', option);
          }
        });
      }
    },
    options,
    onKeyDown: async (key: ParsedKey) => {
      const workspaceManager = getWorkspaceManager();
      const selectComp = appStore.sidebarSelectComponent();

      // Add new workspace
      if (key.name === 'n' && !key.ctrl) {
        try {
          // For now, add current directory as workspace
          const currentPath = process.cwd();
          const workspace = await workspaceManager.add(currentPath);

          // Reload workspaces
          const workspaces = await workspaceManager.getAll();
          workspacesSignal.set(workspaces);

          // Select the newly added workspace
          if (selectComp) {
            const index = workspaces.findIndex(w => w.id === workspace.id);
            if (index !== -1) {
              selectComp.setSelectedIndex(index);
            }
          }
        } catch (error: any) {
          errorSignal.set(error.message);
          setTimeout(() => errorSignal.set(null), 3000);
        }
      }

      // Remove selected workspace
      if (key.name === 'd' && !key.ctrl) {
        const selectedOption = selectComp?.getSelectedOption();
        if (selectComp && selectedOption?.value && !selectedOption.value.startsWith('__')) {
          try {
            const workspaceId = selectedOption.value as string;
            await workspaceManager.remove(workspaceId);

            // Reload workspaces
            const workspaces = await workspaceManager.getAll();
            workspacesSignal.set(workspaces);

            // Adjust selection
            if (selectComp.getSelectedIndex() >= workspaces.length && workspaces.length > 0) {
              selectComp.setSelectedIndex(workspaces.length - 1);
            }
          } catch (error: any) {
            errorSignal.set(error.message);
            setTimeout(() => errorSignal.set(null), 3000);
          }
        }
      }

      // Refresh workspaces
      if (key.name === 'r' && !key.ctrl) {
        await loadWorkspaces();
      }

      // Discover workspaces in home directory
      if (key.name === 'f' && !key.ctrl) {
        try {
          loadingSignal.set(true);
          const discovered = await workspaceManager.discoverAndAdd();
          if (discovered.length > 0) {
            const workspaces = await workspaceManager.getAll();
            workspacesSignal.set(workspaces);
          }
        } catch (error: any) {
          errorSignal.set(error.message);
          setTimeout(() => errorSignal.set(null), 3000);
        } finally {
          loadingSignal.set(false);
        }
      }
    }
  });
}

export function SidebarComponent() {
  const sidebarRef = signal<BoxComponent | null>(null);

  // Register the sidebar scope
  hierarchicalFocusManager.registerScope({
    id: "sidebar-scope",
    level: FocusLevel.CONTAINER,
    circular: true,
    allowSimultaneousFocus: true, // Don't allow simultaneous focus with children
  });

  // Use a default width initially, screenDimensions will update it reactively
  const minWidth = signal(20);

  // Wrap screenDimensions in a computed to handle initialization
  const screenWidth = computed(() => {
    try {
      const { width } = screenDimensions();
      return width();
    } catch {
      // Return a default width if screen dimensions aren't initialized yet
      return 80; // Default terminal width
    }
  });

  const maxWidth = computed(() => screenWidth() / 2);

  // Update selection when active workspace changes
  effect(() => {
    const workspaceId = appStore.currentWorkspace();
    const select = appStore.sidebarSelectComponent();
    const workspaces = workspacesSignal();

    if (select && workspaceId && workspaces.length > 0) {
      const index = workspaces.findIndex(w => w.id === workspaceId);
      if (index !== -1 && select.getSelectedIndex() !== index) {
        select.setSelectedIndex(index);
      }
    }
  });

  const sidebarBox = VStack({
    id: 'sidebar-box',
    minWidth,
    maxWidth,
    gap: 1,
    filledGaps: true,
    height: "100%",
    flexShrink: 0,
    border: true,
    ref: sidebarRef,
    onMount: () => {
      const comp = sidebarRef();
      if (comp) {
        appStore.sidebarComponent.set(comp);

        // Register the sidebar box with focus manager
        hierarchicalFocusManager.register(comp, {
          scopeId: "sidebar-scope",
          level: FocusLevel.CONTAINER,
          order: 0
        });
      }
    },
    onKeyDown(key: ParsedKey) {
      const inst = appStore.sidebarComponent();
      if (inst) {
        if (key.shift) {
          if (key.option) {
            if (key.name === 'right') {
              inst.width = maxWidth();
            } else if (key.name === 'left') {
              inst.width = minWidth();
            }
          } else {
            if (key.name === 'right') {
              inst.width = inst.width + 1;
            } else if (key.name === 'left') {
              inst.width = inst.width - 1;
            }
          }
        }
      }
    },
  },
    Box({
      id: 'sidebar-title',
      height: 1,
      alignItems: 'center',
    },
      Text({
        content: computed(() => {
          const hasFocus = hierarchicalFocusManager.isFocused('sidebar-scope');
          return hasFocus ? '▶ XEC' : '> XEC';
        }),
        fg: computed(() => hierarchicalFocusManager.isFocused('sidebar-scope') ? 'accent' : 'muted'),
        attributes: TextAttributes.BOLD,
      }),
    ),
    ProjectBrowser(),
    Box({ id: 'sidebar-help', height: 'auto', paddingLeft: 1, paddingRight: 1, flexDirection: 'column' },
      Text({ content: 'Keys:', fg: 'muted', attributes: TextAttributes.BOLD, }),
      Text({ content: 'n - Add workspace', fg: 'muted', attributes: TextAttributes.DIM, }),
      Text({ content: 'd - Remove workspace', fg: 'muted', attributes: TextAttributes.DIM, }),
      Text({ content: 'r - Refresh list', fg: 'muted', attributes: TextAttributes.DIM, }),
      Text({ content: 'f - Find workspaces', fg: 'muted', attributes: TextAttributes.DIM }),
      Text({ content: 's/m - Focus sidebar/main', fg: 'muted', attributes: TextAttributes.DIM }),
      Text({
        content: computed(() => {
          const error = errorSignal();
          return error ? `⚠ ${error}` : '';
        }),
        fg: 'error',
        attributes: TextAttributes.BOLD,
      }),
    ),
  );

  return sidebarBox;
}