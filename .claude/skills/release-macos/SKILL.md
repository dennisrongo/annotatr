---
name: release-macos
description: Cut a signed + notarized + auto-updating macOS release of Annotatr (a Tauri 2 app) end to end — bump the version across package.json / Cargo.toml / tauri.conf.json, build a universal DMG, notarize + staple, regenerate the per-arch updater manifest (latest.json), and publish the GitHub release. Use this skill whenever the user says "cut a release", "release annotatr", "ship a new version", "publish a release", "make a new dmg", "bump and release", or "/release-macos" — even if they don't name the skill. Do not trigger for plain dev builds (npm run tauri dev / tauri build) — those don't sign, notarize, or publish.
---

# Release macOS

Orchestrates a full production release of **annotatr** (a Tauri 2 screen-annotation app): version bump → universal build → Developer ID signing → Apple notarization → updater manifest → GitHub release. Writes no app code — it drives the existing `scripts/release-mac.sh` and verifies the result.

## When to use this skill

- "cut a release", "cut a 0.2.0 release", "release annotatr", "ship a new version"
- "publish a release", "make a new dmg", "bump and release", "/release-macos"
- The user wants installed copies to receive an auto-update.

Do **not** trigger for a local dev build (`npm run tauri:dev`, `cargo build`) — those don't sign, notarize, or publish.

## Workflow

1. **Determine the new version.** Ask if unspecified; otherwise infer patch/minor/major from the request. It MUST be strictly greater than the current `src-tauri/tauri.conf.json` version — the auto-updater only fires on a newer version, so never re-publish an existing one.
2. **Bump the version in all three tracked files, kept identical:**
   - `package.json` (`"version"`)
   - `src-tauri/Cargo.toml` (`[package] version`)
   - `src-tauri/tauri.conf.json` (`"version"` — the value shown in-app and written into `latest.json`)
   Then confirm all three match (`grep`). `src-tauri/Cargo.lock` is gitignored and updates automatically on the next build — don't hand-edit it.
3. **Typecheck:** `npm run build`. Fix any error before continuing.
4. **Commit + push:** stage, verify no secret is staged (`git diff --cached --name-only | grep -iE '\.env\.release$|\.key$|\.p8$'` must be empty), commit the bump, `git push origin main`.
5. **Build + publish:** `./scripts/release-mac.sh --publish`. This builds universal (Intel + ARM), signs with Developer ID + hardened runtime, notarizes + staples, writes `latest.json` with per-arch keys, and creates/uploads the GitHub release. Requires `.env.release` (Apple creds + `TAURI_SIGNING_PRIVATE_KEY`); the first signing of a session may need keychain "Always Allow".
6. **Verify externally** that the public endpoint serves the new version:
   ```bash
   curl -sL https://github.com/dennisrongo/annotatr/releases/latest/download/latest.json \
     | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['version'],list(d['platforms']))"
   curl -sL -o /dev/null -w "tar.gz %{http_code}\n" \
     https://github.com/dennisrongo/annotatr/releases/download/v<VERSION>/Annotatr.app.tar.gz
   ```
   Expect the new version, both `darwin-aarch64` + `darwin-x86_64` keys, and HTTP 200.
7. **Report:** release URL, notarization status, endpoint check, and that installed builds will catch the update on next launch.

See `docs/RELEASE.md` for the full runbook and `scripts/release-mac.sh` for the build itself.

## Examples

### Example 1: Patch release

**User:** "ship a 0.1.1 release"

**Claude:**
- Bumps `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` to 0.1.1; `npm run build`; commit + push.
- Runs `./scripts/release-mac.sh --publish`, then curls the endpoint and confirms `0.1.1` with both arch keys at HTTP 200.
- Reports the release URL and that installed `0.1.x` will show the update banner on next launch.

### Example 2: Unspecified bump

**User:** "cut a new release"

**Claude:** Asks which bump (patch/minor/major) given the current version, then proceeds through the workflow.

## Anti-patterns

- ❌ Writing `latest.json` with a `darwin-universal` key — the updater matches the **running arch** (`darwin-aarch64` / `darwin-x86_64`) and ignores `darwin-universal`. List both arch keys pointing at the one universal payload (the script already does this).
- ❌ Making or leaving the repo private — release assets 404 for the unauthenticated updater and for DMG downloads. It must stay public.
- ❌ Using `TAURI_SIGNING_PRIVATE_KEY_PATH` — the build reads `TAURI_SIGNING_PRIVATE_KEY` (a path or the key contents). The `_PATH` name is silently ignored and no `.sig` is produced.
- ❌ Committing `.env.release` or the updater private key (`~/.tauri/annotatr-updater.key`), or echoing their contents.
- ❌ Re-publishing the same version (or a lower one) — installed apps won't update. Always bump first.
- ❌ Bumping only some of the version files — a mismatch means a confusing in-app version or a manifest that doesn't match the binary.
- ✅ Bump everywhere → typecheck → commit → `--publish` → verify the live endpoint.

## Notes

- **Back up `~/.tauri/annotatr-updater.key`.** It signs the update payload; losing it means no existing install can ever auto-update again (each would need a manual reinstall).
- Notarization is not cached — each release re-submits to Apple and waits for "Accepted".
- Run the script without `--publish` to do the full build + manifest locally without touching GitHub (useful for a dry run).
- Adapted from the agent-status `release-macos` skill.
