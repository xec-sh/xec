import { store, signal, WritableSignal, type BoxComponent, type SelectComponent } from "@xec-sh/aura";

export type Workspace = {
  path: string,
  visible: boolean,
}

export type AppStore = {
  sidebarComponent: WritableSignal<BoxComponent | null>,
  sidebarSelectComponent: WritableSignal<SelectComponent | null>,
  mainComponent: WritableSignal<any | null>,
  workspace: Workspace | null,
  currentWorkspace: WritableSignal<string | undefined>, // ID of the currently selected workspace
  // Track current focus group for UI feedback
  focusedGroup: WritableSignal<string | null>,
}

export const appStore: ReturnType<typeof store<AppStore>> = store<AppStore>({
  sidebarComponent: signal<BoxComponent | null>(null),
  sidebarSelectComponent: signal<SelectComponent | null>(null),
  mainComponent: signal<any | null>(null),
  workspace: null,
  currentWorkspace: signal<string | undefined>(undefined),
  focusedGroup: signal<string | null>(null),
});

// Computed property to track which component is focused
// export const currentFocus = computed(() => {
//   const current = hierarchicalFocusManager..currentFocus();
//   return current?.id ?? null;
// });

// Helper to check if a specific component or group is focused
// export function isFocused(componentOrGroupId: string): boolean {
//   const current = focusManager.currentFocus();
//   // Check if it's the component ID
//   if (current?.id === componentOrGroupId) return true;

//   // Check if it's in the focused group
//   const focusedGroup = appStore.focusedGroup();
//   return focusedGroup === componentOrGroupId;
// }

// Legacy compatibility - computed property for old 'focused' field
// export const focused = computed(() => {
//   const group = appStore.focusedGroup();
//   if (group === 'sidebar') return 'sidebar' as const;
//   if (group === 'workspace') return 'workspace' as const;
//   return 'none' as const;
// });