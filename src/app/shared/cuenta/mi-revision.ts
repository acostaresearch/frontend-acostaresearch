import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { mensajeDeError } from '../../core/http/api-error';
import { AuthService } from '../../core/services/auth.service';
import {
  AsesorPublico,
  CatalogosDePedido,
  NivelDeTesis,
  NOMBRE_DEL_ESTADO_PEDIDO,
  PASO_DEL_PEDIDO,
  PedidoService,
  Seguimiento,
} from '../../core/services/pedido.service';

/** El techo del servidor. Una tesis con figuras ronda los 10 MB. */
const MAXIMO_BYTES = 25 * 1024 * 1024;

/** Sin tildes y en minúsculas, para que «César» encuentre «cesar». */
const plano = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Revisión con un asesor, dentro del panel del comprador.
 *
 * NO LA VE CASI NADIE
 * -------------------
 * El servidor contesta si este correo está en la prueba; si no lo está, este
 * componente no pinta absolutamente nada y quien mira su panel ni se entera de
 * que hay algo que no ve. Es el mismo tercer estado que `Plan.soloPara`:
 * desplegado, funcionando, y existiendo solo para unos pocos.
 *
 * POR QUÉ AQUÍ Y NO EN /revision
 * ------------------------------
 * Porque quien ya compró no tiene por qué pasar por un enlace que se reparte
 * por WhatsApp ni acordarse de un código de ocho letras: entró con su cuenta,
 * así que sus revisiones se buscan por su correo y sus datos se rellenan solos.
 * La página de fuera sigue existiendo para quien llega sin cuenta.
 */
@Component({
  selector: 'app-mi-revision',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './mi-revision.html',
  styleUrl: './mi-revision.css',
})
export class MiRevision implements OnInit {
  private readonly api = inject(PedidoService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  /** Falso mientras no se sepa: así no parpadea un apartado que no le toca. */
  readonly enLaPrueba = signal(false);
  readonly revisiones = signal<Seguimiento[]>([]);
  readonly catalogos = signal<CatalogosDePedido | null>(null);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  /** En qué punto está: mirando lo suyo, eligiendo asesor o llenando la ficha. */
  readonly paso = signal<'lista' | 'directorio' | 'formulario'>('lista');
  readonly asesores = signal<AsesorPublico[]>([]);
  readonly elegido = signal<AsesorPublico | null>(null);
  readonly enviando = signal(false);

  readonly archivo = signal<File | null>(null);
  readonly errorArchivo = signal<string | null>(null);

  // ── Filtros del directorio ───────────────────────────────────────────────
  readonly fArea = signal('');
  readonly fGrado = signal('');
  readonly fMetodo = signal('');
  readonly fUniversidad = signal('');

  readonly nombreDelEstado = NOMBRE_DEL_ESTADO_PEDIDO;
  readonly frase = PASO_DEL_PEDIDO;

  readonly visibles = computed(() => {
    const area = this.fArea();
    const grado = this.fGrado();
    const metodo = this.fMetodo();
    const universidad = plano(this.fUniversidad().trim());

    return this.asesores().filter((asesor) => {
      if (area && !asesor.areasCodigos.includes(area)) return false;
      if (grado && asesor.grado !== grado) return false;
      if (metodo && !asesor.metodosCodigos.includes(metodo)) return false;
      if (universidad && !plano(asesor.universidades).includes(universidad)) return false;
      return true;
    });
  });

  readonly form = this.fb.nonNullable.group({
    universidad: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(160)]],
    nivel: ['PREGRADO' as NivelDeTesis, [Validators.required]],
    area: ['', [Validators.required]],
    metodo: ['', [Validators.required]],
    capitulo: ['', [Validators.required]],
    tema: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
    mensaje: ['', [Validators.maxLength(2000)]],
  });

  ngOnInit(): void {
    this.api.misRevisiones().subscribe({
      next: ({ beta, pedidos, catalogos }) => {
        this.enLaPrueba.set(beta);
        this.revisiones.set(pedidos);
        // Los catálogos vienen en la misma respuesta: su panel no tiene enlace
        // de convocatoria del que sacarlos.
        if (catalogos) this.prepararCatalogos(catalogos);
        this.cargando.set(false);
      },
      // En silencio: es un apartado que la mayoría no tiene, y un error rojo
      // por algo que no le toca sería ruido.
      error: () => this.cargando.set(false),
    });
  }

  private prepararCatalogos(catalogos: CatalogosDePedido): void {
    this.catalogos.set(catalogos);
    this.form.patchValue({
      area: catalogos.areas[0]?.codigo ?? '',
      metodo: catalogos.metodos[0]?.codigo ?? '',
      capitulo: catalogos.capitulos[0]?.codigo ?? '',
    });
  }

  // ── Elegir asesor ────────────────────────────────────────────────────────

  buscarAsesor(): void {
    this.paso.set('directorio');
    this.error.set(null);
    if (this.asesores().length > 0) return;

    this.api.directorioDelPanel().subscribe({
      next: (lista) => this.asesores.set(lista),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  filtrar(cual: 'fArea' | 'fGrado' | 'fMetodo' | 'fUniversidad', evento: Event): void {
    this[cual].set((evento.target as HTMLInputElement | HTMLSelectElement).value);
  }

  elegir(asesor: AsesorPublico): void {
    this.elegido.set(asesor);
    if (asesor.areasCodigos.length === 1) this.form.patchValue({ area: asesor.areasCodigos[0] });
    if (asesor.metodosCodigos.length === 1) {
      this.form.patchValue({ metodo: asesor.metodosCodigos[0] });
    }
    this.paso.set('formulario');
  }

  volver(): void {
    this.paso.set(this.elegido() ? 'directorio' : 'lista');
    if (this.paso() === 'directorio') this.elegido.set(null);
  }

  alPrincipio(): void {
    this.paso.set('lista');
    this.elegido.set(null);
  }

  // ── Mandar ───────────────────────────────────────────────────────────────

  elegirArchivo(evento: Event): void {
    const elegido = (evento.target as HTMLInputElement).files?.[0] ?? null;
    this.errorArchivo.set(null);
    this.archivo.set(null);
    if (!elegido) return;

    if (/\.doc$/i.test(elegido.name)) {
      this.errorArchivo.set(
        'Ese es un Word antiguo (.doc). Ábrelo, guárdalo como .docx y vuelve a subirlo.',
      );
      return;
    }
    if (!/\.docx$/i.test(elegido.name)) {
      this.errorArchivo.set('Sube tu trabajo en Word (.docx).');
      return;
    }
    if (elegido.size > MAXIMO_BYTES) {
      this.errorArchivo.set('El documento pasa de 25 MB.');
      return;
    }

    this.archivo.set(elegido);
  }

  peso(archivo: File): string {
    const megas = archivo.size / (1024 * 1024);
    return megas < 1 ? `${Math.round(archivo.size / 1024)} KB` : `${megas.toFixed(1)} MB`;
  }

  enviar(): void {
    const asesor = this.elegido();
    const archivo = this.archivo();
    const usuario = this.auth.user();
    if (!asesor || this.enviando()) return;

    if (!archivo) this.errorArchivo.set('Adjunta tu documento de Word.');
    if (this.form.invalid || !archivo) {
      this.form.markAllAsTouched();
      return;
    }

    this.enviando.set(true);
    this.error.set(null);

    // El nombre sale de su cuenta y el correo lo pone el servidor con el de la
    // sesión: mandar en nombre de otro no puede depender de lo que escriba el
    // navegador.
    const nombre = `${usuario?.firstName ?? ''} ${usuario?.lastName ?? ''}`.trim();

    this.api
      .enviarDesdeSuPanel(
        {
          ...this.form.getRawValue(),
          asesorId: asesor.id,
          nombre,
          email: usuario?.email ?? '',
          telefono: '',
        },
        archivo,
      )
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.aviso.set(`Se lo mandamos a ${asesor.nombre}. Te avisamos cuando responda.`);
          this.archivo.set(null);
          this.form.reset({ nivel: 'PREGRADO' });
          const catalogos = this.catalogos();
          if (catalogos) this.prepararCatalogos(catalogos);
          this.alPrincipio();
          this.recargar();
        },
        error: (e: unknown) => {
          this.enviando.set(false);
          this.error.set(mensajeDeError(e));
        },
      });
  }

  recargar(): void {
    this.api.misRevisiones().subscribe({
      next: ({ pedidos }) => this.revisiones.set(pedidos),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
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
