import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';

import { mensajeDeError } from '../../core/http/api-error';
import {
  EstadoDePedido,
  PASO_DEL_PEDIDO,
  PedidoService,
  Seguimiento,
} from '../../core/services/pedido.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/** Los tres pasos que ve el tesista, en orden. CANCELADO no es un paso. */
const PASOS: { estado: EstadoDePedido; titulo: string }[] = [
  { estado: 'RECIBIDO', titulo: 'Recibido' },
  { estado: 'EN_REVISION', titulo: 'En revisión' },
  { estado: 'ENTREGADO', titulo: 'Entregado' },
];

/**
 * El seguimiento de un pedido: /pedido/<codigo>.
 *
 * POR QUÉ EXISTE
 * --------------
 * Sin esto, el tesista manda su capítulo a un formulario y se queda a ciegas
 * hasta que alguien se acuerde de escribirle. Lo que hace un servicio distinto
 * de un formulario al vacío es poder volver a mirar en qué va.
 *
 * El código es la llave y no hace falta cuenta, como los enlaces de subida que
 * reparte el conector. Lleva `noindex`: una página con el nombre y la
 * universidad de alguien no tiene nada que hacer en un buscador.
 *
 * Sin código en la URL se pide, para quien perdió el enlace pero apuntó el
 * código.
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
  /** Lo que se escribe cuando se llega sin código en la URL. */
  readonly escrito = signal('');

  readonly pasos = PASOS;
  readonly paso = PASO_DEL_PEDIDO;

  /** En qué punto de los tres está, para pintar la barra. -1 = cancelado. */
  readonly avance = computed(() => {
    const estado = this.pedido()?.estado;
    if (!estado || estado === 'CANCELADO') return -1;
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
}
