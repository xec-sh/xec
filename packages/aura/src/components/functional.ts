/**
 * Functional Component Support
 * Provides React-like functional components for Aura without wrapper overhead
 */

import type { ComponentProps } from '../component.js';
import type { AnyAuraElement } from '../app/types.js';

/**
 * Functional component function type
 */
export type FunctionalComponentFn = () => AnyAuraElement | AnyAuraElement[] | null | undefined;

/**
 * Props for functional components
 */
export interface FunctionalComponentProps extends ComponentProps {
  fn: FunctionalComponentFn;
}

/**
 * Helper function to create a functional component element
 * 
 * Functional components are now handled directly by the reactive bridge
 * without creating a wrapper component instance, reducing overhead and
 * improving performance.
 * 
 * @example
 * ```typescript
 * const DynamicContent = Functional(() => {
 *   if (someSignal()) {
 *     return Box({ title: 'Active' }, Text({ value: 'Active content' }));
 *   } else {
 *     return Text({ value: 'Inactive' });
 *   }
 * });
 * ```
 */
export function Functional(
  fn: FunctionalComponentFn,
  props?: Omit<ComponentProps, 'fn'>
): AnyAuraElement {
  return {
    type: 'functional',
    props: {
      ...props,
      fn
    },
    children: undefined
  } as AnyAuraElement;
}

/**
 * Create a reactive component that re-renders when dependencies change
 * This is a more React-like API
 * 
 * @example
 * ```typescript
 * const MyComponent = Component(() => {
 *   const count = useSignal(0);
 *   
 *   return Box({},
 *     Text({ value: `Count: ${count()}` }),
 *     Button({ 
 *       label: 'Increment',
 *       onClick: () => count.set(count() + 1)
 *     })
 *   );
 * });
 * ```
 */
export function DynamicComponent(fn: FunctionalComponentFn): FunctionalComponentFn {
  return fn;
}

/**
 * Create a memoized functional component that only re-renders when its dependencies change
 * 
 * @example
 * ```typescript
 * const ExpensiveComponent = Memo(() => {
 *   // This will only re-render when its reactive dependencies change
 *   const data = computeExpensiveData();
 *   return Box({}, Text({ value: data }));
 * });
 * ```
 */
export function Memo(fn: FunctionalComponentFn): AnyAuraElement {
  return Functional(fn);
}

/**
 * Create a conditional component that renders based on a condition
 * 
 * @example
 * ```typescript
 * const ConditionalView = When(
 *   () => isLoggedIn(),
 *   () => UserDashboard(),
 *   () => LoginForm()
 * );
 * ```
 */
export function When(
  condition: () => boolean,
  whenTrue: FunctionalComponentFn,
  whenFalse?: FunctionalComponentFn
): AnyAuraElement {
  return Functional(() => {
    if (condition()) {
      return whenTrue();
    } else if (whenFalse) {
      return whenFalse();
    }
    return null;
  });
}

/**
 * Create a component that maps over an array reactively
 * 
 * @example
 * ```typescript
 * const ItemList = ForEach(
 *   () => items(),
 *   (item, index) => Box({ key: item.id }, Text({ value: item.name }))
 * );
 * ```
 */
export function ForEach<T>(
  items: () => T[],
  render: (item: T, index: number) => AnyAuraElement
): AnyAuraElement {
  return Functional(() => {
    const currentItems = items();
    return currentItems.map((item, index) => render(item, index));
  });
}

/**
 * Create a component that shows content while a condition is true
 * 
 * @example
 * ```typescript
 * const LoadingView = Show(
 *   () => isLoading(),
 *   () => Spinner()
 * );
 * ```
 */
export function Show(
  when: () => boolean,
  render: FunctionalComponentFn
): AnyAuraElement {
  return Functional(() => {
    if (when()) {
      return render();
    }
    return null;
  });
}

/**
 * Create a component that switches between multiple views based on a value
 * 
 * @example
 * ```typescript
 * const ViewSwitcher = Switch(
 *   () => currentView(),
 *   {
 *     'home': () => HomeView(),
 *     'settings': () => SettingsView(),
 *     'profile': () => ProfileView()
 *   },
 *   () => NotFoundView() // default
 * );
 * ```
 */
export function Switch<T extends string | number>(
  value: () => T,
  cases: Record<T, FunctionalComponentFn>,
  defaultCase?: FunctionalComponentFn
): AnyAuraElement {
  return Functional(() => {
    const currentValue = value();
    const caseRenderer = cases[currentValue];
    
    if (caseRenderer) {
      return caseRenderer();
    } else if (defaultCase) {
      return defaultCase();
    }
    
    return null;
  });
}