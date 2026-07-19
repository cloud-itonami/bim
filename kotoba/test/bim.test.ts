import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
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
} from "../src/index.js";

const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const OWNER = "did:web:architect.example.com";

describe("bim kotoba", () => {
  let e: any;
  beforeEach(() => {
    e = new MockEtzhayyim({ did: "did:web:bim.etzhayyim.com" });
  });

  describe("project", () => {
    it("creates, reads, lists by owner + app-layer search; idempotent", async () => {
      expect((await createProject(e, { projectId: "P-1", name: "Tower A", siteLocation: "Tokyo", ownerDid: OWNER })).status).toBe("created");
      expect((await getProject(e, { projectId: "P-1" })).project?.siteLocation).toBe("Tokyo");
      expect((await createProject(e, { projectId: "P-1", name: "dup" })).status).toBe("alreadyExists");
      expect((await createProject(e, { projectId: "P-X", name: "x", ownerDid: "nope" })).status).toBe("rejected");
      expect((await listProjects(e, { ownerDid: OWNER })).total).toBe(1);
      expect((await listProjects(e, { q: "tower" })).total).toBe(1);
    });
  });

  describe("revisions + annotations against a project", () => {
    beforeEach(async () => {
      await createProject(e, { projectId: "P-1", name: "Tower A" });
    });
    it("adds revisions (FK→project, IFC schema + CID), rejects bad inputs", async () => {
      expect((await addRevision(e, { revisionId: "R-1", projectId: "P-1", version: 1, ifcSchema: "IFC4", modelCid: CID })).status).toBe("added");
      expect((await getRevision(e, { revisionId: "R-1" })).revision?.ifcSchema).toBe("IFC4");
      expect((await addRevision(e, { revisionId: "R-X", projectId: "P-1", version: 0, ifcSchema: "IFC4" })).status).toBe("rejected"); // version
      expect((await addRevision(e, { revisionId: "R-X", projectId: "P-1", version: 1, ifcSchema: "IFC9" as any })).status).toBe("rejected"); // schema
      expect((await addRevision(e, { revisionId: "R-X", projectId: "P-1", version: 1, ifcSchema: "IFC4", modelCid: "nope" })).status).toBe("rejected"); // cid
      expect((await addRevision(e, { revisionId: "R-X", projectId: "GHOST", version: 1, ifcSchema: "IFC4" })).status).toBe("projectNotFound");
      await addRevision(e, { revisionId: "R-2", projectId: "P-1", version: 2, ifcSchema: "IFC2X3" });
      expect((await listRevisions(e, { projectId: "P-1", ifcSchema: "IFC2X3" })).total).toBe(1);
    });
    it("adds + resolves annotations (FK→project), filters; rejects missing project", async () => {
      expect((await addAnnotation(e, { annotationId: "AN-1", projectId: "P-1", kind: "issue", body: "clash at grid B2", elementId: "1aBc", authorDid: OWNER })).status).toBe("added");
      expect((await addAnnotation(e, { annotationId: "AN-X", projectId: "GHOST", kind: "comment", body: "x" })).status).toBe("projectNotFound");
      expect((await addAnnotation(e, { annotationId: "AN-Y", projectId: "P-1", kind: "bogus" as any, body: "x" })).status).toBe("rejected");
      expect((await listAnnotations(e, { projectId: "P-1", status: "open" })).total).toBe(1);
      expect((await resolveAnnotation(e, { annotationId: "AN-1" })).status).toBe("resolved");
      expect((await resolveAnnotation(e, { annotationId: "AN-1" })).status).toBe("rejected"); // already resolved
      expect((await listAnnotations(e, { kind: "issue", status: "resolved" })).total).toBe(1);
    });
    it("coverage rolls up the three collections", async () => {
      await addRevision(e, { revisionId: "R-1", projectId: "P-1", version: 1, ifcSchema: "IFC4" });
      await addAnnotation(e, { annotationId: "AN-1", projectId: "P-1", kind: "comment", body: "note" });
      const cov = await coverage(e);
      expect(cov.projectCount).toBe(1);
      expect(cov.revisionCount).toBe(1);
      expect(cov.annotationCount).toBe(1);
      expect(cov.revisionsBySchema?.IFC4).toBe(1);
      expect(cov.openAnnotations).toBe(1);
    });
  });
});
