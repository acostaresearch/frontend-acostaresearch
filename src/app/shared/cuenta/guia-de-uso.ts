import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';

export interface PasoDeGuia {
  readonly titulo: string;
  readonly detalle: string;
}

export interface MensajeDeEjemplo {
  readonly de: 'tu' | 'claude';
  readonly texto: string;
}

/** Lo que tarda en aparecer cada mensaje del ejemplo. */
const PAUSA_MS = 1100;

/**
 * «Cómo se usa», enseñado en vez de contado.
 *
 * Tres piezas para las pestañas de herramientas del perfil (Zotero, R):
 *
 * - Los pasos, con el que toca marcado («Estás aquí») cuando la pestaña sabe
 *   por dónde va el tesista. Se pueden abrir para leer el detalle.
 * - Las frases que hay que decirle a Claude, con su botón de copiar: la duda
 *   más repetida es «¿y qué le escribo?».
 * - Una conversación de ejemplo que se reproduce mensaje a mensaje, para ver
 *   el ida y vuelta antes de hacerlo. Es ilustrativa y lo dice.
 */
@Component({
  selector: 'app-guia-de-uso',
  templateUrl: './guia-de-uso.html',
  styleUrl: './guia-de-uso.css',
})
export class GuiaDeUso {
  readonly titulo = input('Cómo se usa');
  readonly pasos = input.required<readonly PasoDeGuia[]>();
  /** El paso por el que va (desde 0). Nulo si la pestaña no lo sabe. */
  readonly pasoActual = input<number | null>(null);
  readonly frases = input<readonly string[]>([]);
  readonly ejemplo = input<readonly MensajeDeEjemplo[]>([]);

  /** El paso desplegado. Arranca en el que toca, o en el primero. */
  protected readonly abierto = signal<number | null>(null);
  protected readonly pasoAbierto = computed(() => this.abierto() ?? this.pasoActual() ?? 0);

  protected readonly copiada = signal<string | null>(null);

  /** Cuántos mensajes del ejemplo se ven. 0 = aún sin reproducir. */
  protected readonly vistos = signal(0);
  protected readonly reproduciendo = signal(false);
  protected readonly mensajes = computed(() => this.ejemplo().slice(0, this.vistos()));
  protected readonly escribiendo = computed(
    () => this.reproduciendo() && this.vistos() < this.ejemplo().length,
  );
  protected readonly terminado = computed(
    () => this.vistos() > 0 && this.vistos() >= this.ejemplo().length,
  );

  private reloj: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.parar());
    // Si cambia el paso que toca (conectó, eligió colección), se abre ese.
    effect(() => {
      this.pasoActual();
      this.abierto.set(null);
    });
  }

  protected estadoDelPaso(i: number): 'hecho' | 'actual' | 'pendiente' | 'libre' {
    const actual = this.pasoActual();
    if (actual === null) return 'libre';
    if (i < actual) return 'hecho';
    return i === actual ? 'actual' : 'pendiente';
  }

  protected alternar(i: number): void {
    this.abierto.set(this.pasoAbierto() === i ? -1 : i);
  }

  protected copiar(frase: string): void {
    navigator.clipboard?.writeText(frase).then(
      () => {
        this.copiada.set(frase);
        setTimeout(() => {
          if (this.copiada() === frase) this.copiada.set(null);
        }, 1800);
      },
      () => undefined,
    );
  }

  protected reproducir(): void {
    this.parar();
    this.vistos.set(0);
    this.reproduciendo.set(true);
    const siguiente = () => {
      this.vistos.update((n) => n + 1);
      if (this.vistos() < this.ejemplo().length) {
        this.reloj = setTimeout(siguiente, PAUSA_MS);
      } else {
        this.reproduciendo.set(false);
        this.reloj = null;
      }
    };
    this.reloj = setTimeout(siguiente, 300);
  }

  protected verTodo(): void {
    this.parar();
    this.vistos.set(this.ejemplo().length);
  }

  private parar(): void {
    if (this.reloj) clearTimeout(this.reloj);
    this.reloj = null;
    this.reproduciendo.set(false);
  }
}
