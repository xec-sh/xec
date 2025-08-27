import { aura, effect, signal, computed, TextAttributes, WritableSignal, SelectComponent, type BoxComponent } from "@xec-sh/aura";

import { appStore } from "../store.js";
import { UI_TITLE_COLOR, UI_BORDER_COLOR, UI_TITLE_ACTIVE_COLOR, UI_BORDER_ACTIVE_COLOR } from "../consts.js";


function ProjectBrowser(selectRef: WritableSignal<SelectComponent | null>) {
  return aura('select', {
    width: 'auto',
    height: 'auto',
    // zIndex: 120,
    wrapSelection: true,
    showDescription: true,
    ref: selectRef,
    options: [
      {
        name: 'xec',
        description: '/Users/taaliman/projects/xec-sh/xec',
        value: 'xec',
      },
      {
        name: 'vibrancy',
        description: '/Users/taaliman/projects/luxquant/vibrancy',
        value: 'vibrancy',
      },
    ]
  });
  // aura('text', {
  //   content: 'Workspaces',
  //   fg: UI_TITLE_ACTIVE_COLOR,
  //   attributes: TextAttributes.BOLD
  // }),
  //   ]
  // });
}

export function SidebarComponent() {
  // const keyHandler = (event: ParsedKey) => {
  //   if (event.key === 'q') {
  //     console.log('q');
  //   }
  // }

  const boxMainRef = signal<BoxComponent | null>(null);
  const boxTitleRef = signal<BoxComponent | null>(null);
  const selectRef = signal<SelectComponent | null>(null);

  effect(() => {
    const boxMain = boxMainRef();
    if (boxMain) {
      boxMain.visible = appStore.sidebarVisible;
    }
    if (appStore.focused === 'sidebar') {
      boxMain?.focus();
      boxTitleRef()?.focus();
      selectRef()?.focus();
    } else {
      boxMain?.blur();
      boxTitleRef()?.blur();
      selectRef()?.blur();
    }
  });



  return aura("box", {
    minWidth: 20,
    flexDirection: 'column',
    height: "100%",
    border: ['right'],
    borderStyle: "single",
    borderColor: UI_BORDER_COLOR,
    focusedBorderColor: UI_BORDER_ACTIVE_COLOR,
    ref: boxMainRef,
    children: [
      aura('box', {
        width: 'auto', // ширина будет зависеть от содержимого
        height: 1,
        alignItems: 'center',
        // border: ['bottom'],
        // borderStyle: "single",
        // borderColor: UI_BORDER_COLOR,
        // focusedBorderColor: UI_BORDER_ACTIVE_COLOR,
        ref: boxTitleRef, // Pass the ref signal
        children: [
          aura('text', {
            content: '❯ XEC',
            fg: computed(() => appStore.focused === 'sidebar' ? UI_TITLE_ACTIVE_COLOR : UI_TITLE_COLOR),
            selectable: false,
            attributes: TextAttributes.BOLD | TextAttributes.DIM
          }),
        ]
      }),
      ProjectBrowser(selectRef),
      // ProjectBrowser(),
    ]
  })
}