import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('practice', {
  action: (name: string, value?: unknown) => ipcRenderer.invoke('action', name, value),
  onState: (callback: (state: unknown) => void) => {
    ipcRenderer.on('state', (_event, state) => callback(state));
    void ipcRenderer.invoke('action', 'state').then(callback);
  }
});
