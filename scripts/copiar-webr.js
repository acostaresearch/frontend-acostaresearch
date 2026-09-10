'use strict';

/**
 * Copia los scripts de WebR a `public/`, para que se sirvan desde tu dominio.
 *
 * POR QUÉ HACE FALTA
 * ------------------
 * WebR habla con R en un hilo aparte por uno de dos canales. El rápido usa
 * `SharedArrayBuffer` y exige que la página esté aislada entre orígenes
 * (cabeceras COOP y COEP); el otro usa un Service Worker.
 *
 * Aquí no se puede usar el primero: COEP bloquearía los recursos de otros
 * dominios en toda la web —el SDK de PayPal, el botón de Google— y además, en
 * una aplicación de una sola página, el documento se carga en `/` y navegar a
 * `/analisis` no vuelve a pedirlo, así que las cabeceras no llegarían.
 *
 * Queda el Service Worker. Y un Service Worker SOLO puede registrarse desde el
 * mismo origen: no vale servirlo desde node_modules ni desde un CDN. De ahí
 * esta copia.
 *
 * POR QUÉ UN PASO DE BUILD Y NO ARCHIVOS EN EL REPOSITORIO
 * -------------------------------------------------------
 * Porque tienen que corresponderse con la versión instalada del paquete. Una
 * copia guardada a mano se queda vieja en el primer `npm update`, y el fallo
 * que produce —un canal que no responde— no se parece en nada a su causa.
 * Copiándolos en cada build, no pueden desincronizarse.
 */

const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const ORIGEN = path.join(RAIZ, 'node_modules', '@r-wasm', 'webr', 'dist');
const DESTINO = path.join(RAIZ, 'public');

/**
 * Solo estos dos, y van a la RAÍZ de `public/`.
 *
 * WebR los busca en `serviceWorkerUrl`, que por defecto es la raíz del sitio.
 * Ponerlos en una subcarpeta obligaría a configurarlo, y además acotaría el
 * alcance del Service Worker a esa subcarpeta, que no es donde vive la página.
 */
const ARCHIVOS = ['webr-serviceworker.js', 'webr-worker.js'];

if (!fs.existsSync(ORIGEN)) {
  // Sin el paquete instalado no hay nada que copiar, y eso no es un error:
  // pasa en un clon recién bajado antes del primer `npm install`.
  console.log('· webr: paquete no instalado, no se copia nada');
  process.exit(0);
}

fs.mkdirSync(DESTINO, { recursive: true });

for (const archivo of ARCHIVOS) {
  const desde = path.join(ORIGEN, archivo);

  if (!fs.existsSync(desde)) {
    // Que falte uno significa que el paquete cambió de forma. Se avisa fuerte:
    // en silencio, la página de análisis fallaría solo en producción.
    console.error(`· webr: FALTA ${archivo} en el paquete. La página de análisis no funcionará.`);
    process.exitCode = 1;
    continue;
  }

  fs.copyFileSync(desde, path.join(DESTINO, archivo));
}

/**
 * Los binarios de R se bajan del CDN por versión, y esa versión está escrita en
 * `webr.service.ts`. Si no coincide con la del paquete instalado, el hilo de
 * trabajo de una versión intenta cargar el R de otra.
 *
 * Eso falla de una forma que no se parece a su causa —un `NetworkError` al
 * importar un script— así que se comprueba aquí y se corta el build. Es el
 * único sitio donde las dos cosas se ven a la vez.
 */
const instalada = require(path.join(ORIGEN, '..', 'package.json')).version;
const servicio = path.join(RAIZ, 'src', 'app', 'core', 'r', 'webr.service.ts');

if (fs.existsSync(servicio)) {
  const escrita = /const VERSION = '([^']+)'/.exec(fs.readFileSync(servicio, 'utf8'))?.[1];

  if (escrita !== instalada) {
    console.error(
      `· webr: DESAJUSTE DE VERSIÓN. El paquete es ${instalada} y webr.service.ts dice ` +
        `${escrita}. Cambia la constante VERSION a ${instalada}.`,
    );
    process.exit(1);
  }
}

console.log(`· webr: ${ARCHIVOS.length} scripts copiados a public/ (v${instalada})`);
