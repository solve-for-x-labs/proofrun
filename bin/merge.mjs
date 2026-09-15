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
    // Only explicit video-relative seconds are seekable; durations/wall clocks are not offsets.
    videoTimeSeconds: typeof step.videoTimeSeconds === "number" && Number.isFinite(step.videoTimeSeconds) && step.videoTimeSeconds >= 0 ? step.videoTimeSeconds : null,
    error: step.error ?? null,
    sourceRefs: step.sourceRefs ?? []
  }));
  const mediaIssues = [];
  async function media(path, name) {
    try { return await copyAsset(path, outDir, sourceDir, name); }
    catch (error) {
      if (!["ENOENT", "EISDIR"].includes(error.code)) throw error;
      mediaIssues.push(`Missing media: ${path}`);
      return null;
    }
  }
  for (const [i, step] of steps.entries()) {
    if (step.screenshot) step.screenshot = await media(step.screenshot, `${index}-${i + 1}`);
    if (step.video) step.video = await media(step.video, `${index}-${i + 1}`);
  }
  if (manifest.visualEvidence?.screenshots) {
    for (const [i, path] of manifest.visualEvidence.screenshots.entries()) {
      if (!steps[i]) steps.push({ id: `step-${i + 1}`, status: manifest.status ?? "UNKNOWN", title: `Step ${i + 1}`, action: "observed", screenshot: null, sourceRefs: [] });
      if (path) steps[i].screenshot = await media(path, `${index}-${i + 1}`);
    }
  }
  const video = manifest.visualEvidence?.video ?? manifest.runtime?.video;
  const copiedVideo = video ? await media(video, `${index}-run`) : null;
  return {
    id: `${index}-${kind}`,
    kind,
    name: manifest.name ?? manifest.title ?? `Evidence ${index}`,
    status: manifest.status ?? "UNKNOWN",
    source: manifest.fingerprint ?? manifest.source ?? null,
    runtime: manifest.runtime ?? manifest.device ?? null,
    steps,
    video: copiedVideo,
    limitations: [...(manifest.limitations ?? []), ...mediaIssues]
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
 const data=JSON.stringify(bundle).replaceAll("<","\\u003c");
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ProofRun · 미디어 리뷰</title><style>
:root{color-scheme:dark;font:16px/1.5 system-ui;background:#07111f;color:#f4f8ff}*{box-sizing:border-box}body{margin:0}main{max-width:1800px;margin:auto;padding:24px}h1{font-size:clamp(1.5rem,3vw,2.5rem)}h2{font-size:1.2rem}button,select,a{font:inherit}button,select,.original{min-height:44px;padding:8px 12px;border:1px solid #7797b8;border-radius:8px;background:#142c48;color:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:default}:focus-visible{outline:3px solid #ffd078;outline-offset:3px}a{color:#9edaff}.skip{position:absolute;top:-100px}.skip:focus{top:8px;background:#07111f;padding:12px;z-index:2}.muted{color:#b5c7dc}.tabs,.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:16px 0}[aria-pressed=true],[aria-current=step]{background:#23648f;border-color:#b3e2ff}.layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:20px}.panel{min-width:0;background:#10243d;border:1px solid #42617e;border-radius:12px;padding:16px}ol{padding-left:24px}.step{width:100%;text-align:left;margin:4px 0;overflow-wrap:anywhere}.step small{display:block}.stage{display:flex;justify-content:center;align-items:center;min-height:55vh;background:#03070c;border-radius:8px}.stage img,.stage video{display:block;width:100%;height:auto;max-height:78vh;object-fit:contain}.notice{padding:12px;border-left:4px solid #ffc66e;background:#2a2113;color:#ffe4b6;overflow-wrap:anywhere}#details{margin-top:20px;overflow-wrap:anywhere}#title,#meta{overflow-wrap:anywhere}[hidden]{display:none!important}@media(max-width:800px){main{padding:12px}.layout{grid-template-columns:1fr}.stage{min-height:30vh}#steps ol{max-height:220px;overflow:auto}.panel{padding:12px}}
</style></head><body><a class="skip" href="#review">미디어로 건너뛰기</a><main><header><p class="muted">ProofRun · 관리자 미디어 리뷰</p><h1>실제 화면과 실행 증거</h1><p>첨부된 화면·영상을 우선 검토하세요. 실행 판정은 미디어 존재나 진위를 보증하지 않습니다.</p></header><nav id="surfaces" class="tabs" aria-label="실행 surface"></nav><div class="layout"><nav id="steps" class="panel" aria-label="실행 단계"></nav><section id="review" class="panel" tabindex="-1" aria-labelledby="title"><h2 id="title"></h2><p id="meta" class="muted"></p><div class="toolbar"><button id="imageMode">단계 화면</button><button id="videoMode">영상</button><a id="original" class="original" target="_blank" rel="noopener">원본 열기</a></div><div class="stage" id="stage"></div><div class="toolbar" id="videoTools" hidden><label for="rate">재생 속도</label><select id="rate"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select><button id="seek" hidden>단계 시점으로 이동</button></div><p id="mediaNote" class="muted"></p><p id="announcement" role="status"></p><aside id="details"></aside></section></div></main><script>
const B=${data};let si=0,pi=0,mode='image',rate=1;
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function navigation(){
 $('#surfaces').innerHTML=B.surfaces.map((s,i)=>'<button aria-pressed="'+(i===si)+'" data-index="'+i+'">'+esc(s.name)+'</button>').join('');
 const s=B.surfaces[si];
 $('#steps').innerHTML='<h2>실행 단계</h2><p class="muted">방향키 · Home/End로 이동, Enter로 선택</p><ol>'+(s?.steps||[]).map((p,i)=>'<li><button class="step" data-index="'+i+'" '+(i===pi?'aria-current="step"':'')+'>'+esc(p.title)+'<small>'+esc(p.status)+' · '+esc(p.action)+'</small></button></li>').join('')+'</ol>';
}
function select(surface,index){
 const group=document.activeElement?.closest('#surfaces,#steps')?.id;
 si=surface;pi=index;navigation();show();
 if(group)document.querySelector('#'+group+' button[data-index="'+(group==='surfaces'?si:pi)+'"]')?.focus();
}
for(const id of ['surfaces','steps']){
 const container=$('#'+id);
 container.addEventListener('click',e=>{const button=e.target.closest('button[data-index]');if(!button)return;const i=Number(button.dataset.index);if(id==='surfaces'){mode='image';select(i,0)}else select(si,i)});
 container.addEventListener('keydown',e=>{
  const buttons=[...container.querySelectorAll('button')],i=buttons.indexOf(e.target);if(i<0)return;
  let next;if(['ArrowDown','ArrowRight'].includes(e.key))next=(i+1)%buttons.length;
  if(['ArrowUp','ArrowLeft'].includes(e.key))next=(i-1+buttons.length)%buttons.length;
  if(e.key==='Home')next=0;if(e.key==='End')next=buttons.length-1;
  if(next!==undefined){e.preventDefault();buttons[next].focus()}
 });
}
function show(){
 const s=B.surfaces[si],p=s?.steps[pi]||{};
 $('#stage').querySelector('video')?.pause();$('#stage').replaceChildren();$('#announcement').textContent='';
 $('#title').textContent=p.title||s?.name||'증거 없음';
 $('#meta').textContent=(p.status||s?.status||'UNKNOWN')+' · '+(p.action||'')+(p.error?' · '+p.error:'')+(p.sourceRefs?.length?' · source: '+p.sourceRefs.join(', '):'');
 const video=p.video||s?.video;let selected=mode;
 if(selected==='image'&&!p.screenshot&&video)selected='video';if(selected==='video'&&!video)selected='image';
 $('#imageMode').disabled=!p.screenshot;$('#videoMode').disabled=!video;
 $('#imageMode').setAttribute('aria-pressed',String(selected==='image'&&!!p.screenshot));$('#videoMode').setAttribute('aria-pressed',String(selected==='video'&&!!video));
 const path=selected==='video'?video:p.screenshot;
 $('#original').hidden=!path;if(path)$('#original').href=path;else $('#original').removeAttribute('href');
 $('#videoTools').hidden=selected!=='video'||!video;$('#seek').hidden=true;$('#mediaNote').textContent='';
 if(path){
  const media=document.createElement(selected==='video'?'video':'img');
  media.addEventListener('error',()=>{if(!media.isConnected)return;const notice=document.createElement('p');notice.className='notice';notice.textContent='MEDIA_UNAVAILABLE · 파일을 불러오거나 재생할 수 없습니다. 원본과 형식을 확인하세요.';media.replaceWith(notice);$('#videoTools').hidden=true;$('#announcement').textContent='미디어 로드 실패'},{once:true});
  if(selected==='image')media.alt=(s?.name||'')+' · '+(p.title||'단계 화면');
  else{
   media.controls=true;media.preload='metadata';media.playsInline=true;media.playbackRate=rate;
   media.setAttribute('aria-label',(p.video?'단계 영상':'실행 전체 영상')+' · '+s.name);
   $('#mediaNote').textContent=(p.video?'단계 영상. ':'실행 전체 영상 — 이 단계와의 시간 연결은 별도입니다. ')+'자막·대본은 제공되지 않았습니다.';
   const t=p.videoTimeSeconds;
   if(typeof t==='number'&&Number.isFinite(t)&&t>=0){
    $('#seek').hidden=false;$('#seek').disabled=true;$('#seek').textContent='단계 시점 '+t+'초로 이동';
    const ready=()=>{if(!media.isConnected)return;$('#seek').disabled=!(Number.isFinite(media.duration)&&t<=media.duration);if($('#seek').disabled)$('#announcement').textContent='기록된 시점이 영상 범위 밖이므로 이동할 수 없습니다.'};
    media.addEventListener('loadedmetadata',ready);media.addEventListener('durationchange',ready);
    $('#seek').onclick=()=>{if(!$('#seek').disabled){media.currentTime=t;$('#announcement').textContent='기록된 '+t+'초로 이동했습니다.'}};
   }else $('#mediaNote').textContent+=' 단계 타임스탬프 없음 — 자동 연결/탐색을 제공하지 않습니다.';
  }
  media.src=path;$('#stage').appendChild(media);
 }else $('#stage').innerHTML='<p class="notice">NO_RUNTIME_MEDIA · 이 단계에는 실제 이미지/영상이 없습니다.</p>';
 $('#details').innerHTML='<h2>판정 자료 · 제한 사항</h2><p>Surface: '+esc(s?.kind||'없음')+' · Status: '+esc(s?.status||'UNKNOWN')+'</p><p>Source: '+esc(s?.source?.gitHead||'UNBOUND')+' · Runtime: '+esc(s?.runtime?.adapter||s?.runtime?.platform||'not declared')+'</p><ul>'+(s?.limitations||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';
}
$('#imageMode').onclick=()=>{mode='image';show()};$('#videoMode').onclick=()=>{mode='video';show()};
$('#rate').onchange=e=>{rate=Number(e.target.value);const v=$('#stage video');if(v)v.playbackRate=rate};
navigation();show();
</script></body></html>`;
}
