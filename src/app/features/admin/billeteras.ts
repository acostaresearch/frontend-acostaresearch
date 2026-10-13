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
          this.aviso.set(
            `«${billetera.nombre}» creada para ${nombreDePais(billetera.pais)}. Ya sale al pagar.`,
          );
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
