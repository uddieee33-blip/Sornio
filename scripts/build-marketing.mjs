import { mkdir, copyFile, rm } from 'node:fs/promises';
const root = new URL('../apps/marketing/', import.meta.url), output = new URL('dist/', root);
await rm(output, { recursive:true, force:true }); await mkdir(output, { recursive:true });
for (const file of ['index.html','style.css','app.js','release-manifest.json']) await copyFile(new URL(file,root),new URL(file,output));
console.log('Built apps/marketing/dist (static product website; no native POS runtime)');
