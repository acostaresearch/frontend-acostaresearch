import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';

import { mensajeDeError } from '../../core/http/api-error';
import {
  Asesor,
  AsesorService,
  Convocatoria,
  EstadoDeFicha,
  NOMBRE_DEL_ESTADO,
} from '../../core/services/asesor.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

/**
 * El registro de asesores, en el panel.
 *
 * Componente aparte y no una sección más dentro de `admin`, por lo mismo que
 * `ReclamosAdmin`: aquella hoja de estilos ya roza el tope que permite la
 * compilación, y esto trae su propia ventana.
 *
 * DOS COSAS QUE HACER AQUÍ
 * ------------------------
 * Arriba, la convocatoria: crear una, copiar su enlace para repartirlo y los
 * dos interruptores que deciden quién llega. `Pública` es el que abre el
 * registro al mundo, así que se pregunta antes de tocarlo.
 *
 * Abajo, las fichas: leerlas, comprobar el grado en SUNEDU y aprobar o
 * rechazar. Lo que se escriba en las notas no le llega al candidato: es para
 * acordarse de por qué se decidió lo que se decidió.
 */
@Component({
  imports: [AvisoFlotante, DatePipe],
  selector: 'app-asesores-admin',
  templateUrl: './asesores.html',
  styleUrl: './asesores.css',
})
export class AsesoresAdmin implements OnInit {
  private readonly api = inject(AsesorService);

  /** La lista la carga el panel, que la necesita para el contador lateral. */
  readonly asesores = input.required<Asesor[]>();
  /** Algo cambió: lleva el aviso para el panel, que recarga la lista. */
  readonly cambiado = output<string>();

  readonly nombreDelEstado = NOMBRE_DEL_ESTADO;

  readonly convocatorias = signal<Convocatoria[]>([]);
  readonly abierta = signal<Asesor | null>(null);
  readonly notas = signal('');
  readonly filtro = signal<EstadoDeFicha | 'TODAS'>('PENDIENTE');
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);

  /** Crear una convocatoria: el formulario de arriba. */
  readonly nombreNuevo = signal('');
  readonly introNueva = signal('');
  readonly creando = signal(false);
  readonly copiada = signal<string | null>(null);

  readonly visibles = computed(() => {
    const filtro = this.filtro();
    const lista = this.asesores();
    return filtro === 'TODAS' ? lista : lista.filter((asesor) => asesor.estado === filtro);
  });

  /** Las pestañas de arriba, en el orden en que se miran. */
  readonly filtros: { codigo: EstadoDeFicha | 'TODAS'; nombre: string }[] = [
    { codigo: 'PENDIENTE', nombre: 'Pendientes' },
    { codigo: 'APROBADO', nombre: 'Aprobadas' },
    { codigo: 'RECHAZADO', nombre: 'Rechazadas' },
    { codigo: 'TODAS', nombre: 'Todas' },
  ];

  cuantas(codigo: EstadoDeFicha | 'TODAS'): number {
    const lista = this.asesores();
    return codigo === 'TODAS' ? lista.length : lista.filter((a) => a.estado === codigo).length;
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
        this.cambiado.emit('Convocatoria creada. Copia su enlace y repártelo a mano.');
      },
      error: (e: unknown) => {
        this.creando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  /** El enlace se reparte a mano, así que lo primero que se hace es copiarlo. */
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
    this.cambiar(convocatoria, { abierta: !convocatoria.abierta });
  }

  /**
   * El interruptor que abre el registro al público.
   *
   * Se pregunta antes porque es el único cambio de esta pantalla que se ve
   * desde fuera: a partir de ahí, cualquiera que entre a /asesores encuentra el
   * formulario sin necesidad del enlace.
   */
  publicarOEsconder(convocatoria: Convocatoria): void {
    const publicar = !convocatoria.publica;
    const pregunta = publicar
      ? '¿Abrir el registro al público? A partir de ahora cualquiera podrá llegar a /asesores sin el enlace.'
      : '¿Volver a dejarlo solo con enlace? Quien entre a /asesores ya no lo encontrará.';
    if (!confirm(pregunta)) return;

    this.cambiar(convocatoria, { publica: publicar });
  }

  private cambiar(convocatoria: Convocatoria, cambios: Partial<Convocatoria>): void {
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

  // ── Las fichas ───────────────────────────────────────────────────────────

  abrir(asesor: Asesor): void {
    this.abierta.set(asesor);
    this.notas.set(asesor.notas ?? '');
    this.error.set(null);
  }

  cerrar(): void {
    this.abierta.set(null);
  }

  /** Lo que se busca en SUNEDU para comprobar el grado que declara. */
  buscarEnSunedu(asesor: Asesor): string {
    return `https://enlinea.sunedu.gob.pe/?nombres=${encodeURIComponent(asesor.nombre)}`;
  }

  decidir(estado: EstadoDeFicha): void {
    const asesor = this.abierta();
    if (!asesor || this.guardando()) return;

    this.guardando.set(true);
    this.error.set(null);

    this.api.revisar(asesor.id, estado, this.notas().trim()).subscribe({
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
