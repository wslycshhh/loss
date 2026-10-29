import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root=path.resolve('dist');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
const style=html.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if(!script||!style)throw new Error('Expected a single bundled script and stylesheet.');
const readAsset=url=>{
  const filename=path.resolve(root,url.replace(/^\.\//,''));
  if(!filename.startsWith(root+path.sep))throw new Error('Asset outside dist');
  return fs.readFileSync(filename,'utf8');
};
const js=readAsset(script[1]).replace(/<\/script/gi,'<\\/script');
const css=readAsset(style[1]);
const hash=createHash('sha256').update(js).digest('base64');
html=html.replace(script[0],`<script type="module">${js}</script>`).replace(style[0],`<style>${css}</style>`);
html=html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'">`);
fs.writeFileSync(path.join(root,'offline.html'),html);
console.log('Built dist/offline.html: standalone, no external assets or runtime connections.');
