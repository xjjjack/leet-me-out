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

## Focus behavior (0.1.4)

Focus mode is optional to enable, but requires a password. Its enabled state, salted scrypt password hash, recovery choice, and failed-attempt counter persist in settings.json under Electron's userData directory. Passwords themselves are never saved or returned to the UI.

While enabled, the app stays maximized, on top, and cannot be resized or minimized. A fresh Accepted submission OR the configurable shortcut followed by the password permits closing for the current session. Neither turns focus mode off. Close and tray Quit both require the password again. Closing to the tray (when wake reminders are enabled), quitting, or reopening resets permission to close.

There is no Exit focus mode button. The shortcut defaults to Ctrl+Shift+U on Windows and Command+Shift+U on Mac. Configure it before enabling persistent focus. Local keyboard handling supports the embedded page when a global shortcut is unavailable.

An optional recovery checkbox is OFF by default. When enabled, ten incorrect password attempts disable persistent focus and clear its password. Correct verification resets the counter. Anyone can intentionally trigger this recovery; this is a commitment tool, not a security boundary. With recovery off, a forgotten password requires manually resetting local app settings. Reinstallation alone does not guarantee settings are removed. Task Manager / Force Quit remain available, but force-quitting does not clear persistent focus.

## Browser and reminders

- Uses sandboxed Chromium, no Node access or app bridge in remote pages.
- Persistent LeetCode login; Sign in hides after userStatus confirms authentication.
- Free problem catalog with a 30-question offline fallback collection.
- Optional wake/unlock reminders and installed-app sign-in launch; defaults off.
- Close hides to tray when wake reminders are enabled; authenticated Quit stops the app.
- Navigation limited to LeetCode and selected login providers. Downloads and browser permissions disabled.

The detector captures a new submission ID, observes its result, and also polls that exact ID using the user's browser session. Opening historical Accepted pages does not count. Matching is scoped to the practice session. Connection details show verification progress; code and credentials are not logged.

## Validation status

TypeScript compilation and 15 automated tests pass, including simulated main-process submission, close/password gating, startup, persistent policy, and recovery flows. Windows x64 NSIS packaging is available. Installers are unsigned development previews.

User testing confirmed that the embedded app and LeetCode load. Live acceptance integration, the new persistent-focus flow, OS wake/sign-in behavior, and macOS still require manual verification. Native Electron smoke tests from the development sandbox failed with a GPU subprocess error, so automated tests use a mocked Electron runtime. Mac distribution needs native testing and signing/notarization.

Not affiliated with LeetCode.
