(function(){
'use strict';
if(window.__aharaneWebWorkspaceInstalled)return;
window.__aharaneWebWorkspaceInstalled=true;

// Match the native app: five main destinations only. The Builder and Engines
// are full-screen work areas opened from Home and Files.
Object.keys(T).forEach(k=>delete T[k]);
Object.assign(T,{home:'Home',files:'Files',chats:'Chats',env:'ENV',more:'More'});
const renderBase=render;
const W={
 returnTab:'home',engineReturn:'files',account:'private',
 workflows:[],groups:[],customNodes:[],draft:null,isNew:true,dirty:false,
 loading:false,busy:false,builderReady:false,message:'',messageKind:'info',
 validation:null,testResult:null,search:'',category:'All',selectedNodeId:null,
 pendingSocket:null,configNodeId:null,configDraft:null,zoom:.72,drag:null,
 engines:[],enginesReady:false,engine:null,caps:null,engineMode:'list',
 engineMessage:'',engineBusy:false,engineSearch:'',editingId:null,
 editorName:'',editorId:'',editorVersion:'1',editorInputs:'query:string',
 editorOutputs:'results:list',editorHosts:'',
 editorCode:'export async function run(inputs) {\n  return { results: [inputs.query] }\n}',
 engineTestInputs:'{}',engineResult:null
};
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=v=>JSON.parse(JSON.stringify(v));
const uid=()=>crypto.randomUUID?crypto.randomUUID():'node-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
const notify=m=>typeof toast==='function'?toast(m):console.info(m);
async function api(path,opts){
 opts=Object.assign({credentials:'same-origin',cache:'no-store'},opts||{});
 opts.headers=Object.assign({Accept:'application/json'},opts.headers||{});
 if(opts.body&&typeof opts.body!=='string'){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(opts.body)}
 const response=await fetch('/aharane/api/'+path,opts),raw=await response.text();
 let data={};try{data=raw?JSON.parse(raw):{}}catch{throw new Error('Aharane returned an invalid response.')}
 if(!response.ok)throw new Error(data.error||data.message||('Request failed ('+response.status+').'));
 return data;
}
function newDraft(account=W.account){
 const now=new Date().toISOString();
 return{id:uid(),name:'Untitled command',account,enabled:false,schemaVersion:2,version:2,revision:1,nodes:[],edges:[],createdAt:now,updatedAt:now};
}
function def(type){
 for(const group of W.groups)for(const node of group.nodes||[])if(node.type===type)return node;
 const custom=W.customNodes.find(node=>node.type===type||node.id===type);
 return custom?.definition||custom||null;
}
function selectedNode(){return W.draft?.nodes.find(node=>node.id===W.selectedNodeId)||null}
function markDirty(){W.dirty=true;W.validation=null;W.testResult=null}
function note(message,kind='info'){W.message=message;W.messageKind=kind;renderWorkspace()}
function nodeAccent(type,category){
 const value=String(category||type||'').toLowerCase();
 if(value.includes('trigger')||value.includes('event'))return'trigger';
 if(value.includes('message')||value.includes('newsletter'))return'message';
 if(value.includes('contact')||value.includes('chat')||value.includes('profile'))return'people';
 if(value.includes('group')||value.includes('participant'))return'group';
 if(value.includes('condition')||value.includes('compar'))return'condition';
 if(value.includes('flow'))return'flow';
 if(value.includes('variable')||value.includes('conversion'))return'variable';
 if(value.includes('media')||value.includes('attachment')||value.includes('view once'))return'media';
 return'tool';
}
function glyph(type){
 if(type.startsWith('trigger.'))return'⚡';
 if(type.startsWith('message.')||type.startsWith('newsletter.'))return'◌';
 if(type.startsWith('contact.')||type.startsWith('group.')||type.startsWith('profile.'))return'♧';
 if(type.startsWith('moderation.'))return'⬡';
 if(type.startsWith('condition.')||type.startsWith('flow.'))return'⑂';
 if(type.startsWith('media.'))return'▧';
 if(type.startsWith('value.'))return'ƒ';
 return'◆';
}
function injectHomeEntry(){
 const view=document.getElementById('view');if(!view||S.tab!=='home'||S.sub)return;
 const heading=[...view.querySelectorAll('h2')].find(el=>el.textContent.trim()==='Setup');
 const card=heading?.nextElementSibling;
 if(!card?.classList.contains('card')||card.querySelector('[data-open-web-builder]'))return;
 const row=document.createElement('button');
 row.type='button';row.className='row';row.dataset.openWebBuilder='1';
 row.innerHTML='<span class="ic" aria-hidden="true">⌘</span><span class="grow"><div class="t">Visual command builder</div><div class="d" style="white-space:normal;line-height:1.4">Create WhatsApp commands with connected workflow nodes</div></span><span class="d">›</span>';
 row.onclick=openWebCommandBuilder;card.appendChild(row);
}
function injectEnginesFolder(){
 const view=document.getElementById('view');
 if(!view||S.tab!=='files'||S.sub||S.ed||(S.path||[]).length)return;
 const list=view.querySelector('.file-list');if(!list)return;
 const existing=list.querySelector('[data-open="Engines"]');
 if(existing){const wrapper=existing.parentElement?.tagName==='DIV'?existing.parentElement:null;if(wrapper)wrapper.remove()}
 if(list.querySelector('[data-open-engine-library]'))return;
 const row=document.createElement('div');row.className='row';row.style.cssText='padding:0 4px 0 14px';
 row.innerHTML='<span class="ic dir" aria-hidden="true">▰</span><button type="button" class="row" style="border:0;padding:8px 0" data-open-engine-library><span class="ic" aria-hidden="true">E</span><span class="grow"><div class="t">Engines</div><div class="d">Open reusable Engine library</div></span></button><span class="d">›</span>';
 row.querySelector('[data-open-engine-library]').onclick=()=>openWebEngineLibrary('files');
 list.appendChild(row);
}
function openWorkspace(subpage,returnTab){
 W.returnTab=returnTab;S.sub=subpage;
 document.body.classList.add('aharane-workspace-open');
 renderWorkspace();window.scrollTo(0,0);
}
function openWebCommandBuilder(){
 W.returnTab='home';W.account='private';W.builderReady=false;W.loading=false;W.draft=null;
 W.workflows=[];W.groups=[];W.customNodes=[];W.isNew=true;W.dirty=false;W.message='';
 openWorkspace('web-builder','home');void loadBuilder();
}
function openWebEngineLibrary(source){
 const fromBuilder=source==='builder';
 W.engineReturn=fromBuilder?'builder':'files';W.returnTab=fromBuilder?'home':'files';
 W.enginesReady=false;W.engines=[];W.engine=null;W.caps=null;W.engineResult=null;W.engineMode='list';W.engineMessage='';
 openWorkspace('web-engines',W.returnTab);void loadEngines();
}
function backFromWorkspace(){
 S.sub=null;S.tab=W.returnTab==='files'?'files':'home';
 W.configNodeId=null;W.configDraft=null;W.pendingSocket=null;W.drag=null;
 document.body.classList.remove('aharane-workspace-open');
 renderBase();injectHomeEntry();injectEnginesFolder();window.scrollTo(0,0);
}
window.openWebCommandBuilder=openWebCommandBuilder;
window.openWebEngineLibrary=openWebEngineLibrary;

async function loadBuilder(){
 if(W.loading)return;W.loading=true;renderWorkspace();
 try{
  const response=await api('visual-commands?account='+W.account);
  if(S.sub!=='web-builder')return;
  W.workflows=Array.isArray(response.workflows)?response.workflows:[];
  W.groups=Array.isArray(response.library)?response.library:[];
  W.customNodes=Array.isArray(response.customNodes)?response.customNodes:[];
  W.draft=W.workflows[0]?clone(W.workflows[0]):newDraft(W.account);
  W.isNew=!W.workflows.length;W.dirty=false;W.selectedNodeId=W.draft.nodes[0]?.id||null;
  W.validation=W.draft.validation||null;W.message='';W.builderReady=true;
 }catch(error){
  W.draft=W.draft||newDraft(W.account);W.message=error.message;W.messageKind='error';W.builderReady=true;
 }finally{W.loading=false;renderWorkspace()}
}
function switchBuilderAccount(account){
 if(W.dirty){note('Save your current command before switching accounts.','error');return}
 W.account=account;W.workflows=[];W.groups=[];W.customNodes=[];W.draft=null;W.builderReady=false;W.isNew=true;W.selectedNodeId=null;W.validation=null;void loadBuilder();
}
function addNode(type){
 if(type==='trigger.message'&&W.account==='private'){note('Private commands are triggered only from the owner self-chat. Message-event triggers are Public only.','error');return}
 const definition=def(type);if(!definition){note('That node is not in the verified node library.','error');return}
 const index=W.draft.nodes.length;
 const node={id:uid(),type,x:85+(index%3)*305,y:90+Math.floor(index/3)*230,config:{}};
 if(type==='trigger.command')Object.assign(node.config,{command:'newcommand',aliases:'',chatScope:'direct',maxMessagesPerRun:'10',requireQuoted:'false',requireReply:'false'});
 if(type==='trigger.message')Object.assign(node.config,{chatScope:'direct',maxMessagesPerRun:'10'});
 if(type==='flow.repeat')node.config.count='2';
 if(type==='flow.delay')node.config.milliseconds='1000';
 W.draft.nodes.push(node);W.selectedNodeId=node.id;W.pendingSocket=null;markDirty();renderWorkspace();
}
function portMarkup(node,definition,direction){
 const ports=definition?.ports?.[direction]||[];if(!ports.length)return'';
 return '<div class="wb-node-port-list '+(direction==='inputs'?'inputs':'outputs')+'">'+ports.map(port=>{
  const output=direction==='outputs',key=node.id+'|'+port.id+'|'+(output?'out':'in'),pending=W.pendingSocket?.key===key;
  return '<div class="wb-port-row '+(output?'out':'in')+'"><button type="button" class="wb-socket type-'+esc(port.type)+' '+(pending?'pending':'')+'" data-wb-socket data-node="'+esc(node.id)+'" data-socket="'+esc(port.id)+'" data-direction="'+(output?'out':'in')+'" data-type="'+esc(port.type)+'" aria-label="'+(output?'Output ':'Input ')+esc(port.label||port.id)+'"></button><span>'+esc(port.label||port.id)+'</span><small>'+esc(port.type)+'</small></div>';
 }).join('')+'</div>';
}
function renderNode(node,index){
 const definition=def(node.type)||{name:node.type,description:'This saved node type is not in the current library.',category:'Other',ports:{inputs:[],outputs:[]}};
 const errors=(W.validation?.errors||[]).filter(item=>item.nodeId===node.id);
 return '<article class="wb-node-card '+(W.selectedNodeId===node.id?'selected':'')+' accent-'+nodeAccent(node.type,definition.category)+'" data-wb-node="'+esc(node.id)+'" data-wb-open-config="'+esc(node.id)+'" style="left:'+(Number(node.x)||0)+'px;top:'+(Number(node.y)||0)+'px">'+
 '<header class="wb-node-head" data-wb-drag="'+esc(node.id)+'"><span class="wb-node-icon">'+glyph(node.type)+'</span><span class="wb-node-title"><b>'+esc(definition.name||node.type)+'</b><small>'+esc(definition.description||'')+'</small></span><button type="button" class="wb-node-config" data-wb-config="'+esc(node.id)+'" aria-label="Configure '+esc(definition.name||node.type)+'">⋯</button></header>'+
 '<div class="wb-node-code">'+esc(node.type)+'</div><div class="wb-node-ports">'+portMarkup(node,definition,'inputs')+portMarkup(node,definition,'outputs')+'</div>'+
 (errors.length?'<div class="wb-node-warning">'+esc(errors[0].message||'Check this node')+'</div>':'')+
 '<footer class="wb-node-foot"><span>NODE '+String(index+1).padStart(2,'0')+'</span><span>'+esc(definition.category||'Action')+'</span></footer></article>';
}
function libraryMarkup(){
 const categories=['All',...W.groups.map(group=>group.category||group.name).filter(Boolean)];
 const visible=W.groups.map(group=>{
  const name=group.category||group.name;if(W.category!=='All'&&W.category!==name)return'';
  const nodes=(group.nodes||[]).filter(node=>!W.search||String(node.name+' '+node.description+' '+node.type).toLowerCase().includes(W.search.toLowerCase()));
  if(!nodes.length)return'';
  return '<section class="wb-lib-category"><div class="wb-lib-category-title">'+esc(name)+' <small>'+nodes.length+'</small></div><div class="wb-lib-grid">'+nodes.map(node=>'<button type="button" class="wb-lib-node accent-'+nodeAccent(node.type,name)+'" data-wb-add="'+esc(node.type)+'"><span class="wb-lib-icon">'+glyph(node.type)+'</span><span><b>'+esc(node.name)+'</b><small>'+esc(node.description||'')+'</small></span><i>＋</i></button>').join('')+'</div></section>';
 }).join('');
 return '<section class="wb-library-panel"><div class="wb-library-heading"><div><small>AVAILABLE NODES</small><h2>Node library</h2><p>'+W.groups.reduce((sum,group)=>sum+(group.nodes||[]).length,0)+' verified node types</p></div><button type="button" class="wb-text-button" data-wb-manage-engines>My Engines</button></div><label class="wb-search-wrap"><span>⌕</span><input id="wb-search" value="'+esc(W.search)+'" placeholder="Search nodes…" aria-label="Search nodes"></label><div class="wb-category-chips">'+categories.map(category=>'<button type="button" class="'+(W.category===category?'active':'')+'" data-wb-category="'+esc(category)+'">'+esc(category)+'</button>').join('')+'</div><div class="wb-lib-scroll">'+(visible||'<p class="wb-muted">No node types match this search.</p>')+'</div></section>';
}
const NODE_FIELDS={
 'group.updateSubject':[['subject','New group name','text']],
 'group.updateDescription':[['description','New group description','textarea']],
 'group.participantsUpdate':[['action','Action (add/remove/promote/demote)','text'],['participants','Phone numbers, one per line','textarea']],
 'group.settingUpdate':[['setting','Setting (announcement/not_announcement/locked/unlocked)','text']],
 'moderation.blockContact':[['phone','Contact phone number','text']],
 'moderation.unblockContact':[['phone','Contact phone number','text']],
 'profile.updateName':[['name','Profile name','text']],
 'profile.updateStatus':[['status','Profile status','text']],
 'newsletter.create':[['name','Newsletter name','text'],['description','Newsletter description','textarea']],
 'newsletter.follow':[['newsletterJid','Newsletter JID','text']],
 'newsletter.unfollow':[['newsletterJid','Newsletter JID','text']],
 'newsletter.publishText':[['newsletterJid','Newsletter JID','text'],['text','Post text','textarea']],
 'message.sendText':[['text','Message text','textarea']],
 'message.replyText':[['text','Message text','textarea']],
 'message.react':[['emoji','Emoji','text']],
 'message.sendViewOnceText':[['text','View Once text (beta; requires account rollout)','textarea']],
 'media.sendViewOnce':[['kind','Media type','select:kind'],['caption','Caption (optional)','textarea']],
 'media.sendMedia':[['kind','Media type','select:kind'],['caption','Caption (optional)','textarea']],
 'message.editOriginal':[['text','Replacement text','textarea']],
 'message.pinOriginal':[['action','Action (pin/unpin)','text'],['seconds','Duration in seconds','number']],
 'message.keepOriginal':[['action','Action (keep/unkeep)','text']],
 'chat.setDisappearing':[['seconds','Timer seconds','number']],
 'message.sendPoll':[['title','Poll question','text'],['options','Options, one per line','textarea'],['selectableCount','Selectable answers (1–12)','number']],
 'message.sendLocation':[['latitude','Latitude (-90 to 90)','number'],['longitude','Longitude (-180 to 180)','number'],['name','Location label','text']],
 'contact.sendCard':[['name','Contact display name','text'],['phone','Phone number','text']],
 'message.sendButtons':[['text','Message text','textarea'],['buttons','One per line: Label|id','textarea']],
 'condition.equals':[['left','Left value','text'],['right','Right value','text']],
 'condition.contains':[['text','Text to inspect','text'],['search','Contains','text']],
 'variable.set':[['key','Variable name','text'],['value','Value','textarea']],
 'variable.get':[['key','Variable name','text']],
 'counter.increment':[['key','Counter name','text']],
 'flow.delay':[['milliseconds','Wait duration (0–10000 ms)','number']],
 'flow.repeat':[['count','Repeat count (1–10)','number']],
 'media.sendImage':[['caption','Image caption (optional)','textarea']],
 'media.sendImages':[['caption','Image caption (optional)','textarea'],['limit','Maximum messages (1–20)','number']],
 'value.toList':[['separator','List separator (default comma)','text']]
};
function configField(key,label,type,value){
 const id='wb-config-'+key,attributes='data-wb-config-field="'+esc(key)+'" data-type="'+type+'"',val=value??'';
 if(type==='boolean')return '<label class="wb-config-field toggle"><span>'+esc(label)+'</span><input type="checkbox" '+attributes+' '+(String(val)==='true'?'checked':'')+'></label>';
 if(type==='number')return '<label class="wb-config-field"><span>'+esc(label)+'</span><input type="number" id="'+id+'" '+attributes+' value="'+esc(val)+'"></label>';
 if(type.startsWith('select:')){
  const options=type==='select:kind'?['image','video','audio','document','sticker']:[];
  return '<label class="wb-config-field"><span>'+esc(label)+'</span><select id="'+id+'" '+attributes+'>'+options.map(option=>'<option value="'+option+'" '+(val===option?'selected':'')+'>'+option+'</option>').join('')+'</select></label>';
 }
 if(type==='textarea')return '<label class="wb-config-field"><span>'+esc(label)+'</span><textarea id="'+id+'" rows="3" '+attributes+'>'+esc(val)+'</textarea></label>';
 return '<label class="wb-config-field"><span>'+esc(label)+'</span><input type="text" id="'+id+'" '+attributes+' value="'+esc(val)+'"></label>';
}
function configDialogMarkup(){
 const node=W.draft?.nodes.find(item=>item.id===W.configNodeId);if(!node)return'';
 const definition=def(node.type)||{name:node.type,description:'Saved node definition unavailable.',category:'Node',ports:{inputs:[],outputs:[]}};
 const config=W.configDraft||clone(node.config||{});let fields='';
 const add=(key,label,type='text')=>{fields+=configField(key,label,type,config[key]??'')};
 if(node.type==='trigger.command'){add('command','Command name');add('aliases','Aliases, comma-separated or one per line','textarea');add('maxMessagesPerRun','Maximum messages per execution (1–500)','number')}
 else if(node.type==='trigger.message')add('maxMessagesPerRun','Maximum messages per execution (1–500)','number');
 else{
  (NODE_FIELDS[node.type]||[]).forEach(([key,label,type])=>add(key,label,type));
  if(node.type.startsWith('custom.')||node.type.startsWith('engine.'))(definition.ports?.inputs||[]).filter(port=>port.type!=='exec').forEach(port=>add(port.id,port.label+' ('+port.type+')',port.type==='number'?'number':port.type==='list'?'textarea':'text'));
 }
 let extra='';
 if(node.type==='trigger.command'||node.type==='trigger.message'){
  const options=['direct','groups','both'].filter(value=>W.account==='public'||value==='direct'),scope=config.chatScope||'direct';
  extra='<div class="wb-config-section"><h3>Chat scope</h3><div class="wb-scope-options">'+options.map(value=>'<button type="button" class="'+(scope===value?'active':'')+'" data-wb-scope="'+value+'">'+({direct:'Direct',groups:'Groups',both:'Both'}[value])+'</button>').join('')+'</div><p class="wb-config-note">'+(W.account==='private'?'Private commands stay in the owner self-chat.':'Public group execution remains subject to the existing group authorization rules.')+'</p></div>';
 }
 if(node.type==='trigger.command')extra+='<div class="wb-config-section">'+[['requireQuoted','Require a quoted message'],['requireReply','Only accept replies']].map(([key,label])=>'<label class="wb-config-field toggle"><span>'+label+'</span><input type="checkbox" data-wb-config-field="'+key+'" data-type="boolean" '+(String(config[key])==='true'?'checked':'')+'></label>').join('')+'</div>';
 const edges=W.draft.edges.filter(edge=>edge.from===node.id||edge.to===node.id);
 return '<div class="wb-modal-scrim" data-wb-modal-close><section class="wb-config-dialog" role="dialog" aria-modal="true" aria-labelledby="wb-config-title"><header><div class="wb-config-icon accent-'+nodeAccent(node.type,definition.category)+'">'+glyph(node.type)+'</div><div class="wb-config-heading"><small>'+esc(definition.category||'NODE')+'</small><h2 id="wb-config-title">'+esc(definition.name||node.type)+'</h2><p>'+esc(definition.description||'')+'</p></div><button type="button" data-wb-cancel-config aria-label="Close">×</button></header><div class="wb-config-meta"><code>'+esc(node.type)+'</code><span>'+(definition.ports?.inputs||[]).length+' inputs · '+(definition.ports?.outputs||[]).length+' outputs</span></div><div class="wb-config-body"><h3>Settings</h3>'+(fields||'<div class="wb-config-note">This node uses connected typed sockets. Connect compatible outputs and inputs on the canvas.</div>')+extra+'<section><h3>Connections <small>'+edges.length+'</small></h3>'+(edges.length?edges.map(edge=>'<div class="wb-config-edge"><span>'+esc(edge.from===node.id?'Output '+edge.fromSocket+' → '+edge.toSocket:'Input '+edge.toSocket+' ← '+edge.fromSocket)+'</span><button type="button" data-wb-remove-edge="'+esc(edge.id)+'">Remove</button></div>').join(''):'<p class="wb-config-note">Tap an output socket, then a compatible input socket on another node to connect them.</p>')+'</section></div><footer><button type="button" class="wb-action danger" data-wb-delete-node>Delete node</button><button type="button" class="wb-action secondary" data-wb-disconnect>Disconnect</button><span></span><button type="button" class="wb-action secondary" data-wb-cancel-config>Cancel</button><button type="button" class="wb-action primary" data-wb-apply-config>Apply changes</button></footer></section></div>';
}
function renderBuilderPage(){
 const workflow=W.draft||newDraft(),nodes=workflow.nodes||[],edges=workflow.edges||[];
 const saved=W.workflows.map(item=>'<option value="'+esc(item.id)+'" '+(!W.isNew&&item.id===workflow.id?'selected':'')+'>'+esc(item.name||item.id)+(item.enabled?' · Active':' · Draft')+'</option>').join('');
 const status=W.message?'<div class="wb-inline-message '+(W.messageKind==='error'?'error':W.messageKind==='success'?'success':'')+'">'+esc(W.message)+'</div>':W.validation?'<div class="wb-inline-message '+(W.validation.valid?'success':'error')+'">'+(W.validation.valid?'Validation passed':'Validation needs attention')+' · '+(W.validation.summary?.errors||0)+' errors · '+(W.validation.summary?.warnings||0)+' warnings</div>':'';
 const issues=[...(W.validation?.errors||[]),...(W.validation?.warnings||[])];
 return '<main class="wb-workspace wb-command-screen"><header class="wb-topbar"><button type="button" class="wb-back" data-wb-back><span>‹</span> Home</button><div class="wb-brand"><small>COMMAND STUDIO</small><h1>Visual command builder</h1></div><div class="wb-top-actions"><label class="wb-account-switch"><span>ACCOUNT</span><select id="wb-account"><option value="private" '+(W.account==='private'?'selected':'')+'>Private</option><option value="public" '+(W.account==='public'?'selected':'')+'>Public</option></select></label><select id="wb-saved" class="wb-saved-select" aria-label="Saved commands"><option value="">Saved commands…</option>'+saved+'</select><button type="button" class="wb-action secondary" data-wb-new>New</button><button type="button" class="wb-action secondary" data-wb-manage-engines>My Engines</button><button type="button" class="wb-action secondary" data-wb-test '+(W.isNew?'disabled':'')+'>Test</button><button type="button" class="wb-action primary" data-wb-save>'+(W.busy?'Saving…':'Save')+'</button></div></header>'+
 '<div class="wb-workflow-strip"><div><span class="wb-live-dot"></span><span>'+(W.account==='private'?'Private self-chat':'Public WhatsApp')+'</span><span class="wb-dot-sep">·</span><span>'+nodes.length+' nodes</span><span class="wb-dot-sep">·</span><span>'+edges.length+' connections</span><span class="wb-dot-sep">·</span><span>'+(W.dirty?'Unsaved changes':'Saved')+'</span></div><label class="wb-workflow-name"><span>COMMAND NAME</span><input id="wb-name" value="'+esc(workflow.name)+'" maxlength="80" placeholder="Name this command"></label><label class="wb-enabled"><input id="wb-enabled" type="checkbox" '+(workflow.enabled?'checked':'')+'><span>Enabled</span></label></div>'+status+
 '<div class="wb-builder-layout"><section class="wb-canvas-section"><div class="wb-section-toolbar"><div><small>WORKSPACE</small><b>Build your flow</b></div><span class="wb-hint">Drag nodes · tap sockets to connect · tap a node to configure</span><div class="wb-canvas-tools"><button type="button" data-wb-fit>Fit</button><button type="button" data-wb-zoom="-" title="Zoom out">−</button><span id="wb-zoom-label">'+Math.round(W.zoom*100)+'%</span><button type="button" data-wb-zoom="+" title="Zoom in">＋</button></div></div>'+
 '<div class="wb-viewport" id="wb-viewport"><div class="wb-world-frame" id="wb-world-frame"><div class="wb-world" id="wb-world"><svg class="wb-wires" id="wb-wires" viewBox="0 0 2400 1800" preserveAspectRatio="none"></svg>'+(nodes.length?nodes.map(renderNode).join(''):'<div class="wb-canvas-empty"><span>⌘</span><b>Your command starts here</b><p>Add a trigger from the Node Library, then connect it to actions. Select a node to configure it.</p></div>')+'</div></div><div class="wb-canvas-help">Pan around the canvas · drag a node to arrange your command</div></div>'+
 (W.pendingSocket?'<div class="wb-connect-banner">Choose a compatible '+(W.pendingSocket.direction==='out'?'input':'output')+' socket to finish this connection. <button type="button" data-wb-cancel-connect>Cancel</button></div>':'')+'</section>'+libraryMarkup()+'</div>'+
 (issues.length?'<section class="wb-validation-panel"><b>Validation</b>'+issues.map(item=>'<div class="wb-validation-row"><span class="'+(item.severity==='warning'?'warn':'error')+'">'+esc(item.severity||'error')+'</span><div>'+esc(item.message||'')+'<small>'+esc(item.fix||'')+'</small></div></div>').join('')+'</section>':'')+
 (W.testResult?'<section class="wb-test-result"><b>Latest safe test</b><pre>'+esc(JSON.stringify(W.testResult,null,2))+'</pre></section>':'')+(W.configNodeId?configDialogMarkup():'')+'</main>';
}
function updateZoom(){
 const frame=document.getElementById('wb-world-frame'),world=document.getElementById('wb-world'),label=document.getElementById('wb-zoom-label');
 if(frame){frame.style.width=(2400*W.zoom)+'px';frame.style.height=(1800*W.zoom)+'px'}
 if(world)world.style.transform='scale('+W.zoom+')';
 if(label)label.textContent=Math.round(W.zoom*100)+'%';
}
function drawWires(){
 const world=document.getElementById('wb-world'),svg=document.getElementById('wb-wires');if(!world||!svg)return;
 const rect=world.getBoundingClientRect(),paths=[];
 (W.draft?.edges||[]).forEach(edge=>{
  const from=document.querySelector('[data-wb-socket][data-node="'+CSS.escape(edge.from)+'"][data-socket="'+CSS.escape(edge.fromSocket)+'"][data-direction="out"]');
  const to=document.querySelector('[data-wb-socket][data-node="'+CSS.escape(edge.to)+'"][data-socket="'+CSS.escape(edge.toSocket)+'"][data-direction="in"]');
  if(!from||!to)return;
  const a=from.getBoundingClientRect(),b=to.getBoundingClientRect();
  const x1=(a.left+a.width/2-rect.left)/W.zoom,y1=(a.top+a.height/2-rect.top)/W.zoom,x2=(b.left+b.width/2-rect.left)/W.zoom,y2=(b.top+b.height/2-rect.top)/W.zoom;
  const bend=Math.max(38,Math.abs(x2-x1)*.48);
  const color=edge.fromSocket==='yes'?'#27855e':edge.fromSocket==='no'?'#c14e54':from.dataset.type==='string'?'#3f78b9':from.dataset.type==='number'?'#a47a35':from.dataset.type==='boolean'?'#9868a5':from.dataset.type==='message'?'#4a8992':'#64877a';
  paths.push('<path d="M'+x1+' '+y1+' C'+(x1+bend)+' '+y1+' '+(x2-bend)+' '+y2+' '+x2+' '+y2+'" stroke="'+color+'" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="'+x2+'" cy="'+y2+'" r="4" fill="'+color+'"/>');
 });
 svg.innerHTML=paths.join('');
}
function fitCanvas(){
 const viewport=document.getElementById('wb-viewport');if(!viewport||!W.draft?.nodes?.length)return;
 const minX=Math.min(...W.draft.nodes.map(node=>Number(node.x)||0)),minY=Math.min(...W.draft.nodes.map(node=>Number(node.y)||0));
 const maxX=Math.max(...W.draft.nodes.map(node=>(Number(node.x)||0)+270)),maxY=Math.max(...W.draft.nodes.map(node=>(Number(node.y)||0)+190));
 W.zoom=Math.min(1.25,Math.max(.28,Math.min((viewport.clientWidth-100)/(maxX-minX+180),(viewport.clientHeight-90)/(maxY-minY+140))));
 updateZoom();requestAnimationFrame(()=>{viewport.scrollLeft=Math.max(0,(minX+600)*W.zoom-60);viewport.scrollTop=Math.max(0,(minY+420)*W.zoom-50);drawWires()});
}
function renderWorkspace(){
 nav();if(typeof pill==='function')pill();
 const view=document.getElementById('view');if(!view)return;
 document.body.classList.add('aharane-workspace-open');view.className='pg wb-view';
 if(S.sub==='web-builder'){
  view.innerHTML=W.draft?renderBuilderPage():'<main class="wb-workspace"><div class="wb-topbar"><button class="wb-back" data-wb-back>‹ Home</button><h1>Visual command builder</h1></div><div class="wb-loading">Loading your command library…</div></main>';
  bindBuilder();if(W.draft){updateZoom();requestAnimationFrame(drawWires)}if(!W.builderReady&&!W.loading)void loadBuilder();
 }else if(S.sub==='web-engines'){
  view.innerHTML='<main class="wb-workspace wb-engine-screen">'+renderEnginePage()+'</main>';
  bindEnginePage();if(!W.enginesReady&&!W.engineBusy)void loadEngines();
 }
}
function connectSockets(button){
 const current={nodeId:button.dataset.node,socketId:button.dataset.socket,direction:button.dataset.direction,type:button.dataset.type,key:button.dataset.node+'|'+button.dataset.socket+'|'+button.dataset.direction};
 if(!W.pendingSocket){W.pendingSocket=current;renderWorkspace();return}
 const first=W.pendingSocket;if(first.key===current.key){W.pendingSocket=null;renderWorkspace();return}
 const output=first.direction==='out'?first:current.direction==='out'?current:null;
 const input=first.direction==='in'?first:current.direction==='in'?current:null;
 if(!output||!input||output.type!==input.type||output.nodeId===input.nodeId){note('Connect an output to a matching input on a different node.','error');W.pendingSocket=null;return}
 if(W.draft.edges.some(edge=>edge.from===output.nodeId&&edge.fromSocket===output.socketId&&edge.to===input.nodeId&&edge.toSocket===input.socketId)){note('That connection already exists.','error');W.pendingSocket=null;return}
 W.draft.edges.push({id:uid(),from:output.nodeId,fromSocket:output.socketId,to:input.nodeId,toSocket:input.socketId});
 W.pendingSocket=null;markDirty();W.message='Connection added.';renderWorkspace();
}
function updateConfigField(target){
 if(!W.configDraft)return;
 const type=target.dataset.type||'text';
 W.configDraft[target.dataset.wbConfigField]=type==='boolean'?String(target.checked):target.value;
}
function applyNodeConfig(){
 const node=W.draft.nodes.find(item=>item.id===W.configNodeId);if(!node)return;
 const config=clone(W.configDraft||{});
 if(node.type==='trigger.command'){
  config.command=String(config.command||'').trim().replace(/^\.+/,'');
  config.aliases=String(config.aliases||'').split(/[,\n]/).map(value=>value.trim()).filter(Boolean).join(',');
  if(!config.command){note('Command name is required.','error');return}
  W.draft.name=config.command;
 }
 if(node.type==='trigger.command'||node.type==='trigger.message'){
  if(W.account==='private')config.chatScope='direct';
  else config.chatScope=config.chatScope||'direct';
 }
 node.config=config;W.configNodeId=null;W.configDraft=null;markDirty();W.message='Node configuration applied.';renderWorkspace();
}
function deleteConfiguredNode(){
 const id=W.configNodeId;if(!id)return;
 W.draft.nodes=W.draft.nodes.filter(node=>node.id!==id);
 W.draft.edges=W.draft.edges.filter(edge=>edge.from!==id&&edge.to!==id);
 if(W.selectedNodeId===id)W.selectedNodeId=null;
 W.configNodeId=null;W.configDraft=null;W.pendingSocket=null;markDirty();renderWorkspace();
}
function bindBuilder(){
 const view=document.getElementById('view');if(!view)return;
 view.onclick=async event=>{
  const button=event.target.closest('[data-wb-back],[data-wb-save],[data-wb-test],[data-wb-add],[data-wb-category],[data-wb-manage-engines],[data-wb-config],[data-wb-open-config],[data-wb-apply-config],[data-wb-cancel-config],[data-wb-delete-node],[data-wb-disconnect],[data-wb-remove-edge],[data-wb-socket],[data-wb-new],[data-wb-fit],[data-wb-zoom],[data-wb-cancel-connect],[data-wb-scope]');
  if(!button)return;
  if(button.hasAttribute('data-wb-back')){backFromWorkspace();return}
  if(button.hasAttribute('data-wb-save')){await saveWorkflow();return}
  if(button.hasAttribute('data-wb-test')){await testWorkflow();return}
  if(button.dataset.wbAdd){addNode(button.dataset.wbAdd);return}
  if(button.dataset.wbCategory){W.category=button.dataset.wbCategory;renderWorkspace();return}
  if(button.hasAttribute('data-wb-manage-engines')){openWebEngineLibrary('builder');return}
  if(button.dataset.wbScope){W.configDraft.chatScope=button.dataset.wbScope;renderWorkspace();return}
  if(button.dataset.wbConfig||button.dataset.wbOpenConfig){const id=button.dataset.wbConfig||button.dataset.wbOpenConfig,node=W.draft.nodes.find(item=>item.id===id);if(node){W.selectedNodeId=id;W.configNodeId=id;W.configDraft=clone(node.config||{});renderWorkspace()}return}
  if(button.hasAttribute('data-wb-cancel-config')){W.configNodeId=null;W.configDraft=null;renderWorkspace();return}
  if(button.hasAttribute('data-wb-modal-close')&&event.target===button){W.configNodeId=null;W.configDraft=null;renderWorkspace();return}
  if(button.hasAttribute('data-wb-apply-config')){applyNodeConfig();return}
  if(button.hasAttribute('data-wb-delete-node')){deleteConfiguredNode();return}
  if(button.hasAttribute('data-wb-disconnect')){const id=W.configNodeId;W.draft.edges=W.draft.edges.filter(edge=>edge.from!==id&&edge.to!==id);W.configNodeId=null;W.configDraft=null;W.pendingSocket=null;markDirty();renderWorkspace();return}
  if(button.dataset.wbRemoveEdge){W.draft.edges=W.draft.edges.filter(edge=>edge.id!==button.dataset.wbRemoveEdge);markDirty();renderWorkspace();return}
  if(button.dataset.wbSocket){connectSockets(button);return}
  if(button.hasAttribute('data-wb-new')){if(W.dirty&&!confirm('Discard unsaved command changes and create a new command?'))return;W.draft=newDraft(W.account);W.isNew=true;W.dirty=false;W.validation=null;W.testResult=null;W.selectedNodeId=null;W.message='';renderWorkspace();return}
  if(button.hasAttribute('data-wb-fit')){fitCanvas();return}
  if(button.dataset.wbZoom){W.zoom=Math.min(1.5,Math.max(.28,W.zoom+(button.dataset.wbZoom==='+'?.1:-.1)));updateZoom();requestAnimationFrame(drawWires);return}
  if(button.hasAttribute('data-wb-cancel-connect')){W.pendingSocket=null;renderWorkspace();return}
 };
 view.onchange=event=>{
  const target=event.target;
  if(target.id==='wb-account'){switchBuilderAccount(target.value);return}
  if(target.id==='wb-saved'&&target.value)loadWorkflow(target.value);
  if(target.id==='wb-enabled'&&W.draft){W.draft.enabled=target.checked;markDirty()}
  if(target.dataset.wbConfigField)updateConfigField(target);
 };
 view.oninput=event=>{
  const target=event.target;
  if(target.id==='wb-name'&&W.draft){W.draft.name=target.value;markDirty();return}
  if(target.id==='wb-search'){W.search=target.value;const position=target.selectionStart;renderWorkspace();const next=document.getElementById('wb-search');if(next){next.focus();next.setSelectionRange(position,position)}return}
  if(target.dataset.wbConfigField)updateConfigField(target);
 };
 view.onpointerdown=event=>{
  const handle=event.target.closest('[data-wb-drag]');if(!handle||event.target.closest('button'))return;
  const id=handle.dataset.wbDrag,node=W.draft?.nodes.find(item=>item.id===id);if(!node)return;
  W.drag={nodeId:id,startX:event.clientX,startY:event.clientY,startNodeX:Number(node.x)||0,startNodeY:Number(node.y)||0,moved:false};
  try{handle.setPointerCapture(event.pointerId)}catch{}event.preventDefault();
 };
 view.onpointermove=event=>{
  if(!W.drag)return;const node=W.draft?.nodes.find(item=>item.id===W.drag.nodeId);if(!node)return;
  const dx=(event.clientX-W.drag.startX)/W.zoom,dy=(event.clientY-W.drag.startY)/W.zoom;
  if(Math.abs(dx)+Math.abs(dy)>3)W.drag.moved=true;
  node.x=Math.max(-450,Math.round(W.drag.startNodeX+dx));node.y=Math.max(-350,Math.round(W.drag.startNodeY+dy));
  const card=view.querySelector('[data-wb-node="'+CSS.escape(node.id)+'"]');if(card){card.style.left=(node.x+600)+'px';card.style.top=(node.y+420)+'px'}drawWires();
 };
 view.onpointerup=()=>{if(W.drag){if(W.drag.moved)markDirty();W.drag=null}};
 view.onpointercancel=()=>{if(W.drag){markDirty();W.drag=null}};
}
async function saveWorkflow(){
 if(W.busy||!W.draft)return;W.busy=true;renderWorkspace();
 try{
  const workflow=clone(W.draft);workflow.name=String(document.getElementById('wb-name')?.value||workflow.name||'Untitled command').trim();workflow.enabled=Boolean(document.getElementById('wb-enabled')?.checked);workflow.account=W.account;
  const isNew=W.isNew,path=isNew?'visual-commands':'visual-commands/'+encodeURIComponent(workflow.id);
  const response=await api(path,{method:isNew?'POST':'PUT',body:isNew?{workflow}:{workflow,expectedRevision:workflow.revision}});
  W.draft=response.workflow;W.validation=response.validation||null;W.isNew=false;W.dirty=false;
  const index=W.workflows.findIndex(item=>item.id===W.draft.id);if(index>=0)W.workflows[index]=clone(W.draft);else W.workflows.unshift(clone(W.draft));
  W.message='Command saved successfully.';W.messageKind='success';notify('Command saved');
 }catch(error){W.message=error.message;W.messageKind='error'}
 finally{W.busy=false;renderWorkspace()}
}
async function testWorkflow(){
 if(W.isNew){note('Save this command before testing it.','error');return}
 W.busy=true;W.message='Running safe test…';renderWorkspace();
 try{W.testResult=await api('visual-commands/'+encodeURIComponent(W.draft.id)+'/test',{method:'POST',body:{}});W.message='Safe test completed. Live WhatsApp actions are suppressed.';W.messageKind='success'}
 catch(error){W.message=error.message;W.messageKind='error'}
 finally{W.busy=false;renderWorkspace()}
}
function renderEngineHeader(){
 return '<header class="wb-topbar"><button type="button" class="wb-back" data-engine-back><span>‹</span> '+(W.engineReturn==='builder'?'Command Builder':'Files')+'</button><div class="wb-brand"><small>REUSABLE CAPABILITIES</small><h1>Engine library</h1></div><div class="wb-top-actions"><button type="button" class="wb-action secondary" data-engine-refresh>Refresh</button><button type="button" class="wb-action primary" data-engine-new>＋ Create Engine</button></div></header>';
}
function renderEngineList(){
 const rows=W.engines.filter(item=>!W.engineSearch||String(item.name+' '+item.id).toLowerCase().includes(W.engineSearch.toLowerCase()));
 return renderEngineHeader()+'<div class="wb-engine-intro"><h2>Engines</h2><p>Reusable JavaScript capabilities for your commands. Engines run in Aharane’s restricted server-side runtime; the browser never evaluates Engine source.</p></div>'+(W.engineMessage?'<div class="wb-inline-message error">'+esc(W.engineMessage)+'</div>':'')+
 '<div class="wb-engine-list-toolbar"><label class="wb-search-wrap"><span>⌕</span><input id="wb-engine-search" value="'+esc(W.engineSearch)+'" placeholder="Search Engines"></label><span>'+W.engines.length+' saved</span></div>'+
 (rows.length?'<div class="wb-engine-list">'+rows.map(engine=>'<button type="button" class="wb-engine-row" data-engine-open="'+esc(engine.id)+'"><span class="wb-engine-icon">E</span><span class="wb-engine-name"><b>'+esc(engine.name)+'</b><small>'+esc(engine.id)+' · v'+esc(engine.version)+' · '+(engine.inputs||[]).length+' inputs / '+(engine.outputs||[]).length+' outputs</small><small>'+esc(engine.description||'')+'</small></span><span>›</span></button>').join('')+'</div>':'<div class="wb-empty-state"><span>⌘</span><b>No Engines yet</b><p>Create a reusable Engine, define its inputs and outputs, then use it from the Command Builder.</p><button class="wb-action primary" data-engine-new>Create your first Engine</button></div>');
}
function renderEngineEditor(){
 return '<section class="wb-engine-editor"><div class="wb-engine-editor-heading"><div><small>ENGINE MANIFEST</small><h2>'+(W.editingId?'Edit Engine':'Create Engine')+'</h2><p>Define the contract first. Source executes only inside the isolated server sandbox.</p></div><button class="wb-action secondary" data-engine-cancel>Cancel</button></div>'+
 '<div class="wb-engine-form-grid"><label class="wb-config-field"><span>Engine name</span><input id="we-name" value="'+esc(W.editorName)+'" maxlength="80" placeholder="Text transformer"></label><label class="wb-config-field"><span>Engine ID</span><input id="we-id" value="'+esc(W.editorId)+'" maxlength="48" '+(W.editingId?'disabled':'')+' placeholder="text_transform"></label><label class="wb-config-field"><span>Version</span><input id="we-version" inputmode="numeric" value="'+esc(W.editorVersion)+'"></label><label class="wb-config-field"><span>Inputs · id:type</span><input id="we-inputs" value="'+esc(W.editorInputs)+'" placeholder="query:string"></label><label class="wb-config-field"><span>Outputs · id:type</span><input id="we-outputs" value="'+esc(W.editorOutputs)+'" placeholder="results:list"></label><label class="wb-config-field"><span>Approved HTTPS hosts</span><input id="we-hosts" value="'+esc(W.editorHosts)+'" placeholder="api.example.com"></label></div>'+
 '<label class="wb-config-field wb-code-field"><span>Engine source · export async function run(inputs)</span><textarea id="we-code" spellcheck="false" rows="16">'+esc(W.editorCode)+'</textarea></label><div class="wb-engine-safety">External requests require explicit HTTPS host approval. Filesystem, process, shell and WhatsApp access are never granted to Engine code.</div>'+
 '<div class="wb-engine-editor-actions"><button type="button" class="wb-action secondary" data-engine-cancel>Cancel</button><button type="button" class="wb-action primary" data-engine-save '+(W.engineBusy?'disabled':'')+'>'+(W.engineBusy?'Saving…':'Save Engine')+'</button></div></section>';
}
function renderEngineDetail(){
 const engine=W.engine,manifest=engine.manifest||engine;
 return '<section class="wb-engine-detail"><div class="wb-engine-detail-head"><div><small>ENGINE DETAILS</small><h2>'+esc(manifest.name)+'</h2><p>'+esc(manifest.id)+' · version '+esc(manifest.version)+' · revision '+esc(engine.revision||1)+'</p></div><div><button class="wb-action secondary" data-engine-edit>Edit</button> <button class="wb-action danger" data-engine-delete>Delete</button></div></div><p>'+esc(manifest.description||'Reusable capability executed by the server-side sandbox.')+'</p>'+
 '<div class="wb-engine-ports"><section><b>Inputs</b>'+(manifest.inputs||[]).map(port=>'<span>'+esc(port.id)+' · '+esc(port.type)+(port.required===false?' · optional':' · required')+'</span>').join('')+'</section><section><b>Outputs</b>'+(manifest.outputs||[]).map(port=>'<span>'+esc(port.id)+' · '+esc(port.type)+'</span>').join('')+'</section></div>'+
 '<h3>Sandbox capabilities</h3><pre class="wb-json">'+esc(JSON.stringify(W.caps?.capabilities||{permissions:manifest.permissions||[],allowedHosts:manifest.allowedHosts||[]},null,2))+'</pre>'+
 (W.caps?.diagnostics?.findings?.length?'<h3>Static diagnostics</h3>'+W.caps.diagnostics.findings.map(item=>'<div class="wb-config-note">'+esc(item.severity+' · '+item.message)+'</div>').join(''):'')+
 '<label class="wb-config-field"><span>Safe test inputs (JSON)</span><textarea id="wb-engine-inputs" rows="4">'+esc(W.engineTestInputs||'{}')+'</textarea></label><div class="wb-engine-detail-actions"><button class="wb-action primary" data-engine-run>Run saved revision in sandbox</button><button class="wb-action secondary" data-engine-list>Back to library</button></div>'+
 (W.engineResult?'<h3>Latest safe test result</h3><pre class="wb-json">'+esc(JSON.stringify(W.engineResult,null,2))+'</pre>':'')+'<p class="wb-engine-safety">Tests run a saved immutable Engine revision. Source is never evaluated in this browser.</p></section>';
}
function renderEnginePage(){if(W.engineMode==='list')return renderEngineList();return renderEngineHeader()+(W.engineMode==='editor'?renderEngineEditor():renderEngineDetail())}
async function loadEngines(){
 if(W.engineBusy)return;W.engineBusy=true;renderWorkspace();
 try{const result=await api('engines');W.engines=Array.isArray(result.engines)?result.engines:[];W.enginesReady=true;W.engineMessage=''}
 catch(error){W.enginesReady=true;W.engineMessage=error.message}
 finally{W.engineBusy=false;renderWorkspace()}
}
async function openEngine(id){
 W.engineMode='detail';W.engine=null;W.caps=null;W.engineResult=null;W.engineMessage='';renderWorkspace();
 try{const result=await api('engines/'+encodeURIComponent(id));W.engine=result.engine;W.caps=await api('engines/'+encodeURIComponent(id)+'/capabilities');const manifest=W.engine.manifest||W.engine;W.engineTestInputs=JSON.stringify(Object.fromEntries((manifest.inputs||[]).map(port=>[port.id,port.type==='number'?0:port.type==='boolean'?false:port.type==='list'?[]:'sample'])),null,2)}
 catch(error){W.engineMessage=error.message}
 renderWorkspace();
}
function newEngine(){
 W.editingId=null;W.engineMode='editor';W.engine=null;W.editorName='';W.editorId='';W.editorVersion='1';W.editorInputs='query:string';W.editorOutputs='results:list';W.editorHosts='';
 W.editorCode='export async function run(inputs) {\n  return { results: [inputs.query] }\n}';renderWorkspace();
}
function editEngine(){
 if(!W.engine)return;const engine=W.engine,manifest=engine.manifest||engine;
 W.editingId=manifest.id;W.engineMode='editor';W.editorName=manifest.name||'';W.editorId=manifest.id||'';W.editorVersion=String(manifest.version||1);
 W.editorInputs=(manifest.inputs||[]).map(port=>port.id+':'+port.type).join(', ');W.editorOutputs=(manifest.outputs||[]).map(port=>port.id+':'+port.type).join(', ');
 W.editorHosts=(manifest.allowedHosts||[]).join(', ');W.editorCode=String(engine.code||'');renderWorkspace();
}
function parsePorts(value){
 const seen=new Set();
 return String(value||'').split(',').map(part=>part.trim()).filter(Boolean).map(part=>{
  const [id,type,...rest]=part.split(':').map(item=>item.trim());
  if(!id||!type||rest.length||! /^[a-z][a-zA-Z0-9_]{0,31}$/.test(id)||seen.has(id)||!['string','number','boolean','json','text','image','media','list'].includes(type))throw new Error('Ports must use unique id:type entries, for example query:string, results:list.');
  seen.add(id);return{id,type,required:true};
 });
}
async function saveEngine(){
 try{
  const name=document.getElementById('we-name')?.value.trim()||'',id=document.getElementById('we-id')?.value.trim()||'',version=Number(document.getElementById('we-version')?.value),code=document.getElementById('we-code')?.value||'';
  const inputs=parsePorts(document.getElementById('we-inputs')?.value),outputs=parsePorts(document.getElementById('we-outputs')?.value),allowedHosts=(document.getElementById('we-hosts')?.value||'').split(/[,\n]+/).map(value=>value.trim().toLowerCase()).filter(Boolean);
  if(!name||!id||!Number.isSafeInteger(version)||version<1)throw new Error('Enter an Engine name, a valid ID and a positive version.');
  if(!outputs.length)throw new Error('An Engine requires at least one output port.');
  if(!code.trim())throw new Error('Engine source cannot be empty.');
  if(W.editingId&&id!==W.editingId)throw new Error('An Engine ID cannot be changed after creation.');
  const manifest={id,name,version,entryPoint:'run',inputs,outputs,permissions:allowedHosts.length?['network.fetch']:[],allowedHosts,timeoutMs:10000,maxResults:10};
  const previous=W.engine,m=previous?.manifest||previous,body=W.editingId?{manifest,code,expectedVersion:m?.version,expectedRevision:previous?.revision}:{manifest,code};
  W.engineBusy=true;renderWorkspace();
  const result=await api(W.editingId?'engines/'+encodeURIComponent(W.editingId):'engines',{method:W.editingId?'PUT':'POST',body});
  W.engine=result.engine;W.engineMode='detail';W.engineMessage='Engine saved.';W.engines=await api('engines').then(response=>response.engines||[]);
  W.caps=await api('engines/'+encodeURIComponent(id)+'/capabilities');notify('Engine saved');
 }catch(error){W.engineMessage=error.message}
 finally{W.engineBusy=false;renderWorkspace()}
}
async function deleteEngine(){
 if(!W.engine)return;const id=(W.engine.manifest||W.engine).id;
 if(!confirm('Delete Engine "'+id+'"? Existing workflows may prevent deletion.'))return;
 try{await api('engines/'+encodeURIComponent(id),{method:'DELETE',body:{confirm:true}});W.engine=null;W.caps=null;W.engineResult=null;W.engineMode='list';W.engines=await api('engines').then(response=>response.engines||[]);W.engineMessage='Engine deleted.'}
 catch(error){W.engineMessage=error.message}
 renderWorkspace();
}
async function runEngine(){
 if(!W.engine)return;
 try{W.engineTestInputs=document.getElementById('wb-engine-inputs')?.value||'{}';const inputs=JSON.parse(W.engineTestInputs),manifest=W.engine.manifest||W.engine;W.engineResult=await api('engines/'+encodeURIComponent(manifest.id)+'/run',{method:'POST',body:{revision:W.engine.revision,inputs}});W.engineMessage=W.engineResult.ok?'Safe Engine test succeeded.':'Test result: '+W.engineResult.outcome}
 catch(error){W.engineMessage=error.message}
 renderWorkspace();
}
function bindEnginePage(){
 const view=document.getElementById('view');if(!view)return;
 view.onclick=async event=>{
  const button=event.target.closest('[data-engine-back],[data-engine-list],[data-engine-refresh],[data-engine-new],[data-engine-open],[data-engine-edit],[data-engine-cancel],[data-engine-save],[data-engine-delete],[data-engine-run]');
  if(!button)return;
  if(button.hasAttribute('data-engine-back')){if(W.engineReturn==='builder'){S.sub='web-builder';renderWorkspace()}else backFromWorkspace();return}
  if(button.hasAttribute('data-engine-list')){W.engineMode='list';W.engine=null;W.caps=null;W.engineResult=null;renderWorkspace();return}
  if(button.hasAttribute('data-engine-refresh')){W.enginesReady=false;await loadEngines();return}
  if(button.hasAttribute('data-engine-new')){newEngine();return}
  if(button.dataset.engineOpen){await openEngine(button.dataset.engineOpen);return}
  if(button.hasAttribute('data-engine-edit')){editEngine();return}
  if(button.hasAttribute('data-engine-cancel')){W.engineMode=W.engine?'detail':'list';renderWorkspace();return}
  if(button.hasAttribute('data-engine-save')){await saveEngine();return}
  if(button.hasAttribute('data-engine-delete')){await deleteEngine();return}
  if(button.hasAttribute('data-engine-run')){await runEngine();return}
 };
 view.oninput=event=>{
  if(event.target.id==='wb-engine-search'){W.engineSearch=event.target.value;const position=event.target.selectionStart;renderWorkspace();const input=document.getElementById('wb-engine-search');if(input){input.focus();input.setSelectionRange(position,position)}}
 };
}
function renderWorkspace(){
 nav();if(typeof pill==='function')pill();
 const view=document.getElementById('view');if(!view)return;
 document.body.classList.add('aharane-workspace-open');view.className='pg wb-view';
 if(S.sub==='web-builder'){
  view.innerHTML=W.draft?renderBuilderPage():'<main class="wb-workspace"><div class="wb-topbar"><button class="wb-back" data-wb-back>‹ Home</button><h1>Visual command builder</h1></div><div class="wb-loading">Loading your command library…</div></main>';
  bindBuilder();if(W.draft){updateZoom();requestAnimationFrame(drawWires)}if(!W.builderReady&&!W.loading)void loadBuilder();
 }else if(S.sub==='web-engines'){
  view.innerHTML='<main class="wb-workspace wb-engine-screen">'+renderEnginePage()+'</main>';
  bindEnginePage();if(!W.enginesReady&&!W.engineBusy)void loadEngines();
 }
}
function bindBuilder(){
 const view=document.getElementById('view');if(!view)return;
 view.onclick=async event=>{
  const button=event.target.closest('[data-wb-back],[data-wb-save],[data-wb-test],[data-wb-add],[data-wb-category],[data-wb-manage-engines],[data-wb-config],[data-wb-open-config],[data-wb-apply-config],[data-wb-cancel-config],[data-wb-delete-node],[data-wb-disconnect],[data-wb-remove-edge],[data-wb-socket],[data-wb-new],[data-wb-fit],[data-wb-zoom],[data-wb-cancel-connect]');
  if(!button)return;
  if(button.hasAttribute('data-wb-back')){backFromWorkspace();return}
  if(button.hasAttribute('data-wb-save')){await saveWorkflow();return}
  if(button.hasAttribute('data-wb-test')){await testWorkflow();return}
  if(button.dataset.wbAdd){addNode(button.dataset.wbAdd);return}
  if(button.dataset.wbCategory){W.category=button.dataset.wbCategory;renderWorkspace();return}
  if(button.hasAttribute('data-wb-manage-engines')){openWebEngineLibrary('builder');return}
  if(button.dataset.wbConfig||button.dataset.wbOpenConfig){const id=button.dataset.wbConfig||button.dataset.wbOpenConfig,node=W.draft.nodes.find(item=>item.id===id);if(node){W.selectedNodeId=id;W.configNodeId=id;W.configDraft=clone(node.config||{});renderWorkspace()}return}
  if(button.hasAttribute('data-wb-cancel-config')){W.configNodeId=null;W.configDraft=null;renderWorkspace();return}
  if(button.hasAttribute('data-wb-modal-close')&&event.target===button){W.configNodeId=null;W.configDraft=null;renderWorkspace();return}
  if(button.hasAttribute('data-wb-apply-config')){applyNodeConfig();return}
  if(button.hasAttribute('data-wb-delete-node')){deleteConfiguredNode();return}
  if(button.hasAttribute('data-wb-disconnect')){const id=W.configNodeId;W.draft.edges=W.draft.edges.filter(edge=>edge.from!==id&&edge.to!==id);W.configNodeId=null;W.configDraft=null;W.pendingSocket=null;markDirty();renderWorkspace();return}
  if(button.dataset.wbRemoveEdge){W.draft.edges=W.draft.edges.filter(edge=>edge.id!==button.dataset.wbRemoveEdge);markDirty();renderWorkspace();return}
  if(button.dataset.wbSocket){connectSockets(button);return}
  if(button.hasAttribute('data-wb-new')){if(W.dirty&&!confirm('Discard unsaved command changes and create a new command?'))return;W.draft=newDraft(W.account);W.isNew=true;W.dirty=false;W.validation=null;W.testResult=null;W.selectedNodeId=null;W.message='';renderWorkspace();return}
  if(button.hasAttribute('data-wb-fit')){fitCanvas();return}
  if(button.dataset.wbZoom){W.zoom=Math.min(1.5,Math.max(.28,W.zoom+(button.dataset.wbZoom==='+'?.1:-.1)));updateZoom();requestAnimationFrame(drawWires);return}
  if(button.hasAttribute('data-wb-cancel-connect')){W.pendingSocket=null;renderWorkspace();return}
 };
 view.onchange=event=>{
  const target=event.target;
  if(target.id==='wb-account'){switchBuilderAccount(target.value);return}
  if(target.id==='wb-saved'&&target.value)loadWorkflow(target.value);
  if(target.id==='wb-enabled'&&W.draft){W.draft.enabled=target.checked;markDirty()}
  if(target.dataset.wbConfigField)updateConfigField(target);
 };
 view.oninput=event=>{
  const target=event.target;
  if(target.id==='wb-name'&&W.draft){W.draft.name=target.value;markDirty();return}
  if(target.id==='wb-search'){W.search=target.value;const position=target.selectionStart;renderWorkspace();const next=document.getElementById('wb-search');if(next){next.focus();next.setSelectionRange(position,position)}return}
  if(target.dataset.wbConfigField)updateConfigField(target);
 };
 view.onpointerdown=event=>{
  const handle=event.target.closest('[data-wb-drag]');if(!handle||event.target.closest('button'))return;
  const id=handle.dataset.wbDrag,node=W.draft?.nodes.find(item=>item.id===id);if(!node)return;
  W.drag={nodeId:id,startX:event.clientX,startY:event.clientY,startNodeX:Number(node.x)||0,startNodeY:Number(node.y)||0,moved:false};
  try{handle.setPointerCapture(event.pointerId)}catch{}event.preventDefault();
 };
 view.onpointermove=event=>{
  if(!W.drag)return;const node=W.draft?.nodes.find(item=>item.id===W.drag.nodeId);if(!node)return;
  const dx=(event.clientX-W.drag.startX)/W.zoom,dy=(event.clientY-W.drag.startY)/W.zoom;
  if(Math.abs(dx)+Math.abs(dy)>3)W.drag.moved=true;
  node.x=Math.max(-450,Math.round(W.drag.startNodeX+dx));node.y=Math.max(-350,Math.round(W.drag.startNodeY+dy));
  const card=view.querySelector('[data-wb-node="'+CSS.escape(node.id)+'"]');if(card){card.style.left=(node.x+600)+'px';card.style.top=(node.y+420)+'px'}drawWires();
 };
 view.onpointerup=()=>{if(W.drag){if(W.drag.moved)markDirty();W.drag=null}};
 view.onpointercancel=()=>{if(W.drag){markDirty();W.drag=null}};
}
function render(){
 if(S.sub==='web-builder'||S.sub==='web-engines'){renderWorkspace();return}
 document.body.classList.remove('aharane-workspace-open');
 const result=renderBase();
 injectHomeEntry();injectEnginesFolder();
 return result;
}
window.render=render;
})();