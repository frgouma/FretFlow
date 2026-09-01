# FretFlow — Codex project instructions

## Project

FretFlow is a self-contained digital guitar songbook and Builder written in HTML, CSS and JavaScript.

`builder.html` is the single Builder and the source of truth for application development.

The Builder generates standalone FretFlow HTML files. Generated FretFlow files must remain usable offline, including PDF tabs.

## Core architecture

Preserve this compatibility principle:

schema detection → normalization to the current model → work exclusively with the current model

Older FretFlow songbooks must remain backwards compatible whenever their data can be deterministically migrated.

Do not introduce parallel legacy code paths after normalization unless explicitly required.

## Builder and PDF.js

There is only one Builder: `builder.html`.

PDF.js is embedded in `builder.html` so generated FretFlow files can render PDF tabs offline.

Treat these embedded PDF.js sections as immutable vendor code:

* `#fretflow-pdfjs`
* `#fretflow-pdfjs-worker-source`

Do not:

* edit them
* reformat them
* regenerate them
* move them
* include them in broad formatting operations

Make targeted edits only to FretFlow-owned HTML, CSS and JavaScript.

When practical, verify after significant Builder changes that the embedded PDF.js blocks are unchanged.

## Offline behaviour

Core FretFlow functionality must not require an internet connection.

Native tabs and PDF tabs must continue to work offline.

Optional online integrations, such as Spotify, may be unavailable offline and must not prevent normal FretFlow use.

## Scope discipline

Implement only the explicitly requested task or backlog item.

Do not opportunistically:

* refactor unrelated code
* change styling outside the requested scope
* add new features
* change the data model beyond what the task requires
* update `demo.html`, `index.html`, documentation or release metadata unless requested

Prefer small, targeted changes over broad rewrites.

## Data and compatibility

Preserve existing user data.

When changing a schema:

1. recognize supported older schemas
2. migrate deterministically during normalization
3. use only the current normalized representation afterwards
4. write only the current schema when saving

Never silently discard information from older data.

## Fixed document layout

The internal native document page is fixed at:

794 × 1123 px

This A4 document layout is device-independent.

Responsive Viewer behaviour must use uniform scaling of the complete page. Do not reflow native components or change component proportions for different screen sizes unless explicitly requested.

## Shared rendering

Where Builder preview and Viewer display the same musical element, prefer shared rendering logic so both remain visually and functionally consistent.

## Working practice

Before editing:

* inspect the relevant existing implementation
* identify the smallest set of required changes
* check for backwards-compatibility implications

After editing:

* inspect `git diff`
* test the changed behaviour where practical
* report what was changed and what was tested
* mention any uncertainty or untested edge case

Do not push, merge, create releases or modify remote Git state unless explicitly requested.

Do not modify files outside the FretFlow repository.
