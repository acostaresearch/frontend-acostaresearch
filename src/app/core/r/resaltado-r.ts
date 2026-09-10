/**
 * Colorea código de R para pintarlo detrás del editor.
 *
 * POR QUÉ A MANO Y NO CON UNA LIBRERÍA
 * ------------------------------------
 * Un resaltador completo —CodeMirror, Monaco— pesa entre 300 kB y 2 MB, y esta
 * página ya pide 30 MB de R. Para lo que se escribe en una tesis —llamadas,
 * cadenas, números y comentarios— basta con reconocer seis clases de pieza, y
 * eso cabe en una expresión regular.
 *
 * QUÉ HACE FALTA QUE SEA CIERTO
 * -----------------------------
 * El resultado se pinta DETRÁS de un `<textarea>` transparente, así que cada
 * carácter tiene que caer exactamente en el mismo sitio en los dos. Por eso no
 * se puede quitar ni añadir un solo espacio: lo único que se hace es envolver
 * trozos en `<span>`, que no ocupa.
 */

/**
 * Las seis piezas, en el orden en que hay que probarlas.
 *
 * El orden importa y no es negociable: un `#` dentro de una cadena no abre un
 * comentario, así que las cadenas se prueban antes; y un nombre de función solo
 * lo es si le sigue un paréntesis, o `mean` sería palabra clave en cualquier
 * sitio donde aparezca.
 *
 * Las cadenas admiten quedarse sin cerrar (`"?`) porque se resalta mientras se
 * teclea: al escribir la primera comilla todavía no existe la segunda, y sin
 * eso la línea entera parpadearía sin color hasta terminar de escribirla.
 */
const PIEZAS = new RegExp(
  [
    '(#[^\\n]*)', // 1 · comentario
    '("(?:\\\\.|[^"\\\\\\n])*"?|\'(?:\\\\.|[^\'\\\\\\n])*\'?)', // 2 · cadena
    '\\b(function|if|else|for|while|repeat|break|next|return|in|TRUE|FALSE|NULL|NA|NaN|Inf|library|require)\\b', // 3
    '\\b(\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b', // 4 · número
    '([A-Za-z.][A-Za-z0-9._]*)(?=\\s*\\()', // 5 · nombre de función
    '(<<-|<-|->>|->|\\|>|%[^%\\n]*%)', // 6 · asignación y tuberías
  ].join('|'),
  'g',
);

/** La clase CSS de cada grupo de la expresión, por su número. */
const CLASES = ['', 'tk-com', 'tk-cad', 'tk-cla', 'tk-num', 'tk-fun', 'tk-ope'];

/**
 * El código como HTML con `<span>` de color.
 *
 * Todo el texto pasa por `escapar` antes de entrar en el resultado, incluido el
 * de dentro de cada pieza: si no, un `if (a < b)` cerraría una etiqueta que
 * nadie abrió y se comería el resto del guion.
 */
export function resaltarR(codigo: string): string {
  let html = '';
  let desde = 0;

  PIEZAS.lastIndex = 0;

  for (let pieza = PIEZAS.exec(codigo); pieza !== null; pieza = PIEZAS.exec(codigo)) {
    html += escapar(codigo.slice(desde, pieza.index));

    // Cuál de los seis grupos casó. Solo uno tiene valor en cada vuelta.
    let grupo = 1;
    while (grupo < CLASES.length && pieza[grupo] === undefined) grupo++;

    html += `<span class="${CLASES[grupo]}">${escapar(pieza[0])}</span>`;

    desde = pieza.index + pieza[0].length;
  }

  html += escapar(codigo.slice(desde));

  /**
   * Un salto final de sobra.
   *
   * Un `<pre>` que acaba en salto de línea no pinta la última línea vacía, pero
   * el `<textarea>` sí la cuenta. Sin este espacio, el fondo se queda una línea
   * corto justo cuando el cursor está al final, que es siempre.
   */
  return `${html} `;
}

function escapar(texto: string): string {
  return texto.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
}
