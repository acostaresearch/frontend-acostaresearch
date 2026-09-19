/**
 * Construye `public/vosviewer/vosviewer-<versión>.js`.
 *
 * El resultado SE SUBE AL REPOSITORIO, y es deliberado: así `npm run deploy`
 * no necesita instalar React ni correr esto, y el visor que se publica es
 * exactamente el que se probó. Solo hay que volver a construirlo si se cambia
 * la versión de `vosviewer-online`:
 *
 *   npm --prefix vosviewer ci
 *   npm --prefix vosviewer run construir
 *
 * y cambiar la versión también en `mi-mapa-vosviewer.ts`. La versión va en el
 * nombre del archivo para que ningún navegador se quede con el viejo en caché.
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('node_modules/vosviewer-online/package.json', 'utf8'));
const destino = '../public/vosviewer';
mkdirSync(destino, { recursive: true });

await build({
  entryPoints: ['entrada.jsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  outfile: `${destino}/vosviewer-${version}.js`,
});

// Las licencias de lo que va dentro: VOSviewer Online es MIT y pide conservar
// el aviso. Va al lado del script, en un archivo que cualquiera puede abrir.
const licencia = readFileSync('node_modules/vosviewer-online/LICENSE', 'utf8');
writeFileSync(
  `${destino}/LICENCIAS.txt`,
  [
    'Este directorio contiene VOSviewer Online (https://github.com/neesjanvaneck/VOSviewer-Online),',
    `versión ${version}, empaquetado junto con React y sus dependencias. Sus licencias:`,
    '',
    '--- VOSviewer Online ---',
    licencia,
    '--- React, react-dom, MobX, d3, lodash y demás: licencias MIT, BSD o ISC; ver cada paquete en npm. ---',
    '',
  ].join('\n'),
);

console.log(`Listo: ${destino}/vosviewer-${version}.js`);
