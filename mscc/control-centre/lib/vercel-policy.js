// Fail closed: a Vercel preview, or production deployed from the wrong branch,
// must never connect to the authoritative Azure bot.
export function productionUpstream(env = process.env) {
  if (env.VERCEL_ENV !== 'production' || env.VERCEL_GIT_COMMIT_REF !== 'mscc-azure') return null;
  try {
    const url = new URL(String(env.NIGHT_API_UPSTREAM || '').trim());
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.search || url.hash || !['', '/'].includes(url.pathname)) return null;
    if (['localhost','127.0.0.1','[::1]'].includes(url.hostname)) return null;
    if (Boolean(env.NIGHT_API_ACCESS_CLIENT_ID) !== Boolean(env.NIGHT_API_ACCESS_CLIENT_SECRET)) return null;
    return url.origin;
  } catch { return null; }
}
export function bootstrap(env = process.env) {
  return productionUpstream(env) ? {
    adapter:'live', apiBase:'/api/control-centre', apiTimeoutMs:30000, requireCsrf:true,
    capabilities:{
      filesReadOnly:true, filesWrite:false, envWrite:true, profilesWrite:false,
      profileCapabilities:false, accountOverrides:false, moduleToggle:true,
      settingsEditor:true
    }
  } : {};
}
export function responseHeaders(res, type) {
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  if (type) res.setHeader('Content-Type',type);
}
