export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { driveDocuments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity } from "@/lib/auth";

/**
 * DELETE /api/documents/[id]
 * Supprime l'ASSOCIATION document ↔ entité. Le fichier physique N'EST PAS
 * supprimé de Google Drive : il reste géré (et éventuellement supprimable)
 * depuis l'onglet Stockage qui demeure le point central de gestion.
 *
 * Droits : superadmin, ou l'utilisateur ayant ajouté l'association.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.role === "acces_agence") return NextResponse.json({ error: "Le rôle Accès agence est limité à la consultation" }, { status: 403 });

  const { id } = await params;
  const docId = parseInt(id);
  if (!Number.isFinite(docId)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });

  const [document] = await db.select().from(driveDocuments).where(eq(driveDocuments.id, docId)).limit(1);
  if (!document) return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });

  const isOwner = document.uploadedById === user.id;
  if (user.role !== "superadmin" && !isOwner) {
    return NextResponse.json({ error: "Seul l'auteur du document ou un administrateur peut le retirer" }, { status: 403 });
  }

  await db.delete(driveDocuments).where(eq(driveDocuments.id, docId));

  await logActivity(user.id, user.username, "DOCUMENT_UNLINK",
    `${document.fileName} dissocié (${document.orderId ? `commande #${document.orderId}` : `étude #${document.studyId}`}) — fichier conservé dans le Stockage`);

  return NextResponse.json({ ok: true, fileKeptInStorage: true });
}
