import { store } from "@xec-sh/aura";

export type Focused = 'none' | 'sidebar' | 'workspace';

export type Workspace = {
  path: string,
  visible: boolean,
}

export type AppStore = {
  focused: Focused,
  sidebarVisible: boolean,
  workspace: Workspace | null,
  currentWorkspace?: string, // ID of the currently selected workspace
}

export const appStore: ReturnType<typeof store<AppStore>> = store<AppStore>({
  focused: 'none',
  sidebarVisible: true,
  workspace: null,
  currentWorkspace: undefined,
});