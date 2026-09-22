# FretFlow — Codex project instructions

## Project

FretFlow is a self-contained digital guitar songbook and Viewer + Editor application written in HTML, CSS and JavaScript.

`FretFlow.html` is the central application and the source of truth for application development.
`.fret` files are editable, data-only guitar-map working documents. Project
data is separate from application-session filesystem-handle/source state.

Normal Save and Save As create `.fret` documents. Legacy standalone FretFlow
HTML files remain importable but must never be overwritten by normal Save.
Standalone HTML is a separate export concern. Storage behaviour is based on
available browser capabilities, not platform names. Standalone PDF.js packaging
is a separate concern documented below.

## Core architecture

Preserve this compatibility principle:

schema detection → normalization to the current model → work exclusively with the current model

Older FretFlow songbooks must remain backwards compatible whenever their data can be deterministically migrated.

Do not introduce parallel legacy code paths after normalization unless explicitly required.

## Editor and PDF.js

There is one central application: `FretFlow.html`.

The application prefers pinned PDF.js CDN URLs at runtime and automatically
falls back to matching local copies in `assets/js/pdfjs/`. This directory is
vendored third-party code; do not inspect, search or edit its large files unless
the task specifically concerns PDF.js itself or standalone export.

## Offline behaviour

Core FretFlow functionality, including native and PDF tabs, must remain usable
offline when `FretFlow.html` is opened directly with `file://`. Standalone PDF.js
bundling is a separate concern and must not be changed unless explicitly requested.

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

Where Editor preview and Viewer display the same musical element, prefer shared rendering logic so both remain visually and functionally consistent.

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
