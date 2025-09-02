import {
  Box,
  Text,
  effect,
  signal,
  Select,
  VStack,
  computed,
  onCleanup,
  ParsedKey,
  WritableSignal,
  TextAttributes,
  SelectComponent,
  screenDimensions,
  type BoxComponent,
  DescriptionTruncate
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
      appStore.currentWorkspace = activeWorkspace.id;
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

function ProjectBrowser(selectRef: WritableSignal<SelectComponent | null>) {
  // Convert workspaces to select options
  const options = computed(() => {
    const workspaces = workspacesSignal();
    const loading = loadingSignal();
    const error = errorSignal();

    if (loading) {
      return [{
        name: 'Loading...',
        description: 'Please wait while workspaces are loaded',
        value: '__loading__',
      }];
    }

    if (error) {
      return [{
        name: 'Error',
        description: error,
        value: '__error__',
      }];
    }

    if (workspaces.length === 0) {
      return [{
        name: 'No workspaces',
        description: 'Press "n" to add a new workspace',
        value: '__empty__',
      }];
    }

    return workspaces.map(workspace => ({
      name: workspace.name,
      description: workspace.path,
      value: workspace.id,
    }));
  });

  return Select({
    showScrollIndicator: true,
    minHeight: 2,
    wrapSelection: true,
    showDescription: true,
    descriptionTruncate: DescriptionTruncate.START,
    ref: selectRef,
    options: options(),
    onKeyDown: async (key: ParsedKey) => {
      const workspaceManager = getWorkspaceManager();

      // Add new workspace
      if (key.name === 'n' && !key.ctrl) {
        try {
          // For now, add current directory as workspace
          // In production, you might want to show a file picker dialog
          const currentPath = process.cwd();
          const workspace = await workspaceManager.add(currentPath);

          // Reload workspaces
          const workspaces = await workspaceManager.getAll();
          workspacesSignal.set(workspaces);

          // Select the newly added workspace
          const select = selectRef();
          if (select) {
            const index = workspaces.findIndex(w => w.id === workspace.id);
            if (index !== -1) {
              select.setSelectedIndex(index);
            }
          }
        } catch (error: any) {
          errorSignal.set(error.message);
          setTimeout(() => errorSignal.set(null), 3000);
        }
      }

      // Remove selected workspace
      if (key.name === 'd' && !key.ctrl) {
        const select = selectRef();
        const selectedOption = select?.getSelectedOption();
        if (select && selectedOption?.value && !selectedOption.value.startsWith('__')) {
          try {
            const workspaceId = selectedOption.value as string;
            await workspaceManager.remove(workspaceId);

            // Reload workspaces
            const workspaces = await workspaceManager.getAll();
            workspacesSignal.set(workspaces);

            // Adjust selection
            if (select.getSelectedIndex() >= workspaces.length && workspaces.length > 0) {
              select.setSelectedIndex(workspaces.length - 1);
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
  const { width: screenWidth } = screenDimensions();
  const minWidth = signal(20);
  const maxWidth = computed(() => screenWidth() / 2);

  const boxMainRef = signal<BoxComponent | null>(null);
  const selectRef = signal<SelectComponent | null>(null);

  effect(() => {
    const boxMain = boxMainRef();
    if (boxMain) {
      boxMain.visible = appStore.sidebarVisible;
    }
    if (appStore.focused === 'sidebar') {
      boxMain?.focus();
      selectRef()?.focus();
    } else {
      boxMain?.blur();
      selectRef()?.blur();
    }
  });

  // Update selection when active workspace changes
  effect(() => {
    const workspaceId = appStore.currentWorkspace;
    const select = selectRef();
    const workspaces = workspacesSignal();

    if (select && workspaceId && workspaces.length > 0) {
      const index = workspaces.findIndex(w => w.id === workspaceId);
      if (index !== -1 && select.getSelectedIndex() !== index) {
        select.setSelectedIndex(index);
      }
    }
  });

  // Listen to selection changes
  effect(() => {
    const select = selectRef();
    if (select) {
      // Handle item selection
      const handleSelection = async (index: number, option: any) => {
        if (option?.value && typeof option.value === 'string' && !option.value.startsWith('__')) {
          const workspaceManager = getWorkspaceManager();
          await workspaceManager.setActive(option.value);
          appStore.currentWorkspace = option.value;
        }
      };

      select.on('itemSelected', handleSelection);

      // Cleanup listener
      onCleanup(() => {
        select.off('itemSelected', handleSelection);
      });
    }
  });

  return VStack({
    id: 'sidebar',
    minWidth,
    maxWidth,
    gap: 1,
    filledGaps: true,
    height: "100%",
    flexShrink: 0,
    border: true,
    borderColor: computed(() => appStore.focused === 'sidebar' ? 'focus' : 'border'),
    ref: boxMainRef,
    onKeyDown(key: ParsedKey) {
      const inst = boxMainRef();
      if (inst) {
        console.log(key);
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
      paddingLeft: 1,
    },
      Text({
        content: computed(() => appStore.focused === 'sidebar' ? '⦿ ' : '○ '),
        fg: computed(() => appStore.focused === 'sidebar' ? 'accent' : 'muted'),
        attributes: TextAttributes.BOLD,
      }),
      Text({
        content: 'Workspaces',
        fg: computed(() => appStore.focused === 'sidebar' ? 'secondary' : 'muted'),
        attributes: TextAttributes.BOLD,
      }),
    ),
    ProjectBrowser(selectRef),
    Box({
      id: 'sidebar-help',
      height: 'auto',
      paddingLeft: 1,
      paddingRight: 1,
      gap: 0,
      flexDirection: 'column',
    },
      Text({
        content: '─────────────',
        fg: 'muted',
        attributes: TextAttributes.DIM,
      }),
      Text({
        content: 'Keys:',
        fg: 'muted',
        attributes: TextAttributes.BOLD,
      }),
      Text({
        content: 'n - Add workspace',
        fg: 'muted',
        attributes: TextAttributes.DIM,
      }),
      Text({
        content: 'd - Remove workspace',
        fg: 'muted',
        attributes: TextAttributes.DIM,
      }),
      Text({
        content: 'r - Refresh list',
        fg: 'muted',
        attributes: TextAttributes.DIM,
      }),
      Text({
        content: 'f - Find workspaces',
        fg: 'muted',
        attributes: TextAttributes.DIM,
      }),
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
}