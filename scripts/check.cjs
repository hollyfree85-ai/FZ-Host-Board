const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
for(const name of ['core.js','transport.js','app.js','communications.js','voice-commands.js','table-alerts.js','app-updates.js','sw.js'])execFileSync(process.execPath,['--check',path.join(root,'dist',name)],{stdio:'inherit'});
const config=require('../dist/app-config.json');if(!config.path.endsWith('/hostBoardNextV1'))throw Error('Unexpected Firebase namespace');
for(const name of ['index.html','style.css','manifest.webmanifest','firebase-app-compat.js','firebase-database-compat.js'])if(!fs.existsSync(path.join(root,'dist',name)))throw Error('Missing '+name);
const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8'),worker=fs.readFileSync(path.join(root,'dist/sw.js'),'utf8');if(!html.includes('name="app-version" content="'+config.version+'"')||!worker.includes("VERSION='"+config.version+"'"))throw Error('Build versions must match');for(const match of html.matchAll(/(?:src|href)="(\.\/[^"]+\.(?:js|css)(?:\?[^"]*)?)"/g))if(!match[1].endsWith('?v='+config.version))throw Error('Asset missing current build version: '+match[1]);
console.log('Source and isolated Firebase configuration verified');

