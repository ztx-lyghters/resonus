/**
 * LRC format (lyrics with `[mm:ss.xx]` timestamps). Used for `.lrc` files
 * next to local music, embedded USLT lyrics (which often contain timestamps),
 * and for caching server or LRCLIB lyrics to disk.
 * Text without timestamps also works: returned as unsynced lyrics.
 */
import { type LyricLine, type SongLyrics } from '@/api/subsonic';

/** LRC metadata tags that are ignored (except `offset`, which is applied). */
const META_RE = /^\[(ar|ti|al|au|by|la|re|ve|tool|length|id|#):[^\]]*\]$/i;
const STAMP_RE = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/y;

export function parseLrc(text: string): SongLyrics | null {
  const timed: LyricLine[] = [];
  const plain: LyricLine[] = [];
  let offset = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (META_RE.test(line)) continue;
    const off = line.match(/^\[offset:\s*([+-]?\d+)\s*\]$/i);
    if (off) {
      offset = parseInt(off[1], 10) || 0;
      continue;
    }
    // Timestamps at the start (a line can have several: choruses).
    const starts: number[] = [];
    let pos = 0;
    for (;;) {
      STAMP_RE.lastIndex = pos;
      const m = STAMP_RE.exec(line);
      if (!m) break;
      const frac = m[3] ?? '';
      // 1 digit = tenths, 2 = hundredths, 3 = milliseconds.
      const ms = frac ? parseInt(frac, 10) * [100, 10, 1][frac.length - 1] : 0;
      starts.push((parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000 + ms);
      pos = STAMP_RE.lastIndex;
    }
    const value = line.slice(pos).trim();
    if (starts.length === 0) {
      plain.push({ value: line });
    } else {
      for (const start of starts) timed.push({ start, value });
    }
  }

  if (timed.length > 0) {
    // Positive `offset` = lyrics should appear earlier (same convention as
    // OpenSubsonic offset).
    timed.sort((a, b) => a.start! - b.start!);
    return {
      synced: true,
      lines: timed.map((l) => ({ ...l, start: Math.max(0, l.start! - offset) })),
    };
  }
  if (plain.length > 0) return { synced: false, lines: plain };
  return null;
}

/** Serializes to LRC text (or plain text if lyrics are unsynced). */
export function serializeLrc(lyrics: SongLyrics): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return lyrics.lines
    .map((l) => {
      if (!lyrics.synced || l.start === undefined) return l.value;
      const ms = Math.max(0, Math.round(l.start));
      const min = Math.floor(ms / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      const cs = Math.floor((ms % 1000) / 10);
      return `[${pad(min)}:${pad(sec)}.${pad(cs)}]${l.value}`;
    })
    .join('\n');
}
