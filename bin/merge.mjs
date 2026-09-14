import { mkdir, readFile, copyFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

const json = (value) => JSON.stringify(value, null, 2) + "\n";
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

async function copyAsset(inputPath, outDir, sourceDir, name) {
  const source = resolve(sourceDir, inputPath);
  const targetName = `${name}-${basename(source)}`;
  const target = join(outDir, "media", targetName);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  return `media/${targetName}`;
}

async function normalize(input, index, outDir) {
  const manifest = JSON.parse(await readFile(input, "utf8"));
  const sourceDir = dirname(input);
  const kind = manifest.kind ?? "proofrun-runtime-evidence";
  const steps = (manifest.steps ?? manifest.journey?.steps ?? []).map((step, i) => ({
    id: step.id ?? `step-${i + 1}`,
    status: step.status ?? (manifest.status === "PASSED" ? "PASSED" : "UNKNOWN"),
    title: step.title ?? step.id ?? `Step ${i + 1}`,
    action: step.action ?? step.event ?? "observed",
    screenshot: step.screenshot ?? step.image ?? null,
    video: step.video ?? null,
    error: step.error ?? null,
    sourceRefs: step.sourceRefs ?? []
  }));
  const screenshotPaths = [];
  for (const [i, step] of steps.entries()) {
    if (step.screenshot) step.screenshot = await copyAsset(step.screenshot, outDir, sourceDir, `${index}-${i + 1}`);
    if (step.video) step.video = await copyAsset(step.video, outDir, sourceDir, `${index}-${i + 1}`);
    if (step.screenshot) screenshotPaths.push(step.screenshot);
  }
  if (manifest.visualEvidence?.screenshots) {
    for (const [i, path] of manifest.visualEvidence.screenshots.entries()) {
      if (!steps[i]) steps.push({ id: `step-${i + 1}`, status: manifest.status ?? "UNKNOWN", title: `Step ${i + 1}`, action: "observed", screenshot: null, sourceRefs: [] });
      if (path) steps[i].screenshot = await copyAsset(path, outDir, sourceDir, `${index}-${i + 1}`);
    }
  }
  const video = manifest.visualEvidence?.video ?? manifest.runtime?.video ?? manifest.steps?.find((step) => step.video)?.video;
  const copiedVideo = video ? await copyAsset(video, outDir, sourceDir, `${index}-run`) : null;
  if (copiedVideo && steps.length > 1 && !steps[1].video) steps[1].video = copiedVideo;
  return {
    id: `${index}-${kind}`,
    kind,
    name: manifest.name ?? manifest.title ?? `Evidence ${index}`,
    status: manifest.status ?? "UNKNOWN",
    source: manifest.fingerprint ?? manifest.source ?? null,
    runtime: manifest.runtime ?? manifest.device ?? null,
    steps,
    video: copiedVideo,
    limitations: manifest.limitations ?? []
  };
}

export async function mergeEvidence(inputs, outDir) {
  await mkdir(outDir, { recursive: true });
  const surfaces = [];
  for (const [i, input] of inputs.entries()) surfaces.push(await normalize(input, i + 1, outDir));
  const bundle = { schemaVersion: "0.1", kind: "proofrun-cross-surface-evidence", createdAt: new Date().toISOString(), surfaces };
  await import("node:fs/promises").then(({ writeFile }) => writeFile(join(outDir, "evidence-bundle.json"), json(bundle)));
  await import("node:fs/promises").then(({ writeFile }) => writeFile(join(outDir, "admin.html"), render(bundle)));
  return { status: "READY", surfaces: surfaces.length };
}

function render(bundle) {
  const data = JSON.stringify(bundle).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ProofRun · Cross-surface evidence</title><style>
:root{color-scheme:dark;--bg:#07111f;--panel:#10243d;--line:#315476;--text:#f4f8ff;--muted:#a7bad1;--ok:#70e2ab;--bad:#ff9b83;--blue:#78c9ff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 10% 0,#24577f,#07111f 48%);color:var(--text);font:16px/1.45 system-ui,sans-serif}.shell{max-width:1600px;margin:auto;padding:24px}.top{display:flex;justify-content:space-between;gap:20px;align-items:start}.eyebrow{color:var(--blue);font-size:12px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.top h1{font-size:clamp(26px,3.5vw,44px);margin:7px 0}.muted{color:var(--muted)}.badge{padding:8px 13px;border-radius:999px;border:1px solid #4d9c7b;color:#a3f2c9;background:#123c30;font-weight:800;white-space:nowrap}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0}.tabs button,.step{border:1px solid var(--line);background:#142c48;color:var(--text);border-radius:10px;padding:10px 13px;cursor:pointer;font-weight:750}.tabs button.active,.step.active{background:#23648f;border-color:var(--blue)}.layout{display:grid;grid-template-columns:230px minmax(0,1fr) 310px;gap:14px}.panel{background:linear-gradient(145deg,#142d4a,#0e1c31);border:1px solid var(--line);border-radius:17px;padding:16px}.step{display:block;width:100%;text-align:left;margin:8px 0}.step small{display:block;color:var(--muted);margin-top:4px}.stage{display:flex;align-items:center;justify-content:center;min-height:520px;background:#03070c;border-radius:12px;overflow:hidden}.stage img{display:block;max-width:100%;max-height:720px;width:auto;height:auto;object-fit:contain}.stage video{display:block;width:100%;max-height:720px;background:#000}.kv{padding:10px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere}.kv b{display:block;margin-top:3px}.ok{color:var(--ok)}.bad{color:var(--bad)}.notice{margin-top:14px;padding:11px;border-left:4px solid #ffc66e;background:#2a2113;color:#ffe4b6;border-radius:8px}@media(max-width:1000px){.top,.layout{display:block}.panel{margin-bottom:12px}.stage{min-height:380px}}
</style></head><body><main class="shell"><header class="top"><div><div class="eyebrow">ProofRun · decision surface</div><h1>실제 화면과 실행 증거를 한 곳에서 검토</h1><p class="muted">자동화 도구의 주장 대신, 웹·앱·기기 실행에서 수집한 이미지와 영상을 surface별로 분리 재생합니다.</p></div><div class="badge">CROSS-SURFACE · NO SYNTHETIC MEDIA</div></header><nav class="tabs" id="surfaces"></nav><section class="layout"><section class="panel" id="steps"></section><section class="panel"><div class="stage" id="stage"></div><h2 id="title"></h2><p id="meta" class="muted"></p></section><aside class="panel" id="details"></aside></section></main><script>const B=${data};let si=0,pi=0;const $=s=>document.querySelector(s);function renderTabs(){const el=$('#surfaces');el.innerHTML=B.surfaces.map((s,i)=>'<button class="'+(i===si?'active':'')+'" onclick="selectSurface('+i+')">'+esc(s.name)+'</button>').join('')}function selectSurface(i){si=i;pi=0;renderTabs();renderSteps();show()}function renderSteps(){const s=B.surfaces[si];$('#steps').innerHTML='<div class="eyebrow">'+esc(s.kind)+'</div><h2>'+esc(s.name)+'</h2>'+s.steps.map((x,i)=>'<button class="step '+(i===pi?'active':'')+' '+(x.status==='FAILED'?'bad':'')+'" onclick="selectStep('+i+')"><b>'+(i+1)+'. '+esc(x.title)+'</b><small>'+esc(x.status)+' · '+esc(x.action)+'</small></button>').join('')}function selectStep(i){pi=i;renderSteps();show()}function show(){const s=B.surfaces[si],p=s.steps[pi]||{};const stage=$('#stage');stage.innerHTML='';if(p.screenshot){const img=document.createElement('img');img.src=p.screenshot;img.alt=s.name+' '+p.title;stage.appendChild(img)}else if(p.video||s.video){const v=document.createElement('video');v.controls=true;v.autoplay=false;v.src=p.video||s.video;stage.appendChild(v)}else stage.innerHTML='<div class="notice">NO_RUNTIME_MEDIA · 이 단계에는 실제 이미지/영상이 없습니다.</div>';$('#title').textContent=p.title||s.name;$('#meta').innerHTML='<b class="'+(p.status==='FAILED'?'bad':'ok')+'">'+esc(p.status||'UNKNOWN')+'</b> · '+esc(p.action||'observed')+(p.error?'<br><span class="bad">'+esc(p.error)+'</span>':'')+(p.sourceRefs?.length?'<br><span class="muted">source: '+esc(p.sourceRefs.join(', '))+'</span>':'');$('#details').innerHTML='<h2>판정 자료</h2><div class="kv"><span class="muted">Surface</span><b>'+esc(s.kind)+'</b></div><div class="kv"><span class="muted">Status</span><b class="'+(s.status==='PASSED'?'ok':'bad')+'">'+esc(s.status)+'</b></div><div class="kv"><span class="muted">Freshness</span><b>'+esc(s.source?.gitHead?'Git-bound':'UNBOUND')+'</b></div><div class="kv"><span class="muted">Runtime</span><b>'+esc(s.runtime?.adapter||s.runtime?.platform||'not declared')+'</b></div><div class="kv"><span class="muted">Steps</span><b>'+s.steps.length+'</b></div><div class="notice">실제 미디어가 없는 상태를 PASS로 꾸미지 않습니다.</div>'}function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}renderTabs();renderSteps();show();</script></body></html>`;
}
