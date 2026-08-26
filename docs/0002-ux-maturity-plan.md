# UX Maturity Plan — The Path to 100/100

> Scope: **user experience and user interest only**, for a user who has JiuwenSwarm
> running and the extension installed from the store. Everything already shipped is
> omitted; this document is only the remaining work needed to reach 100.
>
> Items are split into two parts: **Part 1 — no backend (server) changes required**
> (fully implementable in this repo), and **Part 2 — require JiuwenSwarm server
> changes** (cannot be completed in this repo alone).

---

# Part 1 — No backend changes required

## 1. Release & trust

- **Store listing screenshots & tiles** — capture the shots per the step-by-step guide in
  `docs/STORE_LISTING.md` (needs the built extension + local server; cannot be produced
  from code). Listing copy, the in-app privacy disclosure, the icon set, and the ESM
  build-warning fix are done.

---

# Part 2 — Require backend (server) changes

## 1. Passage-level citations (3.3)

The "wow": answers cite the *specific* passage; clicking a citation scrolls to and
highlights it on the page.

- **Needs:** server to emit structured citation envelopes (cited URL + passage anchor)
  alongside streamed text.

## 2. Deep personalization (5.3)

A sense of "my research" — recent activity, resume-by-importance, cross-session memory.

- **Needs:** server-side analytics / recent-activity data.

## 3. Cross-device & team features

- **Team sessions** — multiple users pin to a shared session; real-time sync via server
  WebSocket broadcast.
- **Scheduled / cron research** — recurring research jobs; the web app already has a
  cron panel the extension could surface.

---

## Priority order (toward 100)

| # | Item | Part | Impact on 100 |
|---|---|---|---|
| 1 | Passage-level citations (3.3) | 2 | Differentiating "wow" |
| 2 | Store listing screenshots & tiles | 1 | Reach / first impression |
| 3 | Deep personalization (5.3) | 2 | Retention |
| 4 | Cross-device / team / cron features | 2 | Retention / scale |

Item 2 (Part 1) is a manual capture task (documented in `docs/STORE_LISTING.md`).
Items 1, 3, and 4 (Part 2) require JiuwenSwarm server changes and cannot be completed
here.

> **Recently completed and removed from this list:** edit-and-resend, chip arrow-key
> navigation, activity dashboard, batch pin, in-app privacy disclosure, auto-summarize
> on pin, full-text search, offline re-reading, store listing copy, unit tests (Vitest)
> + CI workflow + ESLint lint, the typed message protocol (handler registry), reading-mode
> overlay, and the ESM build-warning fix (clean `type: module` build).
