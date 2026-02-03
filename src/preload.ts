import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  scanDmarc: (config: any) => ipcRenderer.invoke('imap-scan-dmarc', config)
});
