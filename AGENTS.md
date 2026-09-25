# FretFlow — Codex project instructions

## Project

FretFlow is a self-contained digital guitar songbook and Viewer + Editor application written in HTML, CSS and JavaScript.

`FretFlow.html` is the central application and the source of truth for application development.
`.fret` files are editable, data-only guitar-map working documents. Project
data is separate from application-session filesystem-handle/source state.

Save and Save As create `.fret` working documents. **Standalone HTML export**
creates a self-contained, read-only Viewer snapshot. Legacy standalone FretFlow
HTML files remain importable but must never be overwritten by normal Save.
Storage behaviour is based on available browser capabilities, not platform names.

## Core architecture

Preserve this compatibility principle:

schema detection → normalization to the current model → work exclusively with the current model

Older FretFlow songbooks must remain backwards compatible whenever their data can be deterministically migrated.

Do not introduce parallel legacy code paths after normalization unless explicitly required.

The project-document picker may be permissive for portability; validate supported
`.fret`, `.html`, and `.htm` filenames inside FretFlow before routing to an importer.

## Editor and PDF.js

There is one central application: `FretFlow.html`.

The application prefers pinned PDF.js CDN URLs at runtime and automatically
falls back to matching local copies in `assets/js/pdfjs/`. This directory is
vendored third-party code; do not inspect, search or edit its large files unless
the task specifically concerns PDF.js itself or standalone export.

PDF.js must remain external to compact `FretFlow.html`. Standalone HTML export
bundles the matching PDF.js main library and worker into the generated file so
its PDF tabs work offline without `assets/` or a CDN. The export-only source
cache under `assets/js/pdfjs/` is lazy-loaded only when an export is requested;
keep it synchronized with the pinned vendor pair.

## Editor workspace and application navigation

The Editor is one persistent two-pane workspace: Editor and Live View. It uses
the same one-page/two-page preference and effective availability rule as Viewer
content, without sharing Viewer paging state. A preferred two-page presentation
must downgrade and restore at exactly the same viewport conditions in both
places. The Editor pane is normal application UI; only Live View contains fixed
A4 pages, with all generated preview pages arranged vertically inside that pane.

Editor and Live View own independent vertical scroll positions. Switching pane
or workspace mode must preserve those positions and must not recreate the
Editor DOM merely to change presentation. Forward navigation starts the new
destination at its top; Back restores the prior view's saved vertical position.
Editor/Live View switching is local navigation and must not trigger either
behavior. The Editor toolbar keeps Back and Save at the left and uses the
Viewer-style page navigation, presentation, fullscreen and overflow cluster at
the far right. Viewer and Editor share the visual layout grammar for that
right-side cluster, and the Editor presentation toggle must mirror Viewer
spread availability, disabled interaction and preference restoration exactly.

For native tabs, the sticky block-type controls at the top are the single block
insertion route. Individual block headers keep identity (collapse control,
title and subdued type) separate from the move, duplicate and delete action row
so the same predictable two-row structure works when collapsed or expanded.

Global `.fret` Save includes valid current Project Meta form state before
serialization. Application toolbar containers and opened dropdowns must remain
above floating Spotify, YouTube and Amp controls in the stacking hierarchy.

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
