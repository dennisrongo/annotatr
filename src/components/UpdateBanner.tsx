import { useUpdater } from "../hooks/useUpdater";

/**
 * Slim banner shown at the top of the Settings window only when a newer signed
 * build is available from the update endpoint. Hidden entirely otherwise
 * (including in dev / offline). Auto-checks once on mount.
 */
export function UpdateBanner() {
  const { phase, version, error, install } = useUpdater();

  // Auto mode never reaches "checking"/"uptodate"; show only the actionable states.
  if (phase === "idle" || phase === "checking" || phase === "uptodate") return null;

  const busy = phase === "downloading" || phase === "ready";

  return (
    <div className={`st-update-banner${phase === "error" ? " err" : ""}`} role="status">
      {phase === "error" ? (
        <span>Update failed: {error}</span>
      ) : (
        <>
          <span>
            {busy ? "Installing update" : "Update available"}
            {version ? ` · v${version}` : ""}
          </span>
          <button className="st-update-btn" onClick={install} disabled={busy}>
            {phase === "downloading"
              ? "Downloading…"
              : phase === "ready"
                ? "Restarting…"
                : "Update & restart"}
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Manual "Check for Updates" row for the About tab: current-version-aware,
 * surfaces "up to date" / errors, and swaps to an install button when a newer
 * build is found. Uses a non-auto checker so nothing happens until clicked.
 */
export function UpdateCheckRow() {
  const { phase, version: newVersion, error, check, install } = useUpdater({ auto: false });

  const busy = phase === "checking" || phase === "downloading" || phase === "ready";
  const showInstall = phase === "available" || phase === "downloading" || phase === "ready";
  const installLabel =
    phase === "downloading" ? "Downloading…" : phase === "ready" ? "Restarting…" : "Update & restart";

  const status =
    phase === "checking"
      ? "Checking…"
      : phase === "uptodate"
        ? "You're on the latest version."
        : phase === "available"
          ? `Update available: v${newVersion}`
          : phase === "downloading"
            ? "Downloading…"
            : phase === "ready"
              ? "Restarting…"
              : phase === "error"
                ? `Couldn't check${error ? ` — ${error}` : ""}`
                : "Check for a newer signed build.";

  return (
    <div className="st-row">
      <div>
        <div className="st-row-label">Software update</div>
        <div className="st-row-sub">{status}</div>
      </div>
      {showInstall ? (
        <button className="st-btn" onClick={install} disabled={busy}>
          {installLabel}
        </button>
      ) : (
        <button className="st-btn" onClick={check} disabled={busy}>
          {phase === "checking" ? "Checking…" : "Check for Updates"}
        </button>
      )}
    </div>
  );
}
