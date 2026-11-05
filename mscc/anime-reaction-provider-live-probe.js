// CI live proof: checks the real independent endpoints, actual GIF bytes and
// animated WebP rasterization. Mocked unit tests alone cannot confirm uptime.
// Run manually or on the feature PR; never during bot startup.
import assert from 'node:assert/strict'
import { mediaToSticker } from './utils/media-conversion.js'
import { reactionProviders } from './utils/anime-reaction-providers.js'

const categories = ['hug','slap','smug','wave','cry','sleep','kick','kill']
const ua = 'NIGHT-Anime-Stickers (https://github.com/777-hub-cell/my-whole-life-s-work)'
const TIMEOUT_MS = 12000
const CAP = 16*1024*1024
async function fetchGif(url) {
  const response = await fetch(url,{
    headers:{'User-Agent':ua,Accept:'image/gif'},
    redirect:'error',signal:AbortSignal.timeout(TIMEOUT_MS),
  })
  if(!response.ok) throw new Error('GIF HTTP '+response.status)
  const type = String(response.headers.get('content-type') || '').toLowerCase()
  if(!type.includes('gif') && !type.includes('octet-stream')) throw new Error('Bad GIF content-type '+type)
  if(Number(response.headers.get('content-length') || 0) > CAP) throw new Error('GIF too large')
  const parts=[],reader=response.body?.getReader()
  if(!reader) throw new Error('GIF response is empty')
  let bytes=0
  try {
    while(true){
      const {value,done}=await reader.read()
      if(done)break
      bytes+=value.byteLength
      if(bytes>CAP)throw new Error('GIF too large')
      parts.push(Buffer.from(value))
    }
  } finally {reader.releaseLock()}
  const gif=Buffer.concat(parts,bytes)
  if(!['GIF87a','GIF89a'].includes(gif.toString('ascii',0,6))) throw new Error('Media was not GIF')
  return gif
}
const summary=[]
for (const category of categories){
  const attempts=[]
  let success=false
  for(const provider of reactionProviders(category)){
    try {
      const urls=await provider.resolve()
      if(!urls.length)throw new Error('No candidate URLs')
      const gif=await fetchGif(urls[0])
      const sticker=await mediaToSticker(gif,{animated:true,packName:'NIGHT Live Reaction Probe'})
      assert.equal(sticker.toString('ascii',0,4),'RIFF')
      assert.equal(sticker.toString('ascii',8,12),'WEBP')
      assert.ok(sticker.length<900*1024,'Sticker exceeds target size')
      console.log('PASS '+category+' through '+provider.name+' GIF '+gif.length+'B => WebP '+sticker.length+'B')
      attempts.push({provider:provider.name,ok:true})
      success=true
      break
    } catch(error) {
      const reason=String(error?.message||error).slice(0,180)
      attempts.push({provider:provider.name,ok:false,reason})
      console.log('FAIL '+category+' via '+provider.name+': '+reason)
    }
  }
  summary.push({category,success,attempts})
}
console.log('NIGHT REACTION LIVE SUMMARY '+JSON.stringify(summary))
if(summary.some(entry=>!entry.success)) process.exitCode=1
