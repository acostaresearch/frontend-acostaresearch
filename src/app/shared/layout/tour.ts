import {
  Component,
  ElementRef,
  HostListener,
  Injector,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router, RouterPreloader } from '@angular/router';
import { filter } from 'rxjs';

import { PasoDelTour, TourService } from '../../core/services/tour.service';

/** Las medidas del foco, en coordenadas de la ventana. */
interface Recuadro {
  top: number;
  left: number;
  ancho: number;
  alto: number;
}

/** El aire que se deja alrededor de lo iluminado. */
const MARGEN = 10;

/** Separación entre lo iluminado y el globo, y de este al borde de la pantalla. */
const AIRE = 12;
const BORDE = 16;

/** Lo que se come la cabecera fija de arriba. */
const CABECERA = 69;

/**
 * Cuánto se le espera a un ancla que todavía no está.
 *
 * Un paso puede señalar algo que aparece un instante después: la pestaña que se
 * acaba de pulsar, un panel que estaba escondido, una tarjeta cuyo servidor
 * todavía no contestó. Pasado este tiempo se da por ausente y se sigue de largo.
 *
 * Recién llegado de otra página se espera mucho más: ahí no falta un instante,
 * falta que el navegador descargue el trozo de esa página y que su servidor
 * conteste.
 */
const ESPERA = 700;
const ESPERA_AL_LLEGAR = 2000;

/**
 * Cuánto se sigue midiendo tras colocar el foco, por si la página se asienta
 * después: una imagen que carga, una tarjeta que llega del servidor.
 *
 * Se corta antes en cuanto la medida se repite unas cuantas veces seguidas. Lo
 * que se ahorra no es trabajo de más: es que mientras se mide se está
 * repintando un velo del tamaño de la pantalla en cada cuadro, y eso se ve.
 */
const SEGUIMIENTO = 900;
const SEGUIMIENTO_AL_LLEGAR = 1600;
const CUADROS_QUIETOS = 5;

/**
 * El recorrido guiado: el velo, el foco y el globo.
 *
 * Va fuera del router, como la ventana de confirmar, porque no es de ninguna
 * página: es una capa encima de la que haya. Ver `TourService`.
 *
 * SEÑALA EL ELEMENTO DE VERDAD, no una captura. Por eso la posición se mide en
 * cada cuadro durante un momento después de cada paso: entre que se pulsa una
 * pestaña, Angular pinta su panel y el navegador termina de desplazarse, el
 * sitio donde está lo que se señala cambia tres veces. Medir una sola vez deja
 * el foco iluminando el hueco donde estaba la cosa.
 *
 * El agujero NO es interactivo: el velo se lo come todo mientras dura el
 * recorrido. Dejar pulsar lo que está debajo suena generoso y acaba con el
 * visitante en otra página, con el recorrido a medias y el globo señalando algo
 * que ya no existe.
 */
@Component({
  selector: 'app-tour',
  templateUrl: './tour.html',
  styleUrl: './tour.css',
})
export class Tour implements OnDestroy {
  protected readonly tour = inject(TourService);

  private readonly globoRef = viewChild<ElementRef<HTMLElement>>('caja');
  private readonly botonRef = viewChild<ElementRef<HTMLElement>>('avanzar');

  /** Lo iluminado. Nulo en los pasos que no señalan nada: el de bienvenida. */
  readonly foco = signal<Recuadro | null>(null);

  /** Dónde se pinta el globo. Nulo mientras no se ha medido. */
  readonly globo = signal<{ top: number; left: number } | null>(null);

  /**
   * Si el globo se va a la esquina.
   *
   * Pasa con lo que ocupa la pantalla entera —una banda de precios, la sección
   * de videos—: no cabe ni encima, ni debajo, ni al lado, y donde lo pongas
   * tapa justo lo que está explicando. En la esquina, al menos, tapa lo de
   * menos.
   */
  readonly esquina = signal(false);

  /**
   * En pantalla estrecha el globo se ancla abajo y no persigue al elemento: con
   * 360 px de ancho, un globo flotante tapa justo lo que está señalando.
   */
  readonly abajo = signal(false);

  /** Un punto por paso de la tanda de ahora, en la barra de abajo. */
  readonly puntos = computed(() =>
    Array.from({ length: this.tour.totalDeTanda() }, (_, i) => i + 1),
  );

  private readonly router = inject(Router);
  private readonly inyector = inject(Injector);

  private cuadro = 0;
  private desde = 0;
  private desplazado = false;
  private enfocado = false;

  /** Si al paso de ahora se llegó cambiando de página. Alarga las esperas. */
  private recienLlegado = false;

  /** Cuántos cuadros seguidos ha dado la misma medida. Ver `CUADROS_QUIETOS`. */
  private quietos = 0;

  /** La última medida escrita, para no repetir escrituras que no cambian nada. */
  private ultimo: Recuadro | null = null;

  /** La primera medida de un paso se escribe siempre, aunque coincida. */
  private primera = true;

  /** Si ya se repitió el desplazamiento tras llegar de otra página. */
  private reDesplazado = false;

  /**
   * Si se desplaza con animación. Se consulta cada vez y no una sola al nacer:
   * el componente vive lo que vive la pestaña, y esa preferencia se cambia sin
   * recargar. `matchMedia` se comprueba porque en las pruebas no siempre está.
   */
  private get animar(): boolean {
    if (typeof matchMedia !== 'function') return false;
    return !matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  constructor() {
    // Al cambiar de página el recorrido se acaba: sus pasos señalan cosas de la
    // pantalla que se deja, y dejarlo vivo haría que el globo fuera cayéndose
    // paso a paso delante de quien ya se fue a otra cosa.
    //
    // Salvo cuando el que navega es él: el recorrido cruza el sitio entero, y
    // cambiar de página es justo lo que hace entre un paso y el siguiente.
    this.router.events
      .pipe(
        filter((evento) => evento instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        if (this.tour.activo() && !this.tour.navegando()) this.tour.terminar();
      });

    // En marcha el recorrido, las páginas que va a visitar se empiezan a traer
    // en segundo plano: son diez saltos seguidos y cada uno es un trozo de
    // código que el navegador todavía no tiene. Ver `PreloadDelRecorrido`.
    //
    // El precargador se pide aquí y no en el servicio porque él depende de la
    // estrategia, y la estrategia del servicio: pedirlo desde fuera del círculo
    // es lo que lo rompe.
    effect(() => {
      if (this.tour.activo()) this.inyector.get(RouterPreloader).preload().subscribe();
    });

    effect(() => {
      const paso = this.tour.paso();
      cancelAnimationFrame(this.cuadro);

      if (!paso) {
        this.foco.set(null);
        this.globo.set(null);
        this.ultimo = null;
        return;
      }

      // Si el paso vive en otra página, primero se va hasta ella. Lo demás
      // —buscar el ancla, esperarla, medirla— es igual esté donde esté.
      if (paso.ruta && !this.tour.enLaRuta(paso.ruta)) {
        this.viajar(paso);
        return;
      }

      this.arrancarPaso(paso, false);
    });
  }

  /**
   * Cambia de página y sigue el recorrido allí.
   *
   * `navegando` avisa de que ese cambio es suyo: sin eso, el propio recorrido
   * dispararía el corte de arriba y se acabaría al dar el primer salto.
   */
  private viajar(paso: PasoDelTour): void {
    // Se apaga el foco antes de salir: el de la página que se deja señalaría un
    // sitio que ya no significa nada. El globo se queda, centrado, contando a
    // dónde vamos mientras llega.
    this.foco.set(null);
    this.globo.set(null);

    this.tour.navegando.set(true);

    void this.router.navigateByUrl(paso.ruta!).then((llego) => {
      this.tour.navegando.set(false);

      // Una ruta protegida puede devolver a otra parte —el guardián de sesión,
      // el de rol—. Si no se llegó, ese paso no se puede enseñar.
      if (!llego || this.tour.paso() !== paso) {
        this.tour.saltarPaso();
        return;
      }

      this.arrancarPaso(paso, true);
    });
  }

  /** Empieza a buscar, desplazar y medir lo del paso de ahora. */
  private arrancarPaso(paso: PasoDelTour, trasViajar: boolean): void {
    // Se pulsa la pestaña que contiene lo que se va a señalar. El panel no
    // está pintado todavía; de eso se encarga el seguimiento.
    if (paso.abrir) document.querySelector<HTMLElement>(paso.abrir)?.click();

    this.recienLlegado = trasViajar;
    this.desde = performance.now();
    this.desplazado = false;
    this.enfocado = false;
    this.quietos = 0;
    this.primera = true;
    this.reDesplazado = false;
    this.seguir(paso);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.cuadro);
  }

  /** Escape cierra el recorrido, como cierra cualquier cosa que se abre encima. */
  @HostListener('document:keydown.escape')
  cerrarConEscape(): void {
    if (this.tour.activo()) this.tour.terminar();
  }

  /** Si la página se mueve o cambia de tamaño, el foco se mueve con ella. */
  @HostListener('window:scroll')
  @HostListener('window:resize')
  recolocar(): void {
    const paso = this.tour.paso();
    if (paso) this.colocar(this.elementoDe(paso));
  }

  // ── Medir y colocar ────────────────────────────────────────────────────

  private elementoDe(paso: PasoDelTour): HTMLElement | null {
    return paso.ancla ? document.querySelector<HTMLElement>(paso.ancla) : null;
  }

  /**
   * Un cuadro del seguimiento: busca, desplaza, mide y se vuelve a llamar.
   *
   * El elemento se busca en CADA cuadro y no una sola vez al entrar: el panel de
   * una pestaña recién abierta todavía no existía cuando empezó el paso.
   */
  private seguir(paso: PasoDelTour): void {
    const el = this.elementoDe(paso);
    const transcurrido = performance.now() - this.desde;

    // Un elemento escondido mide cero: está en el árbol pero aún no se ve, así
    // que cuenta como ausente y se le sigue esperando.
    //
    // Las DOS medidas, no una: una lista todavía sin filas —las guías en PDF
    // mientras las trae el servidor, o si no hay ninguna— ocupa todo el ancho y
    // cero de alto. Dándola por buena, el foco iluminaba una raya y el globo
    // señalaba un hueco vacío.
    const listo = el !== null && el.offsetWidth > 0 && el.offsetHeight > 0;

    if (paso.ancla && !listo) {
      if (transcurrido < (this.recienLlegado ? ESPERA_AL_LLEGAR : ESPERA)) {
        this.cuadro = requestAnimationFrame(() => this.seguir(paso));
        return;
      }
      this.tour.saltarPaso();
      return;
    }

    // De golpe, no animado. Con desplazamiento suave el foco persigue al
    // elemento cuadro a cuadro durante medio segundo, y como además el velo
    // tiene su propia transición, lo que se ve es un recuadro que va detrás de
    // la página. Así salta la página —tapada por el velo, casi no se nota— y lo
    // único que se mueve a la vista es el foco, en un solo gesto.
    //
    // Al llegar de otra página se repite una vez: el router restaura el
    // desplazamiento por su cuenta un instante después, y sin esto nos deja
    // mirando el sitio equivocado.
    if (
      el &&
      (!this.desplazado || (this.recienLlegado && !this.reDesplazado && transcurrido > 250))
    ) {
      this.desplazarHasta(el);
      this.reDesplazado = this.desplazado;
      this.desplazado = true;
    }

    this.colocar(el);

    // Quieto unos cuantos cuadros: la página ya se asentó y no hay nada más que
    // mirar hasta que alguien la mueva.
    if (this.quietos >= CUADROS_QUIETOS) return;

    if (transcurrido < (this.recienLlegado ? SEGUIMIENTO_AL_LLEGAR : SEGUIMIENTO)) {
      this.cuadro = requestAnimationFrame(() => this.seguir(paso));
    }
  }

  /**
   * Deja a la vista lo que se va a señalar.
   *
   * Centrado si cabe. Si es más alto que la ventana —una sección entera— se
   * alinea su PRINCIPIO, porque ahí está su título, que es de lo que habla el
   * paso; centrarlo dejaría a la vista su mitad, que no dice nada. Y siempre
   * por debajo de la cabecera, que está fija y se come los primeros 69 px.
   */
  private desplazarHasta(el: HTMLElement): void {
    const r = el.getBoundingClientRect();
    const altoVentana = window.innerHeight;
    const cabe = r.height + CABECERA + BORDE * 2 <= altoVentana;

    const destino = cabe
      ? window.scrollY + r.top + r.height / 2 - altoVentana / 2
      : window.scrollY + r.top - CABECERA - BORDE;

    window.scrollTo({ top: Math.max(0, destino), behavior: 'auto' });
  }

  private colocar(el: HTMLElement | null): void {
    const medida = this.medir(el);

    // Escribir la misma medida otra vez no cambia nada en pantalla, pero obliga
    // a Angular a revisar y al navegador a repintar un velo del tamaño de la
    // pantalla. Sesenta veces por segundo, eso SÍ se nota.
    if (!this.primera && this.mismaMedida(medida, this.ultimo)) {
      this.quietos++;
      return;
    }

    this.primera = false;
    this.quietos = 0;
    this.ultimo = medida;
    this.foco.set(medida);
    this.colocarGlobo();

    // El botón de avanzar se lleva el foco del teclado una vez por paso: así se
    // avanza con Enter y el lector de pantalla lee el globo al llegar.
    if (!this.enfocado) {
      this.botonRef()?.nativeElement.focus({ preventScroll: true });
      this.enfocado = true;
    }
  }

  private medir(el: HTMLElement | null): Recuadro | null {
    if (!el) return null;

    const r = el.getBoundingClientRect();
    return {
      top: r.top - MARGEN,
      left: r.left - MARGEN,
      ancho: r.width + MARGEN * 2,
      alto: r.height + MARGEN * 2,
    };
  }

  /** Iguales al píxel: por debajo de eso no hay nada que repintar. */
  private mismaMedida(a: Recuadro | null, b: Recuadro | null): boolean {
    if (a === null || b === null) return a === b;
    return (
      Math.round(a.top) === Math.round(b.top) &&
      Math.round(a.left) === Math.round(b.left) &&
      Math.round(a.ancho) === Math.round(b.ancho) &&
      Math.round(a.alto) === Math.round(b.alto)
    );
  }

  private colocarGlobo(): void {
    const globo = this.globoRef()?.nativeElement;
    if (!globo) return;

    const f = this.foco();
    const anchoVentana = window.innerWidth;
    const altoVentana = window.innerHeight;

    // Estrecho, o sin nada que señalar: el globo no persigue a nadie. Lo coloca
    // el CSS, abajo o en el centro.
    if (anchoVentana <= 720 || !f) {
      this.abajo.set(anchoVentana <= 720);
      this.enEsquina(false);
      this.globo.set(null);
      return;
    }

    this.abajo.set(false);

    const ancho = globo.offsetWidth;
    const alto = globo.offsetHeight;

    // Debajo de lo señalado si cabe, que es lo que se lee más natural. Si no,
    // encima. Si tampoco, a un lado —lo que pasa con lo alto y estrecho, como
    // la columna del panel de administración—. Y si nada de eso cabe, a la
    // esquina: ver la nota de `esquina`.
    const debajo = f.top + f.alto + AIRE;
    const encima = f.top - AIRE - alto;
    const derecha = f.left + f.ancho + AIRE;
    const izquierda = f.left - AIRE - ancho;

    if (debajo + alto <= altoVentana - BORDE) {
      this.enEsquina(false);
      this.globo.set({ top: debajo, left: this.dentro(f.left, ancho, anchoVentana) });
      return;
    }

    if (encima >= BORDE) {
      this.enEsquina(false);
      this.globo.set({ top: encima, left: this.dentro(f.left, ancho, anchoVentana) });
      return;
    }

    if (derecha + ancho <= anchoVentana - BORDE) {
      this.enEsquina(false);
      this.globo.set({ top: this.dentro(f.top, alto, altoVentana), left: derecha });
      return;
    }

    if (izquierda >= BORDE) {
      this.enEsquina(false);
      this.globo.set({ top: this.dentro(f.top, alto, altoVentana), left: izquierda });
      return;
    }

    this.enEsquina(true);
  }

  /** A la esquina lo manda el CSS, así que se le quita la posición medida. */
  private enEsquina(si: boolean): void {
    this.esquina.set(si);
    if (si) this.globo.set(null);
  }

  /** Que no se salga por ningún borde. */
  private dentro(donde: number, cuanto: number, disponible: number): number {
    return Math.max(BORDE, Math.min(donde, disponible - cuanto - BORDE));
  }
}
