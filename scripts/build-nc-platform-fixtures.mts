/** Compile public government reference fixtures from already downloaded evidence only. */
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {hash,type Source} from '../server/maintenance/policy';
import {noticeLinks} from '../server/maintenance/notices';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),cache=readdirSync('../../work/nc-adapters/cache').map(f=>read('../../work/nc-adapters/cache/'+f));
const cached=(url:string)=>{const c=cache.find(c=>c.url===url);if(!c)throw Error('Missing cached evidence: '+url);return c;};
const profiles:any[]=[];
function add(name:string,type:string,url:string,metadata:any,config:any,records?:any){
 const source:Source={id:'source-'+hash(url).slice(0,28),state:'NC',jurisdiction:name,url,adapter:'arcgis',authority:'official',enabled:false,autopublish:false,config:{mappingVersion:'nc-shared-platform-v1',statusScope:'application',scopeVerified:false,pagination:'oid_keyset',...config}};
 profiles.push({jurisdiction:name,type,platform:'arcgis',source,metadata,records:records||null,validation:records?'cached_records':'cached_schema_only',productionApproved:false});
}
add('Wilson','municipality','https://services2.arcgis.com/EkGnQVqymucRyoIM/arcgis/rest/services/Development_Projects_view/FeatureServer/0',read('../../work/statewide/Wilson-meta.json'),{
 idField:'OBJECTID',fields:{name:'NAME',description:'DESCRIPTION',category:'DEV_TYPE',address:'ADDRESS'},dateFields:{},factFields:{applicationNumber:'CASE_NUM',submittedDateText:'DATE_SUBMITTED'},requiredFields:['OBJECTID','NAME','DESCRIPTION','DEV_TYPE','ADDRESS','CASE_NUM','DATE_SUBMITTED'],expectedFieldTypes:{OBJECTID:'esriFieldTypeOID',NAME:'esriFieldTypeString'},notes:['DATE_SUBMITTED is text and is not an approval or substantive movement date.','No status field is present; status and lifecycle changes must be withheld.','Original official development-activity map links this layer.']},read('../../work/statewide/Wilson-records.json'));
const lincolnURL='https://services8.arcgis.com/TaX0xkzgvxdv4n56/arcgis/rest/services/ZoningCaseLog_AllCases_Feb2018/FeatureServer/0',lincoln=JSON.parse(cached(lincolnURL+'?f=json').body);
add('Lincoln','county',lincolnURL,lincoln,{idField:'OBJECTID',originalIdentityField:'CASEID',fields:{name:'CASENAME',description:'CASEDESC',status:'CASESTATUS',developer:'APPLICANT'},dateFields:{submittedAt:'SUBMITDT',applicationApprovalAt:'APPROVEDT',hearingAt:'HEARINGDT'},factFields:{caseType:'CASETYPE',parcelIds:'LOCDESC'},requiredFields:['OBJECTID','CASEID','CASENAME','CASEDESC','CASESTATUS','APPLICANT','CASETYPE','LOCDESC','SUBMITDT','APPROVEDT','HEARINGDT'],expectedFieldTypes:{OBJECTID:'esriFieldTypeOID',APPROVEDT:'esriFieldTypeDate'},expectedDomains:{CASESTATUS:Object.fromEntries(lincoln.fields.find((f:any)=>f.name==='CASESTATUS').domain.codedValues.map((v:any)=>[v.code,v.name]))},notes:['LOCDESC is parcel identifiers, not a street address.','Approval/withdrawal describe an application, not the whole development.','No live feature sample has been validated.']});
const forsythURL='https://maps.co.forsyth.nc.us/arcgis/rest/services/Planning_Inspection/Development_And_Permits/FeatureServer/1';
add('Forsyth','county',forsythURL,JSON.parse(cached(forsythURL+'?f=json').body),{idField:'OBJECTID',originalIdentityField:'DOCKET',fields:{name:'DOCKET',status:'APPR_DENI',category:'RES_TYPE'},factFields:{units:'LOTS_UNITS',caseType:'CASE_TYPE',actionType:'ACTION_TYP',parcelId:'PIN',yearText:'YEAR'},requiredFields:['OBJECTID','DOCKET','APPR_DENI','RES_TYPE','LOTS_UNITS','CASE_TYPE','ACTION_TYP','PIN','YEAR'],expectedFieldTypes:{OBJECTID:'esriFieldTypeOID',LOTS_UNITS:'esriFieldTypeInteger'},notes:['DOCKET is a case identifier, not a verified project title.','YEAR is not an exact decision date. No status mapping without sample verification.','County service does not establish complete Winston-Salem or incorporated-town coverage.']});
const indexes:any[]=[];
const entries=read('config/maintenance/nc-adapter-builds.json').entries.filter((e:any)=>e.adapter);
const kannapolis=read('config/maintenance/nc-five-jurisdiction-plan.json').find((p:any)=>p.name==='Kannapolis');
const kd=read('../../work/four-followups/8c1eabeb036a4393e890729df7c6307bea0df8d8f273dd863f77c0edf2c86336.json');cache.push(kd);
entries.push({name:'Kannapolis',type:'city',adapter:{...kannapolis.source,config:{...kannapolis.source.config,decisionProfile:'kannapolis-resolution-v1',noticePathPattern:'^/Portals/0/Kannapolis/Departments/Planning/Documents/.*(?:Agenda|agenda|PZ|Minutes).*\\.pdf'}}});
for(const entry of entries){
 const c=cached(entry.adapter.url),source={...entry.adapter,enabled:false,autopublish:false,config:{...entry.adapter.config,documentResearch:true,agendaPDFReview:true,agendaPDFLimit:1,includeDecisionMinutes:true,mappingVersion:'nc-document-research-v2'}};
 // Retain actual anchor markup, not fabricated links or records. Raw full page stays private.
 const anchors=[...c.body.matchAll(/<a\b[\s\S]*?<\/a>/gi)].map(m=>m[0]).filter(s=>/\.pdf|AgendaCenter|DocumentCenter|Archive\.aspx|showpublisheddocument|download\?attachment/i.test(s)).slice(0,100).join('\n');
 const pointers=noticeLinks(source,anchors);if(!pointers.length)continue;
 indexes.push({jurisdiction:entry.name,type:entry.type,source,html:anchors,fullPageHash:c.hash,fixtureHash:hash(anchors),cachedAt:c.checkedAt,validation:'cached_index_fragment_only',documentPointers:pointers.length,documentExtractionValidated:false});
}
writeFileSync('tests/fixtures/nc-platforms.json',JSON.stringify({mode:'cached_only',researchRequests:0,profiles,indexes},null,2)+'\n');
writeFileSync('config/maintenance/nc-platform-plan.json',JSON.stringify({version:1,mode:'dry_run_only',enabled:false,publication:false,archival:false,scheduling:false,liveRequestsAuthorizedByPlan:0,profiles:profiles.map(({metadata,records,...p})=>p),indexes:indexes.map(({html,...p})=>p)},null,2)+'\n');
console.log(JSON.stringify({recordProfiles:profiles.filter(p=>p.records).length,schemaOnlyProfiles:profiles.filter(p=>!p.records).length,indexes:indexes.length,researchRequests:0}));
