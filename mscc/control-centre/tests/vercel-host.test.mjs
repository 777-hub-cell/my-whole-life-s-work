import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { bootstrap, productionUpstream } from '../lib/vercel-policy.js';
import { proxyControlCentre, targetPath } from '../api/night-proxy.js';

const live={VERCEL_ENV:'production', VERCEL_GIT_COMMIT_REF:'mscc-azure', NIGHT_API_UPSTREAM:'https://secured.example.invalid'};
function response() {
  const headers=new Map();
  return {
    statusCode:200, headers, payload:'',
    setHeader(key,value) { headers.set(key.toLowerCase(),value); },
    end(bytes) { this.payload = bytes == null ? '' : Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes); },
    json() { return JSON.parse(this.payload); }
  };
}
function request({method='GET', route='auth/session', headers={}, body, url}={}) {
  return Object.assign(Readable.from([]),{
    method, url:url || '/api/night-proxy?__night_route='+encodeURIComponent(route),
    query:{__night_route:route}, headers:{host:'control.vercel.app',...headers},
    ...(body === undefined ? {} : {body})
  });
}

test('only the verified production Vercel environment and source branch can contact Azure',()=>{
  assert.equal(productionUpstream(live),'https://secured.example.invalid');
  assert.equal(productionUpstream({...live,VERCEL_ENV:'preview'}),null);
  assert.equal(productionUpstream({...live,VERCEL_GIT_COMMIT_REF:'main'}),null);
  assert.equal(productionUpstream({...live,NIGHT_API_UPSTREAM:'http://example.com'}),null);
  assert.equal(productionUpstream({...live,NIGHT_API_UPSTREAM:'https://example.com/path'}),null);
  assert.equal(productionUpstream({...live,NIGHT_API_UPSTREAM:'https://secret@example.com'}),null);
  assert.equal(productionUpstream({...live,NIGHT_API_ACCESS_CLIENT_ID:'incomplete'}),null);
  assert.deepEqual(bootstrap({...live,VERCEL_ENV:'preview'}),{});
  assert.equal(bootstrap(live).adapter,'live');
});

test('API route preserves file paths and rejects traversal',()=>{
  assert.equal(targetPath(request({route:'files/preview',url:'/api/night-proxy?__night_route=files%2Fpreview&path=%2Fcustom-commands%2Fgeneral%2Fa.js'})),
    '/api/control-centre/files/preview?path=%2Fcustom-commands%2Fgeneral%2Fa.js');
  assert.throws(()=>targetPath(request({route:'../secrets'})),/Invalid/);
  assert.throws(()=>targetPath(request({route:'auth//session'})),/Invalid/);
});

test('preview API cannot contact Azure even with mistakenly populated upstream variables',async()=>{
  const res=response();
  await proxyControlCentre(request(),res,{env:{...live,VERCEL_ENV:'preview'},fetchImpl:()=>{throw Error('Never contact Azure')}});
  assert.equal(res.statusCode,503);
  assert.equal(res.json().error.code,'API_NOT_CONFIGURED');
});

test('proxy preserves cookies, CSRF, original request context and API status',async()=>{
  const res=response();let seen;
  const cookies=new Headers({'content-type':'application/json; charset=utf-8'});
  cookies.append('set-cookie','night_cc_pre=; Path=/api/control-centre; HttpOnly; Secure');
  cookies.append('set-cookie','night_cc_session=test; Path=/api/control-centre; HttpOnly; Secure');
  await proxyControlCentre(request({method:'POST',route:'auth/login',body:{password:'test-only'},
    headers:{cookie:'night_cc_pre=abc',origin:'https://control.vercel.app','x-csrf-token':'example-csrf',
      'x-forwarded-host':'attacker.invalid','x-forwarded-proto':'http'}}),res,{
    env:live, fetchImpl:async(url,init)=>{
      seen={url:url.href,init};
      return new Response(JSON.stringify({ok:true}),{status:201,headers:cookies});
    }
  });
  assert.equal(res.statusCode,201);
  assert.equal(seen.url,'https://secured.example.invalid/api/control-centre/auth/login');
  assert.equal(seen.init.headers['x-forwarded-host'],'control.vercel.app');
  assert.equal(seen.init.headers['x-forwarded-proto'],'https');
  assert.equal(seen.init.headers.origin,'https://control.vercel.app');
  assert.equal(seen.init.headers.cookie,'night_cc_pre=abc');
  assert.equal(seen.init.headers['x-csrf-token'],'example-csrf');
  assert.equal(res.headers.get('set-cookie').length,2);
  assert.equal(res.headers.get('cache-control'),'no-store, max-age=0');
});

test('API protects body limit and refuses upstream redirects',async()=>{
  const large=response();
  await proxyControlCentre(request({method:'POST',body:{data:'a'.repeat(66000)}}),large,{
    env:live,fetchImpl:()=>{throw Error('Must not be called')}
  });
  assert.equal(large.statusCode,413);
  const redirect=response();
  await proxyControlCentre(request(),redirect,{env:live,
    fetchImpl:async()=>new Response('',{status:302,headers:{location:'https://internal.invalid'}})});
  assert.equal(redirect.statusCode,502);
  assert.equal(redirect.json().error.code,'UPSTREAM_REDIRECT');
});

test('Vercel configuration maintains a static asset build and same-origin routing',async()=>{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.outputDirectory,'dist');
  assert.ok(config.rewrites.some(r=>r.source==='/runtime-config.js'));
  assert.ok(config.rewrites.some(r=>r.source==='/api/control-centre/:nightRoute*'));
  const builder=await readFile(new URL('../tools/build-vercel.mjs',import.meta.url),'utf8');
  assert.ok(builder.includes("['index.html','css','js']"));
});
