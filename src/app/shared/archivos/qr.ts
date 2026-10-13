import { encode } from 'uqr';

/**
 * Dibuja en el lienzo el QR de un texto.
 *
 * Va siempre en negro sobre blanco y con su margen, también con la web en modo
 * oscuro: es lo que leen las cámaras. Los colores no salen de las variables a
 * propósito. Devuelve `false` si el navegador no deja dibujar.
 */
export function dibujarQr(lienzo: HTMLCanvasElement, texto: string, lado: number): boolean {
  const { size, data } = encode(texto, { ecc: 'M', border: 4 });
  // Cada módulo ocupa píxeles enteros: con medios píxeles el borde sale borroso.
  const escala = Math.max(1, Math.floor(lado / size));
  lienzo.width = size * escala;
  lienzo.height = size * escala;

  const ctx = lienzo.getContext('2d');
  if (!ctx) return false;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.fillStyle = '#000000';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y][x]) ctx.fillRect(x * escala, y * escala, escala, escala);
    }
  }
  return true;
}

/** Guarda el QR de un texto como PNG, grande: sirve para una diapositiva o para imprimir. */
export async function descargarQr(texto: string, nombre: string): Promise<void> {
  const lienzo = document.createElement('canvas');
  if (!dibujarQr(lienzo, texto, 1024)) throw new Error('El navegador no deja dibujar el QR.');

  const blob = await new Promise<Blob | null>((listo) => lienzo.toBlob(listo, 'image/png'));
  if (!blob) throw new Error('El navegador no pudo crear la imagen del QR.');

  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  // Se suelta después: algunos navegadores aún no empezaron a guardar.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
