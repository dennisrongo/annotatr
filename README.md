# Annotatr

A cross-platform screen annotation overlay tool that lets users draw arrows, circles, boxes, freehand drawings, highlights, and text on their screen in real-time while recording with any screen capture software (OBS, Loom, Zoom, etc.).

## Features

- **6 Drawing Tools**: Arrow, Circle, Box, Freehand, Highlighter, and Text
- **Global Hotkeys**: Quick tool switching via configurable hotkeys
- **Mini Panel**: Draggable tool panel for easy access
- **Auto-Fade**: Shapes automatically fade after configurable duration
- **Multi-Monitor Support**: Works seamlessly across multiple monitors
- **Cross-Platform**: Windows, macOS, and Linux support

## Prerequisites

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **Rust** - [Install via rustup](https://rustup.rs/)
- **Platform-specific build tools**:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Windows**: Microsoft C++ Build Tools
  - **Linux**: Refer to your distro's documentation for WebKit2GTK dependencies

## Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/annotatr.git
   cd annotatr
   ```

2. Run the initialization script:
   ```bash
   ./init.sh
   ```

   This will:
   - Check all prerequisites
   - Install dependencies
   - Start the development server

   Or manually:

   ```bash
   npm install
   npm run tauri dev
   ```

## Usage

### Drawing Mode

1. **Activate drawing mode**:
   - Press `Ctrl+Shift+D` or click the drawing mode button in the mini panel

2. **Select a tool**:
   - Use the mini panel or press the tool's hotkey
   - Arrow: `Ctrl+Shift+A`
   - Circle: `Ctrl+Shift+C`
   - Box: `Ctrl+Shift+B`
   - Freehand: `Ctrl+Shift+F`
   - Highlighter: `Ctrl+Shift+H`
   - Text: `Ctrl+Shift+T`

3. **Draw on screen**:
   - Click and drag to create shapes
   - For text: click to place, type your text, press Enter

4. **Deactivate**:
   - Press `Escape` or `Ctrl+Shift+D`

### Mini Panel

- **Drag** the panel to position it anywhere on screen
- **Hide** the panel by dragging it off-screen (useful for recordings)
- **Access settings** via the gear icon

### Settings

Configure:
- Hotkey combinations
- Default colors for each tool
- Line thickness
- Font size for text
- Auto-fade duration

## Development

### Project Structure

```
annotatr/
├── src/              # Frontend (React + TypeScript)
│   ├── components/   # React components
│   ├── hooks/        # Custom React hooks
│   └── lib/          # Utilities
├── src-tauri/        # Backend (Rust)
│   ├── src/          # Rust source code
│   └── Cargo.toml    # Rust dependencies
├── init.sh           # Development setup script
└── README.md         # This file
```

### Available Scripts

- `npm run tauri dev` - Start development server
- `npm run tauri build` - Build for production
- `npm run tauri info` - Display environment information

### Building for Production

```bash
npm run tauri build
```

Built binaries will be in `src-tauri/target/release/bundle/`.

## Default Hotkeys

| Action | Hotkey |
|--------|--------|
| Toggle Drawing Mode | `Ctrl+Shift+D` |
| Arrow Tool | `Ctrl+Shift+A` |
| Circle Tool | `Ctrl+Shift+C` |
| Box Tool | `Ctrl+Shift+B` |
| Freehand Tool | `Ctrl+Shift+F` |
| Highlighter Tool | `Ctrl+Shift+H` |
| Text Tool | `Ctrl+Shift+T` |
| Cancel Drawing | `Escape` |

## Technology Stack

- **Frontend**: React with TypeScript
- **Backend**: Tauri 2 (Rust)
- **Storage**: Tauri's persistent storage API
- **Build System**: Tauri CLI

## License

MIT License - see LICENSE file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Roadmap

- [ ] Additional shapes (lines, polygons)
- [ ] Shape library for saving/reusing annotations
- [ ] Export annotations as images
- [ ] Cloud sync for settings
- [ ] Plugin system for custom tools

## Support

For issues, questions, or suggestions, please open an issue on GitHub.

---

Made with ❤️ for screen recording enthusiasts
