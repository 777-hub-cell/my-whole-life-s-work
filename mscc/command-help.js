function clean(value) {
  return String(value || '').trim()
}

function usageOf(command, prefix) {
  const raw = clean(command?.usage || (prefix + command?.name))
  return raw.startsWith('.') && prefix !== '.' ? prefix + raw.slice(1) : raw
}

function aliasesOf(command, prefix) {
  return (command?.aliases || [])
    .map(alias => clean(alias))
    .filter(Boolean)
    .map(alias => prefix + alias)
}

const HELP = {
  anime:{
    title:'Anime',
    flow:[
      'Search or browse anime, choose a title, then reply with episode numbers.',
      'Episode selections accept ranges and mixed sets such as 1-10, 1,3,4,7, or 1-10,13,15-18.',
      'A Manga instant reply appears only when AniList confirms a manga counterpart.',
      'Add to Library appears only when that anime is not already saved. Once saved, the button disappears and the result shows In Library.',
      'After selecting episodes, Night uses your saved delivery preference or asks for quality and delivery.',
    ],
    examples:['.anime Bleach','.anime Frieren','.anime Bleach --source kayoanime'],
    sourceCapability:'anime',
    deliveryCapability:'anime',
    related:['manga','library','source','sources','delivery'],
  },
  manga:{
    title:'Manga',
    flow:[
      'Search manga, choose a title, then reply with chapter numbers.',
      'Chapter selections use the same range syntax as anime: 1-10, 1,3,4,7, or mixed ranges.',
      'An Anime instant reply appears only when AniList confirms an anime adaptation/counterpart.',
      'Add to Library appears only when that manga is not already saved.',
      'Download options are shown after the chapter selection unless a delivery default is saved.',
    ],
    examples:['.manga Bleach','.manga Frieren'],
    sourceCapability:'manga',
    deliveryCapability:'manga',
    related:['anime','library','source','sources','delivery'],
  },
  movie:{
    title:'Movies',
    flow:[
      'Search for a movie, choose the result, then choose quality and delivery.',
      'A TV Series instant reply appears only when a verified related TV counterpart exists.',
      'Add to Library appears only when the movie is not already saved.',
      'Related book/novel actions remain available when a screen-to-book relationship is found.',
      'A saved movie delivery preference skips the quality/delivery picker.',
    ],
    examples:['.movie The Matrix','.movie Dune'],
    sourceCapability:'movies',
    deliveryCapability:'movies',
    related:['tv','library','book','source','sources','delivery'],
  },
  tv:{
    title:'TV Series',
    flow:[
      'Search for a TV series, choose the title and season, then reply with episode numbers.',
      'Single-season shows skip the unnecessary season picker.',
      'Episode selections accept 1-10, 1,3,4,7, and mixed ranges.',
      'A Movie instant reply appears only when a verified related movie counterpart exists.',
      'Add to Library appears only when the series is not already saved.',
      'Related book/novel actions remain available when found.',
    ],
    examples:['.tv Breaking Bad','.tv The Last of Us'],
    sourceCapability:'tv',
    deliveryCapability:'tv',
    related:['movie','library','book','source','sources','delivery'],
  },
  library:{
    title:'Library',
    flow:[
      'One Library stores Anime, Manga, Movies, and TV Series for each user.',
      'Open the full Library or filter it by media type.',
      'Every saved item receives a stable Library number. Opening that number returns to the normal media flow.',
      'Use remove to delete an item. Use watch/unwatch to control release watching; alerts are sent privately to your DM.',
      'The Add to Library instant reply is dynamic and disappears once the item is saved.',
    ],
    examples:['.library','.library anime','.library manga','.library movie','.library tv','.library 3','.library remove 3','.watch 3','.unwatch 3'],
    related:['anime','manga','movie','tv','watch','unwatch'],
  },
  source:{
    title:'Source defaults',
    flow:[
      'View or save a persistent source choice for a source-backed command folder.',
      'Folders with managed fallback chains cannot be manually pinned; .sources shows their primary/fallback order.',
      'For user-selectable folders, the saved source follows you across groups and bot sessions.',
      'Use clear or auto to remove your saved choice.',
    ],
    examples:['.source anime','.source manga <source>','.source movies <source>','.source tv <source>','.source anime clear'],
    related:['sources','delivery'],
  },
  sources:{
    title:'Installed sources',
    flow:[
      'Lists installed source adapters for one folder or every source-backed folder.',
      'Managed folders show primary/fallback roles. User-selectable folders show the current default.',
    ],
    examples:['.sources','.sources anime','.sources manga','.sources movies','.sources tv','.sources android','.sources courses'],
    related:['source','delivery'],
  },
  delivery:{
    title:'Download defaults',
    flow:[
      'Save the default quality/format and WhatsApp delivery style for a source-backed folder.',
      'Video-capable folders accept source/360/480/720/1080/1440/2160 and video or document delivery.',
      'Books use a book format such as epub or pdf with document delivery.',
      'Clear a saved default when you want Night to ask each time.',
    ],
    examples:['.delivery anime 720 document','.delivery movies 1080 video','.delivery youtube 720 document','.delivery books epub document','.delivery anime clear'],
    related:['source','sources'],
  },
  youtube:{
    title:'YouTube',
    flow:[
      'Search YouTube by text or paste a YouTube URL/video ID directly.',
      'Search results can be selected by number or from the result picker.',
      'After choosing a video, pick an available quality unless a YouTube delivery default is saved.',
      'Use --doc / --document to force file delivery or --video for inline video.',
    ],
    examples:['.youtube Kendrick Lamar HUMBLE','.yt https://youtu.be/dQw4w9WgXcQ','.yt <url> --doc'],
    deliveryCapability:'youtube',
    related:['delivery'],
  },
  apk:{
    title:'Android APK',
    flow:[
      'Search Android apps, choose the app, then choose a version and APK variant.',
      'The flow uses installed Android/APK sources and source fallback where configured.',
    ],
    examples:['.apk Firefox','.apk VLC'],
    sourceCapability:'android',
    related:['source','sources'],
  },
  course:{
    title:'Courses',
    flow:[
      'Search for a course/topic, choose a course, then reply with the part number or number range you want.',
      'Course sources are discovered from the installed source registry.',
    ],
    examples:['.course python','.course blender'],
    sourceCapability:'courses',
    related:['source','sources'],
  },
  book:{
    title:'Books & novels',
    flow:[
      'Search by title or author, choose the matching book/edition, then choose an available format.',
      'Books can also appear as verified related actions from movie/TV results.',
    ],
    examples:['.book Dune','.book George Orwell'],
    sourceCapability:'books',
    deliveryCapability:'books',
    related:['movie','tv','source','sources','delivery'],
  },
  song:{
    title:'Music',
    flow:[
      'Search for a song, then reply with the result number you want.',
      'The music flow can use configured providers and saved delivery preferences where supported.',
    ],
    examples:['.song Blinding Lights','.music Billie Jean','.play Numb Linkin Park'],
    sourceCapability:'music',
    deliveryCapability:'music',
    related:['lyrics','mimi','source','sources','delivery'],
  },
  lyrics:{
    title:'Lyrics',
    flow:[
      'Search for lyrics by song/title information and choose the matching track when needed.',
      'Track result instant replies return directly into the lyrics command.',
    ],
    examples:['.lyrics Numb Linkin Park','.lyrics Blinding Lights'],
    related:['song','mimi'],
  },
  web:{
    title:'Web search',
    flow:[
      'Search the web and return concise website results with title, domain, snippet, and URL.',
      'Up to eight concise results are returned.',
    ],
    examples:['.web Android 16 changes','.web best CSS grid guide'],
    related:['image','youtube'],
  },
  image:{
    title:'Image search',
    flow:[
      'Search the web for images and send the usable matching pictures into WhatsApp.',
      'The optional final number controls how many images to send, from 1 to 20. The default is 6.',
    ],
    examples:['.image Bleach','.image Lagos skyline 10'],
    related:['web'],
  },
  pin:{
    title:'Pinterest image search',
    flow:[
      'Search Pinterest and send matching images directly into WhatsApp.',
      'The optional amount controls how many usable results are requested.',
    ],
    examples:['.pin anime wallpaper','.pinterest cyberpunk 12'],
    related:['image','ps'],
  },
  ps:{
    title:'Pinterest sticker packs',
    flow:[
      'Build native WhatsApp sticker packs from a Pinterest search or from a replied URL file/ZIP.',
      'Search mode accepts a requested sticker count. File mode can use a custom pack name and range.',
      'At least three usable images are required to build a pack.',
    ],
    examples:['.ps Bleach 30','Reply to a URL file or ZIP with .ps My Pack 1-40'],
    related:['pin','sticker'],
  },
  sticker:{
    title:'Sticker maker',
    flow:[
      'Reply to an image, GIF, or video with the sticker command, or send the media with the command as its caption.',
      'Night converts the media into a native WhatsApp sticker and applies the current sticker-pack metadata.',
    ],
    examples:['Reply to an image with .sticker','Send an image with .s as the caption'],
    related:['take','toimg','togif','tovideo','ps'],
  },
  take:{
    title:'Take sticker',
    flow:[
      'Reply to a WhatsApp sticker with .take.',
      'Night rewrites the sticker pack metadata to the current WhatsApp name and sends the sticker back.',
    ],
    examples:['Reply to a sticker with .take'],
    related:['sticker'],
  },
  toimg:{
    title:'Sticker to image',
    flow:[
      'Reply to a static WhatsApp sticker to turn it back into a PNG image.',
      'Animated stickers are redirected to .togif or .tovideo instead.',
    ],
    examples:['Reply to a static sticker with .toimg'],
    related:['togif','tovideo','sticker'],
  },
  togif:{
    title:'Sticker to GIF',
    flow:[
      'Reply to a WhatsApp sticker to convert it into a real GIF file.',
      'The resulting GIF is sent as a document so the animation is preserved.',
    ],
    examples:['Reply to an animated sticker with .togif'],
    related:['toimg','tovideo','sticker'],
  },
  tovideo:{
    title:'Sticker to video',
    flow:[
      'Reply to an animated WhatsApp sticker to convert it into an MP4 video.',
    ],
    examples:['Reply to an animated sticker with .tovideo'],
    related:['togif','toimg','sticker'],
  },
  chess:{
    title:'Chess',
    flow:[
      'Start visual chess against another person or the Night bot.',
      'Human challenges can be joined from the interactive challenge. Bot mode lets you choose a difficulty.',
      'Moves can be typed as coordinates such as e2 e4. A square/piece can also be entered to preview legal moves.',
      'Promotion and resign/surrender input are supported, and the board updates after moves.',
    ],
    examples:['.chess','.chess bot','.chess rules','During a game: e2 e4'],
    related:['game','checkers','tictactoe','ludo'],
  },
  checkers:{
    title:'Checkers',
    flow:[
      'Start visual Checkers against another person or the Night bot.',
      'The board uses squares 1–32. Type a move such as 9 13 or a multi-jump such as 10 17 26.',
      'Captures are mandatory. Sending one square previews legal destinations.',
      'Bot difficulty, human challenges, resign/surrender, and board themes are supported.',
    ],
    examples:['.checkers','.checkers bot','.checkers rules','During a game: 9 13'],
    related:['game','chess','tictactoe','ludo'],
  },
  tictactoe:{
    title:'Tic-Tac-Toe',
    flow:[
      'Start a visual Tic-Tac-Toe game against another person or the Night bot.',
      'Human challenges use join/cancel actions; bot games support difficulty selection.',
      'During play, send the board position requested by the game. Resign/surrender is supported.',
    ],
    examples:['.ttt','.tictactoe bot'],
    related:['game','chess','checkers','ludo'],
  },
  ludo:{
    title:'Ludo',
    flow:[
      'Play full visual Ludo with bots or with 2–4 human players.',
      'The command handles game setup, turn input, board rendering, and the active Ludo session for the chat.',
    ],
    examples:['.ludo'],
    related:['game','chess','checkers','tictactoe'],
  },
  game:{
    title:'Game tools',
    flow:[
      'Open shared game tools and visual game editors.',
      'Individual games also have direct commands such as .chess, .checkers, .tictactoe, and .ludo.',
    ],
    examples:['.game edit','.chess','.checkers','.ttt','.ludo'],
    related:['chess','checkers','tictactoe','ludo'],
  },
  tweet:{
    title:'Tweet-style card',
    flow:[
      'Create a tweet-like image card locally inside Night.',
      'Use dark or light after the command to switch themes. Light is the default.',
      'Mention a user after the optional theme to use their visible Night/WhatsApp name and profile photo when available.',
      'Every generated card includes only a tiny transparent Night watermark.',
    ],
    examples:['.tweet This is actually wild','.tweet dark Late night thoughts','.tweet light @user I said what I said'],
    related:['post'],
  },
  post:{
    title:'Social post card',
    flow:[
      'Create Night’s generic social-post card from text.',
      'Use instagram, facebook, or story after the command to switch layouts.',
      'Mention a user after the optional style to use their visible name and profile photo when available.',
      'Every generated card includes only a tiny transparent Night watermark.',
    ],
    examples:['.post New chapter. Same me.','.post instagram Better days ahead','.post facebook @user Good people, good vibes','.post story New chapter'],
    related:['tweet'],
  },
  about:{
    title:'About Night',
    flow:[
      'Show Night’s public identity and the three personalities: Josia, Nami, and MiMi.',
      'The public page stays Night-branded; internal project names are not shown.',
    ],
    examples:['.about'],
    related:['help','menu','nami','mimi','owner'],
  },
  meme:{
    title:'Memes',
    flow:[
      'Fetch a safe image meme from a public Reddit meme feed.',
      'Optional categories include anime, wholesome, programming, and dank.',
    ],
    examples:['.meme','.meme anime','.meme programming'],
    related:['joke'],
  },
  joke:{
    title:'Jokes',
    flow:[
      'Fetch a safe random joke, with a built-in local fallback when the public joke service is unavailable.',
    ],
    examples:['.joke'],
    related:['meme'],
  },
  quote:{
    title:'Quote card',
    flow:[
      'Turn text into a polished square Night quote card.',
      'Mention a user first to use their visible name and profile picture as the quote author.',
      'The card keeps the tiny Night watermark.',
    ],
    examples:['.quote Keep moving forward','.quote @user I said what I said'],
    related:['caption','tweet','post'],
  },
  caption:{
    title:'Image caption',
    flow:[
      'Reply to an image and add a clean high-contrast caption over the bottom of it.',
      'The original image remains the main visual and the card keeps the tiny Night watermark.',
    ],
    examples:['Reply to an image with .caption this is cinema'],
    related:['quote'],
  },
  wanted:{
    title:'Wanted poster',
    flow:[
      'Create a wanted-poster image for yourself or a mentioned user using their visible profile picture when available.',
    ],
    examples:['.wanted','.wanted @user'],
    related:['jail','wasted'],
  },
  jail:{
    title:'Jail card',
    flow:[
      'Create a playful Night jail/mugshot card for yourself or a mentioned user.',
    ],
    examples:['.jail','.jail @user'],
    related:['wanted','wasted'],
  },
  wasted:{
    title:'Wasted card',
    flow:[
      'Create a GTA-style WASTED card for yourself or a mentioned user.',
    ],
    examples:['.wasted','.wasted @user'],
    related:['wanted','jail'],
  },
  achievement:{
    title:'Achievement card',
    flow:[
      'Create a game-style achievement-unlocked card from your text.',
    ],
    examples:['.achievement Survived Monday','.achievement Finished the assignment'],
    related:['quote'],
  },
  broadcast:{
    title:'Owner broadcast',
    flow:[
      'Owner-only: send one text message once to every unique group reachable through connected Night accounts.',
      'Groups shared by multiple personalities are deduplicated so they receive only one copy.',
    ],
    examples:['.broadcast Maintenance is complete'],
    related:['sudo'],
  },
  setbotname:{
    title:'Set bot profile name',
    flow:[
      'Owner-only: change the WhatsApp profile name of the Night account that receives the command.',
    ],
    examples:['.setbotname Josia'],
    related:['setbotpp'],
  },
  setbotpp:{
    title:'Set bot profile picture',
    flow:[
      'Owner-only: reply to an image to make it the current Night account’s WhatsApp profile picture.',
    ],
    examples:['Reply to an image with .setbotpp'],
    related:['setbotname'],
  },
  sudo:{
    title:'Public sudo access',
    flow:[
      'Primary-owner-only: add, remove, or list users allowed to run Night public owner commands.',
      'Sudo never grants access to the private control namespace.',
    ],
    examples:['.sudo add @user','.sudo remove @user','.sudo list'],
    related:['broadcast','setbotname','setbotpp'],
  },
  album:{
    title:'Albums',
    flow:[
      'Search the album catalog, choose an album, then Night shows its real ordered track list.',
      'Reply with track numbers to download selected songs through Night’s existing music source/fallback chain.',
      'Reply with all to download the entire displayed album.',
    ],
    examples:['.album DAMN. Kendrick Lamar','.album Thriller','After the track list: all'],
    sourceCapability:'music',
    related:['song','lyrics','mimi'],
  },
  afk:{
    title:'AFK',
    flow:[
      'Mark yourself away in the current group with an optional reason.',
      'Josia notices when people mention you or reply to one of your messages while you are away.',
      'When you return, Josia tags you and the people who called for you, then recaps what they said.',
      'Other people mentioned in the same message are preserved as plain names rather than extra live mentions.',
    ],
    examples:['.afk eating','.afk studying','.afk off'],
    related:['remindreply'],
  },
  rules:{
    title:'Group rules',
    flow:[
      'Show the rules configured for the current group.',
      'When rules exist, Night automatically sends them to each new member and specifically tags that new member.',
      'If welcome messages are enabled, the rules are appended to that member’s welcome; otherwise the rules are sent on their own.',
    ],
    examples:['.rules'],
    related:['setrules','welcome'],
  },
  setrules:{
    title:'Set group rules',
    flow:[
      'Group-admin-only: save the group rules exactly as written, including multiline numbered or dotted formatting.',
      'Use clear to remove the rules.',
    ],
    examples:['.setrules 1. Be respectful\n2. No spam','.setrules clear'],
    related:['rules','welcome'],
  },
  antispam:{
    title:'Anti-spam',
    flow:[
      'Group-admin-only: detect rapid-message floods and repeated duplicate messages from non-admin members.',
      'Night deletes the spam when Night has group-admin permission.',
    ],
    examples:['.antispam on','.antispam off'],
    related:['filter','antilink','antitag'],
  },
  filter:{
    title:'Group filters',
    flow:[
      'Group-admin-only: create phrase triggers that delete a message, warn the sender, or send an automatic reply.',
      'Use .filters or .filter with no arguments to list the current filters.',
    ],
    examples:['.filter add spamword | delete','.filter add badphrase | warn','.filter add hello night | reply Hey 👋','.filter remove 1'],
    related:['antispam'],
  },
  remindreply:{
    title:'Reply reminder',
    flow:[
      'Reply to a specific WhatsApp message and choose a duration.',
      'Night stores that message’s text, sender, and chat context and sends the reminder privately to your DM.',
    ],
    examples:['Reply with .rr 2h','Reply with .remindreply 3d'],
    related:['remind','schedule'],
  },
  shorten:{
    title:'Short URL',
    flow:[
      'Create a compact URL from a normal public HTTP(S) link.',
    ],
    examples:['.shorten https://example.com/very/long/link'],
    related:['linkinfo'],
  },
  linkinfo:{
    title:'Link info',
    flow:[
      'Inspect a public link safely and show its final URL, domain, title, description, and content type.',
      'Night blocks private-network destinations and re-checks redirects.',
    ],
    examples:['.linkinfo https://example.com'],
    related:['shorten','read'],
  },
  fact:{
    title:'Random fact',
    flow:[
      'Return a random sourced fact from Wikipedia with its page link.',
    ],
    examples:['.fact'],
    related:['joke'],
  },
  roast:{
    title:'Roast',
    flow:[
      'Ask Josia for a sharp, harsh-but-playful roast.',
      'Mention someone to roast that person; protected traits, health, trauma, and threats are kept out of it.',
    ],
    examples:['.roast','.roast @user'],
    related:['compliment'],
  },
  trailer:{
    title:'Trailer search',
    flow:[
      'Search YouTube for the requested title plus official trailer and continue through the normal YouTube result/download flow.',
    ],
    examples:['.trailer Dune Part Two','.trailer GTA VI'],
    related:['youtube','movie','tv'],
  },
  chapter:{
    title:'Direct manga chapter',
    flow:[
      'Give Night a manga title and known chapter number to skip the normal chapter-selection screen.',
      'Night resolves the title against the manga sources and starts that exact chapter using your saved delivery preference when available.',
    ],
    examples:['.chapter Bleach 50','.chapter Frieren 130'],
    related:['manga'],
  },
  request:{
    title:'Request',
    flow:[
      'Send a broken-source, broken-result, feature, or content request privately to the Night owner.',
      'The request includes enough sender/chat context for the owner to identify where the problem came from.',
    ],
    examples:['.request MangaK search is broken','.request please add this source'],
    related:['owner'],
  },
  profile:{
    title:'User profile',
    flow:[
      'Show your own Night profile card, or the card for a mentioned/replied-to user.',
      'The card uses the WhatsApp profile photo when available, plus the person’s visible display name and group role.',
      'Library stats show only totals by Anime, Manga, Movies, and TV Series, plus release-watch count. Saved titles are not exposed.',
      'If WhatsApp privacy blocks the profile photo, the command falls back to a text card.',
    ],
    examples:['.profile','.profile @user','Reply to a message with .profile'],
    related:['library'],
  },
  calc:{
    title:'Calculator',
    flow:[
      'Evaluate a local mathematical expression.',
      'Supports +, -, *, /, %, ^ and parentheses.',
    ],
    examples:['.calc 12 * (4 + 3)','.calc 2^10'],
    related:[],
  },
  qr:{
    title:'QR code',
    flow:[
      'Create a QR image from text or a link and send it into the chat.',
      'Input is limited to a practical QR payload size.',
    ],
    examples:['.qr https://example.com','.qr WiFi details here'],
    related:[],
  },
  ping:{
    title:'Ping',
    flow:[
      'Check whether the active Night personality is responding.',
    ],
    examples:['.ping'],
    related:['uptime'],
  },
  uptime:{
    title:'Uptime',
    flow:[
      'Show how long the current Night process has been running.',
    ],
    examples:['.uptime','.up'],
    related:['ping'],
  },
  summary:{
    title:'Group summary',
    flow:[
      'Summarize recent activity in the current group.',
      'The optional time window accepts hours or days and is capped to the supported recent-history window.',
      'This command only works in groups.',
    ],
    examples:['.summary','.summary 24h','.summary 3d','.recap 12h'],
    related:[],
  },
  delete:{
    title:'Delete recent messages',
    flow:[
      'Silently delete the requested number of recent messages in a group.',
      'This is group-only and requires the command user to satisfy the group-admin gate.',
      'The delete command message itself is removed last, so successful use leaves no confirmation chatter.',
    ],
    examples:['.delete 5','.del 10'],
    related:[],
  },
  compliment:{
    title:'Compliment',
    flow:[
      'Send a random compliment to a person.',
      'Mention someone, reply to their message, or use a resolvable target.',
    ],
    examples:['.compliment @user','Reply to a message with .compliment'],
    related:['truth','dare','ship'],
  },
  truth:{
    title:'Truth',
    flow:[
      'Return a random truth question for the current chat.',
      'Recent questions are tracked to avoid repeating the same pool items too quickly.',
    ],
    examples:['.truth'],
    related:['dare','ship','compliment'],
  },
  dare:{
    title:'Dare',
    flow:[
      'Return a random dare for the current chat.',
      'Recent dares are tracked to reduce repeats.',
    ],
    examples:['.dare'],
    related:['truth','ship','compliment'],
  },
  ship:{
    title:'Ship',
    flow:[
      'Mention two people to ship those exact users together.',
      'Mention one person to pair them with a random member, or use .ship with no mentions for a fully random pair.',
      'The result stays text-based.',
    ],
    examples:['.ship','.ship @user1 @user2'],
    related:['truth','dare','compliment'],
  },
  watch:{
    title:'Watch Library releases',
    flow:[
      'Enable release watching for a saved Library item by its stable Library number. New release alerts are sent privately to your DM.',
      'The item must already be in your Library.',
    ],
    examples:['.watch 3'],
    related:['library','unwatch'],
  },
  unwatch:{
    title:'Stop watching Library releases',
    flow:[
      'Disable release watching for a saved Library item by its stable Library number.',
    ],
    examples:['.unwatch 3'],
    related:['library','watch'],
  },
  nami:{
    title:"Nami's menu",
    flow:[
      'Opens Nami’s own Anime + Manga command menu.',
      'This is a personality menu, not an alias of .help or .menu.',
      'Nami uses her own two-image shuffled menu pool.',
    ],
    examples:['.nami'],
    related:['anime','manga'],
  },
  mimi:{
    title:"MiMi's menu",
    flow:[
      'Opens MiMi’s own Music + Movies + TV command menu.',
      'This is a personality menu, separate from Josia’s .menu and Nami’s .nami.',
      'MiMi uses her own two-image shuffled menu pool.',
    ],
    examples:['.mimi'],
    related:['song','movie','tv'],
  },
  menu:{
    title:"Josia's menu",
    flow:[
      'Opens Josia’s general public command menu.',
      'This is separate from .help. It uses Josia’s own two-image shuffled menu pool.',
      'Nami and MiMi have their own menus: .nami and .mimi.',
    ],
    examples:['.menu'],
    related:['nami','mimi','help'],
  },
}

const aliasToCanonical = {
  movies:'movie',
  film:'movie',
  series:'tv',
  show:'tv',
  shows:'tv',
  music:'song',
  play:'song',
  yt:'youtube',
  lib:'library',
  commands:'help',
}

function sourceLines(ctx, capability) {
  if (!capability || typeof ctx?.listSources !== 'function') return []
  const sources = ctx.listSources(capability) || []
  if (!sources.length) return []
  const mode = typeof ctx.sourceMode === 'function' ? ctx.sourceMode(capability) : ''
  const current = mode === 'user-choice' && typeof ctx.getSourceDefault === 'function'
    ? ctx.getSourceDefault(capability)
    : ''
  const lines = ['Sources']
  for (const source of sources) {
    const tags = []
    if (mode === 'managed') tags.push(source.primary ? 'primary' : 'fallback')
    if (current && current === source.id) tags.push('default')
    lines.push('• ' + source.name + (tags.length ? ' (' + tags.join(', ') + ')' : ''))
  }
  return lines
}

function deliveryLines(ctx, capability) {
  if (!capability || typeof ctx?.getDeliveryDefault !== 'function') return []
  const saved = ctx.getDeliveryDefault(capability)
  if (!saved) return []
  return ['Saved download preference', '• ' + saved.quality + ' · ' + saved.delivery]
}

function relatedCommands(command, commands, spec, prefix) {
  const names = new Set((spec?.related || []).map(value => String(value).toLowerCase()))
  const capability = String(command?.capability || '').toLowerCase()
  for (const candidate of commands) {
    if (candidate === command || candidate?.hidden === true) continue
    if (capability && String(candidate?.capability || '').toLowerCase() === capability) {
      names.add(String(candidate.name || '').toLowerCase())
    }
  }
  return [...names]
    .filter(Boolean)
    .map(name => prefix + name)
    .slice(0, 12)
}

export function resolveHelpCommand(commands = [], requested = '') {
  const wanted = clean(requested).replace(/^\./, '').toLowerCase()
  if (!wanted) return null
  const canonicalWanted = aliasToCanonical[wanted] || wanted
  return commands.find(command =>
    String(command?.name || '').toLowerCase() === canonicalWanted ||
    (command?.aliases || []).some(alias => String(alias || '').toLowerCase() === wanted)
  ) || null
}

export function commandHelpText(ctx, command, commands = []) {
  const prefix = ctx.publicPrefix || '.'
  const name = String(command?.name || '').toLowerCase()
  const spec = HELP[name] || {}
  const lines = [
    '*' + (spec.title || (prefix + name)) + '*',
    command?.description ? clean(command.description) : '',
    '',
    'Usage',
    usageOf(command, prefix),
  ].filter(value => value !== '')

  const aliases = aliasesOf(command, prefix)
  if (aliases.length) lines.push('', 'Aliases', aliases.join(', '))

  const flow = Array.isArray(spec.flow) ? spec.flow : []
  if (flow.length) {
    lines.push('', 'How it works')
    flow.forEach((step, index) => lines.push(String(index + 1) + '. ' + step))
  } else if (command?.help) {
    lines.push('', clean(command.help))
  }

  const examples = Array.isArray(spec.examples) ? spec.examples : []
  if (examples.length) {
    lines.push('', 'Examples')
    for (const example of examples) {
      lines.push('• ' + (prefix === '.' ? example : example.replace(/^\./, prefix)))
    }
  }

  const dynamicSources = sourceLines(ctx, spec.sourceCapability)
  if (dynamicSources.length) lines.push('', ...dynamicSources)

  const dynamicDelivery = deliveryLines(ctx, spec.deliveryCapability)
  if (dynamicDelivery.length) lines.push('', ...dynamicDelivery)

  const related = relatedCommands(command, commands, spec, prefix)
  if (related.length) lines.push('', 'Related', related.join(' · '))

  return lines.join('\n')
}

export function helpIndexText(ctx, commands = []) {
  const prefix = ctx.publicPrefix || '.'
  const visible = commands
    .filter(command => command?.hidden !== true)
    .sort((a,b) =>
      String(a?.capability || '').localeCompare(String(b?.capability || '')) ||
      String(a?.name || '').localeCompare(String(b?.name || ''))
    )

  const groups = new Map()
  for (const command of visible) {
    const capability = String(command?.capability || 'general').trim().toUpperCase() || 'GENERAL'
    if (!groups.has(capability)) groups.set(capability, [])
    groups.get(capability).push(command)
  }

  const lines = [
    '*Night Help*',
    'Use ' + prefix + 'help <command> for the complete help page for that command.',
    '',
    'Personality menus: ' + prefix + 'menu · ' + prefix + 'nami · ' + prefix + 'mimi',
  ]

  for (const [capability, group] of groups) {
    lines.push('', '*' + capability + '*')
    lines.push(group.map(command => prefix + command.name).join(' · '))
  }

  lines.push('', 'Example: ' + prefix + 'help anime')
  return lines.join('\n')
}
