/** Offline schedule/readiness preparation. Does not contact government, GitHub or Supabase. */
import {mkdirSync,writeFileSync} from 'node:fs';import {shadowPlan,requireShadowProfile} from '../server/maintenance/shadow-plan';
const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
if(args['check-profile']){requireShadowProfile(args['check-profile']);console.log('Structured-feed-only coverage explicitly selected; full evidence research is not enabled.');}
else{const plan=shadowPlan(Number(args['remaining-requests']),args.at?new Date(args.at):new Date());mkdirSync('reports/maintenance',{recursive:true});writeFileSync('reports/maintenance/NC-SHADOW-SCHEDULE-PROPOSAL.json',JSON.stringify(plan,null,2));console.log(JSON.stringify(plan,null,2));}
