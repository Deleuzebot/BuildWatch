/** Compile bounded queries from fetched official schemas; no network or database operations. */
import {readFileSync,writeFileSync} from 'node:fs';import {shadowSources} from '../server/maintenance/shadow';import {validateSourceSchema} from '../server/maintenance/adapters';
const dir=process.argv[2];if(!dir)throw Error('Use the authorized run directory');const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const five=read('config/maintenance/nc-five-jurisdiction-plan.json'),profiles=read('config/maintenance/nc-platform-plan.json').profiles;
const specs=[
 {key:'apex',source:five.find((p:any)=>p.name==='Apex').source,size:20,order:'Action_Date DESC,FID DESC'},
 {key:'cary',source:five.find((p:any)=>p.name==='Cary').source,size:20,order:'last_edited_date DESC,OBJECTID DESC'},
 {key:'chapel',source:shadowSources[1],size:20,order:'last_edited_date DESC,OBJECTID DESC'},
 {key:'wilson',source:profiles.find((p:any)=>p.jurisdiction==='Wilson').source,size:40,order:'OBJECTID ASC'},
 {key:'lincoln',source:profiles.find((p:any)=>p.jurisdiction==='Lincoln').source,size:10,order:'EditDate DESC,OBJECTID DESC'},
 {key:'forsyth',source:profiles.find((p:any)=>p.jurisdiction==='Forsyth').source,size:15,order:'YEAR DESC,OBJECTID DESC'},
 {key:'raleigh',source:shadowSources[2],size:10,order:'issueddate DESC,OBJECTID DESC',where:"permittypemapped='Building' AND issueddate>=TIMESTAMP '2026-10-01 00:00:00' AND (UPPER(proposedworkdescription) LIKE '%MULTIFAMILY%' OR UPPER(proposedworkdescription) LIKE '%APARTMENT%' OR UPPER(proposedworkdescription) LIKE '%WAREHOUSE%' OR UPPER(proposedworkdescription) LIKE '%HOSPITAL%' OR UPPER(proposedworkdescription) LIKE '%NEW BUILDING%')"},
];
const plan=specs.map(s=>{const m=JSON.parse(read(dir+'/'+s.key+'-metadata.json').body);validateSourceSchema(s.source,m);const fieldNames=new Set(m.fields.map((f:any)=>f.name));for(const term of s.order.split(','))if(!fieldNames.has(term.trim().split(' ')[0]))throw Error('Unknown verified ordering field');const u=new URL(s.source.url+'/query');u.search=new URLSearchParams({f:'json',where:s.where||'1=1',outFields:[...new Set([s.source.config.idField,s.source.config.originalIdentityField,...(s.source.config.requiredFields||[]),...Object.values(s.source.config.fields||{}),...Object.values(s.source.config.dateFields||{}),...Object.values(s.source.config.factFields||{}),...s.order.split(',').map(t=>t.trim().split(' ')[0])].filter(Boolean))].join(','),outSR:'4326',returnGeometry:'true',resultRecordCount:String(s.size),orderByFields:s.order}).toString();return{key:s.key+'-records',url:u.href};});
writeFileSync(dir+'/records-plan.json',JSON.stringify(plan,null,2));writeFileSync(dir+'/sources.json',JSON.stringify(specs,null,2));console.log(JSON.stringify({queries:plan.length,maximumRecords:specs.reduce((n,s)=>n+s.size,0)}));
