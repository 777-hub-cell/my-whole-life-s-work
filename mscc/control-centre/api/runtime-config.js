import { bootstrap, responseHeaders } from '../lib/vercel-policy.js';
export default function handler(req,res) {
  responseHeaders(res,'text/javascript; charset=utf-8');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode=405;
    res.setHeader('Allow','GET, HEAD');
    return res.end('');
  }
  res.statusCode=200;
  const script='window.MSCC_CONTROL_CENTRE_BOOTSTRAP = ' + JSON.stringify(bootstrap()) + ';\n';
  return res.end(req.method === 'HEAD' ? '' : script);
}
