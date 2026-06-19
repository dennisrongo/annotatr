# Releasing Annotatr (macOS + Windows)

How to produce a **signed + notarized + auto-updating** universal build of
Annotatr that installs cleanly on any Mac — no Gatekeeper "damaged / unidentified
developer" warnings — and that existing installs update to automatically.
macOS leads the release (sections 1–5); the Windows installer **follows** into the
same GitHub release ([section 6](#6-releasing-the-windows-app)).

> Annotatr is distributed as a **direct download (DMG)**, signed with a
> **Developer ID Application** certificate and **notarized** by Apple. It is
> *not* sandboxed and *not* on the Mac App Store (it uses `macOSPrivateApi` for
> the transparent overlay, which the App Store forbids).

---

## 1. One-time prerequisites

| Need | How |
| --- | --- |
| Apple Developer Program membership | https://developer.apple.com ($99/yr) |
| **Developer ID Application** certificate in your login keychain | Xcode → Settings → Accounts → Manage Certificates → **+** → *Developer ID Application*. Verify with `security find-identity -v -p codesigning` |
| Xcode command-line tools (`notarytool`, `stapler`) | `xcode-select --install` |
| Notarization credentials | App-specific password (`appleid.apple.com` → *Sign-In and Security* → *App-Specific Passwords*) |
| Updater signing key | `npx tauri signer generate -w ~/.tauri/annotatr-updater.key -p "" --ci` |

This machine already has the cert: `Developer ID Application: Lean Code Automation LLC (PMNAQBZ3KN)`.

### The updater key

The update payload is signed with a key **separate** from the Apple cert. Its
public half lives in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`; the
private half is read at build time from `TAURI_SIGNING_PRIVATE_KEY` in
`.env.release`.

> ⚠️ **Back up `~/.tauri/annotatr-updater.key`.** Losing it means no existing
> install can ever auto-update again — each user would need a manual reinstall.

---

## 2. Configure credentials

```bash
cp .env.release.example .env.release
# edit .env.release — Apple ID + app-specific password + updater key path
```

`.env.release` is gitignored; secrets never leave your machine.

---

## 3. Build (and optionally publish)

```bash
./scripts/release-mac.sh            # build + sign + notarize + write latest.json
./scripts/release-mac.sh --publish  # also create/update the GitHub release
```

Under the hood the script:
- signs the `.app` with your Developer ID identity **and the hardened runtime**
  (`src-tauri/entitlements.plist`), then notarizes + **staples** it;
- produces the updater payload (`Annotatr.app.tar.gz` + `.sig`) because
  `bundle.createUpdaterArtifacts` is enabled;
- writes `latest.json` with **both** `darwin-aarch64` and `darwin-x86_64` keys
  (the universal payload satisfies both);
- with `--publish`, creates/uploads the GitHub release `vX.Y.Z` and checks the
  public endpoint returns HTTP 200.

> **First run:** macOS may prompt *"codesign wants to sign using key …"* — click
> **Always Allow**.

Build a faster single arch with `TARGET=aarch64-apple-darwin ./scripts/release-mac.sh`.

Artifacts land under `src-tauri/target/universal-apple-darwin/release/bundle/`:

```
macos/Annotatr.app
macos/Annotatr.app.tar.gz       # updater payload
macos/Annotatr.app.tar.gz.sig   # updater signature
dmg/Annotatr_<version>_universal.dmg
latest.json                     # updater manifest
```

---

## 4. Verify it's distributable

```bash
APP="src-tauri/target/universal-apple-darwin/release/bundle/macos/Annotatr.app"
codesign --verify --deep --strict --verbose=2 "$APP"   # signature valid + sealed
spctl -a -vvv -t exec "$APP"                           # want: source=Notarized Developer ID
xcrun stapler validate "$APP"                          # ticket stapled (works offline)
```

The real test: open the `.dmg` on a Mac that's never seen the app, drag to
Applications, launch — it should open with **no** warning.

---

## 5. Shipping an auto-update

The app checks the endpoint on launch (`src/hooks/useUpdater.ts`):

```
https://github.com/dennisrongo/annotatr/releases/latest/download/latest.json
```

To ship a new version:

1. Bump `version` in **`package.json`**, **`src-tauri/Cargo.toml`**, and
   **`src-tauri/tauri.conf.json`** (keep all three identical — `tauri.conf.json`
   is the value shown in-app and written into `latest.json`). It MUST be strictly
   greater than the published version. Commit.
2. Run **`./scripts/release-mac.sh --publish`**.
3. Commit the manifest the script merged the mac signatures into — this is the
   cross-machine source of truth the Windows build reads:
   ```bash
   git add updater/latest.json
   git commit -m "vX.Y.Z: add darwin updater signatures"
   git push origin main
   ```
4. Confirm the endpoint serves the new version:
   ```bash
   curl -sL https://github.com/dennisrongo/annotatr/releases/latest/download/latest.json \
     | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['version'],list(d['platforms']))"
   ```

Installed apps poll `latest.json`; when its `version` is newer than the running
build, the Settings window shows the **"Update & restart"** banner (and the
**About** tab's *Check for Updates* control finds it on demand).

> The repo must stay **public** — release assets 404 for the unauthenticated
> updater and for DMG downloads otherwise.

> **macOS leads, Windows follows.** The macOS flow above owns the version bump
> and creates the GitHub release. `updater/latest.json` is tracked in git so a
> Windows build can merge its `windows-x86_64` signature into the *same* version
> and release — see [Releasing the Windows app](#6-releasing-the-windows-app).

---

## 6. Releasing the Windows app

The Windows side **follows** an existing macOS release — it never bumps the
version and never creates the release. On a **Windows machine** it builds the
NSIS `.exe`, signs the auto-update payload with the *same* updater key, and
merges `windows-x86_64` into the one `latest.json` the Mac published. Driven by
`scripts/release-win.ps1`; orchestrated by the `/release-windows` skill.

### One-time prerequisites (Windows machine)

| Need | How |
| --- | --- |
| Node + npm | `winget install OpenJS.NodeJS.LTS` |
| Rust with the **MSVC** toolchain | https://rustup.rs, plus VS Build Tools ("Desktop development with C++") |
| GitHub CLI, authenticated | `winget install GitHub.cli` then `gh auth login` |
| **The same updater key as macOS** | Copy `~/.tauri/annotatr-updater.key` from the Mac. Set `TAURI_SIGNING_PRIVATE_KEY` (path or base64 contents) + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in `.env.release`. You do **not** need the `APPLE_*` vars on Windows. |

> The `.exe` is **not** Authenticode-signed in this setup, so Windows SmartScreen
> warns "unknown publisher" on first install. The in-app auto-updater still works
> (it uses the Tauri updater signature, not Authenticode).

### Steps

```powershell
.\scripts\release-win.ps1 -Preflight   # readiness checklist only (builds nothing)
git pull origin main                    # get the mac version bump + darwin signatures
.\scripts\release-win.ps1 -Publish      # build NSIS, merge windows-x86_64, upload into vX.Y.Z
git add updater/latest.json
git commit -m "vX.Y.Z: add windows-x86_64 updater signature"
git push origin main
```

`release-win.ps1`:
- reads the version from `tauri.conf.json` (set by macOS — never bumped here);
- refuses to run unless the `vX.Y.Z` release already exists and `updater/latest.json`
  is at that version with the mac's `darwin-*` signatures;
- builds the NSIS installer + signs the `.nsis.zip` updater payload;
- **merges** `windows-x86_64` into `updater/latest.json` via
  `scripts/merge-manifest.mjs` (the darwin entries are preserved);
- with `-Publish`, uploads the `.exe` + `.nsis.zip` + `.sig` + `latest.json` into
  the existing release with `gh release upload --clobber` — which never edits the
  release notes the Mac wrote.

Confirm all three platforms are live:
```bash
curl -sL https://github.com/dennisrongo/annotatr/releases/latest/download/latest.json \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['version'],sorted(d['platforms']))"
```
Expect `['darwin-aarch64','darwin-x86_64','windows-x86_64']`.

> **One manifest, merged not overwritten.** There is one `latest.json` per
> release. Each platform signs with the *same* updater key and splices its entry
> in via `merge-manifest.mjs` (same version → keep the others). Overwriting it
> from scratch would drop the other platform's signature and break its
> auto-updates — which is exactly what the merge helper prevents.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `spctl` says *rejected / Unnotarized Developer ID* | Notarization didn't run/failed — check `.env.release` creds and re-run. |
| Build fails: *signing private key not set* | `createUpdaterArtifacts` is on, so the build needs `TAURI_SIGNING_PRIVATE_KEY` (the updater key, not the Apple cert). |
| `errSecInternalComponent` during signing | Keychain locked — `security unlock-keychain login.keychain`, or approve the GUI prompt. |
| Notarization stuck `In Progress` | Apple's queue; `notarytool` polls until done. `xcrun notarytool history` to inspect. |
| App quits immediately on another Mac | Almost always missing notarization/staple, or an entitlement the binary needs — read `xcrun notarytool log <submission-id>`. |
| Update banner never appears | `latest.json` `version` must be **newer** than the installed app, and its `signature` must be the exact contents of the matching `.sig`. |
