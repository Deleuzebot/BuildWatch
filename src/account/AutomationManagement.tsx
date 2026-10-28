import React,{useEffect,useState}from'react';
import{View,Text,Pressable,Switch,StyleSheet,TextInput}from'react-native';
import{api}from'./http';
// Client-only schedule display; authorization and activation gates are server-side.
const weekday=['','Monday','Tuesday','Wednesday','Thursday','Friday'];
function scheduled(weekdayNumber:number){
 const f=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const start=Math.floor(Date.now()/60000)*60000+60000;
 for(let t=start;t<start+8*86400000;t+=60000){const p=Object.fromEntries(f.formatToParts(t).map(v=>[v.type,v.value]));if(p.weekday===['','Mon','Tue','Wed','Thu','Fri'][weekdayNumber]&&p.hour==='05'&&p.minute==='17')return new Date(t).toLocaleString();}
 return '';
}
export default function AutomationManagement({onReview,onDuplicates,onArchives}:{onReview:()=>void;onDuplicates:()=>void;onArchives:()=>void}){
 const[registry,setRegistry]=useState<any>(null),[registryPage,setRegistryPage]=useState(0),[limits,setLimits]=useState<Record<string,any>>({});
 const[data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[showAll,setShowAll]=useState(false);
 async function load(){try{setData(await api('/api/admin/maintenance'));setError('');}catch(e:any){setError(e.message);}}
 useEffect(()=>{void load();},[]);
 async function action(path:string,body:any){setBusy(true);setError('');try{const value=await api('/api/admin/maintenance/'+path,'POST',body);setNotice(value.notice||'Settings saved.');await load();}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 const registryLoad=async(page=0)=>{try{setRegistry(await api('/api/admin/maintenance/sources?state=NC&page='+page));setRegistryPage(page);}catch(e:any){setError(e.message);}};
 const button=(label:string,fn:()=>void)=><Pressable accessibilityRole="button" disabled={busy} style={s.button} onPress={fn}><Text style={s.white}>{label}</Text></Pressable>;
 return <View style={s.wrap}><Text style={s.heading}>Automation Management</Text>{!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!notice&&<Text style={s.text}>{notice}</Text>}
 {button('Refresh execution status',()=>void load())}
 {!data&&!error&&<Text>Loading automation status…</Text>}
 {data&&<>
 <Text style={s.text}>Schedule: {data.control.schedule_enabled?'enabled':'off'} · Project writes: {data.control.writes_enabled?'enabled':'off'} · AI: off unless explicitly configured in the worker</Text>
 {button('Pause maintenance',()=>void action('pause',{}))}
 {data.control.pilot_approved&&button('Resume approved schedule gate',()=>void action('resume',{}))}
 <Text style={s.text}>Missed state cycles: {data.health?.missedStates?.join(', ')||'none detected while scheduling is off'} · Stale worker leases: {data.health?.staleRuns||0}</Text>
 <Text style={s.text}>Runs at 5:17 AM America/New_York on the assigned weekday after activation. A scan covers registered sources; it does not establish complete statewide verification.</Text>
 <Text style={s.text}>Database: {(data.databaseBytes/1048576).toFixed(1)} MiB · Monthly reserved runtime: {Math.round((data.monthly?.seconds_reserved||0)/60)} / {Math.round(data.control.monthly_seconds/60)} min · Reserved source requests: {data.monthly?.requests_reserved||0} / {data.control.monthly_requests}</Text>
 {button(showAll?'Show active states':'Show all 50 states',()=>setShowAll(!showAll))}
 {data.states.filter((v:any)=>showAll||v.active).map((v:any)=><View key={v.state} style={s.card}>
 <View style={s.row}><Text style={s.subheading}>{v.state} · {weekday[v.weekday]}</Text><Switch accessibilityLabel={'Activate '+v.state} value={v.active} disabled={busy||(!data.control.pilot_approved&&v.state!=='NC')} onValueChange={active=>void action('state',{state:v.state,active})}/></View>
 <Text style={s.text}>Last successful live scan: {v.last_success?new Date(v.last_success).toLocaleString():'Not yet run'}</Text>
 <Text style={s.text}>Next planned slot: {scheduled(v.weekday)}{!data.control.schedule_enabled?' (schedule off)':''}</Text>
 <Text style={s.text}>Budget: {v.max_seconds}s · {v.max_requests} requests · {v.max_records} records per attempt</Text>
 {v.active&&<><Text style={s.text}>Processing limits</Text>{(['maxSeconds','maxRequests','maxRecords'] as const).map((key,i)=><View key={key}><Text style={s.text}>{['Seconds','Requests','Records'][i]}</Text><TextInput accessibilityLabel={v.state+' '+key} keyboardType="number-pad" value={String(limits[v.state]?.[key]??[v.max_seconds,v.max_requests,v.max_records][i])} onChangeText={text=>setLimits(all=>({...all,[v.state]:{...all[v.state],[key]:text}}))} style={s.card}/></View>)}{button('Save limits — '+v.state,()=>{const values=Object.fromEntries(Object.entries(limits[v.state]||{}).map(([key,value])=>[key,Number(value)]));void action('state',{state:v.state,...values});})}{button('Queue weekly dry-run — '+v.state,()=>void action('queue',{state:v.state,mode:'weekly',dryRun:true}))}{button('Queue initial discovery dry-run — '+v.state,()=>void action('queue',{state:v.state,mode:'initial',dryRun:true}))}</>}
 </View>)}
 <Text style={s.text}>Queued requests wait for a configured GitHub runner. To run now, use GitHub Actions → BuildWatch state research and maintenance → Run workflow → queued_requests. Live scheduling and publication require separate approval after the pilot.</Text>
 <Text style={s.subheading}>Source coverage</Text>
 {data.sources.map((v:any)=><Text key={v.state} style={s.text}>{v.state}: {v.checked}/{v.total} sources checked · {v.failing} source failures · {v.publish_enabled} sources approved for automatic publication</Text>)}
 {button('Inspect North Carolina source registry',()=>void registryLoad())}
 {registry&&<View style={s.card}><Text style={s.subheading}>Registered sources · {registry.total}</Text>{registry.items.map((v:any)=><View key={v.id}><Text selectable style={s.text}>{v.jurisdiction} · {v.adapter} · {v.autopublish?'automatic publication approved':'review only'}{v.last_error?' · '+v.last_error:''}</Text><Text selectable style={s.text}>{v.url}</Text><Text style={s.text}>Last successful retrieval: {v.last_success||'not checked'} · successful checks {v.successes} · failures {v.failures}</Text></View>)}{registryPage>0&&button('Previous sources',()=>void registryLoad(registryPage-1))}{(registryPage+1)*25<registry.total&&button('Next sources',()=>void registryLoad(registryPage+1))}</View>}
 <Text style={s.subheading}>Execution history</Text>
 {data.runs.length===0&&<Text style={s.text}>No execution history yet.</Text>}
 {data.runs.map((v:any)=><View key={v.id} style={s.card}><Text style={s.subheading}>{v.state} · {v.mode} · {v.status.replaceAll('_',' ')}{v.dry_run?' · dry-run':''}</Text><Text style={s.text}>{new Date(v.created).toLocaleString()} · attempts {v.attempts}</Text><Text style={s.text}>Projects matched: {v.stats.projectsChecked||0} · source records: {v.stats.sourceRecords||0} · new published: {v.stats.newFindings||0} · status changes: {v.stats.statusChanges||0} · milestones: {v.stats.milestones||0} · archived: {v.stats.archived||0} · would archive: {v.stats.wouldArchive||0}</Text><Text style={s.text}>Potential duplicates: {v.stats.duplicateCandidates||0} · review: {v.stats.unverified||0} · source failures: {v.stats.sourceFailures||0} · archived excluded: {v.stats.archivedExcluded||0}</Text>{v.stats.mappingQuality&&<Text style={s.text}>Field mapping: {v.stats.mappingQuality.named}/{v.stats.sourceRecords} names · {v.stats.mappingQuality.statusDecoded} reported statuses mapped · {v.stats.mappingQuality.statusRequiresReview??v.stats.mappingQuality.unknownStatus??0} statuses unresolved · {v.stats.mappingQuality.polygonFootprints} polygon footprints · {v.stats.mappingQuality.verifiedPoints} verified point locations · {v.stats.mappingQuality.planDates} plan-submission dates · {v.stats.mappingQuality.permitDates} permit dates · {v.stats.mappingQuality.conflictingNotes} conflicting notes</Text>}<Text style={s.text}>Runtime: {v.stats.seconds||0}s · requests: {v.stats.requests||0} · AI requests: {v.stats.aiRequests||0} · AI tokens: {v.stats.aiTokens||0} · downloads: {Math.round((v.stats.downloadBytes||0)/1024)} KiB</Text>{!!v.error&&<Text style={s.error}>{v.error}</Text>}{v.dry_run&&['partially_completed','failed'].includes(v.status)&&button('Queue retry from saved checkpoint',()=>void action('retry',{runId:v.id}))}{v.status==='running'&&Date.now()-Date.parse(v.heartbeat)>20*60000&&<Text style={s.error}>Heartbeat overdue. The worker will recover the checkpoint on retry.</Text>}</View>)}
 {button('Review ambiguous findings',onReview)}{button('Review potential duplicates',onDuplicates)}{button('Archived projects and recovery',onArchives)}
 <Text style={s.subheading}>Quality audit sample</Text><Text style={s.text}>Weekly runs retain provenance and a recent mutation sample for review. This is a sample, not an accuracy certification.</Text>
 {data.qualitySample.map((v:any)=><Text key={v.project_id+v.created} style={s.text}>{v.project_id} · {v.kind} · {new Date(v.created).toLocaleString()}</Text>)}
 <Text style={s.subheading}>Recent source findings</Text>{data.recentFindings.map((v:any)=><Text key={v.id} style={s.text}>{v.name} · {v.outcome.replaceAll('_',' ')}</Text>)}
 </>}
 </View>;
}
const s=StyleSheet.create({wrap:{gap:13},heading:{fontSize:23,fontWeight:'700',color:'#173d31'},subheading:{fontSize:16,fontWeight:'600',color:'#173d31'},text:{fontSize:14,lineHeight:21,color:'#4e6057'},card:{padding:14,gap:9,borderWidth:1,borderColor:'#dce3dd',borderRadius:14},row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},button:{padding:12,borderRadius:10,backgroundColor:'#214b3c'},white:{color:'#fff',fontWeight:'600'},error:{color:'#8e342a',lineHeight:20}});
