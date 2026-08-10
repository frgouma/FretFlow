# FretFlow

**FretFlow** is a browser-based builder for creating standalone digital guitar songbooks.

It combines guitar tabs, chord diagrams, PDF sheet music and song metadata in a single self-contained `FretFlow.html` file that can be opened locally in a modern browser — no server, database or installation required.

> FretFlow — vibecoded by Cunyo with GPT-5.6 Sol · © 2026 Cunyo

## What it does

FretFlow is built around a simple idea: keep an entire personal guitar songbook in one portable HTML file.

The Builder currently supports:

- native guitar tabs and song layouts
- embedded PDF sheet music
- a reusable chord library with chord diagrams
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
2. Add native tabs, PDFs, chords and metadata.
3. Organize songs into groups and tags.
4. Preview the result inside the Builder.
5. Choose **Save Guitar Map** to generate `FretFlow.html`.

The generated `FretFlow.html` contains both the application and the songbook data, so it can be copied to another computer, tablet or phone and opened without FretFlow itself being installed.

Existing FretFlow files can be opened again in the Builder and edited further.

## Data and compatibility

FretFlow keeps application code and songbook content conceptually separate.

The Builder reads a FretFlow project, normalizes it to the current internal data model, and then works only with that model. Future versions are intended to remain backwards compatible with songbooks created with FretFlow 1.0.

New functionality can therefore extend the data model without requiring existing songbooks to be rebuilt manually.

## Content and copyright

The FretFlow software is separate from the musical content loaded into it.

Tabs, sheet music, PDFs, lyrics, chord sheets and other source material retain the copyright and licensing terms of their respective owners or sources. FretFlow does not grant any rights to that material.

Song entries can include a source reference so the origin of the material remains documented.

## Project status

**FretFlow 1.0** is the first complete functional baseline.

The current version supports the core workflow for building and maintaining a personal digital guitar songbook. Future development will focus on additional editable component types and other functional extensions while preserving compatibility with existing FretFlow 1.0 songbooks.

## License

FretFlow is intended to be released under the **GNU General Public License v3.0 (GPL-3.0)**.

See the `LICENSE` file for the full license text.

## Credits

FretFlow was designed and built by **Cunyo** using an AI-assisted / vibecoding workflow with **GPT-5.6 Sol**.

Repository: https://github.com/frgouma/FretFlow
