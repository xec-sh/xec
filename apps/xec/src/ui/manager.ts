import { RGBA, HStack, Center, signal, auraApp, ParsedKey, ASCIIFont, FocusLevel, Functional, hierarchicalFocusManager, effect } from "@xec-sh/aura";

import { appStore } from "./store.js";
import { SidebarComponent } from "./sidebar/index.js";
import { WorkspaceComponent } from "./workspace/workspace.js";
// import { WorkspaceComponent } from "./workspace/workspace.js";
import darkTheme, { UI_PRIMARY_COLOR, UI_TITLE_ACTIVE_COLOR } from "./theme.js";

// Test reactivity
effect(() => {
  console.log('[TOP LEVEL EFFECT] currentWorkspace changed to:', appStore.currentWorkspace());
});

function MainSection() {
  // Wrap the component in Functional to make it reactive
  return Functional(() => {
    const mainRef = signal<any>(null);

    const currentWorkspaceId = appStore.currentWorkspace();
    console.log('MainSection render, currentWorkspace:', currentWorkspaceId);

    // Show workspace if a workspace is selected
    // Now this will react to changes in currentWorkspace signal
    if (currentWorkspaceId) {
      console.log('Rendering WorkspaceComponent for workspace:', currentWorkspaceId);
      return WorkspaceComponent();
    }

    // Show welcome screen when no workspace is selected
    return Center({
      id: 'main-section',
      border: true,
      width: '100%',
      height: '100%',
      flexGrow: 1,
      flexShrink: 1,
      ref: mainRef,
      onMount: () => {
        const comp = mainRef();
        if (comp) {
          appStore.mainComponent.set(comp);
          // Register main section as a focusable container
          hierarchicalFocusManager.register(comp, {
            scopeId: "main-scope",
            level: FocusLevel.CONTAINER,
            order: 0,
            autoFocus: false
          });
        }
      },
    },
      ASCIIFont({
        font: "future",
        text: "WELCOME TO",
        fg: RGBA.fromHex(UI_TITLE_ACTIVE_COLOR),
        zIndex: 20,
      }),
      ASCIIFont({
        font: "matrix",
        text: "XEC",
        fg: [RGBA.fromHex(UI_PRIMARY_COLOR), RGBA.fromHex(UI_TITLE_ACTIVE_COLOR)],
        zIndex: 20,
      }),
    );
  });
}

// Helper functions to focus panels
function focusSidebarPanel() {
  // hierarchicalFocusManager.enterScope("sidebar-scope");
  // First, focus the sidebar container
  const sidebarBox = appStore.sidebarComponent();
  if (sidebarBox) {
    hierarchicalFocusManager.focus(sidebarBox, FocusLevel.CONTAINER);

    // Then focus the select component inside
    const selectComponent = appStore.sidebarSelectComponent();
    if (selectComponent) {
      // Use a small delay to ensure proper focus sequencing
      setTimeout(() => {
        hierarchicalFocusManager.focus(selectComponent, FocusLevel.COMPONENT);
      }, 0);
    }
  }
}

function focusMainPanel() {
  const mainComponent = appStore.mainComponent();
  if (mainComponent) {
    hierarchicalFocusManager.focus(mainComponent, FocusLevel.CONTAINER);
  }
}

export async function runManager() {
  // Register focus scopes for the two main panels
  hierarchicalFocusManager.registerScope({
    id: "sidebar-scope",
    level: FocusLevel.CONTAINER,
    // Allow container and child to be focused
    circular: true
  });

  hierarchicalFocusManager.registerScope({
    id: "main-scope",
    level: FocusLevel.CONTAINER,
    circular: true
  });

  // Create a simple app with text components
  const app = await auraApp(() =>
    HStack({ width: '100%', height: '100%', flexGrow: 1, flexShrink: 1, },
      SidebarComponent(),
      MainSection(),
    ),
    {
      theme: darkTheme,
      onKeyPress(key: ParsedKey) {
        // // Handle Tab navigation through focus manager
        // if (key.name === 'tab' && !key.shift && !key.ctrl) {
        //   hierarchicalFocusManager.navigate('next');
        //   return;
        // }
        // if (key.name === 'tab' && key.shift) {
        //   hierarchicalFocusManager.navigate('previous');
        //   return;
        // }

        // Toggle sidebar visibility (Shift+S)
        if (key.shift && key.name === 's') {
          const sidebar = appStore.sidebarComponent();
          if (sidebar) {
            sidebar.visible = !sidebar.visible;
          }
          return;
        }

        // Direct focus to main panel (m key)
        if (key.name === 'm' && !key.shift && !key.ctrl) {
          focusMainPanel();
          return;
        }

        // Direct focus to sidebar panel (s key)
        if (key.name === 's' && !key.shift && !key.ctrl) {
          focusSidebarPanel();
          return;
        }

        // Toggle console
        if (key.name === '`') {
          app.renderer.console.toggle();
          return;
        }

        // Escape to exit current scope
        if (key.name === 'escape') {
          hierarchicalFocusManager.exitScope();
          return;
        }
      },
      renderer: {
        useAlternateScreen: true,
      },
      onCleanup: () => {
        // Reset focus manager on cleanup
        hierarchicalFocusManager.reset();
      }
    }
  );

  // // Focus sidebar by default on startup
  // setTimeout(() => {
  //   focusSidebarPanel();
  // }, 100);

  return app;
}