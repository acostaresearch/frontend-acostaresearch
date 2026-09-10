'use strict';

/**
 * Comprueba que la versión de WebR escrita en el código sea la instalada.
 *
 * ESTE ARCHIVO YA NO COPIA NADA, y el nombre se queda por no romper los
 * scripts de `package.json` sin motivo.
 *
 * Copiaba los scripts del canal por Service Worker, que era el de reserva para
 * páginas no aisladas entre orígenes. Ese canal se abandonó: fallaba tarde y de
 * forma difícil de relacionar con su causa —lecturas fuera de rango en mitad de
 * un análisis—. Ahora la página de análisis se sirve con las cabeceras COOP y
 * COEP puestas por el Worker de Cloudflare, así que R usa memoria compartida de
 * verdad y no hace falta ningún Service Worker.
 *
 * Lo que sí sigue haciendo falta es esta comprobación de versión, y por eso el
 * paso no desaparece del build.
 */

const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const ORIGEN = path.join(RAIZ, 'node_modules', '@r-wasm', 'webr', 'dist');
const DESTINO = path.join(RAIZ, 'public');

if (!fs.existsSync(ORIGEN)) {
  // Sin el paquete instalado no hay nada que comprobar, y eso no es un error:
  // pasa en un clon recién bajado antes del primer `npm install`.
  console.log('· webr: paquete no instalado, no se comprueba nada');
  process.exit(0);
}

/**
 * Restos del canal antiguo.
 *
 * Se borran si están: quedaron de cuando se usaba el Service Worker, y un
 * script suelto en `public/` que ya nadie registra solo sirve para confundir a
 * quien lo encuentre dentro de seis meses.
 */
for (const viejo of ['webr-serviceworker.js', 'webr-worker.js']) {
  const ruta = path.join(DESTINO, viejo);
  if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
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

console.log(`· webr: versión comprobada (v${instalada})`);
