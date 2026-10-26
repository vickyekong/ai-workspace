# AI Workspace

A native macOS desktop workspace for AI-assisted chat, documents, and projects, built with Tauri 2, React, and Rust.

Everything is stored locally in SQLite. AI requests run in the Rust backend behind a provider interface; Phase 1 ships a local mock provider that streams responses, with OpenAI planned next.

## Stack

- **Desktop:** Tauri 2 (Rust), native vibrancy sidebar and overlay title bar
- **UI:** React, TypeScript (strict), Vite, Tailwind CSS v4, shadcn/ui, Motion, Lucide
- **State:** Zustand stores with injected services
- **Storage:** SQLite via `rusqlite`, versioned migrations, stored in the app data directory

## Getting started

Requirements: macOS 13+, Node.js 20+, and Rust stable (via [rustup](https://rustup.rs)).

```bash
npm install
npm run tauri dev
```

`npm run dev` starts a browser preview that uses an in-memory backend in place of SQLite and the native file picker.

## Checks

```bash
npm run check      # TypeScript + frontend unit tests
npm run test:rust  # Rust unit tests
```

## Project layout

```
src/
  app/          shell wiring, navigation, stores, theme, shortcuts
  components/   shared primitives, layout, shadcn/ui
  features/     chat, home, library, projects, history, settings
  services/     typed IPC, persistence and AI service interfaces (Tauri + in-memory)
src-tauri/src/
  ai/           provider trait, registry, mock provider
  db/           migrations and repositories
  commands.rs   Tauri commands exposed to the UI
  library.rs    document import and metadata probing
```

## Security

- The webview has no filesystem, shell, HTTP, or dialog permissions; it can only call the app's own commands, which are listed in `src-tauri/capabilities/default.json`.
- File picking and Finder reveal run in Rust. Removing a document from the library never deletes the file on disk.
- No API keys live in the frontend. Provider credentials will be stored in the macOS Keychain and used only from the Rust backend.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| ⌘1–⌘5 | Home, Chat, Library, Projects, History |
| ⌘N | New chat |
| ⌘, | Settings |
| ⌘\ | Toggle sidebar |
| ⌘[ / ⌘] | Back / forward |
| ⌘F | Focus search |
| Esc | Stop generating |
