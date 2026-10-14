import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const PORT = Number(process.env.PORT || 3030);
const ORIGIN = `http://localhost:${PORT}`;
const BUCKET = process.env.S3_BUCKET || 'lab-09-bellido-20261014-4826';
const s3 = new S3Client({region: process.env.AWS_REGION || 'us-east-1', maxAttempts: 2, requestChecksumCalculation: 'WHEN_REQUIRED'});
const MAX = 5 * 1024 * 1024;
const TYPES = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'};
const pending = new Map();
const requests = new Map();
const fail = (message, status=400) => Object.assign(new Error(message), {status});
const validKey = key => typeof key === 'string' && key.startsWith('originales/') && !key.includes('..') && !/[\x00-\x1f]/.test(key);
async function jsonBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 8192) throw fail('Solicitud demasiado grande', 413);
  }
  try { return JSON.parse(body); } catch { throw fail('JSON invalido'); }
}
function detect(bytes) {
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg';
  if (bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP') return 'image/webp';
  return null;
}
function send(res, status, data) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
const server = http.createServer(async (req,res) => {
  try {
    const path = new URL(req.url, ORIGIN).pathname;
    res.setHeader('X-Content-Type-Options','nosniff');
    if (!['localhost', '127.0.0.1'].includes((req.headers.host || '').split(':')[0])) throw fail('Host no permitido',403);
    if (path.startsWith('/api/') && req.headers.origin && req.headers.origin !== ORIGIN) throw fail('Origen no permitido',403);
    if (req.method==='GET' && path==='/') {
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
      return res.end(await readFile(new URL('./public/index.html', import.meta.url)));
    }
    if (req.method==='GET' && path==='/api/health') return send(res,200,{bucket:BUCKET,region:'us-east-1'});
    if (req.method==='POST' && path==='/api/upload-url') {
      const {filename,contentType,sizeBytes} = await jsonBody(req);
      if (typeof filename!=='string' || !filename.trim() || filename.length>255) throw fail('Nombre de archivo invalido');
      if (!Object.hasOwn(TYPES,contentType)) throw fail('Solo se permiten JPG, PNG y WEBP');
      if (!Number.isInteger(sizeBytes) || sizeBytes<=0 || sizeBytes>=MAX) throw fail('El archivo debe ser menor a 5 MB');
      const now=Date.now(), ip=req.socket.remoteAddress;
      let rate=requests.get(ip);
      if (!rate || now-rate.start>60000) rate={start:now,count:0};
      rate.count++; requests.set(ip,rate);
      if (rate.count>20) throw fail('Demasiadas solicitudes; espera un minuto',429);
      for (const [key,value] of pending) if (now-value.created>900000) pending.delete(key);
      const base=filename.split(/[\\/]/).pop().replace(/\.[^.]*$/,'');
      const safe=base.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100) || 'imagen';
      const key=`originales/${randomUUID()}-${safe}${TYPES[contentType]}`;
      const command=new PutObjectCommand({Bucket:BUCKET,Key:key,ContentType:contentType,ContentLength:sizeBytes,ServerSideEncryption:'AES256'});
      const uploadUrl=await getSignedUrl(s3,command,{expiresIn:300});
      pending.set(key,{sizeBytes,contentType,created:now});
      return send(res,200,{uploadUrl,key,expiresIn:300});
    }
    if (req.method==='POST' && path==='/api/complete-upload') {
      const {key}=await jsonBody(req), expected=pending.get(key);
      if (!validKey(key) || !expected) throw fail('Carga no reconocida');
      const head=await s3.send(new HeadObjectCommand({Bucket:BUCKET,Key:key}));
      const object=await s3.send(new GetObjectCommand({Bucket:BUCKET,Key:key,Range:'bytes=0-15'}));
      const bytes=Buffer.from(await object.Body.transformToByteArray());
      const valid=head.ContentLength===expected.sizeBytes && head.ContentLength<MAX && head.ContentType===expected.contentType && detect(bytes)===expected.contentType;
      pending.delete(key);
      if (!valid) {
        await s3.send(new DeleteObjectCommand({Bucket:BUCKET,Key:key}));
        throw fail('Imagen rechazada: contenido, tipo o tamano no coincide');
      }
      return send(res,200,{verified:true,key});
    }
    if (req.method==='GET' && path==='/api/images') {
      const items=[]; let token;
      do {
        const page=await s3.send(new ListObjectsV2Command({Bucket:BUCKET,Prefix:'originales/',ContinuationToken:token}));
        for (const obj of page.Contents || []) {
          if (!/\.(png|jpe?g|webp)$/i.test(obj.Key) || !obj.Size) continue;
          const url=await getSignedUrl(s3,new GetObjectCommand({Bucket:BUCKET,Key:obj.Key}),{expiresIn:900});
          const downloadUrl=await getSignedUrl(s3,new GetObjectCommand({Bucket:BUCKET,Key:obj.Key,ResponseContentDisposition:'attachment'}),{expiresIn:900});
          items.push({key:obj.Key,size:obj.Size,lastModified:obj.LastModified,url,downloadUrl});
        }
        token=page.NextContinuationToken;
      } while(token);
      items.sort((a,b)=>new Date(b.lastModified)-new Date(a.lastModified));
      return send(res,200,items);
    }
    if (req.method==='DELETE' && path.startsWith('/api/images/')) {
      const key=decodeURIComponent(path.slice('/api/images/'.length));
      if (!validKey(key)) throw fail('Clave de imagen invalida');
      await s3.send(new DeleteObjectCommand({Bucket:BUCKET,Key:key}));
      return send(res,200,{deleted:true});
    }
    send(res,404,{error:'Ruta no encontrada'});
  } catch(err) {
    const status=err.status || (err.name==='AccessDenied'?403:500);
    const message=err.status?err.message:err.name==='CredentialsProviderError'?'Faltan credenciales. Inicia con INICIAR.cmd y selecciona el CSV de IAM.':err.name==='AccessDenied'?'AWS denego el acceso. Revisa los permisos IAM del usuario.':`Error de AWS: ${err.name || 'desconocido'}`;
    send(res,status,{error:message});
  }
});
server.listen(PORT,'127.0.0.1',()=>console.log(`Galeria lista en ${ORIGIN}\nBucket: ${BUCKET}\nMantén esta ventana abierta.`));
