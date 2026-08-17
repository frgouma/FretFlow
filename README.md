# FretFlow

**FretFlow 2.0.0** is a browser-based builder for creating standalone digital guitar songbooks.

It combines guitar tabs, chord diagrams, shapeboxes, text, PDF sheet music and song metadata in a single self-contained `FretFlow.html` file that can be opened locally in a modern browser — no server, database or installation required.

> FretFlow — vibecoded by Cunyo with GPT-5.6 Sol · © 2026 Cunyo

## What it does

FretFlow is built around a simple idea: keep an entire personal guitar songbook in one portable HTML file.

The Builder supports:

- native **Tab / riff** notation with measures, note positions, bar lines, techniques and annotations
- editable **Shapeboxes** for fretboard shapes, transitions, root maps, markers, arrows and slashes
- **Text** components with bold, italic and inline fretboard-style markers
- **Chord charts** and reusable **chord diagrams**
- a central chord library with editable categories
- embedded PDF sheet music
- PDF and native-page viewing with single-page and two-page spread modes
- fullscreen viewing, page navigation and printing
- printable PDF overlay footers, including inline formatting and markers
- flexible native-component widths: 100%, 70%, 50% and 30%
- groups that appear as tiles on the home page
- tags, search and filtering
- song metadata and source references
- editing existing FretFlow songbooks
- saving the complete songbook as a single standalone HTML file
- fully offline use once the file has been created

A new songbook also starts with a small set of common guitar chords that can be edited or removed.

## How it works

The repository contains the Builder:

```text
builder.html
```

Open it directly in a modern web browser.

From there you can:

1. Create a **New Guitar Map**.
2. Add native components, PDFs, chords and metadata.
3. Organize songs into groups and tags.
4. Preview the result inside the Builder.
5. Choose **Save Guitar Map** to generate `FretFlow.html`.

The generated `FretFlow.html` contains both the application and the songbook data, including embedded PDF data where applicable, so it can be copied to another computer, tablet or phone and opened without FretFlow itself being installed.

Existing FretFlow files can be opened again in the Builder and edited further.

## Apple / iOS compatibility

On iPhone and iPad, Apple's built-in file preview (Quick Look) does not reliably run the JavaScript used by FretFlow.

If a FretFlow file does not work correctly from the Files app or Quick Look preview, open it in an app that fully supports local HTML and JavaScript, such as **Sitecase**.

This limitation is specific to the iPhone and iPad preview environment and does **not** apply to using FretFlow on a MacBook or other Mac.

## Data and compatibility

FretFlow keeps application code and songbook content conceptually separate.

FretFlow 2.0.0 uses **schema 11**. When an older FretFlow songbook is opened, the Builder recognizes and normalizes supported legacy structures to the current internal model before editing continues.

This includes migrations introduced during the 2.0 development cycle, such as:

- older tab formats into the unified **Tab / riff** component
- legacy fretboard, transition and root-map structures into **Shapebox**
- legacy tab legends into ordinary editable **Text** components

The goal is backwards compatibility: existing FretFlow songbooks should remain usable as the data model evolves, without requiring them to be rebuilt manually.

## FretFlow 2.0.0

Version 2.0.0 is the current complete release of the Builder and introduces the main component architecture used by FretFlow going forward.

Compared with the 1.0 baseline, the release adds or consolidates:

- the unified **Tab / riff** editor and renderer
- the general-purpose **Shapebox** component
- shared 100/70/50/30 component layout
- inline text formatting and fretboard-style markers
- editable footer formatting and markers
- a redesigned chord library workflow
- improved migration and open/save roundtripping
- a consistent SVG-based viewer toolbar
- single-page and two-page spread viewing
- fullscreen viewing
- printing of complete native and PDF documents, including FretFlow overlay footers

Future development can extend the component and data model while preserving compatibility with existing FretFlow songbooks.

## Content and copyright

The FretFlow software is separate from the musical content loaded into it.

Tabs, sheet music, PDFs, lyrics, chord sheets and other source material retain the copyright and licensing terms of their respective owners or sources. FretFlow does not grant any rights to that material.

Song entries can include a source reference so the origin of the material remains documented.

## License

FretFlow is intended to be released under the **GNU General Public License v3.0 (GPL-3.0)**.

See the `LICENSE` file for the full license text.

## Credits

FretFlow was designed and built by **Cunyo** using an AI-assisted / vibecoding workflow with **GPT-5.6 Sol**.

Repository: https://github.com/frgouma/FretFlow
