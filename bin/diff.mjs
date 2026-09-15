import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));

async function git(repo, args) { try { const { stdout } = await exec("git", ["-C", repo, ...args]); return stdout.trim(); } catch { return null; } }

function fingerprintOf(manifest) {
  const fp = manifest.fingerprint ?? manifest.source ?? {};
  return {
    gitHead: fp.gitHead ?? null,
    diffSha256: fp.uncommittedDiffSha256 ?? fp.diffSha256 ?? null,
    workingTreeDirty: Boolean(fp.workingTreeStatus),
    capturedAt: fp.capturedAt ?? manifest.capturedAt ?? null
  };
}

function stepsOf(manifest) {
  return (manifest.steps ?? manifest.journey?.steps ?? []).map((step, i) => ({
    id: step.id ?? `step-${i + 1}`,
    title: step.id ?? step.title ?? `Step ${i + 1}`,
    pageTitle: step.title ?? null,
    action: step.action ?? step.event ?? "observed",
    status: step.status ?? manifest.status ?? "UNKNOWN",
    error: step.error ?? null,
    screenshot: step.screenshot ?? step.image ?? null,
    screenshotSha256: step.screenshotSha256 ?? null,
    domSha256: step.domSha256 ?? null,
    durationMs: step.durationMs ?? null,
    sourceRefs: step.sourceRefs ?? []
  }));
}

async function copyMedia(relativePath, manifestPath, outDir, name) {
  if (!relativePath) return null;
  const source = resolve(dirname(manifestPath), relativePath);
  const target = join(outDir, "media", `${name}-${basename(source)}`);
  await mkdir(dirname(target), { recursive: true });
  try { await copyFile(source, target); } catch { return null; }
  return `media/${name}-${basename(source)}`;
}

function runVerdict(before, after) {
  if (!before) return "ADDED";
  if (!after) return "REMOVED";
  if (before.status === "PASSED" && after.status === "FAILED") return "REGRESSION";
  if (before.status === "FAILED" && after.status === "PASSED") return "FIX";
  if (after.status === "FAILED") return "STILL_FAILING";
  return "STABLE";
}

function visualVerdict(before, after) {
  if (!before || !after) return "NOT_COMPARABLE";
  if (before.screenshotSha256 && after.screenshotSha256) {
    return before.screenshotSha256 === after.screenshotSha256 ? "VISUAL_IDENTICAL" : "VISUAL_CHANGED";
  }
  if (before.domSha256 && after.domSha256) {
    return before.domSha256 === after.domSha256 ? "DOM_IDENTICAL" : "DOM_CHANGED";
  }
  return "NO_HASH_BASELINE";
}

// A changed file is a suspect for a step only when the step actually references it.
// Without that link the commit range is context, not a cause.
function suspectsFor(step, changedFiles) {
  const referenced = (step?.sourceRefs ?? []).map((ref) => String(ref).split(":")[0]).filter(Boolean);
  return changedFiles.filter((file) => referenced.some((ref) => file.endsWith(ref) || ref.endsWith(file)));
}

async function commitRange(repo, beforeHead, afterHead) {
  if (!repo) return { status: "UNAVAILABLE", reason: "no --repo supplied", commits: [], changedFiles: [] };
  if (!beforeHead || !afterHead) return { status: "UNAVAILABLE", reason: "one side has no bound Git HEAD", commits: [], changedFiles: [] };
  if (beforeHead === afterHead) return { status: "SAME_COMMIT", reason: "both runs are bound to the same commit", commits: [], changedFiles: [] };
  const log = await git(repo, ["log", "--pretty=format:%H%x1f%an%x1f%ad%x1f%s", "--date=short", `${beforeHead}..${afterHead}`]);
  if (log === null) return { status: "UNAVAILABLE", reason: "commit range not resolvable in this repository", commits: [], changedFiles: [] };
  const names = await git(repo, ["diff", "--name-only", `${beforeHead}..${afterHead}`]);
  const commits = log ? log.split("\n").filter(Boolean).map((line) => {
    const [sha, author, date, subject] = line.split("\x1f");
    return { sha, short: sha.slice(0, 8), author, date, subject };
  }) : [];
  return { status: "RESOLVED", reason: null, commits, changedFiles: names ? names.split("\n").filter(Boolean) : [] };
}

export async function diffEvidence(beforePath, afterPath, outDir, repo) {
  await mkdir(outDir, { recursive: true });
  const before = JSON.parse(await readFile(beforePath, "utf8"));
  const after = JSON.parse(await readFile(afterPath, "utf8"));
  const beforeFp = fingerprintOf(before);
  const afterFp = fingerprintOf(after);
  const beforeSteps = stepsOf(before);
  const afterSteps = stepsOf(after);
  const range = await commitRange(repo, beforeFp.gitHead, afterFp.gitHead);

  const ids = [...new Set([...beforeSteps.map((s) => s.id), ...afterSteps.map((s) => s.id)])];
  const steps = [];
  for (const [index, id] of ids.entries()) {
    const b = beforeSteps.find((s) => s.id === id) ?? null;
    const a = afterSteps.find((s) => s.id === id) ?? null;
    const verdict = runVerdict(b, a);
    steps.push({
      id,
      title: a?.title ?? b?.title ?? id,
      action: a?.action ?? b?.action ?? "observed",
      verdict,
      visual: visualVerdict(b, a),
      before: b ? { status: b.status, error: b.error, durationMs: b.durationMs, screenshot: await copyMedia(b.screenshot, beforePath, outDir, `before-${index + 1}`) } : null,
      after: a ? { status: a.status, error: a.error, durationMs: a.durationMs, screenshot: await copyMedia(a.screenshot, afterPath, outDir, `after-${index + 1}`) } : null,
      pageTitle: a?.pageTitle ?? b?.pageTitle ?? null,
      sourceRefs: a?.sourceRefs ?? b?.sourceRefs ?? [],
      suspectCommitFiles: suspectsFor(a ?? b, range.changedFiles)
    });
  }

  const regressions = steps.filter((s) => s.verdict === "REGRESSION");
  const fixes = steps.filter((s) => s.verdict === "FIX");
  const visualChanges = steps.filter((s) => s.visual === "VISUAL_CHANGED" || s.visual === "DOM_CHANGED");
  const unverifiable = steps.filter((s) => s.visual === "NO_HASH_BASELINE" || s.visual === "NOT_COMPARABLE");
  const status = regressions.length ? "REGRESSION" : (visualChanges.length || fixes.length ? "CHANGED" : "STABLE");

  const report = {
    schemaVersion: "0.1",
    kind: "proofrun-journey-diff",
    createdAt: new Date().toISOString(),
    status,
    before: { name: before.name ?? "before", status: before.status ?? "UNKNOWN", fingerprint: beforeFp, path: beforePath },
    after: { name: after.name ?? "after", status: after.status ?? "UNKNOWN", fingerprint: afterFp, path: afterPath },
    commitRange: range,
    summary: {
      steps: steps.length,
      regressions: regressions.length,
      fixes: fixes.length,
      visualChanges: visualChanges.length,
      unverifiableVisuals: unverifiable.length
    },
    steps,
    limitations: [
      "Visual comparison uses recorded screenshot/DOM hashes. An identical hash means the captured bytes match, not that the product is correct.",
      "Suspect commits are only shown where a changed file matches a step sourceRef. An empty list is not proof that no commit affected the step.",
      "A dirty working tree on either side means the compared runs are not reproducible from commits alone."
    ]
  };

  await writeFile(join(outDir, "diff.json"), json(report));
  await writeFile(join(outDir, "diff.html"), render(report));
  return report;
}

function render(report) {
  const data = JSON.stringify(report).replaceAll("<", "\\u003c");
  const badge = report.status === "REGRESSION" ? "#5a2620" : report.status === "CHANGED" ? "#4a3d16" : "#133c30";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ProofRun · before/after 여정 diff</title><style>
:root{color-scheme:dark;--bg:#07111f;--line:#2b4b6b;--muted:#9fb4cc;--ok:#72e0ad;--bad:#ff8f77;--warn:#ffc66e;--blue:#78c9ff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 12% 0,#1f4d73,#07111f 46%);color:#eef6ff;font:15px/1.45 system-ui,sans-serif}.shell{max-width:1640px;margin:auto;padding:24px}.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;flex-wrap:wrap}.eyebrow{color:var(--blue);font-size:12px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}h1{font-size:clamp(24px,3vw,38px);margin:6px 0}.muted{color:var(--muted)}.badge{padding:8px 14px;border-radius:999px;background:${badge};border:1px solid var(--line);font-weight:800}.cards{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.card{background:#0f2340;border:1px solid var(--line);border-radius:12px;padding:11px 15px;min-width:118px}.card b{display:block;font-size:22px;margin-top:3px}.layout{display:grid;grid-template-columns:270px minmax(0,1fr) 320px;gap:14px}.panel{background:linear-gradient(150deg,#142d4a,#0d1b2f);border:1px solid var(--line);border-radius:16px;padding:16px}.step{display:block;width:100%;text-align:left;background:#0b192b;color:#eaf5ff;border:1px solid var(--line);border-radius:10px;margin:8px 0;padding:11px;cursor:pointer;font:inherit}.step.active{background:#23648f;border-color:var(--blue)}.step small{display:block;color:var(--muted);margin-top:4px;font-size:12px}.step.regression{border-left:4px solid var(--bad)}.step.fix{border-left:4px solid var(--ok)}.step.still_failing{border-left:4px solid var(--warn)}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}.frame{background:#03070c;border:1px solid var(--line);border-radius:12px;padding:10px;display:flex;flex-direction:column}.frame h3{margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.frame .box{flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden}.frame img{width:100%;height:auto;max-height:560px;object-fit:contain;background:#fff;border-radius:6px}.kv{border-bottom:1px solid var(--line);padding:9px 0;overflow-wrap:anywhere}.kv b{display:block;margin-top:3px}.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}.notice{margin-top:12px;padding:10px;border-left:4px solid var(--warn);background:#2a2113;color:#ffe4b6;border-radius:8px;font-size:13px}code{overflow-wrap:anywhere;font-size:12px}ul{margin:6px 0;padding-left:18px}@media(max-width:1100px){.layout,.pair{grid-template-columns:1fr}}
</style></head><body><main class="shell"><header class="top"><div><div class="eyebrow">ProofRun · regression decision surface</div><h1>같은 여정, 두 커밋의 실제 화면 비교</h1><p class="muted">실행 도구는 "이번 실행이 통과했다"까지 말합니다. 이 화면은 <b>무엇이 언제부터 깨졌고 어느 커밋이 그 단계를 건드렸는지</b>를 붙여 보여줍니다.</p></div><div class="badge">${esc(report.status)}</div></header>
<section class="cards"><div class="card"><span class="muted">단계</span><b>${report.summary.steps}</b></div><div class="card"><span class="muted">회귀</span><b class="${report.summary.regressions ? "bad" : "ok"}">${report.summary.regressions}</b></div><div class="card"><span class="muted">복구</span><b class="ok">${report.summary.fixes}</b></div><div class="card"><span class="muted">화면 변경</span><b>${report.summary.visualChanges}</b></div><div class="card"><span class="muted">비교 불가</span><b class="${report.summary.unverifiableVisuals ? "warn" : ""}">${report.summary.unverifiableVisuals}</b></div></section>
<section class="layout"><section class="panel" id="steps"></section><section class="panel"><div class="pair"><div class="frame"><h3>Before · ${esc(report.before.fingerprint.gitHead?.slice(0, 8) ?? "UNBOUND")}</h3><div class="box" id="beforeBox"></div></div><div class="frame"><h3>After · ${esc(report.after.fingerprint.gitHead?.slice(0, 8) ?? "UNBOUND")}</h3><div class="box" id="afterBox"></div></div></div><h2 id="title" style="margin-bottom:4px"></h2><p id="meta" class="muted"></p></section><aside class="panel" id="details"></aside></section></main>
<script>const D=${data};let i=0;const $=(s)=>document.querySelector(s);function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function steps(){$('#steps').innerHTML='<h2>단계별 판정</h2>'+D.steps.map((s,j)=>'<button class="step '+s.verdict.toLowerCase()+(j===i?' active':'')+'" onclick="pick('+j+')"><b>'+(j+1)+'. '+esc(s.title)+'</b><small>'+esc(s.verdict)+' · '+esc(s.visual)+'</small></button>').join('')}
function pick(j){i=j;steps();show()}
function frame(box,side,label){const el=$(box);el.innerHTML='';if(side&&side.screenshot){const img=document.createElement('img');img.src=side.screenshot;img.alt=label;el.appendChild(img)}else el.innerHTML='<div class="notice">NO_RUNTIME_MEDIA · '+label+' 실제 캡처 없음</div>'}
function show(){const s=D.steps[i];frame('#beforeBox',s.before,'before');frame('#afterBox',s.after,'after');$('#title').textContent=(i+1)+'. '+s.title;
const cls=s.verdict==='REGRESSION'?'bad':s.verdict==='FIX'?'ok':s.verdict==='STILL_FAILING'?'warn':'';
$('#meta').innerHTML='<b class="'+cls+'">'+esc(s.verdict)+'</b> · '+esc(s.visual)+' · '+esc(s.action)+(s.pageTitle?' · <span class="muted">'+esc(s.pageTitle)+'</span>':'')+(s.after&&s.after.error?'<br><span class="bad">after: '+esc(s.after.error)+'</span>':'')+(s.before&&s.before.error?'<br><span class="warn">before: '+esc(s.before.error)+'</span>':'');
const range=D.commitRange;const suspects=s.suspectCommitFiles||[];
$('#details').innerHTML='<h2>코드 근거</h2>'
+'<div class="kv"><span class="muted">Before HEAD</span><b><code>'+esc(D.before.fingerprint.gitHead||'UNBOUND')+'</code></b></div>'
+'<div class="kv"><span class="muted">After HEAD</span><b><code>'+esc(D.after.fingerprint.gitHead||'UNBOUND')+'</code></b></div>'
+'<div class="kv"><span class="muted">커밋 범위</span><b>'+esc(range.status)+(range.reason?' · '+esc(range.reason):'')+'</b></div>'
+(range.commits.length?'<div class="kv"><span class="muted">구간 커밋 '+range.commits.length+'개</span><b>'+range.commits.slice(0,8).map(c=>'<code>'+esc(c.short)+'</code> '+esc(c.subject)).join('<br>')+'</b></div>':'')
+'<div class="kv"><span class="muted">이 단계가 참조하는 소스</span><b>'+(s.sourceRefs.length?s.sourceRefs.map(r=>'<code>'+esc(r)+'</code>').join('<br>'):'<span class="muted">선언 없음</span>')+'</b></div>'
+'<div class="kv"><span class="muted">구간에서 바뀐 참조 파일</span><b class="'+(suspects.length?'bad':'')+'">'+(suspects.length?suspects.map(f=>'<code>'+esc(f)+'</code>').join('<br>'):'<span class="muted">없음 — 무관하다는 증명은 아님</span>')+'</b></div>'
+'<div class="notice">해시가 같다는 것은 캡처된 바이트가 같다는 뜻이지 제품이 옳다는 뜻이 아닙니다.</div>'}
steps();show();</script></body></html>`;
}
