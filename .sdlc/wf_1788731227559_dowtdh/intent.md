# Intent: Clear the Activity feed with an undo window

- Workflow: wf_1788731227559_dowtdh
- Originator: Tycen McCann (product owner) - filed by his Claude Code operator session as the playbook-overlay validation run (via console)
- Filed: 2026-09-06T21:47:08.617Z
- Status: proposed — becomes accepted when the product owner approves the Intent Acceptance gate
- Target repo: https://github.com/tycenjmccann/demo-app.git

## Problem
The Activity feed on the Settings page only grows. After a demo session it is full of test entries and there is no way to start clean short of clearing the browser's site data by hand.

## Who is affected
Anyone demoing the Settings page; any real user who wants a tidy history.

## Success criteria
A 'Clear activity' control on the feed empties it. For about five seconds an 'Undo' affordance restores exactly what was cleared; after that the clear is permanent and survives reload. Keyboard and screen-reader users can do both. Automated tests cover clear, undo, expiry and reload. Existing tests still pass and `npm run build` is green.

## Constraints
Vite + React + TypeScript as-is; no new runtime dependencies; localStorage only; keep the existing Email notifications toggle and its tests untouched; do not touch DEPLOY.md.

## Out of scope
Per-entry delete, filtering or search, syncing history to a server.

## Original request (verbatim)
Second sdlc-playbook validation run: same Software Delivery pipeline with the Playbook framework flag on.

---
This file is the first link of the run's artifact chain. It is accepted, not edited, by the product owner;
corrections come from the originator. The spec author commits it unchanged to the feature branch.
