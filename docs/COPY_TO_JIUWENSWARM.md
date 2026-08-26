# Copy-In Study — Migrating jiuwenswarm-browser into the JiuwenSwarm repo

**Purpose.** This project (code, docs, tests, packaging) will be copied verbatim
into the JiuwenSwarm monorepo as a new channel. This document is the study of
where every artifact goes and what, if anything, needs adapting. It is a *repo
organization* plan — not a protocol or feature change. The extension already
works as-is.

---

## 1. How JiuwenSwarm organizes channels

Each channel is a directory under `jiuwenswarm/channels/<name>/` (package root is
`jiuwenswarm/jiuwenswarm/`):

```
channels/<name>/
├── __init__.py
├── <name>_*.py          # Python channel entrypoint(s), optional for pure-client channels
└── frontend/            # self-contained TypeScript / JS package
    ├── package.json     # own deps + scripts (type: module)
    ├── tsconfig.json    # (web) / oxfmt/oxlint/tsc (tui)
    ├── src/
    ├── tests/           # or tests under tests/unit_tests/<name>/frontend/
    └── dist/            # built assets, shipped inside the package
```

Examples already present:
- `channels/web/` → `app_web.py` + `frontend/` (React/Vite, name `openjiuwen-web`).
- `channels/tui/` → `frontend/` (name `jiuwenswarm-tui`).
- `channels/acp/`, `channels/desktop/` → pure entrypoints.

Console scripts are registered in the root `pyproject.toml` `[project.scripts]`
(e.g. `jiuwenswarm-web = "jiuwenswarm.channels.web.app_web:main"`).

Docs are bilingual under `docs/en/` and `docs/zh/` (plus `README.md` /
`README_EN.md`). Frontend tests either live in the channel's `frontend/tests/` or
under `tests/unit_tests/<name>/frontend/`.

---

## 2. Destination

The browser extension is a **pure client** (no server runtime of its own). Its
natural home is:

```
jiuwenswarm/channels/browser/frontend/     ← the whole extension package
jiuwenswarm/channels/browser/__init__.py   ← empty marker (channel directory)
```

No Python entrypoint is strictly required. An optional
`jiuwenswarm/channels/browser/app_browser.py` (console script `jiuwenswarm-browser`)
could later build/serve the `dist/` for download, mirroring `app_web.py` — but the
extension itself is loaded from its built `dist/` / zip and needs no server.

---

## 3. Artifact-by-artifact mapping

| Extension artifact | Destination in jiuwenswarm | Adapt? |
|---|---|---|
| `package.json` / `package-lock.json` | `channels/browser/frontend/` | keep name `jiuwenswarm-browser` |
| `tsconfig.json` | `channels/browser/frontend/` | keep (self-contained) |
| `vite.config.ts`, `vite.content.config.ts` | `channels/browser/frontend/` | keep |
| `eslint.config.js` | `channels/browser/frontend/` | keep (ESLint, not oxlint — fine) |
| `manifest.json` | `channels/browser/frontend/` | keep (root of the package) |
| `icons/` | `channels/browser/frontend/icons/` | keep |
| `scripts/` (build/pack helpers) | `channels/browser/frontend/scripts/` | keep |
| `src/` (background, content, sidepanel, shared, popup, options) | `channels/browser/frontend/src/` | keep; `@shared/*` aliases resolve inside the package |
| `tests/` | `channels/browser/frontend/tests/` (Vitest) | keep; or move to `tests/unit_tests/browser/frontend/` to match monorepo convention |
| `.github/` (CI) | `channels/browser/frontend/.github/` | keep, or fold into repo CI |
| `README.md` | `docs/en/browser-extension/` + `docs/zh/browser-extension/` | rename + split bilingual |
| `docs/*.md` (USER_GUIDE, INSTALLATION, STORE_LISTING, ROADMAP) | `docs/en/browser-extension/` / `docs/zh/browser-extension/` | rename with `browser-extension-` prefix; translate |
| `jiuwenswarm-browser-0.1.0.zip` | release artifact (not source) | rebuilt from CI, not committed |

> **Not copied (internal working/design docs):** `CHANNEL_INTEGRATION.md` (integration
> study), `COPY_TO_JIUWENSWARM.md` (this migration plan), `SIG.md`, `RAT.md`. These are
> migration/design artifacts for this repo only and are not product docs.

---

## 4. What needs adapting (minimal)

1. **No import/path changes.** All imports are internal to the frontend package
   (`@shared/*`, relative `./`). Nothing references the extension repo's absolute
   path, so the copy is self-contained.
2. **Package name** already `jiuwenswarm-browser` — no collision with
   `openjiuwen-web` / `jiuwenswarm-tui`.
3. **Toolchain differs by design.** The web channel uses ESLint/Vite, the TUI uses
   oxlint/oxfmt/tsc; the extension uses Vite + Vitest + ESLint. A self-contained
   package may keep its own scripts. To match house style, optionally align lint
   with `oxlint` later (non-blocking).
4. **Docs placement.** The monorepo is bilingual (`docs/en/`, `docs/zh/`). The
   extension's docs should be re-homed there; the README should link from the
   repo's docs index.
5. **CI/build.** The root `Makefile`/build script assembles the Python package.
   The extension's `dist/` should be built by the frontend package's own `npm run
   build` and, if shipping, stored as `channels/browser/frontend/dist/` (mirroring
   how `app_web.py` serves `channels/web/frontend/dist/`).
6. **Optional server entrypoint.** Add `app_browser.py` + `jiuwenswarm-browser`
   console script only if the product wants to serve the built extension for
   download; otherwise omit.

---

## 5. Copy-in procedure

1. Create `jiuwenswarm/channels/browser/frontend/` and copy the package wholesale
   (src, tests, configs, icons, scripts, manifest).
2. Add `channels/browser/__init__.py` (empty) so the channel directory exists.
3. Re-home docs into `docs/en/` / `docs/zh/`; add a channel entry to the docs index.
4. Wire the frontend `dist/` build into the repo's build/release flow (mirror web).
5. Run the package's own checks inside the new home:
   `npm run type-check`, `npm run lint`, `npm run test`, `npm run build`, `npm run pack`.
6. Optionally register a `jiuwenswarm-browser` console script / serving endpoint.

---

## 6. Docs in JiuwenSwarm (recheck — what's relevant, what needs updating)

A thorough pass over `docs/` in the JiuwenSwarm repo surfaced the following.

### 6.1 Naming collisions to avoid

- `docs/en/Browser.md` **already exists** but documents the **server-side managed
  browser** (Playwright/Chrome driver), not the extension. The extension docs must
  be named clearly as a **browser extension** (e.g. `browser-extension-*.md`) and
  placed under `docs/en/browser-extension/` + `docs/zh/browser-extension/`.
- Generic names would collide/confuse with existing docs (`INSTALLATION.md` vs
  `InstallGuide.md`, `README.md` vs the repo README). Prefix them.

### 6.2 Which extension docs are relevant there

- Relevant to ship: **USER_GUIDE, INSTALLATION, STORE_LISTING, ROADMAP, README**.
- **Not relevant (do not copy):** `CHANNEL_INTEGRATION.md`, `COPY_TO_JIUWENSWARM.md`
  (migration working docs), and `SIG.md` / `RAT.md` (design docs).

### 6.3 JiuwenSwarm docs to update at copy time

- `docs/README.md` and `docs/README_EN.md` — add a "Browser Extension" entry
  (Basic Usage section) linking the new docs.
- `docs/en/SUMMARY.md` and `docs/zh/SUMMARY.md` — add the extension docs to the TOC.
- `docs/en/Channels.md` (and zh `频道.md`) — the extension is a WebSocket client
  (like the built-in Web UI), not an IM ingress channel, so it does not belong in
  the China/International channel tables; add it as a short "Browser Extension"
  note if desired.
- `docs/en/Browser.md` (optional) — add a one-line disambiguation pointing to the
  extension docs.

---

## 7. Non-goals / open notes

- No server runtime changes are required for the copy-in (the extension is a
  client of the existing web WebSocket channel).
- The tool-result flow and channel identity notes live in
  `CHANNEL_INTEGRATION.md`; they concern runtime behavior, not repo layout,
  and do not gate the copy.
- Decide whether to keep `SIG.md`, `RAT.md` (design docs) or fold their content
  into the monorepo's design-doc conventions at copy time.
