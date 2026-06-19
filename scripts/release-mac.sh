#!/usr/bin/env bash
#
# Build, sign (Developer ID), notarize, and package a universal macOS release of
# Annotatr — and generate the auto-updater manifest (latest.json).
#
# Credentials are read from the environment, or from a gitignored .env.release
# in the repo root (copy .env.release.example to create it). Required:
#   APPLE_SIGNING_IDENTITY      "Developer ID Application: NAME (TEAMID)"
#   APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID    (notarization)
#   TAURI_SIGNING_PRIVATE_KEY   path to (or contents of) the updater signing key
#
# Usage:
#   ./scripts/release-mac.sh            # build + sign + notarize + write latest.json
#   ./scripts/release-mac.sh --publish  # also create/update the GitHub release
#
# Build a faster single arch with:  TARGET=aarch64-apple-darwin ./scripts/release-mac.sh
#
set -euo pipefail

PUBLISH=false
for arg in "$@"; do
  case "$arg" in
    --publish) PUBLISH=true ;;
    *) echo "unknown arg: $arg (supported: --publish)" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

TARGET="${TARGET:-universal-apple-darwin}"
REPO="dennisrongo/annotatr"
APP_NAME="Annotatr"

# --- Load credentials from .env.release if present ---------------------------
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.release}"
if [[ -f "$ENV_FILE" ]]; then
  echo "▸ Loading credentials from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# --- Validate required credentials -------------------------------------------
missing=0
for var in APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID TAURI_SIGNING_PRIVATE_KEY; do
  if [[ -z "${!var:-}" ]]; then
    echo "✗ Missing required env var: $var"
    missing=1
  fi
done
if [[ "$missing" -ne 0 ]]; then
  echo ""
  echo "Set them in $ENV_FILE (see .env.release.example) or in the environment."
  exit 1
fi

# Confirm the signing identity actually exists in the login keychain.
if ! security find-identity -v -p codesigning | grep -qF "$APPLE_SIGNING_IDENTITY"; then
  echo "✗ Signing identity not found in keychain:"
  echo "    $APPLE_SIGNING_IDENTITY"
  echo "  Available code-signing identities:"
  security find-identity -v -p codesigning | sed 's/^/    /'
  exit 1
fi

export APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID
export TAURI_SIGNING_PRIVATE_KEY
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

echo "▸ Target: $TARGET    Publish: $PUBLISH"
echo "▸ Ensuring universal Rust targets are installed…"
rustup target add aarch64-apple-darwin x86_64-apple-darwin >/dev/null

echo "▸ Installing JS dependencies…"
if [[ -f package-lock.json ]]; then npm ci; else npm install; fi

echo "▸ Building, signing, notarizing, and producing updater artifacts…"
echo "  Notarization is submitted to Apple's service and can take several minutes."
npx tauri build --target "$TARGET" --bundles app,dmg

# --- Locate artifacts --------------------------------------------------------
BUNDLE_DIR="src-tauri/target/$TARGET/release/bundle"
APP_PATH="$BUNDLE_DIR/macos/$APP_NAME.app"
TARBALL="$BUNDLE_DIR/macos/$APP_NAME.app.tar.gz"
SIG_FILE="$TARBALL.sig"
DMG_FILE="$(/usr/bin/find "$BUNDLE_DIR/dmg" -maxdepth 1 -name '*.dmg' 2>/dev/null | head -1 || true)"

# --- Verify the signed/notarized app -----------------------------------------
echo ""
echo "================ Verification ================"
echo "  codesign --verify:"
codesign --verify --deep --strict --verbose=2 "$APP_PATH" 2>&1 | sed 's/^/    /' || true
echo "  Gatekeeper (want: accepted / source=Notarized Developer ID):"
spctl -a -vvv -t exec "$APP_PATH" 2>&1 | sed 's/^/    /' || true
echo "  Stapled ticket:"
xcrun stapler validate "$APP_PATH" 2>&1 | sed 's/^/    /' || true
echo "=============================================="

# --- Generate the updater manifest (latest.json) -----------------------------
if [[ ! -f "$SIG_FILE" ]]; then
  echo "✗ No updater signature found at $SIG_FILE."
  echo "  Check TAURI_SIGNING_PRIVATE_KEY and bundle.createUpdaterArtifacts in tauri.conf.json."
  exit 1
fi

# Version is the source of truth in tauri.conf.json.
VERSION="$(grep -m1 '"version"' src-tauri/tauri.conf.json | sed -E 's/.*"version" *: *"([^"]+)".*/\1/')"

# Tracked, cross-machine source of truth (committed to git). We MERGE our darwin
# entries in rather than overwrite, so a later Windows build (scripts/release-win.ps1)
# can add windows-x86_64 to the same version without clobbering these — and vice
# versa. scripts/merge-manifest.mjs is the single, version-aware merge point:
# same version keeps the other platform's entries, a new version starts fresh.
MANIFEST="updater/latest.json"

# GitHub rewrites spaces in asset names to dots; "Annotatr" has none, but keep robust.
ASSET_NAME="$(basename "$TARBALL" | tr ' ' '.')"
URL="https://github.com/$REPO/releases/download/v$VERSION/$ASSET_NAME"

# The updater resolves by running arch (darwin-aarch64 / darwin-x86_64) and
# ignores "darwin-universal". A universal payload satisfies both, so both keys
# point at the same tarball + signature.
node scripts/merge-manifest.mjs \
  --manifest "$MANIFEST" \
  --version "$VERSION" \
  --platforms "darwin-aarch64,darwin-x86_64" \
  --sig-file "$SIG_FILE" \
  --url "$URL"
echo "▸ Merged darwin entries into updater manifest: $MANIFEST (v$VERSION)"
echo "  Commit + push this file so the Windows build merges into the same version."

echo ""
echo "Artifacts:"
[[ -n "$DMG_FILE" ]] && echo "  $DMG_FILE"
echo "  $APP_PATH"
echo "  $TARBALL"
echo "  $SIG_FILE"
echo "  $MANIFEST"

# --- Publish to GitHub Releases (opt-in) -------------------------------------
if [[ "$PUBLISH" == true ]]; then
  TAG="v$VERSION"
  echo ""
  if gh release view "$TAG" >/dev/null 2>&1; then
    echo "▸ Release $TAG exists — uploading/overwriting assets"
    gh release upload "$TAG" --clobber "$DMG_FILE" "$TARBALL" "$SIG_FILE" "$MANIFEST"
  else
    echo "▸ Creating release $TAG on $REPO"
    gh release create "$TAG" \
      --title "$TAG — $APP_NAME" \
      --notes "Signed & notarized universal build. Download the .dmg to install; the .app.tar.gz / .sig / latest.json drive the in-app auto-updater." \
      "$DMG_FILE" "$TARBALL" "$SIG_FILE" "$MANIFEST"
  fi
  echo "▸ Verifying the updater endpoint resolves unauthenticated…"
  code=$(curl -sL -o /dev/null -w "%{http_code}" \
    "https://github.com/$REPO/releases/latest/download/latest.json")
  echo "  latest.json -> HTTP $code $([[ "$code" == 200 ]] && echo '✓' || echo '(repo must be public)')"
else
  echo ""
  echo "Not published. Re-run with --publish to create/update the GitHub release v$VERSION,"
  echo "or upload the artifacts above to that tag manually."
fi

echo ""
echo "✓ Done."
