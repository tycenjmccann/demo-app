# Intent: Persist the Email notifications setting across reloads

- Workflow: wf_1788671842392_72iwdp
- Originator: Tycen McCann (product owner) - filed by his Claude Code operator session as the first sdlc-playbook validation run (via console)
- Filed: 2026-09-06T05:17:23.648Z
- Status: proposed — becomes accepted when the product owner approves the Intent Acceptance gate
- Target repo: https://github.com/tycenjmccann/demo-app.git

## Problem
The Settings page's Email notifications toggle forgets its state on every reload - flip it On, refresh, it's Off again. That makes the demo look broken, and the Activity feed's 'Turned email notifications on' entries never line up with what the toggle actually shows.

## Who is affected
Anyone demoing the Settings page, and any real user of it. A setting that doesn't stick is a setting that doesn't exist.

## Success criteria
Toggle On, reload: still On (and vice versa). A small 'Last changed <relative time>' line under the toggle reflects the most recent change and survives reload. The Activity feed still records each change exactly once. Automated tests cover the persistence and the last-changed text. Existing tests still pass and `npm run build` is green.

## Constraints
Vite + React + TypeScript as-is; no new runtime dependencies; localStorage only (no backend); keep the existing settings__toggle markup and aria attributes; do not touch DEPLOY.md.

## Out of scope
Syncing settings to a server, other settings, redesigning the Activity feed.

## Original request (verbatim)
First real run of the sdlc-playbook workflow. The Settings page toggle should remember its state, and show when it was last changed.

---
This file is the first link of the run's artifact chain. It is accepted, not edited, by the product owner;
corrections come from the originator. The spec author commits it unchanged to the feature branch.
