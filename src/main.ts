import { app, BrowserWindow, WebContentsView, ipcMain, session, powerMonitor, Menu, Tray, nativeImage, globalShortcut } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AcceptanceTracker, chooseProblem, endpoint, isLeetCode, navigationAllowed, starterProblems } from './core';
import { applyFocusMode } from './focus';
import { readSignedIn } from './auth';
import { EmergencyPassword, validShortcut, matchesShortcut } from './emergency';
import { FocusPolicy } from './policy';

const testMode = process.argv.includes('--smoke-test');
const dataDirArg = process.argv.find(v => v.startsWith('--data-dir='));
if (dataDirArg) { const dir = path.resolve(dataDirArg.slice(11)); mkdirSync(dir, { recursive: true }); app.setPath('userData', dir); }
app.setName('Leet Me Out');
const single = app.requestSingleInstanceLock();
if (!single) app.quit();

type Settings = { wake: boolean; login: boolean; shortcut: string };
let settings: Settings = { wake: false, login: false, shortcut: 'CommandOrControl+Shift+U' };
let win: BrowserWindow;
let view: WebContentsView;
let tray: Tray;
let locked = false;
let quitting = false;
let status = 'Pick a problem. Earn your freedom.';
let detector = 'Connecting';
let detectorDetail = 'Waiting for a new submission.';
let signedIn = false;
let authTimer: ReturnType<typeof setTimeout> | undefined;
let authGeneration = 0;
const policy = new FocusPolicy();
const emergencyPassword = policy.password;
let exitIntent: 'permit' | 'disable' = 'permit';
let emergencyRequested = false;
let emergencyError = '';
let current = '';
let pool = [...starterProblems];
let catalog = 'Starter collection · 30 problems';
let lastWake = 0;
const tracker = new AcceptanceTracker();
const uiPath = path.join(__dirname, 'ui/index.html');
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function state() {
  return { locked, status, detector, detectorDetail, signedIn, current, catalog, settings,
    emergencyShortcut: settings.shortcut.replace('CommandOrControl', process.platform === 'darwin' ? 'Command' : 'Control'),
    emergencyRequested, emergencyError, exitIntent, mayClose: policy.mayClose, solved: policy.solved, recovery: policy.recovery,
    passwordProtected: emergencyPassword.enabled, packaged: app.isPackaged,
    url: view?.webContents.getURL() || '', canBack: view?.webContents.navigationHistory.canGoBack() || false };
}
function update() { if (win && !win.isDestroyed()) win.webContents.send('state', state()); }
function save() { writeFileSync(settingsPath(), JSON.stringify({ ...settings, focus: policy.export() }, null, 2)); }
function scheduleAuthCheck() {
  const generation = ++authGeneration;
  if (authTimer) clearTimeout(authTimer);
  authTimer = setTimeout(() => {
    void readSignedIn(view.webContents.session).then(result => {
      if (generation !== authGeneration || view.webContents.isDestroyed()) return;
      signedIn = result === true; update();
    });
  }, 500);
}
function show() { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function lock(value: boolean) {
  locked = value;
  if (value) {
    // In-window shortcut handling remains available if another app owns the global shortcut.
    globalShortcut.register(settings.shortcut, requestEmergencyExit);
  } else {
    globalShortcut.unregister(settings.shortcut);
    emergencyRequested = false; emergencyError = '';
  }
  applyFocusMode(win, value);
  win.setClosable(!value || policy.mayClose);
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(value, { visibleOnFullScreen: value });
  update();
  refreshTray();
}
function requestEmergencyExit() {
  if (!locked) return;
  exitIntent = 'permit';
  emergencyRequested = true; emergencyError = ''; show(); win.webContents.focus(); update();
}
function grantClose() {
  policy.permitClose();
  win.setClosable(true); refreshTray(); update();
}
function requestQuitFocus() {
  if (!locked || !policy.solved) return;
  exitIntent = 'disable'; emergencyRequested = true; emergencyError = ''; show(); win.webContents.focus(); update();
}
function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Leet Me Out', click: show },
    { label: 'Quit focus mode', enabled: locked && policy.solved, click: requestQuitFocus },
    { label: 'Quit app', enabled: !locked || policy.mayClose, click: () => {
      if (!locked || policy.mayClose) { quitting = true; app.quit(); }
    } }
  ]));
}
async function navigate(url: string) {
  if (!navigationAllowed(url)) { status = 'That destination is not supported in this practice browser.'; update(); return; }
  try { await view.webContents.loadURL(url); }
  catch { status = 'Could not load the page. Check your connection, then Reload.'; update(); }
}
async function random() {
  current = chooseProblem(pool, current);
  status = locked ? 'Solve any problem to unlock. You can switch questions.' : 'Your next rep is ready.';
  update();
  await navigate(`https://leetcode.com/problems/${current}/`);
}

async function refreshCatalog() {
  try {
    const response = await view.webContents.session.fetch('https://leetcode.com/api/problems/all/', { signal: AbortSignal.timeout(12000) });
    if (!response.ok) return;
    const data = await response.json() as { stat_status_pairs?: Array<{ paid_only?: boolean; stat?: { question__title_slug?: string } }> };
    const slugs = data.stat_status_pairs?.filter(p => p.paid_only === false).map(p => p.stat?.question__title_slug)
      .filter((s): s is string => typeof s === 'string' && /^[a-z0-9-]+$/.test(s));
    if (slugs?.length) { pool = [...new Set(slugs)]; catalog = `${pool.length.toLocaleString()} free problems`; update(); }
  } catch { /* Starter collection works when the catalog is unavailable. */ }
}

async function attachDetector() {
  const wc = view.webContents;
  const requests = new Map<string, { url: string; epoch: number; response: boolean }>();
  const polling = new Set<string>();
  function consume(url: string, data: unknown, epoch: number) {
    if (epoch !== tracker.epoch) return;
    if (tracker.observe(url, data, epoch)) {
      detectorDetail = 'Accepted verified for this session.';
      if (locked) { policy.accepted(); grantClose(); status = 'Accepted! You can close without a password, or use Quit focus mode with your password.'; }
      else status = 'Accepted! Nice work.';
      update();
    }
  }
  async function pollSubmission(id: string, epoch: number) {
    const key = `${epoch}:${id}`;
    if (polling.has(key)) return;
    polling.add(key);
    const url = `https://leetcode.com/submissions/detail/${id}/check/`;
    try {
      for (let attempt = 0; attempt < 60 && epoch === tracker.epoch && !wc.isDestroyed(); attempt++) {
        try {
          const response = await wc.session.fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json() as { state?: string; status_code?: number; status_msg?: string };
          if (epoch !== tracker.epoch) return;
          detectorDetail = `Submission ${id}: ${data.status_msg || data.state || 'checking'}`;
          consume(url, data, epoch); update();
          if (data.state === 'SUCCESS') return;
        } catch {
          if (epoch !== tracker.epoch || wc.isDestroyed()) return;
          detectorDetail = `Submission ${id}: result check failed; retrying.`; update();
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (epoch === tracker.epoch && !wc.isDestroyed()) {
        detectorDetail = `Submission ${id}: verification timed out. Submit again to retry.`; update();
      }
    } finally { polling.delete(key); }
  }
  try {
    wc.debugger.attach('1.3');
    wc.debugger.on('message', (_event, method, params) => {
      if (method === 'Network.requestWillBeSent') {
        const route = endpoint(params.request.url);
        if (route && (route.kind !== 'submit' || params.request.method === 'POST'))
          requests.set(params.requestId, { url: params.request.url, epoch: tracker.epoch, response: false });
        if (route?.kind === 'submit' && params.request.method === 'POST') {
          detectorDetail = 'Submission sent; waiting for its ID.'; update();
        }
      }
      if (method === 'Network.responseReceived') {
        const item = requests.get(params.requestId);
        if (item) {
          item.response = params.response.status >= 200 && params.response.status < 300;
          if (!item.response) { detectorDetail = `Submission endpoint returned HTTP ${params.response.status}.`; update(); }
        }
      }
      if (method === 'Network.loadingFailed') requests.delete(params.requestId);
      if (method === 'Network.loadingFinished') {
        const item = requests.get(params.requestId);
        requests.delete(params.requestId);
        if (!item?.response) return;
        void wc.debugger.sendCommand('Network.getResponseBody', { requestId: params.requestId }).then(result => {
          const body = result.base64Encoded ? Buffer.from(result.body, 'base64').toString('utf8') : result.body;
          const data = JSON.parse(body);
          consume(item.url, data, item.epoch);
          if (endpoint(item.url)?.kind === 'submit' && item.epoch === tracker.epoch) {
            const id = String(data.submission_id ?? '');
            if (/^\d+$/.test(id)) {
              detectorDetail = `Submission ${id}: checking result.`; update();
              void pollSubmission(id, item.epoch);
            } else { detectorDetail = 'Submission response did not include an ID.'; update(); }
          }
        }).catch(() => { detectorDetail = `Could not read ${endpoint(item.url)?.kind || 'submission'} response. Reload and submit again.`; update(); });
      }
    });
    wc.debugger.on('detach', () => { detector = 'Disconnected — restart before using focus lock'; update(); });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        wc.debugger.sendCommand('Network.enable', { maxTotalBufferSize: 16000000, maxResourceBufferSize: 2000000, enableDurableMessages: true }),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('Detector initialization timed out')), 10000);
        })
      ]);
    } finally { if (timeout) clearTimeout(timeout); }
    detector = 'Ready · live LeetCode verification pending';
  } catch { detector = 'Unavailable — restart before using focus lock'; }
  update();
}

function resize() { const [width, height] = win.getContentSize(); view.setBounds({ x: 280, y: 0, width: Math.max(1, width - 280), height }); }
function wake() {
  if (!settings.wake || Date.now() - lastWake < 10000) return;
  lastWake = Date.now();
  show();
  if (locked && policy.mayClose) { policy.newSession(); tracker.reset(); win.setClosable(false); refreshTray(); void random(); }
  if (!locked) { tracker.reset(); void random(); }
}

async function start() {
  try { const stored = JSON.parse(readFileSync(settingsPath(), 'utf8')); settings = { wake: stored.wake === true, login: stored.login === true, shortcut: validShortcut(stored.shortcut) ? stored.shortcut : settings.shortcut }; policy.restore(stored.focus); } catch { /* First launch. */ }
  if (app.isPackaged) settings.login = app.getLoginItemSettings().openAtLogin;
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ title: 'Leet Me Out', width: 1440, height: 920, minWidth: 1000, minHeight: 640,
    backgroundColor: '#11151a', show: !testMode,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  const ses = session.fromPartition('persist:leetcode');
  ses.cookies.on('changed', (_event, cookie) => {
    if (cookie.name === 'LEETCODE_SESSION' && /(^|\.)leetcode\.com$/.test(cookie.domain ?? '')) scheduleAuthCheck();
  });
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', event => event.preventDefault());
  view = new WebContentsView({ webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  win.contentView.addChildView(view);
  resize(); win.on('resize', resize);
  for (const contents of [win.webContents, view.webContents]) {
    contents.on('before-input-event', (event, input) => {
      if (locked && input.type === 'keyDown' && !input.isAutoRepeat && matchesShortcut(settings.shortcut, input, process.platform === 'darwin')) {
        event.preventDefault(); requestEmergencyExit();
      }
    });
  }
  win.on('unmaximize', () => { if (locked) win.maximize(); });
  win.on('will-resize', event => { if (locked) event.preventDefault(); });
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('will-navigate', (event, url) => { if (!navigationAllowed(url)) event.preventDefault(); });
  view.webContents.on('will-redirect', (event, url) => { if (!navigationAllowed(url)) event.preventDefault(); });
  view.webContents.setWindowOpenHandler(({ url }) => { if (navigationAllowed(url)) void navigate(url); return { action: 'deny' }; });
  view.webContents.on('did-navigate', () => { update(); scheduleAuthCheck(); });
  view.webContents.on('did-navigate-in-page', () => { update(); scheduleAuthCheck(); });
  view.webContents.on('did-fail-load', (_e, code, _desc, _url, mainFrame) => {
    if (mainFrame && code !== -3) { status = 'Page unavailable. Check your connection and Reload.'; update(); }
  });
  view.webContents.on('render-process-gone', () => { status = 'Browser stopped. Reload to recover, or use Task Manager / Force Quit.'; update(); });
  win.on('close', event => {
    if (quitting) return;
    if (locked && !policy.mayClose) { event.preventDefault(); show(); return; }
    if (settings.wake) {
      event.preventDefault();
      if (locked) { policy.newSession(); tracker.reset(); win.setClosable(false); refreshTray(); update(); }
      win.hide();
    } else quitting = true;
  });
  win.on('closed', () => { if (!view.webContents.isDestroyed()) view.webContents.close(); });
  // A small native tray icon; remains available while the window is hidden.
  const pixels = Buffer.alloc(16 * 16 * 4);
  for (let y = 2; y < 14; y++) for (let x = 3; x < 13; x++) {
    const i = (y * 16 + x) * 4;
    pixels[i] = 102; pixels[i + 1] = 220; pixels[i + 2] = 190; pixels[i + 3] = 255;
  }
  tray = new Tray(nativeImage.createFromBitmap(pixels, { width: 16, height: 16 }));
  tray.setToolTip('Leet Me Out');
  refreshTray();
  tray.on('click', show);
  ipcMain.handle('action', async (event, name: string, value: unknown) => {
    if (event.sender !== win.webContents || event.senderFrame?.url !== pathToFileURL(uiPath).href) throw new Error('Untrusted request');
    switch (name) {
      case 'state': break;
      case 'quit-focus': requestQuitFocus(); break;
      case 'shortcut':
        if (!locked && validShortcut(value)) {
          if (!globalShortcut.register(value, () => {})) throw new Error('Shortcut is unavailable');
          globalShortcut.unregister(value); settings.shortcut = value; save();
        } else throw new Error('Invalid shortcut');
        break;
      case 'random': await random(); break;
      case 'browse': await navigate('https://leetcode.com/problemset/'); break;
      case 'login': await navigate('https://leetcode.com/accounts/login/'); break;
      case 'reload': view.webContents.reload(); break;
      case 'back': if (view.webContents.navigationHistory.canGoBack()) view.webContents.navigationHistory.goBack(); break;
      case 'lock':
        if (!locked && detector.startsWith('Ready')) {
          const options = value as { password?: unknown; recovery?: unknown } | undefined;
          if (typeof options?.password !== 'string' || !options.password || options.password.length > 128) throw new Error('A password is required');
          const previous = policy.export();
          policy.enable(options.password);
          try { save(); } catch (error) { policy.restore(previous); throw error; }
          tracker.reset(); detectorDetail = 'Waiting for a new submission.'; status = 'Focus mode on. Get a fresh Accepted on any problem to leave.'; lock(true);
        }
        break;
      case 'emergency-cancel': emergencyRequested = false; emergencyError = ''; break;
      case 'emergency-unlock':
        if (locked && emergencyRequested && typeof value === 'string') {
          const previous = policy.export();
          const result = policy.verify(value);
          if (result === 'valid' && exitIntent === 'disable' && policy.solved) policy.disable();
          try { save(); } catch (error) { policy.restore(previous); throw error; }
          if (result === 'valid') {
            emergencyRequested = false; emergencyError = '';
            if (exitIntent === 'permit') { grantClose(); status = 'You can close once without another password. Focus mode stays on for your next launch.'; }
            else if (!policy.enabled) { tracker.reset(); lock(false); status = 'Focus mode is off.'; }
          } else if (result === 'recovered') {
            tracker.reset(); lock(false); status = 'Recovery completed. Focus mode is off and its password has been cleared.';
          } else emergencyError = policy.recovery ? `Incorrect password. ${10 - policy.failures} attempts remain before recovery.` : 'Incorrect password. Try again.';
        }
        break;
      case 'wake':
        if (!locked && typeof value === 'boolean') { settings.wake = value; save(); }
        break;
      case 'startup':
        if (!locked && app.isPackaged && typeof value === 'boolean') {
          app.setLoginItemSettings({ openAtLogin: value }); settings.login = app.getLoginItemSettings().openAtLogin; save();
        }
        break;
      default: throw new Error('Unknown action');
    }
    update(); return state();
  });
  await win.loadFile(uiPath);
  if (policy.enabled && !testMode) { lock(true); status = 'Focus mode is on. Solve a problem or use your shortcut.'; }
  tracker.reset();
  // Create the browser's renderer by navigating before enabling CDP Network.
  // Detector initialization must never block the initial question or wake handlers.
  const firstPage = testMode ? view.webContents.loadURL('about:blank') : random();
  const detectorReady = attachDetector();
  powerMonitor.on('resume', wake);
  powerMonitor.on('unlock-screen', wake);
  if (testMode) {
    await Promise.all([firstPage, detectorReady]);
    console.log('SMOKE: window, sandboxed browser, IPC, and detector initialized');
    const snapshot = await win.webContents.executeJavaScript('({title: document.title, buttons: document.querySelectorAll("button").length, bridge: typeof window.practice.action})');
    console.log('SMOKE:', JSON.stringify(snapshot));
    const bridgeState = await win.webContents.executeJavaScript('window.practice.action("state")');
    if (!bridgeState.detector.startsWith('Ready')) throw new Error('Detector did not attach');
    lock(true);
    if (!win.isAlwaysOnTop() || win.isMinimizable() || win.isClosable()) throw new Error('Focus window settings failed');
    lock(false);
    console.log('SMOKE: focus lock and unlock passed');
    quitting = true; app.quit();
  } else { void refreshCatalog(); }
}

app.on('before-quit', event => { if (quitting) return; if (locked && !policy.mayClose) { event.preventDefault(); show(); } else quitting = true; });
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (win && !win.isDestroyed()) show(); });
app.on('second-instance', () => { if (win && !win.isDestroyed()) show(); });
if (single) void app.whenReady().then(start).catch(error => { console.error(error); app.exit(1); });
