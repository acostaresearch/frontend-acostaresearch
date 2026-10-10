import { Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';

import { mensajeDeError } from '../../core/http/api-error';
import { Plan } from '../../core/models/rewrite.model';
import { DialogoService } from '../../core/services/dialogo.service';
import { duracionDeAcceso, EnlacePrueba, InvitadoPrueba, PruebaService } from '../../core/services/prueba.service';
import { Listado } from './listado';

/** Gestión de los enlaces de prueba, separada de las ventas y licencias de clientes. */
export class PruebasConectorAdmin {
  private readonly fb = inject(FormBuilder);
  private readonly dialogos = inject(DialogoService);

  constructor(
    private readonly error: WritableSignal<string | null>,
    private readonly aviso: WritableSignal<string | null>,
    private readonly trabajando: WritableSignal<boolean>,
    private readonly planesLicencia: Signal<readonly Plan[]>,
  ) {}

  // ── Pruebas del conector ─────────────────────────────────────────────────
  //
  // Un enlace para un grupo; cada invitado recibe su propio conector. Va aparte
  // de códigos, pagos y licencias: no es una venta ni una cortesía a alguien
  // con cuenta, y no deja nada en ninguna de esas listas.

  private readonly pruebasApi = inject(PruebaService);

  /** `null` mientras no se ha abierto la sección ni una vez. */
  readonly pruebas = signal<EnlacePrueba[] | null>(null);

  /** Los enlaces con su buscador y sus filtros, como las demás tablas. */
  readonly listaPruebas = new Listado(
    computed(() => this.pruebas() ?? []),
    {
      filtros: [
        { valor: 'todos', etiqueta: 'Todos' },
        { valor: 'activos', etiqueta: 'Activos' },
        { valor: 'terminados', etiqueta: 'Terminados' },
        { valor: 'apagados', etiqueta: 'Apagados' },
      ],
      texto: (e: EnlacePrueba) => [e.name, e.productName],
      // Activo es el que todavía entrega o deja usar: abierto o ya lleno.
      pasa: (e: EnlacePrueba, filtro: string) =>
        filtro === 'activos'
          ? e.estado === 'ABIERTO' || e.estado === 'LLENO'
          : filtro === 'terminados'
            ? e.estado === 'TERMINADO'
            : e.estado === 'APAGADO',
    },
  );

  readonly formularioPruebaAbierto = signal(false);
  /** El enlace recién creado, para copiarlo nada más cerrarse la ventana. */
  readonly pruebaNueva = signal<EnlacePrueba | null>(null);
  /** Qué enlace se acaba de copiar, para que su botón lo diga. */
  readonly pruebaCopiada = signal<string | null>(null);
  readonly viendoInvitados = signal<EnlacePrueba | null>(null);
  readonly invitados = signal<InvitadoPrueba[] | null>(null);

  /** Un producto por grupo de licencia: varios planes pueden venderlo. */
  readonly productosPrueba = computed(() => {
    const vistos = new Map<string, string>();
    for (const plan of this.planesLicencia()) {
      if (plan.productCode && !vistos.has(plan.productCode)) {
        vistos.set(plan.productCode, plan.name);
      }
    }
    return [...vistos].map(([code, name]) => ({ code, name }));
  });

  /**
   * Los topes vienen puestos y bajos a propósito: cada consulta del conector se
   * paga, y el enlace se reparte entre gente que no ha pagado nada. Quien quiera
   * más los sube; lo que no conviene es que el valor por defecto sea «sin tope».
   */
  readonly formPrueba = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    productCode: ['', Validators.required],
    seats: [30, [Validators.required, Validators.min(1), Validators.max(500)]],
    /** Cuánto dura la prueba desde que se crea el enlace. 0 = sin límite. */
    accesoCantidad: [24, [Validators.required, Validators.min(0), Validators.max(525600)]],
    accesoUnidad: ['horas' as 'minutos' | 'horas'],
    callsPerDay: [20, [Validators.required, Validators.min(0), Validators.max(1000)]],
  });

  cargarPruebas(): void {
    this.pruebasApi.enlaces().subscribe({
      next: (enlaces) => this.pruebas.set(enlaces),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  abrirFormularioPrueba(): void {
    this.error.set(null);
    this.pruebaNueva.set(null);
    this.formPrueba.reset({
      name: '',
      productCode: this.productosPrueba()[0]?.code ?? '',
      seats: 30,
      accesoCantidad: 24,
      accesoUnidad: 'horas',
      callsPerDay: 20,
    });
    this.formularioPruebaAbierto.set(true);
  }

  cerrarFormularioPrueba(): void {
    if (this.trabajando()) return;
    this.formularioPruebaAbierto.set(false);
  }

  crearPrueba(): void {
    if (this.formPrueba.invalid || this.trabajando()) {
      this.formPrueba.markAllAsTouched();
      return;
    }

    // El servidor lo guarda en minutos: se convierte aquí, que es donde se sabe
    // qué unidad eligió.
    const { accesoCantidad, accesoUnidad, ...resto } = this.formPrueba.getRawValue();
    const accessMinutes = accesoUnidad === 'horas' ? accesoCantidad * 60 : accesoCantidad;
    if (accessMinutes > 525600) {
      this.error.set('Como mucho un año de acceso.');
      return;
    }

    this.trabajando.set(true);
    this.error.set(null);

    this.pruebasApi.crear({ ...resto, accessMinutes }).subscribe({
      next: (enlace) => {
        this.pruebas.update((lista) => [enlace, ...(lista ?? [])]);
        this.pruebaNueva.set(enlace);
        this.trabajando.set(false);
        this.formularioPruebaAbierto.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.trabajando.set(false);
      },
    });
  }

  async copiarEnlacePrueba(enlace: EnlacePrueba): Promise<void> {
    try {
      await navigator.clipboard.writeText(enlace.url);
      this.pruebaCopiada.set(enlace.id);
      setTimeout(() => {
        if (this.pruebaCopiada() === enlace.id) this.pruebaCopiada.set(null);
      }, 2500);
    } catch {
      this.error.set('No pudimos copiar. Selecciona el enlace y cópialo a mano.');
    }
  }

  /**
   * Apaga o enciende el enlace.
   *
   * Apagar se pregunta: corta en el acto a todos los que ya lo recogieron, y
   * alguien puede estar a mitad de un capítulo. Encender no, que no quita nada.
   */
  async alternarPrueba(enlace: EnlacePrueba): Promise<void> {
    if (enlace.active) {
      const seguro = await this.dialogos.confirmar({
        titulo: `Apagar «${enlace.name}»`,
        mensaje:
          `Los ${enlace.claimed} conectores entregados dejarán de funcionar ahora mismo, ` +
          'y el enlace no entregará ninguno más.',
        nota: 'Puedes volver a encenderlo: los conectores vuelven tal como estaban.',
        confirmar: 'Apagar',
        tono: 'peligro',
      });
      if (!seguro) return;
    }

    this.pruebasApi.encender(enlace.id, !enlace.active).subscribe({
      next: ({ enlace: actualizado, mensaje }) => {
        this.pruebas.update((lista) =>
          (lista ?? []).map((e) => (e.id === actualizado.id ? { ...e, ...actualizado } : e)),
        );
        this.aviso.set(mensaje);
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  async borrarPrueba(enlace: EnlacePrueba): Promise<void> {
    const seguro = await this.dialogos.confirmar({
      titulo: `Borrar «${enlace.name}»`,
      mensaje:
        `Se borran el enlace, sus ${enlace.claimed} conectores y todo lo que guardaron los ` +
        'invitados con ellos.',
      nota: 'No hay vuelta atrás. Si solo quieres cortarlos, apágalo.',
      confirmar: 'Borrar',
      tono: 'peligro',
    });
    if (!seguro) return;

    this.pruebasApi.borrar(enlace.id).subscribe({
      next: (mensaje) => {
        this.pruebas.update((lista) => (lista ?? []).filter((e) => e.id !== enlace.id));
        if (this.pruebaNueva()?.id === enlace.id) this.pruebaNueva.set(null);
        this.aviso.set(mensaje);
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  verInvitados(enlace: EnlacePrueba): void {
    this.viendoInvitados.set(enlace);
    this.invitados.set(null);
    this.pruebasApi.invitados(enlace.id).subscribe({
      next: (lista) => this.invitados.set(lista),
      error: (e: unknown) => {
        this.viendoInvitados.set(null);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  /** Cuánto dura cada conector de un enlace, dicho para una persona. */
  duracionPrueba(minutos: number): string {
    return duracionDeAcceso(minutos);
  }

  /** Los topes de un enlace, con el periodo pegado al número. */
  topesPrueba(enlace: EnlacePrueba): string {
    const partes: string[] = [];
    if (enlace.callsPerDay > 0) partes.push(`${enlace.callsPerDay}/día`);
    return partes.length > 0 ? partes.join(' · ') : 'Sin tope';
  }
}
