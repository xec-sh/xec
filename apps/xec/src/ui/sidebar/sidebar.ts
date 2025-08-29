import { aura, effect, signal, computed, ParsedKey, WritableSignal, SelectComponent, type BoxComponent, DescriptionTruncate } from "@xec-sh/aura";

import { appStore } from "../store.js";


function ProjectBrowser(selectRef: WritableSignal<SelectComponent | null>) {
  return aura('select', {
    width: 'auto',
    height: 'auto',
    // zIndex: 120,
    wrapSelection: true,
    showDescription: true,
    descriptionTruncate: DescriptionTruncate.START,
    // textColor: 'secondary',          // Use legacy props for now
    // focusedTextColor: 'accent',
    // selectedTextColor: 'primary',
    // descriptionColor: RGBA.fromHex("#546e7a").withAlpha(0.5),
    // selectedDescriptionColor: RGBA.fromHex("#546e7a"),
    // focusedBackgroundColor: 'transparent',
    // selectedBackgroundColor: RGBA.fromHex("#546e7a").withAlpha(0.4),
    // selectedDescriptionColor: UI_TITLE_ACTIVE_COLOR,
    // descriptionColor: UI_TITLE_COLOR,
    ref: selectRef,
    // indicator: '▶ ',
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
      {
        name: 'tui-tester',
        description: '/Users/taaliman/projects/tui-tester',
        value: 'tui-tester',
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
    borderColor: computed(() => appStore.focused === 'sidebar' ? 'focus' : 'border'),
    ref: boxMainRef,
    onKeyDown(key: ParsedKey) {
      const inst = boxMainRef();
      if (inst) {
        if (key.shift && key.name === 'right') {
          inst.width = inst.width + 1;
        } else if (key.shift && key.name === 'left') {
          inst.width = inst.width - 1;
        }
      }
    },
    children: [
      aura('box', {
        width: 'auto',
        height: 2,
        alignItems: 'center',
        border: ['bottom'],
        borderStyle: "single",
        borderColor: computed(() => appStore.focused === 'sidebar' ? 'focus' : 'border'),
        ref: boxTitleRef, // Pass the ref signal
        children: [
          aura('text', {
            content: '❯ XEC',
            // fg: 'accent',  // Use theme's accent color (purple.300)
            selectable: false,
          }),
        ]
      }),
      ProjectBrowser(selectRef),
      // ProjectBrowser(),
    ]
  })
}