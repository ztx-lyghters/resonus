# Changelog

All notable changes to Resonus are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases before 0.2.1 are only listed on the
[GitHub releases page](https://github.com/juananzzz/resonus/releases).

## [Unreleased]

### Added

- Built-in equalizer, with the device's presets, a slider per band and a reset
  to flat (Quality & playback).
- Home sections can now be shown, hidden and reordered, with three new rows off
  by default: Discover (albums you played a while ago but not lately), Random
  albums and Random artists.
- The Home explore chips can now be shown, hidden and reordered too, and a new
  Shuffle chip plays random songs from your library straight away.
- Start mix on a song's ⋯ menu: the song plays at once and the queue keeps
  filling with music like it. The queue header shows a button to stop it.
- Shuffle button on the genre screen, to play a genre at random.
- Choose which actions appear in a song's ⋯ menu (Appearance).
- Configurable swipe actions on song rows, in both directions: add to queue,
  play next, add to favorites or open the options menu.
- Network settings: several server addresses with automatic switching.
- Choose what tapping the player cover does, including showing the lyrics in
  place.
- Lyrics entry in the player's ⋯ menu.
- Bulk downloads can be stopped, keeping whatever already finished, and they
  start downloading almost immediately instead of after a long scan.
- Browsing artists now shows a grid of artist cards with sorting by name,
  recently played, most played or random.
- Grid or list when browsing albums and artists, from a button in the header.
  Each screen remembers its own.
- Search when browsing albums: pull down at the top of the list to find an album
  anywhere in your library.
- Download an artist's whole discography from their page, with progress and the
  option to stop it.
- The Home greeting can be hidden, or replaced with your own text, under
  Appearance › Home › Greeting.
- More accent colors in the palette.

### Changed

- The "Show explore chips" switch is replaced by a switch per chip. If you had
  the chips hidden they stay hidden after updating.
- Online lyrics lookup is now on by default.
- The cover-tap and skip-button settings are now dropdowns instead of long
  lists of options.
- Only favorited albums can be pinned.
- Recently played now appears on Home in local mode, and an artist's Popular
  songs are ordered by your play count there.
- Settings screens no longer offer switches for things that don't exist in
  local mode.
- The artist's Popular songs line up with the rest of the lists instead of
  running edge to edge.
- The filter when browsing artists now stays out of the way until you pull down
  at the top of the list, the same gesture playlists and favorites use.
- The sleep timer fades the music out over its last seconds instead of cutting
  it dead.
- Download confirmations now estimate how much space they need, and say so when
  the device may not have enough.

### Fixed

- The accent color now repaints Settings immediately instead of waiting for you
  to leave and come back, and the toast's Undo, the error screen's Retry button
  and the login button no longer stay stuck on the default green.
- Settings dropdowns now open flush against their row instead of floating above
  it, and scroll when there isn't room.
- The artist Shuffle button now really shuffles instead of starting with the
  artist's top track every time.
- A mix no longer runs out quietly: it falls back to the artist's tracks and
  then to the genre, and it survives closing the app.
- Clearing the queue now stops a running mix instead of leaving it on but
  unable to grow.
- The artists grid in random order no longer reshuffles itself while music
  plays.
- The favorite heart no longer sticks on album rows after unfavoriting.
- Downloaded cover art now shows offline in server mode.
- Long-pressing a song to enter multi-select now keeps that song selected.
- Bigger tap target on the song row's ⋯ button.
- German and Catalan translations for the newest screens.
- The Autoplay setting no longer claims something a mix contradicts.

## [0.3.1] - 2026-07-12

### Added

- Separate streaming quality for Wi-Fi and mobile data, with new 96 and 64 kbps
  options for tighter data caps.
- Skip back/forward buttons in the player, with a choice of 5, 10 or 30 seconds
  (off by default).
- Press and hold the play button to stop and clear the current playback.
- Setting to show or hide the explore chips on Home.

### Changed

- Reorganized Settings into clearer sections across Player, Quality & playback,
  Downloads, Library and Appearance, with Font moved to its own screen.
- The add-to-playlist sheet is now taller so long playlist lists aren't cramped.

### Fixed

- Downloaded songs now play from disk in server mode, so downloads work
  offline.
- Sorting a playlist by album now respects disc numbers on multi-disc albums
  instead of interleaving tracks.
- The colored-lyrics setting is now honored by the lyrics card in the player,
  not just the full-screen lyrics.
- The player rating row no longer pushes content off screen when every element
  is enabled.
- The keyboard no longer covers the search bar on the add-to-favorites screen.
- Centered the sort chip labels on the Albums screen.

[0.3.1]: https://github.com/juananzzz/resonus/releases/tag/v0.3.1

## [0.3.0] - 2026-07-11

### Added

- Reorder playlists by dragging, with per-list sort options (Custom / Recent)
  that are remembered.
- Haptic feedback on key actions (off by default, under Appearance).
- App font picker with six fonts, including Typewriter and Casual.
- Folder browsing for Subsonic servers (optional, in Settings).
- Search inside playlists and favorites by pulling down at the top of the list.
- Add-to-favorites screen to star your most played, recent or suggested songs
  in batch.
- Multi-select in playlists, favorites and albums, with undo for destructive
  actions.
- An "Appears on" section on the artist screen.
- ReplayGain volume normalization.
- Change playlist covers from the fullscreen viewer, marquee titles in the mini
  player, queue whole albums or playlists from their menu, a keep-screen-on
  option, a download-over-Wi-Fi-only setting, and more visibility toggles in
  Settings.
- Catalan translation.

### Changed

- Playlists default to Custom sort, like Spotify.
- Song duration is hidden in lists by default.

### Fixed

- Tapping a lyrics line to seek now responds reliably, and the auto-scroll
  animates smoothly on phones with reduced system animations.
- Seeking in transcoded streams.
- The audio quality badge reflects the transcoded stream instead of the source
  file.
- The mini player's dynamic color now matches the player screen.
- Honest scrobbling: correct now-playing updates and Last.fm threshold.

[0.3.0]: https://github.com/juananzzz/resonus/releases/tag/v0.3.0

## [0.2.2] - 2026-07-07

### Added

- Per-library visibility toggles for multi-library servers: pick which
  Navidrome libraries appear across the app (Home, Library, Search, Favorites).
- 1–5 star rating bar in the player (opt-in; off by default).
- Grid view mode for the Library.
- New Theme settings section with an accent color picker.
- German translation.
- Loading skeletons on the Genres screen and the browse and home album/artist
  lists.

### Changed

- The audio quality label is now a player-only toggle instead of appearing on
  every song row.
- Audio fades in and out when you pause or resume inside the app.
- More breathing room between the settings section rows.

### Fixed

- Shuffle play could show a different track than the one actually playing, and
  the shuffle button stayed lit on unrelated albums and playlists.
- The About screen no longer labels the version as beta.

### Removed

- Chromecast support, removing the last proprietary dependency (a step toward
  F-Droid). Casting to UPnP/DLNA devices is unaffected.

[0.2.2]: https://github.com/juananzzz/resonus/releases/tag/v0.2.2

## [0.2.1] - 2026-07-06

### Added

- Tap the cover art in the player to open the full-screen lyrics.
- Artist picker for songs and albums with more than one artist.
- Loading skeleton for the genre cards in Search.

### Changed

- Reworked the mini player gestures: swipe down to dismiss, swipe sideways to
  skip tracks.
- Split the queue into clear sections (now playing, next in queue, next from
  the source).
- Polished the lyrics screen with Apple Music-style line focus and previous /
  next controls.
- Full-screen lyrics now start centered instead of pinned to the top.
- Opening the lyrics now jumps straight to the current line instead of doing a
  fast scroll from the top.
- Softened the cover-derived background color so text and controls stay legible
  on any artwork.

[0.2.1]: https://github.com/juananzzz/resonus/releases/tag/v0.2.1
