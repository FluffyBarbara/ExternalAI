'use strict';
// Безопасный мост между интерфейсом и системой.
const { contextBridge, ipcRenderer } = require('electron');

function on(channel, fn) {
  const wrapped = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('ext', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    patch: (partial) => ipcRenderer.invoke('settings:patch', partial),
  },
  action: (name, args) => ipcRenderer.invoke('action', name, args),
  ai: {
    ask: (text) => ipcRenderer.invoke('ai:ask', text),
    reset: () => ipcRenderer.invoke('ai:reset'),
    test: () => ipcRenderer.invoke('ai:test'),
    onEvent: (fn) => on('ai:event', fn),
  },
  model: {
    status: () => ipcRenderer.invoke('model:status'),
    ensure: () => ipcRenderer.invoke('model:ensure'),
    import: () => ipcRenderer.invoke('model:import'),
    remove: () => ipcRenderer.invoke('model:remove'),
    onProgress: (fn) => on('model:progress', fn),
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    state: () => ipcRenderer.invoke('update:state'),
    onState: (fn) => on('update:state', fn),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
    openUserData: () => ipcRenderer.invoke('app:openUserData'),
    warmup: () => ipcRenderer.invoke('app:warmup'),
    quit: () => ipcRenderer.send('app:quit'),
    relaunch: () => ipcRenderer.send('app:relaunch'),
  },
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMaximize: () => ipcRenderer.send('win:toggleMaximize'),
    close: () => ipcRenderer.send('win:close'),
    hide: () => ipcRenderer.send('win:hide'),
    show: () => ipcRenderer.send('win:show'),
    onState: (fn) => on('win:state', fn),
  },
  onHotkey: (fn) => on('hotkey', fn),
  // Запросы от main (подтверждения, таймеры) — обработчик возвращает значение.
  onRpc: (handler) => on('rpc:request', async ({ id, method, payload }) => {
    let value = null;
    try { value = await handler(method, payload); } catch (e) { value = null; }
    ipcRenderer.send('rpc:response', { id, value });
  }),
  platform: process.platform,
});
