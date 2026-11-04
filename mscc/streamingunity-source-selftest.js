import { _test } from './providers/streamingunity.js'

const page = _test.parseDataPage('<div id="app" data-page=\'{"props":{"title":{"id":1693,"name":"House","slug":"house","type":"tv"}}}\'></div>')
if (page?.props?.title?.id !== 1693) throw new Error('StreamingUnity data-page parser failed')

const titles = _test.uniqueTitles([
  { id:10, name:'Movie A', slug:'movie-a', type:'movie', release_date:'2026-01-02' },
  { id:11, name:'Show B', slug:'show-b', type:'tv', last_air_date:'2026-02-03' },
  { id:10, name:'Movie A', slug:'movie-a', type:'movie' },
], 'movie')
if (titles.length !== 1 || titles[0]?.id !== '10-movie-a' || titles[0]?.description !== '2026') {
  throw new Error('StreamingUnity title normalization failed')
}

const nested = _test.walkTitles({
  props:{
    rows:[
      { id:20, name:'Nested Movie', slug:'nested-movie', type:'movie' },
      { id:21, name:'Nested TV', slug:'nested-tv', type:'tv' },
    ],
  },
})
if (nested.length !== 2) throw new Error('StreamingUnity recursive browse parser failed')

const ccEmbed = '<iframe src="https://vixcloud.cc/embed/199980?token=a&amp;expires=10"></iframe>'
if (_test.findVixCloudEmbed(ccEmbed) !== 'https://vixcloud.cc/embed/199980?token=a&expires=10') {
  throw new Error('StreamingUnity VixCloud .cc embed extraction failed')
}
if (_test.findVixCloudEmbed('https://vixcloud.co/embed/legacy') !== 'https://vixcloud.co/embed/legacy') {
  throw new Error('StreamingUnity legacy VixCloud .co embed extraction failed')
}
if (_test.findVixCloudEmbed('https://untrusted.example/embed/199980')) {
  throw new Error('StreamingUnity accepted an untrusted embed host')
}
if (_test.vixCloudOrigin('https://vixcloud.cc/embed/199980') !== 'https://vixcloud.cc') {
  throw new Error('StreamingUnity VixCloud .cc origin derivation failed')
}
if (!_test.vixCloudHeaders('https://vixcloud.cc/embed/199980').includes('Origin: https://vixcloud.cc\r\n')) {
  throw new Error('StreamingUnity VixCloud .cc FFmpeg headers failed')
}

const master = [
  '#EXTM3U',
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="en",NAME="English",URI="audio/en.m3u8"',
  '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="en",NAME="English",URI="subs/en.m3u8"',
  '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1920x1080,AUDIO="audio",SUBTITLES="subs"',
  'video/1080.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=1280x720,AUDIO="audio",SUBTITLES="subs"',
  'video/720.m3u8',
].join('\n')

const parsed = _test.parseMaster(master, 'https://vixcloud.co/playlist/master.m3u8?token=x')
if (parsed.variants.length !== 2 || parsed.variants[0]?.height !== 1080) {
  throw new Error('StreamingUnity HLS variant parser failed')
}
if (parsed.media.filter(row => row.type === 'AUDIO').length !== 1 || parsed.media.filter(row => row.type === 'SUBTITLES').length !== 1) {
  throw new Error('StreamingUnity HLS media-group parser failed')
}
const qualities = _test.qualityList(parsed)
if (qualities.join('|') !== 'source|1080|720') {
  throw new Error('StreamingUnity quality discovery failed: ' + qualities.join('|'))
}
if (_test.identity({ id:'1693-house' }).sourceId !== 1693) {
  throw new Error('StreamingUnity title identity parser failed')
}

console.log('PASS StreamingUnity parser/HLS/source fixtures')
