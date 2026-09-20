import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';

import { mensajeDeError } from '../../core/http/api-error';
import {
  AsesorPublico,
  EstadoDePedido,
  PASO_DEL_PEDIDO,
  PedidoService,
  Seguimiento,
} from '../../core/services/pedido.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/** Los tres pasos que ve el tesista. RECHAZADO y CANCELADO son desvíos. */
const PASOS: { estado: EstadoDePedido; titulo: string }[] = [
  { estado: 'ESPERANDO', titulo: 'Esperando a tu asesor' },
  { estado: 'EN_REVISION', titulo: 'En revisión' },
  { estado: 'ENTREGADO', titulo: 'Entregado' },
];

/**
 * El seguimiento de un pedido: /pedido/<codigo>.
 *
 * POR QUÉ EXISTE
 * --------------
 * Sin esto, el tesista manda su capítulo y se queda a ciegas hasta que alguien
 * se acuerde de escribirle. Lo que hace un servicio distinto de un formulario
 * al vacío es poder volver a mirar en qué va.
 *
 * Y ES DONDE SE SALE DE UN RECHAZO
 * --------------------------------
 * Si su asesor no pudo tomarlo, aquí mismo elige a otro —sin el que le dijo que
 * no— y sin volver a subir nada. Ese es el momento en que alguien se iría a otra
 * parte si le tocara empezar de cero por algo que no hizo él.
 *
 * El código es la llave y no hace falta cuenta. Lleva `noindex`: una página con
 * el nombre y la universidad de alguien no tiene nada que hacer en un buscador.
 */
@Component({
  selector: 'app-pedido',
  imports: [DatePipe, SiteHeader, SiteFooter],
  templateUrl: './pedido.html',
  styleUrl: './pedido.css',
})
export class PedidoSeguimiento implements OnInit, OnDestroy {
  private readonly api = inject(PedidoService);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  readonly pedido = signal<Seguimiento | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  /** Lo que se escribe cuando se llega sin código en la URL. */
  readonly escrito = signal('');

  /** Los asesores entre los que puede elegir tras un rechazo. */
  readonly otros = signal<AsesorPublico[]>([]);
  readonly eligiendo = signal(false);
  readonly guardando = signal(false);

  /** La calificación, mientras la escribe. */
  readonly estrellasPuestas = signal(0);
  readonly comentario = signal('');

  readonly pasos = PASOS;
  readonly paso = PASO_DEL_PEDIDO;

  /** En qué punto de los tres está. -1 = se salió del camino. */
  readonly avance = computed(() => {
    const estado = this.pedido()?.estado;
    if (!estado) return -1;
    return PASOS.findIndex((uno) => uno.estado === estado);
  });

  ngOnInit(): void {
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });

    const codigo = this.ruta.snapshot.paramMap.get('codigo');
    if (codigo) this.buscar(codigo);
  }

  ngOnDestroy(): void {
    this.meta.removeTag("name='robots'");
  }

  escribir(evento: Event): void {
    this.escrito.set((evento.target as HTMLInputElement).value.trim().toLowerCase());
  }

  escribirComentario(evento: Event): void {
    this.comentario.set((evento.target as HTMLTextAreaElement).value);
  }

  /** Buscar desde el recuadro cambia la URL: así el enlace queda guardable. */
  buscarEscrito(): void {
    const codigo = this.escrito();
    if (codigo.length < 6) return;
    void this.router.navigate(['/pedido', codigo]);
    this.buscar(codigo);
  }

  private buscar(codigo: string): void {
    this.cargando.set(true);
    this.error.set(null);

    this.api.seguimiento(codigo).subscribe({
      next: (pedido) => {
        this.pedido.set(pedido);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.pedido.set(null);
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  // ── Salir de un rechazo ──────────────────────────────────────────────────

  verOtros(): void {
    const pedido = this.pedido();
    if (!pedido) return;

    this.eligiendo.set(true);
    this.api.directorioParaPedido(pedido.codigo).subscribe({
      next: (lista) => this.otros.set(lista),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  elegir(asesor: AsesorPublico): void {
    const pedido = this.pedido();
    if (!pedido || this.guardando()) return;

    this.guardando.set(true);
    this.error.set(null);

    this.api.reasignar(pedido.codigo, asesor.id).subscribe({
      next: (guardado) => {
        this.guardando.set(false);
        this.eligiendo.set(false);
        this.pedido.set(guardado);
        this.aviso.set(`Listo, se lo mandamos a ${asesor.nombre}.`);
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  // ── Calificar ────────────────────────────────────────────────────────────

  poner(estrellas: number): void {
    this.estrellasPuestas.set(estrellas);
  }

  calificar(): void {
    const pedido = this.pedido();
    const estrellas = this.estrellasPuestas();
    if (!pedido || estrellas < 1 || this.guardando()) return;

    this.guardando.set(true);
    this.error.set(null);

    this.api.resenar(pedido.codigo, estrellas, this.comentario().trim()).subscribe({
      next: (guardado) => {
        this.guardando.set(false);
        this.pedido.set(guardado);
        this.aviso.set('Gracias. Tu opinión ayuda al siguiente tesista a elegir.');
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  estrellas(valor: number): string {
    const llenas = Math.round(valor);
    return '★★★★★'.slice(0, llenas) + '☆☆☆☆☆'.slice(0, 5 - llenas);
  }

  nota(valor: number): string {
    return valor.toFixed(1).replace('.', ',');
  }
}
