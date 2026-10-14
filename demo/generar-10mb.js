import { readFileSync, writeFileSync } from 'node:fs';
const source=readFileSync(new URL('./demo_s3_bellido.jpg',import.meta.url));
const large=Buffer.alloc(10*1024*1024);source.copy(large);
writeFileSync(new URL('./imagen_10mb.jpg',import.meta.url),large);
console.log('Creado demo/imagen_10mb.jpg para probar el rechazo por tamano.');
