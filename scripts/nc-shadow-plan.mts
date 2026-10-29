/** Offline schedule/readiness preparation. Does not contact government, GitHub or Supabase. */
import {mkdirSync,writeFileSync} from 'node:fs';import {shadowPlan,requireShadowProfile} from '../server/maintenance/shadow-plan';
const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
if(args['check-profile']){requireShadowProfile(args['check-profile'],process.env.BW_SHADOW_LIVE_CHECKS==='true'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch');console.log('Selected bounded profile validated. Evidence research is manual-only; publication and scheduling remain off.');}
else{const plan=shadowPlan(Number(args['remaining-requests']),args.at?new Date(args.at):new Date());mkdirSync('reports/maintenance',{recursive:true});writeFileSync('reports/maintenance/NC-SHADOW-SCHEDULE-PROPOSAL.json',JSON.stringify(plan,null,2));console.log(JSON.stringify(plan,null,2));}
