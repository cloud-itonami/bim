# Operator quickstart — `cloud-itonami/bim`

Every command below was run end to end on **2026-08-12** against commit
`8d5b872` on `main`, and the output shown is the output that came back. Where a
step failed, the failure is recorded rather than fixed — §10 is the list of
things this document does **not** claim to have done.

Read [`../README.md`](../README.md) first. The short version is that this repo
has two halves, `kotoba/` works and `appview/` does not, and §6–§8 are where you
find out why.

- §1–§2 need **nothing installed** — not even Node.
- §3–§5 need **Node + npm** and about 311 MB of disk.
- §6 additionally needs a browser and Python 3 (for a one-line static server).
- §7 needs only Node — it is the browser-free version of §6's diagnosis.

Timings are from an M-series Mac with a warm npm cache. Treat them as an order of
magnitude, not a benchmark.

---

## §1 Read the repo without installing anything

There are 18 tracked files. You can hold the whole thing in your head.

```bash
git ls-files
```

```
CLAUDE.md
NOTICE
README.edn
appview/etzhayyim-wasm-bim-b1m3d1tr/kotodama.jsonld
appview/etzhayyim-wasm-bim-b1m3d1tr/src/app.ts
appview/etzhayyim-wasm-bim-b1m3d1tr/svelte/static/v2.htm
appview/etzhayyim-wasm-bim-b1m3d1tr/svelte/static/v2/kami_app_bim.d.ts
appview/etzhayyim-wasm-bim-b1m3d1tr/svelte/static/v2/kami_app_bim.js
appview/etzhayyim-wasm-bim-b1m3d1tr/svelte/static/v2/kami_app_bim_bg.wasm
appview/etzhayyim-wasm-bim-b1m3d1tr/svelte/static/v2/kami_app_bim_bg.wasm.d.ts
kotoba/package.json
kotoba/src/index.ts
kotoba/src/registry.ts
kotoba/src/types.ts
kotoba/test/bim.test.ts
kotoba/tsconfig.json
kotoba/vitest.config.ts
migration.edn
```

The four files that carry all the meaning:

| file | what it decides |
|---|---|
| `CLAUDE.md` | the architecture the project intends, its ADR references, and its **Prohibitions** — including the one `kotoba/` violates |
| `kotoba/src/registry.ts` | the only working behaviour in the repo: FK-guarded project / revision / annotation writes |
| `appview/.../src/app.ts` | the five XRPC methods, all Phase-0 stubs except the job callback |
| `appview/.../svelte/static/v2.htm` | the viewer page, and the `init()` call that fails in §6 |

## §2 Check the extraction record — no dependencies

`migration.edn` records what was carried out of `etzhayyim/root`:
`:tracked-files 16 :bytes 435336`. The two metadata files added during extraction
(`README.edn`, `migration.edn`) are not part of that count, so the claim is still
checkable today:

```bash
git ls-files CLAUDE.md NOTICE appview kotoba | wc -l
git ls-files CLAUDE.md NOTICE appview kotoba | xargs wc -c | tail -1
```

```
      16
  435336 total
```

Both match `migration.edn` exactly. If either number moves, someone has edited
extracted content without updating the record — that is the only thing this check
is for.

> The paths are **selected**, not filtered. Excluding the metadata files with
> `grep -v` instead would be correct right up until a repo-level file like this
> one gets committed, at which point the count silently becomes wrong. Naming the
> extracted paths keeps the check valid no matter what else lands.

## §3 Build and test the half that works

```bash
cd kotoba
npm install
```

```
added 135 packages, and audited 136 packages in 2m
...
npm warn allow-scripts 8 packages have install scripts not yet covered by allowScripts:
npm warn allow-scripts   @etzhayyim/sdk@0.1.0-alpha (prepare: tsc)
npm warn allow-scripts   @etzhayyim/atproto-client@0.1.0-alpha (prepare: tsc)
...
npm warn allow-scripts   @signalapp/libsignal-client@0.94.4
```

Wall clock was **2m14s**, most of it cloning git dependencies: the lockfile
resolves **8 `@etzhayyim/*` packages from git**, each pinned to a commit SHA —
two declared here (`sdk`, `sdk-mock`) and six pulled in transitively
(`atproto-client`, `base-l2`, `checkpointer`, `ipfs`, `pqh`, `witness-quorum`).
None of them come from a registry, so §3 needs GitHub reachable, not just npm.

**Read that warning carefully — it is misleading here.** `@etzhayyim/sdk`
publishes `main: ./dist/index.js`, and `dist/` is **not tracked in the sdk's own
git repo** (`git clone` it and `git ls-files dist` returns 0). Yet
`node_modules/@etzhayyim/sdk/dist/` exists after install, with an mtime matching
the install — so the `prepare: tsc` build did run, and §3 and §4 depend on it
having run. The warning is therefore about approving something *else*; exactly
which gate it names was not chased down here. What matters operationally: if a
future npm actually withholds that build, §3 breaks and it will look like a
missing module rather than a policy change.

```bash
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
```

```
(typecheck: no output, exit 0)

 RUN  v4.1.10

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  317ms
```

## §4 Know what `npm run typecheck` does not cover

`tsconfig.json` has `"include": ["src/**/*.ts"]`. So:

```bash
npx tsc --noEmit --listFiles | grep kotoba | grep -v node_modules
```

```
/private/tmp/.../kotoba/src/types.ts
/private/tmp/.../kotoba/src/registry.ts
/private/tmp/.../kotoba/src/index.ts
```

Three files. **`test/bim.test.ts` is not typechecked by the declared script.**
vitest transpiles it without checking types, so a type error in the test would
ship silently.

It happens to be clean today — checked explicitly, not assumed:

```bash
npx tsc --noEmit --target es2022 --module es2022 --moduleResolution bundler \
  --strict --esModuleInterop --skipLibCheck --lib es2022,dom test/bim.test.ts
echo $?
```

```
0
```

Clean, but nothing keeps it that way. Widening `include` is a one-line change and
is left as a decision for whoever owns this repo.

## §5 Prove the tests bite

Four passing tests are not evidence on their own. Delete a guard and watch the
suite go red. Both mutations below were applied to `kotoba/src/registry.ts`, run,
and reverted.

**Mutation 1 — drop the revision→project FK check** (`addRevision`, the three
lines returning `projectNotFound`):

```
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
```

**Mutation 2 — drop the IFC schema validation** (`if (!IFC_SCHEMAS.has(...))`):

```
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
```

Restore and confirm green again:

```bash
git checkout -- src/registry.ts && npm run test
```

```
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

2 of 2 mutations caught. That is a narrow claim about two guards, not a coverage
number — but it is a measured one.

## §6 Serve the viewer and watch it fail

From `appview/etzhayyim-wasm-bim-b1m3d1tr/svelte/static`:

```bash
python3 -m http.server 4399 &
for p in /v2.htm /v2/kami_app_bim.js /v2/kami_app_bim_bg.wasm; do
  printf '%-32s %s\n' "$p" "$(curl -sS -o /dev/null -w '%{http_code} %{size_download}B' http://localhost:4399$p)"
done
curl -sSI http://localhost:4399/v2/kami_app_bim_bg.wasm | grep -i content-type
```

```
/v2.htm                          200 6417B
/v2/kami_app_bim.js              200 63332B
/v2/kami_app_bim_bg.wasm         200 310910B
Content-type: application/wasm
```

All three assets serve, and the MIME type is right — `instantiateStreaming`
rejects anything that is not `application/wasm`, so a server that gets this wrong
produces a *different* error than the one below. Python 3 gets it right; not
every one-line static server does.

Now load it:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --user-data-dir=/tmp/chrome-bim-probe \
  --enable-logging=stderr --virtual-time-budget=8000 \
  --dump-dom http://localhost:4399/v2.htm > /tmp/bim-dom.html 2>/tmp/bim-console.log
grep -E "CONSOLE" /tmp/bim-console.log
```

Chrome 151.0.7922.76:

```
INFO:CONSOLE(1498) "using deprecated parameters for the initialization function;
  pass a single object instead", source: .../v2/kami_app_bim.js
INFO:CONSOLE(148) "Uncaught (in promise) CompileError:
  WebAssembly.instantiateStreaming(): opcode f32.copysign is not allowed in
  constant expressions @+266510", source: .../v2.htm (148)
```

Two separate problems, in order of severity:

1. **The `.wasm` does not compile.** `init()` rejects, the page's top-level async
   IIFE rejects with it, and nothing after line 96 of `v2.htm` ever runs. The DOM
   proves it — the HUD is still showing its placeholder:

   ```bash
   grep -o 'id="h-scene"[^<]*<[^>]*>[^<]*' /tmp/bim-dom.html
   ```
   ```
   id="h-scene">—</span>
   ```

   The page paints its chrome (HUD, hint bar, pick card) and then stops. No
   canvas is ever touched, and the offline `demo_office_storey()` fallback is
   **also** unreachable because it lives inside the same module.

2. `v2.htm` calls `init('./v2/kami_app_bim_bg.wasm')` with a bare string; the
   bundled wasm-bindgen glue wants `{module_or_path: …}`. Cosmetic today, and it
   will become a hard error whenever the glue is regenerated.

Kill the server when done — `pkill -f "http.server 4399"`.

## §7 Diagnose the `.wasm` without a browser

Chrome is V8, so one engine is not evidence. Two more, both rejecting at the same
byte:

```bash
node -e 'const fs=require("fs");WebAssembly.compile(fs.readFileSync("kami_app_bim_bg.wasm")).then(()=>console.log("OK")).catch(e=>console.log("FAIL:",e.message))'
deno eval 'try{await WebAssembly.compile(Deno.readFileSync("kami_app_bim_bg.wasm"));console.log("OK")}catch(e){console.log("FAIL:",e.message)}'
```

```
FAIL: WebAssembly.compile(): opcode f32.copysign is not allowed in constant expressions @+266510
FAIL: WebAssembly.compile(): opcode f32.copysign is not allowed in constant expressions @+266510
```

Node 26.3.0 carries V8 14.6; Deno 2.4.5 carries V8 13.7. Same offset from both,
so it is not a feature-flag question — but they are still both V8. Walk the
`data` section by hand and the format violation is visible without trusting any
engine:

```bash
node -e '
const b=require("fs").readFileSync("kami_app_bim_bg.wasm");
let p=260618;                                   // start of the data section body
const leb=()=>{let r=0,s=0,c;do{c=b[p++];r|=(c&0x7f)<<s;s+=7}while(c&0x80);return r>>>0};
const n=leb(); console.log("data segments declared:",n);
for(let i=0;i<n;i++){
  const at=p, flags=leb(), op=b[p];
  if(op!==0x41){console.log(`seg ${i} at ${at}: offset expr starts 0x${op.toString(16)}, expected 0x41 i32.const`);break}
  p++; leb(); p++;                              // i32.const N, end
  const len=leb(); p+=len;
  if(i===0) console.log(`seg 0 ends at ${p}`);
}'
```

```
data segments declared: 99
seg 0 ends at 266509
seg 1 at 266509: offset expr starts 0x98, expected 0x41 i32.const
```

Byte 266,510 is `0x98` = `f32.copysign`, exactly where the engines stop. The
section table is inconsistent at the other end too: `data` declares 50,021 bytes
and therefore ends at 310,639, but the next real section header (`producers`)
starts at 310,645.

Finally, confirm this is not something the extraction did:

```bash
shasum -a 256 kami_app_bim_bg.wasm
shasum -a 256 ~/…/orgs/etzhayyim/root/60-apps/etzhayyim-project-bim/appview/etzhayyim-wasm-bim-b1m3d1tr/svelte/static/v2/kami_app_bim_bg.wasm
```

Both `c0cd4520f26f6b8dc7e5f6355f395cfbaff3dcba763d8c59db49b31d8436f1ec`. The
upstream copy fails to compile identically. **The artifact was never valid; it was
carried faithfully.** Fixing it means regenerating from the `kami-app-bim` crate,
which is not in this repo.

## §8 Confirm the Worker cannot be built here

```bash
find appview -name "package.json" -o -name "wrangler*" -o -name "tsconfig*"
```

```
(no output)
```

No build config of any kind. For contrast, the sibling `tenso` appview upstream
ships `package.json`, `wrangler.jsonc`, and a whole `svelte/` shell — bim's never
did, so this is faithful to upstream rather than lost in extraction.

`src/app.ts`'s only import is `@etzhayyim/kotodama-host-sdk`:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/@etzhayyim%2Fkotodama-host-sdk
git -C <etzhayyim/root> grep -l '"name": *"@etzhayyim/kotodama-host-sdk"' -- '*package.json' | wc -l
git -C <etzhayyim/root> grep -l 'kotodama-host-sdk' -- '*/package.json' | wc -l
```

```
404
0
247
```

247 packages in `etzhayyim/root` depend on it as `workspace:*` and **none defines
it**. So there is nothing to install, under either a workspace or a registry.
`kotoba-lang/kotodama-host` is a different thing — a Clojure repo with a
`deps.edn`, not this npm package.

## §9 The network reality

```bash
for h in etzhayyim.com bim.etzhayyim.com b1m3d1tr.etzhayyim.com plc.etzhayyim.com; do
  printf '%-28s %s\n' "$h" "$(dig +short "$h" | head -1)"
done
```

```
etzhayyim.com                104.21.51.111
bim.etzhayyim.com
b1m3d1tr.etzhayyim.com
plc.etzhayyim.com
```

Only the parent zone resolves — and it round-robins across Cloudflare anycast
addresses, so expect a different first line (`172.67.179.128` on the next run
here). The three blanks are the part that matters and they are stable. `bim.etzhayyim.com` is the `did:web` base for all
six DIDs this project declares (`did:web:bim.etzhayyim.com` plus five
`:actor:` paths), so **none of them resolve**, and the `bim-job` Container the
importer depends on has no host either.

## §10 What this document has not done

Recorded so nobody reads the sections above as broader than they are.

- **No deploy, and no `wrangler dev`.** There is no wrangler config to deploy
  (§8). Whether `BIM_JOB`, `HYPERDRIVE`, or any other binding behaves correctly
  under workerd is completely untested here.
- **No successful XRPC call, ever.** All five methods
  (`importIfc`, `getStoreyScene`, `listSpaces`, `annotateElement`,
  `requestExport`) were read, not executed. Four of them are self-declared Phase-0
  stubs returning empty results with a `note`.
- **The viewer was never seen rendering.** §6 establishes that it fails, not what
  it would look like if it worked. No WebGPU or WebGL path in `kami_app_bim.js`
  was exercised, because compilation never got that far.
- **`kotoba/` was tested only against the in-memory mock.** `MockEtzhayyim` is
  the only backend used. Nothing here touched a real AT PDS, and the `coverage`
  pagination path (`scanAll`, `PAGE_LIMIT` 100) has never been run against more
  than a handful of records.
- **The ADR contradiction in the README was read, not adjudicated.** Both data
  planes are described; which one wins is not decided here.
- **No `.wasm` was regenerated.** The fix for §6/§7 is upstream in `kami-app-bim`
  and is out of scope for a documentation pass.

## §11 Disk and cleanup

`npm install` in `kotoba/` leaves **311 MB** in `kotoba/node_modules/` plus a
`package-lock.json`.

**This repo has no `.gitignore`.** Both artifacts therefore show up as untracked
and `git status` stays dirty after §3:

```
?? kotoba/node_modules/
?? kotoba/package-lock.json
```

To reclaim the space:

```bash
rm -rf kotoba/node_modules kotoba/package-lock.json
```

Whether to commit the lockfile and whether to add a `.gitignore` are both
dependency-policy decisions for whoever owns this repo. Deciding either one
silently, from a quickstart, would hide the choice — so this file only makes sure
you notice it.
