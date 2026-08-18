# Dead-Code Analysis Report

**Date:** 2026-08-18
**Branch:** feature/TEAM-2659-frontend-dev
**Tool:** knip v5.88.1

## Summary

The codebase is clean. One dead config reference was found and removed.

## Static Analysis (knip)

knip reported **zero issues**:
- No unused files
- No unused dependencies
- No unused exports
- No unused types

## tsconfig.json Audit

| Flag | Status |
|------|--------|
| `noUnusedLocals: true` | Present |
| `noUnusedParameters: true` | Present |
| `noFallthroughCasesInSwitch: true` | Present |

**Finding:** `"types": ["vitest/globals"]` referenced a type package that is not installed as a dependency. This was dead config left from a project template. **Removed.**

## CSS Selector Audit (src/App.css)

| Selector | Used In | Status |
|----------|---------|--------|
| `.app` | App.tsx:5 | Active |
| `.settings` | App.tsx:6 | Active |
| `.settings__title` | App.tsx:7 | Active |
| `.settings__section` | App.tsx:8 | Active |
| `.settings__section h2` | App.tsx (nested) | Active |
| `.settings__section p` | App.tsx (nested) | Active |

All CSS selectors have corresponding usage in components.

## Dependency Audit (package.json)

| Dependency | Used In | Status |
|------------|---------|--------|
| react | main.tsx, App.tsx | Active |
| react-dom | main.tsx | Active |
| @types/react | TypeScript types | Active |
| @types/react-dom | TypeScript types | Active |
| @vitejs/plugin-react | vite.config.ts | Active |
| typescript | Build toolchain | Active |
| vite | Build toolchain | Active |

All dependencies are actively used.

## Commented-Out Code

No commented-out code blocks found in any source files.

## Changes Made

1. Removed `"types": ["vitest/globals"]` from tsconfig.json (dead config; vitest not installed)

## Build Verification

`npm run build` exits with code 0 after changes.
