(() => {
'use strict';
const API='/aharane/api', Q=s=>document.querySelector(s);
const APP_SOURCE_PATHS=['index.html','styles.css','app.js','production-bridge.js','manifest.webmanifest'];
const escP=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pack=JSON.stringify;
const P={runtime:null,snapshot:null,owners:{},env:[],metrics:{},activity:[],packages:[],fileData:new Map(),pending:false,chatTimer:null,qrTimer:null,statusTimer:null,chatJid:'',chatLoaded:false,visibility:null,visibilityChats:[]};
function notifyP(s){if(typeof toast==='function')toast(s);else console.info(s)}
async function apiP(path,options={}){
 const response=await fetch(API+'/'+String(path).replace(/^\/+/,''),{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body&&!(options.body instanceof ArrayBuffer)&&!(options.body instanceof Blob)?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
 const type=response.headers.get('content-type')||'',data=type.includes('application/json')?await response.json():null;
 if(!response.ok||data?.ok===false)throw new Error(data?.error||'Request failed ('+response.status+').');
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
  const r=await Promise.all([apiP('status'),apiP('studio/snapshot'),apiP('owners'),apiP('env'),apiP('metrics'),apiP('activity?limit=300'),apiP('update/status')]);
  P.runtime=r[0];P.snapshot=r[1];P.owners=r[2].owners||{};P.env=r[3].env||[];P.metrics=r[4];P.activity=r[5].entries||[];P.pending=Boolean(r[6].manualEdits?.pending);
  P.packages=await loadPackagesP();await loadTreeP('');applyRuntimeP();applyEnvP();P.offline=false;document.body.classList.remove('aharane-booting');document.body.classList.add('aharane-authenticated');render();
  P.statusTimer=setInterval(()=>refreshRuntimeP().catch(()=>{}),7000);
  if(navigator.serviceWorker)navigator.serviceWorker.register('/aharane/studio/sw.js',{scope:'/aharane/studio/'}).catch(()=>{});
 }catch(error){await showLoginP();Q('#prod-auth-message').textContent=error.message}
}
function applyRuntimeP(){
 const a=P.runtime?.accounts||{};
 accts.splice(0,accts.length,
  {n:'Private account',d:'Private Owner self-chat',on:a.private?.connected?1:0,slot:'private'},
  {n:'Public account',d:'Public WhatsApp bot',on:a.public?.connected?1:0,slot:'public'});
 S.run=Boolean(a.private?.connected||a.public?.connected);
 S.t0=Date.now()-Number(P.snapshot?.uptimeSeconds||0)*1000;
 logs=P.activity.slice(0,8).map(x=>[x.message,new Date(x.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})]);
 const series=P.metrics?.hourlyMessages||[];bars=series.length?series.map(n=>Math.max(6,Math.min(100,Number(n)*12+6))):Array(24).fill(6);
}
async function refreshRuntimeP(){
 const r=await Promise.all([apiP('status'),apiP('studio/snapshot'),apiP('metrics'),apiP('update/status')]);
 P.runtime=r[0];P.snapshot=r[1];P.metrics=r[2];P.pending=Boolean(r[3].manualEdits?.pending);applyRuntimeP();
 if(S.tab==='home')render();refreshActivityP().catch(()=>{});return P.runtime;
}
async function refreshActivityP(){
 const r=await apiP('activity?limit=500');P.activity=r.entries||[];
 LOGS.splice(0,LOGS.length,...P.activity.map(x=>({id:x.id,ts:new Date(x.at).getTime(),lv:x.level,src:x.source,msg:x.message,det:''})));
 lid=LOGS.length;logs=P.activity.slice(0,8).map(x=>[x.message,new Date(x.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})]);
}
function applyEnvP(){envs=P.env.map(x=>({k:x.key,v:x.value,s:0,readOnly:Boolean(x.readOnly),scope:x.scope,type:x.type||'text'}));envDirty=false;show={}}
function currentPathP(){return S.path.join('/')}
function updateFileTreeP(path,children){
 let obj=fs;for(const part of path.split('/').filter(Boolean)){if(!obj[part]||typeof obj[part]!=='object')obj[part]={};obj=obj[part]}
 Object.keys(obj).forEach(k=>delete obj[k]);(children||[]).forEach(x=>obj[x.name]=x.type==='folder'?{}:'');
}
async function loadTreeP(path=''){const r=await apiP('files/tree?item='+encodeURIComponent(path));updateFileTreeP(path,r.children||[]);P.pending=Boolean(r.pending);return r}
async function loadSourceFileP(path){
 const r=await apiP('files/preview?item='+encodeURIComponent(path));P.fileData.set(path,r);
 const parts=path.split('/'),name=parts.pop();let dir=fs;for(const part of parts)dir=dir[part];dir[name]=r.content;return r;
}
function downloadP(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function loadPackagesP(){try{const r=await apiP('files/packages');return r.packages||[]}catch{return []}}
async function uploadZipP(file){
 if(file.size<22||file.size>50*1024*1024)throw new Error('ZIP files must be no larger than 50 MB.');
 const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 const sum=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''),id=crypto.randomUUID(),count=Math.ceil(file.size/1048576);
 await apiP('update/upload/start',{method:'POST',body:pack({updateId:id,filename:file.name,size:file.size,totalChunks:count,sha256:sum})});
 for(let i=0;i<count;i++){
  const bytes=new Uint8Array(await file.slice(i*1048576,(i+1)*1048576).arrayBuffer());let binary='';
  for(let j=0;j<bytes.length;j+=0x8000)binary+=String.fromCharCode(...bytes.subarray(j,j+0x8000));
  await apiP('update/upload/chunk',{method:'POST',body:pack({updateId:id,index:i,data:btoa(binary)})});
 }
 const result=await apiP('update/validate',{method:'POST',body:pack({updateId:id})});P.packages=await loadPackagesP();return result;
}
async function pollUpdateP(){
 for(let i=0;i<90;i++){await new Promise(r=>setTimeout(r,2000));const s=await apiP('update/status');if(['succeeded','failed','rolled_back','rollback_failed'].includes(s.update?.status))return s.update}
 throw new Error('Update polling stopped. Check the update status in Studio.');
}
async function deployPackageP(id){
 const pkg=P.packages.find(x=>x.updateId===id);if(!pkg)return;
 if(!confirm('Update Aharane to version '+pkg.version+'? The service will restart. WhatsApp sessions and persistent data are preserved.'))return;
 await apiP('update/deploy',{method:'POST',body:pack({updateId:id,confirm:true})});notifyP('Preparing update…');
 const result=await pollUpdateP();notifyP(result.message||result.status);await refreshRuntimeP();P.packages=await loadPackagesP();render();
}
function packagePageP(){
 const rows=P.packages.map(p=>'<div class="row"><span class="ic">'+ico('file')+'</span><span class="grow"><div class="t">'+escP(p.filename)+'</div><div class="d">v'+escP(p.version)+' · '+Number(p.fileCount||0)+' files</div></span><button class="more" data-package="'+escP(p.updateId)+'">⋮</button></div>').join('');
 return '<button class="btn sm" onclick="S.path=[];render()">Back to files</button><h1 style="margin-top:14px">Update packages</h1><p class="sub">Validated Aharane ZIP packages. Use the three-dot menu to update the bot.</p><div class="card list">'+(rows||'<div class="empty">No ZIP update packages saved.</div>')+'</div>';
}
window.openPackagePageP=()=>{S.path=['updates'];S.ed=false;render()};
async function applyFilesP(){
 if(!confirm('Apply staged source changes and restart Aharane?'))return;
 try{await apiP('files/apply',{method:'POST',body:pack({confirm:true})});notifyP('Applying staged changes…');await pollUpdateP();await refreshRuntimeP();render()}
 catch(error){notifyP(error.message)}
}
function filesScreenP(){
 if(S.path[0]==='updates')return packagePageP();
 let html=filesBase();
 if(S.ed){const end=html.lastIndexOf('</div>');html=html.slice(0,end+6)+'<div class="btns"><button class="btn p" id="prod-file-save">Save changes</button><button class="btn" id="prod-file-download">Download</button></div>'+html.slice(end+6)}
 else if(!S.path.length){html+='<h2>Update packages <button class="btn sm" onclick="openPackagePageP()">View all</button></h2><p class="sub">'+P.packages.length+' saved ZIP package(s)</p>'+(P.pending?'<div class="btns"><button class="btn p" id="prod-apply-files">Apply staged changes</button></div>':'')}
 return html;
}
function filePathP(name){return [currentPathP(),name].filter(Boolean).join('/')}
async function openLiveFileP(name){const path=filePathP(name);await loadSourceFileP(path);openFileBase(name)}
async function saveLiveFileP(){
 const data=P.fileData.get(S.cur),editor=Q('#ed');if(!data||!editor)return;
 const button=Q('#prod-file-save');if(button)button.disabled=true;
 try{
  const r=await apiP('files/content',{method:'PUT',body:pack({path:S.cur,content:editor.value,expectedSha256:data.sha256})});
  data.content=editor.value;data.sha256=r.sha256;data.size=r.size;
  const parts=S.cur.split('/'),name=parts.pop();let dir=fs;for(const p of parts)dir=dir[p];dir[name]=editor.value;
  Q('#es').textContent='Saved (staged)';P.pending=true;notifyP('File saved to staged changes');
 }catch(error){notifyP(error.message)}finally{if(button)button.disabled=false}
}
function createLiveFileP(type){
 ask(type==='folder'?'New folder':'New file','','Create',async name=>{
  try{await apiP('files',{method:'POST',body:pack({parentPath:currentPathP(),name,type,content:type==='file'?'':''})});await loadTreeP(currentPathP());render()}
  catch(error){notifyP(error.message)}
 });
}
function fileMenuP(name,button){
 closePop();const path=filePathP(name),folder=typeof node(S.path)[name]==='object',actions=['Rename','Move','Download'];if(!folder)actions.push('Delete');
 const popup=document.createElement('div');popup.id='pop';popup.className='pop';popup.setAttribute('role','menu');
 popup.innerHTML=actions.map(a=>'<button role="menuitem" data-file-action="'+a+'"'+(a==='Delete'?' class="del"':'')+'>'+a+'</button>').join('');
 document.body.appendChild(popup);const r=button.getBoundingClientRect(),h=popup.offsetHeight,w=popup.offsetWidth;
 popup.style.left=Math.max(8,Math.min(innerWidth-w-8,r.right-w))+'px';popup.style.top=r.bottom+h+8>innerHeight?Math.max(8,r.top-h-2)+'px':r.bottom+2+'px';
 popup.onclick=async e=>{
  const a=e.target.dataset.fileAction;if(!a)return;closePop();
  try{
   if(a==='Rename')ask('Rename',name,'Save',async value=>{try{await apiP('files/rename',{method:'POST',body:pack({path,name:value})});await loadTreeP(currentPathP());render()}catch(error){notifyP(error.message)}});
   else if(a==='Move')ask('Move to folder (for example commands or private-commands)','commands','Move',async value=>{try{await apiP('files/move',{method:'POST',body:pack({path,destination:value==='root'?'':value})});await loadTreeP(currentPathP());render()}catch(error){notifyP(error.message)}});
   else if(a==='Download'){const d=await apiP('files/preview?item='+encodeURIComponent(path));downloadP(name,new Blob([d.content],{type:'text/plain'}))}
   else if(a==='Delete'){if(!confirm('Delete '+name+'? The change will be staged.'))return;await apiP('files/delete',{method:'POST',body:pack({paths:[path]})});await loadTreeP(currentPathP());render()}
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
  return '<div class="row"><span class="av">'+(id==='private'?'P':'A')+'<i class="st av-dot '+(a.connected?'':'off')+'"></i></span><span class="grow"><div class="t">'+(id==='private'?'Private account':'Public account')+'</div><div class="d">'+escP(state)+' · '+(a.registered?'Paired':'Not paired')+'</div></span><button class="btn sm p" data-pair-account="'+id+'">'+(a.connected?'Manage':'Pair')+'</button></div><div class="row" style="padding-left:64px;flex-wrap:wrap"><button class="btn sm" data-account="'+id+'" data-action="reconnect">Reconnect</button><button class="btn sm" data-account="'+id+'" data-action="restart">Restart</button><button class="btn sm" data-account="'+id+'" data-action="stop">Stop</button>'+(a.state==='needs-pairing'?'<button class="btn sm d" data-account="'+id+'" data-action="repair">Re-pair</button>':'')+'</div>';
 }).join('');
 return '<button class="btn sm" onclick="S.sub=null;render()">Back to Home</button><h1 style="margin-top:14px">Accounts</h1><p class="sub">Two independent WhatsApp sessions. Owner identities are separate.</p><div class="card list">'+rows+'</div><h2>Owner identities</h2><p class="sub">Private Owner controls the private self-chat. Public Owner is a separate sender identity for public owner-only commands.</p><div class="card list" style="padding:14px"><label class="d" for="owner-private">Private Owner number</label><input class="field" id="owner-private" value="'+escP(P.owners.privateOwnerNumber||'')+'" inputmode="numeric"><label class="d" for="owner-public" style="display:block;margin-top:12px">Public Owner number</label><input class="field" id="owner-public" value="'+escP(P.owners.publicOwnerNumber||'')+'" inputmode="numeric"><label class="d" for="owner-allow" style="display:block;margin-top:12px">Allowed public senders</label><input class="field" id="owner-allow" value="'+escP((P.owners.allowedPublicSenders||[]).join(', '))+'"><div class="btns"><button class="btn p" id="save-owners">Save owner settings</button></div></div>';
}
function pairViewP(){
 const id=accts[S.pi]?.slot==='public'?'public':'private',a=P.runtime?.accounts?.[id]||{};
 return '<button class="btn sm" onclick="S.sub=null;render()">Back to Home</button><h1 style="margin-top:14px">Link '+id+' account</h1><p class="sub">'+escP(a.connected?'Connected':a.state||'Offline')+'</p><div class="seg" style="margin-bottom:16px"><button class="'+(S.pm==='pin'?'on':'')+'" data-pm="pin">Pairing code</button><button class="'+(S.pm==='qr'?'on':'')+'" data-pm="qr">QR code</button></div><div class="card" style="padding:16px">'+(S.pm==='qr'?'<div class="empty" id="prod-qr-panel">Waiting for WhatsApp pairing QR…</div><p class="d">Open WhatsApp → Linked devices → Link a device.</p><button class="btn sm" id="prod-qr-refresh">Refresh QR</button>':'<label class="t" for="pair-phone" style="display:block;margin-bottom:8px">'+(id==='private'?'Private Owner number':'Public bot WhatsApp number')+'</label><input class="field" id="pair-phone" inputmode="numeric" value="'+escP(id==='private'?(P.owners.privateOwnerNumber||''):'')+'" placeholder="Country code + number"><button class="btn p" id="prod-pair-code" style="margin-top:12px;width:100%">Get pairing code</button>'+(S.pin?'<div class="pin" style="text-align:center;margin:18px 0"><b>'+escP(S.pin)+'</b></div><button class="btn" id="prod-copy-code">Copy code</button>':'')+'</div>');
}
async function getPairCodeP(){
 const id=accts[S.pi]?.slot==='public'?'public':'private',phone=String(Q('#pair-phone')?.value||'').replace(/\D/g,'');
 if(!phone)return notifyP('Enter the WhatsApp number to pair.');
 try{const r=await apiP('accounts/'+id+'/pair-code',{method:'POST',body:pack({phoneNumber:phone})});S.pin=r.pairingCode;render()}
 catch(error){notifyP(error.message)}
}
let qrSeenP='';
async function readQrP(){
 const id=accts[S.pi]?.slot==='public'?'public':'private';
 try{const r=await apiP('accounts/'+id+'/qr'),el=Q('#prod-qr-panel');if(!el)return;
  if(r.qr&&r.qr!==qrSeenP){qrSeenP=r.qr;el.innerHTML=qrSvg(r.qr)}
  else if(!r.qr&&!qrSeenP)el.textContent='Waiting for WhatsApp to generate the pairing QR…';
  if(P.runtime?.accounts?.[id]?.connected){el.textContent='Account connected.';clearInterval(P.qrTimer);P.qrTimer=null}
 }catch(error){if(Q('#prod-qr-panel'))Q('#prod-qr-panel').textContent=error.message}
}
function startQrP(){if(P.qrTimer)clearInterval(P.qrTimer);qrSeenP='';readQrP();P.qrTimer=setInterval(readQrP,1800)}
async function saveOwnersP(){
 try{const r=await apiP('owners',{method:'PUT',body:pack({privateOwnerNumber:Q('#owner-private').value,publicOwnerNumber:Q('#owner-public').value,allowedPublicSenders:Q('#owner-allow').value.split(/[,\s]+/).filter(Boolean)})});P.owners=r.owners;notifyP('Owner identities saved');render()}
 catch(error){notifyP(error.message)}
}
function envViewP(){
 return '<h1>ENV</h1><p class="sub">Managed account settings. Command prefixes are fixed: private . and public !.</p><div class="card list">'+envs.map((x,i)=>'<div class="env"><label for="e'+i+'">'+escP(x.k)+(x.readOnly?' · Fixed':'')+'</label><input class="field" id="e'+i+'" data-e="'+i+'" value="'+escP(x.v)+'" '+(x.readOnly?'disabled':'')+' autocomplete="off"></div>').join('')+'</div><div class="btns"><button class="btn p" id="prod-save-env">Save changes</button></div>';
}
async function saveEnvP(){try{const r=await apiP('env',{method:'PUT',body:pack({env:envs.map(x=>({key:x.k,value:x.v}))})});P.env=r.env||[];applyEnvP();render();notifyP('Settings saved')}catch(error){notifyP(error.message)}}
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
  '<p class="sub">Additional tools and information</p><div class="card list"><button class="row" onclick="openAcc()"><span class="grow"><div class="t">Accounts &amp; owners</div><div class="d">Pair the two WhatsApp sessions and set their separate Owner identities</div></span><span class="d">›</span></button></div>'
 );
 return source+'<h2>Development</h2><div class="card list"><button class="row" id="open-app-source"><span class="grow"><div class="t">Studio source</div><div class="d">Edit the app HTML, CSS and JavaScript on this phone</div></span><span class="d">›</span></button></div><div class="btns" style="margin-top:18px"><button class="btn" id="change-password">Change password</button><button class="btn d" id="sign-out">Sign out</button></div>';
}
function changePasswordP(){
 sheet('<h3>Change Studio password</h3><form id="prod-password-form"><label class="d" for="old-password">Current password</label><input class="field" id="old-password" type="password" required><label class="d" for="new-password" style="display:block;margin-top:12px">New password (12–128 characters)</label><input class="field" id="new-password" type="password" minlength="12" maxlength="128" required><div class="btns"><button class="btn" type="button" onclick="closeSheet()">Cancel</button><button class="btn p">Save password</button></div></form>');
 Q('#prod-password-form').onsubmit=async e=>{e.preventDefault();try{await apiP('auth/change-password',{method:'POST',body:pack({currentPassword:Q('#old-password').value,newPassword:Q('#new-password').value})});closeSheet();notifyP('Password changed')}catch(error){notifyP(error.message)}};
}
async function signOutP(){try{await apiP('auth/logout',{method:'POST',body:pack({})})}catch{}await showLoginP()}
function mapMessageP(row){
 const m={d:row.fromMe?'o':'i',t:row.text||'',ts:Number(row.timestamp)||Date.now(),r:row.status==='read'};
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
 const account=S.cacc==='private'?'private':'public',r=await apiP('chats/'+account+'?limit=500'),current=P.chatJid;
 CH.splice(0,CH.length,...(r.chats||[]).map(c=>({jid:c.jid,n:c.name||c.jid.split('@')[0],g:c.group===true||String(c.jid).endsWith('@g.us'),mem:[],un:c.unreadCount||0,m:[{d:c.fromMe?'o':'i',t:c.lastMessage||'',ts:c.timestamp||Date.now()}]})));
 if(current&&S.chat!==null){const i=CH.findIndex(c=>c.jid===current);if(i>=0)S.chat=i;else S.chat=null}
}
async function loadMessagesP(index=S.chat){
 const c=CH[index];if(!c?.jid)return;P.chatJid=c.jid;
 const account=S.cacc==='private'?'private':'public',r=await apiP('chats/'+account+'/'+encodeURIComponent(c.jid)+'/messages?limit=500');
 c.m=(r.messages||[]).map(mapMessageP);if(S.chat===index)drawMsgs();
}
async function sendChatP(msg){
 const c=CH[S.chat];if(!c?.jid)throw new Error('Open a conversation first.');
 const account=S.cacc==='private'?'private':'public',base='chats/'+account+'/'+encodeURIComponent(c.jid);
 if(msg.t)await apiP(base+'/send',{method:'POST',body:pack({text:msg.t})});
 else if(msg.b instanceof Blob)await apiP(base+'/media',{method:'POST',body:await msg.b.arrayBuffer(),headers:{'Content-Type':'application/octet-stream','X-Media-Type':msg.b.type||'application/octet-stream','X-File-Name':encodeURIComponent(msg.f||'attachment')}});
 else return;
 await loadMessagesP();
}
async function attachLiveP(file){try{await sendChatP({b:file,f:file.name});await loadMessagesP()}catch(error){notifyP(error.message)}}
function switchChatsP(){S.cacc=S.cacc==='private'?'public':'private';S.chat=null;P.chatJid='';refreshChatsP().then(render).catch(e=>notifyP(e.message))}
async function accountActionP(id,action){try{await apiP('accounts/'+id+'/'+action,{method:'POST',body:pack({})});await refreshRuntimeP();render();notifyP('Account '+action+' requested')}catch(error){notifyP(error.message)}}
function bindProductionP(){
 document.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{const name=b.dataset.open;if(typeof node(S.path)[name]==='object'){S.path.push(name);S.sel={};try{await loadTreeP(currentPathP())}catch(e){notifyP(e.message)}render()}else openLiveFileP(name).catch(e=>notifyP(e.message))});
 document.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>fileMenuP(b.dataset.m,b));
 document.querySelectorAll('[data-package]').forEach(b=>b.onclick=()=>packageMenuP(b.dataset.package,b));
 document.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>openChat(+b.dataset.c));
 document.querySelectorAll('[data-pair-account]').forEach(b=>b.onclick=()=>openPair(b.dataset.pairAccount==='private'?0:1));
 document.querySelectorAll('[data-account]').forEach(b=>b.onclick=()=>accountActionP(b.dataset.account,b.dataset.action));
 const owner=Q('#save-owners');if(owner)owner.onclick=saveOwnersP;
 const env=Q('#prod-save-env');if(env)env.onclick=saveEnvP;
 document.querySelectorAll('[data-e]').forEach(input=>input.oninput=()=>{const row=envs[Number(input.dataset.e)];if(row&&!row.readOnly){row.v=input.value;envDirty=true}});
 const save=Q('#prod-file-save');if(save)save.onclick=saveLiveFileP;
 const down=Q('#prod-file-download');if(down)down.onclick=()=>{const data=P.fileData.get(S.cur);if(data)downloadP(S.cur.split('/').pop(),new Blob([data.content],{type:'text/plain'}))};
 const upload=Q('#upl');if(upload)upload.onchange=async e=>{const files=[...e.target.files];e.target.value='';for(const file of files){try{if(/\.zip$/i.test(file.name)){const r=await uploadZipP(file);notifyP('Validated '+file.name+' ('+r.fileCount+' files)')}else{if(!/\.(js|mjs|cjs|json|md|html|css|txt|yml|yaml)$/i.test(file.name))throw new Error('Only approved source and text files can be uploaded.');await apiP('files',{method:'POST',body:pack({parentPath:currentPathP(),name:file.name,type:'file',content:await file.text()})});notifyP('Uploaded '+file.name)}}catch(error){notifyP(error.message)}}await loadTreeP(currentPathP());P.packages=await loadPackagesP();render()};
 const search=Q('#cq');if(search)search.oninput=()=>{S.cq=search.value;const p=search.selectionStart;refreshChatsP().then(()=>{render();const x=Q('#cq');if(x){x.focus();x.setSelectionRange(p,p)}}).catch(e=>notifyP(e.message))};
 const swap=Q('#chsw');if(swap)swap.onclick=switchChatsP;
 const visibility=Q('#chat-visibility');if(visibility)visibility.onclick=()=>openChatVisibilityP();
 const pair=Q('#prod-pair-code');if(pair)pair.onclick=getPairCodeP;
 const qr=Q('#prod-qr-refresh');if(qr)qr.onclick=readQrP;
 const copy=Q('#prod-copy-code');if(copy)copy.onclick=()=>navigator.clipboard?.writeText(S.pin||'').then(()=>notifyP('Pairing code copied')).catch(()=>notifyP('Select and copy the code'));
 document.querySelectorAll('[data-pm]').forEach(b=>b.onclick=()=>{S.pm=b.dataset.pm;S.pin=null;render()});
 const clear=Q('#lcl');if(clear)clear.onclick=clearActivityP;
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
 if(Q('#prod-qr-panel')&&S.sub==='pair'&&S.pm==='qr'&&!P.qrTimer)startQrP();
 if(!(Q('#prod-qr-panel')&&S.sub==='pair')&&P.qrTimer){clearInterval(P.qrTimer);P.qrTimer=null}
 if(S.tab==='files'&&S.path[0]==='updates')loadPackagesP().then(x=>{P.packages=x;render()});
 if(S.tab==='chats'&&!P.chatLoaded){P.chatLoaded=true;refreshChatsP().then(render).catch(e=>notifyP(e.message))}
 if(S.tab==='chats'&&!P.chatTimer)P.chatTimer=setInterval(()=>refreshChatsP().then(()=>{if(S.chat!==null)loadMessagesP()}).catch(()=>{}),6000);
 if(S.tab!=='chats'&&P.chatTimer){clearInterval(P.chatTimer);P.chatTimer=null}
}
function installBridgeP(){
 filesBase=filesV;openFileBase=openF;actBase=actV;moreBase=moreV;homeBase=home;bubBase=bub;
 const chatsBaseP=chatsV;chatsV=function(){return chatsBaseP().replace('</button></div><p class="sub">','</button><button class="modeb" id="chat-visibility" aria-label="Configure chat visibility">'+ico('cfg')+'</button></div><p class="sub">')};
 filesV=filesScreenP;envV=envViewP;accV=accountViewP;pairV=pairViewP;moreV=moreViewP;storV=storageViewP;
 home=function(){return homeBase().replace(/(<span>Messages handled, last 24 hours<\/span><b>)[\s\S]*?(<\/b>)/,'$1'+Number(P.metrics?.messagesLast24h||0).toLocaleString()+'$2')};
 openAct=activityPageP;openStor=function(){S.sub='stor';render();loadStorageP()};
 openCfg=function(){go('env')};cfgFor=function(){go('env')};
 newAcc=function(){notifyP('Aharane uses two separate accounts: Private and Public.')};
 finishPair=function(){refreshRuntimeP().then(render)};
 unlink=function(i){accountActionP(accts[i]?.slot,'stop')};
 pinPane=pairViewP;qrPane=pairViewP;newQr=startQrP;
 svc=async action=>{try{await Promise.all(['private','public'].map(id=>apiP('accounts/'+id+'/'+(action==='start'?'reconnect':action),{method:'POST',body:pack({})})));await refreshRuntimeP();render()}catch(e){notifyP(e.message)}};
 openChatBase=openChat;openChat=function(i){openChatBase(i);loadMessagesP(i).catch(e=>notifyP(e.message))};
 switchChats=switchChatsP;sendMsg=msg=>sendChatP(msg).catch(e=>notifyP(e.message));attach=attachLiveP;
 bub=function(msg,first,last,index){
  if(msg.dl)return '<div class="b '+(msg.d==='o'?'o ':'')+(first?'f ':'')+(last?'l':'')+'" data-i="'+index+'"><a href="'+escP(msg.dl)+'" download="'+escP(msg.f||'attachment')+'" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">'+escP(msg.f||'Attachment')+'</a><span class="mt">'+fmtT(msg.ts)+'</span></div>';
  return bubBase(msg,first,last,index);
 };
 openF=openLiveFileP;mk=t=>createLiveFileP(t==='dir'?'folder':'file');menu=fileMenuP;
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
 injectStyleP();installBridgeP();
 try{const auth=await apiP('auth/status');try{await apiP('status');document.body.classList.add('aharane-authenticated');await connectLiveP()}catch{loginPanelP();setLoginModeP(Boolean(auth.setupRequired))}}
 catch(error){loginPanelP();setLoginModeP(false);Q('#prod-auth-message').textContent=error.message}
}
window.AharaneStudio={signOut:signOutP,refresh:refreshRuntimeP,openSource:openAppSourceP};
window.openAppSourceP=openAppSourceP;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootP,{once:true});else bootP();
})();