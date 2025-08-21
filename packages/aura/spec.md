# **Aura Next: Спецификация Реактивного TUI-Фреймворка**

## **Содержание**
1. [Философия и Принципы](#философия-и-принципы)
2. [Архитектура Системы](#архитектура-системы)
3. [Реактивная Система](#реактивная-система)
4. [Компонентная Модель](#компонентная-модель)
5. [Система Рендеринга](#система-рендеринга)
6. [API Дизайн](#api-дизайн)
7. [План Реализации](#план-реализации)
8. [Примеры Использования](#примеры-использования)

---

## **Философия и Принципы**

### **1.1 Видение**

Aura Next представляет собой современный, полностью реактивный фреймворк для создания терминальных интерфейсов, объединяющий:
- **Философию цифровой субстанции** из оригинального Aura
- **Fine-grained реактивность** из NeoFlux 
- **Нативную производительность** из Aura-Next с Rust/Zig рендерингом
- **Чистый функциональный API** без JSX и транспиляции

### **1.2 Ключевые Принципы**

#### **1.2.1 Единая Реактивная Модель**
```typescript
// Всё является реактивным - от данных до UI
const count = signal(0);
const doubled = computed(() => count() * 2);

// Компоненты создаются через функцию aura с полным type inference
const box = aura('box', {
  title: computed(() => `Count: ${count()}`),
  backgroundColor: computed(() => 
    count() > 10 ? [1, 0, 0, 0.5] : [0, 1, 0, 0.5]
  )
});
```

#### **1.2.2 Нативный TypeScript API**
```typescript
// Полный type inference без дополнительных аннотаций
const app = aura('flex', {
  direction: 'column',
  gap: 2,
  children: [
    aura('text', { 
      value: computed(() => `Hello, ${userName()}`),
      color: 'cyan'
    }),
    aura('input', { 
      value: userName,
      placeholder: 'Enter name',
      onSubmit: (value) => userName.set(value)
    })
  ]
});
```

#### **1.2.3 Композиция через Функции**
```typescript
// Компоненты - это просто функции, возвращающие Aura элементы
const FormField = <T extends string | number>(props: {
  label: string;
  value: WritableSignal<T>;
  error?: Signal<string | undefined>;
}) => aura('box', {
  marginBottom: 1,
  children: [
    aura('text', { value: props.label, bold: true }),
    aura('input', { value: props.value }),
    props.error && aura('text', { 
      value: props.error,
      color: 'red'
    })
  ].filter(Boolean)
});
```

#### **1.2.4 Нулевая Стоимость Абстракций**
- Реактивность без Virtual DOM
- Прямая манипуляция буфером через Rust/Zig
- Lazy evaluation везде где возможно
- Tree-shaking для неиспользуемых компонентов
- Никаких runtime зависимостей от JSX

---

## **Архитектура Системы**

### **2.1 Слоистая Архитектура**

```
┌─────────────────────────────────────────────┐
│           Application Layer                  │
│  (User Components & Business Logic)          │
├─────────────────────────────────────────────┤
│           Framework Layer                    │
│  ┌─────────────────────────────────────┐   │
│  │   Component Factory  │   NeoFlux     │   │
│  │   (aura function)    │   Reactivity  │   │
│  └─────────────────────────────────────┘   │
├─────────────────────────────────────────────┤
│           Rendering Layer                    │
│  ┌─────────────────────────────────────┐   │
│  │  Yoga Layout   │  Fine-grained       │   │
│  │  Engine        │  Diff Algorithm     │   │
│  └─────────────────────────────────────┘   │
├─────────────────────────────────────────────┤
│           Platform Layer                     │
│  ┌─────────────────────────────────────┐   │
│  │  Native Renderer  │  Terminal API    │   │
│  │  (Rust/Zig)       │  (ANSI/CSI)      │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### **2.2 Модульная Структура**

```typescript
// Основные модули
@aura-next/core         // Ядро фреймворка и фабрика компонентов
@aura-next/neoflux      // Реактивная система
@aura-next/components   // Библиотека базовых компонентов
@aura-next/renderer     // Система рендеринга
@aura-next/devtools     // Инструменты разработки
@aura-next/testing      // Утилиты для тестирования
```

---

## **Реактивная Система**

### **3.1 Основные Примитивы NeoFlux**

#### **3.1.1 Signal - Источник Реактивности**
```typescript
// Type-safe сигналы с автоматическим выводом типов
const count = signal(0);                    // Signal<number>
const name = signal('John');                // Signal<string>
const user = signal({ id: 1, name: 'Alice' }); // Signal<User>

// Использование
count();        // Getter: number
count.set(10);  // Setter
count.update(n => n + 1); // Updater
```

#### **3.1.2 Computed - Производные Значения**
```typescript
// Автоматическое отслеживание зависимостей
const fullName = computed(() => 
  `${firstName()} ${lastName()}`
);

// Ленивое вычисление с мемоизацией
const expensive = computed(() => {
  console.log('Computing...');
  return data().reduce((acc, item) => acc + item.value, 0);
});
```

#### **3.1.3 Effect - Побочные Эффекты**
```typescript
// Автоматически запускается при изменении зависимостей
const cleanup = effect(() => {
  console.log('Count:', count());
  
  // Опциональная cleanup функция
  return () => console.log('Cleaning up');
});

// Интеграция с lifecycle компонентов
onMount(() => {
  const handle = setInterval(() => count.update(n => n + 1), 1000);
  return () => clearInterval(handle);
});
```

#### **3.1.4 Store - Глубокая Реактивность**
```typescript
const state = store({
  user: { name: 'John', age: 30 },
  settings: { theme: 'dark', fontSize: 14 }
});

// Прямая мутация с автоматическим отслеживанием
state.user.name = 'Jane';
state.settings.fontSize++;

// Или через setter функции
setState('user', 'name', 'Bob');
setState('settings', produce(s => { s.theme = 'light' }));
```

### **3.2 Интеграция с Компонентами**

```typescript
// Реактивные props автоматически отслеживаются
const Counter = () => {
  const count = signal(0);
  
  return aura('box', {
    border: 'single',
    padding: 1,
    children: [
      aura('text', { 
        value: computed(() => `Count: ${count()}`)
      }),
      aura('button', {
        label: 'Increment',
        onClick: () => count.update(n => n + 1)
      })
    ]
  });
};
```

---

## **Компонентная Модель**

### **4.1 Фабрика Компонентов**

```typescript
// Главная функция создания компонентов с полным type inference
function aura<T extends ComponentType>(
  type: T,
  props: ComponentProps<T>
): AuraElement<T>;

// Типы компонентов
type ComponentType = 
  | 'box' | 'text' | 'input' | 'button' | 'select'
  | 'flex' | 'grid' | 'stack' | 'dock' | 'wrap'
  | 'list' | 'table' | 'tree' | 'tabs'
  | 'chart' | 'sparkline' | 'gauge' | 'progress';

// Автоматический вывод типов props для каждого компонента
type ComponentProps<T> = T extends 'box' ? BoxProps :
                         T extends 'text' ? TextProps :
                         T extends 'input' ? InputProps :
                         // ... и так далее
```

### **4.2 Базовые Компоненты**

#### **4.2.1 Box - Контейнер**
```typescript
interface BoxProps extends LayoutProps {
  backgroundColor?: ColorValue | Signal<ColorValue>;
  border?: BorderStyle | Signal<BorderStyle>;
  borderColor?: ColorValue | Signal<ColorValue>;
  title?: string | Signal<string>;
  titleAlignment?: 'left' | 'center' | 'right';
  children?: AuraElement[];
  // Реактивные стили
  style?: Signal<Partial<BoxStyle>>;
  // Lifecycle hooks
  onMount?: () => void | (() => void);
  onCleanup?: () => void;
}

// Использование
const box = aura('box', {
  backgroundColor: [0.1, 0.1, 0.2, 0.8],
  border: 'rounded',
  title: computed(() => `Active: ${isActive()}`),
  children: [/* ... */]
});
```

#### **4.2.2 Text - Текстовый компонент**
```typescript
interface TextProps {
  value: string | Signal<string>;
  color?: ColorValue | Signal<ColorValue>;
  backgroundColor?: ColorValue | Signal<ColorValue>;
  bold?: boolean | Signal<boolean>;
  italic?: boolean | Signal<boolean>;
  underline?: boolean | Signal<boolean>;
  wrap?: 'word' | 'char' | 'none';
  align?: 'left' | 'center' | 'right';
  // Расширенные возможности
  markdown?: boolean;
  syntax?: LanguageSupport;
}

// Примеры
const label = aura('text', { 
  value: 'Hello World',
  color: 'cyan',
  bold: true
});

const markdown = aura('text', {
  value: computed(() => generateMarkdown(data())),
  markdown: true
});
```

#### **4.2.3 Input - Поле ввода**
```typescript
interface InputProps {
  value: WritableSignal<string>;
  type?: 'text' | 'password' | 'number' | 'email' | 'url';
  placeholder?: string | Signal<string>;
  multiline?: boolean | { minRows?: number; maxRows?: number };
  validate?: (value: string) => ValidationResult;
  mask?: string | RegExp;
  suggestions?: string[] | ((input: string) => Promise<string[]>);
  // События
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

// Использование с валидацией
const email = signal('');
const emailInput = aura('input', {
  value: email,
  type: 'email',
  placeholder: 'your@email.com',
  validate: (v) => ({
    valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    message: 'Invalid email format'
  })
});
```

### **4.3 Layout Компоненты**

#### **4.3.1 Flex - Flexbox контейнер**
```typescript
interface FlexProps extends BoxProps {
  direction?: 'row' | 'column' | Signal<'row' | 'column'>;
  gap?: number | Signal<number>;
  justifyContent?: JustifyContent | Signal<JustifyContent>;
  alignItems?: AlignItems | Signal<AlignItems>;
  wrap?: boolean | Signal<boolean>;
}

const layout = aura('flex', {
  direction: 'column',
  gap: 2,
  justifyContent: 'space-between',
  children: [/* ... */]
});
```

#### **4.3.2 Grid - Сетка**
```typescript
interface GridProps extends BoxProps {
  columns?: number | string | Signal<number | string>;
  rows?: number | string | Signal<number | string>;
  gap?: number | [number, number] | Signal<number | [number, number]>;
  areas?: string[] | Signal<string[]>;
}

const dashboard = aura('grid', {
  columns: 'repeat(3, 1fr)',
  rows: 'auto 1fr auto',
  gap: 1,
  areas: [
    'header header header',
    'sidebar main main',
    'footer footer footer'
  ],
  children: [/* ... */]
});
```

### **4.4 Композиция Компонентов**

```typescript
// Функции высшего порядка для создания переиспользуемых компонентов
const Card = (props: {
  title: string | Signal<string>;
  children: AuraElement[];
}) => aura('box', {
  border: 'rounded',
  padding: 1,
  children: [
    aura('box', {
      borderBottom: 'single',
      marginBottom: 1,
      children: [
        aura('text', { 
          value: props.title,
          bold: true
        })
      ]
    }),
    ...props.children
  ]
});

// Использование
const userCard = Card({
  title: computed(() => `User: ${userName()}`),
  children: [
    aura('text', { value: userEmail }),
    aura('button', { label: 'Edit', onClick: editUser })
  ]
});
```

### **4.5 Продвинутые Компоненты**

#### **4.5.1 List - Виртуализированный список**
```typescript
interface ListProps<T> {
  items: T[] | Signal<T[]>;
  renderItem: (item: T, index: Signal<number>) => AuraElement;
  keyBy?: (item: T) => string | number;
  virtualize?: boolean | {
    itemHeight: number | ((item: T) => number);
    overscan?: number;
  };
  selectable?: boolean | {
    mode: 'single' | 'multi';
    selected: WritableSignal<Set<string | number>>;
  };
}

// Пример с виртуализацией
const list = aura('list', {
  items: computed(() => filteredItems()),
  renderItem: (item, index) => aura('box', {
    backgroundColor: computed(() => 
      selectedIds().has(item.id) ? [0, 0, 1, 0.3] : 'transparent'
    ),
    children: [
      aura('text', { value: `${index() + 1}. ${item.name}` })
    ]
  }),
  keyBy: item => item.id,
  virtualize: { itemHeight: 3, overscan: 5 }
});
```

#### **4.5.2 Table - Таблица данных**
```typescript
interface TableProps<T> {
  data: T[] | Signal<T[]>;
  columns: TableColumn<T>[];
  sortable?: boolean | {
    multi?: boolean;
    sortState: WritableSignal<SortState>;
  };
  filterable?: boolean | {
    filterState: WritableSignal<FilterState>;
  };
  selectable?: boolean | {
    mode: 'single' | 'multi' | 'checkbox';
    selection: WritableSignal<Set<string>>;
  };
  virtualize?: boolean;
  resizable?: boolean;
  reorderable?: boolean;
}

interface TableColumn<T> {
  key: keyof T | string;
  header: string | Signal<string>;
  width?: number | 'auto' | `${number}%`;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, row: T) => AuraElement | string;
  sortable?: boolean;
  filterable?: boolean;
}

// Использование
const dataTable = aura('table', {
  data: users,
  columns: [
    { key: 'id', header: 'ID', width: 60 },
    { key: 'name', header: 'Name', sortable: true },
    { 
      key: 'status',
      header: 'Status',
      render: (status) => aura('text', {
        value: status,
        color: status === 'active' ? 'green' : 'gray'
      })
    }
  ],
  sortable: { sortState },
  selectable: { mode: 'multi', selection: selectedUsers }
});
```

---

## **Система Рендеринга**

### **5.1 Архитектура Рендеринга**

```typescript
interface RenderPipeline {
  // 1. Сбор реактивных изменений
  collectReactiveUpdates(): ReactiveUpdate[];
  
  // 2. Применение изменений к компонентам
  applyUpdatesToComponents(updates: ReactiveUpdate[]): Component[];
  
  // 3. Вычисление Layout через Yoga
  computeLayout(root: Component): LayoutTree;
  
  // 4. Генерация минимальных изменений
  generateDiff(prev: LayoutTree, next: LayoutTree): RenderPatch[];
  
  // 5. Применение патчей к буферу
  applyPatches(patches: RenderPatch[], buffer: OptimizedBuffer): void;
  
  // 6. Вывод в терминал
  flushToTerminal(buffer: OptimizedBuffer): void;
}
```

### **5.2 Fine-grained Updates**

```typescript
// Только изменённые части перерисовываются
const backgroundColor = signal([0, 0, 0, 1]);

effect(() => {
  // Обновляется только цвет фона конкретной ячейки
  const color = backgroundColor();
  buffer.setCellBackground(x, y, color);
});

// Батчинг обновлений
batch(() => {
  user.name = 'Alice';
  user.status = 'active';
  user.lastSeen = Date.now();
}); // Один цикл рендеринга вместо трёх
```

### **5.3 Оптимизации**

#### **5.3.1 Incremental Rendering**
```typescript
// Приоритезация обновлений
const scheduler = new RenderScheduler({
  priorities: {
    userInput: Priority.IMMEDIATE,
    animation: Priority.HIGH,
    dataUpdate: Priority.NORMAL,
    background: Priority.LOW
  }
});
```

#### **5.3.2 Selective Re-rendering**
```typescript
// Компоненты обновляются только при изменении их зависимостей
const ExpensiveComponent = () => {
  // Перерендерится только когда изменится specificData
  const data = computed(() => processData(specificData()));
  
  return aura('box', {
    children: [
      aura('text', { value: data })
    ]
  });
};
```

---

## **API Дизайн**

### **6.1 Основной API**

```typescript
// Главная функция создания компонентов
function aura<T extends ComponentType>(
  type: T,
  props: ComponentProps<T>
): AuraElement<T>;

// Создание реактивных примитивов из NeoFlux
import { 
  signal, 
  computed, 
  effect, 
  store,
  batch,
  untrack,
  createRoot
} from '@aura-next/neoflux';

// Lifecycle hooks
import {
  onMount,
  onCleanup,
  onUpdate,
  onFocus,
  onBlur
} from '@aura-next/lifecycle';

// Утилиты
import {
  show,      // Условный рендеринг
  forEach,   // Итерация по массивам
  switch as switchCase,    // Switch/case для компонентов
  portal,    // Рендеринг вне иерархии
  lazy,      // Ленивая загрузка компонентов
  memo       // Мемоизация компонентов
} from '@aura-next/control-flow';
```

### **6.2 Условный Рендеринг**

```typescript
// Show - условное отображение
const conditionalBox = aura('box', {
  children: [
    show(isLoading, () => 
      aura('text', { value: 'Loading...' })
    ),
    show(error, () =>
      aura('text', { value: error, color: 'red' })
    ),
    show(data, () =>
      aura('list', { items: data, renderItem })
    )
  ]
});

// Switch - множественные условия
const statusIndicator = switchCase(status, {
  'loading': () => aura('spinner'),
  'error': () => aura('text', { value: 'Error!', color: 'red' }),
  'success': () => aura('text', { value: 'Done!', color: 'green' }),
  default: () => aura('text', { value: 'Unknown' })
});
```

### **6.3 Итерация**

```typescript
// forEach с автоматическим отслеживанием
const itemList = aura('box', {
  children: forEach(items, (item, index) =>
    aura('box', {
      key: item.id, // Важно для эффективного обновления
      children: [
        aura('text', { 
          value: computed(() => `${index() + 1}. ${item.name}`)
        })
      ]
    })
  )
});

// Или через map для статических списков
const staticList = aura('box', {
  children: items().map(item =>
    aura('text', { value: item.name })
  )
});
```

### **6.4 Композиции и Хуки**

```typescript
// Кастомные хуки для переиспользования логики
function useLocalStorage<T>(key: string, initial: T) {
  const stored = localStorage.getItem(key);
  const value = signal<T>(stored ? JSON.parse(stored) : initial);
  
  effect(() => {
    localStorage.setItem(key, JSON.stringify(value()));
  });
  
  return value;
}

// Использование в компоненте
const Settings = () => {
  const theme = useLocalStorage('theme', 'dark');
  const fontSize = useLocalStorage('fontSize', 14);
  
  return aura('box', {
    children: [
      aura('select', {
        value: theme,
        options: ['light', 'dark', 'auto']
      }),
      aura('input', {
        value: fontSize,
        type: 'number',
        min: 10,
        max: 20
      })
    ]
  });
};
```

### **6.5 Стилизация**

```typescript
// Реактивные стили через signals
const focused = signal(false);
const hovered = signal(false);

const button = aura('button', {
  style: computed(() => ({
    backgroundColor: focused() ? [0, 0.5, 1, 1] : 
                    hovered() ? [0.3, 0.3, 0.3, 1] : 
                    [0.1, 0.1, 0.1, 1],
    borderColor: focused() ? 'cyan' : 'white'
  })),
  onFocus: () => focused.set(true),
  onBlur: () => focused.set(false),
  onMouseEnter: () => hovered.set(true),
  onMouseLeave: () => hovered.set(false)
});

// Темы через контекст
const ThemeContext = createContext<Theme>({
  colors: {
    primary: [0, 0.5, 1, 1],
    background: [0.1, 0.1, 0.1, 1],
    text: [1, 1, 1, 1]
  }
});

// Использование темы
const ThemedBox = () => {
  const theme = useContext(ThemeContext);
  
  return aura('box', {
    backgroundColor: theme.colors.background,
    children: [
      aura('text', {
        value: 'Themed content',
        color: theme.colors.text
      })
    ]
  });
};
```

---

## **План Реализации**

### **Фаза 1: Интеграция NeoFlux (Неделя 1)**

- **День 1-2**: Адаптация NeoFlux для компонентной системы
  - [ ] Создание bridge между NeoFlux и Component класса
  - [ ] Типизация для реактивных props
  - [ ] Интеграция lifecycle hooks

- **День 3-4**: Реактивная фабрика компонентов
  - [ ] Реализация функции `aura()` с type inference
  - [ ] Автоматическое отслеживание зависимостей
  - [ ] Батчинг обновлений компонентов

- **День 5**: Тестирование интеграции
  - [ ] Unit тесты реактивности
  - [ ] Performance benchmarks
  - [ ] Memory leak detection

### **Фаза 2: Базовые Компоненты (Неделя 2)**

- **День 6-7**: Переписывание core компонентов
  - [ ] Box с реактивными стилями
  - [ ] Text с реактивным контентом
  - [ ] Input с двусторонним связыванием

- **День 8-9**: Layout компоненты
  - [ ] Flex container
  - [ ] Grid система
  - [ ] Stack, Dock, Wrap

- **День 10**: Control flow утилиты
  - [ ] show, forEach, switchCase
  - [ ] portal, lazy, memo

### **Фаза 3: Продвинутые Компоненты (Неделя 3)**

- **День 11-12**: Сложные компоненты
  - [ ] VirtualList с оптимизацией
  - [ ] Table с сортировкой и фильтрацией
  - [ ] Tree с lazy loading

- **День 13-14**: Формы и валидация
  - [ ] Form wrapper с автоматической валидацией
  - [ ] Field компоненты
  - [ ] Error handling

- **День 15**: Визуализация данных
  - [ ] Chart компонент
  - [ ] Sparkline
  - [ ] Progress indicators

### **Фаза 4: Оптимизация (Неделя 4)**

- **День 16-17**: Performance оптимизации
  - [ ] Selective re-rendering
  - [ ] Memoization стратегии
  - [ ] Incremental rendering

- **День 18-19**: Developer Experience
  - [ ] TypeScript definitions
  - [ ] DevTools интеграция
  - [ ] Error boundaries

- **День 20**: Документация
  - [ ] API reference
  - [ ] Примеры использования
  - [ ] Migration guide

---

## **Примеры Использования**

### **8.1 Todo Application**

```typescript
// Чистый, типобезопасный код без JSX
function TodoApp() {
  const todos = store<Todo[]>([]);
  const filter = signal<'all' | 'active' | 'completed'>('all');
  const inputValue = signal('');
  
  const filtered = computed(() => {
    const items = todos.value;
    switch(filter()) {
      case 'active': return items.filter(t => !t.completed);
      case 'completed': return items.filter(t => t.completed);
      default: return items;
    }
  });
  
  const addTodo = () => {
    if (inputValue().trim()) {
      todos.value = [...todos.value, {
        id: Date.now(),
        text: inputValue(),
        completed: false
      }];
      inputValue.set('');
    }
  };
  
  return aura('flex', {
    direction: 'column',
    height: '100%',
    children: [
      // Header
      aura('text', { 
        value: 'Todo App',
        bold: true,
        fontSize: 'large'
      }),
      
      // Input
      aura('input', {
        value: inputValue,
        placeholder: 'What needs to be done?',
        onSubmit: addTodo
      }),
      
      // Todo List
      aura('box', {
        flex: 1,
        overflow: 'scroll',
        children: forEach(filtered, (todo) =>
          aura('flex', {
            direction: 'row',
            justifyContent: 'space-between',
            children: [
              aura('text', {
                value: todo.text,
                style: computed(() => ({
                  textDecoration: todo.completed ? 'line-through' : 'none',
                  color: todo.completed ? 'gray' : 'white'
                }))
              }),
              aura('button', {
                label: todo.completed ? 'Undo' : 'Done',
                onClick: () => {
                  const index = todos.value.findIndex(t => t.id === todo.id);
                  todos.value[index].completed = !todos.value[index].completed;
                }
              })
            ]
          })
        )
      }),
      
      // Footer
      aura('flex', {
        direction: 'row',
        justifyContent: 'space-between',
        children: [
          aura('text', { 
            value: computed(() => {
              const active = todos.value.filter(t => !t.completed).length;
              return `${active} items left`;
            })
          }),
          aura('select', {
            value: filter,
            options: ['all', 'active', 'completed']
          })
        ]
      })
    ]
  });
}
```

### **8.2 Real-time Dashboard**

```typescript
function Dashboard() {
  // Реактивные источники данных
  const metrics = resource(fetchMetrics, { 
    refetchInterval: 1000 
  });
  
  const alerts = createWebSocket('ws://api/alerts');
  
  const chartData = computed(() => 
    metrics.data ? processChartData(metrics.data) : []
  );
  
  return aura('grid', {
    columns: 3,
    rows: 2,
    gap: 1,
    children: [
      // Performance Metrics
      aura('box', {
        gridColumn: 'span 2',
        title: 'Performance Metrics',
        border: 'rounded',
        children: [
          show(metrics.loading, () => 
            aura('spinner', { centered: true })
          ),
          show(metrics.data, () =>
            aura('chart', {
              type: 'line',
              data: chartData
            })
          )
        ]
      }),
      
      // System Status
      aura('box', {
        title: 'System Status',
        border: 'rounded',
        children: [
          forEach(metrics.data?.systems || [], (system) =>
            aura('flex', {
              direction: 'row',
              justifyContent: 'space-between',
              children: [
                aura('text', { value: system.name }),
                aura('text', { 
                  value: system.status,
                  color: system.status === 'healthy' ? 'green' : 'red'
                })
              ]
            })
          )
        ]
      }),
      
      // Real-time Alerts
      aura('box', {
        gridColumn: 'span 3',
        title: 'Real-time Alerts',
        border: 'rounded',
        children: [
          aura('list', {
            items: alerts,
            virtualize: { itemHeight: 3 },
            renderItem: (alert) => aura('box', {
              backgroundColor: computed(() => {
                switch(alert.severity) {
                  case 'error': return [1, 0, 0, 0.2];
                  case 'warning': return [1, 1, 0, 0.2];
                  default: return 'transparent';
                }
              }),
              children: [
                aura('text', { value: alert.message })
              ]
            })
          })
        ]
      })
    ]
  });
}
```

### **8.3 Interactive Form**

```typescript
function RegistrationForm() {
  // Form state
  const username = signal('');
  const email = signal('');
  const password = signal('');
  const confirmPassword = signal('');
  
  // Validation
  const usernameError = computed(() => {
    const value = username();
    if (!value) return 'Username is required';
    if (value.length < 3) return 'Too short';
    if (!/^[a-zA-Z0-9_]+$/.test(value)) return 'Invalid characters';
    return null;
  });
  
  const emailError = computed(() => {
    const value = email();
    if (!value) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Invalid email';
    return null;
  });
  
  const passwordError = computed(() => {
    const value = password();
    if (!value) return 'Password is required';
    if (value.length < 8) return 'Too short';
    if (!/[A-Z]/.test(value)) return 'Must have uppercase';
    if (!/[0-9]/.test(value)) return 'Must have number';
    return null;
  });
  
  const confirmError = computed(() => {
    if (!confirmPassword()) return 'Please confirm password';
    if (password() !== confirmPassword()) return 'Passwords must match';
    return null;
  });
  
  const isValid = computed(() => 
    !usernameError() && !emailError() && 
    !passwordError() && !confirmError()
  );
  
  const isSubmitting = signal(false);
  
  const handleSubmit = async () => {
    if (!isValid()) return;
    
    isSubmitting.set(true);
    try {
      await registerUser({
        username: username(),
        email: email(),
        password: password()
      });
      // Success handling
    } catch (error) {
      // Error handling
    } finally {
      isSubmitting.set(false);
    }
  };
  
  // Form UI
  return aura('flex', {
    direction: 'column',
    gap: 2,
    padding: 2,
    children: [
      // Username field
      FormField({
        label: 'Username',
        value: username,
        error: usernameError
      }),
      
      // Email field
      FormField({
        label: 'Email',
        value: email,
        error: emailError
      }),
      
      // Password field
      aura('box', {
        marginBottom: 1,
        children: [
          aura('text', { value: 'Password', bold: true }),
          aura('input', { 
            value: password,
            type: 'password'
          }),
          show(passwordError, () =>
            aura('text', { 
              value: passwordError,
              color: 'red'
            })
          )
        ]
      }),
      
      // Confirm password field
      aura('box', {
        marginBottom: 1,
        children: [
          aura('text', { value: 'Confirm Password', bold: true }),
          aura('input', {
            value: confirmPassword,
            type: 'password'
          }),
          show(confirmError, () =>
            aura('text', {
              value: confirmError,
              color: 'red'
            })
          )
        ]
      }),
      
      // Submit button
      aura('button', {
        label: computed(() => 
          isSubmitting() ? 'Registering...' : 'Register'
        ),
        disabled: computed(() => !isValid() || isSubmitting()),
        onClick: handleSubmit
      })
    ]
  });
}
```

---

## **Заключение**

Aura Next представляет собой современный, типобезопасный и эффективный фреймворк для создания терминальных интерфейсов, который:

### **Ключевые Преимущества:**
- 🎯 **Полная типобезопасность** без необходимости в JSX или транспиляции
- 🚀 **Максимальная производительность** благодаря fine-grained reactivity из NeoFlux
- 💎 **Чистый API** с автоматическим выводом типов и минималистичным синтаксисом
- 🔧 **Композиция через функции** для максимальной переиспользуемости
- 📦 **Zero runtime overhead** - никаких лишних абстракций

### **Философия Дизайна:**
- Функции вместо классов где возможно
- Явность вместо магии
- Композиция вместо наследования
- Type inference вместо явных аннотаций
- Реактивность вместо императивных обновлений

### **Целевая Аудитория:**
- Разработчики, ценящие типобезопасность и производительность
- Создатели CLI-инструментов и системных утилит
- Любители функционального программирования
- Те, кто предпочитает нативный TypeScript без транспиляции

---

*Этот документ является живой спецификацией и будет обновляться по мере развития проекта.*