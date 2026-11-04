import {
  _probe,
  browseTitles,
  listEpisodes,
  listSeasons,
  qualityList,
  resolveStream,
  searchTitles,
} from './providers/streamingunity.js'

async function proveSample(label,stream,quality='720',delivery='document'){
  if(!stream.masterText.includes('#EXTM3U') || !stream.variants.length) {
    throw new Error(label+' returned no playable HLS variants')
  }
  const sampleSeconds=30
  const startedAt=Date.now()
  const media=await _probe.materializeSample(stream,quality,delivery,sampleSeconds)
  const materializeMs=Date.now()-startedAt
  try{
    const probe=media.probe || {}
    const duration=Number(probe?.format?.duration||0)
    const size=Number(probe?.format?.size||0)
    const video=(probe?.streams||[]).find(row=>row.codec_type==='video')
    if(!(duration>0) || !(size>0) || !video) {
      throw new Error(label+' runtime materializer did not produce a playable sample')
    }
    if(quality!=='source' && Number(video.height)!==Number(quality)) {
      throw new Error(label+' requested '+quality+'p but materialized '+String(video.height||0)+'p')
    }
    return {
      variants:stream.variants.map(row=>({width:row.width,height:row.height,bandwidth:row.bandwidth})),
      qualities:qualityList(stream),
      requestedQuality:quality,
      delivery,
      extension:media.extension,
      sample:{
        bytes:size,duration,streams:probe.streams,materializeMs,
        throughputMbps:materializeMs>0?Number((size*8/materializeMs/1000).toFixed(2)):0,
      },
    }
  }finally{
    await media.cleanup()
  }
}

const movieBrowse=await browseTitles('movie')
if(!movieBrowse.length) throw new Error('StreamingUnity movie browse returned no titles')
const tvBrowse=await browseTitles('tv')
if(!tvBrowse.length) throw new Error('StreamingUnity TV browse returned no titles')

const tvResults=await searchTitles('House','tv')
const house=tvResults.find(row=>row.title.toLowerCase()==='house') || tvResults[0]
if(!house) throw new Error('StreamingUnity search returned no House result')

const seasons=await listSeasons(house)
const season=seasons.find(row=>row.number===1) || seasons[0]
if(!season) throw new Error('StreamingUnity returned no House seasons')

const episodes=await listEpisodes(house,season.number)
const episode=episodes.find(row=>Number(row.number)===1) || episodes[0]
if(!episode) throw new Error('StreamingUnity returned no House episodes')

const tvStream=await resolveStream(house,episode.id)
const tvProof=await proveSample('StreamingUnity TV',tvStream,'720','document')

const movieResults=await searchTitles('Night of the Living Dead','movie')
const night=movieResults.find(row=>
  row.title.toLowerCase()==='night of the living dead' && String(row.description)==='1968'
) || movieResults.find(row=>row.title.toLowerCase()==='night of the living dead') || movieResults[0]
if(!night) throw new Error('StreamingUnity search returned no Night of the Living Dead movie result')

const movieStream=await resolveStream(night)
const movieProof=await proveSample('StreamingUnity movie',movieStream,'720','video')

console.log(JSON.stringify({
  browse:{
    movies:movieBrowse.length,
    tv:tvBrowse.length,
    complete:true,
  },
  tv:{
    searchResults:tvResults.length,
    selected:{id:house.id,title:house.title},
    seasons:seasons.length,
    episodes:episodes.length,
    episode:{id:episode.id,number:episode.number,title:episode.title},
    ...tvProof,
    complete:true,
  },
  movie:{
    searchResults:movieResults.length,
    selected:{id:night.id,title:night.title,year:night.description},
    ...movieProof,
    complete:true,
  },
  exactRuntimeMaterializer:true,
  documentDelivery:true,
  videoDelivery:true,
  complete:true,
},null,2))
