import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { mensajeDeError } from '../../core/http/api-error';
import { DialogoService } from '../../core/services/dialogo.service';
import {
  InscritoSorteo,
  ResultadoSorteo,
  Sorteo,
  SorteoService,
} from '../../core/services/sorteo.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

/** Lo que tarda la ruleta en pararse. */
const GIRO_MS = 6500;
/** Vueltas completas antes de caer en el elegido. */
const VUELTAS_DE_RUEDA = 7;
/** Con más porciones que estas, los nombres no caben y la rueda va sin texto. */
const MAX_ETIQUETAS = 40;
/** Radio de la rueda, en unidades del SVG (caja de 200×200). */
const R = 96;

/** Colores de las porciones. Texto blanco encima en los dos temas. */
const COLORES = ['#1d4ed8', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#0369a1', '#15803d', '#a21caf'];

/** Una porción de la rueda, ya calculada para pintarla. */
interface Porcion {
  d: string;
  color: string;
  etiqueta: string;
  /** Giro del texto: el centro de la porción. */
  angulo: number;
}

/** Punto en la circunferencia, con 0° arriba y en el sentido del reloj. */
function punto(grados: number, radio = R): [number, number] {
  const rad = ((grados - 90) * Math.PI) / 180;
  return [100 + radio * Math.cos(rad), 100 + radio * Math.sin(rad)];
}

/** Lo que se lee en la porción: el nombre, o lo de antes de la arroba. */
function etiquetaDe(p: InscritoSorteo): string {
  const base = p.nombre.trim() || p.email.split('@')[0];
  return base.length > 14 ? `${base.slice(0, 13)}…` : base;
}

/** Quién es, para los textos: «Ana · ana@gmail.com». */
function quien(p: InscritoSorteo): string {
  return p.nombre ? `${p.nombre} · ${p.email}` : p.email;
}

/**
 * Los sorteos en el panel: crear uno, compartir su enlace, ver quién se apuntó
 * y girar la ruleta.
 *
 * Son tres vueltas y el administrador pulsa «Girar» en cada una: las dos
 * primeras eliminan a alguien y la tercera da el ganador. Nada de eso se decide
 * aquí: el servidor elige en cada vuelta y esta pantalla recibe la posición del
 * elegido y anima la rueda hasta él. Así recargar a mitad de giro, o tocar el
 * navegador, no cambia el resultado.
 *
 * El código del premio tampoco llega entero: el panel lo enseña con los cuatro
 * últimos caracteres tapados y solo el ganador lo recibe completo, por correo.
 *
 * Componente aparte, como WhatsApp: la hoja de estilos del panel ya roza el
 * tope de la compilación.
 */
@Component({
  selector: 'app-sorteos-admin',
  imports: [AvisoFlotante, DatePipe, FormsModule],
  templateUrl: './sorteos.html',
  styleUrl: './sorteos.css',
})
export class SorteosAdmin implements OnInit, OnDestroy {
  private readonly api = inject(SorteoService);
  private readonly dialogos = inject(DialogoService);

  readonly sorteos = signal<Sorteo[]>([]);
  readonly abierto = signal<Sorteo | null>(null);
  readonly cargando = signal(true);
  readonly creando = signal(false);
  readonly reenviando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  /** Desde que se pulsa «Girar» hasta que la rueda se para: apaga los botones. */
  readonly girando = signal(false);
  /** Solo mientras la rueda se mueve: es lo que enciende la transición. */
  private readonly animando = signal(false);
  readonly rotacion = signal(0);
  /** Lo que salió en la última vuelta, para enseñarlo al pararse. */
  readonly resultado = signal<ResultadoSorteo | null>(null);
  /** El código tapado del ganador, tras sortear o reenviar. */
  readonly codigoOculto = signal<string | null>(null);
  /** La lista que pinta la rueda desde que gira hasta la vuelta siguiente. */
  private readonly ruedaFija = signal<InscritoSorteo[] | null>(null);
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  nombreNuevo = 'Sorteo: matrícula de tesis por 3 meses';

  readonly quien = quien;

  /** Los que siguen dentro: ni eliminados ni, claro, el sorteo terminado. */
  readonly enJuego = computed(
    () => this.abierto()?.participantes?.filter((p) => p.eliminadoEn === null) ?? [],
  );

  /** Los eliminados, en el orden en que salieron. */
  readonly eliminados = computed(() =>
    (this.abierto()?.participantes ?? [])
      .filter((p) => p.eliminadoEn !== null)
      .sort((a, b) => (a.eliminadoEn ?? 0) - (b.eliminadoEn ?? 0)),
  );

  /** Quiénes están en la rueda. */
  readonly enRueda = computed(() => this.ruedaFija() ?? this.enJuego());

  /** La vuelta que toca y si es la que da el ganador. */
  readonly siguiente = computed(() => {
    const s = this.abierto();
    if (!s) return null;
    const numero = s.ronda + 1;
    const final = numero >= s.vueltas || this.enJuego().length <= 1;
    return { numero, final };
  });

  readonly porciones = computed<Porcion[]>(() => {
    const lista = this.enRueda();
    const n = lista.length;
    if (n < 2) return [];
    const paso = 360 / n;
    return lista.map((p, i) => {
      const [x1, y1] = punto(i * paso);
      const [x2, y2] = punto((i + 1) * paso);
      const grande = paso > 180 ? 1 : 0;
      return {
        d: `M100 100 L${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 ${grande} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`,
        // Con un número impar de porciones, la última no repite color con la primera.
        color: COLORES[(i === n - 1 && n % COLORES.length === 1 ? 2 : i) % COLORES.length],
        etiqueta: n <= MAX_ETIQUETAS ? etiquetaDe(p) : '',
        angulo: i * paso + paso / 2,
      };
    });
  });

  /** Tamaño del texto: cuanto más porciones, más pequeño. */
  readonly tamanoEtiqueta = computed(() => {
    const n = this.enRueda().length;
    return n <= 8 ? 8 : n <= 16 ? 6.5 : n <= 28 ? 5 : 4;
  });

  readonly transicion = computed(() =>
    this.animando() ? `transform ${GIRO_MS}ms cubic-bezier(0.12, 0.7, 0.12, 1)` : 'none',
  );

  ngOnInit(): void {
    this.cargar();
  }

  ngOnDestroy(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
  }

  cargar(elegir?: string): void {
    this.api.listar().subscribe({
      next: (sorteos) => {
        this.sorteos.set(sorteos);
        this.cargando.set(false);
        const id = elegir ?? this.abierto()?.id ?? sorteos[0]?.id;
        if (id) this.abrir(id);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  abrir(id: string): void {
    if (this.girando()) return;
    this.api.ver(id).subscribe({
      next: (sorteo) => {
        if (this.abierto()?.id !== sorteo.id) {
          this.resultado.set(null);
          this.codigoOculto.set(null);
          this.ruedaFija.set(null);
          this.rotacion.set(0);
        }
        this.abierto.set(sorteo);
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  crear(): void {
    const nombre = this.nombreNuevo.trim();
    if (nombre.length < 3 || this.creando()) return;
    this.creando.set(true);
    this.api.crear(nombre).subscribe({
      next: (sorteo) => {
        this.creando.set(false);
        this.aviso.set('Sorteo creado. Copia el enlace y compártelo.');
        this.cargar(sorteo.id);
      },
      error: (e: unknown) => {
        this.creando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  async copiar(texto: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.aviso.set('Enlace copiado.');
    } catch {
      this.error.set('No se pudo copiar. Selecciónalo y cópialo a mano.');
    }
  }

  cambiarInscripciones(sorteo: Sorteo): void {
    this.api.cambiar(sorteo.id, !sorteo.abierto).subscribe({
      next: (cambiado) => {
        this.abierto.set(cambiado);
        this.reemplazar(cambiado);
        this.aviso.set(cambiado.abierto ? 'Inscripciones abiertas.' : 'Inscripciones cerradas.');
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  async quitar(sorteo: Sorteo, inscrito: InscritoSorteo): Promise<void> {
    const seguro = await this.dialogos.confirmar({
      titulo: `Quitar a ${inscrito.email}`,
      mensaje: 'Sale del sorteo. Si vuelve a abrir el enlace, puede apuntarse otra vez.',
      confirmar: 'Quitar',
      tono: 'peligro',
    });
    if (!seguro) return;
    this.api.quitarInscrito(sorteo.id, inscrito.id).subscribe({
      next: (cambiado) => {
        this.abierto.set(cambiado);
        this.reemplazar(cambiado);
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  async borrar(sorteo: Sorteo): Promise<void> {
    const seguro = await this.dialogos.confirmar({
      titulo: `Borrar «${sorteo.nombre}»`,
      mensaje: `Se borran el sorteo y sus ${sorteo.inscritos} inscritos. El enlace deja de funcionar.`,
      nota: sorteo.ganador
        ? 'El código que ya recibió el ganador sigue valiendo: se anula desde Accesos.'
        : undefined,
      confirmar: 'Borrar',
      tono: 'peligro',
    });
    if (!seguro) return;
    this.api.borrar(sorteo.id).subscribe({
      next: () => {
        this.abierto.set(null);
        this.resultado.set(null);
        this.codigoOculto.set(null);
        this.aviso.set('Sorteo borrado.');
        this.cargar();
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  /**
   * Una vuelta. Solo la primera pide confirmación, porque es la que cierra las
   * inscripciones; las siguientes las pide el propio administrador al pulsar.
   */
  async girar(sorteo: Sorteo): Promise<void> {
    if (this.girando()) return;
    if (sorteo.ronda === 0) {
      const seguro = await this.dialogos.confirmar({
        titulo: 'Empezar el sorteo',
        mensaje:
          `Son ${sorteo.vueltas} vueltas entre los ${sorteo.inscritos} inscritos: las ` +
          `${sorteo.vueltas - 1} primeras eliminan a alguien y la última da el ganador, que ` +
          `recibe al instante por correo su código de ${sorteo.premio}.`,
        nota: 'Al girar la primera se cierran las inscripciones. No se puede repetir.',
        confirmar: 'Girar la primera',
      });
      if (!seguro) return;
    }

    // La rueda vuelve a cero sin animación y ya sin el que salió en la vuelta anterior.
    this.ruedaFija.set(null);
    this.rotacion.set(0);
    this.resultado.set(null);
    this.girando.set(true);
    this.api.sortear(sorteo.id).subscribe({
      next: (resultado) => this.animar(resultado),
      error: (e: unknown) => {
        this.girando.set(false);
        this.error.set(mensajeDeError(e));
        this.abrir(sorteo.id);
      },
    });
  }

  /**
   * Lleva la rueda hasta el elegido.
   *
   * La porción `i` ocupa de `i·paso` a `(i+1)·paso` contando desde arriba; la
   * flecha está arriba, en 0°. Girar la rueda R grados deja bajo la flecha lo
   * que estaba en −R, así que para caer en el centro de la porción (con un
   * pequeño desvío que no la saque de ella) hay que llegar a −centro.
   */
  private animar(resultado: ResultadoSorteo): void {
    this.ruedaFija.set(resultado.participantes);
    const n = resultado.participantes.length;
    const paso = 360 / n;
    const desvio = (Math.random() - 0.5) * paso * 0.6;
    const destino = (360 - (resultado.indice * paso + paso / 2 + desvio)) % 360;
    const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const espera = n < 2 || reducir ? 300 : GIRO_MS;

    // Dos fotogramas: uno para pintar la rueda nueva en cero, otro para lanzarla.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        this.animando.set(true);
        this.rotacion.set(VUELTAS_DE_RUEDA * 360 + destino);
        this.temporizador = setTimeout(() => this.alPararse(resultado), espera);
      }),
    );
  }

  private alPararse(resultado: ResultadoSorteo): void {
    this.animando.set(false);
    this.girando.set(false);
    this.resultado.set(resultado);
    this.abierto.set(resultado.sorteo);
    this.reemplazar(resultado.sorteo);

    if (resultado.tipo === 'ELIMINADO') {
      this.aviso.set(`Vuelta ${resultado.ronda}: queda fuera ${resultado.eliminado.email}.`);
      return;
    }

    this.codigoOculto.set(resultado.codigoOculto);
    if (resultado.correoEnviado) {
      this.aviso.set(`¡Ganó ${resultado.ganador.email}! Ya le llegó su código por correo.`);
    } else {
      this.error.set(
        `Ganó ${resultado.ganador.email}, pero el correo no salió. Pulsa «Reenviar el código».`,
      );
    }
  }

  async reenviar(sorteo: Sorteo): Promise<void> {
    if (this.reenviando() || !sorteo.ganador) return;
    const seguro = await this.dialogos.confirmar({
      titulo: 'Reenviar el código',
      mensaje: `Se anula el código anterior y le mandamos uno nuevo a ${sorteo.ganador.email}.`,
      nota: 'Si ya lo canjeó, no se manda nada: ya tiene su matrícula.',
      confirmar: 'Reenviar',
    });
    if (!seguro) return;

    this.reenviando.set(true);
    this.api.reenviar(sorteo.id).subscribe({
      next: (r) => {
        this.reenviando.set(false);
        this.codigoOculto.set(r.codigoOculto);
        this.abierto.set(r.sorteo);
        this.reemplazar(r.sorteo);
        if (r.correoEnviado) {
          this.aviso.set(`Le mandamos un código nuevo a ${r.ganador.email}.`);
        } else {
          this.error.set('El correo tampoco salió esta vez. Inténtalo en un rato.');
        }
      },
      error: (e: unknown) => {
        this.reenviando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  duracion(dias: number): string {
    if (dias <= 0) return 'sin caducidad';
    if (dias % 30 === 0) return dias === 30 ? '1 mes' : `${dias / 30} meses`;
    return `${dias} días`;
  }

  private reemplazar(sorteo: Sorteo): void {
    this.sorteos.update((lista) =>
      lista.map((s) => (s.id === sorteo.id ? { ...sorteo, participantes: undefined } : s)),
    );
  }
}
