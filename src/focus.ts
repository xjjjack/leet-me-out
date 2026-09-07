import type { BrowserWindow } from 'electron';

type FocusWindow = Pick<BrowserWindow, 'isMaximized' | 'maximize' | 'setResizable' | 'setMaximizable' | 'setFullScreenable' | 'setAlwaysOnTop' | 'setMinimizable' | 'setClosable'>;

export function applyFocusMode(win: FocusWindow, enabled: boolean) {
  if (enabled && !win.isMaximized()) win.maximize();
  win.setResizable(!enabled);
  win.setMaximizable(!enabled);
  win.setFullScreenable(!enabled);
  win.setAlwaysOnTop(enabled, 'floating');
  win.setMinimizable(!enabled);
  win.setClosable(!enabled);
}
