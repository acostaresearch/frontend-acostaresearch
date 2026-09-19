import { DestroyRef, Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';

/**
 * Cuenta desde cero hasta la cifra cuando entra en pantalla.
 *
 * Solo toca el número: «+500» cuenta de «+0» a «+500» y lo que no es un número
 * («Zotero integrado») se queda como está. El valor final es el que va escrito
 * en el HTML, así que sin JavaScript, para un buscador o con el movimiento
 * reducido se lee la cifra de verdad desde el principio.
 */
@Directive({ selector: '[appContador]' })
export class Contador {
  readonly appContador = input.required<string>();

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this.preparar());
  }

  private preparar(): void {
    const partes = /^(\D*)(\d+)(\D*)$/.exec(this.appContador());
    if (!partes || typeof IntersectionObserver === 'undefined') return;
    if (matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const [, antes, cifra, despues] = partes;
    const final = Number(cifra);
    const texto = this.el.nativeElement.firstChild;
    // Se escribe en el nodo de texto que puso Angular, no en `textContent`,
    // para no cambiarle el nodo por debajo.
    if (!texto || texto.nodeType !== Node.TEXT_NODE) return;
    const pintar = (n: number) => (texto.nodeValue = `${antes}${n}${despues}`);

    pintar(0);
    let cuadro = 0;
    const observador = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        observador.disconnect();
        const inicio = performance.now();
        const paso = (t: number) => {
          const p = Math.min(1, (t - inicio) / 1400);
          pintar(Math.round(final * (1 - Math.pow(1 - p, 3))));
          if (p < 1) cuadro = requestAnimationFrame(paso);
        };
        cuadro = requestAnimationFrame(paso);
      },
      { threshold: 0.5 },
    );
    observador.observe(this.el.nativeElement);
    this.destroyRef.onDestroy(() => {
      observador.disconnect();
      cancelAnimationFrame(cuadro);
    });
  }
}
