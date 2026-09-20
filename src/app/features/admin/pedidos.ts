import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';

import { mensajeDeError } from '../../core/http/api-error';
import { Asesor, Convocatoria } from '../../core/services/asesor.service';
import {
  EstadoDePedido,
  NOMBRE_DEL_ESTADO_PEDIDO,
  Pedido,
  PedidoService,
} from '../../core/services/pedido.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

/**
 * Los encargos de revisión, en el panel.
 *
 * EL TABLERO DEL PILOTO
 * ---------------------
 * Aquí se hace todo lo que la plataforma no automatiza: bajarse el Word,
 * asignárselo a un asesor, pegar el enlace del documento de observaciones y
 * darlo por entregado. La revisión en sí ocurre fuera; esto es el tablero que
 * dice en qué va cada cosa y quién la tiene.
 *
 * Componente aparte, como el libro y los asesores: la hoja de estilos de
 * `admin` ya roza el tope de la compilación.
 */
@Component({
  imports: [AvisoFlotante, DatePipe],
  selector: 'app-pedidos-admin',
  templateUrl: './pedidos.html',
  styleUrl: './pedidos.css',
})
export class PedidosAdmin implements OnInit {
  private readonly api = inject(PedidoService);

  /** Las listas las carga el panel, que necesita el contador lateral. */
  readonly pedidos = input.required<Pedido[]>();
  readonly asesores = input.required<Asesor[]>();
  readonly cambiado = output<string>();

  readonly nombreDelEstado = NOMBRE_DEL_ESTADO_PEDIDO;

  readonly convocatorias = signal<Convocatoria[]>([]);
  readonly abierto = signal<Pedido | null>(null);
  readonly filtro = signal<EstadoDePedido | 'TODOS'>('RECIBIDO');
  readonly guardando = signal(false);
  readonly bajando = signal(false);
  readonly error = signal<string | null>(null);

  /** Lo que se edita en la ventana, antes de guardar. */
  readonly asesorElegido = signal('');
  readonly enlace = signal('');
  readonly notas = signal('');

  readonly nombreNuevo = signal('');
  readonly introNueva = signal('');
  readonly creando = signal(false);
  readonly copiada = signal<string | null>(null);

  /** Solo los aprobados: a los demás no se les puede asignar nada. */
  readonly asignables = computed(() => this.asesores().filter((a) => a.estado === 'APROBADO'));

  readonly filtros: { codigo: EstadoDePedido | 'TODOS'; nombre: string }[] = [
    { codigo: 'RECIBIDO', nombre: 'Sin asignar' },
    { codigo: 'EN_REVISION', nombre: 'En revisión' },
    { codigo: 'ENTREGADO', nombre: 'Entregados' },
    { codigo: 'TODOS', nombre: 'Todos' },
  ];

  readonly visibles = computed(() => {
    const filtro = this.filtro();
    const lista = this.pedidos();
    // «Todos» incluye los cancelados; los demás filtros, no.
    return filtro === 'TODOS' ? lista : lista.filter((pedido) => pedido.estado === filtro);
  });

  cuantos(codigo: EstadoDePedido | 'TODOS'): number {
    const lista = this.pedidos();
    return codigo === 'TODOS' ? lista.length : lista.filter((p) => p.estado === codigo).length;
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

  escribir(
    senal: 'nombreNuevo' | 'introNueva' | 'enlace' | 'notas',
    evento: Event,
  ): void {
    this[senal].set((evento.target as HTMLInputElement | HTMLTextAreaElement).value);
  }

  elegirAsesor(evento: Event): void {
    this.asesorElegido.set((evento.target as HTMLSelectElement).value);
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
        this.cambiado.emit('Enlace creado. Copia y repártelo a mano.');
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
      ? '¿Abrir el formulario al público? A partir de ahora cualquiera podrá llegar a /revision sin el enlace.'
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
    this.asesorElegido.set(pedido.asesorId ?? '');
    this.enlace.set(pedido.enlaceObservaciones);
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

  /** Guardar lo de la ventana sin cambiar el estado. */
  guardar(): void {
    this.aplicar({});
  }

  /** Marcar el paso siguiente: asignar pone en revisión, y luego se entrega. */
  marcar(estado: EstadoDePedido): void {
    this.aplicar({ estado });
  }

  private aplicar(extra: { estado?: EstadoDePedido }): void {
    const pedido = this.abierto();
    if (!pedido || this.guardando()) return;

    this.guardando.set(true);
    this.error.set(null);

    this.api
      .cambiar(pedido.id, {
        asesorId: this.asesorElegido(),
        enlaceObservaciones: this.enlace().trim(),
        notas: this.notas().trim(),
        ...extra,
      })
      .subscribe({
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
}
