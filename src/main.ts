import { app, BrowserWindow, WebContentsView, ipcMain, session, powerMonitor, Menu, Tray, nativeImage } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AcceptanceTracker, chooseProblem, endpoint, isLeetCode, navigationAllowed, starterProblems } from './core';

const testMode = process.argv.includes('--smoke-test');
const dataDirArg = process.argv.find(v => v.startsWith('--data-dir='));
if (dataDirArg) { const dir = path.resolve(dataDirArg.slice(11)); mkdirSync(dir, { recursive: true }); app.setPath('userData', dir); }
app.setName('Leet Me Out');
const single = app.requestSingleInstanceLock();
if (!single) app.quit();

type Settings = { wake: boolean; login: boolean };
let settings: Settings = { wake: false, login: false };
let win: BrowserWindow;
let view: WebContentsView;
let tray: Tray;
let locked = false;
let quitting = false;
let status = 'Pick a problem. Earn your freedom.';
let detector = 'Connecting';
let current = '';
let pool = [...starterProblems];
let catalog = 'Starter collection · 30 problems';
let lastWake = 0;
const tracker = new AcceptanceTracker();
const uiPath = path.join(__dirname, 'ui/index.html');
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function state() {
  return { locked, status, detector, current, catalog, settings, packaged: app.isPackaged,
    url: view?.webContents.getURL() || '', canBack: view?.webContents.navigationHistory.canGoBack() || false };
}
function update() { if (win && !win.isDestroyed()) win.webContents.send('state', state()); }
function save() { writeFileSync(settingsPath(), JSON.stringify(settings, null, 2)); }
function show() { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function lock(value: boolean) {
  locked = value;
  win.setAlwaysOnTop(value, 'floating');
  win.setMinimizable(!value);
  win.setClosable(!value);
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(value, { visibleOnFullScreen: value });
  update();
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
  try {
    wc.debugger.attach('1.3');
    wc.debugger.on('message', (_event, method, params) => {
      if (method === 'Network.requestWillBeSent') {
        const route = endpoint(params.request.url);
        if (route && (route.kind !== 'submit' || params.request.method === 'POST'))
          requests.set(params.requestId, { url: params.request.url, epoch: tracker.epoch, response: false });
      }
      if (method === 'Network.responseReceived') {
        const item = requests.get(params.requestId);
        if (item) item.response = params.response.status === 200;
      }
      if (method === 'Network.loadingFailed') requests.delete(params.requestId);
      if (method === 'Network.loadingFinished') {
        const item = requests.get(params.requestId);
        requests.delete(params.requestId);
        if (!item?.response) return;
        void wc.debugger.sendCommand('Network.getResponseBody', { requestId: params.requestId }).then(result => {
          const body = result.base64Encoded ? Buffer.from(result.body, 'base64').toString('utf8') : result.body;
          if (tracker.observe(item.url, JSON.parse(body), item.epoch)) {
            lock(false); status = 'Accepted! You earned your freedom. Another rep?'; update();
          }
        }).catch(() => { detector = 'Could not read a submission result. Reload and try again.'; update(); });
      }
    });
    wc.debugger.on('detach', () => { detector = 'Disconnected — restart before using focus lock'; update(); });
    await wc.debugger.sendCommand('Network.enable');
    detector = 'Ready · live LeetCode verification pending';
  } catch { detector = 'Unavailable — restart before using focus lock'; }
  update();
}

function resize() { const [width, height] = win.getContentSize(); view.setBounds({ x: 280, y: 0, width: Math.max(1, width - 280), height }); }
function wake() {
  if (!settings.wake || Date.now() - lastWake < 10000) return;
  lastWake = Date.now();
  show();
  if (!locked) { tracker.reset(); void random(); }
}

async function start() {
  try { const stored = JSON.parse(readFileSync(settingsPath(), 'utf8')); settings = { wake: stored.wake === true, login: stored.login === true }; } catch { /* First launch. */ }
  if (app.isPackaged) settings.login = app.getLoginItemSettings().openAtLogin;
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ title: 'Leet Me Out', width: 1440, height: 920, minWidth: 1000, minHeight: 640,
    backgroundColor: '#11151a', show: !testMode,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  const ses = session.fromPartition('persist:leetcode');
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', event => event.preventDefault());
  view = new WebContentsView({ webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  win.contentView.addChildView(view);
  resize(); win.on('resize', resize);
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('will-navigate', (event, url) => { if (!navigationAllowed(url)) event.preventDefault(); });
  view.webContents.on('will-redirect', (event, url) => { if (!navigationAllowed(url)) event.preventDefault(); });
  view.webContents.setWindowOpenHandler(({ url }) => { if (navigationAllowed(url)) void navigate(url); return { action: 'deny' }; });
  view.webContents.on('did-navigate', () => update());
  view.webContents.on('did-navigate-in-page', () => update());
  view.webContents.on('did-fail-load', (_e, code, _desc, _url, mainFrame) => {
    if (mainFrame && code !== -3) { status = 'Page unavailable. Check your connection and Reload.'; update(); }
  });
  view.webContents.on('render-process-gone', () => { status = 'Browser stopped. Reload to recover, or use Task Manager / Force Quit.'; update(); });
  win.on('close', event => {
    if (quitting) return;
    if (locked) { event.preventDefault(); show(); }
    else if (settings.wake) { event.preventDefault(); win.hide(); }
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
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Leet Me Out', click: show },
    { label: 'Quit', click: () => { if (locked) { show(); return; } quitting = true; app.quit(); } }
  ]));
  tray.on('click', show);
  ipcMain.handle('action', async (event, name: string, value: unknown) => {
    if (event.sender !== win.webContents || event.senderFrame?.url !== pathToFileURL(uiPath).href) throw new Error('Untrusted request');
    switch (name) {
      case 'state': break;
      case 'random': await random(); break;
      case 'browse': await navigate('https://leetcode.com/problemset/'); break;
      case 'login': await navigate('https://leetcode.com/accounts/login/'); break;
      case 'reload': view.webContents.reload(); break;
      case 'back': if (view.webContents.navigationHistory.canGoBack()) view.webContents.navigationHistory.goBack(); break;
      case 'lock':
        if (!locked && detector.startsWith('Ready')) { tracker.reset(); status = 'Focus mode on. Get a fresh Accepted on any problem to leave.'; lock(true); }
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
  await attachDetector();
  tracker.reset();
  if (testMode) {
    await view.webContents.loadURL('about:blank');
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
  } else { void random(); void refreshCatalog(); }
  powerMonitor.on('resume', wake);
  powerMonitor.on('unlock-screen', wake);
}

app.on('before-quit', event => { if (locked) { event.preventDefault(); show(); } else quitting = true; });
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (win && !win.isDestroyed()) show(); });
app.on('second-instance', () => { if (win && !win.isDestroyed()) show(); });
if (single) void app.whenReady().then(start).catch(error => { console.error(error); app.exit(1); });
