const token = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
const untoken = value => JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'))

const titleOf = item => String(item?.title || item?.name || 'Untitled')
const idOf = item => String(item?.id ?? item?.workId ?? item?.url ?? titleOf(item))

function normalizeBook(item, index = 0) {
  return {
    id:idOf(item),
    number:String(index + 1),
    title:titleOf(item),
    author:String(item?.author || item?.authorName || '').trim(),
    year:String(item?.year || item?.published || '').trim(),
    cover:String(item?.cover || item?.image || item?.thumbnail || '').trim(),
    synopsis:String(item?.synopsis || item?.description || item?.summary || '').trim(),
    wikidataId:String(item?.wikidataId || '').trim(),
    raw:item,
  }
}

function normalizeEdition(item, index = 0) {
  return {
    id:String(item?.id ?? item?.editionId ?? item?.isbn ?? item?.url ?? index + 1),
    number:String(index + 1),
    title:String(item?.title || item?.format || item?.name || `Edition ${index + 1}`),
    format:String(item?.format || item?.type || '').trim(),
    language:String(item?.language || '').trim(),
    size:String(item?.size || '').trim(),
    raw:item,
  }
}

function parsePick(value, entries = []) {
  const n = Number(String(value || '').trim())
  if (!Number.isInteger(n) || n < 1 || n > entries.length) return null
  return entries[n - 1]
}

function normalizeFormatKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function editionFormatKey(edition) {
  return normalizeFormatKey(edition?.format || edition?.title || '')
}

function savedBookFormat(ctx) {
  const saved = ctx.getDeliveryDefault?.('books')
  return normalizeFormatKey(saved?.quality || '')
}

function outcomeError(ctx, outcome, respond = value => ctx.reply(value)) {
  if (outcome?.status === 'no-sources') return respond('No book sources are installed yet.')
  if (outcome?.status === 'source-error') {
    const source = outcome.source?.name || 'The book source'
    const detail = String(outcome.error?.message || '').replace(/\\s+/g, ' ').trim().slice(0, 180)
    return respond(detail ? `${source} failed: ${detail}` : `${source} could not complete that request.`)
  }
  if (outcome?.status === 'unknown-source') {
    const names = (outcome.sources || []).map(source => source.id).join(', ')
    return respond(`Unknown book source "${outcome.sourceId}". Available: ${names || 'none'}.`)
  }
  if (outcome?.status === 'all-failed') {
    const detail = String(outcome.error?.message || '').replace(/\\s+/g, ' ').trim().slice(0, 180)
    return respond(detail ? `All book sources failed: ${detail}` : 'All configured book sources failed for that request.')
  }
  return respond('Could not complete that book request.')
}

async function chooseSource(ctx, query) {
  const sources = ctx.listSources('books')
  const prefix = ctx.publicPrefix || '.'
  if (!sources.length) return outcomeError(ctx, { status:'no-sources' })
  return ctx.replyList({
    title:'Choose book source',
    text:`Choose a source for “${query}”.`,
    buttonText:'Choose source',
    footer:`Save a default: ${prefix}source books <source>`,
    rows:sources.map(source => ({
      title:source.name,
      description:source.description || 'Use for this search',
      id:`${prefix}book ~source ${source.id} ${token(query)}`,
    })),
  })
}

async function search(ctx, { query, sourceId = '' }) {
  if (!query) return ctx.reply('Usage: .book <title or author>')

  const selectedSource = sourceId
    ? (ctx.listSources('books') || []).find(source => source.id === sourceId)
    : null
  let progress = null
  if (sourceId && typeof ctx.progress === 'function') {
    try {
      progress = await ctx.progress(`Searching ${selectedSource?.name || sourceId} for “${query}”…`)
    } catch {}
  }
  const respond = value => progress?.done ? progress.done(value) : ctx.reply(value)

  let outcome
  try {
    outcome = await ctx.executeSource({
      capability:'books',
      explicitSource:sourceId,
      payload:{ action:'search', query },
    })
  } catch (error) {
    console.warn('[book-flow] book source search failed:', sourceId || 'default', error?.message || error)
    return respond(`${selectedSource?.name || 'The selected book source'} could not complete that search. Try another source or choose one with ${ctx.publicPrefix || '.'}sources books.`)
  }

  if (outcome.status === 'choice-required') return chooseSource(ctx, query)
  if (outcome.status !== 'ok') return outcomeError(ctx, outcome, respond)

  const result = outcome.result || {}
  const books = (Array.isArray(result.items) ? result.items : result.item ? [result.item] : [])
    .map(normalizeBook)

  if (!books.length) return respond(`No books found for “${query}”.`)

  ctx.setCommandReplySession?.({
    kind:'number-selection',
    command:'book',
    stage:'book',
    sourceId:outcome.source.id,
    entries:books,
    expiresAt:Date.now() + 30 * 60000,
  })

  return respond([
    `*Books for “${query}”*`,
    '',
    ...books.slice(0, 25).map(book => {
      const extra = [book.author, book.year].filter(Boolean).join(' • ')
      return `${book.number}. ${book.title}${extra ? ` — ${extra}` : ''}`
    }),
    '',
    'Reply with the book number.',
  ].join('\n'))
}

async function previewBook(ctx, book, editions = []) {
  const cover = String(book?.cover || book?.raw?.cover || book?.raw?.image || book?.raw?.thumbnail || '').trim()
  const formats = [...new Set(
    editions
      .map(edition => String(edition?.format || edition?.title || '').trim().toUpperCase())
      .filter(Boolean)
  )]
  const synopsis = String(book?.synopsis || book?.raw?.synopsis || book?.raw?.description || book?.raw?.summary || '').trim()
  const lines = [
    `*${book.title}*`,
    book.author ? `Author: ${book.author}` : '',
    book.year ? `Published: ${book.year}` : '',
    formats.length ? `Formats: ${formats.join(' • ')}` : '',
    synopsis ? `Synopsis: ${synopsis}` : '',
  ].filter(Boolean)
  if (!lines.length) return false

  try {
    if (cover && typeof ctx.sendImageUrl === 'function') {
      await ctx.sendImageUrl(cover, lines.join('\n'))
      return true
    }
    await ctx.reply(lines.join('\n'))
    return true
  } catch {
    return false
  }
}

async function adaptationRows(ctx, book) {
  if (typeof ctx.resolveBookScreens !== 'function') return []
  const relations = await ctx.resolveBookScreens({
    title:book.title,
    author:book.author,
    wikidataId:book.wikidataId,
  })
  const prefix = ctx.publicPrefix || '.'
  return relations.slice(0, 5).flatMap(item => {
    if (item.tmdbMovieId) {
      return [{
        title:`🎬 Movie: ${item.title}`,
        description:'Open the movie command flow',
        id:`${prefix}movie ~tmdb ${item.tmdbMovieId}`,
      }]
    }
    if (item.tmdbTvId) {
      return [{
        title:`📺 Series: ${item.title}`,
        description:'Open the TV command flow',
        id:`${prefix}tv ~tmdb ${item.tmdbTvId}`,
      }]
    }
    return []
  })
}

async function loadEditions(ctx, { sourceId, book }) {
  const outcome = await ctx.executeSource({
    capability:'books',
    explicitSource:sourceId,
    payload:{ action:'editions', itemId:book.id, item:book.raw || book },
  })
  if (outcome.status !== 'ok') return outcomeError(ctx, outcome)

  const result = outcome.result || {}
  const sourceBook = result.book || {}
  const enrichedBook = {
    ...book,
    author:String(sourceBook.author || book.author || '').trim(),
    year:String(sourceBook.year || book.year || '').trim(),
    cover:String(sourceBook.cover || book.cover || '').trim(),
    synopsis:String(sourceBook.synopsis || book.synopsis || '').trim(),
  }
  let editions = (result.editions || result.formats || result.items || []).map(normalizeEdition)
  const related = await adaptationRows(ctx, enrichedBook)

  if (!editions.length) {
    await previewBook(ctx, enrichedBook, [])
    return download(ctx, { sourceId, book:enrichedBook, edition:null })
  }

  await previewBook(ctx, enrichedBook, editions)

  const preferredFormat = savedBookFormat(ctx)
  if (preferredFormat) {
    const preferred = editions.filter(edition => editionFormatKey(edition) === preferredFormat)
    if (preferred.length === 1) {
      const result = await download(ctx, { sourceId, book:enrichedBook, edition:preferred[0] })
      if (related.length) {
        await ctx.replyList({
          title:enrichedBook.title,
          text:`Using saved ${preferred[0].format || preferred[0].title} format.`,
          buttonText:'Adaptations',
          rows:related,
        })
      }
      return result
    }
    if (preferred.length > 1) {
      const preferredIds = new Set(preferred.map(edition => edition.id))
      editions = [...preferred, ...editions.filter(edition => !preferredIds.has(edition.id))]
    }
  }

  if (editions.length === 1) {
    const result = await download(ctx, { sourceId, book:enrichedBook, edition:editions[0] })
    if (related.length) {
      await ctx.replyList({
        title:enrichedBook.title,
        text:`Downloading ${editions[0].format || editions[0].title}.`,
        buttonText:'Adaptations',
        rows:related,
      })
    }
    return result
  }

  ctx.setCommandReplySession?.({
    kind:'number-selection',
    command:'book',
    stage:'edition',
    sourceId,
    book:enrichedBook,
    entries:editions,
    expiresAt:Date.now() + 30 * 60000,
  })

  const text = [
    `*${enrichedBook.title}*`,
    preferredFormat ? `Saved format: ${preferredFormat.toUpperCase()}` : '',
    '',
    ...editions.slice(0, 25).map(edition => {
      const extra = [edition.format, edition.language, edition.size].filter(Boolean).join(' • ')
      return `${edition.number}. ${edition.title}${extra ? ` — ${extra}` : ''}`
    }),
    '',
    'Reply with the edition/format number.',
    `Save a default: ${ctx.publicPrefix || '.'}delivery books epub document`,
  ].filter(Boolean).join('\n')

  if (related.length) {
    return ctx.replyList({
      title:enrichedBook.title,
      text,
      buttonText:'Adaptations',
      footer:`Type the edition number to download. Save format: ${ctx.publicPrefix || '.'}delivery books epub document`,
      rows:related,
    })
  }
  return ctx.reply(text)
}

async function download(ctx, { sourceId, book, edition }) {
  ctx.clearCommandReplySession?.()
  let progress = null
  if (typeof ctx.progress === 'function') {
    try { progress = await ctx.progress(`Preparing ${book.title} for delivery…`) } catch {}
  }
  const respond = value => progress?.done ? progress.done(value) : ctx.reply(value)
  const outcome = await ctx.executeSource({
    capability:'books',
    explicitSource:sourceId,
    payload:{
      action:'download',
      itemId:book.id,
      item:book.raw || book,
      edition:edition?.raw || edition || null,
      editionId:edition?.id || '',
      delivery:'document',
    },
  })
  if (outcome.status !== 'ok') return outcomeError(ctx, outcome, respond)
  if (outcome.result?.delivered === true) {
    return respond(`Sent ${book.title} successfully.`)
  }
  if (typeof outcome.result === 'string') return respond(outcome.result)
  if (outcome.result?.text) return respond(String(outcome.result.text))
  return respond(`The source did not confirm that ${book.title} was delivered. Please try another source.`)
}

async function handleNumbers(ctx) {
  const session = ctx.getCommandReplySession?.()
  if (!session || session.command !== 'book' || session.kind !== 'number-selection') {
    return ctx.reply('That book selection expired. Run .book again.')
  }

  const selected = parsePick(ctx.commandReplyInput, session.entries || [])
  if (!selected) return ctx.reply('Reply with one number from the book list.')

  if (session.stage === 'book') {
    return loadEditions(ctx, { sourceId:session.sourceId, book:selected })
  }
  if (session.stage === 'edition') {
    return download(ctx, { sourceId:session.sourceId, book:session.book, edition:selected })
  }
  return ctx.reply('That book selection expired. Run .book again.')
}

export async function runBookCommand(ctx, { args = [] } = {}) {
  const first = String(args[0] || '')
  if (first === '~numbers') return handleNumbers(ctx)
  if (first === '~relation') {
    let query
    try {
      query = untoken(args[1] || '')
    } catch {
      return ctx.reply('That book relation expired. Search the book again.')
    }
    return await search(ctx, { query })
  }
  if (first === '~source') {
    let query
    try {
      query = untoken(args[2] || '')
    } catch {
      return ctx.reply('That book source selection expired. Run .book again.')
    }
    return await search(ctx, {
      sourceId:String(args[1] || ''),
      query,
    })
  }
  return search(ctx, { query:args.join(' ').trim() })
}
