import { DatePipe } from '@angular/common';
import { Component, DestroyRef, effect, inject, output, signal } from '@angular/core';

import { BienvenidaService } from '../../core/services/bienvenida.service';
import { FondoService } from '../../core/services/fondo.service';

/**
 * La bienvenida a quien acaba de canjear su código.
 *
 * Sale en el panel, delante de todo, nada más llegar desde /planes. Lleva la
 * URL del conector con su botón de copiar —es la única vez que se enseña— y,
 * al cerrarla, el panel arranca el recorrido guiado (ver `MiConector`).
 *
 * No pinta nada si no hay un canje recién hecho: ver `BienvenidaService`.
 */
@Component({
  selector: 'app-bienvenida-canje',
  imports: [DatePipe],
  templateUrl: './bienvenida-canje.html',
  styleUrl: './bienvenida-canje.css',
})
export class BienvenidaCanje {
  private readonly bienvenida = inject(BienvenidaService);
  private readonly fondo = inject(FondoService);

  readonly canje = this.bienvenida.pendiente;
  readonly urlCopiada = signal(false);
  readonly sinCopiar = signal(false);

  /** Se cerró la ventana. Dice si el código renovó un acceso que ya se tenía. */
  readonly cerrada = output<boolean>();

  constructor() {
    // Congela la página mientras la ventana está delante.
    effect(() => this.fondo.fijar('bienvenida-canje', this.canje() !== null));
    inject(DestroyRef).onDestroy(() => this.fondo.fijar('bienvenida-canje', false));
  }

  async copiar(): Promise<void> {
    const url = this.canje()?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.urlCopiada.set(true);
      this.sinCopiar.set(false);
    } catch {
      // La URL sigue a la vista para copiarla a mano.
      this.sinCopiar.set(true);
    }
  }

  cerrar(): void {
    const canje = this.canje();
    if (!canje) return;
    this.bienvenida.cerrar();
    this.cerrada.emit(canje.renovada);
  }
}
