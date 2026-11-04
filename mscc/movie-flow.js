import { screenCounterpartInstantRows } from './media-relations.js'
import { addCanonicalLibraryItem, addToLibraryAction, libraryStatusLine } from './media-library.js'

const token = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
const untoken = value => JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'))

const DEFAULT_QUALITIES = ['source','1080','720','480','360']
const DEFAULT_DELIVERIES = ['document','video']

const titleOf = item => String(item?.title || item?.name || 'Untitled')
const idOf = item => String(item?.id ?? item?.slug ?? item?.url ?? titleOf(item))

const normalizeMovie = item => ({
  id:idOf(item),
  title:titleOf(item),
  description:String(item?.description || item?.year || item?.status || '').trim(),
  tmdbId:Number(item?.tmdbId || 0) || 0,
})

function hasContent(result) {
  if (!result) return false
  if (Array.isArray(result.items) && result.items.length) return true
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

async function chooseSource(ctx, query) {
  const sources = ctx.listSources('movies')
  const prefix = ctx.publicPrefix || '.'
  if (!sources.length) return ctx.reply('No movie sources are installed yet.')
  return ctx.replyList({
    title:'Choose movie source',
    text:query ? `Choose a source for “${query}”.` : 'Choose a movie source.',
    buttonText:'Choose source',
    footer:`Save a default: ${prefix}source movies <source>`,
    rows:sources.map(source => ({
      title:source.name,
      description:source.description || 'Use for this request',
      id:`${prefix}movie ~source ${source.id} ${token(query || '')}`,
    })),
  })
}

function outcomeError(ctx, outcome) {
  if (outcome?.status === 'no-sources') return 'No movie sources are installed yet.'
  if (outcome?.status === 'source-error') {
    return String(outcome.source?.name || 'The source') + ' could not complete that movie request. Please retry or choose another source.'
  }
  if (outcome?.status === 'all-failed') return 'All configured movie sources failed for that request.'
  return 'Could not complete that movie request.'
}
async function retryAliases(ctx, { query, sourceId, firstOutcome }) {
  if (!query || typeof ctx.resolveTmdbTitles !== 'function' || firstOutcome?.status !== 'ok' || hasContent(firstOutcome.result)) {
    return firstOutcome
  }
  const resolved = await ctx.resolveTmdbTitles(query, 'movie')
  const aliases = uniqueQueries([query, ...(resolved?.aliases || [])])
    .filter(value => value.toLocaleLowerCase() !== String(query).toLocaleLowerCase())
    .slice(0, 5)

  for (const alias of aliases) {
    const outcome = await ctx.executeSource({
      capability:'movies',
      explicitSource:sourceId || firstOutcome.source?.id || '',
      payload:{
        action:'search',
        query:alias,
        originalQuery:query,
        aliases:resolved?.aliases || [],
        tmdb:resolved?.matches?.[0] || null,
      },
    })
    if (outcome.status === 'ok' && hasContent(outcome.result)) {
      return { ...outcome, titleAliasUsed:alias, originalQuery:query, titleResolvedBy:'tmdb' }
    }
  }
  return firstOutcome
}

async function executeSearch(ctx, { query, sourceId = '' }) {
  let outcome = await ctx.executeSource({
    capability:'movies',
    explicitSource:sourceId,
    payload:{ action:query ? 'search' : 'browse', query },
  })

  if (outcome.status === 'choice-required') return chooseSource(ctx, query)
  if (outcome.status !== 'ok') return ctx.reply(outcomeError(ctx, outcome))
  if (query) outcome = await retryAliases(ctx, { query, sourceId, firstOutcome:outcome })

  const result = outcome.result || {}
  const items = Array.isArray(result.items)
    ? result.items.map(normalizeMovie)
    : result.item
      ? [normalizeMovie(result.item)]
      : []

  if (!items.length) return ctx.reply(`No movie results found${query ? ` for “${query}”` : ''}.`)
  if (items.length === 1) return selectMovie(ctx, { sourceId:outcome.source.id, movie:items[0] })

  const prefix = ctx.publicPrefix || '.'
  return ctx.replyList({
    title:'Choose movie',
    text:`${outcome.titleAliasUsed ? `Matched “${query}” through “${outcome.titleAliasUsed}”.\n\n` : ''}Found ${items.length} matches${query ? ` for “${query}”` : ''}.`,
    buttonText:'Choose movie',
    footer:`Source: ${outcome.source.name}`,
    rows:items.slice(0, 1000).map(item => ({
      title:item.title,
      description:item.description || 'Open download options',
      id:`${prefix}movie ~title ${outcome.source.id} ${token(item)}`,
    })),
  })
}

async function withTmdbIdentity(ctx, movie) {
  if (movie.tmdbId || typeof ctx.resolveTmdbTitles !== 'function') return movie
  const found = await ctx.resolveTmdbTitles(movie.title, 'movie')
  const match = found?.matches?.[0]
  return match?.id ? { ...movie, tmdbId:match.id } : movie
}

async function getOptions(ctx, sourceId, movie) {
  const outcome = await ctx.executeSource({
    capability:'movies',
    explicitSource:sourceId,
    payload:{ action:'options', itemId:movie.id, item:movie },
  })
  if (outcome.status !== 'ok') return { qualities:DEFAULT_QUALITIES, deliveries:DEFAULT_DELIVERIES }
  const result = outcome.result || {}
  return {
    qualities:Array.isArray(result.qualities) && result.qualities.length ? result.qualities.map(String) : DEFAULT_QUALITIES,
    deliveries:Array.isArray(result.deliveries) && result.deliveries.length ? result.deliveries.map(String) : DEFAULT_DELIVERIES,
  }
}

async function performDelivery(ctx, { sourceId, movie, quality, delivery, onProgress }) {
  const outcome = await ctx.executeSource({
    capability:'movies',
    explicitSource:sourceId,
    payload:{ action:'download', itemId:movie.id, item:movie, quality, delivery, onProgress },
  })
  if (outcome.status !== 'ok') return { ok:false, message:outcomeError(ctx, outcome) }
  const result = outcome.result
  if (result?.delivered === true) return { ok:true, message:'✅ *' + movie.title + '* was sent.' }
  if (typeof result === 'string') return { ok:true, message:result }
  if (result?.text) return { ok:true, message:String(result.text) }
  return { ok:true, message:'The download request for ' + movie.title + ' completed, but the source did not confirm delivery.' }
}

function formatProgressTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0))
  const minutes = Math.floor(value / 60)
  const remainder = value % 60
  return minutes + ':' + String(remainder).padStart(2, '0')
}

function movieProgressText(movieTitle, update = {}) {
  switch (String(update.phase || '')) {
    case 'resolving':
      return '🔎 *' + movieTitle + '* — resolving the source stream…'
    case 'waiting':
      return '⏳ *' + movieTitle + '* — waiting for the media-copy worker…'
    case 'copy': {
      const percent = Number.isFinite(Number(update.percent))
        ? ' ' + Math.round(Math.max(0, Math.min(99, Number(update.percent)))) + '%'
        : ''
      const elapsed = Number(update.timeSeconds) > 0
        ? ' · ' + formatProgressTime(update.timeSeconds) + ' copied'
        : ''
      const speed = update.speed ? ' · ' + String(update.speed) : ''
      return '⬇️ *' + movieTitle + '* — copying stream to server disk' + percent + elapsed + speed + '…'
    }
    case 'validating':
      return '🔍 *' + movieTitle + '* — checking the completed media file…'
    case 'prepared':
      return '✅ *' + movieTitle + '* — file prepared; starting WhatsApp delivery…'
    case 'upload':
      return '📤 *' + movieTitle + '* — uploading the file to WhatsApp…'
    default:
      return ''
  }
}

// Acknowledge first, then perform long media work outside the inbound chat queue.
// This lets later commands and ping stay responsive while a large file is prepared.
async function startDelivery(ctx, details) {
  const movieTitle = titleOf(details.movie)
  const opening = '⏳ *' + movieTitle + '* download queued. I will send the file when it is ready.'
  let progress = null
  if (typeof ctx.progress === 'function') { try { progress = await ctx.progress(opening) } catch {} }
  if (!progress) { try { await ctx.reply(opening) } catch {} }

  const report = async (message, failed = false) => {
    if (progress) {
      const update = failed ? progress.fail : (progress.update || progress.done)
      if (typeof update === 'function') { try { await update.call(progress, message); return } catch {} }
    }
    try { await ctx.reply(message) } catch {}
  }

  let lastPhase = ''
  let lastPercentBucket = -1
  let lastProgressAt = 0
  const publishProgress = async update => {
    const message = movieProgressText(movieTitle, update)
    if (!message) return
    const phase = String(update?.phase || '')
    const numericPercent = Number(update?.percent)
    const hasPercent = Number.isFinite(numericPercent)
    const bucket = hasPercent ? Math.floor(numericPercent / 5) : -1
    const now = Date.now()
    const phaseChanged = phase !== lastPhase
    const percentageAdvanced = phase === 'copy' && hasPercent && bucket >= lastPercentBucket + 1
    const timeElapsed = now - lastProgressAt >= 10_000
    if (!phaseChanged && !percentageAdvanced && !timeElapsed) return
    lastPhase = phase
    if (phase === 'copy' && hasPercent) lastPercentBucket = bucket
    lastProgressAt = now

    if (progress) {
      const updateMessage = progress.update || progress.done
      if (typeof updateMessage === 'function') {
        try { await updateMessage.call(progress, message); return } catch {}
      }
    }
    try { await ctx.reply(message) } catch {}
  }

  setImmediate(() => {
    void (async () => {
      try {
        const result = await performDelivery(ctx, { ...details, onProgress:publishProgress })
        await report(result.message, !result.ok)
      } catch (error) {
        const detail = String(error?.message || '').replace(/\s+/g, ' ').slice(0, 160)
        const message = '❌ *' + movieTitle + '* download failed' + (detail ? ': ' + detail : '.')
        await report(message, true)
      }
    })().catch(() => {})
  })
  return true
}
async function tvCounterpartRows(ctx, movie) {
  if (!movie.tmdbId || typeof ctx.resolveScreenCounterparts !== 'function') return []
  const rows = await ctx.resolveScreenCounterparts({ tmdbId:movie.tmdbId, type:'movie' })
  return screenCounterpartInstantRows(rows, {
    fromType:'movie',
    prefix:ctx.publicPrefix || '.',
    max:1,
  }).map(({ tmdbId, mediaType, ...row }) => row)
}

async function relatedBookRows(ctx, movie) {
  if (!movie.tmdbId || typeof ctx.resolveScreenBooks !== 'function') return []
  const books = await ctx.resolveScreenBooks({ tmdbId:movie.tmdbId, type:'movie' })
  const prefix = ctx.publicPrefix || '.'
  return books.slice(0, 5).map(book => ({
    title:`📚 Book: ${book.title}`,
    description:'Open the book/novel command flow',
    id:`${prefix}book ~relation ${token(book.title)}`,
  }))
}

async function selectMovie(ctx, { sourceId, movie }) {
  const resolved = await withTmdbIdentity(ctx, movie)
  const prefix = ctx.publicPrefix || '.'
  const counterpartRows = await tvCounterpartRows(ctx, resolved)
  const libraryAction = addToLibraryAction(ctx, 'movie', resolved, { prefix })
  const instantActions = [...counterpartRows, libraryAction].filter(Boolean)
  const status = libraryStatusLine(ctx, 'movie', resolved)

  const saved = ctx.getDeliveryDefault('movies')
  if (saved) {
    if (instantActions.length && typeof ctx.replyInstant === 'function') {
      await ctx.replyInstant({
        title:resolved.title,
        text:[status, `Using your saved download preference: ${saved.quality} · ${saved.delivery}.`]
          .filter(Boolean)
          .join('\n\n'),
        actions:instantActions,
      })
    } else if (status) {
      await ctx.reply(status)
    }
    return startDelivery(ctx, { sourceId, movie:resolved, quality:saved.quality, delivery:saved.delivery })
  }

  const options = await getOptions(ctx, sourceId, resolved)
  const related = await relatedBookRows(ctx, resolved)
  const sections = options.deliveries.map(delivery => ({
    title:delivery === 'document' ? 'Document (no WhatsApp video compression)' : 'Video in chat',
    rows:options.qualities.map(quality => ({
      title:`${quality === 'source' ? 'Source quality' : quality + 'p'} • ${delivery === 'document' ? 'Document' : 'Video'}`,
      description:'Download movie',
      id:`${prefix}movie ~download ${sourceId} ${token(resolved)} ${quality} ${delivery}`,
    })),
  }))
  if (related.length) sections.unshift({ title:'Based on', rows:related })
  if (instantActions.length) sections.push({ title:'Other actions', rows:instantActions })

  // Keep movie choices in the same single-select menu used by source and
  // result pickers. Mixing quick-reply buttons with a nested single-select
  // made the quality picker disappear on some WhatsApp clients.
  const text = [status, 'Choose a quality and delivery type from the menu.'].filter(Boolean).join('\n\n')
  return ctx.replyList({
    title:resolved.title,
    text,
    buttonText:'Choose quality',
    footer:`Save a default: ${prefix}delivery movies 720 document`,
    sections,
  })
}

export async function runMovieCommand(ctx, { args = [] } = {}) {
  const first = String(args[0] || '')
  try {
    if (first === '~library-add') {
      const result = await addCanonicalLibraryItem(ctx, 'movie', args[1])
      if (!result.ok) return ctx.reply('I could not add that movie to Library. Run the movie search again.')
      return ctx.reply(result.added
        ? `Added *${result.item.title}* to Library.`
        : `*${result.item.title}* is already in Library.`)
    }

    if (first === '~tmdb') {
      const media = typeof ctx.resolveTmdbMedia === 'function'
        ? await ctx.resolveTmdbMedia(Number(args[1]), 'movie')
        : null
      if (!media?.id) return ctx.reply('That movie selection expired. Run the movie search again.')
      return executeSearch(ctx, { query:media.title || media.aliases?.[0] || '' })
    }

    if (first === '~source') {
      return executeSearch(ctx, {
        sourceId:String(args[1] || ''),
        query:untoken(args[2] || ''),
      })
    }

    if (first === '~title') {
      return selectMovie(ctx, {
        sourceId:String(args[1] || ''),
        movie:untoken(args[2]),
      })
    }

    if (first === '~download') {
      return startDelivery(ctx, {
        sourceId:String(args[1] || ''),
        movie:untoken(args[2]),
        quality:String(args[3] || 'source'),
        delivery:String(args[4] || 'document'),
      })
    }
  } catch {
    return ctx.reply('That movie selection is invalid or expired. Run the movie command again.')
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
