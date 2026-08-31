import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('deskPilot', {
  notes: {
    list: () => ipcRenderer.invoke('notes:list'),
    create: (note) => ipcRenderer.invoke('notes:create', note),
    update: (note) => ipcRenderer.invoke('notes:update', note),
  },
});
