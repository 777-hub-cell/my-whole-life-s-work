import { parseNumberSelection } from './number-selection.js'
import { screenCounterpartInstantRows } from './media-relations.js'
import { addCanonicalLibraryItem, addToLibraryAction, libraryStatusLine } from './media-library.js'

const token = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
const untoken = value => JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'))

const DEFAULT_QUALITIES = ['source','1080','720','480','360']
const DEFAULT_DELIVERIES = ['document','video']

const titleOf = item => String(item?.title || item?.name || 'Untitled')
const idOf = item => String(item?.id ?? item?.slug ?? item?.url ?? titleOf(item))

const normalizeSeries = item => ({
  id:idOf(item),
  title:titleOf(item),
  description:String(item?.description || item?.year || item?.status || '').trim(),
  tmdbId:Number(item?.tmdbId || 0) || 0,
})

const normalizeSeason = (season, index) => ({
  id:String(season?.id ?? season?.number ?? season?.season ?? index + 1),
  number:Number(season?.number ?? season?.season ?? season?.season_number ?? index + 1),
  title:String(season?.title || season?.name || `Season ${season?.number ?? season?.season ?? season?.season_number ?? index + 1}`),
  episodeCount:Number(season?.episodeCount ?? season?.episode_count ?? 0) || 0,
})

const normalizeEpisode = (episode, index, seasonNumber = 0) => ({
  id:String(episode?.id ?? episode?.number ?? episode?.episode ?? index + 1),
  number:String(episode?.number ?? episode?.episode ?? episode?.episode_number ?? index + 1),
  seasonNumber:Number(episode?.seasonNumber ?? episode?.season ?? episode?.season_number ?? seasonNumber) || seasonNumber,
  title:String(episode?.title || episode?.name || `Episode ${episode?.number ?? episode?.episode ?? episode?.episode_number ?? index + 1}`),
})

function hasSearchContent(result) {
  if (!result) return false
  if (Array.isArray(result.items) && result.items.length) return true
  if (Array.isArray(result.seasons) && result.seasons.length) return true
  if (Array.isArray(result.episodes) && result.episodes.length) return true
  return Boolean(result.item)
}

function uniqueQueries(values = []) {
  const seen = new Set()
  const out = []
  for (const value of values) {
    const query = String(value || '').trim()
    if (!query) continue
    const key = query.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(query)
  }
  return out
}

function outcomeError(ctx, outcome) {
  if (outcome?.status === 'no-sources') return ctx.reply('No TV sources are installed yet.')
  if (outcome?.status === 'source-error') return ctx.reply(`${outcome.source?.name || 'The source'} could not complete that TV request.`)
  if (outcome?.status === 'all-failed') return ctx.reply('All configured TV sources failed for that request.')
  return ctx.reply('Could not complete that TV request.')
}

async function chooseSource(ctx, query) {
  const sources = ctx.listSources('tv')
  const prefix = ctx.publicPrefix || '.'
  if (!sources.length) return outcomeError(ctx, { status:'no-sources' })

  return ctx.replyList({
    title:'Choose TV source',
    text:query ? `Choose a source for “${query}”.` : 'Choose a TV source.',
    buttonText:'Choose source',
    footer:`Save a default: ${prefix}source tv <source>`,
    rows:sources.map(source => ({
      title:source.name,
      description:source.description || 'Use for this request',
      id:`${prefix}tv ~source ${source.id} ${token(query || '')}`,
    })),
  })
}

async function retryAliases(ctx, { query, sourceId, firstOutcome }) {
  if (!query || typeof ctx.resolveTmdbTitles !== 'function' || firstOutcome?.status !== 'ok' || hasSearchContent(firstOutcome.result)) {
    return firstOutcome
  }

  const resolved = await ctx.resolveTmdbTitles(query, 'tv')
  const aliases = uniqueQueries([query, ...(resolved?.aliases || [])])
    .filter(value => value.toLocaleLowerCase() !== String(query).toLocaleLowerCase())
    .slice(0, 5)

  for (const alias of aliases) {
    const outcome = await ctx.executeSource({
      capability:'tv',
      explicitSource:sourceId || firstOutcome.source?.id || '',
      payload:{
        action:'search',
        query:alias,
        originalQuery:query,
        aliases:resolved?.aliases || [],
        tmdb:resolved?.matches?.[0] || null,
      },
    })
    if (outcome.status === 'ok' && hasSearchContent(outcome.result)) {
      return { ...outcome, titleAliasUsed:alias, originalQuery:query, titleResolvedBy:'tmdb' }
    }
  }
  return firstOutcome
}

async function executeSearch(ctx, { query, sourceId = '' }) {
  let outcome = await ctx.executeSource({
    capability:'tv',
    explicitSource:sourceId,
    payload:{ action:query ? 'search' : 'browse', query },
  })

  if (outcome.status === 'choice-required') return chooseSource(ctx, query)
  if (outcome.status !== 'ok') return outcomeError(ctx, outcome)
  if (query) outcome = await retryAliases(ctx, { query, sourceId, firstOutcome:outcome })

  const result = outcome.result || {}

  if (Array.isArray(result.episodes)) {
    const series = normalizeSeries(result)
    const episodes = result.episodes.map((item, index) => normalizeEpisode(item, index, Number(result.seasonNumber || 1)))
    return showEpisodes(ctx, {
      sourceId:outcome.source.id,
      series,
      season:{ number:Number(result.seasonNumber || 1), title:`Season ${Number(result.seasonNumber || 1)}` },
      episodes,
    })
  }

  if (Array.isArray(result.seasons)) {
    const series = normalizeSeries(result)
    return showSeasons(ctx, {
      sourceId:outcome.source.id,
      series,
      seasons:result.seasons.map(normalizeSeason),
    })
  }

  const items = Array.isArray(result.items)
    ? result.items.map(normalizeSeries)
    : result.item
      ? [normalizeSeries(result.item)]
      : []

  if (!items.length) return ctx.reply(`No TV results found${query ? ` for “${query}”` : ''}.`)
  if (items.length === 1) return loadSeasons(ctx, { sourceId:outcome.source.id, series:items[0] })

  const prefix = ctx.publicPrefix || '.'
  return ctx.replyList({
    title:'Choose TV series',
    text:`${outcome.titleAliasUsed ? `Matched “${query}” through “${outcome.titleAliasUsed}”.\n\n` : ''}Found ${items.length} matches${query ? ` for “${query}”` : ''}.`,
    buttonText:'Choose series',
    footer:`Source: ${outcome.source.name}`,
    rows:items.slice(0,1000).map(item => ({
      title:item.title,
      description:item.description || 'Open seasons',
      id:`${prefix}tv ~title ${outcome.source.id} ${token(item)}`,
    })),
  })
}

async function withTmdbIdentity(ctx, series) {
  if (series.tmdbId || typeof ctx.resolveTmdbTitles !== 'function') return series
  const found = await ctx.resolveTmdbTitles(series.title, 'tv')
  const match = found?.matches?.[0]
  return match?.id ? { ...series, tmdbId:match.id } : series
}

async function loadSeasons(ctx, { sourceId, series }) {
  const resolvedSeries = await withTmdbIdentity(ctx, series)
  let seasons = []

  const outcome = await ctx.executeSource({
    capability:'tv',
    explicitSource:sourceId,
    payload:{ action:'seasons', itemId:resolvedSeries.id, item:resolvedSeries },
  })

  if (outcome.status === 'ok') {
    const result = outcome.result || {}
    if (Array.isArray(result.episodes)) {
      const seasonNumber = Number(result.seasonNumber || 1)
      return showEpisodes(ctx, {
        sourceId,
        series:resolvedSeries,
        season:{ number:seasonNumber, title:`Season ${seasonNumber}` },
        episodes:result.episodes.map((item, index) => normalizeEpisode(item, index, seasonNumber)),
      })
    }
    seasons = (result.seasons || result.items || []).map(normalizeSeason)
  }

  if (!seasons.length && resolvedSeries.tmdbId && typeof ctx.resolveTmdbMedia === 'function') {
    const tmdb = await ctx.resolveTmdbMedia(resolvedSeries.tmdbId, 'tv')
    seasons = (tmdb?.seasons || [])
      .filter(season => season.number > 0)
      .map(normalizeSeason)
  }

  if (!seasons.length) {
    if (outcome.status !== 'ok') return outcomeError(ctx, outcome)
    return ctx.reply(`No seasons found for ${resolvedSeries.title}.`)
  }

  return showSeasons(ctx, { sourceId, series:resolvedSeries, seasons })
}

async function movieCounterpartRows(ctx, series) {
  if (!series.tmdbId || typeof ctx.resolveScreenCounterparts !== 'function') return []
  const rows = await ctx.resolveScreenCounterparts({ tmdbId:series.tmdbId, type:'tv' })
  return screenCounterpartInstantRows(rows, {
    fromType:'tv',
    prefix:ctx.publicPrefix || '.',
    max:1,
  }).map(({ tmdbId, mediaType, ...row }) => row)
}

async function tvBookRows(ctx, series) {
  if (!series.tmdbId || typeof ctx.resolveScreenBooks !== 'function') return []
  const books = await ctx.resolveScreenBooks({ tmdbId:series.tmdbId, type:'tv' })
  const prefix = ctx.publicPrefix || '.'
  return books.slice(0, 5).map(book => ({
    title:`📚 Book: ${book.title}`,
    description:'Open the book/novel command flow',
    id:`${prefix}book ~relation ${token(book.title)}`,
  }))
}

async function showSeasons(ctx, { sourceId, series, seasons }) {
  if (seasons.length === 1) {
    return loadEpisodes(ctx, { sourceId, series, season:seasons[0] })
  }

  const prefix = ctx.publicPrefix || '.'
  const related = await tvBookRows(ctx, series)
  const counterpartRows = await movieCounterpartRows(ctx, series)
  const libraryAction = addToLibraryAction(ctx, 'tv', series, { prefix })
  const instantActions = [...counterpartRows, libraryAction].filter(Boolean)
  const status = libraryStatusLine(ctx, 'tv', series)

  const rows = [
    ...related,
    ...seasons.slice(0, Math.max(0, 1000 - related.length)).map(season => ({
      title:season.title || `Season ${season.number}`,
      description:season.episodeCount ? `${season.episodeCount} episodes` : 'Open episodes',
      id:`${prefix}tv ~season ${sourceId} ${token(series)} ${token(season)}`,
    })),
  ]

  const text = [
    `${series.title} — ${seasons.length} season${seasons.length === 1 ? '' : 's'}.`,
    status,
  ].filter(Boolean).join('\n\n')

  if (instantActions.length && typeof ctx.replyInteractive === 'function') {
    return ctx.replyInteractive({
      title:series.title,
      text,
      actions:instantActions,
      selectors:[{
        text:'Choose season',
        title:series.title,
        rows,
      }],
    })
  }

  return ctx.replyList({
    title:series.title,
    text,
    buttonText:'Choose season',
    rows,
  })
}

async function loadEpisodes(ctx, { sourceId, series, season }) {
  let episodes = []
  const outcome = await ctx.executeSource({
    capability:'tv',
    explicitSource:sourceId,
    payload:{
      action:'episodes',
      itemId:series.id,
      item:series,
      season,
      seasonNumber:season.number,
    },
  })

  if (outcome.status === 'ok') {
    episodes = (outcome.result?.episodes || outcome.result?.items || [])
      .map((item, index) => normalizeEpisode(item, index, season.number))
  }

  if (!episodes.length && series.tmdbId && typeof ctx.resolveTmdbSeason === 'function') {
    const tmdbSeason = await ctx.resolveTmdbSeason(series.tmdbId, season.number)
    episodes = (tmdbSeason?.episodes || []).map((item, index) => normalizeEpisode(item, index, season.number))
  }

  if (!episodes.length) {
    if (outcome.status !== 'ok') return outcomeError(ctx, outcome)
    return ctx.reply(`No episodes found for ${series.title} — Season ${season.number}.`)
  }

  return showEpisodes(ctx, { sourceId, series, season, episodes })
}

async function showEpisodes(ctx, { sourceId, series, season, episodes }) {
  ctx.setCommandReplySession?.({
    kind:'number-selection',
    command:'tv',
    capability:'tv',
    sourceId,
    item:series,
    season,
    entries:episodes,
    unit:'episode',
    expiresAt:Date.now() + 30 * 60000,
  })

  const numbers = episodes.map(episode => Number(episode.number)).filter(Number.isFinite)
  const min = numbers.length ? Math.min(...numbers) : 1
  const max = numbers.length ? Math.max(...numbers) : episodes.length
  const status = libraryStatusLine(ctx, 'tv', series)
  const text = [
    `${series.title} — Season ${season.number} — ${episodes.length} episode${episodes.length === 1 ? '' : 's'}.`,
    status,
    '',
    'Reply with the episode number(s) you want.',
    'Examples: 1-10   •   1,3,4,7   •   1-10,13,15-18',
    `Available: ${min}–${max}`,
  ].filter((line, index, rows) => line !== '' || rows[index - 1] !== '').join('\n')

  const counterpartRows = await movieCounterpartRows(ctx, series)
  const libraryAction = addToLibraryAction(ctx, 'tv', series, { prefix:ctx.publicPrefix || '.' })
  const instantActions = [...counterpartRows, libraryAction].filter(Boolean)
  const relatedBooks = await tvBookRows(ctx, series)

  if (instantActions.length && relatedBooks.length && typeof ctx.replyInteractive === 'function') {
    return ctx.replyInteractive({
      title:series.title,
      text,
      footer:'Type the episode numbers directly in chat.',
      actions:instantActions,
      selectors:[{
        text:'Related',
        title:'Related',
        rows:relatedBooks,
      }],
    })
  }

  if (instantActions.length && typeof ctx.replyInstant === 'function') {
    return ctx.replyInstant({
      title:series.title,
      text,
      footer:'Type the episode numbers directly in chat.',
      actions:instantActions,
    })
  }

  if (relatedBooks.length) {
    return ctx.replyList({
      title:series.title,
      text,
      buttonText:'Related',
      footer:'Type the episode numbers directly in chat.',
      rows:relatedBooks,
    })
  }

  return ctx.reply(text)
}

function selectionIsContiguous(entries = []) {
  if (entries.length < 2) return true
  const numbers = entries.map(entry => Number(entry.number))
  if (numbers.some(value => !Number.isFinite(value))) return false
  for (let i = 1; i < numbers.length; i += 1) {
    if (numbers[i] !== numbers[i - 1] + 1) return false
  }
  return true
}

async function getSelectionOptions(ctx, { sourceId, series, season, selection }) {
  const outcome = await ctx.executeSource({
    capability:'tv',
    explicitSource:sourceId,
    payload:{
      action:'options',
      itemId:series.id,
      item:series,
      season,
      seasonNumber:season.number,
      selection,
    },
  })
  if (outcome.status !== 'ok') return { qualities:DEFAULT_QUALITIES, deliveries:DEFAULT_DELIVERIES }
  const result = outcome.result || {}
  return {
    qualities:Array.isArray(result.qualities) && result.qualities.length ? result.qualities.map(String) : DEFAULT_QUALITIES,
    deliveries:Array.isArray(result.deliveries) && result.deliveries.length ? result.deliveries.map(String) : DEFAULT_DELIVERIES,
  }
}

async function chooseSelectionOptions(ctx, { sourceId, series, season, selection, spec }) {
  const options = await getSelectionOptions(ctx, { sourceId, series, season, selection })
  ctx.setCommandReplySession?.({
    kind:'media-download-options',
    command:'tv',
    capability:'tv',
    sourceId,
    item:series,
    season,
    selected:selection,
    selectionSpec:spec,
    unit:'episode',
    expiresAt:Date.now() + 30 * 60000,
  })

  const prefix = ctx.publicPrefix || '.'
  return ctx.replyList({
    title:'Download options',
    text:`${series.title} — S${season.number} — Episodes ${spec}`,
    buttonText:'Quality & delivery',
    footer:'Your number selection is locked in.',
    sections:options.deliveries.map(delivery => ({
      title:delivery === 'document' ? 'Document (no WhatsApp video compression)' : 'Video in chat',
      rows:options.qualities.map(quality => ({
        title:`${quality === 'source' ? 'Source quality' : quality + 'p'} • ${delivery === 'document' ? 'Document' : 'Video'}`,
        description:`S${season.number} episodes ${spec}`,
        id:`${prefix}tv ~selection-download ${quality} ${delivery}`,
      })),
    })),
  })
}

async function deliverSelection(ctx, { sourceId, series, season, selection, spec, quality, delivery }) {
  if (!selection.length) return ctx.reply('That episode selection is empty. Run the TV command again.')

  if (selection.length === 1) {
    const episode = selection[0]
    const outcome = await ctx.executeSource({
      capability:'tv',
      explicitSource:sourceId,
      payload:{
        action:'download',
        itemId:series.id,
        item:series,
        season,
        seasonNumber:season.number,
        episode,
        episodeId:episode.id,
        quality,
        delivery,
      },
    })
    if (outcome.status !== 'ok') return outcomeError(ctx, outcome)
    if (outcome.result?.delivered === true) return true
    if (typeof outcome.result === 'string') return ctx.reply(outcome.result)
    if (outcome.result?.text) return ctx.reply(String(outcome.result.text))
    return ctx.reply(`Download started: ${series.title} — S${season.number}E${episode.number} (${quality}, ${delivery}).`)
  }

  if (selectionIsContiguous(selection)) {
    const outcome = await ctx.executeSource({
      capability:'tv',
      explicitSource:sourceId,
      payload:{
        action:'downloadRange',
        itemId:series.id,
        item:series,
        season,
        seasonNumber:season.number,
        range:{ start:selection[0], end:selection.at(-1) },
        quality,
        delivery,
      },
    })
    if (outcome.status !== 'ok') return outcomeError(ctx, outcome)
    if (outcome.result?.delivered === true) return true
    if (typeof outcome.result === 'string') return ctx.reply(outcome.result)
    if (outcome.result?.text) return ctx.reply(String(outcome.result.text))
    return ctx.reply(`Download started: ${series.title} — S${season.number} episodes ${spec} (${quality}, ${delivery}).`)
  }

  let completed = 0
  for (const episode of selection) {
    const outcome = await ctx.executeSource({
      capability:'tv',
      explicitSource:sourceId,
      payload:{
        action:'download',
        itemId:series.id,
        item:series,
        season,
        seasonNumber:season.number,
        episode,
        episodeId:episode.id,
        quality,
        delivery,
      },
    })
    if (outcome.status !== 'ok') return outcomeError(ctx, outcome)
    completed += 1
  }
  return ctx.reply(`Started ${completed} selected episodes from *${series.title}* Season ${season.number} (${spec}).`)
}

async function handleNumberSelection(ctx) {
  const session = ctx.getCommandReplySession?.()
  if (
    !session ||
    session.kind !== 'number-selection' ||
    session.command !== 'tv' ||
    !Array.isArray(session.entries)
  ) {
    return ctx.reply('That TV episode selection expired. Run the TV command again.')
  }

  const spec = String(ctx.commandReplyInput || '').trim()
  const parsed = parseNumberSelection(spec, session.entries, {
    numberOf:episode => episode?.number,
    maxSelected:250,
  })

  if (!parsed.ok) {
    const reason = parsed.error === 'too-many'
      ? 'That selects too many episodes at once.'
      : 'I could not match those episode numbers.'
    return ctx.reply(`${reason}\n\nTry: 1-10 or 1,3,4,7 or 1-10,13,15-18`)
  }

  const saved = ctx.getDeliveryDefault('tv')
  if (saved) {
    ctx.clearCommandReplySession?.()
    return deliverSelection(ctx, {
      sourceId:session.sourceId,
      series:session.item,
      season:session.season,
      selection:parsed.selected,
      spec,
      quality:saved.quality,
      delivery:saved.delivery,
    })
  }

  return chooseSelectionOptions(ctx, {
    sourceId:session.sourceId,
    series:session.item,
    season:session.season,
    selection:parsed.selected,
    spec,
  })
}

export async function runTvCommand(ctx, { args = [] } = {}) {
  const first = String(args[0] || '')
  try {
    if (first === '~library-add') {
      const result = await addCanonicalLibraryItem(ctx, 'tv', args[1])
      if (!result.ok) return ctx.reply('I could not add that TV series to Library. Run the TV search again.')
      return ctx.reply(result.added
        ? `Added *${result.item.title}* to Library.`
        : `*${result.item.title}* is already in Library.`)
    }

    if (first === '~numbers') return handleNumberSelection(ctx)

    if (first === '~selection-download') {
      const session = ctx.getCommandReplySession?.()
      if (
        !session ||
        session.kind !== 'media-download-options' ||
        session.command !== 'tv' ||
        !Array.isArray(session.selected)
      ) {
        return ctx.reply('That TV download selection expired. Run the TV command again.')
      }
      ctx.clearCommandReplySession?.()
      return deliverSelection(ctx, {
        sourceId:session.sourceId,
        series:session.item,
        season:session.season,
        selection:session.selected,
        spec:session.selectionSpec || '',
        quality:String(args[1] || 'source'),
        delivery:String(args[2] || 'document'),
      })
    }

    if (first === '~tmdb') {
      const media = typeof ctx.resolveTmdbMedia === 'function'
        ? await ctx.resolveTmdbMedia(Number(args[1]), 'tv')
        : null
      if (!media?.id) return ctx.reply('That TV selection expired. Run the TV search again.')
      return executeSearch(ctx, { query:media.title || media.aliases?.[0] || '' })
    }

    if (first === '~source') {
      return executeSearch(ctx, {
        sourceId:String(args[1] || ''),
        query:untoken(args[2] || ''),
      })
    }

    if (first === '~title') {
      return loadSeasons(ctx, {
        sourceId:String(args[1] || ''),
        series:untoken(args[2]),
      })
    }

    if (first === '~season') {
      return loadEpisodes(ctx, {
        sourceId:String(args[1] || ''),
        series:untoken(args[2]),
        season:untoken(args[3]),
      })
    }
  } catch {
    return ctx.reply('That TV selection is invalid or expired. Run the TV command again.')
  }

  let sourceId = ''
  const clean = []
  for (let i = 0; i < args.length; i += 1) {
    const value = String(args[i] || '')
    if (value === '--source' && args[i + 1]) {
      sourceId = String(args[++i] || '').trim().toLowerCase()
      continue
    }
    if (value.startsWith('--source=')) {
      sourceId = value.slice(9).trim().toLowerCase()
      continue
    }
    clean.push(value)
  }

  return executeSearch(ctx, { query:clean.join(' ').trim(), sourceId })
}
