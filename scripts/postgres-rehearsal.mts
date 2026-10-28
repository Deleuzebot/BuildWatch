import {PGlite}from'@electric-sql/pglite';
import{DatabaseSync}from'node:sqlite';
import{migrateSnapshot}from'../server/postgres/migrate';
import{writeFileSync}from'node:fs';
const pg=new PGlite(),source=new DatabaseSync('../../work/supabase-migration/before-supabase.sqlite',{readOnly:true});
const session={async query(sql:string,args:any[]=[]):Promise<any>{if(args.length)return pg.query(sql,args);const results=await pg.exec(sql);return results.at(-1)||{rows:[]};}};
try{
 await pg.exec('BEGIN');const result=await migrateSnapshot(session,source,false);await pg.exec('COMMIT');
 await pg.exec('BEGIN');const repeat=await migrateSnapshot(session,source,false);await pg.exec('COMMIT');
 writeFileSync('../../work/supabase-migration/rehearsal-report.json',JSON.stringify({result,repeat},null,2));
 console.log(JSON.stringify({projects:result.verification.actual.projects.count,history:result.verification.actual.history.count,public:result.verification.publicProjects,differences:result.verification.differences,repeatedWithoutDuplicates:repeat.alreadyImported}));
}catch(e:any){console.error(e.message);process.exitCode=1;}finally{source.close();await pg.close();}
