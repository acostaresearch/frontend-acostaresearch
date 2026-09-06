'use strict';

/**
 * Lectura del `.env` del frontend.
 *
 * Vive aparte porque lo necesitan dos: el generador de `environments` y el
 * proxy de `ng serve`. Tener dos lectores de .env es tener dos que se
 * interpretan distinto el día que alguien entrecomilla un valor.
 *
 * NADA DE ESTO ES SECRETO. Aquí solo hay configuración por entorno —URLs e
 * identificadores públicos de cliente—; un secreto de verdad no puede vivir en
 * un frontend, y ninguno vive.
 */

const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');

/** Lector mínimo: pares CLAVE=valor, con # para comentarios. */
function leerArchivoEnv() {
  const ruta = path.join(RAIZ, '.env');
  if (!fs.existsSync(ruta)) return {};

  const valores = {};
  for (const linea of fs.readFileSync(ruta, 'utf8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;

    const corte = limpia.indexOf('=');
    if (corte < 1) continue;

    const clave = limpia.slice(0, corte).trim();
    // Se quitan las comillas si las hay: pegar un valor entrecomillado desde
    // otra consola es lo más normal del mundo.
    const valor = limpia
      .slice(corte + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');

    valores[clave] = valor;
  }
  return valores;
}

const archivo = leerArchivoEnv();

/**
 * El valor de una clave, por orden: entorno del proceso, `.env`, y lo que se
 * pase por defecto.
 *
 * Una cadena vacía significa «sin configurar», no «vacío»: así una variable
 * declarada y sin rellenar no gana sobre el valor por defecto.
 */
function v(clave, porDefecto = '') {
  const delProceso = process.env[clave];
  if (delProceso !== undefined && delProceso !== '') return delProceso;

  const delArchivo = archivo[clave];
  if (delArchivo !== undefined && delArchivo !== '') return delArchivo;

  return porDefecto;
}

/**
 * Igual que `v`, pero mirando primero una variante propia de desarrollo.
 *
 * `GOOGLE_CLIENT_ID_DEV` gana sobre `GOOGLE_CLIENT_ID`, y si no está, se usa la
 * general. Es lo que permite tener el sandbox de PayPal separado de la cuenta
 * real sin mantener dos archivos.
 */
function vDev(clave, porDefecto = '') {
  return v(clave + '_DEV', v(clave, porDefecto));
}

module.exports = { RAIZ, archivo, leerArchivoEnv, v, vDev };
