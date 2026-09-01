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

## 3.3-beta — planned features

Do not implement these while completing 3.2-beta.

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

### [ ] 3.3-02 — Amp presets per tab/song

Add one or more amp presets per song/tab.

Examples:

* Rhythm
* Solo
* Clean

Requirements:

* freely named presets
* practical starting settings, not historical rig reconstruction
* metadata belongs at tab/song level
* identical availability for native and PDF tabs
* Viewer control should remain compact

## Parked / longer term

Do not implement unless explicitly moved into an active version.

* transpose native tabs
* further footer/pagination cleanup
* further harmonization of ChordSection and Tab/Riff
* other functional extensions
