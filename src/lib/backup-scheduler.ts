/**
 * Service de planification des sauvegardes automatiques.
 *
 * Au lancement (startBackupScheduler) :
 *   1. Demande au navigateur un dossier de sauvegarde via l'API
 *      File System Access — si le navigateur ne la supporte pas
 *      (Firefox, Safari) on fallback sur un téléchargement classique.
 *   2. Vérifie toutes les minutes si l'heure programmée est atteinte.
 *   3. Déclenche la sauvegarde côté serveur puis écrit le fichier JSON
 *      directement dans le dossier choisi (ou le télécharge si fallback).
 */

import { apiFetch } from "./api";

// ── Types ───────────────────────────────────────────────────────────────

type BackupStatus = {
  enabled: boolean;
  time: string;
  maxCount: number;
  lastRun: string | null;
  lastStatus: string | null;
  lastBackup: {
    id: number;
    filename: string;
    totalRecords: number;
    status: string;
    createdAt: string;
  } | null;
};

type SchedulerState = {
  isRunning: boolean;
  intervalId: ReturnType<typeof setInterval> | null;
  lastCheck: Date | null;
  /** Handle du dossier de sauvegarde (API File System Access) */
  dirHandle: FileSystemDirectoryHandle | null;
  /** true si on a la permission d'écrire dans le dossier */
  folderReady: boolean;
};

const state: SchedulerState = {
  isRunning: false,
  intervalId: null,
  lastCheck: null,
  dirHandle: null,
  folderReady: false,
};

// ── Gestion du dossier de sauvegarde ────────────────────────────────────

/**
 * Tente de récupérer le handle du dossier sauvegardé dans IndexedDB
 */
async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open("OrderTrackBackups", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("handles");
      };
      req.onsuccess = () => {
        const tx = req.result.transaction("handles", "readonly");
        const get = tx.objectStore("handles").get("backupDir");
        get.onsuccess = () => resolve(get.result || null);
        get.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Sauvegarde le handle dans IndexedDB pour les prochains lancements
 */
async function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open("OrderTrackBackups", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("handles");
      };
      req.onsuccess = () => {
        const tx = req.result.transaction("handles", "readwrite");
        tx.objectStore("handles").put(handle, "backupDir");
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Vérifie la permission en lecture/écriture sur le handle
 */
async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const opts = { mode: "readwrite" as const };
    if ((await handle.queryPermission(opts)) === "granted") return true;
    if ((await handle.requestPermission(opts)) === "granted") return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Demande à l'utilisateur de choisir un dossier de sauvegarde.
 * Appelé au premier lancement ou si le handle est invalide.
 */
export async function requestBackupFolder(): Promise<boolean> {
  // Vérifier que l'API est supportée
  if (typeof window === "undefined" || !("showDirectoryPicker" in window)) {
    console.log("[BackupScheduler] API File System Access non supportée — fallback téléchargement");
    return false;
  }

  try {
    // D'abord essayer de récupérer le handle enregistré
    let handle = await loadDirHandle();
    if (handle) {
      const ok = await verifyPermission(handle);
      if (ok) {
        state.dirHandle = handle;
        state.folderReady = true;
        console.log("[BackupScheduler] Dossier de sauvegarde récupéré :", handle.name);
        return true;
      }
    }

    // Si pas de handle ou permission refusée, demander un nouveau dossier
    handle = await window.showDirectoryPicker!({
      id: "ordertrack-backups",
      mode: "readwrite",
      startIn: "documents",
    });

    // Créer un sous-dossier OrderTrack_Backups
    const subDir = await handle!.getDirectoryHandle("OrderTrack_Backups", { create: true });

    state.dirHandle = subDir;
    state.folderReady = true;
    await saveDirHandle(subDir);

    console.log("[BackupScheduler] Dossier de sauvegarde créé :", subDir.name);
    return true;
  } catch (err) {
    // L'utilisateur a annulé ou erreur
    console.log("[BackupScheduler] Choix dossier annulé — fallback téléchargement");
    return false;
  }
}

// ── Écriture / téléchargement du fichier backup ─────────────────────────

/**
 * Écrit le fichier dans le dossier de sauvegarde choisi.
 * Si pas de dossier, fait un téléchargement classique.
 */
async function saveBackupFile(backupId: number, filename: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/backup/download/${backupId}`, { credentials: "same-origin" });
    if (!res.ok) {
      console.error("[BackupScheduler] Erreur téléchargement backup:", res.status);
      return false;
    }

    const blob = await res.blob();

    // Méthode 1 : écrire dans le dossier choisi (File System Access API)
    if (state.dirHandle && state.folderReady) {
      try {
        const fileHandle = await state.dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        console.log(`[BackupScheduler] Fichier enregistré dans le dossier : ${filename}`);
        return true;
      } catch (err) {
        console.error("[BackupScheduler] Erreur écriture dossier, fallback téléchargement:", err);
        state.folderReady = false;
      }
    }

    // Méthode 2 : téléchargement classique (fallback)
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    console.log(`[BackupScheduler] Fichier téléchargé : ${filename}`);
    return true;
  } catch (error) {
    console.error("[BackupScheduler] Erreur sauvegarde fichier:", error);
    return false;
  }
}

// ── Logique de planification ────────────────────────────────────────────

let checking = false;
async function checkAndRunBackup(): Promise<void> {
  if (checking) return;
  checking = true;
  state.lastCheck = new Date();
  try {
    const status = await apiFetch<BackupStatus>("/api/backup/auto");
    if (!status.enabled) return;
    // Le serveur décide de l'échéance, du fuseau, du rattrapage et de l'unicité.
    // Ne JAMAIS forcer une sauvegarde depuis une minuterie de navigateur.
    const result = await apiFetch<{ ok: boolean; id?: number; filename?: string }>("/api/backup/auto", { method: "POST", body: JSON.stringify({}) });
    const candidate = result.ok && result.id && result.filename
      ? { id: result.id, filename: result.filename }
      : state.folderReady && status.lastBackup?.status === "success" ? status.lastBackup : null;
    if (candidate) {
      const key = "ordertrack-last-local-backup";
      let previous: string | null = null;
      try { previous = localStorage.getItem(key); } catch { /* stockage privé indisponible */ }
      if (previous !== String(candidate.id) && await saveBackupFile(candidate.id, candidate.filename)) {
        try { localStorage.setItem(key, String(candidate.id)); } catch { /* sans persistance, prochaine vérification réessaiera */ }
      }
    }
  } catch (error) { console.error("[BackupScheduler] Erreur vérification:", error); }
  finally { checking = false; }
}

// ── API publique ────────────────────────────────────────────────────────

export async function startBackupScheduler(): Promise<void> {
  if (state.isRunning) return;
  state.isRunning = true;

  // Un sélecteur de dossier exige un clic utilisateur : ne pas bloquer la minuterie.
  const stored = await loadDirHandle();
  if (stored && await stored.queryPermission({ mode: "readwrite" }).catch(() => "denied") === "granted") {
    state.dirHandle = stored; state.folderReady = true;
  }
  if (!state.isRunning) return;

  // Première vérification
  checkAndRunBackup();

  // Vérification toutes les minutes
  state.intervalId = setInterval(checkAndRunBackup, 60 * 1000);
  console.log("[BackupScheduler] Démarré", state.folderReady ? "(dossier configuré)" : "(mode téléchargement)");
}

export function stopBackupScheduler(): void {
  if (state.intervalId) { clearInterval(state.intervalId); state.intervalId = null; }
  state.isRunning = false;
}

export function getSchedulerState(): SchedulerState {
  return { ...state };
}

export async function forceCheck(): Promise<void> {
  await checkAndRunBackup();
}

/**
 * Permet de changer le dossier de sauvegarde manuellement
 */
export async function changeBackupFolder(): Promise<boolean> {
  state.dirHandle = null;
  state.folderReady = false;
  return requestBackupFolder();
}
