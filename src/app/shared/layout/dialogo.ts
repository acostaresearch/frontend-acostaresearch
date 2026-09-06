import {
  AfterViewChecked,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { DialogoService } from '../../core/services/dialogo.service';
import { FondoService } from '../../core/services/fondo.service';

/**
 * La ventana de confirmar del sitio, montada una sola vez en la raíz.
 *
 * No decide nada: enseña lo que `DialogoService` le pasa y le devuelve la
 * respuesta. Se coloca en `app.html` para que se superponga a cualquier
 * página, venga de donde venga la pregunta.
 */
@Component({
  selector: 'app-dialogo',
  templateUrl: './dialogo.html',
  styleUrl: './dialogo.css',
})
export class Dialogo implements AfterViewChecked {
  private readonly dialogos = inject(DialogoService);
  private readonly fondo = inject(FondoService);

  protected readonly abierto = this.dialogos.abierto;

  /** Lo escrito en el campo, cuando la ventana lo lleva. */
  protected readonly texto = signal('');

  private readonly campoTexto = viewChild<ElementRef<HTMLInputElement>>('campoTexto');
  private readonly botonConfirmar = viewChild<ElementRef<HTMLButtonElement>>('botonConfirmar');

  /** La ventana que ya recibió el foco, para no robárselo al usuario en cada repintado. */
  private enfocado: unknown = null;

  /** Los saltos de línea del mensaje se convierten en párrafos de verdad. */
  protected readonly parrafos = computed(
    () =>
      this.abierto()
        ?.mensaje?.split('\n')
        .map((linea) => linea.trim())
        .filter(Boolean) ?? [],
  );

  protected readonly puedeConfirmar = computed(() => {
    const ventana = this.abierto();
    if (!ventana?.campo?.obligatorio) return true;
    return this.texto().trim().length > 0;
  });

  constructor() {
    // Congela la página mientras la ventana está delante.
    effect(() => this.fondo.fijar('dialogo', this.abierto() !== null));

    // El valor de partida se fija al abrirse, no al pintarse: escribirlo desde
    // `ngAfterViewChecked` obliga a otra pasada de detección en cada repintado.
    effect(() => {
      this.texto.set(this.abierto()?.campo?.valor ?? '');
    });
  }

  /**
   * Al abrirse, el foco entra en la ventana: en el campo si lo hay y, si no, en
   * el botón de confirmar. Sin esto el teclado se queda en la página de detrás.
   */
  ngAfterViewChecked(): void {
    const ventana = this.abierto();

    if (!ventana) {
      this.enfocado = null;
      return;
    }
    if (this.enfocado === ventana) return;

    this.enfocado = ventana;

    const campo = this.campoTexto()?.nativeElement;
    if (campo) {
      campo.value = ventana.campo?.valor ?? '';
      campo.focus();
      campo.select();
    } else {
      this.botonConfirmar()?.nativeElement.focus();
    }
  }

  @HostListener('document:keydown.escape')
  protected cancelarConEscape(): void {
    if (this.abierto()) this.cancelar();
  }

  protected escribir(evento: Event): void {
    this.texto.set((evento.target as HTMLInputElement).value);
  }

  /** Enter en el campo confirma, como en el `prompt()` del navegador. */
  protected confirmarConEnter(evento: Event): void {
    evento.preventDefault();
    this.confirmar();
  }

  protected confirmar(): void {
    if (!this.puedeConfirmar()) return;
    this.dialogos.responder(this.abierto()?.campo ? this.texto().trim() : '');
  }

  protected cancelar(): void {
    this.dialogos.responder(null);
  }
}
