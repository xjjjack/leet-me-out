# Leet Me Out

A Windows-first Electron + TypeScript practice app. Opens a random LeetCode problem; previously solved questions count when submitted again.

## Run and build

Node.js 22.12 or newer is required.

```sh
npm install
npm start
npm test
npm run pack
npm run dist
```

## Focus behavior (0.1.5)

Focus mode is optional to enable, but requires a password. Its enabled state, salted scrypt password hash, recovery choice, and failed-attempt counter persist in settings.json under Electron's userData directory. Passwords themselves are never saved or returned to the UI.

While enabled, the app stays maximized, on top, and cannot be resized or minimized. A fresh Accepted submission OR the configurable shortcut followed by the password permits closing for the current session. Neither turns focus mode off. Closing never requires a password. Quit app also preserves focus mode. Only a fresh Accepted enables the separate Quit focus mode button; that action requires the password and disables persistent focus. Closing to the tray (when wake reminders are enabled), quitting, or reopening resets permission to close.

Quit focus mode is disabled until a problem is solved in the current session. The shortcut grants close permission only; it does not enable that button. The shortcut defaults to Ctrl+Shift+U on Windows and Command+Shift+U on Mac. Configure it before enabling persistent focus. Local keyboard handling supports the embedded page when a global shortcut is unavailable.

Forgotten-password recovery is always available: ten incorrect attempts disable focus mode and clear its password. A correct password resets the counter; failed attempts persist across restarts. This deliberate recovery route is part of the commitment design. Task Manager / Force Quit remain available, but force-quitting does not clear persistent focus.

## Browser and reminders

- Uses sandboxed Chromium, no Node access or app bridge in remote pages.
- Persistent LeetCode login; Sign in hides after userStatus confirms authentication.
- Free problem catalog with a 30-question offline fallback collection.
- Optional wake/unlock reminders and installed-app sign-in launch; defaults off.
- Close hides to tray when wake reminders are enabled; Quit app stops the app once closing is permitted.
- Navigation limited to LeetCode and selected login providers. Downloads and browser permissions disabled.

The detector captures a new submission ID, observes its result, and also polls that exact ID using the user's browser session. Opening historical Accepted pages does not count. Matching is scoped to the practice session. Connection details show verification progress; code and credentials are not logged.

## Validation status

TypeScript compilation and 16 automated tests pass, including simulated main-process submission, close/password gating, startup, persistent policy, and recovery flows. Windows x64 NSIS packaging is available. Installers are unsigned development previews.

User testing confirmed that the embedded app and LeetCode load. Live acceptance integration, the new persistent-focus flow, OS wake/sign-in behavior, and macOS still require manual verification. Native Electron smoke tests from the development sandbox failed with a GPU subprocess error, so automated tests use a mocked Electron runtime. Mac distribution needs native testing and signing/notarization.

Not affiliated with LeetCode.
