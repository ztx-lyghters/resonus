/**
 * Fuente global de la interfaz. React Native no hereda `fontFamily` a nivel de
 * app y su `Text` (RN 0.83) es un componente de función sin `render` ni
 * `defaultProps` (React 19 los quitó), así que no se puede parchear el
 * componente. En su lugar se envuelve el runtime JSX (`jsx`/`jsxs` y su
 * variante de desarrollo `jsxDEV`): cada vez que se crea un `<Text>` o
 * `<TextInput>` se le inyecta la familia elegida por debajo de su estilo (el
 * estilo propio gana; ninguno fija `fontFamily`, así que la familia manda).
 *
 * La familia se lee de una variable de módulo en cada creación de elemento, de
 * modo que cambiar el ajuste la aplica a todo lo que se vuelva a pintar. Con la
 * opción por defecto (`undefined`) no se toca nada: fuente del sistema tal cual.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { Text, TextInput } from 'react-native';

let currentFamily: string | undefined;
let installed = false;

/** Cambia la fuente global. `undefined` = fuente por defecto del sistema. */
export function setAppFont(family: string | undefined): void {
  currentFamily = family || undefined;
}

/** Envuelve una función `jsx(type, props, ...rest)` para inyectar la fuente. */
function wrapJsx(orig: (...args: any[]) => any) {
  return function wrapped(type: unknown, props: any, ...rest: any[]) {
    if (currentFamily && (type === Text || type === TextInput) && props) {
      props = { ...props, style: [{ fontFamily: currentFamily }, props.style] };
    }
    return orig(type, props, ...rest);
  };
}

/** Aplica el envoltorio a un módulo de runtime JSX ya requerido. */
function patchRuntime(rt: any): void {
  if (!rt) return;
  if (typeof rt.jsx === 'function') rt.jsx = wrapJsx(rt.jsx);
  if (typeof rt.jsxs === 'function') rt.jsxs = wrapJsx(rt.jsxs);
  if (typeof rt.jsxDEV === 'function') rt.jsxDEV = wrapJsx(rt.jsxDEV);
}

/** Instala el envoltorio una sola vez, sobre los dos runtimes posibles.
 * Requires literales: Metro no resuelve `require` con variable. */
export function installAppFont(): void {
  if (installed) return;
  installed = true;
  try {
    patchRuntime(require('react/jsx-runtime'));
  } catch {
    // Sin runtime de producción (p. ej. en dev): se ignora.
  }
  try {
    patchRuntime(require('react/jsx-dev-runtime'));
  } catch {
    // Sin runtime de desarrollo (p. ej. en producción): se ignora.
  }
}
