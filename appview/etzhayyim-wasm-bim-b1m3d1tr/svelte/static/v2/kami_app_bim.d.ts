/* tslint:disable */
/* eslint-disable */

/**
 * JS entry (demo fallback): `import init, { run_bim_v2 } from './kami_app_bim.js';`
 * Renders the hardcoded `demo_office_storey()` — used when no XRPC
 * `getStoreyScene` response is available.
 */
export function run_bim_v2(canvas_id: string): Promise<void>;

/**
 * JS entry (XRPC-fed): parses a JSON string produced by
 * `com.etzhayyim.apps.bim.getStoreyScene` into a `kami_bim::StoreyScene`
 * and feeds it to the `BimSceneAdapter`. Mouse-projected click =
 * pick + amber highlight + JS bridge publish.
 */
export function run_bim_v2_with_scene(canvas_id: string, scene_json: string): Promise<void>;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly run_bim_v2: (a: number, b: number) => any;
    readonly run_bim_v2_with_scene: (a: number, b: number, c: number, d: number) => any;
    readonly wasm_bindgen__closure__destroy__h2999ab7c8b76f609: (a: number, b: number) => void;
    readonly wasm_bindgen__closure__destroy__h03820c45ce4d1dc1: (a: number, b: number) => void;
    readonly wasm_bindgen__closure__destroy__h5c1f4f983c7f8bff: (a: number, b: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h7fab2cc70c6a6a11: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h5db5e8dc2faf8fdd: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h3a6f88c67b5f8bee: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h3a6f88c67b5f8bee_3: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h3a6f88c67b5f8bee_4: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h3a6f88c67b5f8bee_5: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h0e2e1e630fd47a7f: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
