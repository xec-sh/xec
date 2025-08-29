import { aura, effect, signal, computed, ParsedKey, WritableSignal, SelectComponent, type BoxComponent, DescriptionTruncate } from "@xec-sh/aura";

import { appStore } from "../store.js";


function ProjectBrowser(selectRef: WritableSignal<SelectComponent | null>) {
  return aura('select', {
    showScrollIndicator: true,
    minHeight: 2,
    wrapSelection: true,
    showDescription: true,
    descriptionTruncate: DescriptionTruncate.START,
    ref: selectRef,
    onKeyDown(key: ParsedKey) {
      if (key.name === 'n') {

      }
    },
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
      {
        name: 'xec1',
        description: '/Users/taaliman/projects/xec-sh/xec',
        value: 'xec1',
      },
      {
        name: 'vibrancy1',
        description: '/Users/taaliman/projects/luxquant/vibrancy',
        value: 'vibrancy1',
      },
      {
        name: 'tui-tester1',
        description: '/Users/taaliman/projects/tui-tester',
        value: 'tui-tester1',
      },
      {
        name: 'xec2',
        description: '/Users/taaliman/projects/xec-sh/xec',
        value: 'xec2',
      },
      {
        name: 'vibrancy2',
        description: '/Users/taaliman/projects/luxquant/vibrancy',
        value: 'vibrancy2',
      },
      {
        name: 'tui-tester2',
        description: '/Users/taaliman/projects/tui-tester',
        value: 'tui-tester2',
      },
      {
        name: 'xec3',
        description: '/Users/taaliman/projects/xec-sh/xec',
        value: 'xec3',
      },
      {
        name: 'vibrancy3',
        description: '/Users/taaliman/projects/luxquant/vibrancy',
        value: 'vibrancy3',
      },
      {
        name: 'tui-tester3',
        description: '/Users/taaliman/projects/tui-tester',
        value: 'tui-tester3',
      },
      {
        name: 'xec4',
        description: '/Users/taaliman/projects/xec-sh/xec',
        value: 'xec4',
      },
      {
        name: 'vibrancy4',
        description: '/Users/taaliman/projects/luxquant/vibrancy',
        value: 'vibrancy4',
      },
      {
        name: 'tui-tester4',
        description: '/Users/taaliman/projects/tui-tester',
        value: 'tui-tester4',
      },
      {
        name: 'xec5',
        description: '/Users/taaliman/projects/xec-sh/xec',
        value: 'xec5',
      },
      {
        name: 'vibrancy5',
        description: '/Users/taaliman/projects/luxquant/vibrancy',
        value: 'vibrancy5',
      },
      {
        name: 'tui-tester5',
        description: '/Users/taaliman/projects/tui-tester',
        value: 'tui-tester5',
      },
    ]
  });
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
    id: 'sidebar',
    minWidth: 20,
    flexDirection: 'column',
    height: "100%",
    flexShrink: 0,
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
        height: 2,
        alignItems: 'center',
        border: ['bottom'],
        ref: boxTitleRef, // Pass the ref signal
        children: [
          aura('text', {
            content: '❯ XEC',
            fg: computed(() => appStore.focused === 'sidebar' ? 'accent' : 'secondary'),
            selectable: false,
          }),
        ]
      }),
      ProjectBrowser(selectRef),
      // ProjectBrowser(),
    ]
  })
}