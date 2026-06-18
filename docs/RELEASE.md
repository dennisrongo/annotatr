# Releasing Annotatr (macOS)

How to produce a **signed + notarized + auto-updating** universal build of
Annotatr that installs cleanly on any Mac — no Gatekeeper "damaged / unidentified
developer" warnings — and that existing installs update to automatically.

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
3. Confirm the endpoint serves the new version:
   ```bash
   curl -sL https://github.com/dennisrongo/annotatr/releases/latest/download/latest.json \
     | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['version'],list(d['platforms']))"
   ```

Installed apps poll `latest.json`; when its `version` is newer than the running
build, the Settings window shows the **"Update & restart"** banner (and the
**About** tab's *Check for Updates* control finds it on demand).

> The repo must stay **public** — release assets 404 for the unauthenticated
> updater and for DMG downloads otherwise.

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
