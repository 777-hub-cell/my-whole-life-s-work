import { bootstrap, responseHeaders } from '../lib/vercel-policy.js';
export default function handler(req,res) {
  responseHeaders(res,'application/json; charset=utf-8');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode=405;
    res.setHeader('Allow','GET, HEAD');
    return res.end('');
  }
  res.statusCode=200;
  const content=JSON.stringify({ok:true,service:'night-control-centre',
    mode:bootstrap().adapter === 'live' ? 'live' : 'mock'});
  return res.end(req.method === 'HEAD' ? '' : content);
}
