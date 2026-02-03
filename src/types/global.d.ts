export {};

declare global {
  interface ElectronAPI {
    scanDmarc: (config: any) => Promise<any>;
  }

  interface Window {
    electronAPI: ElectronAPI;
  }
}
