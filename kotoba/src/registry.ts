/**
 * bim kotoba — project + revision + annotation registries + coverage.
 * AT PDS records (no RW). Revisions / annotations FK-reference an existing
 * project. Architectural model data; IFC geometry referenced by CID.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  ANNOTATION_COLLECTION,
  ANNOTATION_KINDS,
  IFC_SCHEMAS,
  PROJECT_COLLECTION,
  REVISION_COLLECTION,
  annotationDidFor,
  annotationRkey,
  isPosInt,
  looksLikeCid,
  projectDidFor,
  projectRkey,
  revisionDidFor,
  revisionRkey,
  type AddAnnotationInput,
  type AddAnnotationOutput,
  type AddRevisionInput,
  type AddRevisionOutput,
  type AnnotationRecord,
  type AnnotationView,
  type CoverageInput,
  type CoverageOutput,
  type CreateProjectInput,
  type CreateProjectOutput,
  type GetProjectInput,
  type GetProjectOutput,
  type GetRevisionInput,
  type GetRevisionOutput,
  type ListAnnotationsInput,
  type ListAnnotationsOutput,
  type ListProjectsInput,
  type ListProjectsOutput,
  type ListRevisionsInput,
  type ListRevisionsOutput,
  type ProjectRecord,
  type ProjectView,
  type ResolveAnnotationInput,
  type ResolveAnnotationOutput,
  type RevisionRecord,
  type RevisionView,
} from "./types.js";

const PAGE_LIMIT = 100;
const DEFAULT_MAX_SCAN = 10_000;

async function exists(e: Etzhayyim, collection: string, rkey: string): Promise<boolean> {
  const resp = await e.read({ collection, rkey }).catch(() => ({ records: [] }));
  return Boolean(resp.records[0]?.value);
}

async function scanAll<T>(e: Etzhayyim, collection: string, maxScan: number, onRow: (v: T) => void): Promise<number> {
  let cursor: string | undefined;
  let scanned = 0;
  while (scanned < maxScan) {
    const page = await e.read<T>({ collection, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) {
      if (scanned >= maxScan) break;
      onRow(r.value);
      scanned += 1;
    }
    if (scanned >= maxScan || !page.cursor || page.records.length < PAGE_LIMIT) break;
    cursor = page.cursor;
  }
  return scanned;
}

// ─── Project ────────────────────────────────────────────────────────

export async function createProject(e: Etzhayyim, input: CreateProjectInput): Promise<CreateProjectOutput> {
  if (!input.projectId || !input.name) return { status: "rejected", error: "missingRequiredFields" };
  if (input.ownerDid && !input.ownerDid.startsWith("did:")) return { status: "rejected", error: "invalidOwnerDid" };
  const rkey = projectRkey(input.projectId);
  const existing = await e.read<ProjectRecord>({ collection: PROJECT_COLLECTION, rkey }).catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", projectUri: existing.records[0].uri, did: existing.records[0].value.did, projectId: input.projectId };
  }
  const did = projectDidFor(input.projectId);
  const record: ProjectRecord = {
    did,
    projectId: input.projectId,
    name: input.name,
    siteLocation: input.siteLocation,
    ownerDid: input.ownerDid,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  const receipt = await e.write({ collection: PROJECT_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "created", projectUri: receipt.uri, did, projectId: input.projectId };
}

export async function getProject(e: Etzhayyim, input: GetProjectInput): Promise<GetProjectOutput> {
  if (!input.projectId) return { error: "invalidProjectId" };
  const resp = await e.read<ProjectRecord>({ collection: PROJECT_COLLECTION, rkey: projectRkey(input.projectId) }).catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  return { project: { ...r.value, projectUri: r.uri } };
}

export async function listProjects(e: Etzhayyim, input: ListProjectsInput = {}): Promise<ListProjectsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<ProjectRecord>({ collection: PROJECT_COLLECTION, cursor: input.cursor, limit });
  const q = input.q?.toLowerCase();
  const items: ProjectView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (input.ownerDid && v.ownerDid !== input.ownerDid) return false;
      if (input.status && v.status !== input.status) return false;
      if (q && !v.name.toLowerCase().includes(q)) return false;
      return true;
    })
    .map((r) => ({ ...r.value, projectUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Revision ───────────────────────────────────────────────────────

export async function addRevision(e: Etzhayyim, input: AddRevisionInput): Promise<AddRevisionOutput> {
  if (!input.revisionId || !input.projectId) return { status: "rejected", error: "missingRequiredFields" };
  if (!isPosInt(input.version)) return { status: "rejected", error: "versionMustBePosInt" };
  if (!IFC_SCHEMAS.has(input.ifcSchema)) return { status: "rejected", error: "invalidIfcSchema" };
  if (input.modelCid && !looksLikeCid(input.modelCid)) return { status: "rejected", error: "invalidModelCid" };
  if (!(await exists(e, PROJECT_COLLECTION, projectRkey(input.projectId)))) {
    return { status: "projectNotFound", error: `projectNotFound:${input.projectId}` };
  }
  const rkey = revisionRkey(input.revisionId);
  const existing = await e.read<RevisionRecord>({ collection: REVISION_COLLECTION, rkey }).catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", revisionUri: existing.records[0].uri, did: existing.records[0].value.did, revisionId: input.revisionId };
  }
  const did = revisionDidFor(input.revisionId);
  const record: RevisionRecord = {
    did,
    revisionId: input.revisionId,
    projectId: input.projectId,
    version: input.version,
    ifcSchema: input.ifcSchema,
    modelCid: input.modelCid,
    note: input.note,
    createdAt: new Date().toISOString(),
  };
  const receipt = await e.write({ collection: REVISION_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "added", revisionUri: receipt.uri, did, revisionId: input.revisionId };
}

export async function getRevision(e: Etzhayyim, input: GetRevisionInput): Promise<GetRevisionOutput> {
  if (!input.revisionId) return { error: "invalidRevisionId" };
  const resp = await e.read<RevisionRecord>({ collection: REVISION_COLLECTION, rkey: revisionRkey(input.revisionId) }).catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  return { revision: { ...r.value, revisionUri: r.uri } };
}

export async function listRevisions(e: Etzhayyim, input: ListRevisionsInput = {}): Promise<ListRevisionsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<RevisionRecord>({ collection: REVISION_COLLECTION, cursor: input.cursor, limit });
  const items: RevisionView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (input.projectId && v.projectId !== input.projectId) return false;
      if (input.ifcSchema && v.ifcSchema !== input.ifcSchema) return false;
      return true;
    })
    .map((r) => ({ ...r.value, revisionUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Annotation ─────────────────────────────────────────────────────

export async function addAnnotation(e: Etzhayyim, input: AddAnnotationInput): Promise<AddAnnotationOutput> {
  if (!input.annotationId || !input.projectId || !input.body) return { status: "rejected", error: "missingRequiredFields" };
  if (!ANNOTATION_KINDS.has(input.kind)) return { status: "rejected", error: "invalidKind" };
  if (input.authorDid && !input.authorDid.startsWith("did:")) return { status: "rejected", error: "invalidAuthorDid" };
  if (!(await exists(e, PROJECT_COLLECTION, projectRkey(input.projectId)))) {
    return { status: "projectNotFound", error: `projectNotFound:${input.projectId}` };
  }
  const rkey = annotationRkey(input.annotationId);
  const existing = await e.read<AnnotationRecord>({ collection: ANNOTATION_COLLECTION, rkey }).catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", annotationUri: existing.records[0].uri, did: existing.records[0].value.did, annotationId: input.annotationId };
  }
  const did = annotationDidFor(input.annotationId);
  const record: AnnotationRecord = {
    did,
    annotationId: input.annotationId,
    projectId: input.projectId,
    revisionId: input.revisionId,
    elementId: input.elementId,
    kind: input.kind,
    body: input.body,
    authorDid: input.authorDid,
    status: "open",
    createdAt: new Date().toISOString(),
  };
  const receipt = await e.write({ collection: ANNOTATION_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "added", annotationUri: receipt.uri, did, annotationId: input.annotationId };
}

export async function resolveAnnotation(e: Etzhayyim, input: ResolveAnnotationInput): Promise<ResolveAnnotationOutput> {
  if (!input.annotationId) return { status: "rejected", error: "invalidAnnotationId" };
  const rkey = annotationRkey(input.annotationId);
  const resp = await e.read<AnnotationRecord>({ collection: ANNOTATION_COLLECTION, rkey }).catch(() => ({ records: [] }));
  const annotation = resp.records[0]?.value;
  if (!annotation) return { status: "notFound", error: "annotationNotFound" };
  if (annotation.status === "resolved") return { status: "rejected", error: "alreadyResolved" };
  await e.write({ collection: ANNOTATION_COLLECTION, record: { ...annotation, status: "resolved" } as unknown as Record<string, unknown>, rkey });
  return { status: "resolved", annotationId: input.annotationId };
}

export async function listAnnotations(e: Etzhayyim, input: ListAnnotationsInput = {}): Promise<ListAnnotationsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<AnnotationRecord>({ collection: ANNOTATION_COLLECTION, cursor: input.cursor, limit });
  const items: AnnotationView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (input.projectId && v.projectId !== input.projectId) return false;
      if (input.revisionId && v.revisionId !== input.revisionId) return false;
      if (input.kind && v.kind !== input.kind) return false;
      if (input.status && v.status !== input.status) return false;
      return true;
    })
    .map((r) => ({ ...r.value, annotationUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Coverage ───────────────────────────────────────────────────────

export async function coverage(e: Etzhayyim, input: CoverageInput = {}): Promise<CoverageOutput> {
  const maxScan = Math.min(input.maxScan ?? DEFAULT_MAX_SCAN, DEFAULT_MAX_SCAN);
  const projectCount = await scanAll<ProjectRecord>(e, PROJECT_COLLECTION, maxScan, () => {});
  const revisionsBySchema: Record<string, number> = {};
  const revisionCount = await scanAll<RevisionRecord>(e, REVISION_COLLECTION, maxScan, (v) => {
    revisionsBySchema[v.ifcSchema] = (revisionsBySchema[v.ifcSchema] ?? 0) + 1;
  });
  let openAnnotations = 0;
  const annotationCount = await scanAll<AnnotationRecord>(e, ANNOTATION_COLLECTION, maxScan, (v) => {
    if (v.status === "open") openAnnotations += 1;
  });
  return {
    projectCount,
    revisionCount,
    annotationCount,
    revisionsBySchema,
    openAnnotations,
    truncated: projectCount >= maxScan || revisionCount >= maxScan || annotationCount >= maxScan,
  };
}
