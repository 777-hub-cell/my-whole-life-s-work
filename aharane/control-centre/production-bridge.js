(() => {
'use strict';
const API='/aharane/api', Q=s=>document.querySelector(s);
const APP_SOURCE_PATHS=['index.html','styles.css','app.js','production-bridge.js','manifest.webmanifest'];
const escP=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pack=JSON.stringify;
// Shared preview callbacks replaced by the live production bridge. Keep these
// bindings declared inside this strict-mode closure before installBridgeP assigns them.
let filesBase, openFileBase, actBase, moreBase, homeBase, bubBase, openChatBase, bindBase, openPairBaseP, drawMsgsBaseP;
const P={runtime:null,snapshot:null,owners:{},env:[],metrics:{},activity:[],packages:[],packageError:'',filesError:'',fileMeta:new Map(),fileData:new Map(),pending:false,stale:false,changedCount:0,uploadProgress:null,chatTimer:null,chatRefreshBusy:false,chatSearchTimer:null,chatSearchQuery:'',chatSearchResults:[],chatSearchLoading:false,chatSearchError:'',messageFingerprints:new Map(),qrTimer:null,statusTimer:null,chatJid:'',chatLoaded:false,visibility:null,visibilityChats:[],selectedMessageIds:new Set(),bulkMode:false,chatAppearance:null,chatAppearanceVersion:1};
const fileAutosaveTimersP=new Map(),fileAutosaveBusyP=new Set(),fileAutosaveQueuedP=new Map();
const fileLocalDraftsP=new Map(),fileAutosaveConflictsP=new Set();
const FILE_LOCAL_DRAFTS_KEY='aharane-files-local-drafts-v1';
const FILE_LOCAL_DRAFTS_MAX_BYTES=2*1024*1024;
try{
 const saved=JSON.parse(localStorage.getItem(FILE_LOCAL_DRAFTS_KEY)||'[]');
 if(Array.isArray(saved))for(const item of saved){
  if(item&&typeof item.path==='string'&&typeof item.content==='string'&&item.content.length<=524288){
   fileLocalDraftsP.set(item.path,{content:item.content,baseSha256:String(item.baseSha256||''),updatedAt:Number(item.updatedAt)||Date.now()});
  }
 }
}catch{}
function persistFileLocalDraftsP(){
 try{
  const rows=[...fileLocalDraftsP].map(([path,draft])=>({path,...draft}));
  const raw=JSON.stringify(rows);
  if(new Blob([raw]).size>FILE_LOCAL_DRAFTS_MAX_BYTES)return false;
  localStorage.setItem(FILE_LOCAL_DRAFTS_KEY,raw);
  return true;
 }catch{return false}
}
function saveFileLocalDraftP(path,content,baseSha256){
 const previous=fileLocalDraftsP.get(path);
 fileLocalDraftsP.set(path,{content,baseSha256:previous?.baseSha256||baseSha256||'',updatedAt:Date.now()});
 if(persistFileLocalDraftsP())return true;
 fileLocalDraftsP.delete(path);
 if(previous)fileLocalDraftsP.set(path,previous);
 return false;
}
function removeFileLocalDraftP(path){
 if(!fileLocalDraftsP.delete(path))return;
 persistFileLocalDraftsP();
}
function notifyP(s){if(typeof toast==='function')toast(s);else console.info(s)}
async function apiP(path,options={}){
 const response=await fetch(API+'/'+String(path).replace(/^\/+/,''),{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body&&!(options.body instanceof ArrayBuffer)&&!(options.body instanceof Blob)?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
 const type=response.headers.get('content-type')||'',data=type.includes('application/json')?await response.json():null;
 if(!response.ok||data?.ok===false){const error=new Error(data?.error||'Request failed ('+response.status+').');error.status=response.status;throw error}
 return data||{};
}
function stopTimersP(){['chatTimer','qrTimer','statusTimer'].forEach(k=>{if(P[k])clearInterval(P[k]);P[k]=null})}
function loginPanelP(){
 Q('#aharane-auth')?.remove();
 const panel=document.createElement('section');panel.id='aharane-auth';
 panel.innerHTML='<div class="auth-panel"><div class="auth-brand"><span class="mark">'+ico('home')+'</span><span>AHARANE</span></div><h1 id="prod-auth-title">Connect to Aharane</h1><p class="sub" id="prod-auth-sub">Sign in to manage your private bot workspace.</p><form id="prod-auth-form"><div id="prod-code-wrap"><label for="prod-setup-code">One-time setup code</label><input class="field" id="prod-setup-code" type="password" autocomplete="one-time-code" placeholder="Server setup code"></div><label id="prod-pass-label" for="prod-password">Studio password</label><input class="field" id="prod-password" type="password" autocomplete="current-password" minlength="12" maxlength="128" required placeholder="Enter your password"><div id="prod-confirm-wrap"><label for="prod-confirm">Confirm password</label><input class="field" id="prod-confirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" placeholder="Enter it again"></div><button class="btn p" id="prod-auth-button" style="width:100%">Sign in</button></form><p class="d" id="prod-auth-message" role="status"></p><p class="d">Your Studio password protects remote access to this workspace.</p><button class="btn" id="open-local-source" style="width:100%">Open on-device source editor</button><p class="d">Edit the app source stored on this phone, even while the server is offline.</p></div>';
 document.body.appendChild(panel);
}
let authModeP='login';
function setLoginModeP(setup){
 authModeP=setup?'setup':'login';
 Q('#prod-code-wrap').hidden=!setup;Q('#prod-confirm-wrap').hidden=!setup;
 Q('#prod-pass-label').textContent=setup?'Create your Studio password':'Studio password';
 Q('#prod-auth-title').textContent=setup?'Create your Studio password':'Connect to Aharane';
 Q('#prod-auth-sub').textContent=setup?'Choose a private password you will remember.':'Sign in to manage your private bot workspace.';
 Q('#prod-auth-button').textContent=setup?'Create password and connect':'Sign in';
 Q('#prod-setup-code').required=setup;Q('#prod-confirm').required=setup;
 Q('#prod-password').autocomplete=setup?'new-password':'current-password';
 Q('#prod-auth-message').textContent='';
 Q('#prod-auth-form').onsubmit=submitLoginP;
 Q('#open-local-source').onclick=()=>openLocalSourceP();
}
async function submitLoginP(e){
 e.preventDefault();const b=Q('#prod-auth-button'),m=Q('#prod-auth-message');b.disabled=true;m.textContent='Connecting…';
 try{
  if(authModeP==='setup'){
   const password=Q('#prod-password').value;
   if(password!==Q('#prod-confirm').value)throw new Error('The two passwords do not match.');
   await apiP('auth/setup',{method:'POST',body:pack({setupCode:Q('#prod-setup-code').value.trim(),password})});
  }else await apiP('auth/login',{method:'POST',body:pack({password:Q('#prod-password').value})});
  Q('#prod-setup-code').value='';Q('#prod-password').value='';Q('#prod-confirm').value='';
  Q('#aharane-auth')?.remove();document.body.classList.remove('aharane-booting');document.body.classList.add('aharane-authenticated');P.offline=false;await connectLiveP();
 }catch(error){m.textContent=error.message;b.disabled=false}
}
async function showLoginP(){
 document.body.classList.remove('aharane-authenticated');document.body.classList.add('aharane-booting');P.offline=false;stopTimersP();
 try{const a=await apiP('auth/status');loginPanelP();setLoginModeP(Boolean(a.setupRequired))}
 catch(error){loginPanelP();setLoginModeP(false);Q('#prod-auth-message').textContent=error.message}
}
async function connectLiveP(){
 try{
  // Fetch independent dashboard resources together to reduce mobile startup latency.
  const initial=await Promise.allSettled([
   apiP('status'),apiP('studio/snapshot'),apiP('owners'),apiP('env'),
   apiP('metrics'),apiP('activity?limit=300'),apiP('update/status'),
   loadPackagesP(),loadTreeP('')
  ]);
  const required=initial.slice(0,4);
  const requiredFailure=required.find(result=>result.status==='rejected');
  if(requiredFailure)throw requiredFailure.reason;
  P.runtime=initial[0].value;P.snapshot=initial[1].value;P.owners=initial[2].value.owners||{};P.env=initial[3].value.env||[];
  P.metrics=initial[4].status==='fulfilled'?initial[4].value:{};
  P.activity=initial[5].status==='fulfilled'?(initial[5].value.entries||[]):[];
  P.pending=initial[6].status==='fulfilled'?Boolean(initial[6].value.manualEdits?.pending):false;
  P.stale=initial[6].status==='fulfilled'?Boolean(initial[6].value.manualEdits?.stale):false;
  if(initial[7].status==='fulfilled'){P.packages=initial[7].value;P.packageError=''}
  else{P.packages=[];P.packageError=initial[7].reason?.message||'Saved packages could not be loaded.'}
  if(initial[8].status==='fulfilled')P.filesError=''
  else P.filesError=initial[8].reason?.message||'Source files could not be loaded.'
  applyRuntimeP();applyEnvP();P.offline=false;
  document.body.classList.remove('aharane-booting');document.body.classList.add('aharane-authenticated');
  render();
  P.statusTimer=setInterval(()=>{if(!document.hidden)refreshRuntimeP().catch(()=>{})},20000);
  if(navigator.serviceWorker)navigator.serviceWorker.register('/aharane/studio/sw.js',{scope:'/aharane/studio/'}).catch(()=>{});
 }catch(error){
  if(error.status===401){await showLoginP();return}
  P.offline=true;
  document.body.classList.remove('aharane-booting');document.body.classList.add('aharane-authenticated');
  Q('#view').innerHTML='<div class="card" style="padding:20px;margin-top:24px"><h1>Studio temporarily unavailable</h1><p class="sub" id="studio-connect-error"></p><button class="btn p" id="studio-retry">Retry connection</button></div>';
  Q('#studio-connect-error').textContent=error.message||'Could not connect to the Aharane service.';
  Q('#studio-retry').onclick=()=>connectLiveP();
 }
}
function applyRuntimeP(){
 const a=P.runtime?.accounts||{};
 accts.splice(0,accts.length,
  {n:'Private account',d:'Private Owner self-chat',on:a.private?.connected?1:0,slot:'private'},
  {n:'Public account',d:'Public WhatsApp bot',on:a.public?.connected?1:0,slot:'public'});
 const connectedCount=Number(Boolean(a.private?.connected))+Number(Boolean(a.public?.connected));
 S.connectedAccountCount=connectedCount;
 S.run=connectedCount>0;
 S.botStatusLabel=connectedCount===2?'2 accounts online':connectedCount===1?'1 account online':'Bots offline';
 if(typeof pill==='function')pill();
 S.t0=Date.now()-Number(P.snapshot?.uptimeSeconds||0)*1000;
 logs=P.activity.slice(0,8).map(x=>[x.message,new Date(x.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})]);
 const series=P.metrics?.hourlyMessages||[];bars=series.length?series.map(n=>Math.max(6,Math.min(100,Number(n)*12+6))):Array(24).fill(6);
}
async function refreshRuntimeP(){
 const [runtime,snapshot]=await Promise.all([apiP('status'),apiP('studio/snapshot')]);
 const previous=P.runtime?.accounts||{};
 P.runtime=runtime;P.snapshot=snapshot;applyRuntimeP();
 if(S.tab==='home'&&!S.sub){render()}
 else if(S.tab==='home'&&S.sub==='pair'){
  const id=accts[S.pi]?.slot==='public'?'public':'private',current=P.runtime?.accounts?.[id]||{};
  if((current.connected&&!previous[id]?.connected)||(current.registered&&!previous[id]?.registered)){
   S.pin=null;S.qrRequested=false;
   if(P.qrTimer){clearInterval(P.qrTimer);P.qrTimer=null}
   render();
  }
 }
 return P.runtime;
}
async function refreshActivityP(){
 const r=await apiP('activity?limit=500');P.activity=r.entries||[];
 LOGS.splice(0,LOGS.length,...P.activity.map(x=>({id:x.id,ts:new Date(x.at).getTime(),lv:x.level,src:x.source,msg:x.message,det:''})));
 lid=LOGS.length;logs=P.activity.slice(0,8).map(x=>[x.message,new Date(x.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})]);
}
function applyEnvP(){
 envs=P.env.map(x=>({k:x.key,v:x.value,s:0,readOnly:Boolean(x.readOnly),scope:x.scope,type:x.type||'text'}));
 const value=key=>String(P.env.find(x=>x.key===key)?.value??'');
 envs.push(
  {k:'PRIVATE_PREFIX',v:value('PRIVATE_COMMAND_PREFIX')||'.',readOnly:true},
  {k:'OWNER_NUMBER',v:P.owners.ownerNumber||P.owners.privateOwnerNumber||''},
  {k:'PUBLIC_PREFIX',v:value('PUBLIC_COMMAND_PREFIX')||'!',readOnly:true},
  {k:'PUBLIC_NUMBER',v:P.owners.publicBotNumber||''}
 );
 envDirty=false;show={}
}
function currentPathP(){return S.path.join('/')}
function updateFileTreeP(path,children){
 let obj=fs;for(const part of path.split('/').filter(Boolean)){if(!obj[part]||typeof obj[part]!=='object')obj[part]={};obj=obj[part]}
 Object.keys(obj).forEach(k=>delete obj[k]);
 for(const item of children||[]){
  const full=String(item.path||[path,item.name].filter(Boolean).join('/'));
  P.fileMeta.set(full,item);
  obj[item.name]=item.type==='folder'?{}:'';
 }
}
window.AharaneFileMeta=path=>P.fileMeta.get(String(path||''))||null;
async function loadTreeP(path=''){const r=await apiP('files/tree?item='+encodeURIComponent(path));updateFileTreeP(path,r.children||[]);P.pending=Boolean(r.pending);P.stale=Boolean(r.stale);P.changedCount=Number(r.changedCount)||0;return r}
async function loadSourceFileP(path){
 const r=await apiP('files/preview?item='+encodeURIComponent(path));P.fileData.set(path,r);
 const parts=path.split('/'),name=parts.pop();let dir=fs;for(const part of parts)dir=dir[part];dir[name]=r.content;return r;
}
function downloadP(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
async function downloadSourceFileP(path,name){
 const response=await fetch(API+'/files/download?item='+encodeURIComponent(path),{credentials:'same-origin',cache:'no-store'});
 if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error||'File download failed ('+response.status+').')}
 const blob=await response.blob();if(!blob.size)throw new Error('The selected file is empty.');
 downloadP(name||path.split('/').pop(),blob);
}
async function exportSelectionZipP(paths,filename='aharane-selection.zip'){
 if(!Array.isArray(paths)||!paths.length)return notifyP('Select files or folders to export.');
 const response=await fetch(API+'/files/export-selection',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/zip'},body:pack({paths})});
 if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error||'The selected ZIP could not be created ('+response.status+').')}
 const blob=await response.blob();if(!blob.size||!(response.headers.get('content-type')||'').includes('application/zip'))throw new Error('The server did not return a valid ZIP archive.');
 downloadP(filename,blob);notifyP('Selected files are ready to download.');
}
async function exportBotSourceP(button){
 if(button?.disabled)return;
 if(button)button.disabled=true;
 try{
  const response=await fetch(API+'/files/export',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/zip'}});
  if(!response.ok){
   const type=response.headers.get('content-type')||'';
   const error=type.includes('application/json')?await response.json().catch(()=>({})): {};
   throw new Error(error.error||'The source ZIP could not be created ('+response.status+').');
  }
  const blob=await response.blob();
  if(!blob.size||!((response.headers.get('content-type')||'').includes('application/zip')))throw new Error('The server did not return a valid source ZIP.');
  downloadP('aharane-source.zip',blob);
  notifyP('Full Aharane source ZIP is ready to download.');
 }catch(error){notifyP(error.message)}
 finally{if(button)button.disabled=false}
}
async function loadPackagesP(){
 try{const r=await apiP('files/packages');P.packageError='';return r.packages||[]}
 catch(error){P.packageError=error.message||'Saved ZIP packages could not be loaded.';throw error}
}
function updateUploadProgressP(){
 let holder=Q('#prod-upload-progress'),label=Q('#prod-upload-label'),bar=Q('#prod-upload-bar');
 if(P.uploadProgress&&!holder&&S.tab==='files'){
  holder=document.createElement('div');holder.id='prod-upload-progress';holder.className='card';
  holder.style.cssText='padding:12px;margin:12px 0';
  holder.innerHTML='<div class="d" id="prod-upload-label"></div><div class="pbar" style="margin-top:8px"><i id="prod-upload-bar" style="width:0"></i></div>';
  const host=Q('#view'),list=host?.querySelector('.card.list');
  if(list)host.insertBefore(holder,list);else host?.appendChild(holder);
  label=Q('#prod-upload-label');bar=Q('#prod-upload-bar');
 }
 if(label&&P.uploadProgress){
  label.textContent=(P.uploadProgress.stage==='preparing'?'Preparing ':'Uploading ')+P.uploadProgress.filename+' · '+P.uploadProgress.completed+' of '+P.uploadProgress.total+' parts';
  if(bar)bar.style.width=Math.round(P.uploadProgress.completed/P.uploadProgress.total*100)+'%';
 }
 if(!P.uploadProgress)holder?.remove();
}
async function uploadZipP(file){
 if(file.size<22||file.size>50*1024*1024)throw new Error('ZIP files must be no larger than 50 MB.');
 const count=Math.ceil(file.size/1048576);
 P.uploadProgress={filename:file.name,completed:0,total:count,stage:'preparing'};updateUploadProgressP();
 try{
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  const sum=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''),id=crypto.randomUUID();
  P.uploadProgress.stage='uploading';updateUploadProgressP();
  await apiP('update/upload/start',{method:'POST',body:pack({updateId:id,filename:file.name,size:file.size,totalChunks:count,sha256:sum})});
  for(let i=0;i<count;i++){
   const bytes=new Uint8Array(await file.slice(i*1048576,(i+1)*1048576).arrayBuffer());let binary='';
   for(let j=0;j<bytes.length;j+=0x8000)binary+=String.fromCharCode(...bytes.subarray(j,j+0x8000));
   await apiP('update/upload/chunk',{method:'POST',body:pack({updateId:id,index:i,data:btoa(binary)})});
   P.uploadProgress.completed=i+1;updateUploadProgressP();
  }
  P.uploadProgress.stage='validating';updateUploadProgressP();
  const result=await apiP('update/validate',{method:'POST',body:pack({updateId:id})});
  P.packages=await loadPackagesP();return result;
 }finally{P.uploadProgress=null;updateUploadProgressP()}
}
async function pollUpdateP(){
 let lastError=null;
 for(let i=0;i<360;i++){
  await new Promise(r=>setTimeout(r,2000));
  try{
   const status=await apiP('update/status');
   lastError=null;
   if(['succeeded','failed','rolled_back','rollback_failed'].includes(status.update?.status))return status.update;
  }catch(error){
   lastError=error;
   if(error.status===401||error.status===403)throw error;
   if(error.status&&error.status<500&&error.status!==429)throw error;
  }
 }
 if(lastError)throw new Error('Update status is still unreachable after the restart window. Reopen Studio and check Update status before retrying; the deployment may still have completed.');
 throw new Error('The update did not reach a final status within the 12-minute monitoring window. Check Update status before retrying.');
}
async function deployPackageP(id){
 const pkg=P.packages.find(x=>x.updateId===id);if(!pkg)return;
 if(!confirm('Update Aharane to version '+pkg.version+'? The service will restart. WhatsApp sessions and persistent data are preserved.'))return;
 await apiP('update/deploy',{method:'POST',body:pack({updateId:id,confirm:true})});notifyP('Preparing update…');
 const result=await pollUpdateP();notifyP(result.message||result.status);await refreshRuntimeP();P.packages=await loadPackagesP();render();
}
function packagePageP(){
 const rows=P.packages.map(p=>'<div class="row"><span class="ic">'+ico('file')+'</span><span class="grow"><div class="t">'+escP(p.filename)+'</div><div class="d">v'+escP(p.version)+' · '+Number(p.fileCount||0)+' files</div></span><button class="more" data-package="'+escP(p.updateId)+'">⋮</button></div>').join('');
 const body=P.packageError?'<div class="empty">Saved packages could not be loaded: '+escP(P.packageError)+'<div class="btns"><button class="btn sm" id="prod-retry-packages">Retry</button></div></div>':(rows||'<div class="empty">No ZIP update packages saved.</div>');
 return '<button class="btn sm" onclick="S.path=[];render()">Back to files</button><h1 style="margin-top:14px">Update packages</h1><p class="sub">Validated Aharane ZIP packages. Use the three-dot menu to update the bot.</p><div class="card list">'+body+'</div>';
}
window.openPackagePageP=()=>{S.path=['updates'];S.ed=false;render()};
async function applyFilesP(){
 const editor=Q('#ed');
 if(editor)scheduleFileAutosaveP(S.cur,editor.value,0);
 if(!confirm('Apply staged source changes and restart Aharane?'))return;
 try{
  const flushed=await flushAllFileAutosavesP();
  if(!flushed||fileLocalDraftsP.size||fileAutosaveConflictsP.size){
   throw new Error('Some edits are still saved only on this phone or need conflict review. Resolve them before applying.');
  }
  await apiP('files/apply',{method:'POST',body:pack({confirm:true})});
  notifyP('Applying staged changes…');await pollUpdateP();await refreshRuntimeP();render();
 }catch(error){notifyP(error.message)}
}
async function recoverFilesP(){
 const editor=Q('#ed'),editorPath=editor?S.cur:'',editorContent=editor?editor.value:null;
 if(!confirm('Recover the saved draft onto the current Aharane source? Your staged changes will be kept. The running bot will not be restarted.'))return;
 try{
  if(editorPath&&editorContent!==null)scheduleFileAutosaveP(editorPath,editorContent,0);
  const flushed=await flushAllFileAutosavesP();
  if(!flushed)throw new Error('Some edits are still waiting to save. Keep the editor open and retry recovery after the save succeeds.');
  const result=await apiP('files/recover',{method:'POST',body:pack({confirm:true})});
  P.stale=false;P.pending=true;P.changedCount=Number(result.changedCount)||P.changedCount;
  P.fileData.clear();
  if(editorPath&&editorContent!==null){
   await loadSourceFileP(editorPath);
   scheduleFileAutosaveP(editorPath,editorContent,0);
   const ok=await flushFileAutosaveP(editorPath);
   if(!ok)throw new Error('The staged draft was recovered, but the editor text still needs saving. Your device copy remains available.');
  }
  try{await loadTreeP(currentPathP())}
  catch{S.path=[];await loadTreeP('')}
  render();
  notifyP(result.message||'The saved draft was recovered.');
 }catch(error){notifyP(error.message)}
}
async function discardFilesP(){
 if(!confirm('Discard all staged server changes and unsent device drafts? This cannot be undone. The running Aharane version will not be changed.'))return;
 for(const timer of fileAutosaveTimersP.values())clearTimeout(timer);
 fileAutosaveTimersP.clear();
 while(fileAutosaveBusyP.size)await new Promise(resolve=>setTimeout(resolve,25));
 for(const timer of fileAutosaveTimersP.values())clearTimeout(timer);
 fileAutosaveTimersP.clear();
 fileAutosaveQueuedP.clear();
 try{
  await apiP('files/discard',{method:'POST',body:pack({confirm:true})});
  fileAutosaveConflictsP.clear();fileLocalDraftsP.clear();persistFileLocalDraftsP();P.fileData.clear();
  P.pending=false;P.stale=false;P.changedCount=0;
  await loadTreeP(currentPathP());render();notifyP('Staged server and device drafts discarded');
 }catch(error){
  // The server may be unreachable. Restore the retry queue from the still-kept
  // device copies so a failed discard never strands the user's edits.
  for(const [path,draft] of fileLocalDraftsP)scheduleFileAutosaveP(path,draft.content,1000);
  notifyP(error.message);
 }
}
function localDraftBannerP(){
 if(!fileAutosaveConflictsP.has(S.cur))return '';
 return '<div class="note" style="margin:12px 0;padding:12px"><strong>A newer server version exists.</strong><p class="sub">Your unsent copy is preserved on this phone. You can restore it over the staged server version or keep the server version.</p><div class="btns"><button class="btn p" id="prod-restore-device-draft">Restore device draft</button><button class="btn" id="prod-keep-server-version">Keep server version</button></div></div>';
}
function staleDraftBannerP(){
 if(!P.stale)return '';
 return '<div class="note" style="margin:12px 0;padding:12px"><strong>Saved draft is from an older Aharane release.</strong><p class="sub">Your draft is still on the server. Recover it onto the current source before applying it. Recovery keeps your staged file changes and does not restart the bot.</p><div class="btns"><button class="btn p" id="prod-recover-files">Recover draft</button><button class="btn" id="prod-discard-stale-files">Discard draft</button></div></div>';
}
function filesScreenP(){
 const staleBanner=staleDraftBannerP();
 if(S.path[0]==='updates')return staleBanner+packagePageP();
 if(S.ed){
  const editorMarkup=editorOld().replace('id="es">Saved</span>','id="es">Autosave on</span>');
  const conflictLocked=fileAutosaveConflictsP.has(S.cur)
   ?editorMarkup.replace('<textarea class="editor" id="ed"','<textarea class="editor" id="ed" readonly aria-readonly="true"')
   :editorMarkup;
  return conflictLocked+localDraftBannerP()+staleBanner+'<div class="btns"><button class="btn" id="prod-file-save">Save now</button><button class="btn" id="prod-file-download">Download</button></div>';
 }
 let html=filesBase();
 if(!S.path.length){
  const packages=P.packageError
   ?'<p class="sub" id="package-load-error">Saved ZIP packages unavailable: '+escP(P.packageError)+'</p><div class="btns"><button class="btn sm" id="prod-retry-packages">Retry package list</button></div>'
   :'<p class="sub">'+P.packages.length+' saved ZIP package(s)</p>';
  const staged=P.pending?(P.stale
   ?'<div class="d">'+P.changedCount+' staged item(s) awaiting recovery</div>'
   :'<div class="btns"><button class="btn p" id="prod-apply-files">Apply staged changes</button><button class="btn" id="prod-discard-files">Discard staged changes</button><span class="d">'+P.changedCount+' changed item(s)</span></div>'):'';
  html+='<h2>Update packages <button class="btn sm" onclick="openPackagePageP()">View all</button></h2>'+packages+staged;
  if(P.filesError)html+='<div class="note">Could not load this folder: '+escP(P.filesError)+' <button class="btn sm" id="prod-retry-files">Retry</button></div>';
  if(P.uploadProgress)html+='<div class="card" style="padding:12px;margin-top:14px"><div class="d" id="prod-upload-label"></div><div class="pbar" style="margin-top:8px"><i id="prod-upload-bar" style="width:0"></i></div></div>';
 }
 return staleBanner+html;
}
function filePathP(name){return [currentPathP(),name].filter(Boolean).join('/')}
async function openLiveFileP(name){
 const path=filePathP(name),remote=await loadSourceFileP(path);
 openFileBase(name);
 const editor=Q('#ed'),draft=fileLocalDraftsP.get(path);
 if(!editor||!draft)return;
 if(draft.content===remote.content){removeFileLocalDraftP(path);fileAutosaveConflictsP.delete(path);return}
 if(draft.baseSha256===remote.sha256){
  editor.value=draft.content;
  updateSourceMemoryP(path,draft.content);
  scheduleFileAutosaveP(path,draft.content);
  setFileEditorStatusP(path,'Recovered unsent device draft · autosaving…');
 }else{
  fileAutosaveConflictsP.add(path);
  setFileEditorStatusP(path,'Device draft kept · server version changed');
  render();
 }
}
function setFileEditorStatusP(path, message) {
 if (S.cur !== path) return;
 const status=Q('#es');if(status)status.textContent=message;
}
function updateSourceMemoryP(path, content) {
 const parts=path.split('/'),name=parts.pop();let dir=fs;
 for(const part of parts){if(!dir[part]||typeof dir[part]!=='object')return;dir=dir[part]}
 dir[name]=content;
 const previous=P.fileMeta.get(path)||{};
 P.fileMeta.set(path,{...previous,path,name,type:'file',size:new Blob([content]).size,modified:new Date().toISOString(),readOnly:false});
}
async function queueDeviceDraftForSaveP(path){
 const draft=fileLocalDraftsP.get(path);
 if(!draft)return true;
 if(fileAutosaveQueuedP.has(path)||fileAutosaveBusyP.has(path))return true;
 let data=P.fileData.get(path);
 try{if(!data)data=await loadSourceFileP(path)}
 catch{
  fileAutosaveConflictsP.add(path);
  if(S.ed&&S.cur===path)render();
  return false;
 }
 if(!draft.baseSha256||draft.baseSha256!==data.sha256){
  fileAutosaveConflictsP.add(path);
  if(S.ed&&S.cur===path)render();
  return false;
 }
 if(draft.content===data.content){removeFileLocalDraftP(path);return true}
 scheduleFileAutosaveP(path,draft.content,0);
 return true;
}
function clearFileAutosaveTimerP(path){
 const timer=fileAutosaveTimersP.get(path);
 if(timer){clearTimeout(timer);fileAutosaveTimersP.delete(path)}
}
function scheduleFileAutosaveP(path, content, delay=1000, options={}) {
 const data=P.fileData.get(path),previous=fileAutosaveQueuedP.get(path);
 const job={path,content,baseSha256:previous?.baseSha256||data?.sha256||'',allowEmpty:Boolean(options.allowEmpty)};
 fileAutosaveQueuedP.set(path,job);
 const localOk=saveFileLocalDraftP(path,content,job.baseSha256);
 clearFileAutosaveTimerP(path);
 setFileEditorStatusP(path,localOk?'Unsaved changes · autosaving…':'Unsaved changes · device backup unavailable');
 if(delay>=0){
  const timer=setTimeout(()=>{fileAutosaveTimersP.delete(path);void flushFileAutosaveP(path)},delay);
  fileAutosaveTimersP.set(path,timer);
 }
}
async function flushFileAutosavePathP(path){
 clearFileAutosaveTimerP(path);
 if(fileAutosaveBusyP.has(path)){
  while(fileAutosaveBusyP.has(path))await new Promise(resolve=>setTimeout(resolve,25));
 }
 const job=fileAutosaveQueuedP.get(path);
 if(!job)return true;
 const data=P.fileData.get(path);
 if(!data){
  setFileEditorStatusP(path,'Autosave paused · reopen this file to retry');
  return false;
 }
 if(job.content===data.content){
  fileAutosaveQueuedP.delete(path);
  removeFileLocalDraftP(path);
  setFileEditorStatusP(path,'Autosaved to server (staged)');
  return true;
 }
 if(job.content===''&&data.content!==''&&!job.allowEmpty){
  setFileEditorStatusP(path,'Empty file · press Save now to confirm');
  return false;
 }
 fileAutosaveQueuedP.delete(path);
 fileAutosaveBusyP.add(path);
 const button=S.cur===path?Q('#prod-file-save'):null;if(button)button.disabled=true;
 try{
  let verified=null,saveResult=null,lastError=null;
  try{
   saveResult=await apiP('files/content',{method:'PUT',body:pack({path,content:job.content,expectedSha256:data.sha256})});
   verified=await apiP('files/preview?item='+encodeURIComponent(path));
   if(verified.content!==job.content||verified.sha256!==saveResult.sha256)throw new Error('The server read-back did not match the saved content.');
  }catch(error){
   lastError=error;
   // The write may have completed even when the HTTP response was lost or
   // the journal write failed. Verify before retrying or showing failure.
   try{
    const observed=await apiP('files/preview?item='+encodeURIComponent(path));
    if(observed.content===job.content)verified=observed;
    else{
     P.fileData.set(path,observed);
     updateSourceMemoryP(path,observed.content);
     fileAutosaveConflictsP.add(path);
     throw lastError;
    }
   }catch{throw lastError}
  }
  P.fileData.set(path,verified);
  updateSourceMemoryP(path,verified.content);
  P.pending=true;
  P.changedCount=Math.max(P.changedCount,Number(saveResult?.changedCount)||1);
  const currentDraft=fileLocalDraftsP.get(path);
  if(currentDraft?.content===job.content)removeFileLocalDraftP(path);
  else if(currentDraft){
   fileLocalDraftsP.set(path,{...currentDraft,baseSha256:verified.sha256,updatedAt:Date.now()});
   persistFileLocalDraftsP();
   const newer=fileAutosaveQueuedP.get(path);
   if(newer)fileAutosaveQueuedP.set(path,{...newer,baseSha256:verified.sha256});
  }
  if(fileAutosaveQueuedP.has(path)){
   setFileEditorStatusP(path,'Newer edits · autosaving…');
  }else{
   const editor=S.cur===path?Q('#ed'):null;
   setFileEditorStatusP(path,editor&&editor.value!==job.content?'Newer edits · autosaving…':'Autosaved to server (staged)');
   const count=Q('#ec');if(count&&S.cur===path)count.textContent=job.content.split('\n').length+' lines';
  }
  return true;
 }catch(error){
  const newer=fileAutosaveQueuedP.get(path);
  if(!newer||newer.content===job.content)fileAutosaveQueuedP.set(path,job);
  const message=String(error?.message||error).slice(0,110);
  setFileEditorStatusP(path,fileAutosaveConflictsP.has(path)||/changed after you opened|version check/i.test(message)
   ?'Save conflict · device draft preserved for review'
   :'Autosave failed · draft kept on this device: '+message);
  if(fileAutosaveConflictsP.has(path)&&S.cur===path)render();
  return false;
 }finally{
  fileAutosaveBusyP.delete(path);
  if(button)button.disabled=false;
  if(fileAutosaveQueuedP.has(path)&&fileAutosaveQueuedP.get(path).content!==job.content&&!fileAutosaveConflictsP.has(path)){
   const timer=setTimeout(()=>{fileAutosaveTimersP.delete(path);void flushFileAutosaveP(path)},150);
   fileAutosaveTimersP.set(path,timer);
  }
 }
}
async function flushFileAutosaveP(path){
 const targets=Array.isArray(path)?path:(path?[path]:[...new Set([...fileAutosaveQueuedP.keys(),...fileAutosaveBusyP])]);
 const results=await Promise.all([...new Set(targets)].map(flushFileAutosavePathP));
 return results.every(Boolean);
}
async function flushFilePathsP(paths){
 const roots=[...new Set(paths||[])].filter(Boolean);
 const devicePaths=[...fileLocalDraftsP.keys()].filter(path=>roots.some(root=>path===root||path.startsWith(root+'/')));
 for(const path of devicePaths){
  if(fileAutosaveConflictsP.has(path)||!await queueDeviceDraftForSaveP(path))return false;
 }
 const affected=[...new Set([...fileAutosaveQueuedP.keys(),...fileAutosaveBusyP])].filter(path=>roots.some(root=>path===root||path.startsWith(root+'/')));
 const ok=await flushFileAutosaveP(affected);
 return ok&&affected.every(path=>!fileAutosaveQueuedP.has(path)&&!fileAutosaveBusyP.has(path))&&
  ![...fileLocalDraftsP.keys()].some(path=>roots.some(root=>path===root||path.startsWith(root+'/'))) &&
  ![...fileAutosaveConflictsP].some(path=>roots.some(root=>path===root||path.startsWith(root+'/')));
}
function clearFileDraftSubtreeP(path){
 for(const key of [...fileLocalDraftsP.keys()])if(key===path||key.startsWith(path+'/'))removeFileLocalDraftP(key);
 for(const key of [...P.fileData.keys()])if(key===path||key.startsWith(path+'/'))P.fileData.delete(key);
 for(const key of [...fileAutosaveQueuedP.keys()])if(key===path||key.startsWith(path+'/'))fileAutosaveQueuedP.delete(key);
 for(const key of [...fileAutosaveConflictsP])if(key===path||key.startsWith(path+'/'))fileAutosaveConflictsP.delete(key);
}
async function flushAllFileAutosavesP(){
 for(const path of [...fileLocalDraftsP.keys()]){
  if(fileAutosaveConflictsP.has(path)||!await queueDeviceDraftForSaveP(path))return false;
 }
 const ok=await flushFileAutosaveP();
 return ok&&fileAutosaveQueuedP.size===0&&fileLocalDraftsP.size===0&&fileAutosaveConflictsP.size===0;
}
async function restoreDeviceDraftP(){
 const path=S.cur,draft=fileLocalDraftsP.get(path),editor=Q('#ed'),data=P.fileData.get(path);
 if(!draft||!editor||!data)return;
 if(!confirm('Restore the copy saved on this phone over the current staged server file? The draft on this phone will be kept until the new save is verified.'))return;
 if(draft.content===''&&data.content!==''&&!confirm('This will replace the server file with an empty file. Continue?'))return;
 editor.value=draft.content;updateSourceMemoryP(path,draft.content);
 scheduleFileAutosaveP(path,draft.content,0,{allowEmpty:true});
 const ok=await flushFileAutosaveP(path);
 if(ok){fileAutosaveConflictsP.delete(path);render()}else render();
}
function keepServerFileP(){
 const path=S.cur;
 clearFileAutosaveTimerP(path);
 fileAutosaveQueuedP.delete(path);
 const server=P.fileData.get(path);
 if(server)updateSourceMemoryP(path,server.content);
 fileAutosaveConflictsP.delete(path);
 removeFileLocalDraftP(path);
 notifyP('Kept the server version; the device draft was removed.');
 render();
}
async function saveLiveFileP(){
 const editor=Q('#ed'),path=S.cur,data=P.fileData.get(path);
 if(!editor||!data){notifyP('Could not find the open file editor. Reopen the file and try again.');return}
 const content=editor.value;
 if(!content&&data.content&&!confirm('This will replace the existing file with an empty file. Continue?'))return;
 scheduleFileAutosaveP(path,content,0,{allowEmpty:true});
 const ok=await flushFileAutosaveP(path);
 if(ok)notifyP('File saved and verified on the server');
}
function createLiveFileP(type){
 ask(type==='folder'?'New folder':'New file','','Create',async name=>{
  try{await apiP('files',{method:'POST',body:pack({parentPath:currentPathP(),name,type,content:type==='file'?'':''})});await loadTreeP(currentPathP());render()}
  catch(error){notifyP(error.message)}
 });
}
function bindLiveSelectionP(){
 const d=node(S.path),ca=Q('#ca');
 if(ca)ca.onchange=()=>{
  S.ks.forEach(key=>S.sel[key]=ca.checked);
  document.querySelectorAll('[data-ck]').forEach(input=>input.checked=ca.checked);
  selUI();
 };
 document.querySelectorAll('[data-ck]').forEach(input=>input.onchange=()=>{
  S.sel[input.dataset.ck]=input.checked;
  selUI();
 });
 const selected=()=>selK(node(S.path)).map(name=>[...S.path,name].filter(Boolean).join('/'));
 const bd=Q('#bd');if(bd)bd.onclick=()=>{
  const paths=selected();if(!paths.length)return;
  if(!confirm('Delete '+paths.length+' selected item(s)? The change will be staged.'))return;
  void (async()=>{
   try{
    if(!await flushFilePathsP(paths))throw new Error('Save pending edits before deleting the selected items.');
    await apiP('files/delete',{method:'POST',body:pack({paths})});
    for(const path of paths)clearFileDraftSubtreeP(path)
    S.sel={};await loadTreeP(currentPathP());render();notifyP('Selected items deleted and staged');
   }catch(error){notifyP(error.message)}
  })();
 };
 const bm=Q('#bm');if(bm)bm.onclick=()=>ask('Move selected items to folder (for example commands, or root)','','Move',async value=>{
  const paths=selected();if(!paths.length)return;
  try{
   if(!await flushFilePathsP(paths))throw new Error('Save pending edits before moving the selected items.');
   await apiP('files/move',{method:'POST',body:pack({paths,destination:value==='root'||value==='/'?'':value})});
   for(const path of paths)clearFileDraftSubtreeP(path)
   S.sel={};await loadTreeP(currentPathP());render();notifyP('Selected items moved and staged');
  }catch(error){notifyP(error.message)}
 });
 const bz=Q('#bz');if(bz)bz.onclick=()=>exportSelectionZipP(selected(),'aharane-selection.zip').catch(error=>notifyP(error.message));
}
function fileMenuP(name,button){
 closePop();const path=filePathP(name),folder=typeof node(S.path)[name]==='object',actions=folder?['Rename','Move','Download as ZIP']:['Rename','Move','Download','Delete'];
 const popup=document.createElement('div');popup.id='pop';popup.className='pop';popup.setAttribute('role','menu');
 popup.innerHTML=actions.map(a=>'<button role="menuitem" data-file-action="'+a+'"'+(a==='Delete'?' class="del"':'')+'>'+a+'</button>').join('');
 document.body.appendChild(popup);const r=button.getBoundingClientRect(),h=popup.offsetHeight,w=popup.offsetWidth;
 popup.style.left=Math.max(8,Math.min(innerWidth-w-8,r.right-w))+'px';popup.style.top=r.bottom+h+8>innerHeight?Math.max(8,r.top-h-2)+'px':r.bottom+2+'px';
 popup.onclick=async e=>{
  const a=e.target.dataset.fileAction;if(!a)return;closePop();
  try{
   if(a==='Rename')ask('Rename',name,'Save',async value=>{try{if(!await flushFilePathsP([path]))throw new Error('Save the pending edits before renaming this item.');await apiP('files/rename',{method:'POST',body:pack({path,name:value})});await loadTreeP(currentPathP());render()}catch(error){notifyP(error.message)}});
   else if(a==='Move')ask('Move to folder (for example commands or private-commands)','commands','Move',async value=>{try{if(!await flushFilePathsP([path]))throw new Error('Save the pending edits before moving this item.');await apiP('files/move',{method:'POST',body:pack({path,destination:value==='root'?'':value})});await loadTreeP(currentPathP());render()}catch(error){notifyP(error.message)}});
   else if(a==='Download as ZIP'){await exportSelectionZipP([path],name+'.zip')}
   else if(a==='Download'){await downloadSourceFileP(path,name);notifyP('Download started')}
   else if(a==='Delete'){if(!confirm('Delete '+name+'? The change will be staged.'))return;if(!await flushFilePathsP([path]))throw new Error('Save the pending edits before deleting this item.');await apiP('files/delete',{method:'POST',body:pack({paths:[path]})});clearFileDraftSubtreeP(path);await loadTreeP(currentPathP());render()}
  }catch(error){notifyP(error.message)}
 };
}
function packageMenuP(id,button){
 closePop();const popup=document.createElement('div');popup.id='pop';popup.className='pop';popup.innerHTML='<button data-package-action="Update bot">Update bot</button><button class="del" data-package-action="Remove">Remove</button>';document.body.appendChild(popup);
 const r=button.getBoundingClientRect(),w=popup.offsetWidth,h=popup.offsetHeight;popup.style.left=Math.max(8,Math.min(innerWidth-w-8,r.right-w))+'px';popup.style.top=r.bottom+h+8>innerHeight?Math.max(8,r.top-h-2)+'px':r.bottom+2+'px';
 popup.onclick=async e=>{const a=e.target.dataset.packageAction;if(!a)return;closePop();try{if(a==='Update bot')await deployPackageP(id);else if(a==='Remove'&&confirm('Remove this saved ZIP package?')){await apiP('files/packages/remove',{method:'POST',body:pack({updateId:id})});P.packages=await loadPackagesP();render()}}catch(error){notifyP(error.message)}};
}
function accountViewP(){
 const rows=['private','public'].map(id=>{
  const a=P.runtime?.accounts?.[id]||{},state=a.connected?'Connected':a.state||'Offline';
  const pairLabel=a.registered?(a.connected?'Replace link':'Pair again'):['needs-pairing','reconnect-exhausted'].includes(a.state)?'Re-pair':'Link account';
  const pairButton='<button class="btn sm p" data-pair-account="'+id+'">'+pairLabel+'</button>';
  const actions=a.connected
   ?'<button class="btn sm" data-account="'+id+'" data-action="restart">Restart session</button><button class="btn sm d" data-account="'+id+'" data-action="stop">Stop session</button>'
   :a.registered?'<button class="btn sm" data-account="'+id+'" data-action="reconnect">Reconnect</button>':'';
  return '<div class="row"><span class="av">'+(id==='private'?'P':'A')+'<i class="st av-dot '+(a.connected?'':'off')+'"></i></span><span class="grow"><div class="t">'+(id==='private'?'Private account':'Public account')+'</div><div class="d">'+escP(state)+' · '+(a.registered?'Paired':'Not paired')+'</div></span>'+pairButton+'</div>'+(actions?'<div class="row" style="padding-left:64px;flex-wrap:wrap">'+actions+'</div>':'');
 }).join('');
 const owner=P.owners.ownerNumber||P.owners.privateOwnerNumber||P.owners.publicOwnerNumber||'';
 return '<button class="btn sm" onclick="S.sub=null;render()">Back to Home</button><h1 style="margin-top:14px">Accounts</h1><p class="sub">Two independent WhatsApp sessions with separate connection status.</p><div class="card list">'+rows+'</div><h2>Owner</h2><p class="sub">One Owner number controls owner privileges on both sessions. The Public bot is open to WhatsApp users; owner-only actions remain protected. The Public bot number belongs to its separate WhatsApp account.</p><div class="card list" style="padding:14px"><label class="d" for="owner-number">Owner phone number</label><input class="field" id="owner-number" value="'+escP(owner)+'" inputmode="numeric"><div class="env"><label class="d" for="owner-public-bot">Public bot WhatsApp number</label><input class="field" id="owner-public-bot" value="'+escP(P.owners.publicBotNumber||'')+'" disabled><p class="d" style="white-space:normal;margin-top:6px">Change this under Configuration → Public account.</p></div><div class="btns"><button class="btn p" id="save-owners">Save owner settings</button></div></div>';
}

function pairStatusLabelP(a){
 if(a.connected)return 'Connected';
 if(a.state==='needs-pairing')return 'Needs re-pairing';
 if(a.state==='reconnect-exhausted')return 'Three reconnect attempts failed · repair required';
 if(a.registered)return 'Paired · offline';
 const labels={'not-paired':'Not paired',pairing:'Waiting for WhatsApp',connecting:'Connecting to WhatsApp',disconnected:'Connection closed',stopped:'Stopped',degraded:'Connection needs attention'};
 return labels[a.state]||a.state||'Not paired';
}
function pairErrorTextP(error){
 const message=String(error?.message||'Pairing could not be completed.');
 if(/connection closed/i.test(message))return 'WhatsApp closed the pairing connection. Aharane refreshed the account status; retry when WhatsApp is reachable.';
 return message;
}
async function refreshPairViewAfterFailureP(){
 const id=accts[S.pi]?.slot==='public'?'public':'private',before=P.runtime?.accounts?.[id]||{};
 try{await refreshRuntimeP()}catch{}
 const after=P.runtime?.accounts?.[id]||{};
 if(S.tab==='home'&&S.sub==='pair'&&(before.state!==after.state||before.registered!==after.registered||before.connected!==after.connected))render();
}
function pairViewP(){
 const id=accts[S.pi]?.slot==='public'?'public':'private',a=P.runtime?.accounts?.[id]||{};
 const number=id==='private'?(P.owners.ownerNumber||P.owners.privateOwnerNumber):P.owners.publicBotNumber;
 const label=id==='private'?'Owner number':'Public bot WhatsApp number';
 let panel='';
 if(a.pairingSucceeded){
  panel+='<div class="empty" style="margin-bottom:12px"><strong>Replacement link connected</strong><p class="d" style="white-space:normal">The new WhatsApp session is active. The previous authentication was retained.</p></div>';
 }else if(a.pairingError){
  panel+='<div class="note" style="margin-bottom:12px">'+escP(a.pairingError)+'</div>';
 }else if(a.registered){
  panel+='<div class="empty" style="margin-bottom:12px"><strong>'+(a.connected?'Current session connected':'Previously linked session')+'</strong><p class="d" style="white-space:normal">The current WhatsApp session stays available until the replacement link has connected successfully.</p></div>';
 }else{
  panel+='<p class="d" style="white-space:normal">Link this WhatsApp account using a pairing code or QR code.</p>';
 }
 if(!number){
  panel+='<div class="empty" style="padding:8px 0 16px">Add the '+label+' in Configuration first. The pairing screen will use that saved number automatically.</div><button class="btn p" id="pair-open-config" style="width:100%">Open Configuration</button>';
 }else if(S.pm==='qr'){
  panel+='<div class="d" style="text-align:center;margin-bottom:12px">Account number · +'+escP(number)+'</div>'+(S.qrRequested?'<div class="empty" id="prod-qr-panel">Requesting QR code…</div>':'<div class="empty" id="prod-qr-panel" style="padding:14px 0">No QR code requested. Aharane will only request one when you tap the button.</div>')+'<p class="d" style="white-space:normal">Open WhatsApp on the phone you want to link → Linked devices → Link a device.</p><button class="btn p" id="prod-qr-request" style="width:100%" '+(a.pairingInProgress||S.qrRequested?'disabled':'')+'>'+(S.qrRequested?'Request fresh QR code':'Get QR code')+'</button>';
 }else{
  panel+='<div class="d" style="text-align:center;margin-bottom:12px">'+label+' · +'+escP(number)+'</div>'+(S.pin?'<div class="pin" style="text-align:center;margin:18px 0"><b>'+escP(S.pin)+'</b></div><p class="d" style="text-align:center;white-space:normal">Enter this code in WhatsApp → Linked devices → Link with phone number.</p><div class="btns" style="justify-content:center"><button class="btn" id="prod-copy-code">Copy code</button><button class="btn" id="prod-pair-code">Request new code</button></div>':'<p class="d" style="text-align:center;white-space:normal">A pairing code will only be requested when you tap below.</p><button class="btn p" id="prod-pair-code" style="width:100%" '+(a.pairingInProgress?'disabled':'')+'>Get pairing code</button>');
 }
 if(a.pairingInProgress||S.pin||S.qrRequested)panel+='<button class="btn" id="prod-cancel-pairing" style="width:100%;margin-top:10px">Cancel pairing attempt</button>';
 return '<button class="btn sm" id="prod-pair-back">Back to Home</button><h1 style="margin-top:14px">Link '+(id==='public'?'Public':'Private')+' account</h1><p class="sub">'+pairStatusLabelP(a)+'</p><div class="seg" style="margin-bottom:16px"><button type="button" class="'+(S.pm==='pin'?'on':'')+'" data-pm="pin">Pairing code</button><button type="button" class="'+(S.pm==='qr'?'on':'')+'" data-pm="qr">QR code</button></div><div class="card" style="padding:16px">'+panel+'</div>';
}

async function getPairCodeP(){
 const id=accts[S.pi]?.slot==='public'?'public':'private';
 const button=Q('#prod-pair-code');if(button)button.disabled=true;
 try{
  const r=await apiP('accounts/'+id+'/pair-code',{method:'POST',body:pack({})});
  S.pin=r.pairingCode;S.qrRequested=false;await refreshRuntimeP();render();startPairMonitorP();
 }catch(error){
  if(button)button.disabled=false;await refreshPairViewAfterFailureP();notifyP(pairErrorTextP(error));
 }
}
let qrSeenP='';
async function readQrP(){
 const id=accts[S.pi]?.slot==='public'?'public':'private';
 try{
  const r=await apiP('accounts/'+id+'/qr'),el=Q('#prod-qr-panel');
  const account=P.runtime?.accounts?.[id];
  if(account){
   account.state=r.state||account.state;account.connected=r.state==='connected';
   account.pairingInProgress=Boolean(r.pairingInProgress);
   account.pairingSucceeded=Boolean(r.pairingSucceeded);
   account.pairingError=String(r.pairingError||'');
  }
  if(r.pairingSucceeded){
   if(el)el.textContent='Replacement session connected.';
   clearInterval(P.qrTimer);P.qrTimer=null;render();return;
  }
  if(r.pairingError){
   if(el)el.textContent=r.pairingError;
   clearInterval(P.qrTimer);P.qrTimer=null;render();return;
  }
  if(S.pm==='qr'&&el){
   if(r.qr&&r.qr!==qrSeenP){qrSeenP=r.qr;el.innerHTML=qrSvg(r.qr)}
   else if(!r.qr&&!qrSeenP)el.textContent='Waiting for WhatsApp to generate the QR you requested…';
  }
 }catch(error){
  if(Q('#prod-qr-panel'))Q('#prod-qr-panel').textContent=pairErrorTextP(error);
  clearInterval(P.qrTimer);P.qrTimer=null;await refreshPairViewAfterFailureP();
 }
}
function startPairMonitorP(){
 if(P.qrTimer)clearInterval(P.qrTimer);
 qrSeenP='';void readQrP();
 P.qrTimer=setInterval(()=>{if(!document.hidden)void readQrP()},1800);
}
function startQrP(){startPairMonitorP()}
async function cancelPairingP(){
 const id=accts[S.pi]?.slot==='public'?'public':'private';
 if(P.qrTimer){clearInterval(P.qrTimer);P.qrTimer=null}
 try{await apiP('accounts/'+id+'/cancel-pairing',{method:'POST',body:pack({})})}
 catch(error){notifyP(error.message)}
 S.pin=null;S.qrRequested=false;qrSeenP='';
 await refreshRuntimeP();render();
}

async function requestQrP(){
 const id=accts[S.pi]?.slot==='public'?'public':'private',button=Q('#prod-qr-request');
 if(button)button.disabled=true;
 try{await apiP('accounts/'+id+'/qr',{method:'POST',body:pack({})});S.pin=null;S.qrRequested=true;render();startQrP()}
 catch(error){if(button)button.disabled=false;await refreshPairViewAfterFailureP();notifyP(pairErrorTextP(error))}
}
async function repairPairP(){
 const id=accts[S.pi]?.slot==='public'?'public':'private';
 if(!confirm('Start a separate replacement pairing attempt? Your existing WhatsApp authentication and session will stay in place until the new link connects.'))return;
 try{await apiP('accounts/'+id+'/repair',{method:'POST',body:pack({})});S.pin=null;S.qrRequested=false;await refreshRuntimeP();render();notifyP('A separate replacement pairing session is ready. Your existing WhatsApp session remains unchanged until the new link connects.')}
 catch(error){await refreshPairViewAfterFailureP();notifyP(error.message)}
}
async function reconnectPairP(){
 const id=accts[S.pi]?.slot==='public'?'public':'private';
 try{await apiP('accounts/'+id+'/reconnect',{method:'POST',body:pack({})});await refreshRuntimeP();render();notifyP('Reconnect requested')}
 catch(error){await refreshPairViewAfterFailureP();notifyP(error.message)}
}
async function saveOwnersP(){
 try{
  const r=await apiP('owners',{method:'PUT',body:pack({
   ownerNumber:Q('#owner-number').value,
   publicBotNumber:P.owners.publicBotNumber||''
  })});
  P.owners=r.owners;
  notifyP('Owner settings saved');
  render();
 }catch(error){notifyP(error.message)}
}

function envViewP(){
 const rows=P.env.map((x,i)=>'<div class="env"><label for="e'+i+'">'+escP(x.key)+(x.readOnly?' · Fixed':'')+'</label><input class="field" id="e'+i+'" data-e="'+i+'" value="'+escP(x.value)+'" '+(x.readOnly?'disabled':'')+' autocomplete="off"></div>').join('');
 const empty=P.env.length?'':'<div class="empty" style="margin:12px 0"><strong>No environment values are available yet.</strong><p class="d" style="white-space:normal;margin-top:6px">When the server exposes managed ENV values, they will appear here. Command prefixes remain fixed by Aharane.</p></div>';
 const save=P.env.length?'<div class="btns"><button class="btn p" id="prod-save-env">Save changes</button></div>':'';
 return '<h1>ENV</h1><p class="sub">Managed environment values for the Private and Public accounts. Command prefixes are fixed by Aharane.</p>'+(rows?'<div class="card list">'+rows+'</div>':empty)+save;
}
async function saveEnvP(){try{const r=await apiP('env',{method:'PUT',body:pack({env:P.env.map((x,i)=>({key:x.key,value:envs[i]?.v??x.value}))})});P.env=r.env||[];applyEnvP();render();notifyP('ENV values saved')}catch(error){notifyP(error.message)}}
async function saveConfigP(){
 const button=Q('#csv');if(button)button.disabled=true;
 try{
  const profile=S.cprof==='public'?'public':'private';
  const clean=value=>String(value||'').replace(/\D/g,'');
  const ownerValue=clean(C.owner);
  if(ownerValue&&!/^\d{7,15}$/.test(ownerValue))throw new Error((profile==='private'?'Owner number':'Public bot WhatsApp number')+' must contain 7–15 digits, including the country code.');
  const owners={
   ownerNumber:profile==='private'?ownerValue:(P.owners.ownerNumber||P.owners.privateOwnerNumber||''),
   publicBotNumber:profile==='public'?ownerValue:(P.owners.publicBotNumber||'')
  };
  const ownerResult=await apiP('owners',{method:'PUT',body:pack(owners)});
  P.owners=ownerResult.owners||owners;
  cfgSave();
  const result=await apiP('env',{method:'PUT',body:pack({env:envs.map(x=>({key:x.k,value:x.v}))})});
  P.env=result.env||[];
  applyEnvP();
  loadP(profile);
  C=CS[profile];
  C.owner=profile==='private'?(P.owners.ownerNumber||P.owners.privateOwnerNumber||''):(P.owners.publicBotNumber||'');
  C.prefix=profile==='private'?'.':'!';
  C0=JSON.stringify(C);C0S[profile]=C0;
  cfgDirty(false);
  notifyP((profile==='private'?'Private':'Public')+' configuration saved');
  render();
 }catch(error){notifyP(error.message);if(button)button.disabled=false}
}
function storageViewP(){return '<button class="btn sm" onclick="S.sub=null;render()">Back to More</button><h1 style="margin-top:14px">Storage</h1><p class="sub">Server disk and persistent WhatsApp media.</p><div class="card" style="padding:18px"><div class="big" id="disk-used">Loading…</div><div class="d" id="disk-total">Reading server disk usage</div><div class="sbar" style="margin-top:16px"><i id="disk-bar" style="width:0;background:var(--acc)"></i></div><div class="row"><span class="grow t">Free space</span><span class="d" id="disk-free">—</span></div><div class="row"><span class="grow t">Media files</span><span class="d" id="media-count">—</span></div><div class="row"><span class="grow t">Media size</span><span class="d" id="media-size">—</span></div></div>'}
async function loadStorageP(){try{const r=await apiP('storage'),d=r.disk||{},m=r.media||{},total=Number(d.totalBytes||0),used=Number(d.usedBytes||0);if(Q('#disk-used'))Q('#disk-used').textContent=fsz(used);if(Q('#disk-total'))Q('#disk-total').textContent='of '+fsz(total)+' total disk';if(Q('#disk-free'))Q('#disk-free').textContent=fsz(d.freeBytes||0);if(Q('#media-count'))Q('#media-count').textContent=String(m.files||0);if(Q('#media-size'))Q('#media-size').textContent=fsz(m.bytes||0);if(Q('#disk-bar'))Q('#disk-bar').style.width=(total?Math.min(100,used/total*100):0)+'%'}catch(error){if(Q('#disk-used'))Q('#disk-used').textContent='Unavailable';notifyP(error.message)}}
async function activityPageP(){await refreshActivityP();S.sub='act';S.lq='';S.lf='all';S.ln=60;S.lp=false;render()}
async function clearActivityP(){if(!confirm('Clear saved activity history?'))return;try{await apiP('activity',{method:'DELETE'});await refreshActivityP();render()}catch(error){notifyP(error.message)}}
async function loadAppSourceP(path){
 const response=await fetch('/aharane/studio/'+path,{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw new Error('Could not load '+path+' from this device.');
 P.appSourcePath=path;P.appSourceContent=await response.text();P.appSourceOriginal=P.appSourceContent;P.appSourceDirty=false;
}
function appSourceViewP(){
 const rows=APP_SOURCE_PATHS.map(path=>'<button class="btn sm '+(P.appSourcePath===path?'p':'')+'" data-app-source="'+path+'">'+path+'</button>').join('');
 return '<button class="btn sm" id="back-from-app-source">Back to More</button><h1 style="margin-top:14px">Studio source</h1><p class="sub">Edit the app files saved on this phone. These changes are local to this device and do not update the bot server.</p><div class="tabs">'+rows+'</div><textarea class="editor" id="app-source-editor" spellcheck="false" aria-label="Studio application source">'+escP(P.appSourceContent||'Loading source…')+'</textarea><div class="status"><span id="app-source-status">'+(P.appSourceDirty?'Unsaved changes':'Saved on this phone')+'</span><span>'+String((P.appSourceContent||'').split('\\n').length)+' lines</span></div><div class="btns"><button class="btn p" id="save-app-source">Save on this phone</button><button class="btn" id="download-app-source">Download</button><button class="btn d" id="reset-app-source">Reset local edits</button></div>';
}
async function openAppSourceP(path){
 S.sub='source';P.appSourcePath=path||P.appSourcePath||'index.html';P.appSourceContent='Loading source…';P.appSourceDirty=false;render();
 try{await loadAppSourceP(P.appSourcePath);render()}catch(error){notifyP(error.message)}
}
async function openLocalSourceP(){
 P.offline=true;document.body.classList.remove('aharane-booting');document.body.classList.add('aharane-authenticated');
 Q('#aharane-auth')?.remove();
 try{if(navigator.serviceWorker)await navigator.serviceWorker.ready}catch{}
 S.tab='more';await openAppSourceP('index.html');
}
function openLocalSourceDbP(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('aharane-local-studio',2);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('files'))db.createObjectStore('files',{keyPath:'path'});if(!db.objectStoreNames.contains('appOverrides'))db.createObjectStore('appOverrides',{keyPath:'path'})};
  request.onerror=()=>reject(request.error||new Error('On-device storage is unavailable.'));
  request.onsuccess=()=>resolve(request.result);
 });
}
async function saveAppSourceP(){
 const editor=Q('#app-source-editor');if(!editor)return;
 let db;
 try{
  db=await openLocalSourceDbP();
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('appOverrides','readwrite');
   tx.objectStore('appOverrides').put({path:P.appSourcePath,content:editor.value,updatedAt:new Date().toISOString()});
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Could not save this source file.'));
  });
  P.appSourceContent=editor.value;P.appSourceDirty=false;
  const label=Q('#app-source-status');if(label)label.textContent='Saved on this phone';
  notifyP('Saved '+P.appSourcePath+' on this phone');
 }catch(error){notifyP(error.message)}finally{db?.close()}
}
async function resetAppSourceP(){
 if(!confirm('Remove all local Studio source overrides and restore the server-provided app files on this phone?'))return;
 let db;
 try{
  db=await openLocalSourceDbP();
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('appOverrides','readwrite');tx.objectStore('appOverrides').clear();
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Could not reset local source edits.'));
  });
  P.appSourceDirty=false;notifyP('Local source overrides cleared. Reloading the Studio…');location.reload();
 }catch(error){notifyP(error.message)}finally{db?.close()}
}
function moreViewP(){
 if(S.sub==='source')return appSourceViewP();
 if(P.offline)return '<h1>More</h1><p class="sub">On-device Studio source tools.</p><div class="card list"><button class="row" id="offline-open-source"><span class="grow"><div class="t">Studio source</div><div class="d">Edit HTML, CSS and JavaScript saved on this phone</div></span><span class="d">›</span></button></div>';
 const source=moreBase().replace(
  '<p class="sub">Additional tools and information</p>',
  '<p class="sub">Additional tools and information</p><div class="card list"><button class="row" onclick="openAcc()"><span class="grow"><div class="t">Accounts &amp; owners</div><div class="d">Manage both sessions with one shared Owner identity</div></span><span class="d">›</span></button></div>'
 );
 return source+'<h2>Development</h2><div class="card list"><button class="row" id="open-app-source"><span class="grow"><div class="t">Studio source</div><div class="d">Edit the app HTML, CSS and JavaScript on this phone</div></span><span class="d">›</span></button></div><div class="btns" style="margin-top:18px"><button class="btn" id="change-password">Change password</button><button class="btn d" id="sign-out">Sign out</button></div>';
}
function changePasswordP(){
 sheet('<h3>Change Studio password</h3><form id="prod-password-form"><label class="d" for="old-password">Current password</label><input class="field" id="old-password" type="password" required><label class="d" for="new-password" style="display:block;margin-top:12px">New password (12–128 characters)</label><input class="field" id="new-password" type="password" minlength="12" maxlength="128" required><div class="btns"><button class="btn" type="button" onclick="closeSheet()">Cancel</button><button class="btn p">Save password</button></div></form>');
 Q('#prod-password-form').onsubmit=async e=>{e.preventDefault();try{await apiP('auth/change-password',{method:'POST',body:pack({currentPassword:Q('#old-password').value,newPassword:Q('#new-password').value})});closeSheet();notifyP('Password changed')}catch(error){notifyP(error.message)}};
}
async function signOutP(){try{await apiP('auth/logout',{method:'POST',body:pack({})})}catch{}await showLoginP()}
function mapMessageP(row){
 const m={id:row.id||'',d:row.fromMe?'o':'i',t:row.text||'',ts:Number(row.timestamp)||Date.now(),r:row.status==='read',
  mediaAvailable:row.mediaAvailable===true,mediaUnavailable:row.mediaUnavailable||'',ptt:row.ptt===true,dur:Number(row.duration)||0,reactions:Array.isArray(row.reactions)?row.reactions:[],starred:row.starred===true};
 if(row.viewOnce){
  m.k='once';m.id=row.id;m.type=row.type;m.f=row.type==='video'?'View-once video':'View-once photo';
  m.viewed=row.viewOnceViewed===true;m.unavailable=row.mediaUnavailable||'';
 }else if(['image','sticker'].includes(row.type)){m.k='img';m.u=row.mediaUrl||'';m.f=row.fileName||'Image'}
 else if(row.type==='video'){m.k='vid';m.u=row.mediaUrl||'';m.f=row.fileName||'Video'}
 else if(row.type==='audio'){m.k='vn';m.u=row.mediaUrl||'';m.f=row.fileName||'Audio'}
 else if(row.type==='document'){m.f=row.fileName||'Attachment';m.z=fsz(row.size||0);m.dl=row.mediaUrl||''}
 if(row.pushName)m.s=row.pushName;return m;
}
window.openViewOnceP=async function(index){
 const message=CH[S.chat]?.m?.[index];
 if(!message||message.k!=='once'||message.viewed||message.loading||message.unavailable)return;
 message.loading=true;drawMsgs();
 const account=S.cacc==='private'?'private':'public';
 const endpoint=API+'/chats/'+account+'/media/'+encodeURIComponent(message.id)+'/view-once';
 try{
  const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{Accept:'image/*,video/*'}});
  if(!response.ok){
   const error=await response.json().catch(()=>({}));
   if(response.status===410)message.viewed=true;
   throw new Error(error.error||'This view-once media could not be opened.');
  }
  // The server has now consumed its copy. Never retry or retain this item
  // in the regular message attachment list.
  message.viewed=true;message.loading=false;drawMsgs();
  const blob=await response.blob();
  if(!blob.size)throw new Error('The view-once media was empty.');
  const url=URL.createObjectURL(blob);
  if(typeof window.showViewOnceMedia==='function'){
   window.showViewOnceMedia({name:message.f,k:message.type==='video'?'vid':'img',url,size:blob.size});
  }else URL.revokeObjectURL(url);
 }catch(error){
  message.loading=false;drawMsgs();notifyP(error.message);
 }
};
let visibilityDraftP=null, visibilityChatsDraftP=[];
function visibilityModeP(filter){return filter?.mode==='selected'?'selected':'all'}
function visibilityValueP(filter,jid){const override=(filter?.overrides||[]).find(x=>x.jid===jid);return override?override.visible===true:visibilityModeP(filter)==='all'}
function setVisibilityValueP(filter,jid,visible){filter.overrides=Array.isArray(filter.overrides)?filter.overrides.filter(x=>x.jid!==jid):[];const base=visibilityModeP(filter)==='all';if(visible!==base)filter.overrides.push({jid,visible})}
async function openChatVisibilityP(){
 const account=S.cacc==='private'?'private':'public';
 try{const result=await apiP('chats/'+account+'/visibility');P.visibility=JSON.parse(JSON.stringify(result.visibility||{}));P.visibilityChats=result.chats||[];visibilityDraftP=JSON.parse(JSON.stringify(P.visibility));visibilityChatsDraftP=P.visibilityChats.slice();drawChatVisibilityP(account,'')}
 catch(error){notifyP(error.message)}
}
function drawChatVisibilityP(account,search){
 const label=account==='private'?'Private':'Public';
 const individual=visibilityDraftP.individuals||(visibilityDraftP.individuals={mode:'all',overrides:[]});
 const groups=visibilityDraftP.groups||(visibilityDraftP.groups={mode:'all',overrides:[]});
 const phrase=String(search||'').toLowerCase();
 const matches=visibilityChatsDraftP.filter(chat=>(String(chat.name||'')+' '+String(chat.jid||'')).toLowerCase().includes(phrase));
 const counts={individuals:{shown:0,total:0},groups:{shown:0,total:0}};
 visibilityChatsDraftP.forEach(chat=>{const kind=chat.kind==='groups'?'groups':'individuals';counts[kind].total++;if(visibilityValueP(kind==='groups'?groups:individual,chat.jid))counts[kind].shown++});
 const modeControl=(kind,title,filter)=>'<div class="env"><div class="t">'+title+'</div><div class="d" style="white-space:normal;margin:3px 0 9px">'+counts[kind].shown+' of '+counts[kind].total+' known chats shown</div><div class="seg"><button type="button" data-vis-mode="'+kind+':all" class="'+(visibilityModeP(filter)==='all'?'on':'')+'">Show all</button><button type="button" data-vis-mode="'+kind+':selected" class="'+(visibilityModeP(filter)==='selected'?'on':'')+'">Only selected</button></div></div>';
 const list=matches.length?matches.map(chat=>{
  const kind=chat.kind==='groups'?'groups':'individuals',filter=kind==='groups'?groups:individual,visible=visibilityValueP(filter,chat.jid);
  const title=kind==='groups'?'Group · '+String(chat.jid).split('@')[0].slice(-8):(chat.name||chat.jid);
  return '<label class="row" style="display:flex;align-items:center;gap:12px"><span class="av '+(kind==='groups'?'grp':'')+'">'+(kind==='groups'?ico('grp'):escP(String(chat.name||'?').trim().charAt(0).toUpperCase()))+'</span><span class="grow" style="min-width:0"><span class="t" style="display:block">'+escP(title)+'</span><span class="d" style="display:block">'+(kind==='groups'?'Group chat':escP(chat.jid))+'</span></span><input class="ck" type="checkbox" data-vis-jid="'+escP(chat.jid)+'" data-vis-kind="'+kind+'" '+(visible?'checked':'')+' aria-label="Show '+escP(title)+'"></label>';
 }).join(''):'<div class="empty">No known conversations match. New chats appear here after Aharane receives a message.</div>';
 sheet('<h3>Chat visibility · '+label+'</h3><p class="sub">Choose which conversations appear in this account’s Chats tab. These settings do not grant command access.</p><h2 style="margin-top:12px">Individual chats</h2>'+modeControl('individuals','Individual chats',individual)+'<h2 style="margin-top:16px">Group chats</h2>'+modeControl('groups','Group conversations',groups)+'<h2 style="margin-top:16px">Choose conversations</h2><input class="field" id="vis-search" placeholder="Find a chat by name or number" value="'+escP(search)+'"><div class="card list" style="margin-top:10px">'+list+'</div><p class="d" style="white-space:normal;margin:12px 2px">Checked chats are visible. Uncheck a chat to hide it. Hidden chats remain available here so you can show them again later.</p><div class="btns"><button type="button" class="btn" id="vis-cancel">Cancel</button><button type="button" class="btn p" id="vis-save">Save visibility</button></div>');
 const searchInput=Q('#vis-search');if(searchInput)searchInput.oninput=()=>drawChatVisibilityP(account,searchInput.value);
 document.querySelectorAll('[data-vis-mode]').forEach(button=>button.onclick=()=>{const parts=button.dataset.visMode.split(':');(parts[0]==='groups'?groups:individual).mode=parts[1];drawChatVisibilityP(account,Q('#vis-search')?.value||search)});
 document.querySelectorAll('[data-vis-jid]').forEach(input=>input.onchange=()=>{setVisibilityValueP(input.dataset.visKind==='groups'?groups:individual,input.dataset.visJid,input.checked);drawChatVisibilityP(account,Q('#vis-search')?.value||search)});
 const cancel=Q('#vis-cancel');if(cancel)cancel.onclick=closeSheet;
 const save=Q('#vis-save');if(save)save.onclick=async()=>{save.disabled=true;save.textContent='Saving…';try{const response=await apiP('chats/'+account+'/visibility',{method:'PUT',body:pack({visibility:visibilityDraftP})});P.visibility=response.visibility||visibilityDraftP;visibilityDraftP=null;visibilityChatsDraftP=[];closeSheet();await refreshChatsP();render();notifyP('Chat visibility saved')}catch(error){save.disabled=false;save.textContent='Save visibility';notifyP(error.message)}};
}

async function refreshChatsP(){
 const account=S.cacc==='private'?'private':'public',r=await apiP('chats/'+account+'?limit=500'),current=P.chatJid,prefs=r.preferences||{pinned:[],muted:[],archived:[]},pinned=new Set(prefs.pinned||[]),muted=new Set(prefs.muted||[]),archived=new Set(prefs.archived||[]);
 P.chatPreferences=prefs;
 CH.splice(0,CH.length,...(r.chats||[]).map(c=>({jid:c.jid,n:c.name||c.jid.split('@')[0],g:c.group===true||String(c.jid).endsWith('@g.us'),mem:[],un:c.unreadCount||0,pinned:pinned.has(c.jid),muted:muted.has(c.jid),archived:archived.has(c.jid),m:[{d:c.fromMe?'o':'i',t:c.lastMessage||'',ts:c.timestamp||Date.now()}]})));P.messageFingerprints.clear();
 if(current&&S.chat!==null){const i=CH.findIndex(c=>c.jid===current);if(i>=0)S.chat=i;else S.chat=null}
}
async function loadMessagesP(index=S.chat,before=0){
 const c=CH[index];if(!c?.jid)return;P.chatJid=c.jid;
 const account=S.cacc==='private'?'private':'public',url='chats/'+account+'/'+encodeURIComponent(c.jid)+'/messages?limit=500'+(before?'&before='+encodeURIComponent(before):'');
 const r=await apiP(url),messages=r.messages||[],fingerprint=JSON.stringify(messages.map(m=>[m.id,m.timestamp,m.type,m.text,m.status,m.mediaUrl,m.viewOnceViewed,m.reactions,m.mediaAvailable,m.ptt]));
 const key=account+'|'+c.jid+'|'+(before||'latest');
 if(P.messageFingerprints.get(key)===fingerprint)return;
 P.messageFingerprints.set(key,fingerprint);c.m=messages.map(mapMessageP);
 if(S.chat===index)drawMsgs();
}
async function sendChatP(msg){
 const c=CH[S.chat];if(!c?.jid)throw new Error('Open a conversation first.');
 const account=S.cacc==='private'?'private':'public',base='chats/'+account+'/'+encodeURIComponent(c.jid);
 if(msg.t)await apiP(base+'/send',{method:'POST',body:pack({text:msg.t,quotedMessageId:S.rp?.ref?.id||''})});
 else if(msg.b instanceof Blob)await apiP(base+'/media',{method:'POST',body:await msg.b.arrayBuffer(),headers:{'Content-Type':'application/octet-stream','X-Media-Type':msg.b.type||'application/octet-stream','X-File-Name':encodeURIComponent(msg.f||'attachment'),'X-Voice-Note':msg.ptt?'true':'false','X-Duration-Seconds':String(msg.dur||0)}});
 else return;
 S.rp=null;if(typeof rpDraw==='function')rpDraw();
 P.messageFingerprints.delete(account+'|'+c.jid+'|latest');
 await loadMessagesP(S.chat,0);
}
async function attachLiveP(file){try{await sendChatP({b:file,f:file.name})}catch(error){notifyP(error.message)}}
function switchChatsP(){P.bulkMode=false;P.selectedMessageIds.clear();S.cacc=S.cacc==='private'?'public':'private';S.chat=null;P.chatJid='';P.chatSearchQuery='';P.chatSearchResults=[];P.chatSearchError='';P.openChatSearchResults=[];P.openChatQuery='';P.messageFingerprints.clear();refreshChatsP().then(render).catch(e=>notifyP(e.message))}
async function toggleChatPreferenceP(index,kind){
 const chat=CH[index];if(!chat?.jid)return;
 const account=S.cacc==='private'?'private':'public',field=kind==='pin'?'pinned':'muted',next=!chat[field];
 try{await apiP('chats/'+account+'/preferences',{method:'PUT',body:pack({jid:chat.jid,[field]:next})});await refreshChatsP();render();notifyP((next?'Added to ':'Removed from ')+(field==='pinned'?'pinned chats':'muted chats'))}
 catch(error){notifyP(error.message)}
}
function bindChatRowsP(){
 document.querySelectorAll('.chat-row-wrap').forEach(wrap=>{
  const row=wrap.querySelector('.row');if(!row)return;
  let startX=0,startY=0,moved=false;
  row.onpointerdown=event=>{startX=event.clientX;startY=event.clientY;moved=false};
  row.onpointerup=event=>{const dx=event.clientX-startX,dy=event.clientY-startY;if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.4){wrap.classList.toggle('swiped',dx<0);wrap.dataset.swipeHandled='1';moved=true}};
  row.onclick=()=>{if(wrap.dataset.swipeHandled==='1'){wrap.dataset.swipeHandled='0';return}if(wrap.classList.contains('swiped'))return;openChat(Number(row.dataset.c))};
 });
 document.querySelectorAll('[data-chat-pref]').forEach(button=>button.onclick=event=>{event.preventDefault();event.stopPropagation();const index=Number(button.dataset.chatIndex),kind=button.dataset.chatPref;if(kind==='archive')void toggleChatArchiveP(index);else if(kind==='unread')void markChatUnreadP(index);else void toggleChatPreferenceP(index,kind)});
}
let messageMenuOutsideP=null;
function closeMessageMenuP(){
 document.getElementById('chat-message-pop')?.remove();
 if(messageMenuOutsideP){document.removeEventListener('pointerdown',messageMenuOutsideP,true);messageMenuOutsideP=null}
}
window.openMessageMenuP=function(index,anchor){
 const message=CH[S.chat]?.m?.[index];if(!message?.id)return notifyP('This message is not available for actions.');
 closeMessageMenuP();
 const menu=document.createElement('div');menu.id='chat-message-pop';menu.className='pop chat-message-pop';menu.setAttribute('role','menu');
 menu.innerHTML='<div class="message-emoji-row">'+['❤️','👍','😂','😮','😢','🙏','🔥','🎉'].map(emoji=>'<button type="button" data-message-emoji="'+emoji+'" aria-label="React with '+emoji+'">'+emoji+'</button>').join('')+'</div>'+
  '<button type="button" data-message-action="reply">Reply</button><button type="button" data-message-action="copy">Copy</button><button type="button" data-message-action="forward">Forward</button><button type="button" data-message-action="star">'+(message.starred?'Unstar':'Star')+'</button><button type="button" data-message-action="select">Select messages</button><button type="button" data-message-action="delete" class="del">Delete</button>';
 document.body.appendChild(menu);
 const rect=anchor?.getBoundingClientRect?.()||{left:12,right:220,top:100,bottom:150};
 const width=menu.offsetWidth,height=menu.offsetHeight;
 menu.style.left=Math.max(8,Math.min(innerWidth-width-8,rect.left))+'px';
 menu.style.top=rect.bottom+height+8>innerHeight?Math.max(8,rect.top-height-8)+'px':Math.min(innerHeight-height-8,rect.bottom+6)+'px';
 menu.onclick=event=>{
  const emoji=event.target.closest('[data-message-emoji]')?.dataset.messageEmoji;
  const action=event.target.closest('[data-message-action]')?.dataset.messageAction;
  if(!emoji&&!action)return;closeMessageMenuP();
  if(emoji)void messageActionP('reaction',index,emoji);else void messageActionP(action,index);
 };
 messageMenuOutsideP=event=>{if(!event.target.closest('#chat-message-pop'))closeMessageMenuP()};
 document.addEventListener('pointerdown',messageMenuOutsideP,true);
};
async function messageActionP(action,index,emoji=''){
 const chat=CH[S.chat],message=chat?.m?.[index];if(!chat?.jid||!message?.id)return;
 if(action==='reply'){setReply(index);return}
 if(action==='select'){P.bulkMode=true;P.selectedMessageIds.add(message.id);drawMsgs();updateBulkBarP();return}
 if(action==='copy'){
  const text=message.t||message.f||({img:'Photo',vid:'Video',vn:'Voice note'}[message.k]||'Attachment');
  try{await navigator.clipboard.writeText(text);notifyP('Message copied')}catch{notifyP('Copy is not available in this browser')}
  return;
 }
 const account=S.cacc==='private'?'private':'public',base='chats/'+account+'/'+encodeURIComponent(chat.jid);
 if(action==='star'){try{const starred=!message.starred;await apiP(base+'/star',{method:'POST',body:pack({messageId:message.id,starred})});message.starred=starred;drawMsgs();notifyP(starred?'Message starred':'Message unstarred')}catch(error){notifyP(error.message)}return}
 if(action==='forward'){
  const choices=CH.map((target,i)=>'<button type="button" class="row" data-forward-target="'+i+'"><span class="av">'+escP(target.n.slice(0,1))+'</span><span class="grow"><span class="t">'+escP(target.n)+'</span><span class="d">'+(target.g?'Group':'Chat')+'</span></span></button>').join('');
  sheet('<h3>Forward to</h3><div class="card list">'+choices+'</div><div class="btns"><button class="btn" type="button" onclick="closeSheet()">Cancel</button></div>');
  Q('#sheet')?.querySelectorAll('[data-forward-target]').forEach(button=>button.onclick=async()=>{
   const target=CH[Number(button.dataset.forwardTarget)];if(!target?.jid)return;
   try{await apiP(base+'/forward',{method:'POST',body:pack({messageId:message.id,targetJid:target.jid})});closeSheet();notifyP('Message forwarded')}
   catch(error){notifyP(error.message)}
  });
  return;
 }
 if(action==='delete'){
  sheet('<h3>Delete message?</h3><p class="sub">Your own sent message is revoked for everyone when WhatsApp allows it. An incoming message is deleted for this linked account only; other participants still keep it.</p><div class="btns"><button class="btn" type="button" onclick="closeSheet()">Cancel</button><button class="btn d" id="confirm-chat-delete" type="button">Delete</button></div>');
  Q('#confirm-chat-delete').onclick=async()=>{
   try{await apiP(base+'/delete',{method:'POST',body:pack({messageId:message.id})});closeSheet();P.messageFingerprints.delete(account+'|'+chat.jid+'|latest');await loadMessagesP(S.chat,0);notifyP('Message deleted')}
   catch(error){notifyP(error.message)}
  };
  return;
 }
 if(action==='reaction'){
  try{await apiP(base+'/reaction',{method:'POST',body:pack({messageId:message.id,emoji})});P.messageFingerprints.delete(account+'|'+chat.jid+'|latest');await loadMessagesP(S.chat,0)}
  catch(error){notifyP(error.message)}
 }
}
async function downloadChatMediaP(index){
 const chat=CH[S.chat],message=chat?.m?.[index];if(!chat?.jid||!message?.id||message.loading)return;
 if(message.u)return;
 message.loading=true;drawMsgs();
 const account=S.cacc==='private'?'private':'public',endpoint='chats/'+account+'/'+encodeURIComponent(chat.jid)+'/media/'+encodeURIComponent(message.id)+'/download';
 try{await apiP(endpoint,{method:'POST',body:pack({})});P.messageFingerprints.delete(account+'|'+chat.jid+'|latest');await loadMessagesP(S.chat,0);notifyP('Media downloaded')}
 catch(error){message.loading=false;drawMsgs();notifyP(error.message)}
}
window.downloadChatMediaP=downloadChatMediaP;
function setOpenChatSearchCountP(){
 const output=Q('#chat-search-count');if(!output)return;
 const matches=P.openChatSearchResults||[],index=Number(P.openChatSearchIndex)||0;
 output.textContent=matches.length?(index+1)+' of '+matches.length:'0 matches';
}
async function focusOpenChatSearchP(index){
 const matches=P.openChatSearchResults||[];if(!matches.length)return;
 P.openChatSearchIndex=(index+matches.length)%matches.length;
 const hit=matches[P.openChatSearchIndex],chat=CH[S.chat];if(!chat)return;
 let messageIndex=chat.m.findIndex(message=>message.id===hit.id);
 if(messageIndex<0){
  const account=S.cacc==='private'?'private':'public';
  P.messageFingerprints.delete(account+'|'+chat.jid+'|'+(Number(hit.timestamp)+1));
  await loadMessagesP(S.chat,Number(hit.timestamp)+1);
  messageIndex=chat.m.findIndex(message=>message.id===hit.id);
 }
 document.querySelectorAll('#msgs .chat-search-hit,#msgs .chat-search-hit-current').forEach(node=>node.classList.remove('chat-search-hit','chat-search-hit-current'));
 const target=Q('#msgs .b[data-i="'+messageIndex+'"]');
 if(target){target.classList.add('chat-search-hit-current');target.scrollIntoView({block:'center',behavior:'smooth'})}
 setOpenChatSearchCountP();
}
function scheduleOpenChatSearchP(value){
 const query=String(value||'').trim(),chat=CH[S.chat];P.openChatQuery=query;P.openChatSearchResults=[];P.openChatSearchIndex=0;setOpenChatSearchCountP();
 if(P.openChatSearchTimer)clearTimeout(P.openChatSearchTimer);
 if(query.length<2)return;
 P.openChatSearchTimer=setTimeout(async()=>{
  if(S.chat===null||P.openChatQuery!==query)return;
  const account=S.cacc==='private'?'private':'public',current=CH[S.chat];
  try{
   const response=await apiP('chats/'+account+'/'+encodeURIComponent(current.jid)+'/search?q='+encodeURIComponent(query)+'&limit=100');
   if(P.openChatQuery!==query||S.chat===null||CH[S.chat]?.jid!==current.jid)return;
   P.openChatSearchResults=response.results||[];P.openChatSearchIndex=0;setOpenChatSearchCountP();
   if(P.openChatSearchResults.length)await focusOpenChatSearchP(0);
  }catch(error){notifyP(error.message)}
 },350);
}
function bindConversationSearchP(){
 const toggle=Q('#chat-search-toggle'),bar=Q('#chat-searchbar'),input=Q('#chat-search-input');
 if(toggle)toggle.onclick=()=>{if(!bar)return;bar.hidden=!bar.hidden;if(!bar.hidden)input?.focus()};
 if(input)input.oninput=()=>scheduleOpenChatSearchP(input.value);
 if(input)input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void focusOpenChatSearchP((Number(P.openChatSearchIndex)||0)+1)}};
 const previous=Q('#chat-search-prev'),next=Q('#chat-search-next'),close=Q('#chat-search-close');
 if(previous)previous.onclick=()=>void focusOpenChatSearchP((Number(P.openChatSearchIndex)||0)-1);
 if(next)next.onclick=()=>void focusOpenChatSearchP((Number(P.openChatSearchIndex)||0)+1);
 if(close)close.onclick=()=>{if(bar)bar.hidden=true;if(input)input.value='';scheduleOpenChatSearchP('');document.querySelectorAll('#msgs .chat-search-hit,#msgs .chat-search-hit-current').forEach(node=>node.classList.remove('chat-search-hit','chat-search-hit-current'))};
}
function preserveChatScrollDrawP(){
 const el=Q('#msgs'),top=el?.scrollTop||0,wasNearBottom=el?el.scrollHeight-el.scrollTop-el.clientHeight<120:true;
 drawMsgsBaseP();
 if(el&&!wasNearBottom){el.scrollTop=top;Q('#jump')?.classList.add('on')}
}
function renderKeepingChatSearchP(){
 const old=Q('#cq'),focused=old===document.activeElement,start=old?.selectionStart,end=old?.selectionEnd;
 render();
 if(focused){const next=Q('#cq');if(next){next.focus({preventScroll:true});try{next.setSelectionRange(start,end)}catch{}}}
}
function chatSearchPanelP(){
 const query=P.chatSearchQuery;
 if(!query)return '';
 let body='';
 if(query.length<2)body='<div class="empty">Type at least two characters to search saved messages.</div>';
 else if(P.chatSearchLoading)body='<div class="empty">Searching message history…</div>';
 else if(P.chatSearchError)body='<div class="empty">Search unavailable: '+escP(P.chatSearchError)+'</div>';
 else if(!P.chatSearchResults.length)body='<div class="empty">No stored messages match “'+escP(query)+'”. Search includes older saved messages, not only the latest preview.</div>';
 else body=P.chatSearchResults.map(hit=>'<button class="row" data-search-jid="'+escP(hit.jid)+'" data-search-before="'+escP(String(Number(hit.timestamp||0)+1))+'"><span class="av '+(String(hit.jid).endsWith('@g.us')?'grp':'')+'">'+(String(hit.jid).endsWith('@g.us')?ico('grp'):escP(String(hit.pushName||hit.jid).charAt(0).toUpperCase()))+'</span><span class="grow"><span class="t" style="display:block">'+escP(hit.pushName||hit.jid)+'</span><span class="d" style="display:block;white-space:normal">'+escP(hit.text||hit.fileName||('Attachment · '+hit.type))+'</span></span><span class="d">'+rel(hit.timestamp)+'</span></button>').join('');
 return '<div style="margin:0 0 14px"><div class="d" style="margin:0 2px 6px">Message matches</div><div class="card list">'+body+'</div></div>';
}
function updateChatSearchPanelP(){
 const target=Q('#chat-search-results');if(!target)return;
 target.innerHTML=chatSearchPanelP();
 target.querySelectorAll('[data-search-jid]').forEach(button=>button.onclick=()=>openChatSearchHitP(button.dataset.searchJid,button.dataset.searchBefore).catch(error=>notifyP(error.message)));
}
function scheduleChatSearchP(value){
 const query=String(value||'').trim();P.chatSearchQuery=query;P.chatSearchResults=[];P.chatSearchError='';P.chatSearchLoading=query.length>=2;
 if(P.chatSearchTimer)clearTimeout(P.chatSearchTimer);
 updateChatSearchPanelP();
 if(query.length<2)return;
 P.chatSearchTimer=setTimeout(async()=>{
  const account=S.cacc==='private'?'private':'public';
  try{
   const result=await apiP('chats/'+account+'/search?q='+encodeURIComponent(query)+'&limit=60');
   if(P.chatSearchQuery!==query||S.cacc!==account)return;
   P.chatSearchResults=result.results||[];P.chatSearchLoading=false;updateChatSearchPanelP();
  }catch(error){
   if(P.chatSearchQuery!==query)return;
   P.chatSearchError=error.message;P.chatSearchLoading=false;updateChatSearchPanelP();
  }
 },400);
}
async function openChatSearchHitP(jid,before){
 let index=CH.findIndex(c=>c.jid===jid);
 if(index<0){await refreshChatsP();index=CH.findIndex(c=>c.jid===jid)}
 if(index<0)return notifyP('That conversation is no longer visible.');
 openChatBase(index);
 const account=S.cacc==='private'?'private':'public';
 P.messageFingerprints.delete(account+'|'+jid+'|'+(Number(before)||'latest'));
 await loadMessagesP(index,Number(before)||0);
}
async function accountActionP(id,action){try{await apiP('accounts/'+id+'/'+action,{method:'POST',body:pack({})});await refreshRuntimeP();render();notifyP('Account '+action+' requested')}catch(error){notifyP(error.message)}}
function bindProductionP(){
 const exportSource=Q('#export-bot-source');if(exportSource)exportSource.onclick=()=>exportBotSourceP(exportSource);
 document.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{const name=b.dataset.open;if(typeof node(S.path)[name]==='object'){S.path.push(name);S.sel={};try{await loadTreeP(currentPathP())}catch(e){notifyP(e.message)}render()}else openLiveFileP(name).catch(e=>notifyP(e.message))});
 document.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>fileMenuP(b.dataset.m,b));
 document.querySelectorAll('[data-package]').forEach(b=>b.onclick=()=>packageMenuP(b.dataset.package,b));
 document.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{const wrap=b.closest('.chat-row-wrap');if(wrap?.dataset.swipeHandled==='1'){wrap.dataset.swipeHandled='0';return}if(wrap?.classList.contains('swiped'))return;openChat(+b.dataset.c)});
 document.querySelectorAll('[data-pair-account]').forEach(b=>b.onclick=()=>openPair(b.dataset.pairAccount==='private'?0:1));
 document.querySelectorAll('[data-account]').forEach(b=>b.onclick=()=>accountActionP(b.dataset.account,b.dataset.action));
 const owner=Q('#save-owners');if(owner)owner.onclick=saveOwnersP;
 const env=Q('#prod-save-env');if(env)env.onclick=saveEnvP;
 const saveConfig=Q('#csv');if(saveConfig)saveConfig.onclick=saveConfigP;
 document.querySelectorAll('[data-e]').forEach(input=>input.oninput=()=>{const row=envs[Number(input.dataset.e)];if(row&&!row.readOnly){row.v=input.value;envDirty=true}});
 const fileEditor=Q('#ed');if(fileEditor){
  const editorPath=S.cur;
  fileEditor.oninput=()=>{
   const [directory,name]=getFile(editorPath);directory[name]=fileEditor.value;
   const count=Q('#ec');if(count)count.textContent=fileEditor.value.split('\n').length+' lines';
   scheduleFileAutosaveP(editorPath,fileEditor.value);
  };
  fileEditor.onblur=()=>{void flushFileAutosaveP(editorPath)};
 }
 const save=Q('#prod-file-save');if(save)save.onclick=saveLiveFileP;
 const discard=Q('#prod-discard-files');if(discard)discard.onclick=discardFilesP;
 const discardStale=Q('#prod-discard-stale-files');if(discardStale)discardStale.onclick=discardFilesP;
 const recover=Q('#prod-recover-files');if(recover)recover.onclick=recoverFilesP;
 const restoreDevice=Q('#prod-restore-device-draft');if(restoreDevice)restoreDevice.onclick=restoreDeviceDraftP;
 const keepServer=Q('#prod-keep-server-version');if(keepServer)keepServer.onclick=keepServerFileP;
 const down=Q('#prod-file-download');if(down)down.onclick=()=>downloadSourceFileP(S.cur,S.cur.split('/').pop()).catch(e=>notifyP(e.message));
 const upload=Q('#upl');if(upload)upload.onchange=async e=>{
  const files=[...e.target.files];e.target.value='';
  for(const file of files){
   try{
    if(/\.zip$/i.test(file.name)){
     const result=await uploadZipP(file);notifyP('Validated '+file.name+' ('+result.fileCount+' files)');
    }else{
     if(!/\.(js|mjs|cjs|json|md|html|css|txt|yml|yaml)$/i.test(file.name))throw new Error('Only approved source and text files can be uploaded.');
     await apiP('files',{method:'POST',body:pack({parentPath:currentPathP(),name:file.name,type:'file',content:await file.text()})});
     notifyP('Uploaded '+file.name);
    }
   }catch(error){notifyP(error.message)}
  }
  try{await loadTreeP(currentPathP());P.packages=await loadPackagesP();P.packageError='';P.filesError='';render()}
  catch(error){P.packageError=error.message;notifyP(error.message)}
 };
 const search=Q('#cq');if(search)search.oninput=()=>{S.cq=search.value;scheduleChatSearchP(search.value)};
 const swap=Q('#chsw');if(swap)swap.onclick=switchChatsP;
 const visibility=Q('#chat-visibility');if(visibility)visibility.onclick=()=>openChatVisibilityP();
 const pair=Q('#prod-pair-code');if(pair)pair.onclick=getPairCodeP;
 const qr=Q('#prod-qr-request');if(qr)qr.onclick=requestQrP;
 const cancelPair=Q('#prod-cancel-pairing');if(cancelPair)cancelPair.onclick=cancelPairingP;
 const pairBack=Q('#prod-pair-back');if(pairBack)pairBack.onclick=()=>{void cancelPairingP();S.sub=null;render()};
 const repair=Q('#prod-pair-repair');if(repair)repair.onclick=repairPairP;
 const reconnect=Q('#prod-pair-reconnect');if(reconnect)reconnect.onclick=reconnectPairP;
 const openConfig=Q('#pair-open-config');if(openConfig)openConfig.onclick=()=>{
  S.cprof=S.pi===1?'public':'private';C=CS[S.cprof];
  C.owner=S.cprof==='private'?(P.owners.ownerNumber||P.owners.privateOwnerNumber||''):(P.owners.publicBotNumber||'');C.prefix=S.cprof==='private'?'.':'!';
  C0=JSON.stringify(C);C0S[S.cprof]=C0;cfgD=false;DS[S.cprof]=false;openCfg();
 };
 const copy=Q('#prod-copy-code');if(copy)copy.onclick=()=>navigator.clipboard?.writeText(S.pin||'').then(()=>notifyP('Pairing code copied')).catch(()=>notifyP('Select and copy the code'));
 document.querySelectorAll('[data-pm]').forEach(b=>b.onclick=()=>{
  void cancelPairingP();
  S.pm=b.dataset.pm;S.pin=null;S.qrRequested=false;render();
 });
 const clear=Q('#lcl');if(clear)clear.onclick=clearActivityP;
 const starred=Q('#chat-starred');if(starred)starred.onclick=()=>openStarredMessagesP();
 const appearanceList=Q('#chat-appearance-list');if(appearanceList)appearanceList.onclick=()=>openChatAppearanceP();
 if(S.chat!==null){ensureChatToolsP();updateBulkBarP()}
 const source=Q('#open-app-source');if(source)source.onclick=()=>openAppSourceP('index.html');
 const localSource=Q('#offline-open-source');if(localSource)localSource.onclick=()=>openAppSourceP('index.html');
 const backSource=Q('#back-from-app-source');if(backSource)backSource.onclick=()=>{S.sub=null;render()};
 document.querySelectorAll('[data-app-source]').forEach(b=>b.onclick=()=>openAppSourceP(b.dataset.appSource));
 const editor=Q('#app-source-editor');if(editor)editor.oninput=()=>{P.appSourceDirty=true;const status=Q('#app-source-status');if(status)status.textContent='Unsaved changes'};
 const saveSource=Q('#save-app-source');if(saveSource)saveSource.onclick=saveAppSourceP;
 const downloadSource=Q('#download-app-source');if(downloadSource)downloadSource.onclick=()=>downloadP(P.appSourcePath,new Blob([Q('#app-source-editor')?.value||''],{type:'text/plain'}));
 const resetSource=Q('#reset-app-source');if(resetSource)resetSource.onclick=resetAppSourceP;
 const change=Q('#change-password');if(change)change.onclick=changePasswordP;
 const logout=Q('#sign-out');if(logout)logout.onclick=signOutP;
 const apply=Q('#prod-apply-files');if(apply)apply.onclick=applyFilesP;
 const retryPackages=Q('#prod-retry-packages');if(retryPackages)retryPackages.onclick=async()=>{retryPackages.disabled=true;try{P.packages=await loadPackagesP();P.packageError='';render()}catch(error){P.packageError=error.message;notifyP(error.message)}finally{retryPackages.disabled=false}};
 const retryFiles=Q('#prod-retry-files');if(retryFiles)retryFiles.onclick=async()=>{try{await loadTreeP(currentPathP());P.filesError='';render()}catch(error){P.filesError=error.message;notifyP(error.message)}};
 if(!(Q('#prod-qr-panel')&&S.sub==='pair')&&P.qrTimer){clearInterval(P.qrTimer);P.qrTimer=null}
 if(S.tab==='files'&&S.path[0]==='updates'&&!P.packagesLoading){
  P.packagesLoading=true;
  loadPackagesP().then(x=>{P.packages=x;P.packageError='';if(S.tab==='files'&&S.path[0]==='updates')render()}).catch(()=>{}).finally(()=>{P.packagesLoading=false});
 }
 if(S.tab==='chats'&&!P.chatLoaded){
  refreshChatsP().then(()=>{P.chatLoaded=true;if(S.tab==='chats')render()}).catch(error=>{P.chatLoaded=false;notifyP(error.message)});
 }
 if(S.tab==='chats'&&!P.chatTimer)P.chatTimer=setInterval(async()=>{
  if(document.hidden||P.chatRefreshBusy)return;
  P.chatRefreshBusy=true;
  try{
   if(S.chat!==null)await loadMessagesP(S.chat);
   else if(!Q('#cq')||document.activeElement!==Q('#cq')){
    await refreshChatsP();
    if(S.tab==='chats'&&!P.chatSearchQuery)render();
   }
  }catch{}
  finally{P.chatRefreshBusy=false}
 },15000);
 if(S.tab==='chats')bindChatRowsP();
 if(S.chat!==null)bindConversationSearchP();
 if(S.tab!=='chats'&&P.chatTimer){clearInterval(P.chatTimer);P.chatTimer=null}
}
function homeViewP(){
 const accounts=['private','public'].map(id=>{
  const a=P.runtime?.accounts?.[id]||{},name=id==='private'?'Private WhatsApp':'Public WhatsApp';
  const state=a.connected?'Connected':['needs-pairing','reconnect-exhausted'].includes(a.state)?'Needs re-pairing':a.registered?'Paired · offline':'Not paired';
  const tone=a.connected?'':(a.state==='needs-pairing'?'off':'warn');
  let action='';
  if(a.connected)action='<button class="btn sm" data-pair-account="'+id+'">Manage</button><button class="btn sm" data-account="'+id+'" data-action="stop">Stop</button>';
  else if(a.state==='needs-pairing')action='<button class="btn sm d" data-pair-account="'+id+'">Re-pair</button>';
  else if(a.registered)action='<button class="btn sm p" data-account="'+id+'" data-action="reconnect">Reconnect</button>';
  else action='<button class="btn sm p" data-pair-account="'+id+'">Link account</button>';
  return '<div class="row"><span class="av">'+(id==='private'?'P':'A')+'<i class="st av-dot '+(a.connected?'':'off')+'"></i></span><span class="grow"><div class="t">'+name+'</div><div class="d">'+escP(state)+'</div></span><span class="btns" style="margin:0;gap:6px;flex-wrap:wrap">'+action+'</span></div>';
 }).join('');
 const serviceOnline=Boolean(P.runtime)&&!P.offline;
 const service=serviceOnline?'Connected to Aharane service':'Service unavailable';
 const owner=P.owners.ownerNumber||P.owners.privateOwnerNumber||P.owners.publicOwnerNumber;
 const ownerStatus=owner?'Configured':'Needs configuration';
 const publicBot=P.owners.publicBotNumber?'Configured':'Needs configuration';
 return '<h1>Welcome back</h1><p class="sub">Your Aharane workspace.</p><div class="card" style="padding:16px"><div class="row" style="padding:4px 0"><span class="grow"><div class="t">Aharane service</div><div class="d">'+service+'</div></span><span class="pill '+(serviceOnline?'':'off')+'"><span class="dot"></span>'+(serviceOnline?'Online':'Offline')+'</span></div><div class="d" style="white-space:normal;margin-top:8px">Private and Public are independent WhatsApp sessions. An offline account does not stop the other one.</div></div><h2>WhatsApp accounts</h2><div class="card list">'+accounts+'</div><h2>Setup</h2><div class="card list"><button class="row" onclick="openCfg()"><span class="ic">'+ico('cfg')+'</span><span class="grow"><div class="t">Configuration</div><div class="d" style="white-space:normal;line-height:1.4">Shared Owner · '+ownerStatus+' · Public bot number · '+publicBot+'</div></span><span class="d">›</span></button></div><h2>Recent activity</h2><div class="card log" id="log">'+(logs.length?logs.map(l=>'<div><b>'+escP(l[1]||'now')+'</b>  '+escP(l[0])+'</div>').join(''):'<div class="d" style="padding:12px">No recent activity yet.</div>')+'</div>';
}

function installFileSaveLifecycleP(){
 if(window.__aharaneFileSaveLifecycle)return;
 window.__aharaneFileSaveLifecycle=true;
 window.addEventListener('online',()=>{void flushAllFileAutosavesP()});
 window.addEventListener('pagehide',()=>{void flushAllFileAutosavesP()});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void flushAllFileAutosavesP()});
 window.addEventListener('offline',()=>{
  for(const path of fileAutosaveQueuedP.keys())setFileEditorStatusP(path,'Offline · draft saved on this device');
 });
}

const CHAT_APPEARANCE_DEFAULTS_P = {
 theme:'system',wallpaper:'default',incomingBubble:'#ffffff',outgoingBubble:'#d9f4e5',
 textScale:100,bubbleRadius:18,messageSpacing:'comfortable',chatDensity:'comfortable',
 showTimestamps:true,showPreviews:true,showAvatars:true,reduceMotion:false,largerText:false,customWallpaperMime:''
};
let appearanceDraftP=null;
function applyChatAppearanceP(value){
 const a={...CHAT_APPEARANCE_DEFAULTS_P,...(value||{})},root=document.documentElement,chat=Q('#chat'),msgs=Q('#msgs');
 P.chatAppearance=a;
 if(a.theme==='system')root.removeAttribute('data-theme');else root.setAttribute('data-theme',a.theme);
 root.style.setProperty('--chat-incoming',a.incomingBubble);
 root.style.setProperty('--chat-outgoing',a.outgoingBubble);
 root.style.setProperty('--chat-text-scale',(Number(a.textScale)||100)+'%');
 root.style.setProperty('--chat-bubble-radius',(Number(a.bubbleRadius)||18)+'px');
 root.style.setProperty('--chat-message-gap',a.messageSpacing==='compact'?'3px':a.messageSpacing==='spacious'?'11px':'6px');
 root.style.setProperty('--chat-row-height',a.chatDensity==='compact'?'58px':'72px');
 root.dataset.chatLargerText=a.largerText?'true':'false';
 root.dataset.chatReducedMotion=a.reduceMotion?'true':'false';
 root.dataset.chatShowPreviews=a.showPreviews?'true':'false';
 root.dataset.chatShowAvatars=a.showAvatars?'true':'false';
 root.dataset.chatShowTimestamps=a.showTimestamps?'true':'false';
 if(chat){
  chat.dataset.showTimestamps=a.showTimestamps?'true':'false';
  chat.dataset.showPreviews=a.showPreviews?'true':'false';
  chat.dataset.showAvatars=a.showAvatars?'true':'false';
 }
 if(msgs){
  const backgrounds={
   default:'none',
   sage:'linear-gradient(145deg,#e6eee8,#f1f4ef)',
   sand:'linear-gradient(145deg,#f3eadc,#f8f4ec)',
   slate:'linear-gradient(145deg,#e5e9ed,#f2f4f6)',
   lavender:'linear-gradient(145deg,#ece8f3,#f6f3fa)',
   dots:'radial-gradient(circle,#8b9b91 1px,transparent 1.5px)',
   grid:'linear-gradient(#a1aea5 1px,transparent 1px),linear-gradient(90deg,#a1aea5 1px,transparent 1px)',
   custom:'none'
  };
  msgs.style.backgroundColor=a.wallpaper==='default'?'var(--bg)':a.wallpaper==='sage'?'#eef3ef':a.wallpaper==='sand'?'#f6f0e5':a.wallpaper==='slate'?'#edf0f3':a.wallpaper==='lavender'?'#f1edf7':'#edf1ed';
  msgs.style.backgroundImage=a.wallpaper==='custom'?'url("'+API+'/chat-appearance/wallpaper?v='+encodeURIComponent(P.chatAppearanceVersion||'1')+'")':(backgrounds[a.wallpaper]||'none');
  msgs.style.backgroundSize=a.wallpaper==='dots'?'18px 18px':a.wallpaper==='grid'?'22px 22px,22px 22px':a.wallpaper==='custom'?'cover':'auto';
  msgs.style.backgroundPosition='center';
  msgs.style.backgroundAttachment='local';
 }
}
function appearanceOptionsP(){
 const a=appearanceDraftP||{...CHAT_APPEARANCE_DEFAULTS_P};
 const choices=(field,items)=>'<div class="appearance-choices">'+items.map(([value,label])=>'<button type="button" class="appearance-choice '+(a[field]===value?'on':'')+'" data-app-choice="'+field+'" data-value="'+value+'">'+label+'</button>').join('')+'</div>';
 const toggle=(field,label,description)=>'<label class="appearance-toggle"><span><b>'+label+'</b><small>'+description+'</small></span><input type="checkbox" data-app-input="'+field+'" '+(a[field]?'checked':'')+'></label>';
 sheet('<div class="appearance-sheet-body"><div class="appearance-head"><div><h3>Chat appearance</h3><p class="sub">Changes apply across Private and Public chat views.</p></div></div>'+
 '<h4>Theme</h4>'+choices('theme',[['system','System'],['light','Light'],['dark','Dark']])+
 '<h4>Chat wallpaper</h4>'+choices('wallpaper',[['default','Default'],['sage','Sage'],['sand','Sand'],['slate','Slate'],['lavender','Lavender'],['dots','Dots'],['grid','Grid'],['custom','Custom']])+
 '<div class="appearance-inline"><button class="btn sm" type="button" data-app-action="upload">Choose image</button><button class="btn sm" type="button" data-app-action="clear-wallpaper">Remove custom image</button><input type="file" id="appearance-upload" accept="image/jpeg,image/png,image/webp" hidden></div>'+
 '<h4>Message bubbles</h4><div class="appearance-colours"><label>Incoming <input type="color" data-app-input="incomingBubble" value="'+escP(a.incomingBubble)+'"></label><label>Outgoing <input type="color" data-app-input="outgoingBubble" value="'+escP(a.outgoingBubble)+'"></label></div>'+
 '<label class="appearance-range"><span>Text size <b data-app-value="textScale">'+Number(a.textScale)+'%</b></span><input type="range" min="80" max="130" step="5" data-app-input="textScale" value="'+Number(a.textScale)+'"></label>'+
 '<label class="appearance-range"><span>Bubble roundness <b data-app-value="bubbleRadius">'+Number(a.bubbleRadius)+' px</b></span><input type="range" min="8" max="28" step="2" data-app-input="bubbleRadius" value="'+Number(a.bubbleRadius)+'"></label>'+
 '<h4>Message spacing</h4>'+choices('messageSpacing',[['compact','Compact'],['comfortable','Comfortable'],['spacious','Spacious']])+
 '<h4>Chat list</h4>'+choices('chatDensity',[['compact','Compact'],['comfortable','Comfortable']])+
 toggle('showTimestamps','Show message times','Display the time under each message')+
 toggle('showPreviews','Show message previews','Show the latest message in the chat list')+
 toggle('showAvatars','Show profile pictures','Keep contact and group avatars visible')+
 toggle('largerText','Larger interface text','Increase text size across the chat view')+
 toggle('reduceMotion','Reduce motion','Use fewer movement and transition effects')+
 '<div class="appearance-preview"><div class="d">Preview</div><div class="appearance-preview-bubble">Incoming message</div><div class="appearance-preview-bubble outgoing">Your message</div></div>'+
 '<div class="btns"><button class="btn" type="button" data-app-action="reset">Reset</button><span class="grow"></span><button class="btn" type="button" data-app-action="cancel">Cancel</button><button class="btn p" type="button" data-app-action="save">Save</button></div></div>');
 const root=Q('#sheet');root?.classList.add('appearance-sheet');
 root?.querySelectorAll('[data-app-choice]').forEach(button=>button.onclick=()=>{
  appearanceDraftP[button.dataset.appChoice]=button.dataset.value;applyChatAppearanceP(appearanceDraftP);appearanceOptionsP();
 });
 root.oninput=event=>{
  const input=event.target.closest('[data-app-input]');if(!input)return;
  const key=input.dataset.appInput;
  appearanceDraftP[key]=input.type==='checkbox'?input.checked:(input.type==='range'?Number(input.value):input.value);
  applyChatAppearanceP(appearanceDraftP);
  const display=root.querySelector('[data-app-value="'+key+'"]');if(display)display.textContent=key==='textScale'?input.value+'%':input.value+' px';
 };
 root?.querySelectorAll('[data-app-action]').forEach(button=>button.onclick=async()=>{
  const action=button.dataset.appAction;
  if(action==='upload'){Q('#appearance-upload')?.click();return}
  if(action==='cancel'){appearanceDraftP=null;applyChatAppearanceP(P.chatAppearance);closeSheet();return}
  if(action==='reset'){appearanceDraftP={...CHAT_APPEARANCE_DEFAULTS_P};applyChatAppearanceP(appearanceDraftP);appearanceOptionsP();return}
  if(action==='clear-wallpaper'){
   try{const r=await apiP('chat-appearance/wallpaper',{method:'DELETE'});appearanceDraftP=r.appearance||{...appearanceDraftP,wallpaper:'default'};P.chatAppearanceVersion=Date.now();applyChatAppearanceP(appearanceDraftP);appearanceOptionsP();notifyP('Custom wallpaper removed')}
   catch(error){notifyP(error.message)}return;
  }
  if(action==='save'){
   button.disabled=true;button.textContent='Saving…';
   try{const r=await apiP('chat-appearance',{method:'PUT',body:pack({appearance:appearanceDraftP})});appearanceDraftP=r.appearance;P.chatAppearance=r.appearance;P.chatAppearanceVersion=Date.now();applyChatAppearanceP(r.appearance);appearanceDraftP=null;root.classList.remove('appearance-sheet');closeSheet();notifyP('Chat appearance saved')}
   catch(error){button.disabled=false;button.textContent='Save';notifyP(error.message)}
  }
 });
 const upload=Q('#appearance-upload');if(upload)upload.onchange=async()=>{
  const file=upload.files?.[0];upload.value='';if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024){notifyP('Choose a JPG, PNG or WebP image up to 2 MB.');return}
  try{const r=await apiP('chat-appearance/wallpaper',{method:'POST',body:file,headers:{'Content-Type':file.type}});appearanceDraftP=r.appearance||appearanceDraftP;P.chatAppearanceVersion=Date.now();applyChatAppearanceP(appearanceDraftP);appearanceOptionsP();notifyP('Wallpaper image saved')}
  catch(error){notifyP(error.message)}
 };
}
async function loadChatAppearanceP(){
 try{const r=await apiP('chat-appearance');P.chatAppearance={...CHAT_APPEARANCE_DEFAULTS_P,...(r.appearance||{})};P.chatAppearanceVersion=Date.now();applyChatAppearanceP(P.chatAppearance);return P.chatAppearance}
 catch(error){notifyP(error.message);return null}
}
async function openChatAppearanceP(){
 const loaded=await loadChatAppearanceP();if(!loaded)return;
 appearanceDraftP={...loaded};appearanceOptionsP();
}
function ensureChatToolsP(){
 const header=Q('.ch');if(!header)return;
 const search=Q('#chat-search-toggle');
 const tools=[
  ['chat-info-action','Chat information','<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>'],
  ['chat-gallery-action','Shared media','<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/>'],
  ['chat-appearance-action','Chat appearance','<path d="M12 3a9 9 0 100 18h1a2 2 0 001.5-3.3 1.5 1.5 0 011.1-2.5H17a4 4 0 004-4c0-4.5-4-8.2-9-8.2z"/><circle cx="7.5" cy="10" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16.5" cy="10" r="1"/>']
 ];
 for(const [id,label,path] of tools)if(!Q('#'+id)){
  const b=document.createElement('button');b.type='button';b.className='ib';b.id=id;b.setAttribute('aria-label',label);b.title=label;
  b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';
  header.insertBefore(b,search||null);
 }
 const chat=Q('#chat');
 if(chat&&!Q('#chat-bulkbar')){
  const bar=document.createElement('div');bar.id='chat-bulkbar';bar.hidden=true;
  const msgs=Q('#msgs');chat.insertBefore(bar,msgs||null);
 }
 if(!Q('#msgs')?.dataset.bulkBound){
  const messages=Q('#msgs');if(messages){messages.dataset.bulkBound='1';messages.addEventListener('click',event=>{
   const button=event.target.closest('[data-bulk-toggle]');if(!button)return;
   event.preventDefault();event.stopPropagation();toggleBulkMessageP(Number(button.dataset.bulkToggle));
  })}
 }
 const info=Q('#chat-info-action');if(info)info.onclick=()=>openChatInfoP();
 const gallery=Q('#chat-gallery-action');if(gallery)gallery.onclick=()=>openChatGalleryP();
 const appearance=Q('#chat-appearance-action');if(appearance)appearance.onclick=()=>openChatAppearanceP();
}
async function openChatInfoP(){
 const chat=CH[S.chat];if(!chat?.jid)return;
 try{
  const account=S.cacc==='private'?'private':'public',r=await apiP('chats/'+account+'/'+encodeURIComponent(chat.jid)+'/info'),info=r.info||{};
  const picture=String(info.pictureUrl||'').startsWith('https:')?'<img class="chat-info-picture" src="'+escP(info.pictureUrl)+'" alt="">':'<div class="chat-info-picture fallback">'+escP((info.name||chat.n||'?').charAt(0).toUpperCase())+'</div>';
  const participants=(info.participants||[]).map(person=>'<div class="chat-info-person"><span>'+escP(String(person.id||'').replace(/@.*$/,''))+'</span><small>'+(person.superAdmin?'Group creator':person.admin?'Admin':'Member')+'</small></div>').join('');
  sheet('<div class="chat-info-panel">'+picture+'<h3>'+escP(info.name||chat.n)+'</h3><p class="sub">'+(info.group?'Group conversation':'WhatsApp contact')+'</p><div class="chat-info-actions"><button class="btn sm" data-info-action="gallery">Shared media</button><button class="btn sm" data-info-action="export">Export chat</button></div>'+
  '<div class="chat-info-row"><span>WhatsApp ID</span><b>'+escP(info.jid||chat.jid)+'</b></div>'+
  (info.description?'<div class="chat-info-row"><span>Description</span><p>'+escP(info.description)+'</p></div>':'')+
  (info.createdAt?'<div class="chat-info-row"><span>Created</span><b>'+new Date(info.createdAt).toLocaleDateString()+'</b></div>':'')+
  (info.group?'<div class="chat-info-row"><span>Participants</span><b>'+Number(info.participantCount||0)+'</b></div><div class="chat-info-people">'+participants+'</div>':'')+
  '<div class="btns"><button class="btn" type="button" onclick="closeSheet()">Close</button><span class="grow"></span><button class="btn p" type="button" data-info-action="appearance">Appearance</button></div></div>');
  Q('#sheet')?.querySelectorAll('[data-info-action]').forEach(b=>b.onclick=()=>{const a=b.dataset.infoAction;closeSheet();if(a==='gallery')openChatGalleryP();else if(a==='export')openChatExportChoiceP();else openChatAppearanceP()});
 }catch(error){notifyP(error.message)}
}
async function openChatGalleryP(){
 const chat=CH[S.chat];if(!chat?.jid)return;
 try{
  const account=S.cacc==='private'?'private':'public',r=await apiP('chats/'+account+'/'+encodeURIComponent(chat.jid)+'/gallery?limit=300'),items=r.items||[];
  const cards=items.map((item,index)=>{
   const label=item.type==='image'?'Photo':item.type==='video'?'Video':item.type==='audio'?'Audio':item.type==='sticker'?'Sticker':'Document';
   const preview=item.mediaUrl&&['image','sticker'].includes(item.type)?'<img src="'+escP(item.mediaUrl)+'" alt="" loading="lazy">':item.mediaUrl&&item.type==='video'?'<video src="'+escP(item.mediaUrl)+'#t=0.1" muted preload="metadata"></video>':'<span>'+label+'</span>';
   return '<button type="button" class="chat-gallery-item" data-gallery-index="'+index+'" '+(!item.mediaUrl?'data-gallery-download="'+index+'"':'')+'>'+preview+'<small>'+escP(item.fileName||label)+'</small></button>';
  }).join('');
  sheet('<div class="chat-gallery-panel"><h3>Shared media</h3><p class="sub">'+items.length+' saved or available attachments</p><div class="chat-gallery-grid">'+(cards||'<div class="empty">No shared media has been saved for this chat yet.</div>')+'</div><div class="btns"><button class="btn" type="button" onclick="closeSheet()">Close</button><span class="grow"></span><button class="btn p" type="button" data-gallery-export>Export chat</button></div></div>');
  Q('#sheet')?.querySelectorAll('[data-gallery-index]').forEach(button=>button.onclick=()=>{
   const item=items[Number(button.dataset.galleryIndex)];if(!item)return;
   if(item.mediaUrl){
    closeSheet();
    if(['image','sticker'].includes(item.type))openMv([{name:item.fileName||item.type,k:'img',url:item.mediaUrl,size:item.size}],0);
    else if(item.type==='video')openMv([{name:item.fileName||item.type,k:'vid',url:item.mediaUrl,size:item.size}],0);
    else window.open(item.mediaUrl,'_blank','noopener');
   }else if(item.mediaAvailable){void downloadGalleryItemP(item.id)}
   else notifyP(item.mediaUnavailable||'This attachment is not available.');
  });
  const exp=Q('[data-gallery-export]');if(exp)exp.onclick=()=>{closeSheet();openChatExportChoiceP()};
 }catch(error){notifyP(error.message)}
}
async function downloadGalleryItemP(messageId){
 const chat=CH[S.chat];if(!chat?.jid)return;
 const account=S.cacc==='private'?'private':'public';
 try{await apiP('chats/'+account+'/'+encodeURIComponent(chat.jid)+'/media/'+encodeURIComponent(messageId)+'/download',{method:'POST',body:pack({})});notifyP('Media downloaded');openChatGalleryP()}
 catch(error){notifyP(error.message)}
}
async function openChatExportChoiceP(){
 sheet('<h3>Export conversation</h3><p class="sub">Create a ZIP containing the saved message history and media already downloaded into Studio. You can also ask WhatsApp for remaining media first; this may use mobile data and take longer.</p><div class="chat-export-choice"><button class="row" type="button" data-export-mode="saved"><span class="grow"><b class="t">Saved media only</b><small class="d">Fast export using files already stored here</small></span><span>›</span></button><button class="row" type="button" data-export-mode="all"><span class="grow"><b class="t">Try to include available WhatsApp media</b><small class="d">Downloads missing attachments before building the ZIP</small></span><span>›</span></button></div><div class="btns"><button class="btn" type="button" onclick="closeSheet()">Cancel</button></div>');
 Q('#sheet')?.querySelectorAll('[data-export-mode]').forEach(b=>b.onclick=()=>{const all=b.dataset.exportMode==='all';closeSheet();void exportChatBundleP(all)});
}
async function exportChatBundleP(includePending){
 const chat=CH[S.chat];if(!chat?.jid)return;
 const account=S.cacc==='private'?'private':'public',base='chats/'+account+'/'+encodeURIComponent(chat.jid);
 try{
  notifyP(includePending?'Preparing WhatsApp media for export…':'Preparing chat export…');
  let data=await apiP(base+'/export?limit=5000');
  if(includePending){
   const pending=(data.messages||[]).filter(message=>message.mediaAvailable&&!message.mediaUrl);
   for(let index=0;index<pending.length;index++){
    try{await apiP(base+'/media/'+encodeURIComponent(pending[index].id)+'/download',{method:'POST',body:pack({})})}catch{}
   }
   data=await apiP(base+'/export?limit=5000');
  }
  const zip=typeof JSZip==='function'?new JSZip():null;
  if(!zip){
   downloadP('aharane-chat-export.json',new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
   notifyP('JSON export saved. ZIP media packaging is unavailable in this browser.');return;
  }
  const media=zip.folder('media'),manifest=JSON.parse(JSON.stringify(data)),included=[];
  for(const message of manifest.messages||[]){
   if(!message.mediaUrl)continue;
   try{
    const response=await fetch(message.mediaUrl,{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)continue;
    const blob=await response.blob(),safe=(String(message.fileName||message.type||'attachment').replace(/[^a-z0-9._-]/gi,'_').slice(0,90)||'attachment');
    const name=String(message.timestamp||Date.now())+'-'+String(message.id||included.length)+'-'+safe;
    media.file(name,blob);message.exportMediaPath='media/'+name;included.push(message.id);
   }catch{}
  }
  manifest.mediaIncluded=included.length;manifest.messagesIncluded=(manifest.messages||[]).length;
  zip.file('chat-history.json',JSON.stringify(manifest,null,2));
  zip.file('README.txt','Aharane WhatsApp chat export\\nAccount: '+account+'\\nConversation: '+chat.n+'\\nExported: '+data.exportedAt+'\\nMedia files included: '+included.length+'\\nMissing or unavailable media: '+(data.missingMedia||[]).length+'\\n\\nView-once messages are excluded from media downloads.');
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:5}});
  const name='aharane-chat-'+String(chat.n||'conversation').replace(/[^a-z0-9_-]/gi,'_').slice(0,36)+'-'+new Date().toISOString().slice(0,10)+'.zip';
  downloadP(name,blob);
  notifyP('Chat export ready · '+included.length+' media files included');
 }catch(error){notifyP(error.message)}
}
async function openStarredMessagesP(){
 const account=S.cacc==='private'?'private':'public';
 try{
  const r=await apiP('chats/'+account+'/starred?limit=200'),messages=r.messages||[];
  const html=messages.map((message,index)=>'<button type="button" class="row" data-starred-index="'+index+'"><span class="ic">★</span><span class="grow"><span class="t" style="display:block">'+escP(message.pushName||message.jid.split('@')[0])+'</span><span class="d" style="display:block;white-space:normal">'+escP(message.text||message.fileName||('Attachment · '+message.type))+'</span></span><span class="d">'+rel(message.timestamp)+'</span></button>').join('');
  sheet('<h3>Starred messages</h3><div class="card list">'+(html||'<div class="empty">No starred messages yet. Long-press a message and choose Star.</div>')+'</div><div class="btns"><button class="btn" type="button" onclick="closeSheet()">Close</button></div>');
  Q('#sheet')?.querySelectorAll('[data-starred-index]').forEach(button=>button.onclick=async()=>{
   const message=messages[Number(button.dataset.starredIndex)];if(!message)return;
   closeSheet();await openMessageInChatP(message.jid,message.id,message.timestamp);
  });
 }catch(error){notifyP(error.message)}
}
async function openMessageInChatP(jid,messageId,timestamp){
 try{
  await refreshChatsP();const index=CH.findIndex(chat=>chat.jid===jid);
  if(index<0){notifyP('That conversation is hidden or no longer available.');return}
  S.fl=CH[index].archived?'archived':'all';openChat(index);
  await loadMessagesP(index,Number(timestamp||0)+1);
  const messageIndex=CH[index].m.findIndex(message=>message.id===messageId);
  const target=messageIndex>=0?Q('#msgs .b[data-i="'+messageIndex+'"]'):null;
  if(target){target.scrollIntoView({block:'center',behavior:'smooth'});target.classList.add('flash')}
 }catch(error){notifyP(error.message)}
}
async function toggleChatArchiveP(index){
 const chat=CH[index];if(!chat?.jid)return;
 const account=S.cacc==='private'?'private':'public',archived=!chat.archived;
 try{
  await apiP('chats/'+account+'/'+encodeURIComponent(chat.jid)+'/archive',{method:'POST',body:pack({archived})});
  S.fl=archived?'archived':'all';await refreshChatsP();render();notifyP(archived?'Chat archived in WhatsApp':'Chat unarchived');
 }catch(error){notifyP(error.message)}
}
async function markChatUnreadP(index){
 const chat=CH[index];if(!chat?.jid)return;
 const account=S.cacc==='private'?'private':'public';
 try{await apiP('chats/'+account+'/'+encodeURIComponent(chat.jid)+'/mark-unread',{method:'POST',body:pack({})});await refreshChatsP();render();notifyP('Chat marked unread')}
 catch(error){notifyP(error.message)}
}
function updateBulkBarP(){
 const bar=Q('#chat-bulkbar');if(!bar)return;
 const count=P.selectedMessageIds?.size||0;
 bar.hidden=!P.bulkMode||!count;
 if(!P.bulkMode){bar.innerHTML='';return}
 bar.innerHTML='<div class="chat-bulk-inner"><b>'+count+' selected</b><button type="button" data-bulk-action="star">Star</button><button type="button" data-bulk-action="copy">Copy</button><button type="button" data-bulk-action="forward">Forward</button><button type="button" data-bulk-action="delete" class="danger">Delete</button><button type="button" data-bulk-action="cancel" aria-label="Cancel selection">×</button></div>';
 bar.querySelectorAll('[data-bulk-action]').forEach(button=>button.onclick=()=>runBulkActionP(button.dataset.bulkAction));
}
function toggleBulkMessageP(index){
 const message=CH[S.chat]?.m?.[index];if(!message?.id)return;
 P.bulkMode=true;P.selectedMessageIds=P.selectedMessageIds||new Set();
 if(P.selectedMessageIds.has(message.id))P.selectedMessageIds.delete(message.id);else P.selectedMessageIds.add(message.id);
 if(!P.selectedMessageIds.size)P.bulkMode=false;
 drawMsgs();updateBulkBarP();
}
function selectedMessagesP(){
 const selected=P.selectedMessageIds||new Set();return (CH[S.chat]?.m||[]).filter(message=>selected.has(message.id));
}
function clearBulkSelectionP(){P.bulkMode=false;P.selectedMessageIds=new Set();drawMsgs();updateBulkBarP()}
async function runBulkActionP(action){
 const chat=CH[S.chat],messages=selectedMessagesP();if(!chat?.jid||!messages.length)return;
 const account=S.cacc==='private'?'private':'public',base='chats/'+account+'/'+encodeURIComponent(chat.jid);
 if(action==='cancel'){clearBulkSelectionP();return}
 if(action==='copy'){
  const value=messages.map(message=>message.t||message.f||message.k||'Attachment').join('\\n');
  try{await navigator.clipboard.writeText(value);notifyP('Selected messages copied');clearBulkSelectionP()}catch{notifyP('Copy is not available in this browser')}return;
 }
 if(action==='star'){
  try{for(const message of messages)await apiP(base+'/star',{method:'POST',body:pack({messageId:message.id,starred:true})});P.messageFingerprints.delete(account+'|'+chat.jid+'|latest');await loadMessagesP(S.chat,0);clearBulkSelectionP();notifyP('Messages starred')}
  catch(error){notifyP(error.message)}return;
 }
 if(action==='forward'){
  const targets=CH.map((target,index)=>'<button type="button" class="row" data-bulk-target="'+index+'"><span class="av">'+escP(target.n.slice(0,1))+'</span><span class="grow"><span class="t">'+escP(target.n)+'</span><span class="d">'+(target.g?'Group':'Chat')+'</span></span></button>').join('');
  sheet('<h3>Forward '+messages.length+' messages</h3><div class="card list">'+targets+'</div><div class="btns"><button class="btn" type="button" onclick="closeSheet()">Cancel</button></div>');
  Q('#sheet')?.querySelectorAll('[data-bulk-target]').forEach(button=>button.onclick=async()=>{
   const target=CH[Number(button.dataset.bulkTarget)];if(!target?.jid)return;
   try{for(const message of messages)await apiP(base+'/forward',{method:'POST',body:pack({messageId:message.id,targetJid:target.jid})});closeSheet();clearBulkSelectionP();notifyP('Selected messages forwarded')}
   catch(error){notifyP(error.message)}
  });return;
 }
 if(action==='delete'){
  sheet('<h3>Delete '+messages.length+' messages?</h3><p class="sub">Your sent messages are revoked for everyone when WhatsApp allows it. Incoming messages are deleted for this linked account only.</p><div class="btns"><button class="btn" type="button" onclick="closeSheet()">Cancel</button><button class="btn d" id="bulk-delete-confirm">Delete</button></div>');
  Q('#bulk-delete-confirm').onclick=async()=>{
   try{for(const message of messages)await apiP(base+'/delete',{method:'POST',body:pack({messageId:message.id})});closeSheet();P.messageFingerprints.delete(account+'|'+chat.jid+'|latest');await loadMessagesP(S.chat,0);clearBulkSelectionP();notifyP('Selected messages deleted')}
   catch(error){notifyP(error.message)}
  };
 }
}

function installBridgeP(){
 installFileSaveLifecycleP();
 const configViewBaseP=cfgV;
 switchProf=function(){
  DS[S.cprof]=cfgD;C0S[S.cprof]=C0;
  const next=S.cprof==='public'?'private':'public';
  S.cprof=next;C=CS[next];
  if(!DS[next]){
   loadP(next);
   C=CS[next];
   C.owner=next==='private'?(P.owners.ownerNumber||P.owners.privateOwnerNumber||''):(P.owners.publicBotNumber||'');
   C.prefix=next==='private'?'.':'!';
   C0=JSON.stringify(C);C0S[next]=C0;
  }else C0=C0S[next];
  cfgD=Boolean(DS[next]);
  render();toast((next==='public'?'Public':'Private')+' configuration');
 };
 cfgV=function(){
  // Preserve the original Configuration page. Prefixes are fixed in the
  // runtime (. for Private, ! for Public), so display them read-only.
  return configViewBaseP().replace('data-cf="prefix"','data-cf="prefix" readonly aria-readonly="true"');
 };
 openCfg=function(){
  if(!cfgD){
   cfgLoad();C=CS[S.cprof];
   C.owner=S.cprof==='private'?(P.owners.ownerNumber||P.owners.privateOwnerNumber||''):(P.owners.publicBotNumber||'');
   C.prefix=S.cprof==='private'?'.':'!';
   C0=JSON.stringify(C);C0S[S.cprof]=C0;
  }
  S.sub='cfg';render();scrollTo(0,0);
 };
 filesBase=filesV;openFileBase=openF;actBase=actV;moreBase=moreV;homeBase=home;bubBase=bub;bindSel=bindLiveSelectionP;
 exportZip=function(source,filename){
  const paths=Object.keys(source||{}).map(name=>[...S.path,name].filter(Boolean).join('/'));
  exportSelectionZipP(paths,filename).catch(error=>notifyP(error.message));
 };
 openPairBaseP=openPair;openPair=async function(i){if(P.qrTimer){clearInterval(P.qrTimer);P.qrTimer=null}S.pin=null;S.qrRequested=false;try{await refreshRuntimeP()}catch(error){notifyP('Could not refresh account status: '+error.message)}openPairBaseP(i)};
 const chatsBaseP=chatsV;chatsV=function(){
  const html=chatsBaseP().replace('</button></div><p class="sub">','</button><button class="modeb" id="chat-visibility" aria-label="Configure chat visibility">'+ico('cfg')+'</button><button class="modeb" id="chat-starred" aria-label="Starred messages">★</button><button class="modeb" id="chat-appearance-list" aria-label="Chat appearance">Aa</button></div><p class="sub">');
  return html.replace('<div class="card list">','<div id="chat-search-results">'+chatSearchPanelP()+'</div><div class="card list">');
 };
 filesV=filesScreenP;envV=envViewP;accV=accountViewP;pairV=pairViewP;moreV=moreViewP;storV=storageViewP;
 home=homeViewP;
 openAct=activityPageP;openStor=function(){S.sub='stor';render();loadStorageP()};
 newAcc=function(){notifyP('Aharane uses two separate accounts: Private and Public.')};
 finishPair=function(){refreshRuntimeP().then(render)};
 unlink=function(i){accountActionP(accts[i]?.slot,'stop')};
 pinPane=pairViewP;qrPane=pairViewP;newQr=startQrP;
 svc=async action=>{try{await Promise.all(['private','public'].map(id=>apiP('accounts/'+id+'/'+(action==='start'?'reconnect':action),{method:'POST',body:pack({})})));await refreshRuntimeP();render()}catch(e){notifyP(e.message)}};
 openChatBase=openChat;openChat=function(i){P.bulkMode=false;P.selectedMessageIds.clear();openChatBase(i);ensureChatToolsP();updateBulkBarP();if(P.chatAppearance)applyChatAppearanceP(P.chatAppearance);else void loadChatAppearanceP();P.openChatSearchResults=[];P.openChatQuery='';if(Q('#chat-searchbar'))Q('#chat-searchbar').hidden=true;if(Q('#chat-search-input'))Q('#chat-search-input').value='';bindConversationSearchP();loadMessagesP(i).catch(e=>notifyP(e.message))};
 switchChats=switchChatsP;sendMsg=msg=>sendChatP(msg).catch(e=>{notifyP(e.message);throw e});attach=attachLiveP;
 bub=function(msg,first,last,index){
  const starred=msg.starred?'<span class="star-indicator" aria-label="Starred">★</span>':'';
  const select=P.bulkMode&&msg.id?'<button type="button" class="msg-select-marker '+(P.selectedMessageIds.has(msg.id)?'selected':'')+'" data-bulk-toggle="'+index+'" aria-label="Select message">'+(P.selectedMessageIds.has(msg.id)?'✓':'')+'</button>':'';
  if(msg.dl)return '<div class="b '+(msg.d==='o'?'o ':'')+(first?'f ':'')+(last?'l':'')+'" data-i="'+index+'" data-message-id="'+escP(msg.id||'')+'">'+select+starred+'<a href="'+escP(msg.dl)+'" download="'+escP(msg.f||'attachment')+'" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">'+escP(msg.f||'Attachment')+'</a>'+(msg.reactions?.length?'<div class="reaction-chips">'+msg.reactions.map(item=>'<span class="reaction-chip">'+escP(item.emoji)+' <small>'+escP(item.actor)+'</small></span>').join('')+'</div>':'')+'<span class="mt">'+fmtT(msg.ts)+'</span></div>';
  let html=bubBase(msg,first,last,index);
  if(starred)html=html.replace('<span class="mt">',starred+'<span class="mt">');
  if(select)html=html.replace(/(<div class="b [^"]*"[^>]*>)/, '$1'+select);
  return html;
 };
 openF=openLiveFileP;mk=t=>createLiveFileP(t==='dir'?'folder':'file');menu=fileMenuP;
 drawMsgsBaseP=drawMsgs;drawMsgs=preserveChatScrollDrawP;
 bindBase=bind;bind=function(){bindBase();bindProductionP()};
 LOGS.splice(0,LOGS.length);logs=[];CH.splice(0,CH.length);chats=[];fs={};S.path=[];envs=[];envDirty=false;
}
function injectStyleP(){
 const style=document.createElement('style');style.id='aharane-prod-auth-style';
 style.textContent='body:not(.aharane-authenticated) .app,body:not(.aharane-authenticated) .nav{visibility:hidden}#aharane-auth{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:22px;background:var(--bg);color:var(--ink)}#aharane-auth .auth-panel{width:min(100%,420px);background:var(--surf);border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:var(--sh)}#aharane-auth .auth-brand{display:flex;align-items:center;gap:10px;font:700 20px var(--disp);margin-bottom:24px}#aharane-auth label{display:block;font:600 13px var(--body);margin:12px 0 7px}#aharane-auth .field{margin-bottom:4px}#aharane-auth .btn{margin-top:16px}#aharane-auth [hidden]{display:none!important}';
 document.head.appendChild(style);
}
async function bootP(){
 if(navigator.serviceWorker)navigator.serviceWorker.register('/aharane/studio/sw.js',{scope:'/aharane/studio/'}).catch(()=>{});
 try{
  injectStyleP();installBridgeP();
  const auth=await apiP('auth/status');
  if(auth.setupRequired){loginPanelP();setLoginModeP(true);return}
  document.body.classList.add('aharane-authenticated');
  await connectLiveP();
 }catch(error){
  try{
   loginPanelP();setLoginModeP(false);
   Q('#prod-auth-message').textContent='Studio startup failed: '+String(error?.message||error);
  }catch{}
 }
}
window.AharaneStudio={signOut:signOutP,refresh:refreshRuntimeP,openSource:openAppSourceP};
window.openAppSourceP=openAppSourceP;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootP,{once:true});else bootP();
})();