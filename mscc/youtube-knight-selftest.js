import assert from 'node:assert/strict'
import { youtubeFailureMessage } from './youtube-flow.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  isPublicIpv4,
  checkedMediaUrl,
  downloadFromKnightProviders,
  probeKnightProviders,
  providerFailureCategory,
  makeGuardedLookup,
} from './youtube-knight-providers.js'

const id = 'XEuaRjnuHlc'

// Regression for Node 24 HTTPS Happy Eyeballs: `all:true` must return an
// array, while the classic single-address lookup returns (address, family).
const guarded = makeGuardedLookup(async () => [
  {address:'127.0.0.1',family:4},
  {address:'8.8.8.8',family:4},
])
const allRecords = await new Promise((resolve,reject) => guarded('cdn.example.com',{all:true},(error,records) => error ? reject(error) : resolve(records)))
assert.deepEqual(allRecords,[{address:'8.8.8.8',family:4}])
const singleRecord = await new Promise((resolve,reject) => guarded('cdn.example.com',{family:4},(error,address,family) => error ? reject(error) : resolve({address,family})))
assert.deepEqual(singleRecord,{address:'8.8.8.8',family:4})
const blocked = makeGuardedLookup(async()=>[{address:'127.0.0.1',family:4}])
await assert.rejects(new Promise((resolve,reject)=>blocked('internal.local',{all:true},error=>error?reject(error):resolve())), /no permitted public/)

const offlineError = new Error('All KnightBot sources unavailable')
offlineError.code = 'YOUTUBE_KNIGHT_SOURCES_UNAVAILABLE'
assert.match(youtubeFailureMessage(offlineError,'XEuaRjnuHlc'), /alternate video services are also unavailable/)
assert.ok(youtubeFailureMessage(offlineError,'XEuaRjnuHlc').includes('youtube.com/watch?v=XEuaRjnuHlc'))
assert.equal(providerFailureCategory({code:'DOWNLOADER_HTTP_404'}),'http_404')
assert.equal(providerFailureCategory({code:'DOWNLOADER_HTTP_429'}),'http_429')
assert.equal(providerFailureCategory({code:'DOWNLOADER_DNS_FAILURE'}),'dns_failure')
assert.equal(providerFailureCategory({code:'DOWNLOADER_NO_PUBLIC_ADDRESS'}),'no_public_ipv4')
assert.equal(providerFailureCategory({code:'CERT_HAS_EXPIRED'}),'tls_failure')
assert.equal(providerFailureCategory({code:'ECONNRESET'}),'network_failure')
assert.equal(providerFailureCategory(new Error('Downloader returned an unsafe URL.')),'invalid_media_url')
assert.equal(providerFailureCategory(new Error('Downloader returned invalid metadata.')),'invalid_json')
assert.equal(providerFailureCategory(new Error('hidden signed URL token')),'provider_error')


for (const address of ['127.0.0.1','10.1.2.3','172.16.5.7','192.168.1.22',
  '169.254.169.254','100.64.0.1','0.0.0.0','203.0.113.1','198.51.100.1']) {
  assert.equal(isPublicIpv4(address),false,'private IP accepted: '+address)
}
for (const address of ['8.8.8.8','1.1.1.1','142.250.190.78']) {
  assert.equal(isPublicIpv4(address),true,'public IP rejected: '+address)
}
for (const url of [
  'http://cdn.example.com/media.mp4',
  'https://127.0.0.1/file.mp4',
  'https://169.254.169.254/latest/meta-data',
  'https://user:pass@example.com/file',
  'https://media.local/file',
  'https://media.example.com:8080/file',
  'file:///etc/passwd',
]) {
  assert.throws(()=>checkedMediaUrl(url),/unsafe|Invalid/i, 'unsafe URL accepted: '+url)
}
assert.equal(checkedMediaUrl('https://cdn.example.com/123.mp4').protocol,'https:')

const dir = await mkdtemp(join(tmpdir(),'knight-source-selftest-'))
const providers = [
  {name:'eliteprotech', endpoint:'https://eliteprotech-apis.zone.id/ytdown',
    params: url => ({url,format:'mp4'}),
    parse: data => data?.downloadURL ? {url:data.downloadURL,title:data.title} : null},
  {name:'yupra', endpoint:'https://api.yupra.my.id/api/downloader/ytmp4',
    params: url => ({url}),
    parse: data => data?.data?.download_url ? {url:data.data.download_url,title:data.data.title} : null},
]
try {
  const calls=[]
  const downloadDiagnostics=[]
  const result = await downloadFromKnightProviders(id,dir,4096,{
    providers,
    requestJson: async url => {
      calls.push(['metadata',url])
      if (url.includes('eliteprotech')) return { downloadURL:'http://localhost/malicious' }
      return {data:{download_url:'https://cdn.example.com/approved.mp4',title:'Museum floor'}}
    },
    downloadFile: async (url,file,cap) => {
      calls.push(['download',url,file,cap])
      return 1024
    },
    inspectHeight:async()=>360,
    onProviderResult:event=>downloadDiagnostics.push(event),
  })
  assert.equal(result.provider,'yupra')
  assert.equal(result.height,360)
  assert.equal(result.title,'Museum floor')
  assert.equal(result.size,1024)
  assert.equal(calls.filter(([type])=>type==='metadata').length,2)
  assert.equal(calls.filter(([type])=>type==='download').length,1)
  assert.match(calls[1][1],/watch%3Fv%3DXEuaRjnuHlc/)
  assert.equal(calls[2][1],'https://cdn.example.com/approved.mp4')
  assert.deepEqual(downloadDiagnostics,[
    {provider:'eliteprotech',phase:'validate_media_url',result:'invalid_media_url'},
    {provider:'yupra',phase:'complete',result:'downloaded',size:1024,height:360},
  ])
  assert.equal(JSON.stringify(downloadDiagnostics).includes('malicious'),false)

  const failedDownloadDiagnostics=[]
  await assert.rejects(downloadFromKnightProviders(id,dir,4096,{
    providers:[providers[0]],
    requestJson:async()=>({downloadURL:'https://cdn.example.com/video.mp4'}),
    downloadFile:async()=> {
      const error=new Error('secret signed media URL must not appear in logs')
      error.code='ECONNRESET'
      throw error
    },
    onProviderResult:event=>failedDownloadDiagnostics.push(event),
  }),/no external media source returned/)
  assert.deepEqual(failedDownloadDiagnostics,[
    {provider:'eliteprotech',phase:'download_media',result:'network_failure',diagnosticCode:'ECONNRESET'},
  ])
  assert.equal(JSON.stringify(failedDownloadDiagnostics).includes('secret'),false)

  await assert.rejects(downloadFromKnightProviders(id,dir,4096,{
    providers,
    requestJson:async()=>({data:{download_url:'https://127.0.0.1/private'}}),
  }),/no external media source returned/)

  const diagnostics = await probeKnightProviders(id,{
    providers,
    requestJson:async url => url.includes('eliteprotech')
      ? {downloadURL:'https://cdn.example.com/signed-token-secret',title:'Secret title'}
      : {data:{download_url:'https://127.0.0.1/private'}},
  })
  assert.deepEqual(diagnostics,[
    {provider:'eliteprotech',result:'link_resolved'},
    {provider:'yupra',result:'invalid_media_url'},
  ])
  assert.equal(JSON.stringify(diagnostics).includes('signed-token-secret'),false)
  const safeFailure = await probeKnightProviders(id,{
    providers:[providers[0]],
    requestJson:async()=> {
      const error = new Error('SECRET_SIGNED_VIDEO_URL')
      error.code = 'ERROR/PRIVATE?SECRET'
      throw error
    },
  })
  assert.equal(safeFailure[0].result,'provider_error')
  assert.equal(safeFailure[0].diagnosticCode,'UNKNOWN')
  assert.equal(JSON.stringify(safeFailure).includes('SECRET'),false)

  process.env.MSCC_YOUTUBE_KNIGHT_FALLBACK = '0'
  await assert.rejects(downloadFromKnightProviders(id,dir,4096,{
    providers,requestJson:async()=>{ throw new Error('should never call API') },
  }),/disabled/)
  delete process.env.MSCC_YOUTUBE_KNIGHT_FALLBACK
  console.log('PASS KnightBot provider fallback, input/SSRF protection, provider failover, external height, opt-out')
} finally {
  delete process.env.MSCC_YOUTUBE_KNIGHT_FALLBACK
  await rm(dir,{recursive:true,force:true})
}
