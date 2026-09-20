# FretFlow development backlog

## 3.2-beta — current cleanup

Only the two items below belong in the remaining 3.2-beta work.

Do not add other features while completing 3.2-beta.

### [ ] 3.2-01 — Chord diagram barre model refactor

Replace the current explicit barre model with a position-only chord model.

#### Target model

A chord diagram uses `positions` only. Each ordinary position contains:

* string
* fret
* finger

The position shape is `{ string, fret, finger }`.

Strings use musical string numbers:

* 1 = high e
* 2 = B
* 3 = G
* 4 = D
* 5 = A
* 6 = low E

A barre is not stored as a separate musical element.

The renderer derives barres from the fingering.

#### Barre inference rule

Same finger + same fret + at least two directly adjacent strings = barre.

Examples:

* same finger on fret 1 across all six strings → one full barre
* same finger on fret 5 across three adjacent strings → mini-barre
* same finger on strings 1 and 6 with no matching positions between them → two separate dots
* same finger on strings 1–2 and 5–6 → two separate mini-barres

Only directly adjacent strings may be visually joined.

#### Multiple positions on one string

A string must support multiple positions.

Example:

String A:

* fret 1, finger 1
* fret 3, finger 3

The fret-1 position may belong to an underlying barre while fret 3 remains the visible higher finger position.

The Builder therefore edits positions only. Interpretation belongs to the shared renderer.

#### Builder UI

Remove the existing special barre controls.

For each string:

* edit fret + finger positions
* allow adding another position with `+`
* allow removing additional positions

There should be no separate:

* barre checkbox
* barre fret field
* barre finger field

The live preview must use the same shared chord renderer as the Viewer.

#### Backwards compatibility

Current 3.2-beta data uses schema 14 and may contain explicit barre data with:

* fret
* start string
* end string
* finger

Migration is deterministic.

Schema 15 is the current schema for this change. Builder version remains `3.2-beta`.

When opening any supported pre-15 data:

1. detect the old schema/model
2. convert ordinary `frets` / `fingers` entries into positions
3. convert every old barre into ordinary positions on all strings covered by that barre, using the same fret and finger
4. preserve multiple valid positions on the same string
5. deduplicate only exact `{string, fret, finger}` duplicates
6. remove dependence on `frets`, `fingers` and the old explicit `barres` representation
7. continue exclusively with the normalized positions-only current model
8. save only schema-15 positions-based chord data

No musical information may be guessed or discarded.

Do not add special fallback behaviour for hypothetical legacy barres without a finger. Existing valid FretFlow barre input includes a finger.

The `barre` chord category remains unchanged.

#### Renderer logic

Conceptually:

1. collect all fret/finger positions
2. group by fret + finger
3. sort each group by string
4. split into runs of directly adjacent strings
5. run of 2+ strings → render barre
6. single position → render ordinary dot
7. higher positions on a string remain visible over an underlying barre

Rendered barres keep their current visual design. This item changes how barres are represented and inferred, not how they look.

#### Acceptance criteria

* ordinary non-barre chords render unchanged
* full barres render correctly
* mini-barres render correctly
* multiple independent barres within one chord render correctly
* non-adjacent matching positions are not connected
* multiple positions on one string are preserved and rendered correctly
* existing schema-14 barre data migrates deterministically
* saved schema-15 data uses `positions` and contains no chord-diagram `frets`, `fingers` or `barres` properties
* Builder preview and Viewer agree
* existing supported older songbooks remain loadable

### [ ] 3.2-02 — Tablet portrait Viewer fit-to-screen

In tablet portrait, the Viewer currently leaves too much outer margin around the A4 page, making the music unnecessarily small.

Improve portrait fit-to-screen so the page uses more of the available viewport width.

#### Requirements

* reduce unnecessary outer Viewer margin/padding in portrait
* primarily target tablet portrait
* Viewer chrome may be adjusted
* preserve existing pinch zoom
* preserve existing double-tap zoom
* preserve existing Viewer navigation
* preserve existing single/spread functionality
* do not force spread mode on phones

#### Fixed invariant

The internal page remains exactly:

794 × 1123 px

Do not:

* reflow native components
* alter component proportions
* change the A4 layout
* introduce viewport-specific document layout

Only uniform whole-page scaling to the available viewport may change.

#### Acceptance criteria

* an A4 page occupies noticeably more usable width on a tablet in portrait
* page proportions remain unchanged
* native and PDF pages retain the same fixed A4 coordinate system
* pinch/double-tap behaviour still works
* desktop and landscape behaviour do not regress
* phone behaviour does not become worse

## 3.3-beta — current development

Amp presets are the first 3.3-beta implementation. Practice Player named sections
remain planned and are outside the Amp presets scope.

### [ ] 3.3-01 — Practice Player named sections

Add saved A/B loop sections to the Practice Player.

Examples:

* Intro
* Couplet
* Refrein
* Solo

Requirements:

* freely named sections
* dropdown in Practice Player
* selecting a section loads its saved A/B positions
* metadata belongs at tab/song level
* identical functionality for native and PDF tabs

### [x] 3.3-02 — Amp presets per tab/song

FretFlow 3.3-beta introduces one or more amp presets per song/tab as compact,
offline Viewer reference metadata. Amp presets are not native/PDF page content and
must not affect the fixed A4 layout.

Examples:

* Rhythm
* Solo
* Clean

#### Version and schema

* Builder version is `3.3-beta`.
* Current schema is 16.
* Schema-15 projects and all older supported schemas continue through the existing
  detection and deterministic normalization path.
* Missing amp data normalizes to `ampPresets: []`.
* After normalization, only the schema-16 representation is used and saved.

#### Current record model

Each native or PDF tab/song record has an `ampPresets` array. A preset contains:

* `label` — free text
* `ampType` — one of Acoustic, Clean, Crunch, Lead or Brown
* `gain`, `volume`, `bass`, `middle`, `treble` — integer knob values
* `boosterType` — one of Off, Clean Boost, Blues Drive, Overdrive, Distortion or Fuzz
* `boosterLevel`, `delay`, `reverb` — integer knob values
* `effects` — zero or more compact `{ type, level }` extra-effect settings; type is
  one of Chorus, Phaser, Flanger, Tremolo, Wah or Octave

All knob values use an internal normalized range of 0–100 and are rounded and
clamped safely during normalization. Physical angles and clock positions are not
stored. Missing `effects` data normalizes to an empty array. No effect-specific
parameters or generic amplifier/effects framework are part of this feature.

New presets start as Clean with the five basic amp/EQ values at 50, Booster Off
with level 0, and Delay and Reverb at 0. A newly added extra effect starts as
Chorus at level 50. Existing numeric values and recognized category strings are
preserved by normalization; unknown unreleased schema-16 category strings fall
back safely without discarding the surrounding preset.

#### Shared Amp Knob

* Use the authoritative `references/amp/fretflow_amp_knob_v2.svg` and interactive
  prototype geometry and styling.
* The dark knob body, min/max ticks, highlight and shadow remain static.
* Each fixed min/max tick uses a wider dark under-stroke plus the existing light
  foreground stroke so it remains readable on both light and dark backgrounds.
* Only the white pointer rotates around `(50, 48)`.
* Map 0–100 to the 270-degree sweep with
  `-135 + (value / 100) * 270`, so 0 is the left/lower stop, 50 points straight
  up and 100 is the right/lower stop.
* One reusable inline renderer is shared by Builder and Viewer. There is no
  runtime dependency on files under `references/`.

#### Builder editor

* The shared native/PDF metadata UI contains a compact Amp presets editor.
* Users can add and remove presets, freely edit the preset label, and choose amp
  and booster types from the fixed compact category lists.
* All eight knob values can be edited precisely from 0–100 with ordinary,
  accessible controls, and the approximately 60 px SVG preview updates live.
* Each preset offers progressive disclosure through `+ effect`: users can add,
  edit and individually remove multiple optional effect type/level rows, using
  the same live knob and precise input controls.
* Edits update normalized tab/song metadata; settings are never inferred or
  generated automatically.

#### Viewer tool and popup

* Embed the guitar-and-amplifier silhouette from `references/amp/amp_icon.svg`
  inline and adapt it to toolbar `currentColor` styling. The approved silhouette
  is rendered dark and slightly larger without a visible button background,
  border or shadow; its transparent 40 px button still provides a generous hit
  area.
* Show the Amp tool only when the active native or PDF tab has at least one
  preset. With no presets, the button does not exist/is not visible.
* Amp and the compact Spotify tool sit beside each other when both are present.
  Spotify's expanded Practice Player may slide over and obscure Amp; no permanent
  space is reserved and Spotify is not redesigned.
* Pressing Amp toggles a compact, non-persistent Viewer overlay which remains
  within the viewport and does not change page geometry or printing.
* Show the preset label; for multiple presets provide a compact selector using
  the free labels. Show amp type prominently and booster type when present.
* Show eight approximately 40 px knobs in this order: GAIN, VOLUME, BASS, MIDDLE,
  TREBLE, BOOST, DELAY, REVERB. Prefer a 4×2 grid where space permits.
* Keep that 4×2 core grid unchanged. When the selected preset has extra effects,
  show a compact wrapping `EXTRA EFFECTS` section below it with the effect type
  and the same 40 px knob; omit the section when `effects` is empty.
* The Viewer normally shows visual knob positions and short labels only. Hover,
  keyboard focus or a touch tap temporarily reveals the exact normalized value
  as a compact percentage tooltip for every core and extra-effect knob.
* Viewer knobs remain read-only focusable meters with an accessible control name
  and percentage value. A touch tap moves the one visible touch tooltip between
  knobs, while a tap elsewhere dismisses it without changing any setting.
* The popup is not draggable, persistent or subject to auto-close timers.

#### Persistence and offline requirements

* Amp presets survive Builder editing, save/export, reopen and Viewer loading for
  both native and PDF records.
* Amp UI assets, CSS and JavaScript are embedded in the self-contained output and
  work fully offline.
* Amp metadata never enters native components, PDF contents or A4 page data.

#### Acceptance criteria

* Schema 15 without amp data loads as schema 16 with `ampPresets: []`; older
  supported schemas still normalize.
* Schema-16 native and PDF records save/reopen without amp data loss, including
  multiple presets, optional effects and malformed-value clamping.
* No preset means no Amp button; one or more presets enable the button and popup
  for both native and PDF tabs.
* Preset selection updates every displayed setting and the Amp button toggles the
  popup open/closed.
* Builder add/edit/remove and all eight values update and persist correctly.
* Amp and Booster are fixed dropdowns; multiple extra effects can be added,
  edited, removed and preserved through save/export/reopen.
* At values 0, 50 and 100, only the pointer rotates to the correct stop/up/stop
  positions; the rich knob body and ticks stay fixed at Builder and Viewer sizes.
* Spotify-only behavior remains unchanged; Spotify + Amp tools are adjacent while
  the expanded Spotify player may cover Amp without reserved space.
* The Amp tool has no visible badge but retains its 40 px transparent hit area;
  the original dark silhouette is slightly larger and stays in the same position.
* Core and extra-effect knob percentages appear only on hover, keyboard focus or
  touch tap; pointer exit, blur or an outside touch dismisses them, and no Viewer
  knob is editable.
* The Amp overlay remains usable on phone, tablet and desktop, does not print and
  does not affect native/PDF A4 geometry. Extra effects wrap below the core grid
  and the viewport-contained popup remains internally scrollable when needed.
* Embedded PDF.js blocks remain byte-identical; runtime syntax checks and
  `git diff --check` pass.

## 3.4-beta — final 3.x feature release

This is the final feature release in the current self-contained 3.x architecture.
Builder version becomes `3.4-beta`; current schema becomes 17. FretFlow 4.0 will
separate the application from the guitar-book format, but no 4.0 work belongs here.
Practice Player named sections above are deferred and excluded from this release.

### Note techniques and deterministic migration

* Current techniques: Standard, Legato, Slide up, Slide down, Slide out up,
  Slide out down, Bend up and Bend up-down. Preserve existing pick strokes.
* Before setting schema 17, migrate schema 16 and all older supported schemas:
  `slideUp` → `slideOutUp`, `slideDown` → `slideOutDown`. Preserve their existing
  short local marks and appearance. Afterwards use only the current model.
* Schema-17 `slideUp` / `slideDown` connect to the next note on the same string,
  found from rendered positions without stored target IDs. Draw dynamic SVG paths
  close to both fret numbers, sloping up/down and scaling with their distance.
  Connections cross measure boundaries on the same rendered row. No target or a
  target on another row/page means no connector; never substitute a slide-out.
* Slide-out techniques remain local marks and never search for a target.
* `bendUp` is a compact local SVG curve with an upward arrowhead. `bendUpDown`
  rises and releases downward, with an arrowhead at the descending end.
* Reuse shared Builder/Viewer rendering and existing note/layout coordinates.
  Preserve legato's existing next-same-string behavior without redesign.
* No bend amounts, semitones, target notes/pitches, explicit target selectors,
  rhythmic durations/length markers or multi-note legato spans.

### Optional YouTube resource per native or PDF song/tab

* Shared record metadata: `youtubeUrl` and optional free-text `youtubeLabel`,
  both strings defaulting to empty. Add compact shared Builder fields; preserve
  both through editing, serialization, standalone export and reopen.
* Parse ordinary HTTP(S) YouTube watch, youtu.be, embed and Shorts URLs; extract
  the video ID while ignoring tracking parameters. Invalid URLs fail safely.
  Keep the original user-facing URL for the external fallback.
* Show an inline SVG YouTube play tool beside Spotify/Amp only for a valid URL.
  Preserve existing Spotify and Amp behavior.
* Toggle a compact fixed, non-printing Viewer overlay with a label (or “YouTube”),
  header close button, standard responsive 16:9 embedded player with playsinline,
  and an always-visible “Open in YouTube” external link to the original URL.
* Header-only Pointer Events dragging supports mouse and touch; video controls
  receive their own events. Clamp the overlay inside the viewport, including on
  resize. Position is session UI state only; opening may reset upper-right.
* Tool toggle and × both close and remove the iframe, stopping hidden audio.
  No timers, external drag library, eager YouTube loading or core dependency.
* Embedded playback can fail under file:// (including error 153 due to missing
  Referer/client identity). Always retain the external fallback. No Referer
  spoofing, proxy, remote FretFlow service or security workaround.
* No generic media framework, custom transport/rate UI, loops, playlists,
  timeline integration or Practice Player integration.

### Release validation and invariants

* Verify all supported schema migrations, idempotent schema-17 normalization,
  preserved Amp presets/effects, old local-slide appearance and all new types.
* Verify connected-slide direction, position-dependent length, same-row measure
  crossing, missing/cross-row targets and shared Builder/Viewer output; no bend
  amount/target metadata is introduced.
* Verify native/PDF YouTube metadata editing and export/reopen, URL forms and
  invalid input; conditional tool, both close paths, iframe removal, headings,
  fallback URL, mouse/touch header dragging and viewport containment.
* Preserve fixed 794 × 1123 A4 geometry, native/PDF offline use, chords/barres,
  Amp tool/tooltips, Spotify Practice Player, navigation, single/spread mode,
  pinch/double-tap zoom and tablet portrait scaling. Overlay must not print.
* Check runtime and Builder JS syntax, `git diff --check`, exact byte identity
  of both embedded PDF.js blocks and the final changed-file list.
* Report automated results and exact remaining browser/device/network checks,
  including real YouTube playback from local files and HTTP(S).
* Only `builder.html` and this backlog are in scope. No commits, pushes, merges,
  release metadata, generated demo/index updates or unrelated refactors.

## 4.0 — application launcher and Viewer-first startup

FretFlow now starts as one central application with an explicit launcher,
Viewer and Builder mode. With no guitar map loaded, the launcher shows only
`Gitaarmap laden` and `Nieuwe gitaarmap`: it has no document search or tag
filters, and its action tiles are application UI rather than serialized data.

Loading a supported standalone FretFlow HTML file reuses the existing project
extraction, schema detection, migration and normalization path, then opens the
existing Viewer on the document home. Creating a new guitar map reuses the
existing default-project initialization and opens the existing Builder.

The main application runtime uses pinned CDN PDF.js 3.11.174, with local
reference copies retained under `references/pdfjs/`. Standalone PDF.js
rebundling remains outside this step.

Application version is `4.0`; the document schema remains 17.

### Staged 4.x direction

Later 4.x work may add Viewer system/editing tiles and direct Viewer-to-Editor
transitions, followed by `.fret` import/export and save behavior, and finally
hosted/PWA functionality. Those features are deliberately outside this 4.0
launcher step.

## Parked / longer term

Do not implement unless explicitly moved into an active version.

* transpose native tabs
* further footer/pagination cleanup
* further harmonization of ChordSection and Tab/Riff
* other functional extensions
