import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  isDevMode,
  signal,
  viewChild,
} from '@angular/core';

/**
 * La red del hero: la persona al centro, las herramientas alrededor y el Word
 * saliendo por la derecha.
 *
 * Todo el dibujo vive en un lienzo de 600×560 unidades que luego se escala
 * entero con `transform`; así las posiciones de abajo son las del diseño y no
 * hay que recalcular nada por anchura. Los cables y los puntos van en un solo
 * SVG con ese mismo `viewBox`; nodos, persona y tarjeta son HTML encima.
 *
 * Lo que se anima se anima con `transform` y `opacity`, nunca con `left` o
 * `top`: el ciclo corre sin parar mientras la portada está abierta y un
 * repintado por latido se nota en un portátil modesto.
 */

interface Herramienta {
  clave: string;
  nombre: string;
  funcion: string;
  /** Variable CSS con su color: en modo oscuro Grok no puede ser negro. */
  color: string;
  logo: string;
  /** Esquina superior izquierda del nodo, en unidades del lienzo. */
  x: number;
  y: number;
  /** Lo que aporta a la tesis: la línea que completa en la tarjeta de Word. */
  aporte: string;
  /** El tooltip. */
  frase: string;
}

/*
 * Grok no va en (300, 300): ahí quedaba debajo de la foto, que ocupa de 255 a
 * 405 en los dos ejes, y solo asomaba «agente de» por el borde del círculo. Va
 * arriba a la derecha, que era el único hueco sin cable ni tarjeta.
 *
 * El orden es el del ciclo: primero las fuentes y referencias, luego el
 * análisis y al final los agentes. Mendeley y VOSviewer van a la izquierda,
 * entre Scopus, Zotero y R; ATLAS.ti abajo a la derecha, bajo la tarjeta.
 */
const HERRAMIENTAS: Herramienta[] = [
  {
    clave: 'scopus',
    nombre: 'Scopus',
    funcion: 'tus fuentes',
    color: 'var(--hn-scopus)',
    logo: '/logos/scopus.png',
    x: 70,
    y: 70,
    aporte: 'Fuentes con resumen, desde Scopus',
    frase: 'Busca artículos indexados y te trae cada fuente con su resumen.',
  },
  {
    clave: 'zotero',
    nombre: 'Zotero',
    funcion: 'tus referencias',
    color: 'var(--hn-zotero)',
    logo: '/logos/zotero.png',
    x: 40,
    y: 250,
    aporte: 'Referencias al día, sin citas huérfanas',
    frase: 'Guarda tus referencias y las cita en la norma que te pidan.',
  },
  {
    clave: 'mendeley',
    nombre: 'Mendeley',
    funcion: 'tu biblioteca',
    color: 'var(--hn-mendeley)',
    logo: '/logos/mendeley.svg',
    x: 10,
    y: 160,
    aporte: 'Tu biblioteca de Mendeley, citada',
    frase: 'Trae tu biblioteca de Mendeley para citar lo que ya tienes guardado.',
  },
  {
    clave: 'vosviewer',
    nombre: 'VOSviewer',
    funcion: 'tu mapa',
    color: 'var(--hn-vosviewer)',
    logo: '/logos/vosviewer.svg',
    x: 10,
    y: 340,
    aporte: 'Mapa bibliométrico en VOSviewer',
    frase: 'Dibuja el mapa de coocurrencias de tus fuentes para ver los temas.',
  },
  {
    clave: 'r',
    nombre: 'R',
    funcion: 'tu análisis',
    color: 'var(--hn-r)',
    logo: '/logos/r.png',
    x: 80,
    y: 430,
    aporte: 'Análisis estadístico en R',
    frase: 'Corre tu análisis con tus propios datos, sin inventar una cifra.',
  },
  {
    clave: 'atlasti',
    nombre: 'ATLAS.ti',
    funcion: 'tus entrevistas',
    color: 'var(--hn-atlasti)',
    logo: '/logos/atlasti.png',
    x: 390,
    y: 452,
    aporte: 'Análisis cualitativo en ATLAS.ti',
    frase: 'Codifica tus entrevistas y te entrega el proyecto listo para ATLAS.ti.',
  },
  {
    clave: 'claude',
    nombre: 'Claude',
    funcion: 'agente de IA',
    color: 'var(--hn-claude)',
    logo: '/logos/claude.png',
    x: 210,
    y: 20,
    aporte: 'Redacción con tu voz',
    frase: 'Te acompaña fase por fase y redacta contigo, con tu voz.',
  },
  {
    clave: 'chatgpt',
    nombre: 'ChatGPT',
    funcion: 'agente de IA',
    color: 'var(--hn-chatgpt)',
    logo: '/logos/chatgpt.png',
    x: 200,
    y: 500,
    aporte: 'Revisión cruzada',
    frase: 'Revisa lo escrito desde otra mirada antes de que lo vea tu asesor.',
  },
  {
    clave: 'grok',
    nombre: 'Grok',
    funcion: 'agente de IA',
    color: 'var(--hn-grok)',
    logo: '/logos/grok.png',
    x: 380,
    y: 40,
    aporte: 'Contraste de argumentos',
    frase: 'Pone a prueba tus argumentos y te plantea las objeciones del jurado.',
  },
];

/** El centro de la foto, y adonde llegan todos los cables. */
const CENTRO = { x: 330, y: 270 };
/** El nodo mide siempre lo mismo: los cables salen de su centro. */
const NODO = { ancho: 150, alto: 48 };
/** Borde del círculo de la foto: 75 de radio más 6 de borde blanco. */
const RADIO_FOTO = 81;

const PASO = 1500;
const ESPERA_SELLO = 500;
const SELLO = 2200;
const ARRANQUE = 2400;

@Component({
  selector: 'app-hero-network',
  templateUrl: './hero-network.html',
  styleUrl: './hero-network.css',
})
export class HeroNetwork {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly escena = viewChild.required<ElementRef<HTMLElement>>('escena');
  private readonly lienzo = viewChild.required<ElementRef<HTMLElement>>('lienzo');
  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');
  private readonly puntos = viewChild.required<ElementRef<SVGGElement>>('puntos');
  private readonly pulso = viewChild.required<ElementRef<HTMLElement>>('pulso');

  readonly herramientas = HERRAMIENTAS;
  readonly desarrollo = isDevMode();

  /** Debajo de 900 px la tarjeta de Word baja bajo la persona. */
  readonly apilado = signal(false);

  readonly entrado = signal(false);
  readonly activo = signal<number | null>(null);
  readonly hechos = signal<boolean[]>(HERRAMIENTAS.map(() => false));
  readonly sello = signal(false);
  /** Los logos que no están en /logos: se ve la inicial en su lugar. */
  readonly sinLogo = signal<Set<string>>(new Set());

  readonly porcentaje = computed(() => {
    const n = this.hechos().filter(Boolean).length;
    return Math.round((n / HERRAMIENTAS.length) * 100);
  });

  readonly ahora = computed(() => {
    const i = this.activo();
    return i === null ? HERRAMIENTAS[0] : HERRAMIENTAS[i];
  });

  readonly centro = CENTRO;

  /** Los cables, curvados todos hacia el mismo lado para que no se crucen. */
  readonly cables = HERRAMIENTAS.map((h) => {
    const x0 = h.x + NODO.ancho / 2;
    const y0 = h.y + NODO.alto / 2;
    const dx = CENTRO.x - x0;
    const dy = CENTRO.y - y0;
    const cx = (x0 + CENTRO.x) / 2 - dy * 0.18;
    const cy = (y0 + CENTRO.y) / 2 + dx * 0.18;
    return `M ${x0} ${y0} Q ${cx} ${cy} ${CENTRO.x} ${CENTRO.y}`;
  });

  /** Dónde va el centro de la tarjeta de Word. */
  readonly tarjeta = computed(() => (this.apilado() ? { x: 330, y: 718 } : { x: 568, y: 270 }));

  /**
   * La salida a Word. En escritorio es un tramo recto hasta la tarjeta; apilado
   * baja en curva por el hueco entre ChatGPT y ATLAS.ti.
   */
  readonly salida = computed(() => {
    if (this.apilado()) {
      return `M ${CENTRO.x + 58} ${CENTRO.y + 58} Q 372 450 368 582`;
    }
    const izquierda = this.tarjeta().x - 120;
    return `M ${CENTRO.x + RADIO_FOTO} ${CENTRO.y} L ${izquierda} ${CENTRO.y}`;
  });

  private reducido = false;
  private reloj: ReturnType<typeof setTimeout> | undefined;
  private plazo = 0;
  private pendiente: (() => void) | null = null;
  private enPantalla = false;
  private iniciado = false;
  private siguiente = 0;
  private temporizadores: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    afterNextRender(() => this.montar());
    this.destroyRef.onDestroy(() => this.parar());
  }

  logoFallo(clave: string): void {
    this.sinLogo.update((s) => new Set(s).add(clave));
  }

  /** Pasar el ratón por un nodo lo activa ya, y el ciclo sigue desde ahí. */
  tocar(i: number): void {
    if (!this.iniciado) return;
    clearTimeout(this.reloj);
    if (this.sello() || this.hechos().every(Boolean)) this.apagarLista();
    this.plazo = performance.now();
    this.turno(i);
  }

  /** El botón de desarrollo: vuelve a empezar desde la entrada. */
  reiniciar(): void {
    this.parar();
    this.iniciado = false;
    this.entrado.set(false);
    this.activo.set(null);
    this.apagarLista();
    this.limpiarPuntos();
    // Un respiro para que el navegador pinte el estado inicial; si no, las
    // transiciones de entrada no tienen desde dónde partir.
    this.temporizadores.push(setTimeout(() => this.iniciar(), 60));
  }

  private montar(): void {
    const mm = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q) : null);

    this.reducido = mm('(prefers-reduced-motion: reduce)')?.matches ?? false;

    const estrecho = mm('(max-width: 900px)');
    if (estrecho) {
      this.apilado.set(estrecho.matches);
      const cambio = (e: MediaQueryListEvent) => {
        this.apilado.set(e.matches);
        // El punto de la salida a Word lleva el trazado copiado: se rehace.
        if (this.iniciado && !this.reducido) {
          this.limpiarPuntos();
          this.crearPuntos();
          const i = this.activo();
          if (i !== null) this.marcarPuntos(i);
        }
      };
      estrecho.addEventListener('change', cambio);
      this.destroyRef.onDestroy(() => estrecho.removeEventListener('change', cambio));
    }

    // El largo de cada cable, para dibujarlo con `stroke-dashoffset`. Se mide
    // en vez de usar `pathLength` porque Safari lo ha respetado a ratos.
    this.svg()
      .nativeElement.querySelectorAll<SVGPathElement>('.hn-cable')
      .forEach((p) => p.style.setProperty('--largo', String(Math.ceil(p.getTotalLength()))));

    this.inclinacion();

    if (typeof IntersectionObserver === 'undefined') {
      this.enPantalla = true;
      this.iniciar();
      return;
    }

    const observador = new IntersectionObserver(
      ([e]) => {
        this.enPantalla = e.isIntersecting;
        if (!e.isIntersecting) return this.pausar();
        if (!this.iniciado) return this.iniciar();
        this.reanudar();
      },
      { threshold: 0.3 },
    );
    observador.observe(this.host.nativeElement);
    this.destroyRef.onDestroy(() => observador.disconnect());
  }

  private iniciar(): void {
    this.iniciado = true;
    this.entrado.set(true);

    if (this.reducido) {
      // Todo ya dibujado, con un nodo encendido y sin nada que se mueva.
      this.turno(0, false);
      return;
    }

    this.crearPuntos();
    this.plazo = performance.now();
    this.programar(() => this.turno(0), ARRANQUE);
  }

  /** Enciende una herramienta y completa su línea en el Word. */
  private turno(i: number, conCiclo = true): void {
    this.activo.set(i);
    this.hechos.update((h) => h.map((v, j) => v || j === i));
    this.siguiente = (i + 1) % HERRAMIENTAS.length;
    this.marcarPuntos(i);
    if (!this.reducido) this.latir(HERRAMIENTAS[i].color);

    if (!conCiclo || this.reducido) return;

    if (this.hechos().every(Boolean)) {
      this.programar(() => {
        this.sello.set(true);
        this.programar(() => {
          this.apagarLista();
          this.turno(this.siguiente);
        }, SELLO);
      }, ESPERA_SELLO);
    } else {
      this.programar(() => this.turno(this.siguiente), PASO);
    }
  }

  private apagarLista(): void {
    this.sello.set(false);
    this.hechos.set(HERRAMIENTAS.map(() => false));
  }

  /**
   * El ciclo se programa contra un plazo absoluto y no encadenando `setTimeout`
   * de 1500: cada uno llega unos milisegundos tarde y, al cabo de unos minutos,
   * el retraso se acumulaba. Si la pestaña estuvo oculta y el plazo quedó muy
   * atrás, se retoma desde ahora en vez de disparar los turnos perdidos en fila.
   */
  private programar(accion: () => void, ms: number): void {
    clearTimeout(this.reloj);
    const ahora = performance.now();
    this.plazo += ms;
    if (this.plazo < ahora - 250) this.plazo = ahora + ms;
    this.pendiente = accion;
    this.reloj = setTimeout(
      () => {
        // Fuera de pantalla se queda pendiente y lo retoma `reanudar`.
        if (!this.enPantalla) return;
        this.pendiente = null;
        accion();
      },
      Math.max(0, this.plazo - ahora),
    );
  }

  /** Fuera de pantalla no se gasta nada: ni ciclo ni puntos. */
  private pausar(): void {
    if (!this.iniciado) return;
    clearTimeout(this.reloj);
    this.svg().nativeElement.pauseAnimations?.();
  }

  private reanudar(): void {
    if (this.reducido) return;
    this.svg().nativeElement.unpauseAnimations?.();
    this.plazo = performance.now();
    if (!this.pendiente && this.hechos().every(Boolean)) this.apagarLista();
    const accion = this.pendiente ?? (() => this.turno(this.siguiente));
    this.programar(accion, PASO);
  }

  private parar(): void {
    clearTimeout(this.reloj);
    this.temporizadores.forEach(clearTimeout);
    this.temporizadores = [];
    this.pendiente = null;
  }

  /** El anillo que sale de la foto, del color de la herramienta. */
  private latir(color: string): void {
    const anillo = this.pulso().nativeElement;
    if (typeof anillo.animate !== 'function') return;
    anillo.style.setProperty('--hn-c', color);
    // 150 px de foto + 12 de borde; el anillo crece 26 px por cada lado.
    anillo.animate(
      [
        { transform: 'scale(1)', opacity: 0.85 },
        { transform: `scale(${(162 + 52) / 162})`, opacity: 0 },
      ],
      { duration: 700, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)' },
    );
  }

  /**
   * Los puntos que viajan por los cables.
   *
   * Se crean a mano, con todos sus atributos puestos antes de entrar en el
   * documento: si Angular les pone `dur` o `begin` después, hay navegadores que
   * ya arrancaron la animación con los valores vacíos y no la recalculan.
   */
  private crearPuntos(): void {
    const g = this.puntos().nativeElement;
    const ns = 'http://www.w3.org/2000/svg';

    const punto = (d: string, color: string, dur: number, desfase: number, clase: string) => {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('r', '2');
      c.setAttribute('class', clase);
      c.style.fill = color;
      const m = document.createElementNS(ns, 'animateMotion');
      m.setAttribute('path', d);
      m.setAttribute('dur', `${dur}s`);
      m.setAttribute('begin', `${-desfase}s`);
      m.setAttribute('repeatCount', 'indefinite');
      m.setAttribute('calcMode', 'linear');
      c.appendChild(m);
      g.appendChild(c);
    };

    this.cables.forEach((d, i) => {
      const dur = 2.6 + (i * 0.8) / (HERRAMIENTAS.length - 1);
      const color = HERRAMIENTAS[i].color;
      punto(d, color, dur, i * 0.37, `hn-punto hn-punto-${i}`);
      punto(d, color, dur, i * 0.37 + dur / 2, `hn-punto hn-punto-${i}`);
    });

    const salida = this.salida();
    punto(salida, 'var(--hn-word)', 1.6, 0, 'hn-punto hn-punto-word');
  }

  private limpiarPuntos(): void {
    this.puntos().nativeElement.replaceChildren();
  }

  /** Los puntos del cable activo crecen de 4 a 6 px. */
  private marcarPuntos(i: number): void {
    this.puntos()
      .nativeElement.querySelectorAll<SVGCircleElement>('circle')
      .forEach((c) => {
        if (c.classList.contains('hn-punto-word')) return;
        c.setAttribute('r', c.classList.contains(`hn-punto-${i}`) ? '3' : '2');
      });
  }

  /**
   * La inclinación en 3D, hasta ±5° siguiendo el ratón.
   *
   * Va con escuchas propias y no con `(pointermove)` en la plantilla: cada
   * movimiento del ratón pediría una pasada de detección de cambios para algo
   * que no toca ningún dato. Un solo `requestAnimationFrame` por fotograma.
   */
  private inclinacion(): void {
    if (this.reducido) return;
    const escena = this.escena().nativeElement;
    const lienzo = this.lienzo().nativeElement;
    let cuadro = 0;
    let rx = 0;
    let ry = 0;

    const mover = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = escena.getBoundingClientRect();
      ry = ((e.clientX - r.left) / r.width - 0.5) * 10;
      rx = -((e.clientY - r.top) / r.height - 0.5) * 10;
      if (!cuadro) {
        cuadro = requestAnimationFrame(() => {
          cuadro = 0;
          lienzo.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
        });
      }
    };
    const salir = () => {
      cancelAnimationFrame(cuadro);
      cuadro = 0;
      lienzo.style.transform = '';
    };

    escena.addEventListener('pointermove', mover);
    escena.addEventListener('pointerleave', salir);
    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(cuadro);
      escena.removeEventListener('pointermove', mover);
      escena.removeEventListener('pointerleave', salir);
    });
  }
}
