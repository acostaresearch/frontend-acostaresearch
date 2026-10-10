import { WritableSignal, computed, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../core/http/api-error';
import { Reclamo, ReclamoService } from '../../core/services/reclamo.service';
import { ResenaDelPanel, ResenaService } from '../../core/services/resena.service';
import { Asesor, AsesorService } from '../../core/services/asesor.service';
import { Pedido, PedidoService } from '../../core/services/pedido.service';

/** Listas y contadores de atención y revisión; los componentes de cada área deciden sus acciones. */
export class SeguimientoAdmin {
  constructor(
    private readonly error: WritableSignal<string | null>,
    private readonly aviso: WritableSignal<string | null>,
  ) {}

  // ── Libro de Reclamaciones ───────────────────────────────────────────────
  //
  // La lista y el contador viven aquí; pintarla y responder, en `ReclamosAdmin`.

  private readonly reclamosApi = inject(ReclamoService);

  readonly reclamos = signal<Reclamo[]>([]);
  readonly reclamosPendientes = computed(() => this.reclamos().filter((r) => !r.respondido).length);

  /**
   * `avisarSiFalla` en false al entrar al panel: ahí es solo el contador, y un
   * fallo suyo no puede tapar con un error rojo lo que se venía a mirar.
   */
  cargarReclamos(avisarSiFalla = true): void {
    this.reclamosApi.listar().subscribe({
      next: (lista) => this.reclamos.set(lista),
      error: (e: unknown) => {
        if (avisarSiFalla) this.error.set(mensajeDeError(e));
      },
    });
  }

  reclamoRespondido(mensaje: string): void {
    this.aviso.set(mensaje);
    this.cargarReclamos();
  }

  // ── Reseñas del servicio ─────────────────────────────────────────────────
  //
  // La lista y el contador viven aquí; pintarla, filtrarla y decidir, en
  // `ResenasAdmin`. La lista llega entera y allí se filtra: son pocas y así las
  // pestañas cambian sin un viaje al servidor por cada clic.

  private readonly resenasApi = inject(ResenaService);

  readonly resenas = signal<ResenaDelPanel[]>([]);
  readonly resenasPendientes = computed(
    () => this.resenas().filter((r) => r.estado === 'PENDIENTE').length,
  );

  /** `avisarSiFalla` en false al entrar, igual que las hojas del libro. */
  cargarResenas(avisarSiFalla = true): void {
    this.resenasApi.listar('TODAS').subscribe({
      next: ({ resenas }) => this.resenas.set(resenas),
      error: (e: unknown) => {
        if (avisarSiFalla) this.error.set(mensajeDeError(e));
      },
    });
  }

  resenaCambiada(mensaje: string): void {
    this.aviso.set(mensaje);
    this.cargarResenas();
  }

  // ── Asesores ─────────────────────────────────────────────────────────────
  //
  // La lista y el contador viven aquí; las convocatorias, la ventana y las
  // decisiones, en `AsesoresAdmin`.

  private readonly asesoresApi = inject(AsesorService);

  readonly asesores = signal<Asesor[]>([]);
  readonly asesoresPendientes = computed(
    () => this.asesores().filter((a) => a.estado === 'PENDIENTE').length,
  );

  /** `avisarSiFalla` en false al entrar, como el libro: ahí es solo el contador. */
  cargarAsesores(avisarSiFalla = true): void {
    this.asesoresApi.listar().subscribe({
      next: (lista) => this.asesores.set(lista),
      error: (e: unknown) => {
        if (avisarSiFalla) this.error.set(mensajeDeError(e));
      },
    });
  }

  asesorCambiado(mensaje: string): void {
    this.aviso.set(mensaje);
    this.cargarAsesores();
  }

  // ── Revisiones ───────────────────────────────────────────────────────────
  //
  // La lista y el contador viven aquí; el tablero y la ventana, en
  // `PedidosAdmin`.

  private readonly pedidosApi = inject(PedidoService);

  readonly pedidos = signal<Pedido[]>([]);
  /**
   * Los que esperan que su asesor conteste.
   *
   * No son trabajo tuyo —contestar es de él—, pero son los que pueden pudrirse:
   * al otro lado hay un tesista mirando su seguimiento. El contador está para
   * que se vea sin entrar, y para saber a quién hay que dar un toque.
   */
  readonly pedidosEsperando = computed(
    () => this.pedidos().filter((p) => p.estado === 'ESPERANDO').length,
  );

  cargarPedidos(avisarSiFalla = true): void {
    this.pedidosApi.listar().subscribe({
      next: (lista) => this.pedidos.set(lista),
      error: (e: unknown) => {
        if (avisarSiFalla) this.error.set(mensajeDeError(e));
      },
    });
  }

  pedidoCambiado(mensaje: string): void {
    this.aviso.set(mensaje);
    this.cargarPedidos();
  }
}
