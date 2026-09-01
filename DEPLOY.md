# DEPLOY.md — Deploy Contract (TEAM-3672)

Machine + human runbook for deploying this Vite 5 + React 19 + TypeScript static
SPA to **AWS S3 + CloudFront**. It is consumed by the CD agent, so every command
below is executable **exactly as written** in `bash` once the environment
prerequisites (§5) are satisfied.

Deploy model: the build output (`dist/`) is published to an immutable,
per-commit **release prefix** (`releases/<sha>/`), then atomically promoted to
the **live prefix** (`live/`) that CloudFront serves. Rollback re-promotes a
prior release prefix. A small `meta/` area records the last and previous
deployed SHAs so rollback always has a reference.

---

## 1. Staging deploy commands

Run in this exact order. Requires the environment from §5 (`STAGING_BUCKET`,
`STAGING_DISTRIBUTION_ID`, `STAGING_URL`, AWS credentials) to be set.

Install dependencies from the lockfile:

```bash
npm ci
```

Build the static site into `dist/`:

```bash
npm run build
```

Publish the build to the immutable per-commit release prefix:

```bash
aws s3 sync dist/ "s3://${STAGING_BUCKET}/releases/$(git rev-parse HEAD)/" --delete
```

Preserve the currently-live SHA as the previous SHA **before** promoting, so
rollback has a reference (no-op on the very first deploy when it does not exist):

```bash
if aws s3 ls "s3://${STAGING_BUCKET}/meta/last-deployed-sha" >/dev/null 2>&1; then
  aws s3 cp "s3://${STAGING_BUCKET}/meta/last-deployed-sha" "s3://${STAGING_BUCKET}/meta/previous-deployed-sha"
fi
```

Promote the freshly-published release to the live prefix that CloudFront serves:

```bash
aws s3 sync "s3://${STAGING_BUCKET}/releases/$(git rev-parse HEAD)/" "s3://${STAGING_BUCKET}/live/" --delete
```

Invalidate the CloudFront cache so the new content is served immediately:

```bash
aws cloudfront create-invalidation --distribution-id "${STAGING_DISTRIBUTION_ID}" --paths "/*"
```

Record the newly-deployed SHA as the last-deployed SHA (rollback reference for
the next deploy):

```bash
git rev-parse HEAD > .last-deployed-sha && aws s3 cp .last-deployed-sha "s3://${STAGING_BUCKET}/meta/last-deployed-sha"
```

> Note: `.last-deployed-sha` is a deploy-run artifact written into the working
> tree by the command above; it is git-ignored and must never be committed.

---

## 2. Smoke checks (staging)

Run after every staging deploy. All three must pass before the deploy is
considered green. Requires `STAGING_URL` (§5).

| # | Check | Command | Expected output / exit |
|---|-------|---------|------------------------|
| 1 | Staging URL returns HTTP 200 | `curl -fsS -o /dev/null -w "%{http_code}" "${STAGING_URL}/"` | prints `200`, exit `0` |
| 2 | App shell (`#root`) served | `curl -fsS "${STAGING_URL}/" \| grep -c '<div id="root">'` | prints `1`, exit `0` |
| 3 | Hashed JS bundle referenced and fetchable | `curl -fsS "${STAGING_URL}/" \| grep -oE '/assets/[^"]+\.js' \| head -n1 \| xargs -I{} curl -fsS -o /dev/null -w "%{http_code}" "${STAGING_URL}{}"` | prints `200`, exit `0` |

Check 1 — staging URL returns HTTP 200:

```bash
curl -fsS -o /dev/null -w "%{http_code}" "${STAGING_URL}/"
```

Check 2 — the app shell `<div id="root">` is present exactly once:

```bash
curl -fsS "${STAGING_URL}/" | grep -c '<div id="root">'
```

Check 3 — extract the hashed `/assets/*.js` path from `index.html` and confirm
it fetches with HTTP 200:

```bash
curl -fsS "${STAGING_URL}/" | grep -oE '/assets/[^"]+\.js' | head -n1 | xargs -I{} curl -fsS -o /dev/null -w "%{http_code}" "${STAGING_URL}{}"
```

---

## 3. Rollback command (staging)

Re-promote the previous release to `live/` and invalidate CloudFront. Reads the
previous SHA recorded during the last deploy (§1).

```bash
PREV_SHA="$(aws s3 cp "s3://${STAGING_BUCKET}/meta/previous-deployed-sha" -)"
aws s3 sync "s3://${STAGING_BUCKET}/releases/${PREV_SHA}/" "s3://${STAGING_BUCKET}/live/" --delete
aws cloudfront create-invalidation --distribution-id "${STAGING_DISTRIBUTION_ID}" --paths "/*"
```

**After any rollback, re-run the staging smoke checks (§2) and confirm all three
pass before declaring the environment recovered.**

---

## 4. Required secrets

Names only — **never** commit or echo their values.

| Secret name | Purpose |
|-------------|---------|
| `AWS_ACCESS_KEY_ID` | AWS access key identifying the deploy principal. |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key paired with the access key ID. |
| `AWS_SESSION_TOKEN` | *Optional.* Session token, required only when using temporary/STS credentials. |

> ⚠️ **WARNING:** Secret values must never be committed to the repo, written to
> files, logged, or echoed to stdout/stderr. Provide them only via the CD
> secret store / environment. This document contains secret **names** only.

---

## 5. Environment prerequisites

Tooling:

- **Node.js** >= 20
- **npm** >= 10
- **AWS CLI v2**, configured with the credentials in §4
- **git**
- **curl**

Required non-secret environment variables:

| Variable | Description |
|----------|-------------|
| `STAGING_BUCKET` | S3 bucket name for the staging site (holds `releases/`, `live/`, `meta/`). |
| `STAGING_DISTRIBUTION_ID` | CloudFront distribution ID fronting the staging bucket. |
| `STAGING_URL` | Public base URL of the staging site (e.g. `https://staging.example.com`), no trailing slash. |
| `PRODUCTION_BUCKET` | S3 bucket name for the production site. |
| `PRODUCTION_DISTRIBUTION_ID` | CloudFront distribution ID fronting the production bucket. |
| `PRODUCTION_URL` | Public base URL of the production site, no trailing slash. |
| `AWS_REGION` | AWS region for the S3 buckets and CloudFront API calls. |

Preflight — fails fast if any required variable is unset:

```bash
for v in STAGING_BUCKET STAGING_DISTRIBUTION_ID STAGING_URL PRODUCTION_BUCKET PRODUCTION_DISTRIBUTION_ID PRODUCTION_URL AWS_REGION; do
  if [ -z "${!v:-}" ]; then echo "ERROR: required env var $v is unset" >&2; exit 1; fi
done
```

---

## 6. Auto-promote + Production

```yaml
auto_promote: staging-green
```

When the staging deploy (§1) and **all** staging smoke checks (§2) pass, CD may
promote to production without a further human gate.

### Production deploy commands

Same sequence as §1, using the `PRODUCTION_*` variables.

Install dependencies from the lockfile:

```bash
npm ci
```

Build the static site into `dist/`:

```bash
npm run build
```

Publish the build to the immutable per-commit release prefix:

```bash
aws s3 sync dist/ "s3://${PRODUCTION_BUCKET}/releases/$(git rev-parse HEAD)/" --delete
```

Preserve the currently-live SHA as the previous SHA before promoting:

```bash
if aws s3 ls "s3://${PRODUCTION_BUCKET}/meta/last-deployed-sha" >/dev/null 2>&1; then
  aws s3 cp "s3://${PRODUCTION_BUCKET}/meta/last-deployed-sha" "s3://${PRODUCTION_BUCKET}/meta/previous-deployed-sha"
fi
```

Promote the freshly-published release to the live prefix:

```bash
aws s3 sync "s3://${PRODUCTION_BUCKET}/releases/$(git rev-parse HEAD)/" "s3://${PRODUCTION_BUCKET}/live/" --delete
```

Invalidate the CloudFront cache:

```bash
aws cloudfront create-invalidation --distribution-id "${PRODUCTION_DISTRIBUTION_ID}" --paths "/*"
```

Record the newly-deployed SHA as the last-deployed SHA:

```bash
git rev-parse HEAD > .last-deployed-sha && aws s3 cp .last-deployed-sha "s3://${PRODUCTION_BUCKET}/meta/last-deployed-sha"
```

### Production smoke checks

Run after every production deploy; all three must pass. Requires `PRODUCTION_URL`.

Check 1 — production URL returns HTTP 200:

```bash
curl -fsS -o /dev/null -w "%{http_code}" "${PRODUCTION_URL}/"
```

Check 2 — the app shell `<div id="root">` is present exactly once:

```bash
curl -fsS "${PRODUCTION_URL}/" | grep -c '<div id="root">'
```

Check 3 — extract the hashed `/assets/*.js` path and confirm it fetches with
HTTP 200:

```bash
curl -fsS "${PRODUCTION_URL}/" | grep -oE '/assets/[^"]+\.js' | head -n1 | xargs -I{} curl -fsS -o /dev/null -w "%{http_code}" "${PRODUCTION_URL}{}"
```

### Production rollback

Same mechanism as §3, using the `PRODUCTION_*` variables:

```bash
PREV_SHA="$(aws s3 cp "s3://${PRODUCTION_BUCKET}/meta/previous-deployed-sha" -)"
aws s3 sync "s3://${PRODUCTION_BUCKET}/releases/${PREV_SHA}/" "s3://${PRODUCTION_BUCKET}/live/" --delete
aws cloudfront create-invalidation --distribution-id "${PRODUCTION_DISTRIBUTION_ID}" --paths "/*"
```

**After any production rollback, re-run the production smoke checks and confirm
all three pass before declaring the environment recovered.**
