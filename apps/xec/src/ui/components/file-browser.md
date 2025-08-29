┌─────────────────────────────────┐
│  /some/dir                     │ <--- can be edited (text or input component)
├─────────────────────────────────┤
│ 🔍 (/) search files...          │ <--- input componnet for filtering file in current dir
│ ▶  dir1                        │ <--- select component
│    dir2                        │
│    dir3                        │
│    .gitignore                  │
│    file1.md                    │
│    document.txt                │
│    source.ts                   │
│    another-source.ts           │
│    manager.ts                  │
│    config.json                 │
│    resources.json              │
└─────────────────────────────────┘


Нужно создать реактивный компонент файлового браузера в `apps/xec/src/ui/components/file-browser.ts` с одним столбцом (скетч в файле `apps/xec/src/ui/components/file-browser.md`). Пример кода можешь посмотреть в `apps/xec/src/ui/sidebar/sidebar.ts` и возможности в `packages/aura/src/app` и в `packages/aura/src/components`. 