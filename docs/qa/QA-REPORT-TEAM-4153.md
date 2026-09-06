# QA Report: TEAM-4153 — Persist the Email notifications setting across reloads

Verdict: PASS (zero open findings). Branch @ 8d1b4fc (impl f9129cc, PR #43) vs origin/main.

Gates (independent workspace, fresh npm ci): `npx vitest run` 5 files, 73 passed / 0 failed; `npm run lint` exit 0; `npm run build` exit 0 (39 modules); `npx tsc --noEmit` exit 0.

Real browser: Playwright 1.47.0 Chromium against `vite preview` of the production build. 66/66 checks PASS, 0 console errors/warnings/pageerrors. Full output: `qa-browser-output.txt`.

| Req | Verdict | Key evidence |
| --- | --- | --- |
| R1 persist On/Off across hard reload | PASS | qa-03, qa-04; localStorage `{"enabled":true,"lastChangedAt":1788676129289}` then `{"enabled":false,...}`; persisted false keeps the line |
| R2 default Off, no line | PASS | qa-01; meta count 0, key null |
| R3 Last changed line, <time dateTime>, 30 s tick | PASS | `Last changed just now` after click and after reload; seeded 12w -> `Last changed 12w ago`; clock fastForward 05:30 -> `5m ago` |
| R4 one activity per click, ms agreement | PASS | feed count 1,2,3,4,5; feed dateTime === meta dateTime; lastChangedAt 1788676129850 === newest activity ts |
| R5 corrupt storage | PASS | qa-05-a/b: `'not json'`, `{"enabled":"yes"}` -> Off, no line, no console error, raw absent from body |
| R6 write/read failure | PASS | store + App tests (setItem/getItem throw): still flips, +1 activity, no error text |
| R7 button unchanged, no aria-describedby | PASS | button block only context in diff; attrs exactly [aria-label, aria-pressed, class, type] |
| R8 deps / src/activity / DEPLOY.md / gates | PASS | package.json+lock diff empty; src/activity diff empty; DEPLOY.md absent |
| R9 test-plan coverage | PASS | all 15 Test-plan rows mapped to concrete `it()` titles |

Keyboard: 1 Tab reaches the toggle; Space -> On, Enter -> Off; focus stays on the button (qa-06a/b/c). Layout: 320 px and 1280 px, no horizontal scroll, meta line full width beneath `.settings__control` as its next sibling (qa-07, qa-08).

Note (pre-existing, out of scope, already recorded in findings.md / plan.md Deviation 1): `.settings__control-description` renders 14px because `.settings__section p` outranks it; not touched by this change.

Scripts `qa-browser.js` / `qa-keyboard-recheck.js` load Playwright from an out-of-repo install (`/tmp/pw`) so package.json stays unchanged; to re-run, install playwright@1.47.0 there or adjust the path.
