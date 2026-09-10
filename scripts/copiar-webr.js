'use strict';

/**
 * Copia R —el de verdad, compilado para navegador— a `public/webr/`.
 *
 * POR QUÉ NO SE SIRVE DESDE UN CDN
 * --------------------------------
 * WebR arranca creando un Web Worker con `new Worker(baseUrl + 'webr-worker.js')`,
 * y un navegador NO deja crear un Worker desde otro dominio. WebR trae un rodeo
 * para eso —descarga el script y lo convierte en blob—, pero solo en el canal
 * `SharedArrayBuffer`, que es justo el que no podemos usar: exige las cabeceras
 * COOP/COEP y esas rompen el SDK de PayPal.
 *
 * Sirviéndolo desde el propio dominio no hay Worker cruzado, ni CORS, ni
 * cabeceras especiales, ni dependencia de que jsDelivr esté disponible desde
 * Perú. Se acaban a la vez cuatro problemas distintos.
 *
 * POR QUÉ NO ESTÁ EN GIT
 * ----------------------
 * Son 47 MB, y ya vienen versionados dentro del paquete `webr` de npm. Meterlos
 * en el repositorio sería guardar dos veces lo mismo y arrastrarlo en cada
 * clonación para siempre. Se copian al compilar, desde la versión exacta que
 * fija `package.json`.
 */

const fs = require('node:fs');
const path = require('node:path');

const origen = path.resolve(__dirname, '..', 'node_modules', 'webr', 'dist');
const destino = path.resolve(__dirname, '..', 'public', 'webr');

/**
 * Lo que no hace falta en el navegador.
 *
 * Las definiciones de TypeScript, las pruebas del propio WebR y su consola de
 * ejemplo suman megas y no los pide nadie al ejecutar R. La documentación de R
 * —`help.data.gz`, `doc.data.gz`— sí se queda: son archivos que solo se
 * descargan si alguien llama a `help()`, y quitarlos rompería esa función en
 * lugar de ahorrar nada.
 */
const SOBRA = [/\.d\.ts$/, /\.map$/, /^tests\//, /^repl\//];

function sobra(relativa) {
  const normal = relativa.split(path.sep).join('/');
  return SOBRA.some((patron) => patron.test(normal));
}

function copiar(desde, hasta, base = '') {
  fs.mkdirSync(hasta, { recursive: true });
  let archivos = 0;
  let bytes = 0;

  for (const entrada of fs.readdirSync(desde, { withFileTypes: true })) {
    const relativa = path.join(base, entrada.name);
    if (sobra(relativa)) continue;

    const origenEntrada = path.join(desde, entrada.name);
    const destinoEntrada = path.join(hasta, entrada.name);

    if (entrada.isDirectory()) {
      const dentro = copiar(origenEntrada, destinoEntrada, relativa);
      archivos += dentro.archivos;
      bytes += dentro.bytes;
    } else {
      fs.copyFileSync(origenEntrada, destinoEntrada);
      archivos += 1;
      bytes += fs.statSync(destinoEntrada).size;
    }
  }

  return { archivos, bytes };
}

if (!fs.existsSync(origen)) {
  // No se corta la compilación: la web entera no depende de esto, solo la
  // pantalla de análisis. Fallar aquí dejaría sin desplegar todo lo demás.
  console.warn('webr no está instalado; se omite la copia. Ejecuta npm install.');
  process.exit(0);
}

fs.rmSync(destino, { recursive: true, force: true });
const { archivos, bytes } = copiar(origen, destino);

const version = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'node_modules', 'webr', 'package.json'), 'utf8'),
).version;

console.log(
  `R para el navegador copiado a public/webr  ` +
    `(webr ${version} · ${archivos} archivos · ${(bytes / 1024 / 1024).toFixed(1)} MB)`,
);
