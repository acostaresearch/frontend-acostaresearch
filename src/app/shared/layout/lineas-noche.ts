import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * El fondo de líneas de los bloques en azul noche.
 *
 * Estaba escrito a mano dentro del encabezado de «Las 12 Skills» y era el
 * único bloque que lo llevaba, así que la franja de cifras, las bandas de
 * cierre, los cinco pasos y el pie —del mismo azul— se veían planos al lado.
 * Ahora es un componente y todos piden el mismo.
 *
 * Se pone DENTRO del bloque azul, que necesita `position: relative` y
 * `overflow: hidden`; el componente se coloca solo por detrás del contenido
 * (que debe ir `position: relative`, como hace ya el resto del sitio).
 *
 * Todo es CSS: arcos con `border-radius`, rayas con `repeating-linear-gradient`
 * y una cuadrícula recortada con máscara. Ni imágenes, ni SVG, ni JavaScript, y
 * nada se mueve, así que no hay nada que apagar con `prefers-reduced-motion`.
 * El blanco no pasa del 16 %, muy por debajo de lo que afectaría al contraste
 * del texto que va encima.
 *
 * No depende del tema: va atado al azul noche, y en modo oscuro esos bloques
 * siguen siendo azul noche.
 */
@Component({
  selector: 'app-lineas-noche',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lineas-noche.html',
  styleUrl: './lineas-noche.css',
  host: { 'aria-hidden': 'true' },
})
export class LineasNoche {
  /**
   * Cuánto decorado cabe. `full` para los encabezados y las bandas altas;
   * `compacta` para franjas, cierres y el pie, donde catorce arcos no caben y
   * solo ensucian.
   */
  readonly densidad = input<'full' | 'compacta'>('full');

  /**
   * Dónde se ve la cuadrícula. Va sobre lo que importa del bloque: en los
   * encabezados, sobre las cifras o la foto de la derecha; en una franja,
   * en medio.
   */
  readonly foco = input<'centro' | 'derecha'>('centro');

  /** Los anillos punteados se quitan en bloques de menos de 160 px de alto. */
  readonly anillos = input(true);

  /**
   * De qué esquinas salen los arcos. El pie solo los lleva en la inferior
   * derecha: por la izquierda están las columnas de enlaces y por arriba, el
   * borde con el contenido.
   */
  readonly esquinas = input<'ambas' | 'inferior-derecha'>('ambas');

  private readonly compacta = computed(() => this.densidad() === 'compacta');

  readonly arcosArriba = computed(() => this.serie(this.compacta() ? 6 : 14));
  readonly arcosAbajo = computed(() => this.serie(this.compacta() ? 4 : 9));
  readonly punteados = computed(() => this.serie(this.compacta() ? 2 : 5));

  private serie(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }
}
