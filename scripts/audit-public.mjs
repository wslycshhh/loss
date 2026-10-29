import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root=process.cwd();
const files=[];
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(['node_modules','.git'].includes(entry.name))continue;
    const filename=path.join(dir,entry.name);
    if(entry.isSymbolicLink())throw new Error('Public tree must not contain links');
    if(entry.isDirectory())walk(filename);else files.push(filename);
  }
}
walk(root);
const privatePath=process.argv[2];
let privateMarkers=[];
if(privatePath){
  if(path.resolve(privatePath).startsWith(root+path.sep))throw new Error('Restricted attachment must stay outside public tree');
  const raw=JSON.parse(fs.readFileSync(privatePath,'utf8'));
  privateMarkers=[raw.id,raw.source?.documentTitle,raw.distribution,...(raw.insertionLoss??[]).flatMap(x=>x.coeff.map(String).filter(v=>v.length>=8))].filter(Boolean);
}
const patterns=[/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,/gh[pousr]_[A-Za-z0-9]{25,}/,/sk-[A-Za-z0-9]{30,}/,/[A-Z]:\\Users\\\d+\\/i,/H:[\\/]AI-Workspace[\\/]/i];
const failures=[];
function inspect(label,buffer){
  const text=buffer.toString('utf8');
  if(buffer.includes(0)||/\.(pdf|png|jpg|jpeg|docx|xlsx)$/i.test(label))failures.push(`${label}: unexpected binary/source document`);
  if(patterns.some(p=>p.test(text))||privateMarkers.some(token=>text.includes(token)))failures.push(`${label}: sensitive marker detected`);
  if(/RESTRICTED.*\.json$/i.test(label))failures.push(`${label}: restricted filename`);
}
for(const file of files)inspect(path.relative(root,file),fs.readFileSync(file));
if(fs.existsSync(path.join(root,'.git'))){
  const history=execFileSync('git',['rev-list','--objects','--all'],{encoding:'utf8'}).trim();
  for(const line of history?history.split('\n'):[]){
    const [sha,...name]=line.split(' ');
    const type=execFileSync('git',['cat-file','-t',sha],{encoding:'utf8'}).trim();
    if(type==='blob')inspect(`history:${name.join(' ')}`,execFileSync('git',['cat-file','blob',sha]));
  }
}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
else console.log(`Public audit passed: ${files.length} working/build files; Git history checked when present; ${privatePath?'private attachment markers compared without disclosure':'no private marker input supplied'}.`);
