const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

test('fresh submission with HTTP 201 and no trailing slash unlocks via direct result check', async () => {
  const dist = path.resolve(__dirname, '../dist');
  const contents = [];
  const bodies = new Map();
  let action;
  let window;
  let latest;
  let resultChecks = 0;
  const makeContents = () => {
    const wc = Object.assign(new EventEmitter(), {
      url: '', getURL() { return this.url; }, isDestroyed: () => false, focus() {},
      send: (_channel, state) => { latest = state; }, setWindowOpenHandler() {},
      navigationHistory: { canGoBack: () => false },
      async loadURL(url) { this.url = url; },
      session: { fetch: async url => {
        if (!url.includes('/check/')) return { ok: false };
        resultChecks++;
        return { ok: true, json: async () => ({ state: 'SUCCESS', status_code: 10, status_msg: 'Accepted' }) };
      } },
      debugger: Object.assign(new EventEmitter(), {
        attach() {}, sendCommand: async (method, params) => method === 'Network.getResponseBody' ? { body: JSON.stringify(bodies.get(params.requestId)) } : {}
      })
    });
    contents.push(wc); return wc;
  };
  class Window extends EventEmitter {
    constructor() { super(); window = this; }
    webContents = makeContents(); contentView = { addChildView() {} };
    maximized = false; resizable = true;
    isMaximized() { return this.maximized; }
    maximize() { this.maximized = true; }
    setResizable(value) { this.resizable = value; }
    setMaximizable(value) { this.maximizable = value; }
    setFullScreenable() {} setAlwaysOnTop() {} setMinimizable() {} setClosable() {}
    isMinimized() { return false; } show() {} focus() {}
    getContentSize() { return [1440, 920]; } isDestroyed() { return false; }
    async loadFile(file) { this.webContents.url = pathToFileURL(file).href; }
  }
  class View { webContents = makeContents(); setBounds() {} }
  class Tray extends EventEmitter { setToolTip() {} setContextMenu() {} }
  const app = Object.assign(new EventEmitter(), {
    setName() {}, requestSingleInstanceLock: () => true, isPackaged: false,
    getPath: () => '/nonexistent-test-profile', whenReady: async () => {},
    exit: code => { throw new Error(`Unexpected exit ${code}`); }
  });
  const electron = { globalShortcut: { register() {}, unregister() {} }, app, BrowserWindow: Window, WebContentsView: View, Tray, powerMonitor: new EventEmitter(),
    ipcMain: { handle: (_channel, handler) => { action = handler; } },
    Menu: { setApplicationMenu() {}, buildFromTemplate: () => [] }, nativeImage: { createFromBitmap() {} },
    session: { fromPartition: () => ({ cookies: { on() {} }, setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, on() {} }) }
  };
  vm.runInNewContext(readFileSync(path.join(dist, 'main.js'), 'utf8'), {
    require: id => id === 'electron' ? electron : require(id.startsWith('./') ? path.join(dist, id + '.js') : id),
    exports: {}, __dirname: dist, process: { argv: [], platform: 'win32' }, Buffer, URL, AbortSignal, console, setTimeout, clearTimeout
  });
  await new Promise(resolve => setImmediate(resolve));
  await action({ sender: contents[0], senderFrame: { url: contents[0].url } }, 'lock');
  assert.equal(latest.locked, true);
  assert.equal(window.maximized, true);
  assert.equal(window.resizable, false);
  assert.equal(window.maximizable, false);
  const debug = contents[1].debugger;
  bodies.set('fresh', { submission_id: 123 });
  debug.emit('message', {}, 'Network.requestWillBeSent', { requestId: 'fresh', request: { method: 'POST', url: 'https://leetcode.com/problems/two-sum/submit' } });
  debug.emit('message', {}, 'Network.responseReceived', { requestId: 'fresh', response: { status: 201 } });
  debug.emit('message', {}, 'Network.loadingFinished', { requestId: 'fresh' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(resultChecks, 1);
  assert.equal(latest.locked, false);
  assert.equal(window.resizable, true);
  assert.equal(window.maximizable, true);
  assert.match(latest.status, /Accepted/);
  const sender = { sender: contents[0], senderFrame: { url: contents[0].url } };
  await action(sender, 'lock');
  let prevented = false;
  contents[1].emit('before-input-event', { preventDefault: () => { prevented = true; } },
    { type: 'keyDown', key: 'u', control: true, meta: false, shift: true, alt: false, isAutoRepeat: false });
  assert.equal(prevented, true); assert.equal(latest.locked, false);
  await action(sender, 'lock', 'test-password');
  await action(sender, 'emergency');
  assert.equal(latest.emergencyRequested, true); assert.equal(latest.locked, true);
  await action(sender, 'emergency-unlock', 'wrong');
  assert.equal(latest.locked, true); assert.match(latest.emergencyError, /Incorrect/);
  await action(sender, 'emergency-unlock', 'test-password');
  assert.equal(latest.locked, false); assert.equal(latest.passwordProtected, false);
});
