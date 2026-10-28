/** Correct only this research pass's non-residential records; never equate lot counts with homes. */
import {Store} from '../server/accounts/store';
const store=new Store('server/data/projects.json.sqlite');
try{
 let corrected=0;
 for(const row of store.all("SELECT p.id FROM projects p JOIN verified_import_evidence e ON e.project_id=p.id WHERE e.batch_id='nc-coverage-counties-2026-10-26' AND p.id LIKE 'nc-harnett-development-%'")){
  const p=store.project(row.id)!;if(['Housing','Mixed use'].includes(p.category)||p.homes===0)continue;
  const category=/child care/i.test(p.name)?'Education':/EMS station/i.test(p.name)?'Public facility':p.category;
  store.publish({...p,homes:0,category,verificationNote:p.verificationNote+' The source lot count does not represent homes for this non-residential development.'},'operator:nc-quantity-verification');corrected++;
 }
 console.log(JSON.stringify({corrected}));
}finally{store.close();}
