import {
  asAgentTool,
  createKyselyDb,
  createWorkerExport,
  decodeJson,
  genID,
  nowISO,
  nsid,
  sql,
  withCapabilityTags,
  type HostSDK,
} from "@etzhayyim/kotodama-host-sdk";

const PRIMARY_DID = "did:web:bim.etzhayyim.com";
const IMPORTER_DID = "did:web:bim.etzhayyim.com:actor:importer";
const TESSELLATOR_DID = "did:web:bim.etzhayyim.com:actor:tessellator";
const REVIEWER_DID = "did:web:bim.etzhayyim.com:actor:reviewer";
const EXPORTER_DID = "did:web:bim.etzhayyim.com:actor:exporter";

let pathDidsReady = false;

async function ensurePathDids(sdk: HostSDK): Promise<void> {
  if (pathDidsReady) return;
  sdk.pds.dispatch({ type: "com.atproto.identity.create", payload: { path: "actor:importer",    displayName: "BIM Importer",    description: "IFC STEP/XML/ZIP parser (CF Container)" } });
  sdk.pds.dispatch({ type: "com.atproto.identity.create", payload: { path: "actor:tessellator", displayName: "BIM Tessellator", description: "BREP → triangle mesh (LOD 3)" } });
  sdk.pds.dispatch({ type: "com.atproto.identity.create", payload: { path: "actor:reviewer",    displayName: "BIM Reviewer",    description: "BCF annotation / viewpoint" } });
  sdk.pds.dispatch({ type: "com.atproto.identity.create", payload: { path: "actor:exporter",    displayName: "BIM Exporter",    description: "IFC / glTF / BCF / xlsx export" } });
  pathDidsReady = true;
}

// ── com.etzhayyim.apps.bim.importIfc ──
async function cmdImportIfc(sdk: HostSDK, env: Record<string, unknown>, body: Uint8Array): Promise<string> {
  const input = decodeJson(body, {
    projectId: "",
    blobKey: "",
    format: "ifcStep",
    schemaVersion: "IFC4",
    tessellationTolerance: 10.0,
    mergeCoincidentVertices: true,
  });
  if (!input.projectId) return JSON.stringify({ error: "projectId required" });
  if (!input.blobKey) return JSON.stringify({ error: "blobKey required" });
  await ensurePathDids(sdk);

  const revisionId = genID();
  const _importer = IMPORTER_DID;
  const _tessellator = TESSELLATOR_DID;

  // Enqueue heavy parse on the bim-job CF Container via service binding
  // (ADR 2604241500). Container fetches the IFC blob from B2 by `blobKey`,
  // walks the IfcProject tree, returns a jobId we can poll.
  const bimJob = (env as { BIM_JOB?: { fetch: (req: Request) => Promise<Response> } }).BIM_JOB;
  if (!bimJob) {
    return JSON.stringify({
      projectId: input.projectId,
      revisionId,
      jobId: genID(),
      status: "queued",
      note: "BIM_JOB binding missing — Container deploy not yet wired",
    });
  }
  try {
    const req = new Request("https://bim-job.etzhayyim.com/jobs/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: input.projectId,
        revisionId,
        blobKey: input.blobKey,
        format: input.format,
        schemaVersion: input.schemaVersion,
        tessellationTolerance: input.tessellationTolerance,
      }),
    });
    const resp = await bimJob.fetch(req);
    const text = await resp.text();
    if (!resp.ok) {
      return JSON.stringify({
        projectId: input.projectId,
        revisionId,
        jobId: genID(),
        status: "failed",
        error: `bim-job ${resp.status}: ${text}`,
      });
    }
    const out = JSON.parse(text) as { jobId: string; status: string };
    return JSON.stringify({
      projectId: input.projectId,
      revisionId,
      jobId: out.jobId,
      status: out.status,
    });
  } catch (e) {
    return JSON.stringify({
      projectId: input.projectId,
      revisionId,
      jobId: genID(),
      status: "failed",
      error: String(e),
    });
  }
}

// ── com.etzhayyim.apps.bim.getStoreyScene ──
async function qGetStoreyScene(sdk: HostSDK, body: Uint8Array): Promise<string> {
  const _ = sdk;
  const input = decodeJson(body, {
    storeyId: "",
    lod: "shaded",
    includeSpaces: true,
    includeMeshBlobRefs: true,
  });
  if (!input.storeyId) return JSON.stringify({ error: "storeyId required" });
  // TODO: Hyperdrive SELECT from vertex_bim_storey / vertex_bim_element + join; Phase 0 stub.
  return JSON.stringify({
    storeyId: input.storeyId,
    storeyName: "",
    elevation: 0,
    height: 0,
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
    items: [],
    spaces: [],
    materials: [],
    note: "Phase 0 stub — wire createKyselyDb + kami-bim::StoreyScene in next iteration",
  });
}

// ── com.etzhayyim.apps.bim.listSpaces ──
async function qListSpaces(sdk: HostSDK, body: Uint8Array): Promise<string> {
  const _ = sdk;
  const input = decodeJson(body, { projectId: "", storeyId: "", category: "", offset: 0, limit: 100 });
  const offset = Math.max(0, Number(input.offset) || 0);
  const limit = Math.min(500, Math.max(1, Number(input.limit) || 100));
  if (!input.projectId) return JSON.stringify({ error: "projectId required" });
  return JSON.stringify({ items: [], total: 0, offset, limit, note: "Phase 0 stub" });
}

// ── com.etzhayyim.apps.bim.annotateElement ──
async function cmdAnnotateElement(sdk: HostSDK, body: Uint8Array): Promise<string> {
  const input = decodeJson(body, {
    elementId: "",
    storeyId: "",
    kind: "comment",
    severity: "info",
    text: "",
    assignedTo: "",
    replyTo: "",
  });
  if (!input.elementId) return JSON.stringify({ error: "elementId required" });
  if (!input.text) return JSON.stringify({ error: "text required" });
  await ensurePathDids(sdk);
  const rkey = genID();
  const createdAt = nowISO();
  // TODO: Hyperdrive INSERT vertex_bim_annotation; Phase 0 returns the id only.
  const _reviewer = REVIEWER_DID;
  return JSON.stringify({
    annotationUri: `at://${PRIMARY_DID}/com.etzhayyim.apps.bim.annotation/${rkey}`,
    rkey,
    createdAt,
  });
}

// ── com.etzhayyim.apps.bim.requestExport ──
async function cmdRequestExport(sdk: HostSDK, env: Record<string, unknown>, body: Uint8Array): Promise<string> {
  const input = decodeJson(body, {
    revisionId: "",
    target: "ifcStep",
    schemaVersion: "IFC4",
    scope: "whole",
    scopeId: "",
    includeQuantities: true,
    includePropertySets: true,
  });
  if (!input.revisionId) return JSON.stringify({ error: "revisionId required" });
  await ensurePathDids(sdk);
  const _exporter = EXPORTER_DID;

  const bimJob = (env as { BIM_JOB?: { fetch: (req: Request) => Promise<Response> } }).BIM_JOB;
  if (!bimJob) {
    return JSON.stringify({ jobId: genID(), status: "queued", estimatedSeconds: 30, note: "BIM_JOB binding missing" });
  }
  try {
    const req = new Request("https://bim-job.etzhayyim.com/jobs/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const resp = await bimJob.fetch(req);
    const text = await resp.text();
    if (!resp.ok) return JSON.stringify({ jobId: genID(), status: "failed", error: `bim-job ${resp.status}: ${text}` });
    return text;
  } catch (e) {
    return JSON.stringify({ jobId: genID(), status: "failed", error: String(e) });
  }
}

async function cmdHealth(): Promise<string> {
  return JSON.stringify({ ok: true, app: "bim", ts: nowISO() });
}

export default createWorkerExport((sdk) => {
  const env = (sdk as unknown as { env?: Record<string, unknown> }).env ?? {};
  sdk.app.command(
    nsid("com.etzhayyim.apps.bim.importIfc"),
    async (_ctx: unknown, body: Uint8Array) => cmdImportIfc(sdk, env, body),
    asAgentTool("Import an IFC file (STEP / XML / ZIP) into a BIM project; returns a job id."),
    withCapabilityTags("write", "bim", "ifc", "import"),
  );
  sdk.app.query(
    nsid("com.etzhayyim.apps.bim.getStoreyScene"),
    async (_ctx: unknown, body: Uint8Array) => qGetStoreyScene(sdk, body),
    asAgentTool("Return a scene-graph projection of a single IfcBuildingStorey for WebGPU rendering."),
    withCapabilityTags("read", "bim", "scene"),
  );
  sdk.app.query(
    nsid("com.etzhayyim.apps.bim.listSpaces"),
    async (_ctx: unknown, body: Uint8Array) => qListSpaces(sdk, body),
    asAgentTool("List IfcSpace entities (room schedule / area take-off)."),
    withCapabilityTags("read", "bim", "spaces"),
  );
  sdk.app.command(
    nsid("com.etzhayyim.apps.bim.annotateElement"),
    async (_ctx: unknown, body: Uint8Array) => cmdAnnotateElement(sdk, body),
    asAgentTool("Attach a BCF-style annotation (comment / issue / RFI) to a BIM element."),
    withCapabilityTags("write", "bim", "annotation", "bcf"),
  );
  sdk.app.command(
    nsid("com.etzhayyim.apps.bim.requestExport"),
    async (_ctx: unknown, body: Uint8Array) => cmdRequestExport(sdk, env, body),
    asAgentTool("Enqueue an IFC / glTF / BCF / xlsx / PDF export job."),
    withCapabilityTags("write", "bim", "export"),
  );
  sdk.app.command(nsid("com.etzhayyim.apps.bim.health"), async () => cmdHealth());

  // ── Internal callback: bim-job container → Worker ───────────────────
  // Container POSTs the parse catalog here when a job flips to `ready`;
  // we Hyperdrive-INSERT vertex_bim_{storey,space,building} rows + flip
  // vertex_bim_job.status. NOT an XRPC method — auth via HMAC-shared
  // INTERNAL_JOB_SECRET env, so external clients can't trigger it.
  const router = (sdk as unknown as { router: any }).router;
  if (router?.post) {
    router.post("/_internal/jobs/complete", async (c: any) => {
      const secret = (c.env?.INTERNAL_JOB_SECRET as string | undefined) ?? "";
      if (!secret) return new Response("INTERNAL_JOB_SECRET missing", { status: 500 });
      const sig = c.req.header("x-internal-auth") ?? "";
      const raw = await c.req.text();
      const expected = await hmacHex(secret, raw);
      if (!constantTimeEq(sig, expected)) {
        return new Response("auth", { status: 401 });
      }
      try {
        const body = JSON.parse(raw) as JobCompleteBody;
        return await ingestCatalog(c.env ?? {}, body);
      } catch (e) {
        return new Response(`bad request: ${String(e)}`, { status: 400 });
      }
    });
  }
});

// ── Job-complete ingest: container → Worker → Hyperdrive ───────────────

interface JobCompleteBody {
  jobId: string;
  projectId: string;        // at:// uri (also written to owner_did)
  revisionId: string;       // vertex_bim_revision.vertex_id
  ok: boolean;
  catalog?: {
    schema?: string;
    totals?: Record<string, unknown>;
    projects?: Array<{
      sites?: Array<{
        buildings?: Array<{
          globalId?: string;
          name?: string;
          storeys?: Array<{
            globalId?: string;
            name?: string;
            elevation?: number;
            spaces?: Array<{
              globalId?: string;
              name?: string;
              longName?: string;
            }>;
          }>;
        }>;
      }>;
    }>;
  };
  error?: string;
}

async function ingestCatalog(env: Record<string, unknown>, body: JobCompleteBody): Promise<Response> {
  const hd = (env as { HYPERDRIVE?: unknown }).HYPERDRIVE;
  if (!hd) return new Response("HYPERDRIVE binding missing", { status: 500 });
  const db = createKyselyDb(hd as any);
  const now = nowISO();
  const owner = body.projectId;

  // Flip job status first so a partial entity-insert failure still
  // unblocks the Worker poller.
  try {
    await sql`
      UPDATE vertex_bim_job
      SET status = ${body.ok ? "ready" : "failed"},
          finished_at = ${now},
          error_message = ${body.error ?? null}
      WHERE vertex_id = ${body.jobId}
    `.execute(db);
  } catch (e) {
    console.warn("[bim/_internal] job status update failed:", String(e));
  }

  if (!body.ok || !body.catalog) {
    return new Response(JSON.stringify({ ok: true, applied: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  // Insert buildings + storeys + spaces. Element rows skipped for Phase
  // 2-pre (geometry tessellation is Phase 2). Idempotent via ON CONFLICT.
  let inserted = { buildings: 0, storeys: 0, spaces: 0 };
  for (const proj of body.catalog.projects ?? []) {
    for (const site of proj.sites ?? []) {
      for (const bldg of site.buildings ?? []) {
        const buildingId = `at://${owner}/com.etzhayyim.apps.bim.building/${bldg.globalId ?? genID()}`;
        try {
          await sql`
            INSERT INTO vertex_bim_building (
              vertex_id, owner_did, repo, revision_id, global_id, name, created_at
            )
            SELECT ${buildingId}, ${owner}, ${owner}, ${body.revisionId},
              ${bldg.globalId ?? null}, ${bldg.name ?? ""}, ${now}
            WHERE NOT EXISTS (
              SELECT 1 FROM vertex_bim_building WHERE vertex_id = ${buildingId}
            )
          `.execute(db);
          inserted.buildings++;
        } catch (e) {
          console.warn("[bim/_internal] building insert:", String(e));
        }

        for (const st of bldg.storeys ?? []) {
          const storeyId = `at://${owner}/com.etzhayyim.apps.bim.storey/${st.globalId ?? genID()}`;
          try {
            await sql`
              INSERT INTO vertex_bim_storey (
                vertex_id, owner_did, repo, revision_id, building_id, global_id,
                name, elevation, created_at
              )
              SELECT ${storeyId}, ${owner}, ${owner}, ${body.revisionId}, ${buildingId},
                ${st.globalId ?? null}, ${st.name ?? ""}, ${st.elevation ?? 0}, ${now}
              WHERE NOT EXISTS (
                SELECT 1 FROM vertex_bim_storey WHERE vertex_id = ${storeyId}
              )
            `.execute(db);
            inserted.storeys++;
          } catch (e) {
            console.warn("[bim/_internal] storey insert:", String(e));
          }

          for (const sp of st.spaces ?? []) {
            const spaceId = `at://${owner}/com.etzhayyim.apps.bim.space/${sp.globalId ?? genID()}`;
            try {
              await sql`
                INSERT INTO vertex_bim_space (
                  vertex_id, owner_did, repo, revision_id, storey_id, building_id,
                  global_id, name, long_name, created_at
                )
                SELECT ${spaceId}, ${owner}, ${owner}, ${body.revisionId}, ${storeyId},
                  ${buildingId}, ${sp.globalId ?? null}, ${sp.name ?? ""},
                  ${sp.longName ?? ""}, ${now}
                WHERE NOT EXISTS (
                  SELECT 1 FROM vertex_bim_space WHERE vertex_id = ${spaceId}
                )
              `.execute(db);
              inserted.spaces++;
            } catch (e) {
              console.warn("[bim/_internal] space insert:", String(e));
            }
          }
        }
      }
    }
  }

  // Flip revision status → ready (Worker poller can now serve scene).
  try {
    await sql`
      UPDATE vertex_bim_revision SET status = ${"ready"} WHERE vertex_id = ${body.revisionId}
    `.execute(db);
  } catch (e) {
    console.warn("[bim/_internal] revision status update:", String(e));
  }

  return new Response(JSON.stringify({ ok: true, inserted }), {
    headers: { "content-type": "application/json" },
  });
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const view = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < view.length; i++) hex += view[i].toString(16).padStart(2, "0");
  return hex;
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
