import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { mensajeDeError } from '../../core/http/api-error';
import { Billetera, MedioDeLaCasa } from '../../core/models/payment.model';
import { DialogoService } from '../../core/services/dialogo.service';
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
  private readonly dialogos = inject(DialogoService);

  readonly paises = PAISES;
  readonly nombreDePais = nombreDePais;

  readonly billeteras = signal<Billetera[]>([]);
  /**
   * Los medios de pago de la casa: Yape, Western Union, Hotmart y Culqi (los
   * que tengan lo suyo puesto en el servidor). Salen delante de las billeteras
   * de país. Se pueden apagar, y de Yape y Western Union cambiar a quién se
   * paga; las llaves de Hotmart y Culqi siguen en el servidor.
   */
  readonly deLaCasa = signal<MedioDeLaCasa[]>([]);
  /** El medio de la casa que se está encendiendo o apagando. */
  readonly cambiandoMedio = signal<string | null>(null);
  /** El medio cuyo QR se está subiendo. */
  readonly subiendoQrDeMedio = signal<string | null>(null);

  // ── Editar a quién se paga (Yape y Western Union) ────────────────────────

  /** El medio abierto en el formulario de edición. */
  readonly editandoMedio = signal<MedioDeLaCasa | null>(null);
  readonly guardandoMedio = signal(false);

  readonly formMedio = this.fb.nonNullable.group({
    titular: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    numero: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    // Solo Western Union: la ciudad del beneficiario.
    ciudad: ['', Validators.maxLength(120)],
  });

  /** Dónde se ofrece un medio de la casa, como se lee en la columna «País». */
  paisDeMedio(medio: MedioDeLaCasa): string {
    if (medio.pais === 'PE') return 'Perú';
    return medio.codigo === 'WESTERN_UNION' ? 'Fuera de Perú' : 'Todos los países';
  }

  /** El QR que enseña el checkout: el subido aquí o, si no hay, el de la web. */
  qrDeMedio(medio: MedioDeLaCasa): string | null {
    return medio.codigo === 'YAPE' ? this.api.urlDelQrDeYape(medio.qrVersion) : null;
  }

  private ponerMedio(actualizado: MedioDeLaCasa): void {
    this.deLaCasa.update((lista) =>
      lista.map((m) => (m.codigo === actualizado.codigo ? actualizado : m)),
    );
  }

  editarMedio(medio: MedioDeLaCasa): void {
    this.error.set(null);
    this.abierto.set(false);
    this.formMedio.reset({
      titular: medio.titular ?? '',
      numero: medio.numero ?? '',
      ciudad: medio.ciudad ?? '',
    });
    this.editandoMedio.set(medio);
  }

  cerrarEdicionDeMedio(): void {
    if (!this.guardandoMedio()) this.editandoMedio.set(null);
  }

  guardarMedio(): void {
    const medio = this.editandoMedio();
    this.formMedio.markAllAsTouched();
    if (!medio || this.formMedio.invalid || this.guardandoMedio()) return;
    const v = this.formMedio.getRawValue();

    this.guardandoMedio.set(true);
    this.api
      .cambiarMedio(medio.codigo, {
        titular: v.titular.trim(),
        numero: v.numero.trim(),
        ...(medio.codigo === 'WESTERN_UNION' && v.ciudad.trim() ? { ciudad: v.ciudad.trim() } : {}),
      })
      .subscribe({
        next: (actualizado) => {
          this.ponerMedio(actualizado);
          this.guardandoMedio.set(false);
          this.editandoMedio.set(null);
          this.aviso.set(`«${actualizado.nombre}» actualizado. Ya sale así al pagar.`);
        },
        error: (e: unknown) => {
          this.guardandoMedio.set(false);
          this.error.set(mensajeDeError(e));
        },
      });
  }

  /**
   * Apaga o enciende un medio de la casa. Apagar se pregunta: deja de ofrecerse
   * al pagar en ese momento, y Yape es por donde paga casi todo el mundo.
   */
  async encenderMedio(medio: MedioDeLaCasa): Promise<void> {
    if (this.cambiandoMedio()) return;

    if (medio.active) {
      const seguro = await this.dialogos.confirmar({
        titulo: `¿Apagar ${medio.nombre}?`,
        mensaje: 'Deja de ofrecerse al pagar ahora mismo, a todo el mundo.',
        nota: 'Lo ya pagado por ahí se sigue revisando y entregando. Puedes encenderlo cuando quieras.',
        confirmar: `Apagar ${medio.nombre}`,
      });
      if (!seguro) return;
    }

    this.cambiandoMedio.set(medio.codigo);
    this.api.cambiarMedio(medio.codigo, { active: !medio.active }).subscribe({
      next: (actualizado) => {
        this.ponerMedio(actualizado);
        this.cambiandoMedio.set(null);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.cambiandoMedio.set(null);
      },
    });
  }

  /** Sube o cambia el QR de Yape: sustituye al de la web en el checkout. */
  cambiarQrDeMedio(medio: MedioDeLaCasa, evento: Event): void {
    const imagen = this.imagenDe(evento);
    if (!imagen) return;

    this.subiendoQrDeMedio.set(medio.codigo);
    this.api.subirQrDeMedio(medio.codigo, imagen).subscribe({
      next: (actualizado) => {
        this.ponerMedio(actualizado);
        this.subiendoQrDeMedio.set(null);
        this.aviso.set(`QR de «${actualizado.nombre}» guardado. Ya sale al pagar.`);
      },
      error: (e: unknown) => {
        this.subiendoQrDeMedio.set(null);
        this.error.set(mensajeDeError(e));
      },
    });
  }
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
    // Si falla, la lista se queda con las billeteras de país.
    this.api.mediosDeLaCasa().subscribe({
      next: (medios) => this.deLaCasa.set(medios),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });

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
