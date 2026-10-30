import {existsSync,readFileSync} from 'node:fs';import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const skill=resolve(dirname(fileURLToPath(import.meta.url)),'..'),locator=resolve(skill,'workspace.json');
const candidates=[process.cwd(),resolve(process.cwd(),'outputs/BuildWatch'),...(existsSync(locator)?[JSON.parse(readFileSync(locator,'utf8')).root]:[])];
const root=candidates.find(p=>{try{return JSON.parse(readFileSync(resolve(p,'package.json'),'utf8')).name==='buildwatch'&&existsSync(resolve(p,'scripts/buildwatch-research.mts'));}catch{return false;}});
if(!root)throw Error('Open the BuildWatch workspace or reinstall this skill from that repository.');
const result=spawnSync(process.execPath,['--import','tsx','scripts/buildwatch-research.mts',...process.argv.slice(2)],{cwd:root,stdio:'inherit',env:process.env});if(result.error)throw result.error;process.exit(result.status??1);
