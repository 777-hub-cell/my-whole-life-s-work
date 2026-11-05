import { runBookCommand } from './book-flow.js'

const replies=[]
const lists=[]
const images=[]
let savedDelivery=null
let session=null
let input=''

const ctx={
  publicPrefix:'.',
  getDeliveryDefault:()=>savedDelivery,
  listSources:()=>[{id:'book-src',name:'Book Source'}],
  setCommandReplySession:value=>{session=value},
  getCommandReplySession:()=>session,
  clearCommandReplySession:()=>{session=null},
  get commandReplyInput(){return input},
  reply:async value=>{replies.push(String(value));return value},
  replyList:async value=>{lists.push(value);return value},
  sendImageUrl:async (url,caption)=>{images.push({url:String(url),caption:String(caption)});return true},
  resolveBookScreens:async ()=>[
    {title:'Dune',tmdbMovieId:438631,tmdbTvId:0},
  ],
  executeSource:async ({payload})=>{
    if(payload.action==='search') return {status:'ok',source:{id:'book-src',name:'Book Source'},result:{items:[
      {id:'dune',title:'Dune',author:'Frank Herbert',year:'1965',cover:'https://example.test/dune.jpg',synopsis:'Source synopsis for Dune.'},
    ]}}
    if(payload.action==='editions') return {status:'ok',source:{id:'book-src'},result:{editions:[
      {id:'epub',title:'EPUB',format:'EPUB',language:'English'},
      {id:'pdf',title:'PDF',format:'PDF',language:'English'},
    ]}}
    if(payload.action==='download') return {status:'ok',source:{id:'book-src'},result:{text:`OK:${payload.itemId}:${payload.editionId}`}}
    throw new Error('Unexpected '+payload.action)
  },
}

await runBookCommand(ctx,{args:['Dune']})
if(session?.stage!=='book') throw new Error('Book selection stage missing')
input='1'
await runBookCommand(ctx,{args:['~numbers']})
if(session?.stage!=='edition') throw new Error('Book edition stage missing')
if(images.length!==1 || images[0].url!=='https://example.test/dune.jpg' ||
   !images[0].caption.includes('Frank Herbert') ||
   !images[0].caption.includes('Formats: EPUB • PDF') ||
   !images[0].caption.includes('Synopsis: Source synopsis for Dune.')) {
  throw new Error('Selected book preview is missing cover/author/formats/source synopsis')
}
if(!lists.at(-1)?.rows?.some(row=>row.id==='.movie ~tmdb 438631')) throw new Error('Book-to-movie instant reply missing')
input='2'
await runBookCommand(ctx,{args:['~numbers']})
if(!replies.some(x=>x.includes('OK:dune:pdf'))) throw new Error('Book edition download missing')

savedDelivery={quality:'epub',delivery:'document'}
replies.length=0
lists.length=0
session=null
await runBookCommand(ctx,{args:['Dune']})
input='1'
await runBookCommand(ctx,{args:['~numbers']})
if(!replies.some(x=>x.includes('OK:dune:epub'))) throw new Error('Saved EPUB preference was not applied')
if(session!==null) throw new Error('Saved unique book format should skip the edition picker')
if(!lists.some(list=>list.rows?.some(row=>row.id==='.movie ~tmdb 438631'))) {
  throw new Error('Book adaptation link disappeared when saved format was used')
}

console.log('PASS book edition preference and movie relation flow')


const novelDownloads=[]
const novelImages=[]
let novelSession=null
let novelInput=''
const novelCtx={
  publicPrefix:'.',
  getDeliveryDefault:()=>null,
  listSources:()=>[{id:'novelbuddy',name:'NovelBuddy'}],
  setCommandReplySession:value=>{novelSession=value},
  getCommandReplySession:()=>novelSession,
  clearCommandReplySession:()=>{novelSession=null},
  get commandReplyInput(){return novelInput},
  reply:async value=>value,
  sendImageUrl:async (url,caption)=>{novelImages.push({url:String(url),caption:String(caption)});return true},
  executeSource:async ({payload})=>{
    if(payload.action==='search') return {
      status:'ok',
      source:{id:'novelbuddy',name:'NovelBuddy'},
      result:{items:[{id:'novel-1',title:'Example Novel',author:'Example Author',cover:'https://example.test/novel.jpg'}]},
    }
    if(payload.action==='editions') return {
      status:'ok',
      source:{id:'novelbuddy',name:'NovelBuddy'},
      result:{
        book:{author:'Example Author',cover:'https://example.test/novel.jpg',synopsis:'Website-provided novel synopsis.'},
        editions:[{id:'whole-txt',title:'TXT',format:'TXT',language:'English',size:'20 chapters'}],
      },
    }
    if(payload.action==='download'){
      novelDownloads.push(payload)
      return {status:'ok',source:{id:'novelbuddy'},result:{delivered:true}}
    }
    throw new Error('Unexpected novel action '+payload.action)
  },
}

await runBookCommand(novelCtx,{args:['Example','Novel']})
if(novelSession?.stage!=='book') throw new Error('Novel search did not enter result selection stage')
if(novelImages.length!==0) throw new Error('Novel cover should appear after the user selects the result')
novelInput='1'
await runBookCommand(novelCtx,{args:['~numbers']})
if(novelDownloads.length!==1) throw new Error('Whole novel was not downloaded after selecting the only format')
if(novelDownloads[0].editionId!=='whole-txt') throw new Error('Whole-novel TXT edition was not selected')
if(novelSession!==null) throw new Error('Whole novel flow should not open a chapter-selection session')
if(novelImages.length!==1 ||
   !novelImages[0].caption.includes('Formats: TXT') ||
   !novelImages[0].caption.includes('Synopsis: Website-provided novel synopsis.')) {
  throw new Error('Whole novel preview is missing format or source synopsis')
}

console.log('PASS whole-novel preview and download flow')


const sourceProgress=[]
const sourceReplies=[]
const sourceCtx={
  publicPrefix:'.',
  listSources:()=>[{id:'welib',name:'WeLib',description:'English-first ebook catalog'}],
  progress:async message=>{
    sourceProgress.push(String(message))
    return {
      done:async value=>{sourceProgress.push(String(value));return value},
    }
  },
  reply:async value=>{sourceReplies.push(String(value));return value},
  executeSource:async ({capability,explicitSource,payload})=>{
    if(capability!=='books' || explicitSource!=='welib' || payload.query!=='A Tale of Two Cities') {
      throw new Error('Book source selection did not preserve the chosen source and query')
    }
    return {status:'source-error',source:{id:'welib',name:'WeLib'}}
  },
}
const encodedPublicDomainQuery=Buffer.from(JSON.stringify('A Tale of Two Cities'),'utf8').toString('base64url')
await runBookCommand(sourceCtx,{args:['~source','welib',encodedPublicDomainQuery]})
if(sourceProgress.length!==2 ||
   !sourceProgress[0].includes('Searching WeLib') ||
   !sourceProgress[1].includes('WeLib could not complete that request')) {
  throw new Error('Selected book source did not acknowledge progress and return a bounded failure')
}

console.log('PASS book source selection progress and failure reply')
