const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
for(const name of ['core.js','transport.js','app.js','communications.js','sw.js'])execFileSync(process.execPath,['--check',path.join(root,'dist',name)],{stdio:'inherit'});
const config=require('../dist/app-config.json');if(!config.path.endsWith('/hostBoardNextV1'))throw Error('Unexpected Firebase namespace');
for(const name of ['index.html','style.css','manifest.webmanifest','firebase-app-compat.js','firebase-database-compat.js'])if(!fs.existsSync(path.join(root,'dist',name)))throw Error('Missing '+name);
console.log('Source and isolated Firebase configuration verified');
