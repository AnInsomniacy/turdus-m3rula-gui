const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  openDialog: (opts) => ipcRenderer.invoke('dialog:open', opts),
  loadProject: (dir) => ipcRenderer.invoke('project:load', dir),
  saveProject: (dir, data) => ipcRenderer.invoke('project:save', dir, data),
  createProject: (base, name, data) => ipcRenderer.invoke('project:create', base, name, data),
  which: (name) => ipcRenderer.invoke('cli:which', name),
  run: (payload) => ipcRenderer.invoke('cli:run', payload),
  write: (data) => ipcRenderer.invoke('cli:write', data),
  kill: () => ipcRenderer.invoke('cli:kill'),
  exists: (p) => ipcRenderer.invoke('fs:exists', p),
  list: (dir) => ipcRenderer.invoke('fs:list', dir),
  touch: (dir, name) => ipcRenderer.invoke('fs:touch', dir, name),
  moveTempUp: (dir) => ipcRenderer.invoke('fs:moveTempUp', dir),
  renameLatestBin: (dir, target, exclude) => ipcRenderer.invoke('fs:renameLatestBin', dir, target, exclude),
  extractGen: (file) => ipcRenderer.invoke('blob:extractGen', file),
  onStarted: (cb) => ipcRenderer.on('cli:started', (_, m) => cb(m)),
  onLog: (cb) => ipcRenderer.on('cli:log', (_, m) => cb(m)),
  onExit: (cb) => ipcRenderer.on('cli:exit', (_, m) => cb(m)),
  onceExit: (cb) => ipcRenderer.once('cli:exit', (_, m) => cb(m)),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized')
})
