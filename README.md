# bim

`cloud-itonami/bim` — **a browser BIM (Building Information Modeling) viewer,
reviewer, annotator and IFC exporter.** That is the design. What is in this repo
is two halves of it that do not meet, and one of the two does not run at all.

Stating that up front, because the file tree looks like a working app:

| half | what it is | does it work |
|---|---|---|
| `kotoba/` | project + IFC-revision + annotation registry on AT PDS records | **yes** — typechecks, 4 tests pass, and the tests bite (§5 of the quickstart) |
| `appview/` | the Worker that serves `com.etzhayyim.apps.bim.*`, plus a WebGPU viewer | **no** — the Worker has no build config here, and the viewer's `.wasm` does not compile in any engine |

| | |
|---|---|
| repo | `cloud-itonami/bim` (west path `orgs/cloud-itonami/bim`) |
| origin | extracted from `etzhayyim/root` at `60-apps/etzhayyim-project-bim` |
| declared DID | `did:web:bim.etzhayyim.com` (+ 5 path DIDs for importer / tessellator / reviewer / exporter / classifier) |
| declared host | `bim.etzhayyim.com` |
| deployed | **no** — see [Current status](#current-status) |
| tracked files | 18 (16 extracted + `README.edn` + `migration.edn`) |

## The viewer artifact is malformed

This is the single most important fact about the repo and it is not visible from
reading the source, so it goes first.

`appview/etzhayyim-wasm-bim-b1m3d1tr/svelte/static/v2/kami_app_bim_bg.wasm`
(310,910 bytes, sha256 `c0cd4520…36f1ec`) **fails to compile.** Measured
2026-08-12 in three engines:

| engine | result |
|---|---|
| Chrome 151.0.7922.76 | `CompileError: WebAssembly.instantiateStreaming(): opcode f32.copysign is not allowed in constant expressions @+266510` |
| Node 26.3.0 (V8 14.6) | same message, same offset |
| Deno 2.4.5 (V8 13.7) | same message, same offset |

It is not an engine-version question. Walking the `data` section by hand
(quickstart §7, twelve lines of Node that know nothing about V8) shows segment 0
ending at byte 266,509 and segment 1's offset expression beginning `0x98`
(`f32.copysign`) where the format requires `0x41` (`i32.const`) — the exact byte
the engines name. The section table has a matching inconsistency at the other
end: `data` declares 50,021 bytes and ends at 310,639, but the next real section
header (`producers`) starts at 310,645.

**The file is byte-identical to the copy still sitting in `etzhayyim/root`.** The
extraction was faithful; the defect predates it. Nothing in the pipeline that
produced or carried this artifact ever tried to compile it.

Consequence: `v2.htm` renders its HUD chrome and then stops. `init()` rejects, so
the whole page IIFE rejects, so `scene:` stays `—` forever and no canvas is ever
touched. **Even the offline demo path (`demo_office_storey()`) is unreachable** —
it lives inside the same module. Regenerating the artifact from `kami-app-bim` is
the fix, and that crate is not in this repo.

## The two halves disagree about where BIM data lives

`CLAUDE.md` (carried over from `etzhayyim/root`, and still the authoring rule for
this project) has a Prohibitions section that says, in as many words:

> `sdk.pds.createRecord` で `com.etzhayyim.apps.bim.*` を書くこと禁止 (ADR-0036, Hyperdrive 直接)

`kotoba/src/registry.ts` writes `com.etzhayyim.apps.bim.project`,
`.revision` and `.annotation` as AT PDS records — that is the whole package.
`appview/.../src/app.ts` does the other thing: `createKyselyDb(env.HYPERDRIVE)`
against `vertex_bim_building` / `_storey` / `_space` / `_revision` / `_job`.

Both are in this repo. Neither is marked as superseded. `kotoba/src/types.ts`
cites a *different* ADR (2605172000, "Registry on AT PDS records (replaces RW)")
which reads like a later decision, but nothing here says so. **Deciding which
plane is authoritative is a governance call, not a documentation edit**, so this
README only records that the repo currently contains both answers.

They also disagree at the wire: `v2.htm` branches on a `demo` field in the
`getStoreyScene` response, and the Worker's `getStoreyScene` never sets one — it
returns a Phase-0 stub with empty `items` and a `note`. So even with a working
`.wasm` and a live Worker, the viewer would take the "real scene" branch and
render nothing.

## Repository layout

```
CLAUDE.md                 authoring rules inherited from etzhayyim/root (architecture, ADRs, prohibitions)
NOTICE                    Apache-2.0 + etzhayyim Charter Compliance Rider v3.1
README.edn                extraction record (machine-readable; superseded as an entry point by this file)
migration.edn             what was extracted, with a checkable file count and byte count
kotoba/                   ← the half that works
  src/types.ts              record shapes, DID/rkey helpers, IFC schema + annotation-kind sets
  src/registry.ts           createProject / addRevision / addAnnotation / resolve / list / coverage
  src/index.ts              barrel
  test/bim.test.ts          4 tests against @etzhayyim/sdk-mock
appview/etzhayyim-wasm-bim-b1m3d1tr/
  kotodama.jsonld           agent identity, routes, BIM_JOB service binding, subscribeRepos collections
  src/app.ts                Worker: 5 XRPC methods + health + an HMAC-auth job callback (NOT buildable here)
  svelte/static/v2.htm      the viewer page — HUD, pick card, orbit controls
  svelte/static/v2/         prebuilt wasm-bindgen output (see above)
```

`migration.edn` claims **16 files / 435,336 bytes**. That is still exactly true of
the 16 non-metadata files, and the quickstart checks it in one command with
nothing installed.

## What `kotoba/` actually gives you

A small FK-disciplined registry, and it is the only part of this repo you can
build on today:

- `createProject` — idempotent on `projectId`, rejects a non-`did:` owner
- `addRevision` — **rejects unless the project exists**, requires a positive
  integer version, an IFC schema from `{IFC2X3, IFC4, IFC4X3}`, and a
  CID-shaped `modelCid` if one is given
- `addAnnotation` / `resolveAnnotation` — same FK guard, kind is one of
  `comment | issue | markup`, and resolve is deliberately not idempotent (a
  second resolve is `rejected`). Note the Worker advertises this method as
  "comment / issue / **RFI**" in its agent-tool description — a third
  disagreement between the two halves, and the cheapest one to fix
- `coverage` — rolls up all three collections with an explicit `truncated` flag

Large IFC geometry is referenced by CID, never inlined — that is a deliberate
substrate constraint (`types.ts` cites ADR-2605172400), not an oversight.

Both guards above were confirmed by breaking them: the quickstart's §5 deletes
the revision FK check and then the IFC-schema check, and the suite goes red both
times.

## Current status

Nothing here is live. Measured 2026-08-12:

| host | role | resolves |
|---|---|---|
| `etzhayyim.com` | parent zone | yes (Cloudflare anycast) |
| `bim.etzhayyim.com` | declared route + `did:web` base for all 6 DIDs | **no** |
| `b1m3d1tr.etzhayyim.com` | legacy nanoid host | **no** |
| `plc.etzhayyim.com` | where `did:plc:bim` would be genesised | **no** |

And the Worker cannot be built from this repo even locally:

- there is **no `package.json`, no `wrangler.jsonc`, and no `tsconfig.json`**
  anywhere under `appview/`. Sibling appviews in `etzhayyim/root` (e.g. `tenso`)
  ship all three; bim's never did — this is faithful to upstream, not lost in
  extraction.
- `src/app.ts`'s only import is `@etzhayyim/kotodama-host-sdk`, which is **not on
  npm (404)** and is **not defined by any tracked `package.json` in
  `etzhayyim/root`** either, though 247 of them depend on it as `workspace:*`.

So the deployable half of this app is a source file with no build, no config, and
an unresolvable dependency, pointed at a Container service (`bim-job`) that also
does not exist.

## Getting started

Read [`docs/operator-quickstart.md`](docs/operator-quickstart.md). §1–§2 need
nothing installed; §3 onward were each run end to end on 2026-08-12 against
commit `8d5b872`, with real output recorded — including every failure.

## Naming

The bare name `bim` is the **subject** plane. Note that `README.edn` still
records `:name "com-etzhayyim-app-bim"` and `:kind :app`, and every DID, host and
NSID in this repo is under `etzhayyim.com`. The code has changed orgs; the
identifiers have not. Identity is the path `cloud-itonami/bim`, not the name
alone, and reconciling the two is a governance decision rather than a rename.
