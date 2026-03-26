interface ElectronUpdaterAPI {
  onUpdateAvailable: (cb: (info: { version: string; url: string; platform: string }) => void) => void
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => void
  dismissVersion: (version: string) => void
}

interface ElectronWindowAPI {
  openNewWindow: (path: string) => void
}

interface Window {
  electronUpdater?: ElectronUpdaterAPI
  electronWindow?: ElectronWindowAPI
}
