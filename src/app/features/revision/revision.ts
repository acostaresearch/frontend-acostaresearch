import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { fieldErrors, mensajeDeError, toApiError } from '../../core/http/api-error';
import {
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

/**
 * El formulario del tesista: manda su capítulo y recibe observaciones.
 *
 * SIN CUENTA Y SIN PAGO
 * ---------------------
 * Ni registro ni cobro durante el piloto. Lo que se está midiendo es si alguien
 * entrega su capítulo a desconocidos, que es la pregunta difícil; cobrar es la
 * fácil y se cierra aparte. Cada paso que se le añade aquí es gente que se cae
 * antes de llegar al final.
 *
 * NO ESTÁ ENLAZADA DESDE NINGUNA PARTE
 * ------------------------------------
 * Igual que la ficha del asesor: se llega con el enlace que se reparte a mano,
 * y sin slug la página pregunta si hay alguna convocatoria pública y, mientras
 * no la haya, lleva a la portada. Lleva `noindex` por lo mismo: una URL que
 * nadie enlaza no es secreta.
 *
 * LO QUE SE LLEVA ES UN CÓDIGO
 * ----------------------------
 * Con él consulta su pedido en /pedido/<codigo>, sin cuenta. Por eso el acuse
 * insiste en que lo guarde: es lo único que tiene.
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
  readonly cargando = signal(true);
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);
  readonly errores = signal<Record<string, string>>({});
  /** Con valor, la página enseña el acuse con su código y no el formulario. */
  readonly codigo = signal<string | null>(null);

  readonly archivo = signal<File | null>(null);
  readonly errorArchivo = signal<string | null>(null);

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
        // Lo primero de cada lista, para que el formulario no arranque vacío.
        this.form.patchValue({
          area: convocatoria.catalogos.areas[0]?.codigo ?? '',
          metodo: convocatoria.catalogos.metodos[0]?.codigo ?? '',
          capitulo: convocatoria.catalogos.capitulos[0]?.codigo ?? '',
        });
        this.cargando.set(false);
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
    const archivo = this.archivo();
    if (!convocatoria || this.enviando()) return;

    if (!archivo) {
      this.errorArchivo.set('Adjunta tu documento de Word.');
    }
    if (this.form.invalid || !archivo) {
      this.form.markAllAsTouched();
      return;
    }

    this.enviando.set(true);
    this.error.set(null);
    this.errores.set({});

    this.api.enviar(convocatoria.slug, this.form.getRawValue(), archivo).subscribe({
      next: (codigo) => {
        this.enviando.set(false);
        this.codigo.set(codigo);
      },
      error: (e: unknown) => {
        this.enviando.set(false);
        this.errores.set(fieldErrors(toApiError(e)));
        this.error.set(mensajeDeError(e));
      },
    });
  }
}
