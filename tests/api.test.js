import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const port=3042, base=`http://127.0.0.1:${port}`;
let child;
before(async()=>{
  child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),AWS_ACCESS_KEY_ID:'test-access-key',AWS_SECRET_ACCESS_KEY:'test-secret-not-a-real-credential',AWS_EC2_METADATA_DISABLED:'true'},stdio:'ignore'});
  for(let i=0;i<80;i++){
    try{const r=await fetch(base+'/api/health');if(r.ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('El servidor de pruebas no inicio');
});
after(()=>child?.kill());
const post=(data,origin)=>fetch(base+'/api/upload-url',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(data)});
test('La pagina y el estado local se sirven sin credenciales AWS',async()=>{
  assert.equal((await fetch(base)).status,200);
  assert.equal((await (await fetch(base+'/api/health')).json()).bucket,'lab-09-bellido-20261014-4826');
});
test('El backend rechaza archivos de 10 MB, tipos invalidos y tamanos fuera del limite antes de acceder a S3',async()=>{
  const valid={filename:'imagen.jpg',contentType:'image/jpeg',sizeBytes:1024};
  for(const invalid of [{...valid,sizeBytes:10485760},{...valid,sizeBytes:5242880},{...valid,sizeBytes:-1},{...valid,sizeBytes:0},{...valid,sizeBytes:'1024'},{...valid,contentType:'application/pdf'},{...valid,filename:''}]){
    const r=await post(invalid);assert.equal(r.status,400);assert.ok((await r.json()).error);
  }
});
test('Una carga valida recibe una URL de cinco minutos con clave unica, cifrado y tamano firmados',async()=>{
  const r=await post({filename:'../foto rara.jpg',contentType:'image/jpeg',sizeBytes:1024});assert.equal(r.status,200);
  const result=await r.json(),url=new URL(result.uploadUrl);
  assert.equal(url.protocol,'https:');assert.equal(url.searchParams.get('X-Amz-Expires'),'300');
  assert.match(url.searchParams.get('X-Amz-SignedHeaders'),/content-length/);
  assert.match(url.searchParams.get('X-Amz-SignedHeaders'),/x-amz-server-side-encryption/);
  assert.ok(result.key.startsWith('originales/'));assert.equal(result.key.includes('..'),false);
});
test('Rechaza otro origen y eliminaciones fuera del prefijo autorizado',async()=>{
  assert.equal((await post({},'https://sitio-ajeno.example')).status,403);
  assert.equal((await fetch(base+'/api/images/'+encodeURIComponent('ajeno/imagen.jpg'),{method:'DELETE'})).status,400);
  assert.equal((await fetch(base+'/api/images/'+encodeURIComponent('originales/../imagen.jpg'),{method:'DELETE'})).status,400);
});
