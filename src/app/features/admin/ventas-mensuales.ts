import { inject, signal } from '@angular/core';

import { mensajeDeError } from '../../core/http/api-error';
import { VentasMensuales } from '../../core/models/admin.model';
import { AdminService } from '../../core/services/admin.service';

/** Estado de la ventana de ventas y de las descargas de sus reportes mensuales. */
export class VentasMensualesAdmin {
  private readonly admin = inject(AdminService);

  /** Comparte con el resumen del panel su formato actual de importes en soles. */
  constructor(private readonly soles: (cents: number) => string) {}

  // ── Ventas mensuales ─────────────────────────────────────────────────────
  //
  // Cada mes terminado queda cerrado en el servidor con su PDF (una foto que ya
  // no cambia). Es lo que se le pasa al contador y, más adelante, lo que se
  // enviará a SUNAT. El mes en curso se descarga como borrador.

  readonly ventasAbierto = signal(false);
  readonly ventasMensuales = signal<VentasMensuales | null>(null);
  readonly cargandoVentas = signal(false);
  readonly errorVentas = signal<string | null>(null);
  /** El mes cuyo PDF se está bajando (`2026-9`), para no pedirlo dos veces. */
  readonly bajandoMes = signal<string | null>(null);

  abrirVentas(): void {
    this.ventasAbierto.set(true);
    this.errorVentas.set(null);
    this.cargandoVentas.set(true);
    this.admin.ventasMensuales().subscribe({
      next: (ventas) => {
        this.ventasMensuales.set(ventas);
        this.cargandoVentas.set(false);
      },
      error: (error: unknown) => {
        this.errorVentas.set(mensajeDeError(error));
        this.cargandoVentas.set(false);
      },
    });
  }

  cerrarVentas(): void {
    this.ventasAbierto.set(false);
  }

  /** «Septiembre 2026». */
  nombreDeMes(anio: number, mes: number): string {
    const texto = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(
      new Date(anio, mes - 1, 1),
    );
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  /** Lo cobrado en cada moneda, en una línea: «S/ 1,500.00 · US$ 998.00». */
  porMoneda(totales: Record<string, number>): string {
    return Object.entries(totales)
      .map(([moneda, cents]) =>
        moneda === 'USD' ? `US$ ${(cents / 100).toFixed(2)}` : this.soles(cents),
      )
      .join(' · ');
  }

  descargarMes(anio: number, mes: number): void {
    const clave = `${anio}-${mes}`;
    if (this.bajandoMes()) return;
    this.bajandoMes.set(clave);
    this.errorVentas.set(null);

    this.admin.pdfDelMes(anio, mes).subscribe({
      next: (respuesta) => {
        const disposicion = respuesta.headers.get('Content-Disposition') ?? '';
        const nombre = /filename="([^"]+)"/.exec(disposicion)?.[1] ?? `ventas-${clave}.pdf`;
        const url = URL.createObjectURL(respuesta.body as Blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = nombre;
        enlace.click();
        // Se suelta después: algunos navegadores aún no empezaron a guardar.
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        this.bajandoMes.set(null);
      },
      error: () => {
        this.errorVentas.set('No pudimos descargar el PDF de ese mes. Inténtalo de nuevo.');
        this.bajandoMes.set(null);
      },
    });
  }
}
