'use strict';

/**
 * Publica la web en el servidor propio.
 *
 *   npm run deploy
 *
 * Compila aquí y sube el resultado. No en el servidor, y es una decisión:
 * compilar allí obligaría a tener el repositorio clonado, las credenciales de
 * GitHub y una copia del .env con los identificadores de Google y PayPal. Todo
 * eso son cosas que se desincronizan. Aquí ya está lo que hace falta.
 *
 * POR QUÉ NO NETLIFY
 * ------------------
 * Netlify pausa los despliegues de producción cuando se agotan los créditos del
 * plan, y entonces no hay forma de publicar por urgente que sea el cambio. El
 * servidor es tuyo y no tiene esa puerta.
 *
 * QUÉ HACE
 * --------
 * 1. Compila con la configuración de producción.
 * 2. Sube la carpeta comprimida por SSH, en una sola conexión.
 * 3. La deja en `/var/www/acostaresearch`, que es lo que sirve Caddy.
 * 4. Comprueba desde fuera que la web responde.
 *
 * La subida va a una carpeta nueva y se cambia por la anterior al final, así
 * que nadie llega a ver el sitio a medio copiar: entre una versión y la
 * siguiente no hay un instante con archivos de las dos.
 */

const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

/** Alias del ~/.ssh/config. Mismo que usa el backend. */
const SERVIDOR = process.env.DEPLOY_HOST || 'acosta';
/** Lo que sirve Caddy. */
const DESTINO = '/var/www/acostaresearch';
/** Para la comprobación final. */
const URL = process.env.DEPLOY_URL || 'https://acostaresearch.com';

const RAIZ = path.resolve(__dirname, '..');
const COMPILADO = path.join(RAIZ, 'dist', 'acostaresearch-frontend', 'browser');

function paso(texto) {
  console.log(`\n── ${texto} ──`);
}

function correr(comando, opciones = {}) {
  execSync(comando, { stdio: 'inherit', cwd: RAIZ, ...opciones });
}

/**
 * Pide la web ya publicada y aborta si no responde.
 *
 * Se comprueba la portada y también el PDF de la guía: ese archivo se enlaza
 * desde el correo de compra, y si un día desapareciera del build, la web
 * respondería su index.html y al comprador se le descargaría la portada con
 * extensión .pdf. Ha pasado; por eso está aquí.
 */
async function comprobar() {
  const revisiones = [
    { que: 'la portada', url: `${URL}/`, tipo: 'text/html' },
    { que: 'la guía PDF', url: `${URL}/guias/guia-instalacion.pdf`, tipo: 'application/pdf' },
  ];

  for (const { que, url, tipo } of revisiones) {
    const respuesta = await fetch(url, { redirect: 'follow' });
    const recibido = respuesta.headers.get('content-type') ?? '';
    console.log(`   ${que.padEnd(14)} ${respuesta.status} · ${recibido.split(';')[0]}`);

    if (!respuesta.ok) throw new Error(`${que} responde ${respuesta.status}`);
    if (!recibido.startsWith(tipo)) throw new Error(`${que} devuelve ${recibido}, se esperaba ${tipo}`);
  }
}

async function desplegar() {
  paso('Compilando');
  correr('npm run build');

  if (!fs.existsSync(path.join(COMPILADO, 'index.html'))) {
    throw new Error(`La compilación no dejó un index.html en ${COMPILADO}`);
  }

  paso('Subiendo');
  // Todo en una sola conexión: se comprime aquí, se descomprime allí. Subir
  // cuarenta archivos sueltos por scp abre cuarenta sesiones y tarda diez veces
  // más.
  const remoto = [
    `rm -rf ${DESTINO}.nuevo`,
    `install -d -o acosta -g caddy -m 755 ${DESTINO}.nuevo`,
    `tar xzf - -C ${DESTINO}.nuevo`,
    `chown -R acosta:caddy ${DESTINO}.nuevo`,
    `chmod -R a+rX ${DESTINO}.nuevo`,
    // El cambio, que es lo único que ve el visitante.
    `rm -rf ${DESTINO}.viejo`,
    `mv ${DESTINO} ${DESTINO}.viejo`,
    `mv ${DESTINO}.nuevo ${DESTINO}`,
    `rm -rf ${DESTINO}.viejo`,
    `du -sh ${DESTINO}`,
  ].join(' && ');

  correr(`tar czf - -C "${COMPILADO}" . | ssh ${SERVIDOR} "${remoto}"`, { shell: true });

  paso('Comprobando desde fuera');
  // Con `fetch` y no con curl: este script se ejecuta en Windows, donde el
  // comando pasa por cmd.exe y a curl le llegan las comillas destrozadas. Node
  // trae fetch desde la 18 y aquí no hay intermediarios.
  await comprobar();

  console.log('\nPublicado.\n');
}

desplegar().catch((error) => {
  console.error(`\nFALLÓ: ${error.message}\n`);
  console.error(`Si la web no responde: ssh ${SERVIDOR} journalctl -u caddy -n 30\n`);
  process.exit(1);
});
