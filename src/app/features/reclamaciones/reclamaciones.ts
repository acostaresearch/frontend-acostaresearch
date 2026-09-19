import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { fieldErrors, mensajeDeError, toApiError } from '../../core/http/api-error';
import { AuthService } from '../../core/services/auth.service';
import {
  NOMBRE_DEL_BIEN,
  NOMBRE_DEL_DOCUMENTO,
  NOMBRE_DEL_TIPO,
  Proveedor,
  Reclamo,
  ReclamoService,
  TipoDeBien,
  TipoDeDocumento,
  TipoDeHoja,
  fechaEnLima,
  soles,
} from '../../core/services/reclamo.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

/** Lo que se dice junto a cada campo cuando falta o está mal. */
const MENSAJES: Record<string, string> = {
  nombre: 'Escribe tu nombre completo.',
  numeroDocumento: 'Escribe tu número de documento, sin espacios ni guiones.',
  domicilio: 'Escribe tu domicilio.',
  telefono: 'Escribe solo números, con el prefijo si quieres.',
  email: 'Escribe un correo válido: ahí te llegan la copia y la respuesta.',
  apoderado: 'Escribe el nombre de tu padre, madre o apoderado.',
  montoReclamado: 'Escribe solo el importe, por ejemplo 120 o 120.50.',
  descripcionBien: 'Di qué compraste o contrataste.',
  detalle: 'Cuenta qué pasó, con al menos una frase.',
  pedido: 'Di qué solución pides.',
};

/**
 * El Libro de Reclamaciones virtual.
 *
 * Lo pide la ley a quien vende a consumidores en el Perú, y tiene que estar a la
 * vista y sin cuenta: por eso vive en una página pública enlazada desde el pie.
 * Los apartados y sus nombres son los del anexo del reglamento, en el mismo
 * orden, para que la hoja que se imprime sea reconocible como tal.
 *
 * Al enviarla, el formulario se sustituye por la hoja registrada con su número:
 * es la constancia del consumidor, y desde ahí la imprime o la guarda en PDF con
 * el propio navegador. La misma copia le llega por correo.
 */
@Component({
  selector: 'app-reclamaciones',
  imports: [AvisoFlotante, ReactiveFormsModule, RouterLink, SiteHeader, SiteFooter],
  templateUrl: './reclamaciones.html',
  styleUrl: './reclamaciones.css',
})
export class Reclamaciones implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ReclamoService);
  private readonly auth = inject(AuthService);

  readonly tipo = NOMBRE_DEL_TIPO;
  readonly bien = NOMBRE_DEL_BIEN;
  readonly documento = NOMBRE_DEL_DOCUMENTO;
  readonly fecha = fechaEnLima;
  readonly soles = soles;
  readonly hoy = fechaEnLima(new Date().toISOString());

  readonly proveedor = signal<Proveedor | null>(null);
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);
  /** Lo que el servidor dijo de cada campo en el último envío. */
  readonly errores = signal<Record<string, string>>({});
  /** La hoja registrada. Con valor, la página enseña la hoja y no el formulario. */
  readonly hoja = signal<Reclamo | null>(null);
  readonly correoEnviado = signal(true);

  readonly form = this.fb.nonNullable.group({
    tipo: ['RECLAMO' as TipoDeHoja, [Validators.required]],
    nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(160)]],
    tipoDocumento: ['DNI' as TipoDeDocumento, [Validators.required]],
    numeroDocumento: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9]{6,15}$/)]],
    domicilio: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(250)]],
    telefono: ['', [Validators.pattern(/^[+\d\s()-]{6,20}$/)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    menorDeEdad: [false],
    apoderado: ['', [Validators.maxLength(160)]],
    tipoBien: ['SERVICIO' as TipoDeBien, [Validators.required]],
    montoReclamado: ['', [Validators.pattern(/^\d{1,6}([.,]\d{1,2})?$/)]],
    descripcionBien: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(500)]],
    detalle: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(3000)]],
    pedido: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(2000)]],
  });

  constructor() {
    // Lo que dijo el servidor era sobre lo que se envió; en cuanto se corrige
    // algo, deja de valer y se vuelve a mirar el formulario.
    this.form.valueChanges.subscribe(() => {
      if (Object.keys(this.errores()).length > 0) this.errores.set({});
    });

    // El apoderado solo se pide a un menor de edad.
    this.form.controls.menorDeEdad.valueChanges.subscribe((menor) => {
      const apoderado = this.form.controls.apoderado;
      apoderado.setValidators(
        menor
          ? [Validators.required, Validators.minLength(3), Validators.maxLength(160)]
          : [Validators.maxLength(160)],
      );
      apoderado.updateValueAndValidity({ emitEvent: false });
    });
  }

  ngOnInit(): void {
    this.api.proveedor().subscribe({ next: (proveedor) => this.proveedor.set(proveedor) });
    this.rellenarConLaSesion();
  }

  /** El error de un campo: el del servidor si lo hay, si no el del formulario ya tocado. */
  errorDe(campo: string): string | null {
    const delServidor = this.errores()[campo];
    if (delServidor) return delServidor;

    const control = this.form.get(campo);
    return control && control.invalid && control.touched ? (MENSAJES[campo] ?? 'Revisa este campo.') : null;
  }

  enviar(): void {
    if (this.enviando()) return;
    this.error.set(null);
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      this.error.set('Falta algún dato o hay uno mal escrito. Están marcados en rojo.');
      return;
    }

    const valores = this.form.getRawValue();
    const monto = valores.montoReclamado.trim();

    this.enviando.set(true);
    this.api
      .registrar({
        ...valores,
        montoReclamado: monto === '' ? null : Number(monto.replace(',', '.')),
      })
      .subscribe({
        next: ({ reclamo, correoEnviado }) => {
          this.enviando.set(false);
          this.hoja.set(reclamo);
          this.correoEnviado.set(correoEnviado);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        error: (e: unknown) => {
          this.enviando.set(false);
          this.errores.set(fieldErrors(toApiError(e)));
          this.error.set(mensajeDeError(e));
        },
      });
  }

  /** Imprimir o guardar en PDF: el navegador ofrece las dos cosas en el mismo diálogo. */
  imprimir(): void {
    window.print();
  }

  otraHoja(): void {
    this.hoja.set(null);
    this.error.set(null);
    this.form.reset();
    this.rellenarConLaSesion();
  }

  /** Con sesión iniciada, nombre y correo ya se saben: no se hacen escribir otra vez. */
  private rellenarConLaSesion(): void {
    const usuario = this.auth.user();
    if (usuario) {
      this.form.patchValue({
        nombre: `${usuario.firstName} ${usuario.lastName}`.trim(),
        email: usuario.email,
      });
    }
  }
}
