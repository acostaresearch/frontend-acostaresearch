/**
 * Cuántos píxeles de pantalla mide un píxel CSS de la página.
 *
 * En portátiles `styles.css` pone `zoom` en <html> para que todo salga más
 * compacto. Desde entonces `getBoundingClientRect` y `innerWidth` hablan en
 * píxeles de pantalla, pero un `left: 100px` dentro de la página se dibuja a
 * 100 × zoom. Quien mide algo para luego colocar otra cosa encima (el
 * recorrido guiado) tiene que dividir por esto o se descuadra.
 *
 * Se mide con una sonda y no leyendo `zoom` del estilo: los navegadores que
 * aún no siguen el estándar devuelven los rectángulos sin escalar, y la sonda
 * da 1 en ellos, que es justo lo que hace falta. El zoom solo cambia con el
 * tamaño de la ventana, así que se guarda por tamaño y no se mide en cada
 * cuadro.
 */
let clave = '';
let valor = 1;

export function escalaDePagina(): number {
  if (typeof document === 'undefined' || !document.body) return 1;

  const ahora = `${window.innerWidth}x${window.innerHeight}x${window.devicePixelRatio}`;
  if (ahora === clave) return valor;

  const sonda = document.createElement('div');
  sonda.style.cssText =
    'position:fixed;left:0;top:0;width:100px;height:1px;visibility:hidden;pointer-events:none';
  document.body.appendChild(sonda);
  const medida = sonda.getBoundingClientRect().width / 100;
  sonda.remove();

  clave = ahora;
  valor = medida > 0 ? medida : 1;
  return valor;
}
