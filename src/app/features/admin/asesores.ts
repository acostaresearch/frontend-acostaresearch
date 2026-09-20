import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { mensajeDeError } from '../../core/http/api-error';
import {
  Asesor,
  AsesorService,
  CatalogosDeAsesor,
  Convocatoria,
  EstadoDeFicha,
  GradoDeAsesor,
  NOMBRE_DEL_ESTADO,
  TipoDeDocumento,
} from '../../core/services/asesor.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

/**
 * El registro de asesores, en el panel.
 *
 * Componente aparte y no una sección más dentro de `admin`, por lo mismo que
 * `ReclamosAdmin`: aquella hoja de estilos ya roza el tope que permite la
 * compilación, y esto trae su propia ventana.
 *
 * DE DÓNDE SALEN LOS ASESORES
 * ---------------------------
 * De dos sitios. Los del piloto **se dan de alta a mano**: no se postularon, se
 * les llamó, así que nacen aprobados y con su enlace —lo único que hay que
 * mandarles—. Y está la convocatoria, que es el formulario público por si algún
 * día se abre a candidatos; mientras esté cerrada no recibe nada y no estorba.
 *
 * Lo que se escriba en las notas no le llega a nadie: es para acordarse de por
 * qué se decidió lo que se decidió.
 */
@Component({
  imports: [AvisoFlotante, DatePipe, ReactiveFormsModule],
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

  private readonly fb = inject(FormBuilder);

  readonly catalogos = signal<CatalogosDeAsesor | null>(null);

  /**
   * El formulario de la ficha.
   *
   * Nulo = cerrado. Con `'nuevo'` = dando de alta a alguien; con un asesor
   * dentro = corrigiendo el suyo. Es el mismo formulario porque son los mismos
   * campos: lo que se escribe aquí es lo que el tesista lee en su tarjeta, y un
   * asesor dado de alta con media ficha sale con media tarjeta.
   */
  readonly editando = signal<Asesor | 'nuevo' | null>(null);
  readonly areas = signal<string[]>([]);
  readonly metodos = signal<string[]>([]);
  readonly faltaArea = signal(false);
  readonly faltaMetodo = signal(false);

  readonly ficha = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(160)]],
    tipoDocumento: ['DNI' as TipoDeDocumento, [Validators.required]],
    numeroDocumento: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9]{6,15}$/)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    telefono: ['', [Validators.required, Validators.pattern(/^[+\d\s()-]{6,20}$/)]],
    grado: ['MAGISTER' as GradoDeAsesor, [Validators.required]],
    gradoUniversidad: [
      '',
      [Validators.required, Validators.minLength(3), Validators.maxLength(160)],
    ],
    gradoAnio: ['', [Validators.pattern(/^$|^(19|20)\d{2}$/)]],
    registroSunedu: ['', [Validators.maxLength(255)]],
    enlaceCv: ['', [Validators.pattern(/^$|^https?:\/\/\S+$/i)]],
    especialidad: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(160)]],
    universidades: ['', [Validators.maxLength(500)]],
    anosExperiencia: [0, [Validators.required, Validators.min(0), Validators.max(60)]],
    presentacion: ['', [Validators.required, Validators.minLength(40), Validators.maxLength(2000)]],
    aceptaReglas: [false, [Validators.requiredTrue]],
  });

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
    this.api.catalogos().subscribe({
      next: (catalogos) => this.catalogos.set(catalogos),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  // ── El alta a mano ───────────────────────────────────────────────────────

  abrirAlta(): void {
    this.ficha.reset({
      tipoDocumento: 'DNI',
      grado: 'MAGISTER',
      anosExperiencia: 0,
      aceptaReglas: false,
    });
    this.areas.set([]);
    this.metodos.set([]);
    this.faltaArea.set(false);
    this.faltaMetodo.set(false);
    this.error.set(null);
    this.editando.set('nuevo');
  }

  abrirEdicion(asesor: Asesor): void {
    this.ficha.reset({
      nombre: asesor.nombre,
      tipoDocumento: asesor.tipoDocumento,
      numeroDocumento: asesor.numeroDocumento,
      email: asesor.email,
      telefono: asesor.telefono,
      grado: asesor.grado,
      gradoUniversidad: asesor.gradoUniversidad,
      gradoAnio: asesor.gradoAnio === null ? '' : String(asesor.gradoAnio),
      registroSunedu: asesor.registroSunedu,
      enlaceCv: asesor.enlaceCv,
      especialidad: asesor.especialidad,
      universidades: asesor.universidades,
      anosExperiencia: asesor.anosExperiencia,
      presentacion: asesor.presentacion,
      aceptaReglas: asesor.aceptaReglas,
    });
    this.areas.set(this.codigosDe(asesor.areas, this.catalogos()?.areas ?? []));
    this.metodos.set(this.codigosDe(asesor.metodos, this.catalogos()?.metodos ?? []));
    this.faltaArea.set(false);
    this.faltaMetodo.set(false);
    this.error.set(null);
    this.abierta.set(null);
    this.editando.set(asesor);
  }

  /**
   * Las áreas vuelven traducidas del servidor —«Educación», no «EDUCACION»—,
   * que es lo que hace falta para leerlas. Para volver a marcarlas en el
   * formulario hay que deshacer esa traducción con el catálogo.
   */
  private codigosDe(nombres: string[], lista: { codigo: string; nombre: string }[]): string[] {
    return lista.filter((opcion) => nombres.includes(opcion.nombre)).map((opcion) => opcion.codigo);
  }

  cerrarFormulario(): void {
    this.editando.set(null);
  }

  marcada(lista: 'areas' | 'metodos', codigo: string): boolean {
    return this[lista]().includes(codigo);
  }

  alternar(lista: 'areas' | 'metodos', codigo: string): void {
    const actual = this[lista]();
    const nueva = actual.includes(codigo)
      ? actual.filter((uno) => uno !== codigo)
      : [...actual, codigo];
    this[lista].set(nueva);
    if (lista === 'areas') this.faltaArea.set(nueva.length === 0);
    else this.faltaMetodo.set(nueva.length === 0);
  }

  guardarFicha(): void {
    const quien = this.editando();
    if (!quien || this.guardando()) return;

    // Las listas no son campos del formulario, así que se comprueban aparte.
    this.faltaArea.set(this.areas().length === 0);
    this.faltaMetodo.set(this.metodos().length === 0);
    if (this.ficha.invalid || this.faltaArea() || this.faltaMetodo()) {
      this.ficha.markAllAsTouched();
      return;
    }

    const valores = this.ficha.getRawValue();
    const datos = {
      ...valores,
      gradoAnio: valores.gradoAnio === '' ? null : valores.gradoAnio,
      areas: this.areas(),
      metodos: this.metodos(),
    };

    this.guardando.set(true);
    this.error.set(null);

    const peticion =
      quien === 'nuevo' ? this.api.darDeAlta(datos) : this.api.editarFicha(quien.id, datos);

    peticion.subscribe({
      next: ({ mensaje }) => {
        this.guardando.set(false);
        this.cerrarFormulario();
        this.cambiado.emit(mensaje);
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  /** Su enlace es su llave: esto lo apaga y hace otro. */
  rehacerEnlace(asesor: Asesor): void {
    const pregunta =
      '¿Hacerle un enlace nuevo? El que tiene ahora dejará de funcionar y habrá que volver a mandárselo.';
    if (!confirm(pregunta)) return;

    this.api.rehacerEnlace(asesor.id).subscribe({
      next: ({ mensaje }) => {
        this.cerrar();
        this.cambiado.emit(mensaje);
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  /** Sacarlo del directorio sin rechazarlo: está lleno, no está mal. */
  cambiarVisibilidad(asesor: Asesor): void {
    this.api.revisar(asesor.id, 'APROBADO', this.notas().trim(), !asesor.visible).subscribe({
      next: () => {
        this.cerrar();
        this.cambiado.emit(
          asesor.visible
            ? `${asesor.nombre} ya no sale en el directorio.`
            : `${asesor.nombre} vuelve al directorio.`,
        );
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
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

  /** El enlace privado que hay que mandarle al aprobarlo. */
  readonly enlaceCopiado = signal(false);

  copiarEnlace(asesor: Asesor): void {
    void navigator.clipboard.writeText(asesor.enlacePanel).then(
      () => {
        this.enlaceCopiado.set(true);
        setTimeout(() => this.enlaceCopiado.set(false), 2500);
      },
      () => this.error.set('No se pudo copiar. Selecciona el enlace y cópialo a mano.'),
    );
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
