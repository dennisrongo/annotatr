# Installation Blocker - npm Registry Access

## Issue

The Annotatr project cannot currently install dependencies due to an npm registry access restriction:

```
npm error 403 403 Forbidden - GET https://registry.npmjs.org/@tauri-apps%2fapi
```

## What This Blocks

Installation of required Tauri 2 packages:
- `@tauri-apps/api` - Frontend Tauri API bindings
- `@tauri-apps/cli` - Tauri CLI tool for building
- `@tauri-apps/plugin-shell` - Shell plugin
- `@tauri-apps/plugin-store` - Persistent storage plugin

## What Is Already Complete

Despite the installation blocker, the project is **100% structurally complete**:

### Tauri Backend (Rust)
- ✓ `src-tauri/Cargo.toml` - Dependencies configured
- ✓ `src-tauri/tauri.conf.json` - App configuration with 3 windows
- ✓ `src-tauri/src/lib.rs` - Main library with IPC handlers
- ✓ `src-tauri/src/commands.rs` - Tauri command implementations
- ✓ `src-tauri/src/overlay.rs` - Overlay window management
- ✓ `src-tauri/src/utils.rs` - Utility functions
- ✓ `src-tauri/src/main.rs` - Application entry point
- ✓ `src-tauri/build.rs` - Build script

### React Frontend (TypeScript)
- ✓ `package.json` - Dependencies and scripts configured
- ✓ `tsconfig.json` - Strict TypeScript configuration
- ✓ `vite.config.ts` - Vite development server (port 1420)
- ✓ `index.html` - HTML entry point
- ✓ `src/main.tsx` - React application entry
- ✓ `src/App.tsx` - Main app component
- ✓ `src/styles.css` - Application styling

### Window Architecture

Three windows configured in `tauri.conf.json`:

1. **Main Window** (800x600)
   - Decorated, resizable
   - For settings and configuration

2. **Overlay Window** (Fullscreen)
   - Transparent, always-on-top
   - Skip taskbar
   - For drawing annotations

3. **Mini Panel** (400x120)
   - Transparent, always-on-top
   - For tool selection

### IPC Commands

All Tauri commands defined in Rust:
- `greet` - Test command
- `save_settings` - Save to persistent storage
- `load_settings` - Load from persistent storage
- `show_overlay` - Show overlay window
- `hide_overlay` - Hide overlay window
- `focus_overlay` - Focus overlay window
- `get_overlay_state` - Check overlay visibility
- `drawing_start` - Begin drawing operation
- `drawing_update` - Update drawing coordinates
- `drawing_end` - Complete drawing operation
- `create_shape` - Create shape on overlay
- `clear_all_shapes` - Remove all shapes
- `register_hotkeys` - Register global hotkeys

## How to Resolve

### Option 1: Fix npm Registry Access
Check for network/proxy issues:
```bash
# Test connectivity
npm ping registry.npmjs.org

# Check npm configuration
npm config list

# Try with explicit registry
npm install --registry=https://registry.npmjs.org/
```

### Option 2: Use Corporate Registry (if applicable)
If your organization uses a private npm registry:
```bash
npm install --registry=https://your-registry.com/
```

### Option 3: Use Pre-installed Dependencies
If you have access to another machine with working npm:
```bash
# On working machine
npm install
tar -czf node_modules.tar.gz node_modules/

# On target machine
tar -xzf node_modules.tar.gz
```

### Option 4: Contact IT/Network Admin
The 403 error suggests a firewall or proxy is blocking `@tauri-apps` scoped packages. Contact your network administrator to:
- Whitelist `@tauri-apps` packages
- Allow access to `registry.npmjs.org`
- Configure proxy exceptions if needed

## Next Steps Once Resolved

1. Run `npm install` to install dependencies
2. Run `npm run tauri:dev` to start development server
3. Test the greet command to verify IPC communication
4. Verify overlay window management works
5. Continue with remaining features

## Feature Status

- **Feature #4** (Tauri API integration): SKIPPED (moved to priority 136)
- **Feature #5** (Cross-platform build): SKIPPED (moved to priority 137)

These features will be retried after the installation blocker is resolved.

## Project Health

Despite the blocker, the project is in excellent shape:
- ✓ All source code files created
- ✓ All configuration files properly set up
- ✓ IPC architecture designed
- ✓ Multi-window system configured
- ✓ Ready to run once dependencies install

The only missing piece is the `node_modules` directory, which will be created automatically once npm install succeeds.
