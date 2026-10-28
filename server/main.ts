import {existsSync} from 'node:fs';
import {createStaticPreview}from'./static';
if(existsSync('.env'))process.loadEnvFile('.env');
if(existsSync('.env.server'))process.loadEnvFile('.env.server');
const host = process.env.HOST || "127.0.0.1",port=Number(process.env.PORT||8765);
async function main(){
if(process.env.EXPO_PUBLIC_BACKEND==='supabase'){
 createStaticPreview('dist-web').listen(port,host,()=>console.log(`BuildWatch preview at http://${host}:${port}; backend: Supabase (no local database or jobs).`));
}else{
const {createApp}=await import('./server');
const {deliver}=await import('./accounts/push');
const {ensureStatewideSeed}=await import('./imports/seed');
const server = createApp({
  file: process.env.DATA_FILE || "server/data/projects.json",
  webRoot: "dist-web",
  origin: process.env.WEB_ORIGIN,
});

void ensureStatewideSeed(server.store, (process.env.DATA_FILE || "server/data/projects.json") + '.sqlite').then(() => {
  server.listen(port, host, () => console.log(`BuildWatch ready at http://${host}:${port}`));
}).catch(error => { clearInterval(timer); server.store.close(); console.error(error); process.exitCode=1; });
const timer = setInterval(() => {
  try {
    server.store.reminders();
    void deliver(server.store).catch(() =>
      console.error("Push worker failed; will retry."),
    );
  } catch {
    console.error("Notification scheduling failed; will retry.");
  }
}, 60000);
server.on("close", () => clearInterval(timer));
}
}
void main().catch(()=>{console.error('BuildWatch could not start.');process.exitCode=1;});
