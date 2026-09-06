import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, switchMap } from 'rxjs';

import { toApiError } from '../../core/http/api-error';
import {
  ActivationCode,
  Alerta,
  CodigoDescuento,
  LicenciaAdmin,
  PackAdmin,
  PagoAdmin,
} from '../../core/models/admin.model';
import { PagoPorRevisar } from '../../core/models/payment.model';
import { Plan } from '../../core/models/rewrite.model';
import { AdminService } from '../../core/services/admin.service';
import { BillingService, Grupo } from '../../core/services/billing.service';
import { PaymentService } from '../../core/services/payment.service';
import { AnalisisBundle, Skill, SkillService } from '../../core/services/skill.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

type Seccion =
  | 'ventas'
  | 'yape'
  | 'skills'
  | 'grupos'
  | 'descuentos'
  | 'licencias'
  | 'alertas'
  | 'movimientos';

/** Rebaja mínima que acepta el servidor, en céntimos de sol. */
const DESCUENTO_MINIMO = 1000;

/**
 * Un `.skill` esperando turno para publicarse.
 *
 * Se inspecciona en cuanto entra en la cola —antes de que nadie pulse nada—,
 * así que para cuando el administrador mira ya sabe cuáles son nuevos y
 * cuáles pisan un capítulo existente.
 */
interface EnCola {
  archivo: File;
  analisis: AnalisisBundle | null;
  estado: 'analizando' | 'lista' | 'subiendo' | 'publicada' | 'error';
  error: string | null;
}

/** Métodos de pago que acepta el backend para una activación manual. */
const METODOS = ['YAPE', 'PLIN', 'TRANSFERENCIA', 'PAYPAL', 'WESTERN_UNION', 'CORTESIA'] as const;

/**
 * Panel de administración.
 *
 * Es una herramienta de trabajo, no un escaparate: lo que se mira a diario va
 * primero —vender y vigilar— y el histórico queda detrás.
 */
@Component({
  selector: 'app-admin',
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe, SiteHeader, SiteFooter],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminService);
  private readonly billing = inject(BillingService);
  private readonly payments = inject(PaymentService);

  readonly metodos = METODOS;
  readonly seccion = signal<Seccion>('ventas');

  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  // ── Datos ────────────────────────────────────────────────────────────────
  readonly planes = signal<Plan[]>([]);
  readonly licencias = signal<LicenciaAdmin[]>([]);
  readonly alertas = signal<Alerta[]>([]);
  readonly codigos = signal<ActivationCode[]>([]);
  readonly bolsas = signal<PackAdmin[]>([]);
  readonly pagos = signal<PagoAdmin[]>([]);
  readonly descuentos = signal<CodigoDescuento[]>([]);
  readonly descuentoNuevo = signal<CodigoDescuento | null>(null);

  // ── Comprobantes de Yape ─────────────────────────────────────────────────
  readonly porRevisar = signal<PagoPorRevisar[]>([]);
  /**
   * Imágenes ya descargadas, por pago.
   *
   * El <img> no puede mandar la cabecera de autorización, así que la imagen se
   * baja con el token y se enseña como object URL. Se guardan aquí para no
   * volver a pedir la misma captura cada vez que se repinta la lista.
   */
  readonly capturas = signal<Record<string, string>>({});
  /** Qué pago se está aprobando o rechazando, para bloquear solo esa fila. */
  readonly revisando = signal<string | null>(null);
  /** Motivo del rechazo, por pago: cada fila escribe el suyo. */
  readonly motivos = signal<Record<string, string>>({});

  /** Códigos recién generados. Se muestran una vez y no vuelven. */
  readonly codigosNuevos = signal<string[]>([]);
  /** Correo al que el servidor acaba de mandarlos, si se indicó uno. */
  readonly codigoEnviadoA = signal<string | null>(null);
  readonly copiados = signal(false);
  readonly trabajando = signal(false);

  readonly planesLicencia = computed(() => this.planes().filter((p) => p.kind === 'LICENSE'));
  readonly planesPalabras = computed(() =>
    this.planes().filter((p) => p.kind === 'WORDS' && p.priceCents > 0),
  );

  /** Lo que hay que mirar hoy: alertas sin resolver y licencias caídas. */
  readonly alertasGraves = computed(
    () => this.alertas().filter((a) => a.level === 'SOSPECHA_ALTA').length,
  );
  readonly licenciasActivas = computed(
    () => this.licencias().filter((l) => l.status === 'ACTIVE').length,
  );
  readonly licenciasRevocadas = computed(
    () => this.licencias().filter((l) => l.status === 'REVOKED').length,
  );
  readonly codigosSinUsar = computed(
    () => this.codigos().filter((c) => c.status === 'AVAILABLE').length,
  );

  // ── Formularios ──────────────────────────────────────────────────────────
  readonly formCodigos = this.fb.nonNullable.group({
    cantidad: [1, [Validators.required, Validators.min(1), Validators.max(100)]],
    productCode: ['METODO_9_SKILLS'],
    buyerEmail: [''],
    note: [''],
  });

  readonly formDescuento = this.fb.nonNullable.group({
    // En soles, que es como piensa el precio; se convierte a céntimos al enviar.
    soles: [20, [Validators.required, Validators.min(DESCUENTO_MINIMO / 100)]],
    planCode: [''],
    code: [''],
    maxUses: [0, [Validators.min(0)]],
    note: [''],
  });

  readonly formBolsa = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    planCode: ['TESISTA', Validators.required],
    paymentMethod: ['YAPE', Validators.required],
    paymentRef: [''],
    note: [''],
  });

  // ── Capítulos del método ─────────────────────────────────────────────────
  private readonly skillsApi = inject(SkillService);

  readonly skills = signal<Skill[]>([]);
  readonly editando = signal<Skill | null>(null);

  // ── Grupos ───────────────────────────────────────────────────────────────
  //
  // Un grupo es un producto: sus capítulos, su precio y su duración. Se crean
  // aquí y luego cada .skill se cuelga de uno al subirlo.
  readonly grupos = signal<Grupo[]>([]);
  readonly editandoGrupo = signal<Grupo | null>(null);
  /** A qué grupo van los archivos que hay ahora mismo en la cola. */
  readonly grupoDestino = signal<string>('');

  readonly gruposActivos = computed(() => this.grupos().filter((g) => g.active));

  readonly formGrupo = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(40)]],
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80)]],
    description: ['', [Validators.maxLength(255)]],
    // En soles, que es como se piensa un precio; se pasa a céntimos al enviar.
    soles: [199, [Validators.required, Validators.min(0)]],
    dolares: [57.9, [Validators.min(0)]],
    // 0 = no caduca. 90 días es el trimestre por defecto.
    durationDays: [90, [Validators.required, Validators.min(0)]],
    mcpCallsPerDay: [200, [Validators.required, Validators.min(0)]],
    active: [true],
  });

  /** Archivos soltados, en el orden en que se publicarán. */
  readonly cola = signal<EnCola[]>([]);
  /** El puntero está encima de la zona de soltar: solo pinta el resaltado. */
  readonly arrastrando = signal(false);
  readonly publicando = signal(false);

  readonly colaListas = computed(() => this.cola().filter((c) => c.estado === 'lista'));
  readonly colaAnalizando = computed(() => this.cola().some((c) => c.estado === 'analizando'));
  readonly colaReemplazos = computed(
    () => this.colaListas().filter((c) => c.analisis?.reemplaza).length,
  );

  readonly skillsVisibles = computed(() => this.skills().filter((s) => s.active).length);
  /** Ordenados como se van a mostrar, que es lo que ven las flechas. */
  readonly skillsOrdenadas = computed(() =>
    [...this.skills()].sort((a, b) => a.orden - b.orden),
  );

  /**
   * Ficha editable de un capítulo ya publicado.
   *
   * No lleva `orden`: la posición se cambia con las flechas de la lista, que
   * es donde se ve el resultado. Escribir un número a ciegas y descubrir luego
   * que había un empate era la forma lenta de hacer lo mismo.
   */
  readonly formSkill = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    summary: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
    productCode: [''],
    active: [true],
  });

  ngOnInit(): void {
    this.billing.plans().subscribe({ next: (planes) => this.planes.set(planes) });
    this.recargar();
  }

  // ── Grupos ───────────────────────────────────────────────────────────────

  private cargarGrupos(): void {
    this.billing.grupos().subscribe({
      next: (grupos) => {
        this.grupos.set(grupos);
        // Con un solo grupo no tiene sentido preguntar a cuál va cada archivo.
        const activos = grupos.filter((g) => g.active);
        if (!this.grupoDestino() && activos.length > 0) {
          this.grupoDestino.set(activos[0].code);
        }
      },
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
  }

  elegirGrupoDestino(evento: Event): void {
    this.grupoDestino.set((evento.target as HTMLSelectElement).value);
  }

  nuevoGrupo(): void {
    this.editandoGrupo.set(null);
    this.error.set(null);
    this.aviso.set(null);
    this.formGrupo.reset({
      code: '',
      name: '',
      description: '',
      soles: 199,
      dolares: 57.9,
      durationDays: 90,
      mcpCallsPerDay: 200,
      active: true,
    });
    this.formGrupo.controls.code.enable();
  }

  editarGrupo(grupo: Grupo): void {
    this.editandoGrupo.set(grupo);
    this.error.set(null);
    this.aviso.set(null);
    this.formGrupo.patchValue({
      code: grupo.code,
      name: grupo.name,
      description: grupo.description ?? '',
      soles: grupo.priceCents / 100,
      dolares: grupo.priceUsdCents ? grupo.priceUsdCents / 100 : 0,
      durationDays: grupo.durationDays,
      mcpCallsPerDay: grupo.mcpCallsPerDay,
      active: grupo.active,
    });
    // El código no se toca nunca: lo llevan las licencias ya emitidas y los
    // capítulos que cuelgan de él. Cambiarlo dejaría a esos compradores
    // apuntando a un producto que ya no existe.
    this.formGrupo.controls.code.disable();
  }

  guardarGrupo(): void {
    if (this.formGrupo.invalid || this.trabajando()) {
      this.formGrupo.markAllAsTouched();
      return;
    }

    this.trabajando.set(true);
    this.error.set(null);
    this.aviso.set(null);

    const v = this.formGrupo.getRawValue();
    const datos = {
      name: v.name,
      description: v.description || undefined,
      priceCents: Math.round(v.soles * 100),
      priceUsdCents: v.dolares > 0 ? Math.round(v.dolares * 100) : undefined,
      durationDays: v.durationDays,
      mcpCallsPerDay: v.mcpCallsPerDay,
      active: v.active,
    };

    const enEdicion = this.editandoGrupo();
    const peticion = enEdicion
      ? this.billing.actualizarGrupo(enEdicion.code, datos)
      : this.billing.crearGrupo({ ...datos, code: v.code });

    peticion.subscribe({
      next: (grupo) => {
        this.aviso.set(
          enEdicion ? `Grupo «${grupo.name}» actualizado.` : `Grupo «${grupo.name}» creado.`,
        );
        this.editandoGrupo.set(null);
        this.trabajando.set(false);
        this.cargarGrupos();
        // El precio y la duración salen en la web de venta.
        this.billing.plans().subscribe({ next: (planes) => this.planes.set(planes) });
      },
      error: (e: unknown) => {
        this.error.set(toApiError(e).message);
        this.trabajando.set(false);
      },
    });
  }

  alternarGrupo(grupo: Grupo): void {
    if (this.trabajando()) return;

    if (grupo.active && !confirm(`«${grupo.name}» dejará de venderse. Lo ya vendido sigue igual. ¿Continuar?`)) {
      return;
    }

    this.trabajando.set(true);
    this.billing.actualizarGrupo(grupo.code, { active: !grupo.active }).subscribe({
      next: () => {
        this.trabajando.set(false);
        this.cargarGrupos();
      },
      error: (e: unknown) => {
        this.error.set(toApiError(e).message);
        this.trabajando.set(false);
      },
    });
  }

  /** Cuánto dura, dicho como lo diría una persona. */
  duracion(dias: number): string {
    if (dias <= 0) return 'Sin caducidad';
    if (dias % 30 !== 0) return `${dias} días`;
    const meses = dias / 30;
    return meses === 1 ? '1 mes' : `${meses} meses`;
  }

  nombreGrupo(code: string | null): string {
    if (!code) return 'Sin grupo';
    return this.grupos().find((g) => g.productCode === code || g.code === code)?.name ?? code;
  }

  // ── Publicar capítulos ───────────────────────────────────────────────────

  /** Los archivos llegan del diálogo del sistema o arrastrados a la zona. */
  elegirArchivos(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    this.encolar(Array.from(entrada.files ?? []));
    // Se vacía para que volver a elegir el MISMO archivo dispare el evento.
    entrada.value = '';
  }

  soltar(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastrando.set(false);
    this.encolar(Array.from(evento.dataTransfer?.files ?? []));
  }

  arrastrar(evento: DragEvent, dentro: boolean): void {
    evento.preventDefault();
    this.arrastrando.set(dentro);
  }

  /**
   * Mete los archivos en la cola y los inspecciona a la vez.
   *
   * Se comprueban todos antes de escribir nada: así el administrador ve de un
   * vistazo cuáles son nuevos y cuáles pisan un capítulo que ya está en el
   * conector, y decide con esa lista delante en vez de archivo por archivo.
   */
  private encolar(archivos: File[]): void {
    if (archivos.length === 0) return;

    this.error.set(null);
    this.aviso.set(null);
    this.editando.set(null);

    const nuevos: EnCola[] = archivos.map((archivo) => ({
      archivo,
      analisis: null,
      estado: 'analizando' as const,
      error: null,
    }));
    this.cola.update((cola) => [...cola, ...nuevos]);

    for (const item of nuevos) {
      this.skillsApi.inspeccionar(item.archivo).subscribe({
        next: (analisis) => this.marcar(item, { analisis, estado: 'lista' }),
        error: (e: unknown) =>
          this.marcar(item, { estado: 'error', error: toApiError(e).message }),
      });
    }
  }

  /** La entrada se localiza por su File, que no cambia aunque la fila sí. */
  private marcar(item: EnCola, cambios: Partial<EnCola>): void {
    this.cola.update((cola) =>
      cola.map((x) => (x.archivo === item.archivo ? { ...x, ...cambios } : x)),
    );
  }

  quitarDeCola(item: EnCola): void {
    if (this.publicando()) return;
    this.cola.update((cola) => cola.filter((x) => x.archivo !== item.archivo));
  }

  vaciarCola(): void {
    if (this.publicando()) return;
    this.cola.set([]);
  }

  /**
   * Publica toda la cola de una vez.
   *
   * Uno detrás de otro y no en paralelo: cada subida reescribe el índice que
   * sirve el conector, y lanzarlas juntas sería pelearse por el mismo archivo.
   */
  publicarCola(): void {
    const pendientes = this.colaListas();
    if (pendientes.length === 0 || this.publicando()) return;

    this.publicando.set(true);
    this.error.set(null);
    this.aviso.set(null);

    const ultimo = this.skills().reduce((max, s) => Math.max(max, s.orden), 0);
    this.publicarSiguiente(pendientes, 0, 0, ultimo + 1);
  }

  private publicarSiguiente(
    pendientes: EnCola[],
    i: number,
    hechas: number,
    proximoOrden: number,
  ): void {
    if (i >= pendientes.length) {
      this.publicando.set(false);
      // Las publicadas desaparecen; las que fallaron se quedan con su motivo.
      this.cola.update((cola) => cola.filter((x) => x.estado !== 'publicada'));
      this.aviso.set(
        hechas === 0
          ? null
          : hechas === 1
            ? 'Capítulo publicado. Ya está en el conector, sin reinstalar nada.'
            : `${hechas} capítulos publicados. Ya están en el conector, sin reinstalar nada.`,
      );
      this.cargarSkills();
      return;
    }

    const item = pendientes[i];
    const a = item.analisis;
    if (!a) {
      this.publicarSiguiente(pendientes, i + 1, hechas, proximoOrden);
      return;
    }

    // Un reemplazo conserva la ficha que ya tenía —nombre, resumen, posición y
    // visibilidad—: el archivo cambia, la ficha no. Uno nuevo entra al final,
    // con lo que declara su propio SKILL.md.
    const esNuevo = !a.reemplaza;
    this.marcar(item, { estado: 'subiendo' });

    this.skillsApi
      .subir(item.archivo, {
        displayName: a.reemplaza?.displayName ?? a.displayNameSugerido,
        summary: a.reemplaza?.summary ?? a.summarySugerido,
        orden: a.reemplaza?.orden ?? proximoOrden,
        active: a.reemplaza?.active ?? true,
        // Un reemplazo se queda en el grupo que ya tenía; uno nuevo va al que
        // esté elegido arriba. Mover un capítulo de grupo se hace a propósito,
        // desde Editar, no de rebote al actualizar su archivo.
        productCode: a.reemplaza?.productCode ?? this.grupoDestino() ?? undefined,
      })
      .subscribe({
        next: () => {
          this.marcar(item, { estado: 'publicada' });
          this.publicarSiguiente(
            pendientes,
            i + 1,
            hechas + 1,
            esNuevo ? proximoOrden + 1 : proximoOrden,
          );
        },
        // Que uno falle no detiene a los demás: se marca y se sigue.
        error: (e: unknown) => {
          this.marcar(item, { estado: 'error', error: toApiError(e).message });
          this.publicarSiguiente(pendientes, i + 1, hechas, proximoOrden);
        },
      });
  }

  // ── La lista ─────────────────────────────────────────────────────────────

  editarSkill(skill: Skill): void {
    this.editando.set(skill);
    this.formSkill.patchValue({
      displayName: skill.displayName,
      summary: skill.summary,
      productCode: skill.productCode ?? '',
      active: skill.active,
    });
  }

  guardarFicha(): void {
    const skill = this.editando();
    if (!skill || this.formSkill.invalid || this.trabajando()) {
      this.formSkill.markAllAsTouched();
      return;
    }

    this.trabajando.set(true);
    this.error.set(null);

    this.skillsApi.actualizar(skill.id, this.formSkill.getRawValue()).subscribe({
      next: (actualizada) => {
        this.skills.update((lista) => lista.map((s) => (s.id === actualizada.id ? actualizada : s)));
        this.aviso.set(`Ficha de «${actualizada.displayName}» actualizada.`);
        this.editando.set(null);
        this.trabajando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(toApiError(e).message);
        this.trabajando.set(false);
      },
    });
  }

  /** Activa o desactiva sin abrir el formulario: es el gesto más frecuente. */
  alternarSkill(skill: Skill): void {
    this.skillsApi.actualizar(skill.id, { active: !skill.active }).subscribe({
      next: (actualizada) =>
        this.skills.update((lista) => lista.map((s) => (s.id === actualizada.id ? actualizada : s))),
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
  }

  /**
   * Sube o baja un capítulo en el método.
   *
   * Intercambiar la posición con el vecino son dos escrituras. Si la segunda
   * falla, los dos quedarían con el mismo número, así que se recarga en ambos
   * casos: más vale volver a preguntar que enseñar un orden que no es el real.
   */
  mover(skill: Skill, direccion: -1 | 1): void {
    if (this.trabajando()) return;

    const lista = this.skillsOrdenadas();
    const i = lista.findIndex((s) => s.id === skill.id);
    const vecina = lista[i + direccion];
    if (i < 0 || !vecina) return;

    this.trabajando.set(true);
    this.error.set(null);

    this.skillsApi
      .actualizar(skill.id, { orden: vecina.orden })
      .pipe(switchMap(() => this.skillsApi.actualizar(vecina.id, { orden: skill.orden })))
      .subscribe({
        next: () => {
          this.trabajando.set(false);
          this.cargarSkills();
        },
        error: (e: unknown) => {
          this.error.set(toApiError(e).message);
          this.trabajando.set(false);
          this.cargarSkills();
        },
      });
  }

  /**
   * Quita el capítulo del catálogo.
   *
   * El servidor exige que esté oculto antes de borrarlo, para no dejar a medias
   * a quien esté trabajando con él. Ese paso lo damos aquí en lugar de obligar
   * al administrador a ocultar primero y volver después: la advertencia ya le
   * dijo que está visible, y confirmarlo dos veces no protege de nada.
   */
  eliminarSkill(skill: Skill): void {
    if (this.trabajando()) return;

    const aviso = skill.active
      ? `«${skill.displayName}» está visible en el conector ahora mismo.\n\n` +
        'Se ocultará y se quitará del catálogo. El archivo .skill se conserva en el ' +
        'servidor, así que puedes volver a subirlo.\n\n¿Continuar?'
      : `¿Quitar «${skill.displayName}» del catálogo? El archivo .skill se conserva.`;
    if (!confirm(aviso)) return;

    this.trabajando.set(true);
    this.error.set(null);
    this.aviso.set(null);

    const borrar: Observable<void> = skill.active
      ? this.skillsApi
          .actualizar(skill.id, { active: false })
          .pipe(switchMap(() => this.skillsApi.eliminar(skill.id)))
      : this.skillsApi.eliminar(skill.id);

    borrar.subscribe({
      next: () => {
        this.skills.update((lista) => lista.filter((s) => s.id !== skill.id));
        if (this.editando()?.id === skill.id) this.editando.set(null);
        this.aviso.set(`«${skill.displayName}» ya no aparece en el conector.`);
        this.trabajando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(toApiError(e).message);
        this.trabajando.set(false);
        // Pudo quedarse oculta pero sin borrar: que la lista lo refleje.
        this.cargarSkills();
      },
    });
  }

  private cargarSkills(): void {
    this.skillsApi.list().subscribe({
      next: (skills) => this.skills.set(skills),
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
  }

  recargar(): void {
    this.cargarSkills();
    this.cargarGrupos();
    this.admin.licenciasTodas().subscribe({
      next: (l) => this.licencias.set(l),
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
    this.admin.alertas().subscribe({ next: (a) => this.alertas.set(a) });
    this.admin.codigos().subscribe({ next: (c) => this.codigos.set(c) });
    this.admin.bolsasRecientes().subscribe({ next: (b) => this.bolsas.set(b) });
    this.admin.pagosRecientes().subscribe({ next: (p) => this.pagos.set(p) });
    this.admin.descuentos().subscribe({ next: (d) => this.descuentos.set(d) });
    this.cargarPorRevisar();
  }

  // ── Comprobantes de Yape ─────────────────────────────────────────────────

  private cargarPorRevisar(): void {
    this.payments.porRevisar().subscribe({
      next: (pagos) => {
        this.porRevisar.set(pagos);
        for (const pago of pagos) this.cargarCaptura(pago.id);
      },
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
  }

  /** Baja la captura con el token y la deja lista para el <img>. */
  private cargarCaptura(paymentId: string): void {
    if (this.capturas()[paymentId]) return;

    this.payments.comprobante(paymentId).subscribe({
      next: (blob) => {
        this.capturas.update((actual) => ({ ...actual, [paymentId]: URL.createObjectURL(blob) }));
      },
      // Que falte la miniatura no bloquea la revisión: el número de operación
      // sigue estando, que es lo que de verdad se coteja con el extracto.
      error: () => undefined,
    });
  }

  captura(paymentId: string): string | null {
    return this.capturas()[paymentId] ?? null;
  }

  motivo(paymentId: string): string {
    return this.motivos()[paymentId] ?? '';
  }

  escribirMotivo(paymentId: string, evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    this.motivos.update((actual) => ({ ...actual, [paymentId]: valor }));
  }

  /**
   * Da el pago por bueno y entrega lo comprado.
   *
   * Lo que llega de vuelta NO trae la URL del conector, y es deliberado: esa
   * URL es la credencial del comprador y la genera él desde su panel.
   */
  aprobarComprobante(pago: PagoPorRevisar): void {
    if (this.revisando()) return;

    this.revisando.set(pago.id);
    this.error.set(null);
    this.aviso.set(null);

    this.payments.aprobarComprobante(pago.id).subscribe({
      next: (resultado) => {
        this.aviso.set(
          resultado.alreadyProcessed
            ? 'Ese pago ya estaba aprobado.'
            : `Aprobado. ${pago.user.firstName} ya tiene su acceso y le hemos avisado por correo.`,
        );
        this.olvidarPago(pago.id);
        this.revisando.set(null);
        // Las licencias y los movimientos cambian al entregar.
        this.recargar();
      },
      error: (e: unknown) => {
        this.error.set(toApiError(e).message);
        this.revisando.set(null);
      },
    });
  }

  rechazarComprobante(pago: PagoPorRevisar): void {
    const motivo = this.motivo(pago.id).trim();
    if (this.revisando()) return;

    if (motivo.length < 10) {
      this.error.set('Escribe por qué lo rechazas: el comprador solo va a leer eso.');
      return;
    }

    this.revisando.set(pago.id);
    this.error.set(null);
    this.aviso.set(null);

    this.payments.rechazarComprobante(pago.id, motivo).subscribe({
      next: () => {
        this.aviso.set(`Rechazado. Se lo hemos comunicado a ${pago.user.email}.`);
        this.olvidarPago(pago.id);
        this.revisando.set(null);
      },
      error: (e: unknown) => {
        this.error.set(toApiError(e).message);
        this.revisando.set(null);
      },
    });
  }

  /** Saca el pago de la bandeja y libera su miniatura. */
  private olvidarPago(paymentId: string): void {
    const url = this.capturas()[paymentId];
    if (url) URL.revokeObjectURL(url);

    this.porRevisar.update((pagos) => pagos.filter((p) => p.id !== paymentId));
    this.capturas.update(({ [paymentId]: _fuera, ...resto }) => resto);
    this.motivos.update(({ [paymentId]: _tambien, ...resto }) => resto);
  }

  // ── Descuentos ───────────────────────────────────────────────────────────

  crearDescuento(): void {
    if (this.formDescuento.invalid || this.trabajando()) {
      this.formDescuento.markAllAsTouched();
      return;
    }

    this.trabajando.set(true);
    this.error.set(null);
    this.descuentoNuevo.set(null);

    const { soles, planCode, code, maxUses, note } = this.formDescuento.getRawValue();

    this.admin
      .crearDescuento({
        amountCents: Math.round(soles * 100),
        planCode: planCode || undefined,
        code: code.trim() || undefined,
        maxUses,
        note: note || undefined,
      })
      .subscribe({
        next: (descuento) => {
          this.descuentoNuevo.set(descuento);
          this.descuentos.update((lista) => [descuento, ...lista]);
          this.formDescuento.patchValue({ code: '', note: '' });
          this.trabajando.set(false);
        },
        error: (e: unknown) => {
          this.error.set(toApiError(e).message);
          this.trabajando.set(false);
        },
      });
  }

  alternarDescuento(descuento: CodigoDescuento): void {
    this.admin.activarDescuento(descuento.id, !descuento.active).subscribe({
      next: (actualizado) =>
        this.descuentos.update((lista) =>
          lista.map((d) => (d.id === actualizado.id ? actualizado : d)),
        ),
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
  }

  async copiarDescuento(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.copiados.set(true);
      setTimeout(() => this.copiados.set(false), 2500);
    } catch {
      this.error.set('No pudimos copiar. Selecciónalo y cópialo a mano.');
    }
  }

  ir(seccion: Seccion): void {
    this.seccion.set(seccion);
    this.error.set(null);
    this.aviso.set(null);
  }

  // ── Vender ───────────────────────────────────────────────────────────────

  generarCodigos(): void {
    if (this.formCodigos.invalid || this.trabajando()) return;

    this.trabajando.set(true);
    this.error.set(null);
    this.codigosNuevos.set([]);
    this.codigoEnviadoA.set(null);

    const { cantidad, productCode, buyerEmail, note } = this.formCodigos.getRawValue();

    this.admin
      .generarCodigos({
        cantidad,
        productCode: productCode || undefined,
        buyerEmail: buyerEmail || undefined,
        note: note || undefined,
      })
      .subscribe({
        next: ({ codes, enviadoA }) => {
          this.codigosNuevos.set(codes);
          this.codigoEnviadoA.set(enviadoA);
          this.formCodigos.patchValue({ buyerEmail: '', note: '' });
          this.trabajando.set(false);
          this.admin.codigos().subscribe({ next: (c) => this.codigos.set(c) });
        },
        error: (e: unknown) => {
          this.error.set(toApiError(e).message);
          this.trabajando.set(false);
        },
      });
  }

  async copiarCodigos(): Promise<void> {
    const codigos = this.codigosNuevos();
    if (codigos.length === 0) return;

    try {
      await navigator.clipboard.writeText(codigos.join('\n'));
      this.copiados.set(true);
      setTimeout(() => this.copiados.set(false), 2500);
    } catch {
      this.error.set('No pudimos copiar. Selecciónalos y cópialos a mano.');
    }
  }

  activarBolsa(): void {
    if (this.formBolsa.invalid || this.trabajando()) {
      this.formBolsa.markAllAsTouched();
      return;
    }

    this.trabajando.set(true);
    this.error.set(null);
    this.aviso.set(null);

    const datos = this.formBolsa.getRawValue();

    this.admin
      .activarBolsa({
        email: datos.email,
        planCode: datos.planCode,
        paymentMethod: datos.paymentMethod,
        paymentRef: datos.paymentRef || undefined,
        note: datos.note || undefined,
      })
      .subscribe({
        next: ({ pack }) => {
          this.aviso.set(
            `Activadas ${pack.wordsTotal.toLocaleString('es')} palabras para ${datos.email}.`,
          );
          this.formBolsa.patchValue({ email: '', paymentRef: '', note: '' });
          this.trabajando.set(false);
          this.admin.bolsasRecientes().subscribe({ next: (b) => this.bolsas.set(b) });
        },
        error: (e: unknown) => {
          this.error.set(toApiError(e).message);
          this.trabajando.set(false);
        },
      });
  }

  anularCodigo(codigo: ActivationCode): void {
    if (!confirm(`Se anulará el código …${codigo.hint}. No se podrá canjear. ¿Continuar?`)) return;

    this.admin.anularCodigo(codigo.id).subscribe({
      next: () => this.admin.codigos().subscribe({ next: (c) => this.codigos.set(c) }),
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
  }

  // ── Licencias ────────────────────────────────────────────────────────────

  revocar(licencia: LicenciaAdmin): void {
    const motivo = prompt(
      `Revocar la licencia de ${licencia.user.email}. El conector dejará de responderle.\n\n` +
        'Motivo (queda guardado):',
      'Uso compartido',
    );
    if (motivo === null) return;

    this.admin.revocar(licencia.id, motivo || undefined).subscribe({
      next: (actualizada) => {
        this.reemplazar(actualizada);
        this.aviso.set(`Licencia de ${licencia.user.email} revocada.`);
      },
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
  }

  reactivar(licencia: LicenciaAdmin): void {
    this.admin.reactivar(licencia.id).subscribe({
      next: (actualizada) => {
        this.reemplazar(actualizada);
        this.aviso.set(`Licencia de ${licencia.user.email} reactivada.`);
      },
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
  }

  /** La respuesta no trae el comprador, así que se conserva el que ya teníamos. */
  private reemplazar(actualizada: LicenciaAdmin): void {
    this.licencias.update((lista) =>
      lista.map((l) => (l.id === actualizada.id ? { ...l, ...actualizada } : l)),
    );
  }

  // ── Presentación ─────────────────────────────────────────────────────────

  importe(cents: number | null, moneda = 'PEN'): string {
    if (cents === null) return '—';
    return `${moneda === 'USD' ? '$' : 'S/ '}${(cents / 100).toFixed(2)}`;
  }

  nombreCorto(alerta: Alerta): string {
    const nombres: Record<Alerta['kind'], string> = {
      VOLUMEN: 'Volumen inusual',
      SESIONES_SOLAPADAS: 'Sesiones solapadas',
      CONSULTAS_INCOHERENTES: 'Consultas incoherentes',
      EXTRACCION: 'Intentos de extracción',
    };
    return nombres[alerta.kind];
  }
}
