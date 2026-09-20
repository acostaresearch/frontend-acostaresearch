import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';

import { mensajeDeError } from '../../core/http/api-error';
import { Convocatoria } from '../../core/services/asesor.service';
import {
  EstadoDePedido,
  NOMBRE_DEL_ESTADO_PEDIDO,
  Pedido,
  PedidoService,
} from '../../core/services/pedido.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

/**
 * Las revisiones, en el panel de la casa.
 *
 * ESTO ES UN MIRADOR, NO UN REPARTIDOR
 * ------------------------------------
 * El tesista elige a su asesor y el encargo le llega directo; quien acepta,
 * revisa y entrega es el asesor. Aquí no se asigna ni se entrega nada: se ve
 * cómo va todo, se anota lo que haga falta recordar y se puede parar un pedido
 * que se torció. Meter aquí un paso obligatorio sería volver a poner a la casa
 * en medio de una decisión que no es suya.
 *
 * Arriba sigue estando la puerta: el enlace que se reparte y los dos
 * interruptores que deciden quién llega a él.
 */
@Component({
  imports: [AvisoFlotante, DatePipe],
  selector: 'app-pedidos-admin',
  templateUrl: './pedidos.html',
  styleUrl: './pedidos.css',
})
export class PedidosAdmin implements OnInit {
  private readonly api = inject(PedidoService);

  /** La lista la carga el panel, que necesita el contador lateral. */
  readonly pedidos = input.required<Pedido[]>();
  readonly cambiado = output<string>();

  readonly nombreDelEstado = NOMBRE_DEL_ESTADO_PEDIDO;

  readonly convocatorias = signal<Convocatoria[]>([]);
  readonly abierto = signal<Pedido | null>(null);
  readonly filtro = signal<EstadoDePedido | 'TODOS'>('ESPERANDO');
  readonly guardando = signal(false);
  readonly bajando = signal(false);
  readonly error = signal<string | null>(null);

  readonly notas = signal('');

  readonly nombreNuevo = signal('');
  readonly introNueva = signal('');
  readonly creando = signal(false);
  readonly copiada = signal<string | null>(null);

  readonly filtros: { codigo: EstadoDePedido | 'TODOS'; nombre: string }[] = [
    { codigo: 'ESPERANDO', nombre: 'Esperando respuesta' },
    { codigo: 'EN_REVISION', nombre: 'En revisión' },
    { codigo: 'ENTREGADO', nombre: 'Entregados' },
    { codigo: 'RECHAZADO', nombre: 'Sin asesor' },
    { codigo: 'TODOS', nombre: 'Todos' },
  ];

  readonly visibles = computed(() => {
    const filtro = this.filtro();
    const lista = this.pedidos();
    return filtro === 'TODOS' ? lista : lista.filter((pedido) => pedido.estado === filtro);
  });

  cuantos(codigo: EstadoDePedido | 'TODOS'): number {
    const lista = this.pedidos();
    return codigo === 'TODOS' ? lista.length : lista.filter((p) => p.estado === codigo).length;
  }

  /**
   * Cuánto lleva esperando sin que su asesor conteste.
   *
   * Es el único número que pide una intervención: al otro lado hay alguien
   * mirando su seguimiento, y un encargo parado dos días es un tesista que
   * empieza a pensar que esto no funciona.
   */
  diasEsperando(pedido: Pedido): number {
    const desde = new Date(pedido.asignadoAt ?? pedido.createdAt).getTime();
    return Math.floor((Date.now() - desde) / (24 * 60 * 60 * 1000));
  }

  ngOnInit(): void {
    this.cargarConvocatorias();
  }

  cargarConvocatorias(): void {
    this.api.convocatorias().subscribe({
      next: (lista) => this.convocatorias.set(lista),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  escribir(senal: 'nombreNuevo' | 'introNueva' | 'notas', evento: Event): void {
    this[senal].set((evento.target as HTMLInputElement | HTMLTextAreaElement).value);
  }

  // ── La puerta ────────────────────────────────────────────────────────────

  crear(): void {
    const nombre = this.nombreNuevo().trim();
    if (nombre.length < 3 || this.creando()) return;

    this.creando.set(true);
    this.error.set(null);

    this.api.crearConvocatoria(nombre, this.introNueva().trim()).subscribe({
      next: (convocatoria) => {
        this.creando.set(false);
        this.nombreNuevo.set('');
        this.introNueva.set('');
        this.convocatorias.update((lista) => [convocatoria, ...lista]);
        this.cambiado.emit('Enlace creado. Cópialo y repártelo a mano.');
      },
      error: (e: unknown) => {
        this.creando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  copiar(convocatoria: Convocatoria): void {
    void navigator.clipboard.writeText(convocatoria.url).then(
      () => {
        this.copiada.set(convocatoria.id);
        setTimeout(() => this.copiada.set(null), 2500);
      },
      () => this.error.set('No se pudo copiar. Selecciona el enlace y cópialo a mano.'),
    );
  }

  cerrarOAbrir(convocatoria: Convocatoria): void {
    this.cambiarPuerta(convocatoria, { abierta: !convocatoria.abierta });
  }

  /** Se pregunta antes: es el único cambio de esta pantalla que se ve desde fuera. */
  publicarOEsconder(convocatoria: Convocatoria): void {
    const publicar = !convocatoria.publica;
    const pregunta = publicar
      ? '¿Abrir el directorio al público? A partir de ahora cualquiera podrá llegar a /revision sin el enlace.'
      : '¿Volver a dejarlo solo con enlace? Quien entre a /revision ya no lo encontrará.';
    if (!confirm(pregunta)) return;

    this.cambiarPuerta(convocatoria, { publica: publicar });
  }

  private cambiarPuerta(convocatoria: Convocatoria, cambios: Partial<Convocatoria>): void {
    this.error.set(null);
    this.api.cambiarConvocatoria(convocatoria.id, cambios).subscribe({
      next: ({ convocatoria: guardada, mensaje }) => {
        this.convocatorias.update((lista) =>
          lista.map((una) => (una.id === guardada.id ? guardada : una)),
        );
        this.cambiado.emit(mensaje);
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  // ── Los pedidos ──────────────────────────────────────────────────────────

  abrir(pedido: Pedido): void {
    this.abierto.set(pedido);
    this.notas.set(pedido.notas ?? '');
    this.error.set(null);
  }

  cerrar(): void {
    this.abierto.set(null);
  }

  /** Se baja con la sesión puesta y se guarda desde el blob. Ver el servicio. */
  bajarDocumento(pedido: Pedido): void {
    if (this.bajando()) return;
    this.bajando.set(true);

    this.api.documento(pedido.id).subscribe({
      next: (blob) => {
        this.bajando.set(false);
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = `${pedido.codigo}-${pedido.archivoNombre}`;
        enlace.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (e: unknown) => {
        this.bajando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  guardar(): void {
    this.aplicar({});
  }

  /** Lo único que la casa puede parar. Se pregunta: el tesista lo ve caer. */
  cancelar(): void {
    if (!confirm('¿Cancelar este pedido? El tesista dejará de verlo en su seguimiento.')) return;
    this.aplicar({ estado: 'CANCELADO' });
  }

  private aplicar(extra: { estado?: 'CANCELADO' }): void {
    const pedido = this.abierto();
    if (!pedido || this.guardando()) return;

    this.guardando.set(true);
    this.error.set(null);

    this.api.cambiar(pedido.id, { notas: this.notas().trim(), ...extra }).subscribe({
      next: ({ mensaje }) => {
        this.guardando.set(false);
        this.cerrar();
        this.cambiado.emit(mensaje);
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
}
