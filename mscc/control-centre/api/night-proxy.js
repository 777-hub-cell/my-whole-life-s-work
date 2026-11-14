import { productionUpstream, responseHeaders } from '../lib/vercel-policy.js';

const METHODS=new Set(['GET','HEAD','POST','PUT','PATCH','DELETE']);
const MAX_BODY=65536, MAX_RESPONSE=2097152;
const SENT_HEADERS=['accept','content-type','cookie','origin','x-requested-with','x-csrf-token','user-agent'];
function fail(res,status,code,message) {
  responseHeaders(res,'application/json; charset=utf-8');
  res.statusCode=status;
  return res.end(JSON.stringify({ok:false,error:{code,message}}));
}
export function targetPath(req) {
  const u=new URL(req.url || '/', 'https://night.invalid');
  const route=req.query?.__night_route ?? u.searchParams.get('__night_route');
  if (typeof route !== 'string' || route.length > 2048 ||
      (route && (!/^[a-zA-Z0-9._~/-]+$/.test(route) ||
       route.split('/').some(p=>!p || p==='.' || p==='..')))) {
    throw new Error('Invalid API path');
  }
  u.searchParams.delete('__night_route');
  return '/api/control-centre' + (route ? '/' + route : '') +
    (u.searchParams.size ? '?' + u.searchParams.toString() : '');
}
function trustedHost(req) {
  const host=String(req.headers.host || '');
  if (host.length > 255 || !/^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(host)) {
    throw new Error('Invalid website host');
  }
  return host;
}
async function bodyBytes(req) {
  const declared=req.headers['content-length'];
  if (declared && (!/^\d+$/.test(String(declared)) || Number(declared)>MAX_BODY)) {
    throw new Error('Body too large');
  }
  let bytes;
  if (Buffer.isBuffer(req.body)) bytes=req.body;
  else if (typeof req.body === 'string') bytes=Buffer.from(req.body);
  else if (req.body != null) bytes=Buffer.from(JSON.stringify(req.body));
  else {
    const parts=[]; let size=0;
    for await (const part of req) {
      size+=part.length;
      if (size>MAX_BODY) throw new Error('Body too large');
      parts.push(Buffer.from(part));
    }
    bytes=Buffer.concat(parts);
  }
  if (bytes.length>MAX_BODY) throw new Error('Body too large');
  return bytes;
}
async function readResponse(response) {
  const declared=Number(response.headers.get('content-length') || 0);
  if (declared>MAX_RESPONSE) throw new Error('API response too large');
  let size=0;
  const parts=[];
  if (response.body) for await (const part of response.body) {
    size+=part.byteLength;
    if (size>MAX_RESPONSE) throw new Error('API response too large');
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts);
}
export async function proxyControlCentre(req,res,{env=process.env,fetchImpl=fetch}={}) {
  responseHeaders(res,'application/json; charset=utf-8');
  const upstream=productionUpstream(env);
  if (!upstream) return fail(res,503,'API_NOT_CONFIGURED',
    'The Control Centre is in isolated preview mode or the secure API upstream is not configured.');
  const method=String(req.method || 'GET').toUpperCase();
  if (!METHODS.has(method)) {
    res.setHeader('Allow',Array.from(METHODS).join(', '));
    return fail(res,405,'METHOD_NOT_ALLOWED','Method not allowed.');
  }
  let url, headers;
  try {
    url=new URL(targetPath(req),upstream);
    headers={};
    for (const key of SENT_HEADERS) {
      if (req.headers[key] !== undefined) headers[key]=req.headers[key];
    }
    // The ingress Host is authoritative. Never forward incoming X-Forwarded-*.
    headers['x-forwarded-host']=trustedHost(req);
    headers['x-forwarded-proto']='https';
    headers['ngrok-skip-browser-warning']='1';
    if (env.NIGHT_API_ACCESS_CLIENT_ID && env.NIGHT_API_ACCESS_CLIENT_SECRET) {
      headers['cf-access-client-id']=env.NIGHT_API_ACCESS_CLIENT_ID;
      headers['cf-access-client-secret']=env.NIGHT_API_ACCESS_CLIENT_SECRET;
    }
  } catch {
    return fail(res,400,'BAD_REQUEST','Invalid Control Centre request.');
  }
  let body;
  try {
    if (method !== 'GET' && method !== 'HEAD') body=await bodyBytes(req);
  } catch {
    return fail(res,413,'BODY_TOO_LARGE','The request is too large.');
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),35000);
  try {
    const reply=await fetchImpl(url,{
      method,headers,body:body?.length ? body : undefined,
      redirect:'manual',signal:controller.signal
    });
    if (reply.status>=300 && reply.status<400) {
      return fail(res,502,'UPSTREAM_REDIRECT','The bot API returned an unexpected redirect.');
    }
    const data=await readResponse(reply);
    for (const key of ['content-type','content-disposition']) {
      const value=reply.headers.get(key);
      if (value) res.setHeader(key,value);
    }
    const cookies=reply.headers.getSetCookie?.() || [];
    if (cookies.length) res.setHeader('Set-Cookie',cookies);
    else if (reply.headers.get('set-cookie')) res.setHeader('Set-Cookie',reply.headers.get('set-cookie'));
    res.statusCode=reply.status;
    return res.end(method==='HEAD' ? '' : data);
  } catch {
    return fail(res,502,'API_UPSTREAM_UNAVAILABLE','The bot API is temporarily unavailable.');
  } finally {
    clearTimeout(timer);
  }
}
export default (req,res)=>proxyControlCentre(req,res);
