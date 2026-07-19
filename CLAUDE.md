# etzhayyim-project-bim

`etzhayyim-project-bim` の権威ルール。この project は **App** として設計・実装する。

共通ルールは `60-apps/CLAUDE.md`。土台となるアーキテクチャ判断は ADR
`2604241500-cad-bim-per-game-wasm-topology.md` を正とする。

## Product Identity

- `bim` は browser-based BIM (Building Information Modeling) viewer / reviewer / annotator / exporter
- app boundary は `project → site → building → storey → space → element` を中心に置く
- 公開 contract は XRPC (`com.etzhayyim.apps.bim.*`)
- 会話 / 通知 / agent activity は AT Protocol (bsky + wproto) を使う
- 権威スキーマは IFC (IFC2X3 / IFC4 / IFC4X3)。内部モデルは `kami-bim` crate に SSoT

## Identifier (ADR-0019 atproto-native)

| 層 | 値 |
|---|---|
| Primary DID | `did:plc:bim` (Phase 5 `plc.etzhayyim.com` で genesis、当面 `did:web:bim.etzhayyim.com`) |
| Handle | `bim.etzhayyim.com` |
| Legacy nanoid | `b1m3d1tr` (grandfather、deprecate 2026-10-01) |
| NSID | `com.etzhayyim.apps.bim.*` |

## Runtime (ADR 2604241500 準拠)

| Layer | 方式 |
|---|---|
| **Viewer (hot path)** | `kami-app-bim` per-game WASM crate (`40-engine/kami-engine/kami-app-bim/`)。`run_bim_v2(canvas)` を JS から呼び、WebGPU で storey を描画 |
| **App Worker** | TS Native (`runtimeType: "worker"`)。Hono + host-sdk。XRPC `com.etzhayyim.apps.bim.*` を提供 |
| **Heavy job** | IFC parse / tessellation / IFC export は CF Container `bim-job` サブ service (lite 256 MiB) に分離。viewer path は Worker 1 経路で完結 |
| **UI overlay** | `@etzhayyim/kami-engine-sdk` + Svelte AppShell v2。storey switcher / space list / comment panel / viewpoint thumbnail を DOM overlay |

`kami-web` は触らない。新しい viewer 機能は `kami-bim` + `kami-app-bim` + `kami-pipelines` (`BimSceneAdapter`) に追加する。

## Project Actor Composition (1 project = N actor DIDs)

1 BIM project = 1 convoId。各 actor の成果物は `projectId` field でスコープ。

| Path DID | 役割 |
|---|---|
| `did:web:bim.etzhayyim.com` | controller |
| `did:web:bim.etzhayyim.com:actor:importer` | IFC STEP / XML / ZIP parser (CF Container) |
| `did:web:bim.etzhayyim.com:actor:tessellator` | BREP → triangle mesh (LOD 3 段階) |
| `did:web:bim.etzhayyim.com:actor:reviewer` | BCF annotation / viewpoint 管理 |
| `did:web:bim.etzhayyim.com:actor:exporter` | IFC / glTF / BCF / xlsx schedule 書き出し |
| `did:web:bim.etzhayyim.com:actor:classifier` | Uniclass / OmniClass / MasterFormat 自動付与 (LLM) |

## Domain Model

| 概念 | NSID | Graph vertex |
|---|---|---|
| Project | `com.etzhayyim.apps.bim.project` | `vertex_bim_project` |
| Revision | `com.etzhayyim.apps.bim.revision` | `vertex_bim_revision` |
| Building | `com.etzhayyim.apps.bim.building` | `vertex_bim_building` |
| Storey | `com.etzhayyim.apps.bim.storey` | `vertex_bim_storey` |
| Space | `com.etzhayyim.apps.bim.space` | `vertex_bim_space` |
| Element | `com.etzhayyim.apps.bim.element` | `vertex_bim_element` |
| PropertySet | `com.etzhayyim.apps.bim.propertySet` | `vertex_bim_pset` |
| Annotation | `com.etzhayyim.apps.bim.annotation` | `vertex_bim_annotation` |
| ImportJob / ExportJob | `com.etzhayyim.apps.bim.importJob` / `exportJob` | `vertex_bim_job` |

Edges: `HAS_STOREY`, `HAS_SPACE`, `HAS_ELEMENT`, `BOUNDED_BY`, `CONNECTED_TO`, `CLASSIFIED_AS`, `HAS_PSET`, `ANNOTATED_BY`.

## XRPC Surface (Phase 1)

| NSID | Type | 用途 |
|---|---|---|
| `com.etzhayyim.apps.bim.importIfc` | procedure | IFC → tessellation job enqueue |
| `com.etzhayyim.apps.bim.getStoreyScene` | query | storey 単位の scene projection |
| `com.etzhayyim.apps.bim.listSpaces` | query | room schedule / area take-off |
| `com.etzhayyim.apps.bim.annotateElement` | procedure | 要素付き comment / issue (BCF viewpoint) |
| `com.etzhayyim.apps.bim.requestExport` | procedure | IFC / glTF / BCF / xlsx / PDF export job |

Lexicon JSON は `00-contracts/lexicons/com/etzhayyim/bim/` に 5 file、ここが SSoT。

## Persistence (ADR-0036 — Worker-direct Hyperdrive)

- Domain write: `createKyselyDb(env.HYPERDRIVE).insertInto("vertex_bim_*").values(...).execute()` (1-RTT)
- Social derive: revision publish / annotation resolved 等で `sdk.pds.dispatch({ type:"app.bsky.feed.post", did, text })`
- State (T3): private viewpoint preset / 課金 / 個人設定 = `Preferences()`
- Blob: IFC 原本・glTF 派生・BCF zip は B2 (`etzhayyim-bim` bucket: `bim/blobs/{sha256}`, `bim/meshes/{sha256}`, `bim/exports/{sha256}`)。PDS `uploadBlob` の SHA-256 content-addressed convention を踏襲

## Collaboration (Phase 1 = review / annotate / presence)

- `subscribeRepos`: `app.bsky.feed.*` + `app.bsky.graph.follow` + `com.etzhayyim.apps.bim.annotation` + `com.etzhayyim.apps.bim.revision`
- Co-edit (Phase 2): branch + operation log + server rebuild。Phase 1 は review-only + authoritative revision

## First Increment

1. `importIfc` (Container job で IFC parse、graph insert、tessellation cache)
2. `getStoreyScene` (run_bim_v2 が直接消費できる scene projection)
3. `listSpaces`
4. `annotateElement` (BCF 互換 viewpoint)
5. `requestExport`

## Prohibitions

- `kami-web::run_with_*` に bim エントリ追加禁止 (ADR 2604241500)
- `sdk.pds.createRecord` で `com.etzhayyim.apps.bim.*` を書くこと禁止 (ADR-0036, Hyperdrive 直接)
- IFC 原本をそのまま AT Record (federable) に埋め込むこと禁止 (blobKey 参照のみ)
- BIM 図面レビュー以外のフル authoring (シン MEP 設計 / 構造解析 / 施工管理) は Phase 2 scope 外
