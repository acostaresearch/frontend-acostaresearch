import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { mensajeDeError } from '../../core/http/api-error';
import { Billetera } from '../../core/models/payment.model';
import { PaymentService } from '../../core/services/payment.service';
import { PAISES, nombreDePais } from '../../shared/contenido/paises';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

/**
 * Las billeteras digitales de cada país: Deuna en Ecuador, Nequi en Colombia.
 *
 * Son a un país lo que Yape a Perú. El dueño da de alta aquí la de cada país;
 * desde ese momento sale en el checkout con el país delante, y los comprobantes
 * que entran por ella le llegan al administrador de ese país, que es quien los
 * aprueba. Solo la ve el dueño: carga lo suyo al abrirse.
 */
@Component({
  selector: 'app-billeteras-admin',
  imports: [AvisoFlotante, DatePipe, ReactiveFormsModule],
  templateUrl: './billeteras.html',
  styleUrls: ['./embudo.css', './instituciones.css'],
})
export class BilleterasAdmin implements OnInit {
  private readonly api = inject(PaymentService);
  private readonly fb = inject(FormBuilder);

  readonly paises = PAISES;
  readonly nombreDePais = nombreDePais;

  readonly billeteras = signal<Billetera[]>([]);
  readonly cargando = signal(true);
  readonly creando = signal(false);
  readonly abierto = signal(false);
  /** La que se está encendiendo o apagando, para apagar su botón. */
  readonly cambiando = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]],
    pais: ['', Validators.required],
    // Dólares por defecto: fuera de Perú es lo habitual, y es el precio que ya
    // tienen los planes para PayPal y Western Union.
    moneda: ['USD', Validators.required],
    titular: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    numero: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    instrucciones: ['', Validators.maxLength(500)],
  });

  // ── La imagen del QR ─────────────────────────────────────────────────────
  // Opcional. Se puede elegir al crear la billetera o subir después desde su
  // fila; subir otra sustituye a la anterior.

  /** Lo que acepta el servidor, para avisar antes de subir en balde. */
  private readonly FORMATOS = ['image/png', 'image/jpeg', 'image/webp'];
  private readonly MAX_BYTES = 6 * 1024 * 1024;

  /** El QR elegido en el formulario de alta, a la espera de crear la billetera. */
  readonly qrDelAlta = signal<File | null>(null);
  /** La billetera cuyo QR se está subiendo, para apagar su botón. */
  readonly subiendoQr = signal<string | null>(null);

  urlDelQr(billetera: Billetera): string | null {
    return this.api.urlDelQr(billetera);
  }

  /** Lee el archivo de un `<input type="file">` y lo da por bueno o dice por qué no. */
  private imagenDe(evento: Event): File | null {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0] ?? null;
    // Se vacía para que elegir dos veces el mismo archivo vuelva a avisar.
    input.value = '';
    if (!archivo) return null;

    if (!this.FORMATOS.includes(archivo.type)) {
      this.error.set('El QR tiene que ser una imagen PNG, JPG o WebP.');
      return null;
    }
    if (archivo.size > this.MAX_BYTES) {
      this.error.set('La imagen pesa más de 6 MB. Usa una captura del QR en vez de una foto.');
      return null;
    }
    return archivo;
  }

  elegirQrDelAlta(evento: Event): void {
    this.qrDelAlta.set(this.imagenDe(evento));
  }

  /** Sube o cambia el QR de una billetera que ya existe. */
  cambiarQr(billetera: Billetera, evento: Event): void {
    const imagen = this.imagenDe(evento);
    if (imagen) this.subirQr(billetera, imagen);
  }

  private subirQr(billetera: Billetera, imagen: File, alTerminar?: () => void): void {
    this.subiendoQr.set(billetera.id);
    this.api.subirQrDeBilletera(billetera.id, imagen).subscribe({
      next: (actualizada) => {
        this.billeteras.update((lista) =>
          lista.map((b) => (b.id === actualizada.id ? actualizada : b)),
        );
        this.subiendoQr.set(null);
        if (alTerminar) alTerminar();
        else this.aviso.set(`QR de «${actualizada.nombre}» guardado. Ya sale al pagar.`);
      },
      error: (e: unknown) => {
        this.subiendoQr.set(null);
        this.error.set(
          `La billetera «${billetera.nombre}» está, pero su QR no se guardó: ${mensajeDeError(e)} ` +
            'Súbelo otra vez desde su fila.',
        );
      },
    });
  }

  ngOnInit(): void {
    this.api.billeteras().subscribe({
      next: (lista) => {
        this.billeteras.set(lista);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  crear(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.creando()) return;
    const v = this.form.getRawValue();

    this.creando.set(true);
    this.api
      .crearBilletera({
        nombre: v.nombre.trim(),
        pais: v.pais,
        moneda: v.moneda,
        titular: v.titular.trim(),
        numero: v.numero.trim(),
        instrucciones: v.instrucciones.trim() || undefined,
      })
      .subscribe({
        next: (billetera) => {
          this.billeteras.update((lista) => [...lista, billetera]);
          this.creando.set(false);
          this.abierto.set(false);
          this.form.reset();
          const creada = `«${billetera.nombre}» creada para ${nombreDePais(billetera.pais)}.`;
          // El QR va en una segunda petición: la imagen viaja como cuerpo
          // crudo y hace falta que la billetera exista para colgársela.
          const qr = this.qrDelAlta();
          this.qrDelAlta.set(null);
          if (qr) {
            this.subirQr(billetera, qr, () => this.aviso.set(`${creada} Ya sale al pagar, con su QR.`));
          } else {
            this.aviso.set(`${creada} Ya sale al pagar.`);
          }
        },
        error: (e: unknown) => {
          this.creando.set(false);
          this.error.set(mensajeDeError(e));
        },
      });
  }

  /** Apagada deja de ofrecerse al pagar; lo ya cobrado por ella no se toca. */
  encender(billetera: Billetera): void {
    if (this.cambiando()) return;
    this.cambiando.set(billetera.id);
    this.api.cambiarBilletera(billetera.id, { active: !billetera.active }).subscribe({
      next: (actualizada) => {
        this.billeteras.update((lista) =>
          lista.map((b) => (b.id === actualizada.id ? actualizada : b)),
        );
        this.cambiando.set(null);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.cambiando.set(null);
      },
    });
  }
}
