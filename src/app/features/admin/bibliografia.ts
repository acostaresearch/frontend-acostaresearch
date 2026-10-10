import { DestroyRef, WritableSignal, computed, inject, signal } from '@angular/core';
import { FormControl } from '@angular/forms';

import { EstadoCorpus, Referencia, ReferenceService } from '../../core/services/reference.service';

/**
 * Estado y operaciones de la bibliografía del administrador.
 * Se crea dentro del contexto de inyección del panel y comparte sus avisos.
 * El temporizador conserva el mismo ciclo de vida que el administrador.
 */
export class BibliografiaAdmin {
  constructor(
    private readonly error: WritableSignal<string | null>,
    private readonly aviso: WritableSignal<string | null>,
  ) {}

  private readonly referenciasApi = inject(ReferenceService);

  /** `null` mientras no se ha abierto la pestaña ni una vez. */
  readonly corpus = signal<EstadoCorpus | null>(null);
  readonly referencias = signal<Referencia[]>([]);

  /**
   * Las fuentes con los temas desplegados. Una lista de veinte palabras clave
   * ocupaba tres líneas por fuente; se recorta a una con «ver N temas».
   */
  readonly temasAbiertos = signal<ReadonlySet<string>>(new Set());

  /** Cuántos temas trae una fuente: van separados por comas. */
  cuantosTemas(tags: string): number {
    return tags.split(',').filter((t) => t.trim()).length;
  }

  alternarTemas(id: string): void {
    this.temasAbiertos.update((abiertos) => {
      const nuevos = new Set(abiertos);
      if (nuevos.has(id)) nuevos.delete(id);
      else nuevos.add(id);
      return nuevos;
    });
  }
  readonly totalReferencias = signal(0);
  readonly paginaReferencias = signal(1);
  readonly buscadorCorpus = new FormControl<string>({ value: '', disabled: false });

  /** El temporizador que va preguntando cómo va la pasada. */
  private vigilanteDelCorpus: ReturnType<typeof setInterval> | null = null;

  // Al salir del panel el temporizador tiene que morir con él: si no, sigue
  // pidiendo el estado desde una pantalla que ya no existe.
  private readonly alDestruir = inject(DestroyRef).onDestroy(() => this.pararVigilanteDelCorpus());

  readonly sincronizando = computed(() => this.corpus()?.trabajo?.activo === true);

  /** «1.200 de 24.006» mientras trabaja, para que no parezca colgado. */
  readonly avanceDelCorpus = computed(() => {
    const trabajo = this.corpus()?.trabajo;
    if (!trabajo?.activo) return '';

    const fase =
      trabajo.fase === 'notas'
        ? 'Leyendo las notas'
        : trabajo.fase === 'retiradas'
          ? 'Retirando lo borrado en Zotero'
          : 'Leyendo las fuentes';

    if (trabajo.total === 0) return `${fase}…`;
    return `${fase}: ${trabajo.hechas.toLocaleString('es-PE')} de ${trabajo.total.toLocaleString('es-PE')}`;
  });

  cargarCorpus(pagina = 1): void {
    this.paginaReferencias.set(pagina);

    this.referenciasApi.estado().subscribe({
      next: (estado) => {
        this.corpus.set(estado);
        // Una pasada completa son unas 450 peticiones a Zotero y varios
        // minutos. Si al abrir el panel ya hay uno en marcha —lo arrancó otra
        // pestaña, o se recargó esta—, se sigue mirando sin volver a lanzarlo.
        if (estado.trabajo?.activo) this.vigilarCorpus();
      },
      error: () => this.error.set('No pudimos leer el estado del corpus.'),
    });

    this.referenciasApi.listar({ pagina, texto: this.buscadorCorpus.value ?? '' }).subscribe({
      next: (datos) => {
        this.referencias.set(datos.filas);
        this.totalReferencias.set(datos.total);
      },
      error: () => this.error.set('No pudimos leer la bibliografía.'),
    });
  }

  /**
   * Pregunta cada tres segundos hasta que la pasada termina.
   *
   * Se para sola y también al salir del panel: un temporizador que sobrevive al
   * componente sigue pegándole a la API desde una pantalla que ya no existe.
   */
  private vigilarCorpus(): void {
    if (this.vigilanteDelCorpus) return;

    this.vigilanteDelCorpus = setInterval(() => {
      this.referenciasApi.estado().subscribe({
        next: (estado) => {
          this.corpus.set(estado);
          if (estado.trabajo?.activo) return;

          this.pararVigilanteDelCorpus();
          if (estado.trabajo?.error) this.error.set(`Zotero: ${estado.trabajo.error}`);
          else {
            this.aviso.set(
              `Corpus al día: ${estado.total.toLocaleString('es-PE')} fuentes` +
                (estado.trabajo?.retiradas ? `, ${estado.trabajo.retiradas} retiradas` : '') +
                '.',
            );
          }
          this.cargarCorpus(1);
        },
        error: () => this.pararVigilanteDelCorpus(),
      });
    }, 3000);
  }

  private pararVigilanteDelCorpus(): void {
    if (!this.vigilanteDelCorpus) return;
    clearInterval(this.vigilanteDelCorpus);
    this.vigilanteDelCorpus = null;
  }

  /**
   * Arranca una pasada. Vuelve enseguida: el trabajo sigue en el servidor.
   *
   * La pasada completa está a un clic aparte y no como comportamiento normal:
   * son unas 450 peticiones a Zotero, y Zotero las cuenta POR CUENTA. La cuenta
   * es una sola y sirve a todos los clientes a la vez, así que gastarlas por
   * costumbre acabaría bloqueando el corpus para todo el mundo.
   */
  sincronizarCorpus(completa = false): void {
    if (this.sincronizando()) return;

    this.error.set(null);
    this.aviso.set(null);

    this.referenciasApi.sincronizar(completa).subscribe({
      next: ({ arranque, mensaje }) => {
        this.corpus.update((estado) => (estado ? { ...estado, trabajo: arranque } : estado));
        this.aviso.set(mensaje);
        this.vigilarCorpus();
      },
      error: (fallo) =>
        this.error.set(
          fallo?.error?.message ?? 'No pudimos sincronizar con Zotero. Mira el log del servidor.',
        ),
    });
  }

  /** Cómo se lee una fuente sin producto: la ven todas las licencias. */
  productosDe(referencia: Referencia): string {
    if (referencia.groups.length === 0) return 'Todas';
    return referencia.groups.map((g) => g.productCode).join(', ');
  }
}
