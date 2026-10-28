import test from'node:test';import assert from'node:assert/strict';
import{PGlite}from'@electric-sql/pglite';import{readFileSync}from'node:fs';
import{postgresWhere}from'../server/postgres/map';
test('Postgres viewport, text, category and activity predicates remain parameterized and bounded',()=>{
 const w=postgresWhere({search:"apartments' OR true --%",status:'Approved',types:['Residential','Commercial'],activity:'30d'},{west:170,east:-170,south:-20,north:20});
 assert.ok(w.sql.includes('st_makeenvelope'));assert.ok(w.sql.includes(' OR '));assert.ok(w.sql.includes('ANY('));assert.ok(!w.sql.includes("apartments'"));assert.ok(w.args.some(v=>typeof v==='string'&&v.includes('\\%')));
 assert.throws(()=>postgresWhere({types:['Fake']}),/Invalid/);assert.throws(()=>postgresWhere({},{west:-200,east:0,south:0,north:10}),/Invalid/);
 assert.ok(!postgresWhere({activity:'5y'}).sql.includes('project_activity'));
});
test('actual-schema Postgres conversion enforces constraints, rollback, private access and JSON patch parity',async()=>{
 const pg=new PGlite();try{
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  for(const file of['001-tables.sql','002-views.sql'])await pg.exec(readFileSync(new URL('../server/postgres/migrations/'+file,import.meta.url),'utf8'));
  const tables=(await pg.query<any>("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='buildwatch' AND c.relkind='r' AND c.relrowsecurity")).rows[0].n;
  assert.equal(tables,64);
  const patch=(await pg.query<any>(`SELECT buildwatch.json_merge_patch(' {"name":"A","old":1,"nested":{"a":1,"b":2}}','{"old":null,"nested":{"a":null,"c":3}}') result`)).rows[0].result;
  assert.deepEqual(patch,{name:'A',nested:{b:2,c:3}});
  await pg.exec('BEGIN');await pg.query('INSERT INTO buildwatch.projects(id,data,revision,rowid) VALUES($1,$2,1,42)',['test',JSON.stringify({name:'Project',description:'Original source'})]);
  await pg.query('INSERT INTO buildwatch.history VALUES($1,$2,$3,NULL,$4,$5)',['history','test','operator','source snapshot',Date.now()]);await pg.exec('ROLLBACK');
  assert.equal((await pg.query<any>('SELECT count(*)::int n FROM buildwatch.projects')).rows[0].n,0);
  await pg.exec('BEGIN');await pg.query('INSERT INTO buildwatch.history VALUES($1,$2,$3,NULL,$4,$5)',['orphan','missing','operator','snapshot',Date.now()]);await assert.rejects(pg.exec('SET CONSTRAINTS ALL IMMEDIATE'),/foreign key/i);await pg.exec('ROLLBACK');
  await pg.exec('SET ROLE anon');await assert.rejects(pg.query('SELECT * FROM buildwatch.projects'),/permission denied/i);await assert.rejects(pg.query('SELECT * FROM buildwatch.users'),/permission denied/i);await pg.exec('RESET ROLE');
  assert.equal((await pg.query<any>('SELECT count(*)::int n FROM buildwatch.history')).rows[0].n,0);
 }finally{await pg.close();}
});
