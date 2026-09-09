import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

const SEGUNDO = 1000;
const MINUTO = 60 * SEGUNDO;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/**
 * Cuánto falta para una fecha, contado en pantalla.
 *
 * SOLO PARA PLAZOS QUE EXISTEN DE VERDAD
 * --------------------------------------
 * Recibe una fecha, no una duración, y esa es toda la diferencia. Un contador
 * al que se le dice «cinco minutos» arranca de nuevo en cada recarga y no
 * cuenta hacia nada: es un adorno que promete algo que no va a pasar, y el
 * primer comprador que recarga la página lo descubre. Con una fecha, lo que
 * enseña es comprobable, y al llegar a cero ocurre de verdad lo que decía
 * —el código deja de valer— porque quien lo comprueba es el servidor.
 *
 * Si algún día no hay plazo real que enseñar, lo correcto es no montar este
 * componente, no inventarle una fecha.
 *
 * EL RITMO
 * --------
 * Un latido por segundo cuando queda menos de una hora, que es cuando el número
 * cambia y aprieta; cada medio minuto cuando faltan días, donde un contador al
 * segundo solo gasta. Se reprograma solo al cruzar el umbral.
 */
@Component({
  selector: 'app-cuenta-atras',
  template: `<span class="cuenta-atras" [class.apremia]="apremia()">{{ texto() }}</span>`,
  styles: `
    .cuenta-atras {
      font-variant-numeric: tabular-nums;
      font-weight: 650;
    }

    /* Cuando baja de una hora el número se mueve cada segundo; que además se
       vea es lo que separa un dato de un aviso. */
    .apremia {
      color: var(--color-error);
    }
  `,
})
export class CuentaAtras {
  /** La fecha límite, en ISO. Es la que manda el servidor, no una duración. */
  readonly hasta = input.required<string>();

  /**
   * Se emite UNA vez, al llegar a cero.
   *
   * Quien lo escucha tiene que hacer algo honesto con ello: quitar el descuento
   * y decir que venció, no dejar el precio rebajado en pantalla para que el
   * cobro falle después.
   */
  readonly vencido = output<void>();

  private readonly ahora = signal(Date.now());
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private avisado = false;

  private readonly restante = computed(() => {
    const limite = new Date(this.hasta()).getTime();
    if (Number.isNaN(limite)) return 0;
    return Math.max(0, limite - this.ahora());
  });

  readonly apremia = computed(() => this.restante() > 0 && this.restante() < HORA);

  readonly texto = computed(() => {
    const falta = this.restante();
    if (falta <= 0) return 'vencido';

    if (falta >= 2 * DIA) {
      const dias = Math.floor(falta / DIA);
      const horas = Math.floor((falta % DIA) / HORA);
      return horas > 0 ? `${dias} días ${horas} h` : `${dias} días`;
    }

    if (falta >= HORA) {
      const horas = Math.floor(falta / HORA);
      const minutos = Math.floor((falta % HORA) / MINUTO);
      return `${horas} h ${minutos} min`;
    }

    // Bajo la hora, en reloj: es el único tramo donde los segundos dicen algo.
    const minutos = Math.floor(falta / MINUTO);
    const segundos = Math.floor((falta % MINUTO) / SEGUNDO);
    return `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
  });

  constructor() {
    // Vuelve a arrancar si cambia la fecha: aplicar otro código no puede dejar
    // el contador del anterior corriendo.
    effect(() => {
      this.hasta();
      this.avisado = false;
      this.ahora.set(Date.now());
      this.programar();
    });

    inject(DestroyRef).onDestroy(() => this.detener());
  }

  private programar(): void {
    this.detener();

    const falta = this.restante();

    if (falta <= 0) {
      // El aviso va fuera del cálculo: un `computed` no puede tener efectos, y
      // avisar dos veces del mismo vencimiento borraría un código dos veces.
      if (!this.avisado) {
        this.avisado = true;
        this.vencido.emit();
      }
      return;
    }

    const cada = falta < HORA ? SEGUNDO : 30 * SEGUNDO;
    this.temporizador = setTimeout(
      () => {
        this.ahora.set(Date.now());
        this.programar();
      },
      Math.min(cada, falta),
    );
  }

  private detener(): void {
    if (this.temporizador === null) return;
    clearTimeout(this.temporizador);
    this.temporizador = null;
  }
}
