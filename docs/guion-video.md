# Guion de demostración del laboratorio S3

Duración objetivo: 3 a 4 minutos. Abrir http://localhost:3030 antes de grabar. Mostrar el navegador y el repositorio; mantener fuera de pantalla el CSV de IAM y las claves.

| Tiempo | Qué mostrar | Explicación sugerida |
|---|---|---|
| 0:00–0:20 | Galería con las imágenes del bucket | Soy Rony Bellido. Esta aplicación permite gestionar imágenes en un bucket privado de Amazon S3. |
| 0:20–0:55 | Seleccionar demo/demo_s3_bellido.jpg y pulsar Subir imagen | El backend valida nombre, tipo y tamaño y genera una URL de carga válida por cinco minutos. El navegador envía el archivo directamente a S3 usando HTTPS y cifrado SSE-S3. |
| 0:55–1:20 | Imagen nueva y botón Descargar | La galería usa URLs de visualización y descarga válidas durante quince minutos. El bucket mantiene bloqueado el acceso público. |
| 1:20–1:50 | Seleccionar demo/archivo_no_permitido.pdf y pulsar Subir | Un PDF es rechazado. Solo se aceptan JPG, PNG y WEBP menores a cinco megabytes. |
| 1:50–2:20 | Seleccionar demo/imagen_10mb.jpg; mostrar la prueba del backend del README | El frontend bloquea archivos grandes y el backend vuelve a validar los datos antes de emitir una URL. |
| 2:20–2:45 | Eliminar únicamente la imagen de demostración | El backend elimina el objeto seleccionado. El versionado conserva el historial. |
| 2:45–3:15 | DevTools, Network, solicitud PUT de la carga | El archivo se envía directamente a S3. El frontend no contiene claves AWS. |
| 3:15–3:40 | Repositorio GitHub y README | El repositorio incluye backend, frontend, CORS, inicio para Windows y pruebas. Las claves y node_modules están excluidos. |

Para grabar en Windows: abrir la galería en Chrome; pulsar Windows+Alt+R para iniciar y para detener. El archivo se guarda normalmente en Vídeos/Capturas. También puede usarse Recortes, modo vídeo. Subir el MP4 a la carpeta de Drive del informe y comprobar acceso de lectura.

La prueba de expiración requiere esperar al menos 16 minutos. No presentarla como realizada si no se ha comprobado.
