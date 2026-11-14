// Publish only existing public assets, never source/test/hosting server files.
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dest=resolve(root,'dist');
await rm(dest,{recursive:true,force:true});
await mkdir(dest,{recursive:true});
for (const item of ['index.html','css','js']) {
  await cp(resolve(root,item),resolve(dest,item),{recursive:true});
}
console.log('NIGHT Control Centre static assets built');
