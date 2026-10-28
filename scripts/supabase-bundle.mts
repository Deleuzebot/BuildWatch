import{build}from'esbuild';
await build({entryPoints:['supabase/functions/buildwatch/index.ts'],bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['jose'],outfile:'../../work/supabase-only/index.ts'});
console.log('Edge Function bundled without Node runtime dependencies.');
