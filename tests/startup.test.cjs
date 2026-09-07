const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('actual main startup navigates and registers wake events even when detector hangs', async () => {
  const events = [];
  let url = '';
  const makeContents = () => Object.assign(new EventEmitter(), {
    getURL: () => url, send: () => {}, setWindowOpenHandler: () => {},
    navigationHistory: { canGoBack: () => false },
    loadURL: async target => { events.push('navigate'); url = target; },
    session: { fetch: async () => ({ ok: false }) },
    debugger: Object.assign(new EventEmitter(), {
      attach: () => {}, sendCommand: () => { events.push('detector'); return new Promise(() => {}); }
    })
  });
  class Window extends EventEmitter {
    webContents = makeContents();
    contentView = { addChildView() {} };
    getContentSize() { return [1440, 920]; }
    isDestroyed() { return false; }
    async loadFile() {}
  }
  class View { webContents = makeContents(); setBounds() {} }
  class Tray extends EventEmitter { setToolTip() {} setContextMenu() {} }
  const app = Object.assign(new EventEmitter(), {
    setName() {}, requestSingleInstanceLock: () => true, isPackaged: false,
    getPath: () => '/nonexistent-test-profile', whenReady: async () => {},
    exit: code => { throw new Error(`Unexpected app exit ${code}`); }
  });
  const powerMonitor = new EventEmitter();
  const electron = { globalShortcut: { register() {}, unregister() {} },
    app, BrowserWindow: Window, WebContentsView: View, Tray, powerMonitor,
    ipcMain: { handle() {} }, Menu: { setApplicationMenu() {}, buildFromTemplate: () => [] },
    nativeImage: { createFromBitmap() {} },
    session: { fromPartition: () => ({ cookies: { on() {} }, setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, on() {} }) }
  };
  const timers = [];
  const dist = path.resolve(__dirname, '../dist');
  vm.runInNewContext(readFileSync(path.join(dist, 'main.js'), 'utf8'), {
    require: id => id === 'electron' ? electron : require(id.startsWith('./') ? path.join(dist, id + '.js') : id),
    exports: {}, __dirname: dist, process: { argv: [], platform: 'win32' }, Buffer, URL, AbortSignal, console,
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {}
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(url, /^https:\/\/leetcode\.com\/problems\/[a-z0-9-]+\/$/);
  assert.deepEqual(events.slice(0, 2), ['navigate', 'detector']);
  assert.equal(powerMonitor.listenerCount('resume'), 1);
  assert.equal(powerMonitor.listenerCount('unlock-screen'), 1);
  // Timeout settles the pending detector without crashing startup.
  timers.forEach(callback => callback());
  await new Promise(resolve => setImmediate(resolve));
});
