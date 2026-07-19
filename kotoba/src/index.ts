/**
 * bim kotoba — barrel.
 *
 * Per ADR-2606011400. Building Information Modeling (projects + IFC revisions +
 * annotations) on the etzhayyim substrate (AT PDS records; no RW).
 *
 *   project    : createProject / getProject / listProjects (q = app-layer search)
 *   revision   : addRevision (FK→project, IFC schema + model CID) / getRevision / listRevisions
 *   annotation : addAnnotation (FK→project) / resolveAnnotation / listAnnotations
 *   coverage
 *
 * Architectural technical data; large IFC geometry referenced by CID (IPFS).
 */

export * from "./types.js";
export {
  createProject,
  getProject,
  listProjects,
  addRevision,
  getRevision,
  listRevisions,
  addAnnotation,
  resolveAnnotation,
  listAnnotations,
  coverage,
} from "./registry.js";
