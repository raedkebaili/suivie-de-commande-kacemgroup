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

import { apiFetch, getToken } from "./api";

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
async function requestBackupFolder(): Promise<boolean> {
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
async function saveBackupFile(backupId: number, filename: string): Promise<void> {
  const token = getToken();
  if (!token) return;

  try {
    const res = await fetch(`/api/backup/download/${backupId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.error("[BackupScheduler] Erreur téléchargement backup:", res.status);
      return;
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
        return;
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
  } catch (error) {
    console.error("[BackupScheduler] Erreur sauvegarde fichier:", error);
  }
}

// ── Logique de planification ────────────────────────────────────────────

function shouldRunBackup(scheduledTime: string, lastRun: string | null): boolean {
  const now = new Date();
  const [hours, minutes] = scheduledTime.split(":").map(Number);
  const scheduledDate = new Date();
  scheduledDate.setHours(hours, minutes, 0, 0);

  if (lastRun) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const lastRunDay = new Date(new Date(lastRun)); lastRunDay.setHours(0, 0, 0, 0);
    if (lastRunDay.getTime() === today.getTime()) return false;
  }

  const timeDiff = Math.abs(now.getTime() - scheduledDate.getTime());
  return timeDiff <= 5 * 60 * 1000 && now >= scheduledDate;
}

async function checkAndRunBackup(): Promise<void> {
  state.lastCheck = new Date();

  try {
    const status = await apiFetch<BackupStatus>("/api/backup/auto");
    if (!status.enabled) return;

    if (shouldRunBackup(status.time, status.lastRun)) {
      console.log("[BackupScheduler] Lancement de la sauvegarde automatique...");

      const result = await apiFetch<{ ok: boolean; filename?: string; error?: string }>(
        "/api/backup/auto",
        { method: "POST", body: JSON.stringify({ force: true }) }
      );

      if (result.ok && result.filename) {
        console.log(`[BackupScheduler] Sauvegarde serveur réussie : ${result.filename}`);
        // Récupérer l'ID pour télécharger le fichier
        const updated = await apiFetch<BackupStatus>("/api/backup/auto");
        if (updated.lastBackup?.id) {
          await saveBackupFile(updated.lastBackup.id, result.filename);
        }
      } else {
        console.error("[BackupScheduler] Échec :", result.error);
      }
    }
  } catch (error) {
    console.error("[BackupScheduler] Erreur vérification:", error);
  }
}

// ── API publique ────────────────────────────────────────────────────────

export async function startBackupScheduler(): Promise<void> {
  if (state.isRunning) return;
  state.isRunning = true;

  // Tenter de configurer le dossier de sauvegarde au premier lancement
  await requestBackupFolder();

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
