import { aura, RGBA, auraApp, ParsedKey, screenDimensions } from "@xec-sh/aura";

import { appStore } from "./store.js";
import { SidebarComponent } from "./sidebar/index.js";
import { WorkspaceComponent } from "./workspace/workspace.js";
import darkTheme, { UI_PRIMARY_COLOR, UI_TITLE_ACTIVE_COLOR } from "./theme.js";

function MainSection() {
  if (appStore.workspace) {
    return WorkspaceComponent();
  }
  return aura('box', {
    width: '100%',
    height: '100%',
    flexGrow: 1,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    children: [
      aura('ascii-font', {
        font: "future",
        text: "WELCOME TO",
        fg: RGBA.fromHex(UI_TITLE_ACTIVE_COLOR),  // ASCII font needs RGBA
        zIndex: 20,
      }),
      aura('ascii-font', {
        font: "matrix",
        text: "XEC",
        fg: [RGBA.fromHex(UI_PRIMARY_COLOR), RGBA.fromHex(UI_TITLE_ACTIVE_COLOR)],  // ASCII font needs RGBA array
        zIndex: 20,
      }),
    ],
  });
}

export async function runManager() {
  // Create a simple app with text components
  const app = await auraApp(() => {
    const { width, height } = screenDimensions();

    return [
      aura('group', {
        width,
        height,
        flexGrow: 1,
        flexShrink: 1,
        flexDirection: 'row',
        children: [
          SidebarComponent(),
          MainSection(),
        ],
      })
    ];
  }, {
    theme: darkTheme,  // Apply the theme
    onKeyPress(key: ParsedKey) {
      if (key.shift && key.name === 's') {
        appStore.sidebarVisible = !appStore.sidebarVisible;
      } else if (key.name === 'w') {
        appStore.focused = 'workspace';
      } else if (key.name === 's') {
        appStore.focused = 'sidebar';
      } else if (key.name === '`') {
        app.renderer.console.toggle();
      }
    },
    renderer: {
      useAlternateScreen: true,
    }
  });

  return app;
}
