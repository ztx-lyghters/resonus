# Translating Resonus

Thanks for helping translate Resonus! This guide covers how translations work,
how to add a language, and context for the strings that are easy to
misinterpret. If anything is still unclear, open an issue or ask on
[Discord](https://discord.gg/hpDfszr8r) — happy to help.

## How translations work

- The **English text is the key**. Each language has a JSON file in
  `src/i18n/locales/` mapping the English string to its translation.
- Anything not translated falls back to English, so a partial file is fine.
- `{name}`, `{n}`, etc. are **placeholders** — keep them exactly as-is; they get
  replaced at runtime. Only translate the words around them.
- JSON can't hold comments, so the per-string context lives in this file (see
  [String context](#string-context) below), not in the `.json`.

## Adding a new language

1. Add its code to `Language` in `src/store/settings.ts` (and to `hydrate`).
2. Create `src/i18n/locales/<code>.json` and import it in `dictionaries` in
   `src/i18n/index.ts`.
3. Add its plural forms to `PLURALS` in `src/i18n/index.ts` (see
   [Plurals](#plurals)).
4. Add it to `LANGUAGES` in `src/app/settings/language.tsx`.

## Adapt for what sounds natural

**A good translation reads naturally, it isn't literal.** If a word-for-word
translation would sound odd or raise eyebrows, adapt it — stay close to the
original *meaning*, not the original wording. You know your language better than
the English does.

For example, "Quick grid" or "chips" don't need to map to the literal words for
"grid"/"chip" if those sound wrong; an equivalent like "Quick access" is
perfectly fine, and unifying a couple of UI terms into one natural word is
welcome. When in doubt, prefer clarity for a native speaker.

## Plurals

Counted strings like "3 songs" use per-language plural forms, not a single
template, so each language can inflect the noun correctly.

- Most languages need **2 forms** (one / other): English, Spanish, Catalan,
  German are set up this way in `PLURALS`.
- Some need **more**. Russian, for instance, needs **3** (one / few / many).
  The system supports this: give as many forms as your language's rule uses in
  `PLURALS`, and register the rule in `PLURAL_RULE` (`src/i18n/index.ts`).

Russian rule (CLDR), for reference:

| Category | When | Example counts |
| --- | --- | --- |
| one  | `n%10 == 1 && n%100 != 11` | 1, 21, 31 |
| few  | `n%10` in 2–4 && `n%100` not in 12–14 | 2, 3, 4, 22 |
| many | everything else | 0, 5–20, 25 |

If a `{n}` string **baked into the JSON** (not one of the counted labels above)
doesn't inflect correctly in your language, **list it in your PR or an issue** —
we'll move it into the plural system so it can be inflected properly.

## Gendered / context-dependent words

A single English key sometimes maps to several words in another language
depending on gender or context. "Unknown", for example, may need different forms
for an unknown *artist* vs *album* vs *title*. If that's the case, ask and we'll
**split the key** (e.g. `Unknown artist`, `Unknown album`) so each can be
translated correctly.

## String context

Context for strings that are ambiguous out of context. This list grows as
questions come in — if a string tripped you up, tell us and we'll add it.

| String | Where / what it is |
| --- | --- |
| `Advanced` | Login screen: a link that expands the advanced connection options |
| `By track` / `By album` / `By artist` | Volume-normalization (ReplayGain) modes: even out loudness per track / album / artist (Settings → Playback) |
| `Custom` | The "Custom" equalizer preset (Settings → Equalizer). Not a bitrate |
| `Free` | **Free disk space**, in the storage-usage bar (Other / Downloads / Free). Not "free of charge" |
| `Other` | In that same bar: space used by **things other than** downloads |
| `Layout` | Setting for the **list vs grid** layout of lists |
| `Name` | The **Name** field when editing a playlist or radio station |
| `Next` / `Previous` | Player controls: **next / previous track** (accessibility labels) |
| `Next in queue` | Header in the Queue screen: the track playing next |
| `Now playing style` | Setting for the **visual style** of the player |
| `Off` | A setting value meaning **disabled** (crossfade, normalization…) |
| `More options` / `More` | The **⋯** button (more options) and a **"More"** (see more) action |
| `Show cover` | On the lyrics screen: button to **go back to the cover art** |
| `Offline · your downloads` | Settings subtitle shown in offline mode |
| `Nothing here is downloaded` | Toast when trying to play something that isn't downloaded (offline) |
| `Try exploring another genre.` | Empty-state subtitle on a genre screen |
| `Unknown` | Fallback for a missing artist / album / title |
| `Connect to your music server` | Login screen: subtitle inviting you to connect your self-hosted server |
