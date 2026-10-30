import {cpSync,mkdirSync,writeFileSync} from 'node:fs';import {homedir} from 'node:os';import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),destination=resolve(process.env.CODEX_HOME||resolve(homedir(),'.codex'),'skills/buildwatch-research');
mkdirSync(destination,{recursive:true});cpSync(resolve(root,'skills/buildwatch-research'),destination,{recursive:true});
writeFileSync(resolve(destination,'workspace.json'),JSON.stringify({root},null,2)+'\n',{mode:0o600});console.log(JSON.stringify({installed:destination,workspace:root}));
