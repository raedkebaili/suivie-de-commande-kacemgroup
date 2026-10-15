// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MobileDocuments from "../MobileDocuments";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);
const user = { id: 1, role: "commercial", username: "test", fullName: "Test" } as User;
beforeEach(() => { api.mockReset(); api.mockResolvedValue({ documents: [] }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("documents mobiles", () => {
  it("envoie un document multipart avec son contexte et sa catégorie", async () => {
    const actions = userEvent.setup();
    render(<MobileDocuments orderId={42} user={user} onSessionExpired={vi.fn()} />);
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    await actions.upload(screen.getByLabelText("Fichier (50 Mo maximum)"), new File(["pdf"], "plan.pdf", { type: "application/pdf" }));
    await actions.selectOptions(screen.getByLabelText("Catégorie"), "PLAN");
    await actions.click(screen.getByRole("button", { name: "Envoyer le document" }));
    await waitFor(() => expect(api.mock.calls.some(([, options]) => options?.method === "POST")).toBe(true));
    const body = api.mock.calls.find(([, options]) => options?.method === "POST")?.[1]?.body as FormData;
    expect(body.get("entity")).toBe("order"); expect(body.get("entityId")).toBe("42"); expect(body.get("category")).toBe("PLAN");
    expect((body.get("file") as File).name).toBe("plan.pdf");
    await waitFor(() => expect((screen.getByLabelText("Fichier (50 Mo maximum)") as HTMLInputElement).value).toBe(""));
  });
  it("refuse un fichier non autorisé sans appeler l'API d'envoi", async () => {
    const actions = userEvent.setup({ applyAccept: false });
    render(<MobileDocuments orderId={42} user={user} onSessionExpired={vi.fn()} />);
    await actions.upload(screen.getByLabelText("Fichier (50 Mo maximum)"), new File(["exe"], "virus.exe"));
    await actions.click(screen.getByRole("button", { name: "Envoyer le document" }));
    expect(await screen.findByText("Format non autorisé ou taille invalide (50 Mo maximum).")).toBeTruthy();
    expect(api.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });
  it("réserve l'ajout aux rôles autorisés et ne dissocie pas après annulation", async () => {
    api.mockResolvedValue({ documents: [{ id: 8, fileName: "plan.pdf", driveFileId: "drive/id", category: "PLAN", uploadedById: 1, uploadedByName: "Test", createdAt: "2026-10-15" }] });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const actions = userEvent.setup();
    render(<MobileDocuments orderId={42} user={{ ...user, role: "planification" }} onSessionExpired={vi.fn()} />);
    expect(await screen.findByText("plan.pdf")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Envoyer le document" })).toBeNull();
    expect(screen.getByRole("link", { name: "Télécharger" }).getAttribute("href")).toBe("/api/storage/download/drive%2Fid?mode=attachment");
    await actions.click(screen.getByRole("button", { name: "Dissocier" }));
    expect(confirm).toHaveBeenCalled();
    expect(api.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false);
  });
  it("signale une session expirée", async () => {
    api.mockRejectedValue(new Error("Non authentifié")); const expired = vi.fn();
    render(<MobileDocuments orderId={42} user={user} onSessionExpired={expired} />);
    await waitFor(() => expect(expired).toHaveBeenCalled());
  });
});

describe("association depuis le stockage", () => {
  it("recherche un fichier existant et envoie une association logique sans upload", async () => {
    api.mockImplementation(async (url) => url.startsWith("/api/storage/files") ? { files: [{ id: "drive-1", name: "plan-lumiere.pdf", isFolder: false }], nextPageToken: null } : { documents: [] });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const actions = userEvent.setup();
    render(<MobileDocuments orderId={42} user={user} onSessionExpired={vi.fn()} />);
    await actions.type(screen.getByLabelText("Nom du fichier (2 caractères minimum)"), "plan");
    await actions.click(screen.getByRole("button", { name: "Rechercher dans le stockage" }));
    await actions.click(await screen.findByRole("button", { name: "plan-lumiere.pdf — Associer" }));
    await waitFor(() => expect(api.mock.calls.some(([, options]) => options?.method === "POST")).toBe(true));
    const body = api.mock.calls.find(([, options]) => options?.method === "POST")?.[1]?.body as string;
    expect(JSON.parse(body)).toEqual({ mode: "link", entity: "order", entityId: 42, category: "AUTRE", driveFileId: "drive-1" });
  });
});
