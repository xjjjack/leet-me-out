# Leet Me Out

Freedom is one accepted submission away.

A Windows-first Electron + TypeScript desktop app that opens LeetCode for a practice rep. The code also targets macOS; Mac behavior has not yet been tested.

## Run locally

Use Node.js 22.12 or newer.

```sh
npm install
npm start
```

## What the preview does

- Opens a random problem in an isolated Chromium browser, with persistent LeetCode login.
- Lets you browse to any question, including previously solved ones.
- Refreshes a catalog of free problems; falls back to 30 starter questions if unavailable.
- Offers an explicit focus lock: always on top, no normal close or minimize, until a fresh submission is accepted.
- Optionally reappears on wake / screen unlock. Close hides to the tray when this option is on; tray Quit stops the background process.
- Supports sign-in launch in a packaged/installed build. Defaults are off.
- Leaves Task Manager / macOS Force Quit available as the emergency exit.

Wake events are coalesced over 10 seconds. During an active lock, waking preserves the page to avoid erasing code. Otherwise waking chooses a new problem. Focus mode is enabled manually for each session in this preview.

## Acceptance detection

The app observes submission and result responses through Electron's Chromium debugging interface. Only a newly observed `submission_id` followed by its matching successful result (`state: SUCCESS`, `status_code: 10`) counts. Opening an old Accepted page does not unlock. Pending requests from a previous focus session are rejected. Response bodies are processed in memory and never logged or saved.

LeetCode's endpoints are not a supported integration contract and may change. Live login, submission detection, and provider popup flows still need manual verification. Opening DevTools for the embedded page may detach the detector. This is a commitment tool, not an OS kiosk or tamper-proof security boundary.

Remote content has no Node access or app bridge. App controls run in a separate local renderer with a narrow, sender-validated IPC bridge. Navigation is limited to LeetCode and selected login-provider hosts; downloads and browser permission requests are disabled. No passwords are collected by the application UI.

## Validate / package

```sh
npm test
npm run pack
npm run dist
```

`pack` produces an unpacked app under `release/`. Windows distribution uses NSIS; macOS uses DMG. Public distribution still needs signing, and macOS needs a Mac build, signing/notarization, and native testing.

## Manual review checklist

1. Sign in inside the app; restart and check that login persists.
2. Browse and switch questions, including solved ones.
3. Enable focus mode, submit a wrong answer (stay locked), then a fresh Accepted (unlock).
4. Verify an old Accepted submission does not unlock.
5. Check offline/reload behavior and emergency force quit.
6. Enable wake reminders, close to tray, then sleep/wake and lock/unlock the OS.
7. Install the packaged app, enable sign-in launch, then sign out/in.
8. On macOS, test Spaces, fullscreen workspaces, minimize, normal quit, and Force Quit.

Not affiliated with LeetCode.

## Preview validation status

TypeScript compilation, six automated tests, and Windows x64 NSIS packaging pass. The desktop smoke test could not complete inside the development sandbox: Electron's GPU subprocess exits with `0xC0000135` and the local page fails to load. A launch outside that environment is needed to establish whether this is an environment restriction or a desktop runtime issue. No live login, Accepted detection, wake/login launch, or macOS behavior has been verified yet. The installer is an unsigned development preview.
