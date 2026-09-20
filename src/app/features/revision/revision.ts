import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { fieldErrors, mensajeDeError, toApiError } from '../../core/http/api-error';
import {
  AsesorPublico,
  ConvocatoriaDeRevision,
  NivelDeTesis,
  PedidoService,
} from '../../core/services/pedido.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/** Lo que se dice junto a cada campo cuando falta o está mal. */
const MENSAJES: Record<string, string> = {
  nombre: 'Escribe tu nombre completo: es el que va en la portada de tu trabajo.',
  email: 'Escribe un correo válido: ahí te avisamos cuando esté listo.',
  telefono: 'Escribe solo números, con el prefijo si quieres.',
  universidad: 'Escribe el nombre de tu universidad.',
  tema: 'Escribe el tema de tu tesis, aunque todavía no sea el definitivo.',
};

/** El techo del servidor. Una tesis con figuras ronda los 10 MB. */
const MAXIMO_BYTES = 25 * 1024 * 1024;

/** Sin tildes y en minúsculas, para que «César» encuentre «cesar». */
const plano = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Elegir asesor y mandarle el capítulo.
 *
 * DOS PASOS, Y EL PRIMERO ES LA VITRINA
 * -------------------------------------
 * Lo primero que ve el tesista son las personas, no un formulario. Elige a
 * quién le confía su tesis —puede filtrar por área, universidad, grado y
 * enfoque, y abrir el perfil de cada uno— y solo después rellena sus datos y
 * sube el documento. Al revés sería pedirle trabajo antes de enseñarle nada.
 *
 * SIN CUENTA Y SIN PAGO
 * ---------------------
 * Ni registro ni cobro durante el piloto. Lo que se está midiendo es si alguien
 * entrega su capítulo, que es la pregunta difícil; cobrar es la fácil y se
 * cierra aparte. Cada paso que se añada aquí es gente que se cae antes del
 * final.
 *
 * NO ESTÁ ENLAZADA DESDE NINGUNA PARTE
 * ------------------------------------
 * Se llega con el enlace que se reparte a mano, y sin slug la página pregunta
 * si hay alguna convocatoria pública y, mientras no la haya, lleva a la
 * portada. Lleva `noindex` por lo mismo: una URL que nadie enlaza no es
 * secreta.
 */
@Component({
  selector: 'app-revision',
  imports: [AvisoFlotante, ReactiveFormsModule, RouterLink, SiteHeader, SiteFooter],
  templateUrl: './revision.html',
  styleUrl: './revision.css',
})
export class Revision implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(PedidoService);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  private readonly slug = inject(ActivatedRoute).snapshot.paramMap.get('slug');

  readonly convocatoria = signal<ConvocatoriaDeRevision | null>(null);
  readonly asesores = signal<AsesorPublico[]>([]);
  readonly cargando = signal(true);
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);
  readonly errores = signal<Record<string, string>>({});
  readonly codigo = signal<string | null>(null);

  /** A quién eligió. Con valor, la página enseña el formulario. */
  readonly elegido = signal<AsesorPublico | null>(null);
  /** El perfil abierto en la ventana. */
  readonly perfil = signal<AsesorPublico | null>(null);

  readonly archivo = signal<File | null>(null);
  readonly errorArchivo = signal<string | null>(null);

  // ── Filtros del directorio ───────────────────────────────────────────────
  readonly fArea = signal('');
  readonly fGrado = signal('');
  readonly fMetodo = signal('');
  readonly fUniversidad = signal('');

  readonly hayFiltros = computed(
    () => !!(this.fArea() || this.fGrado() || this.fMetodo() || this.fUniversidad().trim()),
  );

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
    nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(160)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    telefono: ['', [Validators.pattern(/^$|^[+\d\s()-]{6,20}$/)]],
    universidad: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(160)]],
    nivel: ['PREGRADO' as NivelDeTesis, [Validators.required]],
    area: ['', [Validators.required]],
    metodo: ['', [Validators.required]],
    capitulo: ['', [Validators.required]],
    tema: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
    mensaje: ['', [Validators.maxLength(2000)]],
  });

  ngOnInit(): void {
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });

    const pedir = this.slug ? this.api.verConvocatoria(this.slug) : this.api.publica();
    pedir.subscribe({
      next: (convocatoria) => {
        if (!convocatoria) {
          void this.router.navigate(['/']);
          return;
        }
        this.convocatoria.set(convocatoria);
        this.form.patchValue({
          area: convocatoria.catalogos.areas[0]?.codigo ?? '',
          metodo: convocatoria.catalogos.metodos[0]?.codigo ?? '',
          capitulo: convocatoria.catalogos.capitulos[0]?.codigo ?? '',
        });
        this.cargarDirectorio(convocatoria.slug);
      },
      error: (e: unknown) => {
        if (!this.slug) {
          void this.router.navigate(['/']);
          return;
        }
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.meta.removeTag("name='robots'");
  }

  private cargarDirectorio(slug: string): void {
    this.api.directorio(slug).subscribe({
      next: (lista) => {
        this.asesores.set(lista);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  // ── El directorio ────────────────────────────────────────────────────────

  filtrar(cual: 'fArea' | 'fGrado' | 'fMetodo' | 'fUniversidad', evento: Event): void {
    this[cual].set((evento.target as HTMLInputElement | HTMLSelectElement).value);
  }

  limpiarFiltros(): void {
    this.fArea.set('');
    this.fGrado.set('');
    this.fMetodo.set('');
    this.fUniversidad.set('');
  }

  verPerfil(asesor: AsesorPublico): void {
    this.perfil.set(asesor);
  }

  cerrarPerfil(): void {
    this.perfil.set(null);
  }

  /** Elegirlo lleva al formulario, con lo que ya sabemos de él precargado. */
  elegir(asesor: AsesorPublico): void {
    this.elegido.set(asesor);
    this.perfil.set(null);
    // Si solo trabaja un área o un enfoque, se da por supuesto: es el suyo.
    if (asesor.areasCodigos.length === 1) this.form.patchValue({ area: asesor.areasCodigos[0] });
    if (asesor.metodosCodigos.length === 1) {
      this.form.patchValue({ metodo: asesor.metodosCodigos[0] });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Volver a la vitrina sin perder lo que ya escribió. */
  cambiarDeAsesor(): void {
    this.elegido.set(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** «4,8» y no «4.8»: se lee en español. */
  nota(valor: number): string {
    return valor.toFixed(1).replace('.', ',');
  }

  estrellas(valor: number): string {
    const llenas = Math.round(valor);
    return '★★★★★'.slice(0, llenas) + '☆☆☆☆☆'.slice(0, 5 - llenas);
  }

  // ── El formulario ────────────────────────────────────────────────────────

  mensaje(campo: string): string | null {
    const delServidor = this.errores()[campo];
    if (delServidor) return delServidor;

    const control = this.form.get(campo);
    if (!control || control.valid || !(control.touched || control.dirty)) return null;
    return MENSAJES[campo] ?? 'Revisa este dato.';
  }

  /**
   * Se comprueba aquí además de en el servidor para no hacerle subir 20 MB a
   * alguien antes de decirle que su archivo no vale.
   */
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

  /** «1,4 MB», para que vea que subió lo que quería subir. */
  peso(archivo: File): string {
    const megas = archivo.size / (1024 * 1024);
    return megas < 1 ? `${Math.round(archivo.size / 1024)} KB` : `${megas.toFixed(1)} MB`;
  }

  enviar(): void {
    const convocatoria = this.convocatoria();
    const asesor = this.elegido();
    const archivo = this.archivo();
    if (!convocatoria || !asesor || this.enviando()) return;

    if (!archivo) this.errorArchivo.set('Adjunta tu documento de Word.');
    if (this.form.invalid || !archivo) {
      this.form.markAllAsTouched();
      return;
    }

    this.enviando.set(true);
    this.error.set(null);
    this.errores.set({});

    this.api
      .enviar(convocatoria.slug, { ...this.form.getRawValue(), asesorId: asesor.id }, archivo)
      .subscribe({
        next: (codigo) => {
          this.enviando.set(false);
          this.codigo.set(codigo);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        error: (e: unknown) => {
          this.enviando.set(false);
          this.errores.set(fieldErrors(toApiError(e)));
          this.error.set(mensajeDeError(e));
        },
      });
  }
}
