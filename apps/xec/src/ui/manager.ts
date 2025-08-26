import { aura, auraApp, TextAttributes, screenDimensions } from "@xec-sh/aura";

import { UI_BORDER_COLOR } from "./consts.js";
import { SidebarComponent } from "./sidebar/index.js";

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
        flexDirection: 'column',
        children: [
          aura('group', {
            width: '100%',
            height: 'auto',
            flexGrow: 1,
            flexShrink: 1,
            flexDirection: 'row',
            children: [
              SidebarComponent(),
              aura('text', {
                content: 'Hello, Aura Next!',
                fg: 'green',
                attributes: TextAttributes.BOLD
              }),
              aura('text', {
                content: 'Hello, Aura Next!',
                fg: 'green',
                attributes: TextAttributes.BOLD
              })
            ]
          }),
          aura('group', {
            width: '100%',
            height: 12,
            flexDirection: 'row',
            children: [
              aura('box', {
                width: 'auto',
                height: '100%',
                borderStyle: 'rounded',
                flexGrow: 1,
                flexShrink: 1,
                flexDirection: 'column',
                border: true,
                borderColor: UI_BORDER_COLOR,
              }),
              aura('box', {
                width: 'auto',
                height: '100%',
                borderStyle: 'rounded',
                flexGrow: 1,
                flexShrink: 1,
                flexDirection: 'column',
                border: true,
                borderColor: UI_BORDER_COLOR,
              }),
              aura('box', {
                width: 'auto',
                height: '100%',
                borderStyle: 'rounded',
                flexGrow: 1,
                flexShrink: 1,
                flexDirection: 'column',
                border: true,
                borderColor: UI_BORDER_COLOR,
              })
            ]
          }),
        ],
      })
    ];
  }, {
    renderer: {
      useAlternateScreen: true,
    }
  });

  return app;
}
