import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';

/** Un alto del recorrido: a qué se le hace foco y qué se cuenta de ello. */
export interface PasoDelTour {
  /**
   * Selector del elemento que se ilumina. Sin ancla el globo va centrado y no
   * señala nada, que es lo que hace falta para abrir y para cerrar.
   */
  ancla?: string;
  titulo: string;
  texto: string;
  /**
   * Un selector que se pulsa ANTES de enseñar el paso, para que lo que se va a
   * señalar esté a la vista. Casi siempre, la pestaña que lo contiene: enseñar
   * el panel de Zotero sin abrir su pestaña sería iluminar un hueco vacío.
   */
  abrir?: string;
}

/*
 * ─────────────────────────────────────────────────────────────────────────
 * INTERRUPTOR TEMPORAL — quitar cuando se diga
 *
 * Mientras se revisan los recorridos, al ADMINISTRADOR se le enseñan SIEMPRE,
 * entre en la portada o en su panel, lo haya visto ya mil veces o no. Es para
 * poder mirarlos sin tener que borrar el almacenamiento del navegador en cada
 * vuelta.
 *
 * Para apagarlo: poner `false` aquí. No hace falta tocar nada más, y con eso
 * el administrador pasa a verlos una sola vez, como todo el mundo.
 * ─────────────────────────────────────────────────────────────────────────
 */
const SIEMPRE_AL_ADMINISTRADOR = true;

/** Lo que se guarda en el navegador de quien ya lo vio. */
const CLAVE = (nombre: string, usuario: string) => `acosta.tour.${nombre}.${usuario}`;

/**
 * El recorrido guiado del panel.
 *
 * Existe por lo mismo que `PasosDeArranque`, pero un escalón más arriba: aquella
 * lista dice QUÉ FALTA, y no dónde está. Quien entra por primera vez tiene
 * delante su URL, su avance, seis pestañas de herramientas y una tarjeta de
 * ayuda, todo a la vez, y no hay nada que le diga en qué orden mirarlo.
 *
 * SE OFRECE UNA VEZ. `ofrecer()` no hace nada si esa persona ya lo vio o ya lo
 * saltó: un recorrido que vuelve a salir cada vez que entras deja de ser ayuda
 * a la segunda. Repetirlo es cosa suya, desde el botón de la tarjeta de ayuda,
 * y eso sí se puede siempre.
 *
 * La marca de visto vive en el navegador y no en el servidor: equivocarse aquí
 * cuesta un recorrido de más en otro equipo, no un dato perdido, y no merece
 * ni una tabla ni una llamada.
 */
@Injectable({ providedIn: 'root' })
export class TourService {
  private readonly auth = inject(AuthService);

  private readonly pasos = signal<PasoDelTour[]>([]);
  private readonly indice = signal(0);

  /** El nombre del recorrido en curso, para saber qué marcar al terminarlo. */
  private nombre = '';

  readonly activo = computed(() => this.pasos().length > 0);
  readonly paso = computed<PasoDelTour | null>(() => this.pasos()[this.indice()] ?? null);
  readonly numero = computed(() => this.indice() + 1);
  readonly total = computed(() => this.pasos().length);
  readonly esElPrimero = computed(() => this.indice() === 0);
  readonly esElUltimo = computed(() => this.indice() >= this.pasos().length - 1);

  /**
   * Hacia dónde se iba. Lo usa el componente cuando un paso se cae porque su
   * ancla no está: hay que seguir en el mismo sentido en el que se venía, o
   * volver atrás dejaría al visitante rebotando entre dos pasos.
   */
  private readonly sentido = signal<1 | -1>(1);

  /** Empieza ahora, lo haya visto o no. Es el botón de «verlo otra vez». */
  empezar(nombre: string, pasos: PasoDelTour[]): void {
    // Un paso que señala algo que no está en la pantalla no se enseña: se cae
    // aquí, antes de empezar, y así el contador dice la verdad. Quien todavía
    // no tiene tesis abierta no tiene «Por dónde vas» que mirar, y en un
    // teléfono el menú de la cabecera está plegado.
    const vivos = pasos.filter((paso) => this.seVeYa(paso));
    if (vivos.length === 0) return;

    this.nombre = nombre;
    this.sentido.set(1);
    this.indice.set(0);
    this.pasos.set(vivos);
  }

  /**
   * Si el paso se puede enseñar tal y como está la pantalla ahora.
   *
   * No basta con que el elemento exista: el panel de una pestaña cerrada está
   * en el árbol con `hidden`, y el menú de la cabecera se esconde con `display`
   * en un teléfono. Iluminar cualquiera de los dos sería un foco sobre nada.
   *
   * Se libran los pasos que traen `abrir`, que son precisamente los que van a
   * destapar lo suyo cuando les toque el turno.
   */
  private seVeYa(paso: PasoDelTour): boolean {
    if (!paso.ancla) return true;

    const el = document.querySelector<HTMLElement>(paso.ancla);
    if (!el) return false;
    if (paso.abrir) return true;

    // `closest` mira también a los padres: un panel escondido esconde lo suyo.
    if (el.closest('[hidden]')) return false;

    const estilo = getComputedStyle(el);
    return estilo.display !== 'none' && estilo.visibility !== 'hidden';
  }

  /** Lo ofrece solo a quien no lo ha visto nunca. Ver la nota de la clase. */
  ofrecer(nombre: string, pasos: PasoDelTour[]): void {
    if (this.activo() || !this.leToca(nombre)) return;
    this.empezar(nombre, pasos);
  }

  /**
   * Si a quien está mirando le toca ver este recorrido por su cuenta.
   *
   * Lo consultan también las pantallas antes de preparar nada, para no montar
   * una espera que no va a servir de nada. Aquí está el interruptor del
   * administrador: ver la nota de arriba del archivo.
   */
  leToca(nombre: string): boolean {
    if (SIEMPRE_AL_ADMINISTRADOR && this.auth.hasRole('ADMIN')) return true;
    return !this.visto(nombre);
  }

  siguiente(): void {
    if (this.esElUltimo()) {
      this.terminar();
      return;
    }
    this.sentido.set(1);
    this.indice.update((i) => i + 1);
  }

  anterior(): void {
    if (this.esElPrimero()) return;
    this.sentido.set(-1);
    this.indice.update((i) => i - 1);
  }

  /**
   * El paso de ahora no se puede enseñar: se sigue de largo.
   *
   * Lo llama el componente cuando el ancla desapareció entre que empezó el
   * recorrido y le tocó el turno. Si no queda ninguno en ese sentido, se acaba:
   * más vale terminar que quedarse iluminando la nada.
   */
  saltarPaso(): void {
    const siguiente = this.indice() + this.sentido();
    if (siguiente < 0 || siguiente >= this.pasos().length) {
      this.terminar();
      return;
    }
    this.indice.set(siguiente);
  }

  /** Se acabó, por el final o por «Saltar». En los dos casos queda visto. */
  terminar(): void {
    if (this.nombre) this.marcar(this.nombre);
    this.nombre = '';
    this.pasos.set([]);
    this.indice.set(0);
  }

  // ── La marca de visto ──────────────────────────────────────────────────

  /**
   * Por usuario: en un equipo compartido —una sala de cómputo, la laptop de
   * casa— el recorrido del primero no puede darse por visto para el segundo.
   *
   * Quien no ha entrado cuenta como «visitante», uno solo por navegador: el de
   * la portada se le enseña igual, que para eso es la primera pantalla que ve
   * cualquiera. Si luego se crea una cuenta, le saldrá una segunda vez bajo su
   * nombre; no se arregla porque arreglarlo obliga a mezclar lo del visitante
   * con lo de cada persona, y entonces el primero que entra en un equipo
   * compartido se lo quita a todos los demás.
   */
  private clave(nombre: string): string {
    return CLAVE(nombre, this.auth.user()?.id ?? 'visitante');
  }

  visto(nombre: string): boolean {
    const clave = this.clave(nombre);
    try {
      return localStorage.getItem(clave) !== null;
    } catch {
      // Navegación privada o almacenamiento bloqueado: se da por visto. Es
      // preferible a repetirlo en cada entrada sin poder callarlo nunca.
      return true;
    }
  }

  private marcar(nombre: string): void {
    const clave = this.clave(nombre);
    try {
      localStorage.setItem(clave, new Date().toISOString());
    } catch {
      // Si no se puede guardar, no pasa nada: se ofrecerá otra vez.
    }
  }
}
