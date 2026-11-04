// Live, read-only health matrix for the known KnightBot YouTube video providers.
// Only the public video ID is sent. No media files are downloaded.
import { probeKnightProviders } from '../youtube-knight-providers.js'

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const videoId = String(process.argv[2] || 'XEuaRjnuHlc').trim()

if (!VIDEO_ID.test(videoId)) {
  console.log(JSON.stringify({
    component:'mscc-knight-sources',
    status:'invalid_video_id',
    results:[],
  }))
  process.exitCode = 2
} else {
  try {
    const results = await probeKnightProviders(videoId)
    console.log(JSON.stringify({component:'mscc-knight-sources',videoId,results}))
  } catch {
    console.log(JSON.stringify({component:'mscc-knight-sources',videoId,
      results:[],status:'probe_failed'}))
    process.exitCode = 1
  }
}