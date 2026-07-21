/**
 * i18n mínimo y reactivo. El texto en INGLÉS es la clave; cada idioma extra
 * tiene su diccionario JSON en `locales/` (clave inglesa → traducción).
 * `useT()` devuelve una función `t` ligada al idioma actual (del store de
 * ajustes), por lo que cambiar el idioma re-renderiza y traduce al vuelo.
 *
 * Para añadir un idioma nuevo (p. ej. 'fr'): ver la guía en TRANSLATING.md. En
 * resumen:
 *   1. Añádelo a `Language` en src/store/settings.ts (y a su `hydrate`).
 *   2. Crea `locales/fr.json` (clave inglesa → traducción) e impórtalo en `dictionaries`.
 *   3. Añade sus formas plurales a `PLURALS`; si su regla no es binaria
 *      (uno/resto), registra su función en `PLURAL_RULE`.
 *   4. Añade su opción a `LANGUAGES` en src/app/settings/language.tsx.
 * El inglés no necesita diccionario (es la clave); lo no traducido cae a él.
 */
import { useCallback } from 'react';

import { useSettings, type Language } from '@/store/settings';
import ca from './locales/ca.json';
import de from './locales/de.json';
import es from './locales/es.json';

/** Diccionarios por idioma. El inglés es la clave, así que no lleva tabla. */
const dictionaries: Partial<Record<Language, Record<string, string>>> = {
  ca,
  de,
  es,
};

type Vars = Record<string, string | number>;

function translate(text: string, lang: Language, vars?: Vars): string {
  const table = dictionaries[lang];
  let out = table?.[text] ?? text;
  if (vars) {
    for (const key of Object.keys(vars)) {
      out = out.split(`{${key}}`).join(String(vars[key]));
    }
  }
  return out;
}

/** Traducción fuera de componentes (p. ej. en stores). Lee el idioma actual. */
export function tg(text: string, vars?: Vars): string {
  return translate(text, useSettings.getState().language, vars);
}

export type TFunction = (text: string, vars?: Vars) => string;

/** Hook reactivo: devuelve `t` ligada al idioma actual. */
export function useT(): TFunction {
  const lang = useSettings((s) => s.language);
  return useCallback((text: string, vars?: Vars) => translate(text, lang, vars), [lang]);
}

/**
 * Formas plurales por idioma para los contadores. El inglés ('en') es
 * obligatorio (fallback); el resto son opcionales. Cada idioma da tantas formas
 * como categorías use su regla (ver `PLURAL_RULE`): 2 para en/es/ca/de
 * (uno/resto), 3 para idiomas como el ruso (one/few/many).
 */
const PLURALS: Record<string, Partial<Record<Language, string[]>>> = {
  song: { es: ['canción', 'canciones'], en: ['song', 'songs'], de: ['Titel', 'Titel'], ca: ['cançó', 'cançons'] },
  album: { es: ['álbum', 'álbumes'], en: ['album', 'albums'], de: ['Album', 'Alben'], ca: ['àlbum', 'àlbums'] },
};

/**
 * Regla de plural por idioma: dado `n`, devuelve el índice de forma en PLURALS.
 * Los idiomas que no estén aquí usan la binaria (uno / resto), correcta para
 * en/es/ca/de. Para añadir uno con más formas se registra su función aquí y se
 * dan sus formas en PLURALS.
 *
 * Ruso (cuando se añada 'ru'): 3 formas [one, few, many] y esta regla CLDR:
 *   const ru = (n: number) => {
 *     const d = n % 10, c = n % 100;
 *     if (d === 1 && c !== 11) return 0;                 // one:  1, 21, 31…
 *     if (d >= 2 && d <= 4 && (c < 12 || c > 14)) return 1; // few: 2–4, 22–24…
 *     return 2;                                          // many: 0, 5–20, 25…
 *   };
 */
const PLURAL_RULE: Partial<Record<Language, (n: number) => number>> = {};

function pluralIndex(lang: Language, n: number): number {
  const rule = PLURAL_RULE[lang];
  return rule ? rule(n) : n === 1 ? 0 : 1;
}

function countLabel(kind: keyof typeof PLURALS, n: number, lang: Language): string {
  const forms = PLURALS[kind][lang] ?? PLURALS[kind].en!;
  // Acota por si la regla pide un índice que ese idioma no rellenó.
  const idx = Math.min(pluralIndex(lang, n), forms.length - 1);
  return `${n} ${forms[idx]}`;
}

/** "N canción/canciones" (o su equivalente) según idioma. */
export function songsLabel(n: number, lang: Language): string {
  return countLabel('song', n, lang);
}

/** "N álbum/álbumes" (o su equivalente) según idioma. */
export function albumsLabel(n: number, lang: Language): string {
  return countLabel('album', n, lang);
}
