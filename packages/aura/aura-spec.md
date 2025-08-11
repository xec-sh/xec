# **Aura: Спецификация пост-минималистичного TUI-фреймворка**

## **Раздел I: Философия — Цифровая Субстанция**

Мы перестаем думать о терминале как о сетке из символов. Вместо этого мы представляем его как **цифровую субстанцию** — податливую, живую среду, которой можно придавать любую форму. Aura — это не набор инструментов для рисования коробок; это API для управления этой субстанцией.  
Принципы Aura — это законы этой новой физики:

1. **Фрактальное Единство: Всё есть Аура.** Не существует различия между "контейнером", "виджетом" или "текстом". Существует только aura — фундаментальная частица интерфейса. Каждая aura обладает базовыми свойствами: формой, положением, цветом, видимостью и способностью реагировать. Сложные структуры — это лишь композиции этих частиц.  
2. **Гармония с Средой: Терминал — не Веб.** Мы отказываемся от попыток имитировать веб-интерфейсы. В терминале нет "всплывающих окон" или "выпадающих списков". Есть только слои и фокус. Aura использует эти концепции в их чистом виде, обеспечивая интуитивно понятный и естественный для терминала опыт.  
3. **Клавиатура как Продолжение Мысли.** Взаимодействие с клавиатурой — это не просто набор событий, а язык. В Aura каждый компонент "говорит" на этом языке. Управление интуитивно, потому что оно следует естественной логике перемещения и действия, а не навязанным паттернам вроде "нажать на кнопку". Поддержка Vim-подобных motion shortcuts (j/k для вниз/вверх) делает навигацию еще более эффективной для опытных пользователей.  
4. **Концептуальная Чистота: Один для Многих.** Вместо десятка узкоспециализированных компонентов, Aura предлагает несколько мощных, параметризуемых концепций. select — это не просто список, а сама идея выбора. input — это идея ввода данных. Эта унификация радикально снижает когнитивную нагрузку и делает API предсказуемым.  
5. **Прямое Взаимодействие.** Никаких конструкторов new. Никаких скрытых механизмов. Вы описываете, *каким* должен быть ваш интерфейс, и он *становится* таким. Это достигается за счет декларативного API и гранулярной реактивности, где каждое изменение данных вызывает минимально необходимое, "хирургическое" изменение субстанции.  
6. **Добавленный принцип: Эластичность и Масштабируемость.** Aura адаптируется к размеру терминала автоматически, с поддержкой responsive дизайна через относительные единицы (%, fr). Это обеспечивает дружелюбность к пользователям с разными разрешениями экранов.
7. **Типобезопасность и Предсказуемость.** Использование TypeScript с максимальной строгостью обеспечивает предотвращение ошибок на этапе написания кода. Все API типизированы так, чтобы IDE могла подсказывать правильное использование и предупреждать об ошибках до запуска.

## **Раздел II: Ядро — Линзы и Атомы**

В основе Aura лежат две концепции: **Линзы** для наблюдения за состоянием и **Атомы** для формирования материи интерфейса. Реактивность построена на основе TRM State Management Module (packages/trm/src/advanced/state.ts), обеспечивающего fine-grained updates без Virtual DOM для максимальной производительности в терминале.

### **2.1. Линзы: Реактивность как Восприятие**

Состояние в Aura управляется с помощью гранулярной реактивной системы. Линзы обеспечивают автоматическое отслеживание зависимостей и обновления только измененных частей UI.

- **signal<T>(initialValue: T): WritableSignal<T>**: Создает реактивный источник данных с getter/setter. Поддерживает функциональные обновления для иммутабельности.
- **computed<T>(fn: () => T): Signal<T>**: Создает производное, кэшируемое значение. Оптимизирует сложные вычисления, обновляясь только при изменении зависимостей.
- **effect(fn: () => void | (() => void)): Disposable**: Создает реакцию, которая автоматически запускается при изменении любой линзы, прочитанной внутри. Возвращает disposer для очистки.
- **store<T extends object>(initial: T): Store<T>**: Глобальное хранилище для shared state, с поддержкой вложенных обновлений и транзакций.
- **resource<T>(fetcher: () => Promise<T>): Resource<T>**: Управление асинхронными данными с автоматическим отслеживанием загрузки и ошибок.
- **batch(fn: () => void): void**: Группировка обновлений для оптимизации рендеринга.
- **onMount(fn: () => void | (() => void))**: Lifecycle эффект для монтирования компонента.
- **onCleanup(fn: () => void)**: Для очистки при размонтировании.
- **onUpdate(fn: () => void)**: Для реакций на обновления.

Эти примитивы обеспечивают fine-grained reactivity, минимизируя перерисовки терминала, что критично для производительности в TUI.

### **2.2. Атом Интерфейса: aura()**

Это единственная функция для создания UI. Она возвращает строго типизированный объект, который можно компоновать.

```typescript
// Основная сигнатура с условными типами для максимальной типобезопасности
function aura<T extends AuraType>(type: T, props: AuraProps<T>): Aura<T>;

// Типы компонентов как литералы для лучшего вывода типов
type AuraType = 
  | 'box' | 'flex' | 'grid' | 'stack' | 'dock' | 'wrap'  // Контейнеры
  | 'text' | 'input' | 'select' | 'button'                // Базовые
  | 'table' | 'tabs' | 'tree' | 'list'                    // Структуры данных
  | 'chart' | 'graph' | 'sparkline'                       // Визуализация
  | 'canvas' | 'terminal'                                 // Низкоуровневые
  | 'spinner' | 'progress' | 'gauge'                      // Индикаторы
  | 'dialog' | 'modal' | 'notify';                        // Оверлеи
```

**Универсальные свойства каждого aura-атома:**

| Свойство       | Тип                          | Описание |
|----------------|------------------------------|----------|
| children      | Aura[] \| Signal<Aura[]>      | Дочерние частицы с реактивной поддержкой |
| x, y          | number \| string \| Signal<number \| string> | Позиция. Поддержка 'auto', '%', 'center' |
| width, height | number \| string \| Signal<number \| string> | Размеры. Поддержка 'auto', '%', 'fr', 'content' |
| hidden        | boolean \| Signal<boolean>    | Условная видимость |
| layer         | number \| Signal<number>      | Слой отрисовки (z-index). По умолчанию 0 |
| style         | Style \| Signal<Style>        | Объект стилей (цвета, атрибуты текста) |
| class         | string \| string[]            | CSS-подобные классы для темизации |
| padding, margin | Spacing \| number            | Отступы (поддержка shorthand) |
| onKey         | (event: KeyEvent) => void \| boolean | Обработчик клавиш с bubbling control |
| onMouse       | (event: MouseEvent) => void   | Обработчик мыши (если терминал поддерживает) |
| onFocus       | (event: FocusEvent) => void   | События фокуса |
| onBlur        | (event: FocusEvent) => void   | События потери фокуса |
| ref           | Ref<AuraElement>              | Ссылка для императивного доступа |
| animate       | AnimationOptions              | Анимация свойств через TRM Animation Engine |
| transition    | TransitionOptions             | Плавные переходы при изменении |
| focusable     | boolean                       | Может ли элемент получать фокус |
| tabIndex      | number                        | Порядок табуляции |
| ariaLabel     | string                        | Доступность для screen readers |
| testId        | string                        | Идентификатор для тестов |

### **2.3. Рендеринг и Буферизация**

Aura использует TRM Buffer Manager (packages/trm/src/core/buffer.ts) для эффективного рендеринга:

- **Двойная буферизация**: Рендеринг в back buffer, затем swap для устранения мерцания
- **Дифференциальные обновления**: Только измененные области перерисовываются
- **Оптимизация стилей**: Группировка ANSI escape sequences для минимизации вывода
- **Поддержка цветов**: От NoColor до TrueColor с автоопределением возможностей терминала

## **Раздел III: Композиция — Слои и Потоки**

### **3.1. Контейнеры: Формирование Пространства**

Контейнеры используют TRM Layout Engine (packages/trm/src/advanced/layout.ts) для управления расположением children.

- **aura('box', {... })**: Абсолютное позиционирование.
- **aura('flex', { direction, gap, justifyContent, alignItems, wrap })**: Flexbox-подобный с полной поддержкой выравнивания.
- **aura('grid', { columns, rows, gap, autoFlow })**: CSS Grid с поддержкой fr-единиц, minmax, span.
- **aura('stack', { orientation })**: Наложение элементов друг на друга.
- **aura('dock', {})**: Докинг к краям с автоматическим заполнением центра.
- **aura('wrap', { direction, gap })**: Автоматический перенос при нехватке места.

Автоматическая responsive: При resize терминала, геометрия пересчитывается через invalidate/measure/arrange циклы.

### **3.2. Слои: Управление Глубиной**

- Слои рендерятся через отдельные буферы для изоляции
- Автоматический фокус на верхнем слое
- **layerOpacity: number (0-1)** для полупрозрачных оверлеев (симуляция через альфа-композитинг)
- **backdrop: 'blur' | 'dim'** для эффектов фона

### **3.3. Фокус: Поток Внимания**

Управление фокусом через TRM Input Module с расширенной поддержкой:

- **Автоматическая навигация**: Tab/Shift+Tab, стрелки, Vim (h/j/k/l), Emacs (C-n/C-p/C-f/C-b)
- **Программное управление**: element.focus(), focusNext(), focusPrevious(), focusFirst(), focusLast()
- **Фокус-ловушки**: Автоматические для модальных слоев
- **Фокус-группы**: Логическая группировка элементов для навигации
- **Роуминг табиндекс**: Запоминание позиции в списках

## **Раздел IV: Периодическая таблица компонентов**

Все компоненты — параметризуемые aura-атомы с строгой типизацией props.

### **Базовые компоненты**

- **aura('text', { value: string | Signal<string>, wrap: TextWrap, align: TextAlign, truncate: TruncateOptions })**
  - Поддержка markdown через опцию `markdown: true`
  - Syntax highlighting через `language: 'javascript' | 'json' | ...`
  
- **aura('input', props: InputProps)**
  ```typescript
  interface InputProps {
    value: WritableSignal<string>;
    type?: 'text' | 'password' | 'number' | 'email' | 'url' | 'search';
    placeholder?: string;
    multiline?: boolean | { minRows?: number; maxRows?: number };
    validate?: (value: string) => ValidationResult;
    mask?: string | RegExp;  // Маска ввода
    suggestions?: string[] | ((input: string) => Promise<string[]>);  // Автокомплит
    maxLength?: number;
    debounce?: number;  // Задержка валидации
  }
  ```

- **aura('select', props: SelectProps)**
  ```typescript
  interface SelectProps<T> {
    options: SelectOption<T>[] | Signal<SelectOption<T>[]>;
    value: WritableSignal<T | T[]>;
    multiple?: boolean;
    variant?: 'list' | 'dropdown' | 'radio' | 'checkbox' | 'toggle';
    search?: boolean | { placeholder?: string; fuzzy?: boolean };
    virtualize?: boolean | { itemHeight: number };  // Виртуализация для больших списков
    groupBy?: (option: SelectOption<T>) => string;
    onSelect?: (value: T | T[]) => void;
  }
  ```

- **aura('button', { label: string | Signal<string>, variant: ButtonVariant, icon?: string, loading?: Signal<boolean> })**

### **Структуры данных**

- **aura('table', props: TableProps)**
  ```typescript
  interface TableProps<T> {
    data: Signal<T[]>;
    columns: TableColumn<T>[];
    sortable?: boolean | { multi?: boolean };
    filterable?: boolean | FilterOptions;
    selectable?: boolean | { mode: 'single' | 'multi' };
    paginate?: false | { pageSize: number; pageSizes?: number[] };
    virtualize?: boolean;
    expandable?: (row: T) => Aura;
    editable?: boolean | EditableOptions<T>;
    resizable?: boolean;  // Изменение размера колонок
    reorderable?: boolean;  // Перестановка колонок
  }
  ```

- **aura('tree', props: TreeProps)**
  ```typescript
  interface TreeProps<T> {
    data: TreeNode<T>[] | Signal<TreeNode<T>[]>;
    expanded?: WritableSignal<Set<string>>;
    selected?: WritableSignal<Set<string>>;
    checkable?: boolean | { cascade?: boolean };
    draggable?: boolean;
    editable?: boolean | { inline?: boolean };
    search?: boolean | TreeSearchOptions;
    lazy?: (node: TreeNode<T>) => Promise<TreeNode<T>[]>;  // Ленивая загрузка
  }
  ```

- **aura('list', { items: Signal<T[]>, renderItem: (item: T, index: number) => Aura, virtualize?: boolean })**

- **aura('tabs', props: TabsProps)**
  ```typescript
  interface TabsProps {
    items: TabItem[] | Signal<TabItem[]>;
    value: WritableSignal<string>;
    variant?: 'line' | 'enclosed' | 'pills';
    orientation?: 'horizontal' | 'vertical';
    closable?: boolean | ((tab: TabItem) => boolean);
    addable?: boolean | (() => TabItem);
    reorderable?: boolean;
    overflow?: 'scroll' | 'menu' | 'wrap';
  }
  ```

### **Визуализация данных**

- **aura('chart', props: ChartProps)**
  ```typescript
  interface ChartProps {
    type: 'line' | 'bar' | 'area' | 'scatter' | 'pie' | 'donut' | 'radar';
    data: ChartData | Signal<ChartData>;
    options?: ChartOptions;
    responsive?: boolean;
    animated?: boolean | AnimationOptions;
    interactive?: boolean | { tooltip?: boolean; zoom?: boolean; pan?: boolean };
  }
  ```

- **aura('sparkline', { data: number[] | Signal<number[]>, type?: 'line' | 'bar', color?: Color })**

- **aura('gauge', { value: Signal<number>, min?: number, max?: number, thresholds?: Threshold[] })**

- **aura('graph', props: GraphProps)**  // Для сетевых графов, деревьев зависимостей

### **Индикаторы состояния**

- **aura('spinner', { text?: string | Signal<string>, type?: SpinnerType, speed?: number })**
  - Встроенные типы: 'dots', 'line', 'circle', 'square', 'arrow', 'pulse'
  - Кастомные через `frames: string[]`

- **aura('progress', props: ProgressProps)**
  ```typescript
  interface ProgressProps {
    value: Signal<number>;
    max?: number;
    variant?: 'bar' | 'circle' | 'steps';
    label?: string | ((value: number, max: number) => string);
    color?: Color | ((progress: number) => Color);  // Градиент
    indeterminate?: boolean;
  }
  ```

### **Оверлеи и диалоги**

- **aura('dialog', props: DialogProps)**
  ```typescript
  interface DialogProps {
    open: Signal<boolean>;
    title?: string;
    content: Aura | string;
    actions?: DialogAction[];
    closable?: boolean;
    modal?: boolean;  // Блокировка фона
    position?: 'center' | 'top' | 'bottom' | Point;
    size?: 'sm' | 'md' | 'lg' | 'full' | Size;
    animate?: 'fade' | 'slide' | 'scale' | 'none';
  }
  ```

- **aura('notify', { message: string, type?: 'info' | 'success' | 'warning' | 'error', duration?: number, position?: NotifyPosition })**

### **Низкоуровневые**

- **aura('canvas', { onDraw: (ctx: CanvasContext) => void, onFrame?: (time: number) => void })**
  - Прямой доступ к буферу для рисования
  - Поддержка примитивов: линии, прямоугольники, круги, пути

- **aura('terminal', { command?: string, shell?: boolean, env?: Record<string, string> })**
  - Встроенный терминал/REPL

## **Раздел V: Язык Света — Стилизация**

### **5.1. Система стилей**

Стили в Aura используют TRM Styles Module с расширенной поддержкой:

```typescript
interface Style {
  // Цвета (поддержка всех форматов)
  fg?: Color;  // string | RGB | HSL | Signal<Color>
  bg?: Color;
  
  // Атрибуты текста
  bold?: boolean;
  italic?: boolean;
  underline?: boolean | UnderlineStyle;
  strikethrough?: boolean;
  dim?: boolean;
  inverse?: boolean;
  hidden?: boolean;
  blink?: boolean | 'slow' | 'rapid';
  overline?: boolean;
  
  // Границы
  border?: BorderStyle | boolean;
  borderColor?: Color;
  borderRadius?: number;  // Симуляция через символы
  
  // Тени (симуляция через слои)
  shadow?: boolean | ShadowOptions;
  
  // Эффекты
  opacity?: number;  // 0-1
  filter?: 'blur' | 'grayscale' | 'invert';
}
```

### **5.2. Темы**

Глобальная система тем с поддержкой переменных:

```typescript
Aura.defineTheme({
  name: 'dark',
  colors: {
    primary: '#007ACC',
    secondary: '#20B2AA',
    success: '#28A745',
    warning: '#FFC107',
    error: '#DC3545',
    // Семантические цвета
    background: '#1E1E1E',
    surface: '#252526',
    text: '#CCCCCC',
    textMuted: '#858585',
    border: '#464647'
  },
  typography: {
    heading: { bold: true, fg: 'var(--text)' },
    body: { fg: 'var(--text)' },
    code: { fg: 'var(--primary)' }
  },
  spacing: {
    xs: 1, sm: 2, md: 4, lg: 8, xl: 16
  },
  components: {
    button: {
      default: { bg: 'var(--primary)', fg: 'white', padding: 'var(--sm)' },
      hover: { bg: 'var(--primary-dark)', bold: true }
    }
  }
});

// Использование
aura('button', { class: 'button', label: 'Click me' });

// Динамическая смена темы
const [theme, setTheme] = signal('dark');
Aura.useTheme(theme);
```

### **5.3. CSS-подобные классы**

```typescript
// Определение классов
Aura.defineStyles({
  '.container': {
    padding: 4,
    border: 'rounded'
  },
  '.text-primary': {
    fg: 'var(--primary)'
  },
  '.hidden-sm': {
    '@media (max-width: 40)': {
      hidden: true
    }
  }
});

// Использование
aura('box', { class: ['container', 'hidden-sm'] });
```

## **Раздел VI: Анимация и Переходы**

Используя TRM Animation Module, Aura предоставляет богатые возможности анимации:

### **6.1. Декларативные анимации**

```typescript
aura('box', {
  animate: {
    from: { x: -10, opacity: 0 },
    to: { x: 0, opacity: 1 },
    duration: 300,
    easing: 'easeOutCubic',
    delay: 100,
    repeat: 'infinite',
    yoyo: true
  }
});
```

### **6.2. Spring-физика**

```typescript
const [position, setPosition] = signal({ x: 0, y: 0 });

aura('box', {
  x: spring(position, { stiffness: 100, damping: 10 }),
  onMouse: (e) => setPosition({ x: e.x, y: e.y })
});
```

### **6.3. Переходы состояний**

```typescript
aura('box', {
  transition: {
    properties: ['x', 'y', 'opacity'],
    duration: 200,
    easing: 'ease-in-out'
  },
  x: () => isActive() ? 10 : 0
});
```

### **6.4. Оркестрация анимаций**

```typescript
const timeline = createTimeline([
  { target: 'intro', duration: 500, props: { opacity: [0, 1] } },
  { target: 'title', duration: 300, props: { y: [-5, 0] }, offset: '-200' },
  { target: 'content', duration: 400, props: { scale: [0.9, 1] } }
]);

timeline.play();
```

## **Раздел VII: Двойственность — Полноэкранный режим и Встраиваемые диалоги**

### **7.1. Режим Приложения (Fullscreen)**

```typescript
const app = Aura.createApp(ui, {
  mode: 'fullscreen',
  terminal: {
    alternateBuffer: true,
    mouse: true,
    keyboard: 'raw'
  },
  theme: 'dark',
  debug: process.env.NODE_ENV === 'development'
});

await app.run();
```

Автоматическая обработка:
- Resize с пересчетом layout
- Graceful shutdown (Ctrl+C)
- Error boundaries с fallback UI
- Hot reload в dev mode

### **7.2. Режим Диалога (Inline Prompts)**

Полностью типизированные промпты с поддержкой отмены и валидации:

```typescript
const controller = new AbortController();

const result = await prompts.group({
  name: () => prompts.text({
    message: 'Имя проекта?',
    validate: (v) => v.length > 0 || 'Обязательное поле',
    signal: controller.signal
  }),
  
  type: ({ results }) => prompts.select({
    message: `Тип проекта для ${results.name}?`,
    options: [
      { value: 'app', label: 'Application', hint: 'Full application' },
      { value: 'lib', label: 'Library', hint: 'Reusable package' }
    ]
  }),
  
  features: () => prompts.multiselect({
    message: 'Дополнительные возможности?',
    options: [
      { value: 'ts', label: 'TypeScript', selected: true },
      { value: 'test', label: 'Testing (Vitest)' },
      { value: 'lint', label: 'Linting (ESLint)' },
      { value: 'ci', label: 'CI/CD (GitHub Actions)' }
    ],
    min: 1,
    max: 3
  }),
  
  confirm: () => prompts.confirm({
    message: 'Создать проект?',
    default: true
  })
}, {
  onCancel: () => {
    prompts.cancel('Отменено пользователем');
    process.exit(0);
  }
});

// Типы выводятся автоматически
// result: { name: string, type: 'app' | 'lib', features: string[], confirm: boolean }
```

## **Раздел VIII: Расширенные возможности**

### **8.1. Виртуализация**

Для больших объемов данных:

```typescript
aura('list', {
  items: signal(largeArray), // 10000+ элементов
  virtualize: {
    itemHeight: 1,  // Фиксированная высота
    overscan: 5,    // Буфер за пределами viewport
    estimateSize: (index) => index === 0 ? 2 : 1  // Динамическая высота
  },
  renderItem: (item) => aura('text', { value: item.label })
});
```

### **8.2. Порталы**

Рендеринг вне иерархии:

```typescript
aura('portal', {
  target: 'body',  // или селектор, или ref
  children: [
    aura('notify', { message: 'Глобальное уведомление' })
  ]
});
```

### **8.3. Suspense и Error Boundaries**

```typescript
aura('suspense', {
  fallback: aura('spinner', { text: 'Загрузка...' }),
  children: [
    aura('async', {
      loader: () => import('./HeavyComponent'),
      props: { data: asyncData }
    })
  ]
});

aura('errorBoundary', {
  fallback: (error) => aura('text', {
    value: `Ошибка: ${error.message}`,
    style: { fg: 'red' }
  }),
  onError: (error, errorInfo) => {
    console.error('Component error:', error, errorInfo);
  },
  children: [/* опасные компоненты */]
});
```

### **8.4. Контекст и Dependency Injection**

```typescript
const ThemeContext = createContext<Theme>('light');
const UserContext = createContext<User | null>(null);

aura('provider', {
  value: { [ThemeContext]: 'dark', [UserContext]: currentUser },
  children: [
    // Дочерние компоненты имеют доступ к контексту
    aura('consumer', {
      render: () => {
        const theme = useContext(ThemeContext);
        const user = useContext(UserContext);
        return aura('text', { 
          value: `${user?.name} использует ${theme} тему` 
        });
      }
    })
  ]
});
```

### **8.5. Хуки и композиция логики**

```typescript
// Кастомный хук
function useCounter(initial = 0) {
  const [count, setCount] = signal(initial);
  const increment = () => setCount(c => c + 1);
  const decrement = () => setCount(c => c - 1);
  const reset = () => setCount(initial);
  
  return { count, increment, decrement, reset };
}

// Использование в компоненте
function Counter() {
  const { count, increment, decrement } = useCounter(0);
  
  return aura('flex', {
    direction: 'row',
    gap: 2,
    children: [
      aura('button', { label: '-', onKey: decrement }),
      aura('text', { value: () => `Count: ${count()}` }),
      aura('button', { label: '+', onKey: increment })
    ]
  });
}
```

## **Раздел IX: Тестирование**

### **9.1. Unit-тестирование компонентов**

```typescript
import { render, screen, fireEvent } from '@aura/testing';

test('Counter increments on click', async () => {
  const { container } = render(Counter);
  
  expect(screen.getByText('Count: 0')).toBeInTheDocument();
  
  fireEvent.key(screen.getByText('+'), 'Enter');
  await screen.findByText('Count: 1');
  
  expect(container).toMatchSnapshot();
});
```

### **9.2. Integration-тестирование**

```typescript
import { createTestApp } from '@aura/testing';

test('App navigation', async () => {
  const app = await createTestApp(MyApp, {
    terminal: { rows: 24, cols: 80 }
  });
  
  await app.press('Tab');  // Переход к следующему элементу
  expect(app.focused).toHaveProperty('type', 'input');
  
  await app.type('Hello World');
  await app.press('Enter');
  
  expect(app.screen).toContain('Hello World');
});
```

## **Раздел X: Performance и Оптимизация**

### **10.1. Мемоизация и ленивая загрузка**

```typescript
const ExpensiveComponent = lazy(() => import('./ExpensiveComponent'));

const memoizedValue = computed(() => {
  return expensiveCalculation(data());
});

const MemoizedComponent = memo(({ data }) => {
  return aura('text', { value: processData(data) });
}, (prev, next) => prev.data.id === next.data.id);
```

### **10.2. Батчинг и дебаунсинг**

```typescript
const searchTerm = signal('');
const debouncedSearch = debounce(searchTerm, 300);

effect(() => {
  const term = debouncedSearch();
  if (term) performSearch(term);
});

// Батчинг обновлений
batch(() => {
  state1.set(newValue1);
  state2.set(newValue2);
  state3.set(newValue3);
}); // Один рендер вместо трех
```

### **10.3. Профилирование**

```typescript
const profiler = Aura.createProfiler();

profiler.start('render');
const ui = renderComplexUI();
profiler.end('render');

console.log(profiler.getMetrics());
// { render: { duration: 45, calls: 1, average: 45 } }
```

## **Раздел XI: Интеграция и Экосистема**

### **11.1. Плагины**

```typescript
Aura.use({
  name: 'router',
  install(aura) {
    aura.component('route', RouteComponent);
    aura.directive('link', LinkDirective);
    aura.provide('router', createRouter());
  }
});
```

### **11.2. DevTools**

```typescript
if (process.env.NODE_ENV === 'development') {
  Aura.enableDevTools({
    port: 9229,
    componentTree: true,
    stateInspector: true,
    performanceMonitor: true
  });
}
```

## **Раздел XII: Источники и Зависимости**

Aura построена на основе:

1. **TRM Core** (packages/trm/src/core) - Базовые примитивы терминала
2. **TRM Advanced** (packages/trm/src/advanced) - Продвинутые модули (state, layout, animation)
3. Вдохновление от:
   - SolidJS - Реактивная система
   - React - Компонентная модель
   - Vue - Директивы и композиция
   - Svelte - Компиляция и оптимизации
   - @clack/prompts - Интерактивные промпты

## **Раздел XIII: Детальный план реализации**

### **Этап 0: Подготовка инфраструктуры (1-2 дня)** ✅

#### 0.1. Структура проекта ✅
```
packages/aura/
├── src/
│   ├── core/           # Ядро фреймворка
│   │   ├── reactive/   # Реактивная система
│   │   │   ├── signal.ts
│   │   │   ├── computed.ts
│   │   │   ├── effect.ts
│   │   │   ├── store.ts
│   │   │   ├── resource.ts
│   │   │   └── batch.ts
│   │   ├── aura.ts     # Главная фабрика компонентов
│   │   ├── renderer.ts # Рендеринг в TRM буфер
│   │   ├── reconciler.ts # Diff и patch алгоритмы
│   │   └── scheduler.ts # Планировщик обновлений
│   ├── components/     # Встроенные компоненты
│   │   ├── base/       # text, input, button, select
│   │   ├── layout/     # box, flex, grid, stack, dock
│   │   ├── data/       # table, tree, list, tabs
│   │   ├── charts/     # chart, sparkline, gauge
│   │   ├── overlays/   # dialog, modal, notify
│   │   └── indicators/ # spinner, progress
│   ├── styles/         # Система стилей
│   │   ├── theme.ts
│   │   ├── css.ts      # CSS-подобные классы
│   │   └── animation.ts
│   ├── prompts/        # Inline промпты
│   ├── hooks/          # Встроенные хуки
│   ├── utils/          # Вспомогательные функции
│   └── index.ts        # Публичный API
├── test/
│   ├── unit/           # Модульные тесты
│   ├── integration/    # Интеграционные тесты
│   └── e2e/           # E2E тесты
├── examples/           # Примеры использования
└── docs/              # Документация
```

#### 0.2. Настройка сборки ✅
```typescript
// tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "declarationDir": "./dist/types",
    "lib": ["ES2022"],
    "types": ["node"],
    "jsx": "preserve",  // Для будущей поддержки JSX
    "jsxImportSource": "@aura/jsx"
  }
}
```

#### 0.3. Зависимости ✅
```json
{
  "dependencies": {
    "@xec-sh/trm": "workspace:*"  // Базовая зависимость
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "vitest": "^1.0.0",
    "@vitest/ui": "^1.0.0"
  }
}
```

### **Этап 1: Реактивная система (3-4 дня)** ✅

#### 1.1. Signal - базовый примитив (День 1) ✅
```typescript
// src/core/reactive/signal.ts
export interface Signal<T> {
  (): T;  // Getter
  peek(): T;  // Получение без отслеживания
  subscribe(fn: (value: T) => void): () => void;  // Подписка
}

export interface WritableSignal<T> extends Signal<T> {
  set(value: T | ((prev: T) => T)): void;  // Setter
  update(fn: (prev: T) => T): void;  // Функциональное обновление
  mutate(fn: (value: T) => void): void;  // Мутация для объектов
}

class SignalImpl<T> implements WritableSignal<T> {
  private value: T;
  private subscribers = new Set<(value: T) => void>();
  private version = 0;  // Для оптимизации computed
  
  constructor(initial: T) {
    this.value = initial;
  }
  
  // Реализация с отслеживанием зависимостей
  // ...
}
```

**Тестирование:**
- Базовые операции get/set
- Подписки и отписки
- Батчинг обновлений
- Циклические зависимости
- Memory leaks

#### 1.2. Computed - производные значения (День 1) ✅
```typescript
// src/core/reactive/computed.ts
class ComputedImpl<T> implements Signal<T> {
  private cache?: T;
  private isStale = true;
  private dependencies = new Set<Signal<any>>();
  
  constructor(private fn: () => T) {}
  
  // Ленивое вычисление с кэшированием
  // Автоматическое отслеживание зависимостей
  // ✅ Исправлена проблема с вложенными computed значениями
}
```

#### 1.3. Effect - побочные эффекты (День 2) ✅
```typescript
// src/core/reactive/effect.ts
interface EffectOptions {
  defer?: boolean;  // Отложенный запуск
  scheduler?: (fn: () => void) => void;  // Кастомный планировщик
}

class EffectImpl {
  private cleanup?: () => void;
  private dependencies = new Set<Signal<any>>();
  
  constructor(
    private fn: () => void | (() => void),
    private options?: EffectOptions
  ) {
    if (!options?.defer) this.run();
  }
  
  run() {
    // Очистка старых зависимостей
    // Выполнение с отслеживанием
    // Сохранение cleanup функции
  }
  
  dispose() {
    this.cleanup?.();
    this.dependencies.clear();
  }
}
```

#### 1.4. Store - глобальное состояние (День 2) ✅
```typescript
// src/core/reactive/store.ts
interface StoreOptions {
  name?: string;  // Для DevTools
  persist?: boolean | PersistOptions;  // Сохранение в localStorage
  middleware?: Middleware[];  // Redux-like middleware
}

class StoreImpl<T extends object> {
  private state: T;
  private signals = new Map<keyof T, WritableSignal<any>>();
  
  constructor(initial: T, options?: StoreOptions) {
    this.state = this.proxify(initial);
  }
  
  private proxify(obj: T): T {
    return new Proxy(obj, {
      get: (target, prop) => {
        // Возвращаем signal для каждого свойства
      },
      set: (target, prop, value) => {
        // Обновляем через signal
      }
    });
  }
}
```

#### 1.5. Resource - асинхронные данные (День 3) ✅
```typescript
// src/core/reactive/resource.ts
interface Resource<T> {
  (): T | undefined;  // Текущее значение
  loading: Signal<boolean>;
  error: Signal<Error | undefined>;
  refetch(): Promise<void>;
  mutate(value: T): void;  // Оптимистичные обновления
}

class ResourceImpl<T> implements Resource<T> {
  private data = signal<T | undefined>(undefined);
  loading = signal(true);
  error = signal<Error | undefined>(undefined);
  
  constructor(
    private fetcher: () => Promise<T>,
    private options?: ResourceOptions
  ) {
    this.fetch();
  }
  
  private async fetch() {
    this.loading.set(true);
    try {
      const result = await this.fetcher();
      batch(() => {
        this.data.set(result);
        this.error.set(undefined);
        this.loading.set(false);
      });
    } catch (err) {
      batch(() => {
        this.error.set(err as Error);
        this.loading.set(false);
      });
    }
  }
}
```

#### 1.6. Batch и Scheduler (День 3-4) ✅
```typescript
// src/core/reactive/batch.ts
class BatchScheduler {
  private pending = new Set<() => void>();
  private isScheduled = false;
  
  schedule(fn: () => void) {
    this.pending.add(fn);
    if (!this.isScheduled) {
      this.isScheduled = true;
      queueMicrotask(() => this.flush());
    }
  }
  
  flush() {
    const updates = [...this.pending];
    this.pending.clear();
    this.isScheduled = false;
    
    // Сортировка по приоритету
    updates.sort((a, b) => getPriority(a) - getPriority(b));
    
    // Выполнение
    updates.forEach(fn => fn());
  }
}
```

### **Этап 2: Компонентная система (4-5 дней)**

#### 2.1. Aura Factory (День 4)
```typescript
// src/core/aura.ts
interface AuraNode<T = any> {
  type: AuraType;
  props: AuraProps<T>;
  children: AuraNode[];
  key?: string | number;
  ref?: Ref<any>;
  // Внутренние поля
  _fiber?: Fiber;  // Для reconciler
  _instance?: ComponentInstance;
}

function aura<T extends AuraType>(
  type: T,
  props: AuraProps<T>
): AuraNode<T> {
  // Нормализация props
  const normalizedProps = normalizeProps(type, props);
  
  // Извлечение children
  const { children = [], ...restProps } = normalizedProps;
  
  // Создание узла
  return {
    type,
    props: restProps,
    children: Array.isArray(children) ? children : [children],
    key: props.key,
    ref: props.ref
  };
}

// Специализированные фабрики для удобства
aura.box = (props: BoxProps) => aura('box', props);
aura.text = (props: TextProps) => aura('text', props);
// ... и т.д.
```

#### 2.2. Component Registry (День 4)
```typescript
// src/core/components/registry.ts
interface ComponentDefinition<P = any> {
  name: string;
  render: (props: P, ctx: RenderContext) => RenderResult;
  defaultProps?: Partial<P>;
  validate?: (props: P) => ValidationResult;
  // Lifecycle
  onCreate?: (instance: ComponentInstance) => void;
  onMount?: (instance: ComponentInstance) => void;
  onUpdate?: (instance: ComponentInstance, prevProps: P) => void;
  onUnmount?: (instance: ComponentInstance) => void;
}

class ComponentRegistry {
  private components = new Map<string, ComponentDefinition>();
  
  register<P>(name: string, definition: ComponentDefinition<P>) {
    if (this.components.has(name)) {
      console.warn(`Component "${name}" is already registered`);
    }
    this.components.set(name, definition);
  }
  
  get(name: string): ComponentDefinition | undefined {
    return this.components.get(name);
  }
  
  // Встроенная регистрация базовых компонентов
  registerBuiltins() {
    this.register('text', TextComponent);
    this.register('box', BoxComponent);
    this.register('flex', FlexComponent);
    // ...
  }
}
```

#### 2.3. Renderer (День 5)
```typescript
// src/core/renderer.ts
class AuraRenderer {
  private buffer: BufferManager;
  private rootFiber: Fiber | null = null;
  private workInProgress: Fiber | null = null;
  
  constructor(
    private stream: TerminalStream,
    private registry: ComponentRegistry
  ) {
    this.buffer = new BufferManagerImpl(stream);
  }
  
  render(element: AuraNode, container?: Container) {
    // Создание или обновление fiber tree
    if (!this.rootFiber) {
      this.rootFiber = createFiberFromElement(element);
    } else {
      this.rootFiber = reconcile(this.rootFiber, element);
    }
    
    // Планирование работы
    this.scheduleWork(this.rootFiber);
  }
  
  private scheduleWork(fiber: Fiber) {
    // Добавление в очередь обновлений
    workQueue.push(fiber);
    
    // Запуск работы если не активна
    if (!isWorking) {
      requestIdleCallback(() => this.performWork());
    }
  }
  
  private performWork() {
    // Time slicing для сохранения отзывчивости
    const deadline = performance.now() + 5; // 5ms квант
    
    while (this.workInProgress && performance.now() < deadline) {
      this.workInProgress = performUnitOfWork(this.workInProgress);
    }
    
    if (this.workInProgress) {
      // Продолжить в следующем кадре
      requestIdleCallback(() => this.performWork());
    } else {
      // Commit phase - применение изменений
      this.commitWork();
    }
  }
  
  private commitWork() {
    // Применение изменений к буферу
    commitFiberTree(this.rootFiber, this.buffer);
    
    // Рендеринг буфера в терминал
    this.buffer.flip();
    this.buffer.render(this.buffer.frontBuffer);
  }
}
```

#### 2.4. Reconciler (День 6-7)
```typescript
// src/core/reconciler.ts
interface Fiber {
  type: AuraType | ComponentDefinition;
  props: any;
  parent: Fiber | null;
  child: Fiber | null;
  sibling: Fiber | null;
  alternate: Fiber | null;  // Предыдущая версия
  effectTag: 'PLACEMENT' | 'UPDATE' | 'DELETION' | null;
  hooks: Hook[] | null;  // Для функциональных компонентов
  stateNode: any;  // DOM node или instance
}

function reconcileChildren(
  wipFiber: Fiber,
  elements: AuraNode[]
) {
  let index = 0;
  let oldFiber = wipFiber.alternate?.child || null;
  let prevSibling: Fiber | null = null;
  
  while (index < elements.length || oldFiber) {
    const element = elements[index];
    let newFiber: Fiber | null = null;
    
    const sameType = oldFiber && element && 
      element.type === oldFiber.type;
    
    if (sameType) {
      // UPDATE
      newFiber = {
        type: oldFiber!.type,
        props: element.props,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: 'UPDATE'
      };
    } else {
      if (element) {
        // PLACEMENT
        newFiber = {
          type: element.type,
          props: element.props,
          parent: wipFiber,
          alternate: null,
          effectTag: 'PLACEMENT'
        };
      }
      if (oldFiber) {
        // DELETION
        oldFiber.effectTag = 'DELETION';
        deletions.push(oldFiber);
      }
    }
    
    // Связывание fibers
    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (prevSibling) {
      prevSibling.sibling = newFiber;
    }
    
    prevSibling = newFiber;
    oldFiber = oldFiber?.sibling || null;
    index++;
  }
}
```

### **Этап 3: Базовые компоненты (5-6 дней)**

#### 3.1. Text Component (День 8)
```typescript
// src/components/base/text.ts
interface TextProps extends BaseAuraProps {
  value: string | Signal<string>;
  wrap?: 'none' | 'word' | 'char' | 'word-break';
  align?: 'left' | 'center' | 'right' | 'justify';
  truncate?: boolean | { length: number; suffix?: string };
  markdown?: boolean;
  highlight?: { language: string; theme?: string };
}

const TextComponent: ComponentDefinition<TextProps> = {
  name: 'text',
  
  render(props, ctx) {
    const value = isSignal(props.value) ? props.value() : props.value;
    
    // Обработка markdown если включено
    const processed = props.markdown 
      ? parseMarkdown(value) 
      : value;
    
    // Применение выравнивания и переносов
    const lines = wrapText(processed, {
      width: ctx.width,
      wrap: props.wrap || 'word'
    });
    
    // Рендеринг в буфер
    lines.forEach((line, i) => {
      const aligned = alignText(line, ctx.width, props.align);
      ctx.buffer.writeText(
        ctx.x,
        ctx.y + i as Y,
        aligned,
        props.style
      );
    });
    
    return { width: ctx.width, height: lines.length };
  }
};
```

#### 3.2. Input Component (День 8-9)
```typescript
// src/components/base/input.ts
class InputComponent implements ComponentInstance {
  private cursor = 0;
  private selection: [number, number] | null = null;
  private history: string[] = [];
  private historyIndex = -1;
  
  constructor(private props: InputProps) {
    // Подписка на изменения value
    if (isSignal(props.value)) {
      effect(() => {
        this.render();
      });
    }
  }
  
  handleKey(event: KeyEvent) {
    const value = this.getValue();
    
    switch (event.key) {
      case 'ArrowLeft':
        this.cursor = Math.max(0, this.cursor - 1);
        break;
        
      case 'ArrowRight':
        this.cursor = Math.min(value.length, this.cursor + 1);
        break;
        
      case 'Home':
      case 'Ctrl+A':
        this.cursor = 0;
        break;
        
      case 'End':
      case 'Ctrl+E':
        this.cursor = value.length;
        break;
        
      case 'Backspace':
        if (this.selection) {
          this.deleteSelection();
        } else if (this.cursor > 0) {
          this.setValue(
            value.slice(0, this.cursor - 1) + 
            value.slice(this.cursor)
          );
          this.cursor--;
        }
        break;
        
      case 'Delete':
        if (this.selection) {
          this.deleteSelection();
        } else if (this.cursor < value.length) {
          this.setValue(
            value.slice(0, this.cursor) + 
            value.slice(this.cursor + 1)
          );
        }
        break;
        
      default:
        if (event.key.length === 1 && !event.ctrl && !event.alt) {
          // Ввод символа
          if (this.selection) {
            this.deleteSelection();
          }
          
          // Валидация маски
          if (this.props.mask && !this.validateMask(event.key)) {
            return;
          }
          
          this.setValue(
            value.slice(0, this.cursor) + 
            event.key + 
            value.slice(this.cursor)
          );
          this.cursor++;
          
          // Автокомплит
          if (this.props.suggestions) {
            this.showSuggestions();
          }
        }
    }
    
    // Валидация
    if (this.props.validate) {
      const result = this.props.validate(this.getValue());
      if (!result.valid) {
        this.showError(result.error);
      }
    }
  }
}
```

#### 3.3. Select Component (День 9-10)
```typescript
// src/components/base/select.ts
class SelectComponent {
  private selectedIndex = 0;
  private searchTerm = '';
  private filteredOptions: SelectOption[] = [];
  private viewport = { start: 0, end: 10 };  // Для виртуализации
  
  constructor(private props: SelectProps) {
    this.filteredOptions = this.getOptions();
  }
  
  handleKey(event: KeyEvent) {
    switch (event.key) {
      case 'ArrowUp':
      case 'k':  // Vim
        this.moveSelection(-1);
        break;
        
      case 'ArrowDown':
      case 'j':  // Vim
        this.moveSelection(1);
        break;
        
      case 'PageUp':
        this.moveSelection(-10);
        break;
        
      case 'PageDown':
        this.moveSelection(10);
        break;
        
      case 'Home':
        this.selectedIndex = 0;
        this.updateViewport();
        break;
        
      case 'End':
        this.selectedIndex = this.filteredOptions.length - 1;
        this.updateViewport();
        break;
        
      case 'Enter':
      case ' ':
        this.selectCurrent();
        break;
        
      case 'Escape':
        if (this.searchTerm) {
          this.searchTerm = '';
          this.filterOptions();
        } else {
          this.props.onCancel?.();
        }
        break;
        
      default:
        // Поиск по нажатию клавиш
        if (this.props.search && event.key.length === 1) {
          this.searchTerm += event.key;
          this.filterOptions();
        }
    }
  }
  
  private filterOptions() {
    const options = this.getOptions();
    
    if (!this.searchTerm) {
      this.filteredOptions = options;
      return;
    }
    
    if (this.props.search?.fuzzy) {
      // Fuzzy search
      this.filteredOptions = fuzzyFilter(options, this.searchTerm);
    } else {
      // Simple search
      this.filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(this.searchTerm.toLowerCase())
      );
    }
    
    this.selectedIndex = 0;
    this.updateViewport();
  }
  
  private updateViewport() {
    if (!this.props.virtualize) return;
    
    const itemHeight = this.props.virtualize.itemHeight || 1;
    const visibleItems = Math.floor(this.props.height / itemHeight);
    
    // Центрирование выбранного элемента
    this.viewport.start = Math.max(0, 
      this.selectedIndex - Math.floor(visibleItems / 2)
    );
    this.viewport.end = Math.min(
      this.filteredOptions.length,
      this.viewport.start + visibleItems
    );
  }
  
  render(ctx: RenderContext) {
    const visibleOptions = this.props.virtualize
      ? this.filteredOptions.slice(this.viewport.start, this.viewport.end)
      : this.filteredOptions;
    
    // Рендеринг поиска если включен
    if (this.props.search && this.searchTerm) {
      ctx.buffer.writeText(
        ctx.x, ctx.y,
        `Search: ${this.searchTerm}_`,
        { fg: this.props.style?.fg, italic: true }
      );
      ctx.y++;
    }
    
    // Рендеринг опций
    visibleOptions.forEach((option, i) => {
      const actualIndex = this.props.virtualize 
        ? this.viewport.start + i 
        : i;
      const isSelected = actualIndex === this.selectedIndex;
      const isChecked = this.props.multiple 
        ? this.props.value().includes(option.value)
        : this.props.value() === option.value;
      
      // Префикс для выбора
      let prefix = '';
      if (this.props.variant === 'radio') {
        prefix = isChecked ? '◉ ' : '○ ';
      } else if (this.props.variant === 'checkbox') {
        prefix = isChecked ? '☑ ' : '☐ ';
      } else if (isSelected) {
        prefix = '▶ ';
      } else {
        prefix = '  ';
      }
      
      // Стиль для выбранного элемента
      const style = isSelected 
        ? { ...this.props.style, inverse: true }
        : this.props.style;
      
      ctx.buffer.writeText(
        ctx.x, ctx.y + i,
        prefix + option.label,
        style
      );
      
      // Hint если есть
      if (option.hint) {
        ctx.buffer.writeText(
          ctx.x + prefix.length + option.label.length + 2,
          ctx.y + i,
          `(${option.hint})`,
          { ...style, dim: true }
        );
      }
    });
    
    // Скроллбар для виртуализации
    if (this.props.virtualize && this.filteredOptions.length > visibleOptions.length) {
      this.renderScrollbar(ctx);
    }
  }
}
```

### **Этап 4: Layout компоненты (3-4 дня)**

#### 4.1. Flex Layout (День 11)
```typescript
// src/components/layout/flex.ts
interface FlexProps extends ContainerProps {
  direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  justifyContent?: 'start' | 'end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
  alignItems?: 'start' | 'end' | 'center' | 'stretch' | 'baseline';
  gap?: number | { row?: number; column?: number };
  wrap?: boolean | 'wrap' | 'nowrap' | 'wrap-reverse';
}

class FlexLayout {
  calculateLayout(props: FlexProps, children: AuraNode[], constraints: Constraints) {
    const isRow = props.direction?.includes('row') ?? true;
    const isReverse = props.direction?.includes('reverse') ?? false;
    
    // Phase 1: Measure children
    const measurements = children.map(child => {
      const flexGrow = child.props.flex ?? 0;
      const flexShrink = child.props.flexShrink ?? 1;
      const flexBasis = child.props.flexBasis ?? 'auto';
      
      // Измерение минимального размера
      const minSize = measureChild(child, {
        width: flexBasis === 'auto' ? undefined : flexBasis,
        height: isRow ? constraints.height : undefined
      });
      
      return { child, minSize, flexGrow, flexShrink, flexBasis };
    });
    
    // Phase 2: Calculate flex
    const totalMinSize = measurements.reduce((sum, m) => 
      sum + (isRow ? m.minSize.width : m.minSize.height), 0
    );
    
    const availableSpace = (isRow ? constraints.width : constraints.height) - totalMinSize;
    const totalFlexGrow = measurements.reduce((sum, m) => sum + m.flexGrow, 0);
    
    // Phase 3: Distribute space
    const sizes = measurements.map(m => {
      const baseSize = isRow ? m.minSize.width : m.minSize.height;
      
      if (availableSpace > 0 && m.flexGrow > 0) {
        // Растягивание
        const extraSpace = (availableSpace * m.flexGrow) / totalFlexGrow;
        return baseSize + extraSpace;
      } else if (availableSpace < 0 && m.flexShrink > 0) {
        // Сжатие
        const totalFlexShrink = measurements.reduce((sum, m) => sum + m.flexShrink, 0);
        const shrinkSpace = (Math.abs(availableSpace) * m.flexShrink) / totalFlexShrink;
        return Math.max(0, baseSize - shrinkSpace);
      }
      
      return baseSize;
    });
    
    // Phase 4: Position children
    const positions = this.calculatePositions(
      sizes,
      props.justifyContent || 'start',
      props.gap,
      isRow,
      isReverse,
      constraints
    );
    
    // Phase 5: Align items
    return measurements.map((m, i) => ({
      child: m.child,
      x: isRow ? positions[i] : this.calculateAlignment(m, props.alignItems, constraints.width),
      y: isRow ? this.calculateAlignment(m, props.alignItems, constraints.height) : positions[i],
      width: isRow ? sizes[i] : constraints.width,
      height: isRow ? constraints.height : sizes[i]
    }));
  }
}
```

#### 4.2. Grid Layout (День 12)
```typescript
// src/components/layout/grid.ts
interface GridProps extends ContainerProps {
  columns?: string | number;  // '1fr 2fr 100px' или число колонок
  rows?: string | number;
  gap?: number | { row?: number; column?: number };
  autoFlow?: 'row' | 'column' | 'dense';
  justifyItems?: AlignValue;
  alignItems?: AlignValue;
  placeItems?: string;  // Shorthand
}

class GridLayout {
  private parseTrackList(value: string | number): Track[] {
    if (typeof value === 'number') {
      // Равные колонки
      return Array(value).fill('1fr').map(v => this.parseTrack(v));
    }
    
    return value.split(' ').map(v => this.parseTrack(v));
  }
  
  private parseTrack(value: string): Track {
    if (value.endsWith('fr')) {
      return { type: 'fr', value: parseFloat(value) };
    } else if (value.endsWith('px')) {
      return { type: 'fixed', value: parseInt(value) };
    } else if (value === 'auto') {
      return { type: 'auto' };
    } else if (value.includes('minmax')) {
      const [min, max] = value.match(/minmax\((.*),(.*)\)/)!.slice(1, 3);
      return { type: 'minmax', min: this.parseTrack(min), max: this.parseTrack(max) };
    }
    
    return { type: 'fixed', value: parseInt(value) };
  }
  
  calculateLayout(props: GridProps, children: AuraNode[], constraints: Constraints) {
    const columns = this.parseTrackList(props.columns || 1);
    const rows = this.parseTrackList(props.rows || 'auto');
    
    // Автоматическое размещение элементов
    const placement = this.autoPlace(children, columns, rows, props.autoFlow);
    
    // Вычисление размеров треков
    const columnSizes = this.calculateTrackSizes(columns, constraints.width, 'column', placement);
    const rowSizes = this.calculateTrackSizes(rows, constraints.height, 'row', placement);
    
    // Позиционирование элементов
    return placement.map(({ child, column, row, columnSpan, rowSpan }) => {
      const x = columnSizes.slice(0, column).reduce((sum, size) => sum + size, 0);
      const y = rowSizes.slice(0, row).reduce((sum, size) => sum + size, 0);
      const width = columnSizes.slice(column, column + columnSpan).reduce((sum, size) => sum + size, 0);
      const height = rowSizes.slice(row, row + rowSpan).reduce((sum, size) => sum + size, 0);
      
      return { child, x, y, width, height };
    });
  }
}
```

### **Этап 5: Стилизация и темы (2-3 дня)**

#### 5.1. Theme System (День 13)
```typescript
// src/styles/theme.ts
interface Theme {
  name: string;
  colors: ColorPalette;
  typography: TypographyScale;
  spacing: SpacingScale;
  components: ComponentStyles;
  // Responsive breakpoints
  breakpoints?: {
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
}

class ThemeManager {
  private themes = new Map<string, Theme>();
  private currentTheme = signal<string>('default');
  private cssVars = new Map<string, Signal<any>>();
  
  defineTheme(theme: Theme) {
    this.themes.set(theme.name, theme);
    
    // Создание CSS переменных
    Object.entries(theme.colors).forEach(([key, value]) => {
      this.cssVars.set(`--${key}`, signal(value));
    });
  }
  
  useTheme(name: string | Signal<string>) {
    if (isSignal(name)) {
      effect(() => {
        this.applyTheme(name());
      });
    } else {
      this.applyTheme(name);
    }
  }
  
  private applyTheme(name: string) {
    const theme = this.themes.get(name);
    if (!theme) {
      console.warn(`Theme "${name}" not found`);
      return;
    }
    
    // Обновление CSS переменных
    batch(() => {
      Object.entries(theme.colors).forEach(([key, value]) => {
        this.cssVars.get(`--${key}`)?.set(value);
      });
    });
    
    this.currentTheme.set(name);
  }
  
  resolveValue(value: string): any {
    if (value.startsWith('var(')) {
      const varName = value.slice(4, -1);
      return this.cssVars.get(varName)?.() ?? value;
    }
    return value;
  }
}
```

#### 5.2. CSS Classes (День 14)
```typescript
// src/styles/css.ts
interface StyleRule {
  selector: string;
  styles: Style;
  media?: string;
  hover?: Style;
  focus?: Style;
  active?: Style;
}

class StyleSheet {
  private rules = new Map<string, StyleRule>();
  private cache = new Map<string, Style>();
  
  defineStyles(rules: Record<string, Style | StyleRule>) {
    Object.entries(rules).forEach(([selector, rule]) => {
      if (this.isStyleRule(rule)) {
        this.rules.set(selector, rule);
      } else {
        this.rules.set(selector, { selector, styles: rule });
      }
    });
  }
  
  getStyles(classes: string | string[]): Style {
    const classList = Array.isArray(classes) ? classes : classes.split(' ');
    const cacheKey = classList.sort().join(' ');
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    // Merge styles with specificity
    const merged = classList.reduce((acc, className) => {
      const rule = this.rules.get(`.${className}`);
      if (rule) {
        // Check media queries
        if (rule.media && !this.matchMedia(rule.media)) {
          return acc;
        }
        
        return { ...acc, ...rule.styles };
      }
      return acc;
    }, {} as Style);
    
    this.cache.set(cacheKey, merged);
    return merged;
  }
  
  private matchMedia(query: string): boolean {
    // Parse and evaluate media query
    const match = query.match(/@media\s*\((.*)\)/);
    if (!match) return false;
    
    const condition = match[1];
    if (condition.includes('max-width')) {
      const maxWidth = parseInt(condition.match(/max-width:\s*(\d+)/)![1]);
      return getCurrentWidth() <= maxWidth;
    }
    // ... другие условия
    
    return false;
  }
}
```

### **Этап 6: Анимации (3-4 дня)**

#### 6.1. Animation Engine (День 15-16)
```typescript
// src/styles/animation.ts
interface Animation {
  from?: Partial<AnimatableProps>;
  to: Partial<AnimatableProps>;
  duration: number;
  easing?: EasingFunction | string;
  delay?: number;
  repeat?: number | 'infinite';
  yoyo?: boolean;
  onComplete?: () => void;
}

class AnimationController {
  private animations = new Map<string, AnimationInstance>();
  private rafId?: number;
  private lastTime = 0;
  
  animate(target: AuraNode, animation: Animation): Disposable {
    const id = generateId();
    const instance = new AnimationInstance(target, animation);
    
    this.animations.set(id, instance);
    this.start();
    
    return {
      dispose: () => {
        this.animations.delete(id);
        if (this.animations.size === 0) {
          this.stop();
        }
      }
    };
  }
  
  private start() {
    if (this.rafId) return;
    
    const tick = (time: number) => {
      const deltaTime = time - this.lastTime;
      this.lastTime = time;
      
      // Update all animations
      for (const [id, animation] of this.animations) {
        animation.update(deltaTime);
        
        if (animation.isComplete()) {
          animation.onComplete?.();
          this.animations.delete(id);
        }
      }
      
      // Schedule next frame if animations remain
      if (this.animations.size > 0) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        this.stop();
      }
    };
    
    this.rafId = requestAnimationFrame(tick);
  }
  
  private stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = undefined;
    }
  }
}

class AnimationInstance {
  private elapsed = 0;
  private currentRepeat = 0;
  private direction = 1;
  
  constructor(
    private target: AuraNode,
    private config: Animation
  ) {
    // Сохранение начальных значений
    this.saveInitialState();
  }
  
  update(deltaTime: number) {
    this.elapsed += deltaTime;
    
    if (this.elapsed < this.config.delay) {
      return;
    }
    
    const actualElapsed = this.elapsed - this.config.delay;
    let progress = Math.min(actualElapsed / this.config.duration, 1);
    
    // Apply easing
    progress = this.applyEasing(progress);
    
    // Apply yoyo
    if (this.config.yoyo && this.direction === -1) {
      progress = 1 - progress;
    }
    
    // Interpolate properties
    this.interpolate(progress);
    
    // Check completion
    if (actualElapsed >= this.config.duration) {
      if (this.config.repeat === 'infinite' || 
          this.currentRepeat < this.config.repeat) {
        // Restart
        this.elapsed = this.config.delay || 0;
        this.currentRepeat++;
        
        if (this.config.yoyo) {
          this.direction *= -1;
        }
      }
    }
  }
  
  private interpolate(progress: number) {
    const from = this.config.from || this.initialState;
    const to = this.config.to;
    
    Object.entries(to).forEach(([prop, toValue]) => {
      const fromValue = from[prop];
      
      if (typeof fromValue === 'number' && typeof toValue === 'number') {
        // Numeric interpolation
        const value = fromValue + (toValue - fromValue) * progress;
        this.target.props[prop] = value;
      } else if (isColor(fromValue) && isColor(toValue)) {
        // Color interpolation
        const value = interpolateColor(fromValue, toValue, progress);
        this.target.props[prop] = value;
      }
      // ... другие типы
    });
    
    // Trigger re-render
    markDirty(this.target);
  }
}
```

#### 6.2. Spring Physics (День 17)
```typescript
// src/styles/spring.ts
interface SpringConfig {
  stiffness?: number;  // Жесткость пружины (default: 100)
  damping?: number;     // Затухание (default: 10)
  mass?: number;        // Масса (default: 1)
  velocity?: number;    // Начальная скорость
  precision?: number;   // Точность остановки
}

class Spring<T extends number | Point> {
  private current: T;
  private target: T;
  private velocity: T;
  private lastTime = performance.now();
  
  constructor(
    initial: T,
    private config: SpringConfig = {}
  ) {
    this.current = initial;
    this.target = initial;
    this.velocity = this.getZeroVelocity();
  }
  
  setTarget(value: T) {
    this.target = value;
    this.lastTime = performance.now();
    this.animate();
  }
  
  private animate() {
    const now = performance.now();
    const deltaTime = (now - this.lastTime) / 1000; // to seconds
    this.lastTime = now;
    
    // Spring physics calculation
    const { stiffness = 100, damping = 10, mass = 1 } = this.config;
    
    if (typeof this.current === 'number') {
      // Scalar spring
      const distance = this.target - this.current;
      const springForce = distance * stiffness;
      const dampingForce = this.velocity * damping;
      const acceleration = (springForce - dampingForce) / mass;
      
      this.velocity += acceleration * deltaTime;
      this.current += this.velocity * deltaTime;
      
      // Check if settled
      if (Math.abs(this.velocity) < 0.01 && Math.abs(distance) < 0.01) {
        this.current = this.target;
        this.velocity = 0;
        return;
      }
    } else {
      // Vector spring (Point)
      // Similar logic for x and y components
    }
    
    // Continue animation
    requestAnimationFrame(() => this.animate());
    
    // Notify subscribers
    this.notify();
  }
}

// Integration with signals
function spring<T extends number | Point>(
  signal: Signal<T>,
  config?: SpringConfig
): Signal<T> {
  const springInstance = new Spring(signal(), config);
  
  // Subscribe to signal changes
  signal.subscribe(value => {
    springInstance.setTarget(value);
  });
  
  // Return animated signal
  return computed(() => springInstance.current);
}
```

### **Этап 7: Интерактивные промпты (3-4 дня)**

#### 7.1. Prompt System (День 18-19)
```typescript
// src/prompts/index.ts
interface PromptOptions<T> {
  message: string;
  default?: T;
  validate?: (value: T) => string | boolean | Promise<string | boolean>;
  format?: (value: T) => string;
  signal?: AbortSignal;
  theme?: PromptTheme;
}

class PromptRenderer {
  private terminal: Terminal;
  private isActive = true;
  
  constructor(options: PromptOptions<any>) {
    this.terminal = new Terminal({
      mode: 'inline',
      rawMode: true,
      keyboard: true
    });
  }
  
  async render<T>(component: AuraNode): Promise<T> {
    await this.terminal.init();
    
    // Save cursor position
    this.terminal.cursor.save();
    
    try {
      // Render prompt UI
      const renderer = new AuraRenderer(this.terminal.stream);
      renderer.render(component);
      
      // Wait for result
      return await new Promise<T>((resolve, reject) => {
        component.props.onSubmit = resolve;
        component.props.onCancel = () => reject(new CancelError());
      });
    } finally {
      // Restore cursor and cleanup
      this.terminal.cursor.restore();
      this.terminal.screen.clearDown();
      await this.terminal.close();
    }
  }
}

// Prompt implementations
export const prompts = {
  async text(options: TextPromptOptions): Promise<string> {
    const value = signal(options.default || '');
    const error = signal<string | null>(null);
    
    const component = aura('box', {
      children: [
        aura('text', { 
          value: options.message,
          style: { fg: 'cyan', bold: true }
        }),
        aura('input', {
          value,
          placeholder: options.placeholder,
          validate: async (val) => {
            if (options.validate) {
              const result = await options.validate(val);
              if (result !== true) {
                error.set(typeof result === 'string' ? result : 'Invalid input');
                return false;
              }
            }
            error.set(null);
            return true;
          },
          onSubmit: (val) => component.props.onSubmit(val)
        }),
        aura('text', {
          value: () => error() || '',
          style: { fg: 'red' },
          hidden: () => !error()
        })
      ]
    });
    
    const renderer = new PromptRenderer(options);
    return renderer.render(component);
  },
  
  async select<T>(options: SelectPromptOptions<T>): Promise<T> {
    const selected = signal<T | null>(null);
    
    const component = aura('box', {
      children: [
        aura('text', {
          value: options.message,
          style: { fg: 'cyan', bold: true }
        }),
        aura('select', {
          options: options.options,
          value: selected,
          variant: 'list',
          onSelect: (val) => {
            selected.set(val);
            component.props.onSubmit(val);
          }
        })
      ]
    });
    
    const renderer = new PromptRenderer(options);
    return renderer.render(component);
  },
  
  async confirm(options: ConfirmPromptOptions): Promise<boolean> {
    return prompts.select({
      ...options,
      options: [
        { value: true, label: options.yes || 'Yes' },
        { value: false, label: options.no || 'No' }
      ],
      default: options.default
    });
  },
  
  async multiselect<T>(options: MultiSelectPromptOptions<T>): Promise<T[]> {
    const selected = signal<T[]>(options.default || []);
    
    const component = aura('box', {
      children: [
        aura('text', {
          value: options.message,
          style: { fg: 'cyan', bold: true }
        }),
        aura('select', {
          options: options.options,
          value: selected,
          multiple: true,
          variant: 'checkbox',
          min: options.min,
          max: options.max,
          onSelect: (val) => {
            selected.set(val);
          }
        }),
        aura('text', {
          value: () => `Selected: ${selected().length}`,
          style: { fg: 'gray' }
        }),
        aura('text', {
          value: 'Press Enter to confirm, Escape to cancel',
          style: { fg: 'gray', italic: true }
        })
      ],
      onKey: (event) => {
        if (event.key === 'Enter') {
          component.props.onSubmit(selected());
        }
      }
    });
    
    const renderer = new PromptRenderer(options);
    return renderer.render(component);
  },
  
  // Group prompts with dependencies
  async group<T extends Record<string, any>>(
    prompts: PromptGroup<T>,
    options?: GroupOptions
  ): Promise<T> {
    const results = {} as T;
    
    for (const [key, promptFn] of Object.entries(prompts)) {
      try {
        // Pass previous results for conditional prompts
        const prompt = typeof promptFn === 'function' 
          ? promptFn({ results }) 
          : promptFn;
        
        if (prompt) {
          results[key] = await prompt;
        }
      } catch (error) {
        if (error instanceof CancelError && options?.onCancel) {
          options.onCancel();
        }
        throw error;
      }
    }
    
    return results;
  }
};
```

### **Этап 8: Продвинутые компоненты (4-5 дней)**

#### 8.1. Table Component (День 20-21)
```typescript
// src/components/data/table.ts
class TableComponent {
  private sortColumns: SortColumn[] = [];
  private filters: Map<string, Filter> = new Map();
  private selection = new Set<number>();
  private currentPage = 0;
  
  constructor(private props: TableProps) {
    // Initialize from props
  }
  
  private processData(): any[] {
    let data = [...this.props.data()];
    
    // Apply filters
    if (this.props.filterable) {
      data = this.applyFilters(data);
    }
    
    // Apply sorting
    if (this.props.sortable) {
      data = this.applySorting(data);
    }
    
    // Apply pagination
    if (this.props.paginate) {
      const pageSize = this.props.paginate.pageSize;
      const start = this.currentPage * pageSize;
      data = data.slice(start, start + pageSize);
    }
    
    return data;
  }
  
  render(ctx: RenderContext) {
    const data = this.processData();
    
    // Calculate column widths
    const columnWidths = this.calculateColumnWidths(ctx.width);
    
    // Render header
    this.renderHeader(ctx, columnWidths);
    
    // Render rows with virtualization
    if (this.props.virtualize) {
      this.renderVirtualized(ctx, data, columnWidths);
    } else {
      this.renderRows(ctx, data, columnWidths);
    }
    
    // Render footer with pagination
    if (this.props.paginate) {
      this.renderPagination(ctx);
    }
  }
  
  private renderHeader(ctx: RenderContext, widths: number[]) {
    let x = ctx.x;
    
    this.props.columns.forEach((column, i) => {
      // Column header with sort indicator
      let header = column.header;
      
      if (this.props.sortable) {
        const sortColumn = this.sortColumns.find(s => s.key === column.key);
        if (sortColumn) {
          header += sortColumn.direction === 'asc' ? ' ▲' : ' ▼';
        }
      }
      
      ctx.buffer.writeText(
        x, ctx.y,
        truncate(header, widths[i]),
        { bold: true, fg: ctx.theme.colors.primary }
      );
      
      x += widths[i] + 1; // +1 for separator
    });
    
    // Header separator
    ctx.y++;
    ctx.buffer.writeText(
      ctx.x, ctx.y,
      '─'.repeat(ctx.width),
      { fg: ctx.theme.colors.border }
    );
    ctx.y++;
  }
  
  private renderRows(ctx: RenderContext, data: any[], widths: number[]) {
    data.forEach((row, rowIndex) => {
      let x = ctx.x;
      const isSelected = this.selection.has(rowIndex);
      const style = isSelected ? { inverse: true } : {};
      
      this.props.columns.forEach((column, colIndex) => {
        const value = column.accessor(row);
        const formatted = column.format ? column.format(value) : String(value);
        
        // Handle editable cells
        if (this.props.editable && column.editable) {
          // Render as input on edit
        } else {
          ctx.buffer.writeText(
            x, ctx.y,
            truncate(formatted, widths[colIndex]),
            style
          );
        }
        
        x += widths[colIndex] + 1;
      });
      
      ctx.y++;
      
      // Expandable row
      if (this.props.expandable && this.expandedRows.has(rowIndex)) {
        const expanded = this.props.expandable(row);
        // Render expanded content
        ctx.y += this.renderExpanded(ctx, expanded);
      }
    });
  }
}
```

#### 8.2. Chart Component (День 22-23)
```typescript
// src/components/charts/chart.ts
class ChartComponent {
  private canvas: CanvasBuffer;
  
  constructor(private props: ChartProps) {
    this.canvas = new CanvasBuffer(props.width, props.height);
  }
  
  render(ctx: RenderContext) {
    switch (this.props.type) {
      case 'line':
        this.renderLineChart();
        break;
      case 'bar':
        this.renderBarChart();
        break;
      case 'pie':
        this.renderPieChart();
        break;
      // ... other types
    }
    
    // Convert canvas to terminal characters
    this.canvas.render(ctx.buffer);
  }
  
  private renderLineChart() {
    const data = this.props.data();
    const { width, height } = this.canvas;
    
    // Calculate scales
    const xScale = createScale(
      [0, data.length - 1],
      [0, width - 1]
    );
    const yScale = createScale(
      [Math.min(...data), Math.max(...data)],
      [height - 1, 0]
    );
    
    // Draw axes
    this.drawAxes(xScale, yScale);
    
    // Draw line
    for (let i = 0; i < data.length - 1; i++) {
      const x1 = xScale(i);
      const y1 = yScale(data[i]);
      const x2 = xScale(i + 1);
      const y2 = yScale(data[i + 1]);
      
      this.canvas.drawLine(x1, y1, x2, y2, {
        char: '─',
        style: { fg: this.props.color || 'blue' }
      });
    }
    
    // Draw points
    if (this.props.showPoints) {
      data.forEach((value, i) => {
        const x = xScale(i);
        const y = yScale(value);
        this.canvas.setPixel(x, y, '●', {
          fg: this.props.pointColor || 'red'
        });
      });
    }
    
    // Interactive tooltip
    if (this.props.interactive) {
      this.setupInteractivity();
    }
  }
  
  private renderBarChart() {
    const data = this.props.data();
    const { width, height } = this.canvas;
    const barWidth = Math.floor(width / data.length);
    
    // Calculate scale
    const maxValue = Math.max(...data);
    const scale = (height - 1) / maxValue;
    
    data.forEach((value, i) => {
      const barHeight = Math.round(value * scale);
      const x = i * barWidth;
      
      // Draw bar
      for (let y = height - 1; y >= height - barHeight; y--) {
        for (let dx = 0; dx < barWidth - 1; dx++) {
          this.canvas.setPixel(x + dx, y, '█', {
            fg: this.getBarColor(value, i)
          });
        }
      }
      
      // Draw value label
      if (this.props.showValues) {
        const label = String(value);
        const labelX = x + Math.floor((barWidth - label.length) / 2);
        const labelY = height - barHeight - 1;
        
        this.canvas.writeText(labelX, labelY, label, {
          fg: 'white',
          bold: true
        });
      }
    });
  }
}
```

### **Этап 9: Виртуализация и оптимизации (2-3 дня)**

#### 9.1. Virtual List (День 24)
```typescript
// src/components/optimized/virtual-list.ts
class VirtualList<T> {
  private scrollTop = 0;
  private visibleStart = 0;
  private visibleEnd = 0;
  private itemHeights = new Map<number, number>();
  private averageHeight = 0;
  
  constructor(
    private props: VirtualListProps<T>
  ) {
    this.calculateVisible();
  }
  
  private calculateVisible() {
    const { items, height, overscan = 3 } = this.props;
    
    if (this.props.itemHeight) {
      // Fixed height - simple calculation
      const itemHeight = this.props.itemHeight;
      this.visibleStart = Math.floor(this.scrollTop / itemHeight);
      this.visibleEnd = Math.ceil((this.scrollTop + height) / itemHeight);
    } else {
      // Dynamic height - use estimated sizes
      let accumulatedHeight = 0;
      let start = -1;
      let end = -1;
      
      for (let i = 0; i < items.length; i++) {
        const itemHeight = this.getItemHeight(i);
        
        if (start === -1 && accumulatedHeight + itemHeight > this.scrollTop) {
          start = i;
        }
        
        if (accumulatedHeight > this.scrollTop + height) {
          end = i;
          break;
        }
        
        accumulatedHeight += itemHeight;
      }
      
      this.visibleStart = Math.max(0, start);
      this.visibleEnd = Math.min(items.length, end);
    }
    
    // Add overscan
    this.visibleStart = Math.max(0, this.visibleStart - overscan);
    this.visibleEnd = Math.min(items.length, this.visibleEnd + overscan);
  }
  
  private getItemHeight(index: number): number {
    if (this.props.itemHeight) {
      return this.props.itemHeight;
    }
    
    if (this.itemHeights.has(index)) {
      return this.itemHeights.get(index)!;
    }
    
    if (this.props.estimateSize) {
      return this.props.estimateSize(index);
    }
    
    return this.averageHeight || 1;
  }
  
  private measureItem(index: number, element: AuraNode) {
    if (this.props.itemHeight) return;
    
    // Measure actual rendered height
    const height = measureElement(element);
    this.itemHeights.set(index, height);
    
    // Update average
    const totalHeight = Array.from(this.itemHeights.values())
      .reduce((sum, h) => sum + h, 0);
    this.averageHeight = totalHeight / this.itemHeights.size;
  }
  
  handleScroll(delta: number) {
    const oldScrollTop = this.scrollTop;
    this.scrollTop = Math.max(0, 
      Math.min(this.getTotalHeight() - this.props.height, 
        this.scrollTop + delta
      )
    );
    
    if (this.scrollTop !== oldScrollTop) {
      this.calculateVisible();
      markDirty(this);
    }
  }
  
  render(ctx: RenderContext) {
    const { items, renderItem } = this.props;
    const visibleItems = items.slice(this.visibleStart, this.visibleEnd);
    
    // Calculate offset for first visible item
    let offsetY = 0;
    for (let i = 0; i < this.visibleStart; i++) {
      offsetY += this.getItemHeight(i);
    }
    offsetY -= this.scrollTop;
    
    // Render visible items
    let y = ctx.y + offsetY;
    visibleItems.forEach((item, i) => {
      const index = this.visibleStart + i;
      const element = renderItem(item, index);
      
      // Render item
      const itemCtx = { ...ctx, y };
      const result = renderElement(element, itemCtx);
      
      // Measure if needed
      this.measureItem(index, element);
      
      y += result.height;
    });
    
    // Render scrollbar
    this.renderScrollbar(ctx);
  }
  
  private renderScrollbar(ctx: RenderContext) {
    const totalHeight = this.getTotalHeight();
    if (totalHeight <= this.props.height) return;
    
    const scrollbarHeight = Math.max(1, 
      Math.floor(this.props.height * this.props.height / totalHeight)
    );
    const scrollbarY = Math.floor(
      this.scrollTop * (this.props.height - scrollbarHeight) / 
      (totalHeight - this.props.height)
    );
    
    // Draw scrollbar track
    for (let y = 0; y < this.props.height; y++) {
      ctx.buffer.writeText(
        ctx.x + ctx.width - 1,
        ctx.y + y,
        '│',
        { fg: 'gray' }
      );
    }
    
    // Draw scrollbar thumb
    for (let y = 0; y < scrollbarHeight; y++) {
      ctx.buffer.writeText(
        ctx.x + ctx.width - 1,
        ctx.y + scrollbarY + y,
        '█',
        { fg: 'white' }
      );
    }
  }
}
```

### **Этап 10: Тестирование (3-4 дня)**

#### 10.1. Testing Library (День 25-26)
```typescript
// src/testing/index.ts
export function render(
  element: AuraNode,
  options?: RenderOptions
): RenderResult {
  const container = createTestContainer(options);
  const renderer = new AuraRenderer(container.stream);
  
  renderer.render(element);
  
  return {
    container,
    rerender: (element) => renderer.render(element),
    unmount: () => renderer.unmount(),
    debug: () => console.log(container.getOutput()),
    // Query functions
    getByText: (text) => findByText(container, text),
    getByRole: (role) => findByRole(container, role),
    getByTestId: (id) => findByTestId(container, id),
    // Async queries
    findByText: (text) => waitFor(() => findByText(container, text)),
    // Events
    fireEvent,
    // Snapshot
    toJSON: () => container.toJSON()
  };
}

export const screen = {
  getByText: (text: string) => {
    const current = getCurrentContainer();
    return findByText(current, text);
  },
  // ... other queries
};

export function fireEvent(
  element: AuraElement,
  event: Event
) {
  // Trigger event on element
  element.handleEvent(event);
  
  // Flush effects
  flushEffects();
  
  // Wait for re-render
  return waitForNextUpdate();
}

// Testing utilities
export async function waitFor<T>(
  callback: () => T,
  options?: WaitOptions
): Promise<T> {
  const { timeout = 1000, interval = 50 } = options || {};
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      const result = callback();
      if (result) return result;
    } catch (error) {
      // Continue waiting
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error('Timeout waiting for condition');
}
```

#### 10.2. Test Examples (День 27)
```typescript
// examples/tests/counter.test.ts
import { test, expect } from 'vitest';
import { render, fireEvent, screen } from '@aura/testing';
import { Counter } from '../components/Counter';

test('Counter increments when + button is clicked', async () => {
  const { container } = render(Counter());
  
  // Initial state
  expect(screen.getByText('Count: 0')).toBeTruthy();
  
  // Click increment
  const incrementBtn = screen.getByText('+');
  await fireEvent.key(incrementBtn, { key: 'Enter' });
  
  // Updated state
  expect(screen.getByText('Count: 1')).toBeTruthy();
  
  // Snapshot
  expect(container).toMatchSnapshot();
});

test('Counter handles keyboard navigation', async () => {
  render(Counter());
  
  // Tab to increment button
  await fireEvent.key(document, { key: 'Tab' });
  expect(screen.getByText('+')).toHaveFocus();
  
  // Tab to decrement button
  await fireEvent.key(document, { key: 'Tab' });
  expect(screen.getByText('-')).toHaveFocus();
});
```

### **Этап 11: Интеграция и полировка (3-4 дня)**

#### 11.1. App Container (День 28)
```typescript
// src/app.ts
export class AuraApp {
  private renderer: AuraRenderer;
  private terminal: Terminal;
  private rootElement?: AuraNode;
  
  constructor(
    private config: AppConfig
  ) {
    this.terminal = new Terminal(config.terminal);
    this.renderer = new AuraRenderer(this.terminal.stream);
  }
  
  async run(element: AuraNode | (() => AuraNode)) {
    await this.terminal.init();
    
    // Setup error boundary
    const wrapped = this.wrapWithErrorBoundary(element);
    
    // Setup hot reload in dev
    if (this.config.debug) {
      this.setupHotReload();
    }
    
    // Initial render
    this.rootElement = typeof element === 'function' ? element() : element;
    this.renderer.render(this.rootElement);
    
    // Setup event handlers
    this.setupEventHandlers();
    
    // Wait for exit
    await this.waitForExit();
    
    // Cleanup
    await this.cleanup();
  }
  
  private setupEventHandlers() {
    // Keyboard
    this.terminal.events.on('key', (event) => {
      this.handleKeyEvent(event);
    });
    
    // Mouse
    if (this.config.terminal?.mouse) {
      this.terminal.events.on('mouse', (event) => {
        this.handleMouseEvent(event);
      });
    }
    
    // Resize
    this.terminal.events.on('resize', (rows, cols) => {
      this.handleResize(rows, cols);
    });
    
    // Graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }
  
  private handleKeyEvent(event: KeyEvent) {
    // Global shortcuts
    if (event.ctrl && event.key === 'c') {
      this.shutdown();
      return;
    }
    
    if (this.config.debug && event.ctrl && event.key === 'd') {
      this.openDevTools();
      return;
    }
    
    // Route to focused element
    const focused = this.renderer.getFocusedElement();
    if (focused?.props.onKey) {
      const handled = focused.props.onKey(event);
      if (!handled) {
        // Bubble up
        this.bubbleEvent(focused, 'onKey', event);
      }
    }
  }
}
```

#### 11.2. DevTools (День 29)
```typescript
// src/devtools/index.ts
export class AuraDevTools {
  private server?: Server;
  private ws?: WebSocket;
  
  async start(port = 9229) {
    // Start WebSocket server
    this.server = createServer();
    this.ws = new WebSocketServer({ server: this.server });
    
    this.ws.on('connection', (socket) => {
      this.handleConnection(socket);
    });
    
    this.server.listen(port);
    console.log(`Aura DevTools listening on ws://localhost:${port}`);
  }
  
  private handleConnection(socket: WebSocket) {
    // Send initial state
    socket.send(JSON.stringify({
      type: 'init',
      data: {
        componentTree: this.getComponentTree(),
        state: this.getState(),
        performance: this.getPerformanceMetrics()
      }
    }));
    
    // Subscribe to updates
    this.renderer.on('update', () => {
      socket.send(JSON.stringify({
        type: 'update',
        data: this.getComponentTree()
      }));
    });
    
    // Handle commands from DevTools
    socket.on('message', (message) => {
      const command = JSON.parse(message.toString());
      this.handleCommand(command);
    });
  }
  
  private getComponentTree(): ComponentTreeNode {
    // Traverse fiber tree and build DevTools tree
    return traverseFiberTree(this.renderer.rootFiber, (fiber) => ({
      type: fiber.type,
      props: sanitizeProps(fiber.props),
      state: fiber.hooks?.map(h => h.state),
      children: []
    }));
  }
}
```

### **Этап 12: Документация и примеры (2-3 дня)**

#### 12.1. Примеры приложений (День 30)
```typescript
// examples/todo-app.ts
import { aura, signal, computed, effect } from '@aura/core';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

function TodoApp() {
  const todos = signal<Todo[]>([]);
  const filter = signal<'all' | 'active' | 'completed'>('all');
  const inputValue = signal('');
  
  const filteredTodos = computed(() => {
    const items = todos();
    const f = filter();
    
    if (f === 'active') return items.filter(t => !t.completed);
    if (f === 'completed') return items.filter(t => t.completed);
    return items;
  });
  
  const stats = computed(() => {
    const items = todos();
    return {
      total: items.length,
      active: items.filter(t => !t.completed).length,
      completed: items.filter(t => t.completed).length
    };
  });
  
  const addTodo = () => {
    const text = inputValue().trim();
    if (!text) return;
    
    todos.update(items => [...items, {
      id: Date.now(),
      text,
      completed: false
    }]);
    inputValue.set('');
  };
  
  const toggleTodo = (id: number) => {
    todos.update(items => items.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };
  
  const deleteTodo = (id: number) => {
    todos.update(items => items.filter(todo => todo.id !== id));
  };
  
  return aura('flex', {
    direction: 'column',
    padding: 2,
    gap: 1,
    children: [
      // Header
      aura('text', {
        value: '📝 Todo App',
        style: { fg: 'cyan', bold: true }
      }),
      
      // Input
      aura('flex', {
        direction: 'row',
        gap: 1,
        children: [
          aura('input', {
            value: inputValue,
            placeholder: 'What needs to be done?',
            flex: 1,
            onSubmit: addTodo
          }),
          aura('button', {
            label: 'Add',
            variant: 'primary',
            onKey: (e) => e.key === 'Enter' && addTodo()
          })
        ]
      }),
      
      // Filters
      aura('flex', {
        direction: 'row',
        gap: 2,
        children: [
          aura('button', {
            label: `All (${stats().total})`,
            variant: () => filter() === 'all' ? 'primary' : 'default',
            onKey: () => filter.set('all')
          }),
          aura('button', {
            label: `Active (${stats().active})`,
            variant: () => filter() === 'active' ? 'primary' : 'default',
            onKey: () => filter.set('active')
          }),
          aura('button', {
            label: `Completed (${stats().completed})`,
            variant: () => filter() === 'completed' ? 'primary' : 'default',
            onKey: () => filter.set('completed')
          })
        ]
      }),
      
      // Todo list
      aura('list', {
        items: filteredTodos,
        flex: 1,
        renderItem: (todo) => aura('flex', {
          direction: 'row',
          gap: 1,
          alignItems: 'center',
          children: [
            aura('text', {
              value: todo.completed ? '☑' : '☐',
              style: { fg: todo.completed ? 'green' : 'gray' },
              focusable: true,
              onKey: () => toggleTodo(todo.id)
            }),
            aura('text', {
              value: todo.text,
              flex: 1,
              style: todo.completed ? {
                strikethrough: true,
                fg: 'gray'
              } : {}
            }),
            aura('button', {
              label: '×',
              variant: 'danger',
              onKey: () => deleteTodo(todo.id)
            })
          ]
        })
      }),
      
      // Footer
      aura('text', {
        value: () => {
          const s = stats();
          return `${s.active} active, ${s.completed} completed`;
        },
        style: { fg: 'gray', italic: true }
      })
    ]
  });
}

// Run the app
Aura.createApp(TodoApp).run();
```

### **Валидация и метрики успеха**

#### Критерии готовности каждого этапа:
1. **Покрытие тестами**: >90% для критических путей
2. **Производительность**: <16ms на кадр для анимаций
3. **Память**: <50MB для типичного приложения
4. **Типобезопасность**: Нет any в публичном API
5. **Документация**: Все публичные API задокументированы

#### Метрики производительности:
- Initial render: <100ms для 1000 элементов
- Re-render: <16ms для обновления 100 элементов
- Memory: O(n) где n - количество видимых элементов
- Input latency: <50ms от нажатия до отклика

#### Интеграционные тесты:
- Совместимость с TRM
- Работа в разных терминалах
- Поддержка SSH сессий
- Работа в Docker контейнерах

### **Риски и митигация**

1. **Производительность рендеринга**
   - Риск: Тормоза при большом количестве элементов
   - Митигация: Виртуализация, батчинг, дифференциальные обновления

2. **Совместимость терминалов**
   - Риск: Разное поведение в разных эмуляторах
   - Митигация: Graceful degradation, feature detection

3. **Сложность API**
   - Риск: Крутая кривая обучения
   - Митигация: Примеры, пошаговые туториалы, хорошие сообщения об ошибках

4. **Размер бандла**
   - Риск: Большой размер для CLI инструментов
   - Митигация: Tree shaking, ленивая загрузка компонентов

Дата последнего обновления: август 11, 2025