/**
 * Global UI font. React Native doesn't inherit `fontFamily` at the app level
 * and its `Text` (RN 0.83) is a function component without `render` or
 * `defaultProps` (React 19 removed them), so the component can't be patched.
 * Instead we wrap the JSX runtime (`jsx`/`jsxs` and its development variant
 * `jsxDEV`): every time a `<Text>` or `<TextInput>` is created, the chosen
 * family is injected below its own style (own style wins; none set
 * `fontFamily`, so the injected family applies).
 *
 * The family is read from a module variable on every element creation, so
 * changing the setting applies it to everything that gets re-painted. With
 * the default option (`undefined`) nothing is touched: system font as-is.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { Text, TextInput } from 'react-native';

let currentFamily: string | undefined;
let installed = false;

/** Sets the global font. `undefined` = system default font. */
export function setAppFont(family: string | undefined): void {
  currentFamily = family || undefined;
}

/** Wraps a `jsx(type, props, ...rest)` function to inject the font. */
function wrapJsx(orig: (...args: any[]) => any) {
  return function wrapped(type: unknown, props: any, ...rest: any[]) {
    if (currentFamily && (type === Text || type === TextInput) && props) {
      props = { ...props, style: [{ fontFamily: currentFamily }, props.style] };
    }
    return orig(type, props, ...rest);
  };
}

/** Applies the wrapper to an already-required JSX runtime module. */
function patchRuntime(rt: any): void {
  if (!rt) return;
  if (typeof rt.jsx === 'function') rt.jsx = wrapJsx(rt.jsx);
  if (typeof rt.jsxs === 'function') rt.jsxs = wrapJsx(rt.jsxs);
  if (typeof rt.jsxDEV === 'function') rt.jsxDEV = wrapJsx(rt.jsxDEV);
}

/** Installs the wrapper once, over both possible runtimes.
 * Requires literals: Metro can't resolve `require` with a variable. */
export function installAppFont(): void {
  if (installed) return;
  installed = true;
  try {
    patchRuntime(require('react/jsx-runtime'));
  } catch {
      // No production runtime (e.g. in dev): ignored.
  }
  try {
    patchRuntime(require('react/jsx-dev-runtime'));
  } catch {
      // No development runtime (e.g. in production): ignored.
  }
}
