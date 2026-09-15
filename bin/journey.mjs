import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const exec = promisify(execFile);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const fileSha = async (path) => sha(await readFile(path));
const json = (value) => JSON.stringify(value, null, 2) + "\n";

async function git(repo, args) { try { const { stdout } = await exec("git", ["-C", repo, ...args]); return stdout.trim(); } catch { return null; } }
async function fingerprint(repo) {
  const head = await git(repo, ["rev-parse", "HEAD"]);
  const diff = await git(repo, ["diff", "--binary", "HEAD"]);
  const status = await git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]);
  return { repo: resolve(repo), gitHead: head, uncommittedDiffSha256: sha(`${diff ?? ""}\n${status ?? ""}`), workingTreeStatus: status ?? "", capturedAt: new Date().toISOString() };
}
function arg(args, name, fallback) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; }
function esc(value) { return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

export async function runJourney(specPath, outDir, repo) {
  let playwright;
  try { playwright = await import("playwright"); } catch { throw new Error("journey requires Playwright. Install it with `npm install -D playwright` and run `npx playwright install chromium`."); }
  const spec = JSON.parse(await readFile(specPath, "utf8"));
  await mkdir(`${outDir}/screens`, { recursive: true });
  await mkdir(`${outDir}/video`, { recursive: true });
  const fp = await fingerprint(repo);
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: spec.viewport ?? { width: 1280, height: 800 },
    recordVideo: { dir: `${outDir}/video`, size: spec.viewport ?? { width: 1280, height: 800 } }
  });
  const page = await context.newPage();
  const consoleEvents = [], networkFailures = [];
  page.on("console", msg => consoleEvents.push({ type: msg.type(), text: msg.text() }));
  page.on("requestfailed", req => networkFailures.push({ url: req.url(), error: req.failure()?.errorText ?? "unknown" }));
  const steps = [];
  let runStatus = "PASSED";
  for (const [index, step] of (spec.steps ?? []).entries()) {
    const started = Date.now(); let status = "PASSED", error = null;
    try {
      const url = step.path ? new URL(step.path, spec.baseUrl).toString() : null;
      if (step.action === "goto") await page.goto(url, { waitUntil: "networkidle" });
      else if (step.action === "click") await page.locator(step.selector).click();
      else if (step.action === "fill") await page.locator(step.selector).fill(step.value ?? "");
      else if (step.action === "press") await page.locator(step.selector).press(step.key ?? "Enter");
      else throw new Error(`Unsupported action: ${step.action}`);
      if (step.waitMs) await page.waitForTimeout(step.waitMs);
      for (const assertion of step.expect ?? []) {
        const locator = page.locator(assertion.selector);
        if (assertion.type === "visible") {
          await locator.waitFor({ state: "visible", timeout: assertion.timeoutMs ?? 5000 });
          if (!(await locator.isVisible())) throw new Error(`Expected visible: ${assertion.selector}`);
        }
        if (assertion.type === "text") {
          await locator.waitFor({ state: "visible", timeout: assertion.timeoutMs ?? 5000 });
          if (!(await locator.innerText()).includes(assertion.value)) throw new Error(`Expected text ${JSON.stringify(assertion.value)} in ${assertion.selector}`);
        }
        if (assertion.type === "url" && !page.url().includes(assertion.value)) throw new Error(`Expected URL to include ${assertion.value}`);
      }
    } catch (caught) { status = "FAILED"; runStatus = "FAILED"; error = caught.message; }
    const filename = `${String(index + 1).padStart(2, "0")}-${step.id}.png`; const screenshotPath = `${outDir}/screens/${filename}`;
    await page.screenshot({ path: screenshotPath, fullPage: step.fullPage ?? false });
    const dom = await page.content();
    steps.push({ id: step.id, action: step.action, selector: step.selector ?? null, sourceRefs: step.sourceRefs ?? [], status, error, url: page.url(), title: await page.title(), screenshot: `screens/${filename}`, screenshotSha256: await fileSha(screenshotPath), domSha256: sha(dom), durationMs: Date.now() - started, consoleCount: consoleEvents.length, networkFailureCount: networkFailures.length });
    if (status === "FAILED") break;
  }
  const video = page.video();
  await browser.close();
  let videoPath = null;
  if (video) {
    const recordedPath = await video.path();
    videoPath = relative(outDir, recordedPath).replaceAll("\\", "/");
  }
  const evidence = { schemaVersion: "0.2", kind: "proofrun-journey", name: spec.name, status: runStatus, spec: specPath, fingerprint: fp, runtime: { adapter: "playwright", browser: "chromium", viewport: spec.viewport ?? { width: 1280, height: 800 }, video: videoPath }, steps, console: consoleEvents, networkFailures, visualEvidence: { screenshots: steps.map((step) => step.screenshot), video: videoPath, replayMode: "recorded-runtime" }, limitations: ["Source mapping is file-level until an AST/runtime adapter is configured.", "A PASS means configured assertions passed; it is not a claim of product correctness.", "The recorded video is evidence of this run only and is invalid after the bound Git state changes."] };
  const manifest = { ...evidence, artifactSha256: sha(json(evidence)) };
  await writeFile(`${outDir}/evidence.json`, json(manifest));
  await writeFile(`${outDir}/replay.html`, replayHtml(manifest));
  await writeFile(`${outDir}/admin.html`, replayHtml(manifest));
  return manifest;
}

function replayHtml(evidence) {
  const cards = evidence.steps.map((s, i) => `<button class="step ${s.status.toLowerCase()}" data-i="${i}"><b>${i + 1}. ${esc(s.id)}</b><span>${esc(s.status)} · ${s.durationMs}ms</span></button>`).join("");
  const data = JSON.stringify(evidence).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ProofRun 관리자 여정 보고서</title><style>body{margin:0;background:#07111f;color:#eef6ff;font:15px system-ui}.shell{max-width:1500px;margin:auto;padding:24px}.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.badge{padding:7px 12px;border-radius:999px;background:${evidence.status === "PASSED" ? "#123d31" : "#542a25"};color:#fff;font-weight:700}.grid{display:grid;grid-template-columns:240px minmax(0,1fr) 320px;gap:14px;margin-top:16px}.panel{background:#10223a;border:1px solid #294765;border-radius:16px;padding:16px}.step{display:block;width:100%;text-align:left;background:#0b192b;color:#eaf5ff;border:1px solid #294765;border-radius:10px;margin:8px 0;padding:11px;cursor:pointer}.step span{display:block;color:#9bb0c9;margin-top:4px;font-size:12px}.step.passed{border-left:4px solid #72e0ad}.step.failed{border-left:4px solid #ff896e}.screen{width:100%;height:560px;object-fit:contain;background:#fff;border-radius:10px}.video{width:100%;max-height:420px;background:#000;border-radius:10px;margin-top:14px}.kv{border-bottom:1px solid #294765;padding:9px 0}.muted{color:#9bb0c9}.danger{color:#ffae9d}code{overflow-wrap:anywhere}.section-title{display:flex;justify-content:space-between;align-items:center}.evidence-label{color:#72e0ad;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}@media(max-width:1000px){.grid{grid-template-columns:1fr}.screen{height:520px}}</style></head><body><main class="shell"><header class="top"><div><div class="muted">PROOFRUN · 관리자용 실제 실행 증거</div><h1>${esc(evidence.name)}</h1><p class="muted">합성 목업이 아닌 실제 Chromium 화면·스크린샷·영상·검증 결과</p></div><div class="badge">${esc(evidence.status)} · ${esc(evidence.runtime.video ? "VIDEO RECORDED" : "SCREENSHOTS ONLY")}</div></header><div class="grid"><section class="panel"><div class="section-title"><h2>실행 단계</h2><span class="evidence-label">${evidence.steps.length} STEPS</span></div>${cards}</section><section class="panel"><div class="section-title"><h2>실제 화면</h2><span id="visualStatus" class="evidence-label">LIVE CAPTURE</span></div><img id="screen" class="screen" alt="실제 실행 단계 화면"><video id="video" class="video" controls preload="metadata" ${evidence.runtime.video ? "" : "hidden"}></video><h2 id="stepTitle">단계를 선택하세요</h2><p id="stepMeta" class="muted"></p></section><aside class="panel"><h2>판정 자료</h2><div class="kv"><span class="muted">Git HEAD</span><br><code>${esc(evidence.fingerprint.gitHead ?? "UNAVAILABLE")}</code></div><div class="kv"><span class="muted">Diff SHA256</span><br><code>${esc(evidence.fingerprint.uncommittedDiffSha256)}</code></div><div class="kv"><span class="muted">Runtime</span><br>${esc(evidence.runtime.adapter)} / ${esc(evidence.runtime.browser)}</div><div class="kv"><span class="muted">Console</span><br>${evidence.console.length}</div><div class="kv"><span class="muted">Network failures</span><br><span class="${evidence.networkFailures.length ? "danger" : ""}">${evidence.networkFailures.length}</span></div><div class="kv"><span class="muted">Evidence state</span><br><b>${esc(evidence.status === "PASSED" ? "REVIEWABLE" : "ACTION REQUIRED")}</b></div><p class="muted">영상·이미지는 이 실행의 Git 상태에만 유효합니다. 코드가 바뀌면 재실행해야 합니다.</p></aside></div></main><script>const DATA=${data};const img=document.querySelector('#screen'),video=document.querySelector('#video'),title=document.querySelector('#stepTitle'),meta=document.querySelector('#stepMeta');if(DATA.runtime.video){video.src=DATA.runtime.video}function show(i){const s=DATA.steps[i];img.src=s.screenshot;title.textContent=(i+1)+'. '+s.id;meta.innerHTML='<b>'+s.status+'</b> · '+s.action+' · '+s.url+'<br>'+(s.error||'검증 통과')+(s.sourceRefs?.length?'<br><span class="muted">source: '+s.sourceRefs.join(', ')+'</span>':'');document.querySelectorAll('.step').forEach((b,j)=>b.style.outline=j===i?'3px solid #77c3ff':'none')}document.querySelectorAll('.step').forEach((b,i)=>b.onclick=()=>show(i));if(DATA.steps.length)show(0);</script></body></html>`;
}

export async function verifyEvidence(evidencePath, repo) { const evidence = JSON.parse(await readFile(evidencePath, "utf8")); const current = await fingerprint(repo); const fresh = evidence.fingerprint.gitHead === current.gitHead && evidence.fingerprint.uncommittedDiffSha256 === current.uncommittedDiffSha256; const result = { status: fresh ? "FRESH" : "STALE_REVERIFY_REQUIRED", expected: evidence.fingerprint, current }; await writeFile(`${dirname(evidencePath)}/verification.json`, json(result)); return result; }

if (import.meta.url === `file://${process.argv[1]}`) { const args = process.argv.slice(2); const command = args[0]; try { if (command === "journey") { const spec = resolve(args[1] ?? ""); const out = resolve(arg(args, "--out", "proofrun-journey")); const repo = resolve(arg(args, "--repo", process.cwd())); const result = await runJourney(spec, out, repo); console.log(`ProofRun journey ${result.status}: ${out}/replay.html`); } else if (command === "verify") { const result = await verifyEvidence(resolve(args[1]), resolve(arg(args, "--repo", process.cwd()))); console.log(`ProofRun evidence ${result.status}`); if (result.status !== "FRESH") process.exitCode = 2; } } catch (error) { console.error(`ProofRun error: ${error.message}`); process.exitCode = 1; } }
