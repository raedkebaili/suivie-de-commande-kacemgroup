// Type declarations for the API exposed by electron-app/preload.js on
// `window.electronAPI` when the Next.js app runs inside the Electron desktop
// shell. In a regular browser, `window.electronAPI` is simply `undefined`,
// so all consumers must optional-chain (`window.electronAPI?.foo`).
export {};

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      isElectron: true;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      notify: (title: string, body: string) => void;
      onShortcut: (callback: (action: string) => void) => () => void;
    };
    /** File System Access API — showDirectoryPicker */
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: "read" | "readwrite";
      startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
    }) => Promise<FileSystemDirectoryHandle>;
  }

  // File System Access API extensions (not yet in standard TS lib)
  interface FileSystemDirectoryHandle {
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
    queryPermission(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
    requestPermission(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  }

  interface FileSystemFileHandle {
    createWritable(): Promise<FileSystemWritableFileStream>;
  }

  interface FileSystemWritableFileStream extends WritableStream {
    write(data: Blob | BufferSource | string | { type: string; data?: unknown; position?: number; size?: number }): Promise<void>;
    close(): Promise<void>;
  }
}
