import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('deskPilot', {
  notes: {
    list: () => ipcRenderer.invoke('notes:list'),
    listDeleted: () => ipcRenderer.invoke('notes:list-deleted'),
    search: (query) => ipcRenderer.invoke('notes:search', query),
    create: (note) => ipcRenderer.invoke('notes:create', note),
    importFile: () => ipcRenderer.invoke('notes:import-file'),
    importDroppedFile: (file) => ipcRenderer.invoke('notes:import-dropped-file', webUtils.getPathForFile(file)),
    importUrl: (url) => ipcRenderer.invoke('notes:import-url', url),
    update: (note) => ipcRenderer.invoke('notes:update', note),
    delete: (id) => ipcRenderer.invoke('notes:delete', id),
    restore: (id) => ipcRenderer.invoke('notes:restore', id),
    purge: (id) => ipcRenderer.invoke('notes:purge', id),
    exportBackup: () => ipcRenderer.invoke('notes:export'),
    restoreBackup: () => ipcRenderer.invoke('notes:restore-backup'),
  },
});
