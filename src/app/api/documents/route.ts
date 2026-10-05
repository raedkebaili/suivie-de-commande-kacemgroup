export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { driveDocuments, orders, photometricStudies } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getUserFromHeaders, logActivity, type UserPayload } from "@/lib/auth";
import {
  assertInsideRoot,
  bufferToStream,
  ensureContextFolder,
  friendlyDriveError,
  getDriveClient,
} from "@/lib/google-drive";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_MAX_SIZE,
  documentExtensionAllowed,
  type DocumentCategory,
  type DocumentEntityType,
} from "@/lib/document-categories";

/**
 * Gestion documentaire CONTEXTUELLE — bâtie SUR le module Stockage existant.
 *
 * Le fichier physique est toujours dans Google Drive (dossier racine
 * « ORDERTRACK STORAGE », sous-dossiers AFFAIRES / ETUDES PHOTOMETRIQUES) :
 * visible dans l'onglet Stockage, téléchargeable via l'existant
 * GET /api/storage/download/[id]. Cette API ne gère que l'ASSOCIATION
 * logique fichier Drive ↔ commande/étude. Jamais de duplication physique.
 */

// Rôles autorisés à ajouter/associer un document, par type d'entité.
// Alignés sur les rôles existants (commercial → ses affaires ; technique →
// traitement technique/télégestion ; études = responsables techniques).
const WRITE_ROLES: Record<DocumentEntityType, string[]> = {
  order: ["superadmin", "commercial", "technique"],
  study: ["superadmin", "technique"],
};

type ResolvedEntity = { label: string } | null;

/** Vérifie l'existence de l'entité et fournit le libellé du dossier Drive */
async function resolveEntity(entity: DocumentEntityType, entityId: number): Promise<ResolvedEntity> {
  if (entity === "order") {
    const [order] = await db.select({ orderNumber: orders.orderNumber })
      .from(orders).where(eq(orders.id, entityId)).limit(1);
    return order ? { label: order.orderNumber } : null;
  }
  const [study] = await db.select({ studyNumber: photometricStudies.studyNumber })
    .from(photometricStudies).where(eq(photometricStudies.id, entityId)).limit(1);
  return study ? { label: study.studyNumber } : null;
}

function parseEntityParams(rawEntity: string | null, rawId: string | null) {
  const entity = rawEntity === "order" || rawEntity === "study" ? rawEntity : null;
  const entityId = rawId ? parseInt(rawId) : NaN;
  if (!entity || !Number.isFinite(entityId)) return null;
  return { entity: entity as DocumentEntityType, entityId };
}

function parseCategory(raw: unknown): DocumentCategory | null {
  const c = String(raw || "").trim();
  if (!c) return "AUTRE";
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(c) ? (c as DocumentCategory) : null;
}

async function canWrite(user: UserPayload, entity: DocumentEntityType): Promise<boolean> {
  return WRITE_ROLES[entity].includes(user.role);
}

/**
 * GET /api/documents?entity=order|study&id=<entityId>
 * Liste les documents associés à une entité. Lecture : tout authentifié.
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const params = parseEntityParams(sp.get("entity"), sp.get("id"));
  if (!params) {
    return NextResponse.json({ error: "Paramètres entity (order|study) et id requis" }, { status: 400 });
  }

  const documents = await db.select().from(driveDocuments)
    .where(params.entity === "order"
      ? eq(driveDocuments.orderId, params.entityId)
      : eq(driveDocuments.studyId, params.entityId))
    .orderBy(desc(driveDocuments.createdAt));

  return NextResponse.json({ documents, total: documents.length });
}

/** Insère l'association après succès Drive ; rollback physique si échec DB */
async function insertAssociation(values: {
  entity: DocumentEntityType;
  entityId: number;
  driveFileId: string;
  driveFolderId: string | null;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  webViewLink: string | null;
  category: DocumentCategory;
  user: UserPayload;
}) {
  const [document] = await db.insert(driveDocuments).values({
    orderId: values.entity === "order" ? values.entityId : null,
    studyId: values.entity === "study" ? values.entityId : null,
    driveFileId: values.driveFileId,
    driveFolderId: values.driveFolderId,
    fileName: values.fileName,
    mimeType: values.mimeType,
    fileSize: values.fileSize,
    webViewLink: values.webViewLink,
    category: values.category,
    uploadedById: values.user.id,
    uploadedByName: values.user.fullName,
  }).returning();
  return document;
}

/**
 * POST /api/documents
 *  a) multipart/form-data : upload d'un NOUVEAU fichier (champ `file`)
 *     champs : entity, entityId, category
 *  b) application/json { mode:"link", entity, entityId, category, driveFileId }
 *     : association d'un fichier EXISTANT du Stockage (évite les doublons).
 *
 * Ordre des opérations (cohérence des données) :
 *   validation → upload/liaison Drive vérifiée → insertion de l'association.
 * En cas d'échec Drive : aucune association fictive n'est créée.
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const contentType = request.headers.get("content-type") || "";
  const isMultipart = contentType.includes("multipart/form-data");

  let entity: DocumentEntityType;
  let entityId: number;
  let category: DocumentCategory;
  let file: File | null = null;
  let linkFileId: string | null = null;

  if (isMultipart) {
    const fd = await request.formData();
    const params = parseEntityParams(String(fd.get("entity") || ""), String(fd.get("entityId") || ""));
    if (!params) return NextResponse.json({ error: "Entité invalide (order|study + entityId)" }, { status: 400 });
    entity = params.entity; entityId = params.entityId;
    const cat = parseCategory(fd.get("category"));
    if (!cat) return NextResponse.json({ error: "Catégorie de document invalide" }, { status: 400 });
    category = cat;
    const f = fd.get("file");
    file = f instanceof File ? f : null;
    if (!file) return NextResponse.json({ error: "Aucun fichier fourni (champ file)" }, { status: 400 });
  } else {
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const params = parseEntityParams(String(body.entity || ""), String(body.entityId || ""));
    if (!params) return NextResponse.json({ error: "Entité invalide (order|study + entityId)" }, { status: 400 });
    entity = params.entity; entityId = params.entityId;
    const cat = parseCategory(body.category);
    if (!cat) return NextResponse.json({ error: "Catégorie de document invalide" }, { status: 400 });
    category = cat;
    linkFileId = String(body.driveFileId || "").trim() || null;
    if (body.mode !== "link" || !linkFileId) {
      return NextResponse.json({ error: "Mode « link » attendu avec driveFileId" }, { status: 400 });
    }
  }

  if (!(await canWrite(user, entity))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const resolved = await resolveEntity(entity, entityId);
  if (!resolved) {
    return NextResponse.json({ error: entity === "order" ? "Commande non trouvée" : "Étude non trouvée" }, { status: 404 });
  }

  // ── Mode B : association d'un fichier Drive existant ──────────────────
  if (linkFileId) {
    try {
      // Doublon logique : même fichier déjà associé à cette entité ?
      const [existing] = await db.select({ id: driveDocuments.id }).from(driveDocuments)
        .where(and(
          entity === "order" ? eq(driveDocuments.orderId, entityId) : eq(driveDocuments.studyId, entityId),
          eq(driveDocuments.driveFileId, linkFileId),
        )).limit(1);
      if (existing) {
        return NextResponse.json({ error: "Ce fichier est déjà associé à cette entité" }, { status: 409 });
      }

      const { drive } = await getDriveClient();
      // Le fichier doit appartenir à l'arborescence du Stockage central
      const inside = await assertInsideRoot(linkFileId).catch(() => false);
      if (!inside) {
        return NextResponse.json({ error: "Ce fichier n'appartient pas au Stockage central" }, { status: 400 });
      }
      const meta = await drive.files.get({
        fileId: linkFileId,
        fields: "id,name,mimeType,size,webViewLink,parents",
      });
      if (!meta.data.id || !meta.data.name) {
        return NextResponse.json({ error: "Fichier introuvable sur Google Drive" }, { status: 404 });
      }

      const document = await insertAssociation({
        entity, entityId,
        driveFileId: meta.data.id,
        driveFolderId: meta.data.parents?.[0] || null,
        fileName: meta.data.name,
        mimeType: meta.data.mimeType || null,
        fileSize: meta.data.size ? Number(meta.data.size) : null,
        webViewLink: meta.data.webViewLink || null,
        category, user,
      });

      await logActivity(user.id, user.username, "DOCUMENT_LINK",
        `${meta.data.name} associé à ${entity === "order" ? "la commande" : "l'étude"} ${resolved.label}`);
      return NextResponse.json({ document }, { status: 201 });
    } catch (error) {
      const { message, status } = friendlyDriveError(error);
      console.error("Association document Drive:", error);
      return NextResponse.json({ error: message }, { status });
    }
  }

  // ── Mode A : upload d'un nouveau fichier ──────────────────────────────
  const uploadFile = file!;
  if (!documentExtensionAllowed(uploadFile.name)) {
    return NextResponse.json({
      error: "Format non accepté. Formats : PDF, XLS, XLSX, DOC, DOCX, PNG, JPG, JPEG, CSV, TXT",
    }, { status: 400 });
  }
  if (uploadFile.size > DOCUMENT_MAX_SIZE) {
    return NextResponse.json({ error: `Fichier trop volumineux (max ${DOCUMENT_MAX_SIZE / 1024 / 1024} Mo)` }, { status: 400 });
  }
  if (uploadFile.size === 0) {
    return NextResponse.json({ error: "Fichier vide" }, { status: 400 });
  }

  try {
    const { drive } = await getDriveClient();
    // Dossier contextuel DANS la racine du Stockage → visible dans l'onglet Stockage
    const folder = await ensureContextFolder(entity, resolved.label);

    const buffer = Buffer.from(await uploadFile.arrayBuffer());
    const created = await drive.files.create({
      requestBody: { name: uploadFile.name, parents: [folder.id] },
      media: { mimeType: uploadFile.type || undefined, body: bufferToStream(buffer) },
      fields: "id,name,size,mimeType,webViewLink,parents",
    });
    if (!created.data.id) {
      return NextResponse.json({ error: "Échec de l'upload Google Drive (aucun identifiant retourné)" }, { status: 502 });
    }

    // Upload confirmé (id Drive) → création de l'association uniquement maintenant
    let document;
    try {
      document = await insertAssociation({
        entity, entityId,
        driveFileId: created.data.id,
        driveFolderId: folder.id,
        fileName: created.data.name || uploadFile.name,
        mimeType: created.data.mimeType || uploadFile.type || null,
        fileSize: created.data.size ? Number(created.data.size) : uploadFile.size,
        webViewLink: created.data.webViewLink || null,
        category, user,
      });
    } catch (dbError) {
      // Rollback physique : ne pas laisser de fichier orphelin si l'association échoue
      console.error("Association impossible après upload, suppression du fichier Drive:", dbError);
      await drive.files.delete({ fileId: created.data.id }).catch(() => {});
      return NextResponse.json({ error: "Échec de l'association du document. Aucun fichier n'a été conservé." }, { status: 500 });
    }

    await logActivity(user.id, user.username, "DOCUMENT_UPLOAD",
      `${uploadFile.name} ajouté à ${entity === "order" ? "la commande" : "l'étude"} ${resolved.label}`);
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    const { message, status } = friendlyDriveError(error);
    console.error("Upload document contextuel:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
