/**
 * bim kotoba — Building Information Modeling record types.
 *
 * Per ADR-2606011400 + ADR-2604241500 (cad/bim topology). bim is a browser BIM
 * viewer/reviewer/annotator/IFC-exporter: projects + IFC revisions (FK→project,
 * model geometry by CID) + annotations (FK→project). Registry on AT PDS records
 * (replaces RW). ADR-2605172000 kotoba.
 *
 * AXIS NOTE (ADR-2605172400): axis-clean — architectural/engineering technical
 * data (building models), not personal PII. No settlement, no fulfillment
 * liability (viewer/annotator). Large IFC geometry is referenced by CID (IPFS,
 * a permitted etzhayyim substrate), not inlined.
 *
 * AT-Lexicon: no float. Revision version is an integer.
 *
 * Identity hierarchy:
 *   did:web:bim.etzhayyim.com                              — controller
 *   did:web:bim.etzhayyim.com:project:{projectId}          — a BIM project
 *   did:web:bim.etzhayyim.com:revision:{revisionId}        — a model revision
 *   did:web:bim.etzhayyim.com:annotation:{annotationId}    — an annotation
 */

export const BIM_DID_PREFIX = "did:web:bim.etzhayyim.com:" as const;

export const PROJECT_COLLECTION = "com.etzhayyim.apps.bim.project";
export const REVISION_COLLECTION = "com.etzhayyim.apps.bim.revision";
export const ANNOTATION_COLLECTION = "com.etzhayyim.apps.bim.annotation";

// ─── Project ────────────────────────────────────────────────────────

export type ProjectStatus = "active" | "archived";

export interface ProjectRecord {
  did: string;
  projectId: string;
  name: string;
  /** Site location / address (public project info), optional. */
  siteLocation?: string;
  ownerDid?: string;
  status: ProjectStatus;
  createdAt: string;
}
export interface ProjectView extends ProjectRecord {
  projectUri: string;
}
export interface CreateProjectInput {
  projectId: string;
  name: string;
  siteLocation?: string;
  ownerDid?: string;
}
export interface CreateProjectOutput {
  status: "created" | "alreadyExists" | "rejected";
  projectUri?: string;
  did?: string;
  projectId?: string;
  error?: string;
}
export interface GetProjectInput {
  projectId: string;
}
export interface GetProjectOutput {
  project?: ProjectView;
  error?: string;
}
export interface ListProjectsInput {
  ownerDid?: string;
  status?: ProjectStatus;
  /** App-layer substring match over name. */
  q?: string;
  limit?: number;
  cursor?: string;
}
export interface ListProjectsOutput {
  items: ProjectView[];
  cursor?: string;
  total: number;
}

// ─── Revision ───────────────────────────────────────────────────────

export type IfcSchema = "IFC2X3" | "IFC4" | "IFC4X3";

export interface RevisionRecord {
  did: string;
  revisionId: string;
  /** FK → project projectId. */
  projectId: string;
  /** Monotonic revision number (≥1). */
  version: number;
  ifcSchema: IfcSchema;
  /** IPFS CID of the IFC model, optional. */
  modelCid?: string;
  note?: string;
  createdAt: string;
}
export interface RevisionView extends RevisionRecord {
  revisionUri: string;
}
export interface AddRevisionInput {
  revisionId: string;
  projectId: string;
  version: number;
  ifcSchema: IfcSchema;
  modelCid?: string;
  note?: string;
}
export interface AddRevisionOutput {
  status: "added" | "alreadyExists" | "rejected" | "projectNotFound";
  revisionUri?: string;
  did?: string;
  revisionId?: string;
  error?: string;
}
export interface GetRevisionInput {
  revisionId: string;
}
export interface GetRevisionOutput {
  revision?: RevisionView;
  error?: string;
}
export interface ListRevisionsInput {
  projectId?: string;
  ifcSchema?: IfcSchema;
  limit?: number;
  cursor?: string;
}
export interface ListRevisionsOutput {
  items: RevisionView[];
  cursor?: string;
  total: number;
}

// ─── Annotation ─────────────────────────────────────────────────────

export type AnnotationKind = "comment" | "issue" | "markup";
export type AnnotationStatus = "open" | "resolved";

export interface AnnotationRecord {
  did: string;
  annotationId: string;
  /** FK → project projectId. */
  projectId: string;
  /** Optional revision context. */
  revisionId?: string;
  /** BIM element GUID the annotation targets, optional. */
  elementId?: string;
  kind: AnnotationKind;
  body: string;
  authorDid?: string;
  status: AnnotationStatus;
  createdAt: string;
}
export interface AnnotationView extends AnnotationRecord {
  annotationUri: string;
}
export interface AddAnnotationInput {
  annotationId: string;
  projectId: string;
  kind: AnnotationKind;
  body: string;
  revisionId?: string;
  elementId?: string;
  authorDid?: string;
}
export interface AddAnnotationOutput {
  status: "added" | "alreadyExists" | "rejected" | "projectNotFound";
  annotationUri?: string;
  did?: string;
  annotationId?: string;
  error?: string;
}
export interface ResolveAnnotationInput {
  annotationId: string;
}
export interface ResolveAnnotationOutput {
  status: "resolved" | "notFound" | "rejected";
  annotationId?: string;
  error?: string;
}
export interface ListAnnotationsInput {
  projectId?: string;
  revisionId?: string;
  kind?: AnnotationKind;
  status?: AnnotationStatus;
  limit?: number;
  cursor?: string;
}
export interface ListAnnotationsOutput {
  items: AnnotationView[];
  cursor?: string;
  total: number;
}

// ─── Coverage ───────────────────────────────────────────────────────

export interface CoverageInput {
  maxScan?: number;
}
export interface CoverageOutput {
  projectCount?: number;
  revisionCount?: number;
  annotationCount?: number;
  revisionsBySchema?: Record<string, number>;
  openAnnotations?: number;
  truncated?: boolean;
  error?: string;
}

// ─── Validation + helpers ───────────────────────────────────────────

export const IFC_SCHEMAS: ReadonlySet<string> = new Set(["IFC2X3", "IFC4", "IFC4X3"]);
export const ANNOTATION_KINDS: ReadonlySet<string> = new Set(["comment", "issue", "markup"]);

export function isPosInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}
export function looksLikeCid(s: string): boolean {
  return /^b[a-z2-7]{20,}$/.test(s) || /^Qm[1-9A-HJ-NP-Za-km-z]{20,}$/.test(s);
}

export function projectDidFor(id: string): string {
  return `${BIM_DID_PREFIX}project:${id.toLowerCase()}`;
}
export function projectRkey(id: string): string {
  return `project-${id.toLowerCase()}`;
}
export function revisionDidFor(id: string): string {
  return `${BIM_DID_PREFIX}revision:${id.toLowerCase()}`;
}
export function revisionRkey(id: string): string {
  return `revision-${id.toLowerCase()}`;
}
export function annotationDidFor(id: string): string {
  return `${BIM_DID_PREFIX}annotation:${id.toLowerCase()}`;
}
export function annotationRkey(id: string): string {
  return `annotation-${id.toLowerCase()}`;
}
