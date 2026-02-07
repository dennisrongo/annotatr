# Vite Cache Issue Fix

## Problem
If you see 504 "Outdated Optimize Dep" errors when loading the application, the Vite dependency cache is stale.

## Solution
The `.vite` cache directory has already been cleared. You need to restart the development server:

```bash
# Kill any existing dev server (Ctrl+C or kill process)
# Then restart:
npm run dev
```

Or if running Tauri dev:
```bash
npm run tauri:dev
```

Vite will rebuild the dependency cache on restart and the application should load correctly.

## What Was Fixed
- Removed `/Users/drongo/Documents/GitHub/annotatr/node_modules/.vite` directory
- Server restart required to rebuild cache
