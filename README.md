# Time Tracker

A super simple Mac menu bar app for tracking time when developing software — built for people working independently or who just need a lightweight way to track time.

## Features

- Lives in the Mac menu bar — start and stop a timer without leaving your editor
- Organize time by project, with project names auto-derived from a git repo's remote URL
- Optional note per time entry, editable while the timer is running
- Local SQLite storage — your data stays on your machine
- "Today" summary of time tracked per project
- Export all tracked time to an Excel (`.xlsx`) file, with separate local date/time columns for start and stop

## Tech stack

- [Electron](https://www.electronjs.org/) + TypeScript
- [menubar](https://github.com/maxogden/menubar) for the tray UI
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for local storage
- [exceljs](https://github.com/exceljs/exceljs) for Excel export

## Getting started

```bash
npm install
npm run dev
```

This compiles the TypeScript and launches the app via Electron.

## Building a standalone app

```bash
npm run dist
```

This packages a standalone `Time Tracker.app` (and a `.dmg` installer) into the `release/` folder. Since the app isn't notarized with an Apple Developer ID, the first launch will require right-click → **Open** to bypass Gatekeeper's "unidentified developer" warning.

## Usage

1. Click the tray icon and choose **+ Add Project** to point at a project's git repo folder
2. Optionally add a note describing what you're working on
3. Click **Start** to begin tracking, **Stop** to end the session
4. Click **Export to Excel** to save all tracked time to a spreadsheet

## Author

Jason Green — jgreen44@asu.edu
