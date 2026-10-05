// Déclarations de types pour la File System Access API (navigateurs Chromium),
// utilisée par le planificateur de sauvegarde automatique
// (src/lib/backup-scheduler.ts). Non couvertes par la lib TS standard actuelle.
export {};

declare global {
  interface Window {
    /** File System Access API — showDirectoryPicker */
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: "read" | "readwrite";
      startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
    }) => Promise<FileSystemDirectoryHandle>;
  }

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
