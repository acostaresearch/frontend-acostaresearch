import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';

import { fieldErrors, mensajeDeError, toApiError } from '../../core/http/api-error';
import {
  AsesorService,
  ConvocatoriaPublica,
  GradoDeAsesor,
  TipoDeDocumento,
} from '../../core/services/asesor.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/** Lo que se dice junto a cada campo cuando falta o está mal. */
const MENSAJES: Record<string, string> = {
  nombre: 'Escribe tu nombre completo, como figura en tu documento.',
  numeroDocumento: 'Escribe tu número de documento, sin espacios ni guiones.',
  email: 'Escribe un correo válido: por ahí te contestamos.',
  telefono: 'Escribe un teléfono de contacto.',
  gradoUniversidad: 'Escribe la universidad que te otorgó el grado.',
  gradoAnio: 'Escribe el año en cuatro cifras.',
  enlaceCv: 'Pega el enlace completo, empezando por https://',
  especialidad: 'Di cuál es tu especialidad.',
  presentacion: 'Cuéntanos a cuántos tesistas has asesorado y en qué.',
};

/**
 * La ficha del asesor que quiere revisar tesis.
 *
 * NO ESTÁ ENLAZADA DESDE NINGUNA PARTE
 * ------------------------------------
 * Se llega con el enlace de una convocatoria —/asesores/<slug>— que el
 * administrador reparte a mano. Sin slug, la página pregunta si hay alguna
 * convocatoria marcada como pública y, mientras no la haya, lleva a la portada:
 * así el registro está desplegado y funcionando sin que exista para quien no
 * fue invitado. El día que se abra al público basta con marcarla en el panel.
 *
 * Por lo mismo lleva `noindex`: una URL que nadie enlaza no es secreta, y
 * Google encuentra las que nadie enlazó. Sin esta etiqueta, el piloto acabaría
 * en los resultados de búsqueda antes de estar listo.
 *
 * SIN CUENTA
 * ----------
 * Quien postula todavía no es nadie aquí, así que no se le pide registrarse
 * para dejar su ficha. Tampoco se le piden cuenta bancaria ni copia del
 * documento: eso hace falta para pagarle y para firmar el acuerdo, o sea
 * después de aprobarlo.
 */
@Component({
  selector: 'app-asesores',
  imports: [AvisoFlotante, ReactiveFormsModule, SiteHeader, SiteFooter],
  templateUrl: './asesores.html',
  styleUrl: './asesores.css',
})
export class Asesores implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AsesorService);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  private readonly slug = inject(ActivatedRoute).snapshot.paramMap.get('slug');

  readonly convocatoria = signal<ConvocatoriaPublica | null>(null);
  readonly cargando = signal(true);
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);
  /** Lo que el servidor dijo de cada campo en el último envío. */
  readonly errores = signal<Record<string, string>>({});
  /** Con valor, la página enseña el acuse y no el formulario. */
  readonly recibida = signal<string | null>(null);

  /** Las casillas marcadas. Van aparte del formulario: son listas, no campos. */
  readonly areas = signal<string[]>([]);
  readonly metodos = signal<string[]>([]);
  readonly faltaArea = signal(false);
  readonly faltaMetodo = signal(false);

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(160)]],
    tipoDocumento: ['DNI' as TipoDeDocumento, [Validators.required]],
    numeroDocumento: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9]{6,15}$/)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    telefono: ['', [Validators.required, Validators.pattern(/^[+\d\s()-]{6,20}$/)]],
    grado: ['MAGISTER' as GradoDeAsesor, [Validators.required]],
    gradoUniversidad: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(160)]],
    gradoAnio: ['', [Validators.pattern(/^(19|20)\d{2}$/)]],
    registroSunedu: ['', [Validators.maxLength(255)]],
    enlaceCv: ['', [Validators.pattern(/^$|^https?:\/\/\S+$/i)]],
    especialidad: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(160)]],
    universidades: ['', [Validators.maxLength(500)]],
    anosExperiencia: [0, [Validators.required, Validators.min(0), Validators.max(60)]],
    presentacion: ['', [Validators.required, Validators.minLength(40), Validators.maxLength(2000)]],
    aceptaReglas: [false, [Validators.requiredTrue]],
  });

  ngOnInit(): void {
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });

    const pedir = this.slug ? this.api.verConvocatoria(this.slug) : this.api.publica();
    pedir.subscribe({
      next: (convocatoria) => {
        // Sin slug y sin convocatoria pública, esta página no existe todavía.
        if (!convocatoria) {
          void this.router.navigate(['/']);
          return;
        }
        this.convocatoria.set(convocatoria);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        // Un enlace que no vale tampoco confirma que el registro exista.
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
    // La etiqueta es de esta página: si se queda puesta, deja fuera del índice
    // a la siguiente que visite quien navegue sin recargar.
    this.meta.removeTag("name='robots'");
  }

  /** El mensaje de un campo: primero lo que dijo el servidor, luego lo nuestro. */
  mensaje(campo: string): string | null {
    const delServidor = this.errores()[campo];
    if (delServidor) return delServidor;

    const control = this.form.get(campo);
    if (!control || control.valid || !(control.touched || control.dirty)) return null;
    return MENSAJES[campo] ?? 'Revisa este dato.';
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

  enviar(): void {
    const convocatoria = this.convocatoria();
    if (!convocatoria || this.enviando()) return;

    // Las listas no son campos del formulario, así que se comprueban aparte.
    this.faltaArea.set(this.areas().length === 0);
    this.faltaMetodo.set(this.metodos().length === 0);

    if (this.form.invalid || this.faltaArea() || this.faltaMetodo()) {
      this.form.markAllAsTouched();
      return;
    }

    this.enviando.set(true);
    this.error.set(null);
    this.errores.set({});

    const valores = this.form.getRawValue();
    this.api
      .postular(convocatoria.slug, {
        ...valores,
        gradoAnio: valores.gradoAnio === '' ? null : valores.gradoAnio,
        areas: this.areas(),
        metodos: this.metodos(),
      })
      .subscribe({
        next: (mensaje) => {
          this.enviando.set(false);
          this.recibida.set(mensaje || 'Ficha recibida.');
        },
        error: (e: unknown) => {
          this.enviando.set(false);
          this.errores.set(fieldErrors(toApiError(e)));
          this.error.set(mensajeDeError(e));
        },
      });
  }
}
