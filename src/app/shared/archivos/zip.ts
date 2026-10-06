/**
 * Un .zip sin comprimir hecho en el navegador.
 *
 * La subida de datos manda UN cuerpo de bytes. Para subir una carpeta de
 * informes en PDF —80 archivos, uno por caso—, el navegador los mete aquí en un
 * solo .zip y el servidor lo abre (ver `r.documentos` en el backend).
 *
 * Sin comprimir porque los PDF ya vienen comprimidos: comprimirlos otra vez
 * apenas ahorra y tarda. Y sin librería: el formato «stored» son tres
 * cabeceras y un CRC.
 */

export interface ArchivoParaZip {
  /** La ruta dentro del .zip, con «/»: «data/CAB01.pdf». La carpeta cuenta para juntar casos. */
  ruta: string;
  archivo: Blob;
}

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** La fecha y la hora en el formato de MS-DOS que pide el .zip. */
function fechaDos(fecha: Date): { hora: number; dia: number } {
  return {
    hora: (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | Math.floor(fecha.getSeconds() / 2),
    dia: ((Math.max(fecha.getFullYear(), 1980) - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate(),
  };
}

export async function armarZip(archivos: ArchivoParaZip[]): Promise<Blob> {
  const partes: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  const codificador = new TextEncoder();
  const { hora, dia } = fechaDos(new Date());
  let desplazamiento = 0;

  for (const { ruta, archivo } of archivos) {
    const nombre = codificador.encode(ruta);
    const datos = new Uint8Array(await archivo.arrayBuffer());
    const crc = crc32(datos);

    const cabecera = new Uint8Array(30);
    const local = new DataView(cabecera.buffer);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // el nombre va en UTF-8: «Cuestionario Peña.pdf»
    local.setUint16(8, 0, true); // sin comprimir
    local.setUint16(10, hora, true);
    local.setUint16(12, dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, datos.length, true);
    local.setUint16(26, nombre.length, true);
    local.setUint16(28, 0, true);
    partes.push(cabecera, nombre, datos);

    const entrada = new DataView(new ArrayBuffer(46));
    entrada.setUint32(0, 0x02014b50, true);
    entrada.setUint16(4, 20, true);
    entrada.setUint16(6, 20, true);
    entrada.setUint16(8, 0x0800, true);
    entrada.setUint16(10, 0, true);
    entrada.setUint16(12, hora, true);
    entrada.setUint16(14, dia, true);
    entrada.setUint32(16, crc, true);
    entrada.setUint32(20, datos.length, true);
    entrada.setUint32(24, datos.length, true);
    entrada.setUint16(28, nombre.length, true);
    entrada.setUint32(42, desplazamiento, true);
    const fila = new Uint8Array(46 + nombre.length);
    fila.set(new Uint8Array(entrada.buffer), 0);
    fila.set(nombre, 46);
    central.push(fila);

    desplazamiento += 30 + nombre.length + datos.length;
  }

  const tamCentral = central.reduce((suma, f) => suma + f.length, 0);
  const cierre = new Uint8Array(22);
  const fin = new DataView(cierre.buffer);
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, desplazamiento, true);

  return new Blob([...partes, ...central, cierre], { type: 'application/zip' });
}
