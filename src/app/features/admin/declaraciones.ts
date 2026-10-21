import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { mensajeDeError } from '../../core/http/api-error';
import { Comprobante, DocumentoServicio, ServicioRegistrado } from '../../core/models/comprobante.model';
import { ComprobantesService, guardarArchivo } from '../../core/services/comprobantes.service';
import { DialogoService } from '../../core/services/dialogo.service';
import {
  CasillaDeclaracion,
  CompraRegistrada,
  DetalleDeclaracion,
  MesDeclaracion,
  TributosService,
} from '../../core/services/tributos.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

/** `"12.50"` → 1250. Vacío o inválido → null. */
function aCentimos(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  const limpio = String(texto).replace(',', '.').trim();
  if (!limpio) return null;
  const numero = Number(limpio);
  return Number.isFinite(numero) ? Math.round(numero * 100) : null;
}

function aSoles(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? '' : (cents / 100).toFixed(2);
}

/** Lo que suele ir en la línea de la boleta de un servicio; «Otro» deja escribirlo. */
export const CONCEPTOS_DE_SERVICIO = [
  'Asesoría académica',
  'Corrección y edición de texto',
  'Revisión de originalidad (Turnitin)',
  'Análisis estadístico',
];

/** Las ventanas de la pantalla: cada formulario se abre en la suya. */
type Ventana = 'ajustes' | 'compra' | 'servicio' | 'declarar' | 'pago1662';

const TITULOS_VENTANA: Record<Ventana, string> = {
  ajustes: 'Ajustes del mes',
  compra: 'Añadir compra',
  pago1662: 'IGV pagado con el 1662',
  servicio: 'Registrar servicio',
  declarar: 'Registrar como declarado',
};

/** Hoy en Lima, `AAAA-MM-DD`. */
function hoyEnLima(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * La declaración mensual del 621 (RER: IGV + renta 1.5 %).
 *
 * El servidor calcula cada mes con las boletas y las compras de aquí, encadena
 * el saldo a favor y avisa antes del vencimiento. SUNAT no deja presentar el
 * 621 por API: se presenta en «Declara Fácil» y aquí se marca «Ya declaré».
 *
 * También se registran aquí los servicios cobrados fuera de la web (asesorías
 * por WhatsApp…): cada uno lleva su boleta con IGV, que sale en minutos y
 * entra sola en el cálculo del mes.
 */
@Component({
  selector: 'app-declaraciones-admin',
  imports: [DatePipe, DecimalPipe, FormsModule, AvisoFlotante],
  templateUrl: './declaraciones.html',
  styleUrls: ['./ventana-admin.css', './declaraciones.css'],
})
export class DeclaracionesAdmin implements OnInit {
  private readonly api = inject(TributosService);
  private readonly dialogo = inject(DialogoService);
  private readonly comprobantes = inject(ComprobantesService);

  readonly meses = signal<MesDeclaracion[]>([]);
  readonly abierto = signal<DetalleDeclaracion | null>(null);
  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  // Formularios (texto en soles, como se escribe).
  vencimiento = '';
  ajuste = '';
  ajusteNota = '';
  saldoInicial = '';
  compra = { fecha: '', rucProveedor: '', razonSocial: '', serie: '', numero: '', base: '', igv: '', descripcion: '' };
  /** «Factura peruana» o «Servicio del extranjero», en la ventana de añadir compra. */
  tipoCompra: 'FACTURA' | 'EXTRANJERO' = 'FACTURA';
  extranjera = this.extranjeraVacia();
  /** La compra del extranjero cuyo pago del 1662 se está anotando. */
  readonly compra1662 = signal<CompraRegistrada | null>(null);
  pago1662 = { orden: '', fecha: '', igv: '' };
  numeroOrden = '';
  igvPagado = '';
  rentaPagada = '';

  readonly conceptos = CONCEPTOS_DE_SERVICIO;
  readonly servicios = signal<ServicioRegistrado[]>([]);
  readonly errorServicios = signal(false);
  servicio = this.servicioVacio();

  readonly ventana = signal<Ventana | null>(null);

  /** La lista viene del más reciente al más antiguo. */
  private readonly posicion = computed(() => {
    const d = this.abierto();
    return d ? this.meses().findIndex((m) => m.anio === d.anio && m.mes === d.mes) : -1;
  });
  readonly mesAnterior = computed(() => {
    const i = this.posicion();
    return i >= 0 ? (this.meses()[i + 1] ?? null) : null;
  });
  readonly mesSiguiente = computed(() => {
    const i = this.posicion();
    return i > 0 ? this.meses()[i - 1] : null;
  });

  /** Las casillas en dos grupos, IGV y renta, como se llenan en el 621. */
  readonly grupos = computed(() => {
    const casillas = this.abierto()?.calculo.casillas ?? [];
    const esRenta = (c: CasillaDeclaracion) => c.casilla === '301' || c.texto.startsWith('Renta');
    return [
      { nombre: 'IGV', casillas: casillas.filter((c) => !esRenta(c)) },
      { nombre: 'Renta', casillas: casillas.filter(esRenta) },
    ].filter((g) => g.casillas.length);
  });

  ngOnInit(): void {
    this.cargarMeses(true);
  }

  soles(cents: number | null | undefined): string {
    return `S/ ${((cents ?? 0) / 100).toFixed(2)}`;
  }

  /** `S/ 1,110`: en soles enteros, como el formulario. */
  solesEnteros(cents: number | null | undefined): string {
    return `S/ ${Math.round((cents ?? 0) / 100).toLocaleString('en-US')}`;
  }

  esTotal(c: CasillaDeclaracion): boolean {
    return c.texto.includes('a pagar');
  }

  irA(m: MesDeclaracion | null): void {
    if (m) this.abrir(m);
  }

  abrirVentana(v: Ventana): void {
    this.ventana.set(v);
  }

  cerrarVentana(): void {
    this.ventana.set(null);
  }

  tituloVentana(v: Ventana): string {
    return TITULOS_VENTANA[v];
  }

  /** Las casillas en texto, una por línea, para pegarlas donde haga falta. */
  async copiarCifras(): Promise<void> {
    const d = this.abierto();
    if (!d) return;
    const texto = d.calculo.casillas.map((c) => `${c.casilla ?? '—'}\t${c.texto}\t${c.soles}`).join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      this.aviso.set('Cifras copiadas.');
    } catch {
      this.error.set('No se pudieron copiar: el navegador no lo permitió.');
    }
  }

  estadoTexto(m: MesDeclaracion): string {
    if (m.estado === 'PAGADA') return 'Pagada';
    if (m.estado === 'DECLARADA') return 'Declarada';
    if (m.enCurso) return 'En curso';
    if (m.diasParaVencer !== null && m.diasParaVencer < 0) return 'Vencida';
    return 'Por declarar';
  }

  estadoClase(m: MesDeclaracion): string {
    if (m.estado !== 'PENDIENTE') return 'buena';
    if (m.enCurso) return '';
    return m.diasParaVencer !== null && m.diasParaVencer < 0 ? 'mala' : 'espera';
  }

  cargarMeses(elegir = false): void {
    this.cargando.set(true);
    this.api.meses().subscribe({
      next: (lista) => {
        this.meses.set(lista);
        this.cargando.set(false);
        if (elegir && lista.length) {
          // El mes que toca declarar: el pendiente más antiguo ya terminado; si no, el más reciente.
          const toca = [...lista].reverse().find((m) => !m.enCurso && m.estado === 'PENDIENTE') ?? lista[0];
          this.abrir(toca);
        }
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  abrir(m: MesDeclaracion): void {
    this.api.detalle(m.anio, m.mes).subscribe({
      next: (d) => this.mostrar(d),
      error: (e) => this.error.set(mensajeDeError(e)),
    });
  }

  private mostrar(d: DetalleDeclaracion): void {
    const otroMes = this.abierto()?.anio !== d.anio || this.abierto()?.mes !== d.mes;
    this.abierto.set(d);
    if (otroMes) this.servicios.set([]);
    this.cargarServicios(d);
    this.vencimiento = d.vencimiento ?? '';
    this.ajuste = d.ajusteBaseCents ? aSoles(d.ajusteBaseCents) : '';
    this.ajusteNota = d.ajusteNota ?? '';
    this.saldoInicial = aSoles(d.saldoFavorInicialCents);
    this.numeroOrden = d.numeroOrden ?? '';
    this.igvPagado = aSoles(d.igvPagadoCents ?? d.calculo.igvAPagarCents);
    this.rentaPagada = aSoles(d.rentaPagadaCents ?? d.calculo.rentaCents);
    const hoy = new Date().toISOString().slice(0, 10);
    const inicio = `${d.anio}-${String(d.mes).padStart(2, '0')}-01`;
    this.compra = { ...this.compra, fecha: hoy.startsWith(inicio.slice(0, 7)) ? hoy : inicio };
  }

  /** Tras cambiar un mes, la lista también cambia (el saldo pasa al siguiente). */
  private trasGuardar(d: DetalleDeclaracion, mensaje: string): void {
    this.guardando.set(false);
    this.ventana.set(null);
    this.mostrar(d);
    this.aviso.set(mensaje);
    this.cargarMeses();
  }

  private fallo(e: unknown): void {
    this.guardando.set(false);
    this.error.set(mensajeDeError(e));
  }

  guardarDatos(): void {
    const d = this.abierto();
    if (!d) return;
    this.guardando.set(true);
    this.api
      .actualizar(d.anio, d.mes, {
        vencimiento: this.vencimiento || null,
        ajusteBaseCents: aCentimos(this.ajuste) ?? 0,
        ajusteNota: this.ajusteNota.trim() || null,
        saldoFavorInicialCents: aCentimos(this.saldoInicial),
      })
      .subscribe({ next: (r) => this.trasGuardar(r, 'Guardado.'), error: (e) => this.fallo(e) });
  }

  /** Al escribir la base, el IGV se propone al 18 %. */
  proponerIgv(): void {
    const base = aCentimos(this.compra.base);
    if (base !== null) this.compra.igv = aSoles(Math.round(base * 0.18));
  }

  // ── Compras del extranjero (IGV con el 1662) ─────────────────────────────

  private extranjeraVacia() {
    return {
      fecha: hoyEnLima(),
      proveedor: '',
      documento: '',
      moneda: 'USD' as 'USD' | 'PEN',
      monto: '',
      tipoCambio: '',
      yaPagado: false,
      orden: '',
      fechaPago: hoyEnLima(),
      descripcion: '',
    };
  }

  /** La base en soles y el IGV que tocaría pagar, mientras se escribe. */
  calculoExtranjera(): { base: number; igv: number } | null {
    const f = this.extranjera;
    const monto = aCentimos(f.monto);
    const cambio = f.moneda === 'USD' ? Number(String(f.tipoCambio).replace(',', '.')) : 1;
    if (monto === null || !(cambio > 0)) return null;
    const base = Math.round(monto * cambio);
    return { base, igv: Math.round(base * 0.18) };
  }

  esExtranjera(c: CompraRegistrada): boolean {
    return c.tipo === 'EXTRANJERO';
  }

  /** Total del IGV que falta pagar con el 1662. */
  porPagar1662Cents(d: DetalleDeclaracion): number {
    return (d.porPagar1662 ?? []).reduce((suma, c) => suma + c.igvCents, 0);
  }

  agregarExtranjera(): void {
    const d = this.abierto();
    const f = this.extranjera;
    const importe = aCentimos(f.monto);
    const cambio = Number(String(f.tipoCambio).replace(',', '.'));
    if (!d || importe === null || importe <= 0) {
      this.error.set('Escribe el monto cobrado por el proveedor.');
      return;
    }
    if (f.moneda === 'USD' && !(cambio > 0)) {
      this.error.set('Escribe el tipo de cambio venta de SUNAT del día del pago.');
      return;
    }
    this.guardando.set(true);
    this.api
      .agregarCompra({
        tipo: 'EXTRANJERO',
        fecha: f.fecha,
        razonSocial: f.proveedor.trim(),
        documento: f.documento.trim(),
        monedaOriginal: f.moneda,
        importeOriginalCents: importe,
        tipoCambio: f.moneda === 'USD' ? cambio : undefined,
        ordenPago: f.yaPagado ? f.orden.trim() || undefined : undefined,
        igvPagadoEn: f.yaPagado ? f.fechaPago : undefined,
        descripcion: f.descripcion.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.extranjera = this.extranjeraVacia();
          this.api.detalle(d.anio, d.mes).subscribe((r) => this.trasGuardar(r, 'Servicio del extranjero añadido.'));
        },
        error: (e) => this.fallo(e),
      });
  }

  abrirPago1662(c: CompraRegistrada): void {
    this.compra1662.set(c);
    this.pago1662 = { orden: '', fecha: hoyEnLima(), igv: aSoles(c.igvCents) };
    this.ventana.set('pago1662');
  }

  guardarPago1662(): void {
    const d = this.abierto();
    const c = this.compra1662();
    const igv = aCentimos(this.pago1662.igv);
    if (!d || !c) return;
    this.guardando.set(true);
    this.api
      .pagar1662(c.id, {
        ordenPago: this.pago1662.orden.trim() || undefined,
        fecha: this.pago1662.fecha,
        igvCents: igv ?? undefined,
      })
      .subscribe({
        next: () => {
          this.compra1662.set(null);
          this.api.detalle(d.anio, d.mes).subscribe((r) => this.trasGuardar(r, 'Pago del 1662 anotado.'));
        },
        error: (e) => this.fallo(e),
      });
  }

  agregarCompra(): void {
    const d = this.abierto();
    const base = aCentimos(this.compra.base);
    const igv = aCentimos(this.compra.igv);
    const numero = Number(this.compra.numero);
    if (!d || base === null || igv === null || !Number.isInteger(numero)) {
      this.error.set('Revisa la base, el IGV y el número de la factura.');
      return;
    }
    this.guardando.set(true);
    this.api
      .agregarCompra({
        fecha: this.compra.fecha,
        rucProveedor: this.compra.rucProveedor.trim(),
        razonSocial: this.compra.razonSocial.trim() || undefined,
        serie: this.compra.serie.trim().toUpperCase(),
        numero,
        baseCents: base,
        igvCents: igv,
        descripcion: this.compra.descripcion.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.compra = { ...this.compra, rucProveedor: '', razonSocial: '', serie: '', numero: '', base: '', igv: '', descripcion: '' };
          this.api.detalle(d.anio, d.mes).subscribe((r) => this.trasGuardar(r, 'Compra añadida.'));
        },
        error: (e) => this.fallo(e),
      });
  }

  async borrarCompra(id: string): Promise<void> {
    const d = this.abierto();
    if (!d) return;
    const si = await this.dialogo.confirmar({ titulo: 'Quitar esta compra', confirmar: 'Quitar', tono: 'peligro' });
    if (!si) return;
    this.api.borrarCompra(id).subscribe({
      next: () => this.api.detalle(d.anio, d.mes).subscribe((r) => this.trasGuardar(r, 'Compra quitada.')),
      error: (e) => this.fallo(e),
    });
  }

  // ── Servicios cobrados fuera de la web ───────────────────────────────────

  private servicioVacio() {
    return {
      concepto: CONCEPTOS_DE_SERVICIO[0],
      otroConcepto: '',
      monto: '',
      moneda: 'PEN' as 'PEN' | 'USD',
      fecha: hoyEnLima(),
      medio: '',
      tipoDoc: '-' as DocumentoServicio,
      numDoc: '',
      nombre: '',
      pais: '',
      email: '',
      nota: '',
    };
  }

  private cargarServicios(d: DetalleDeclaracion): void {
    this.comprobantes.servicios(d.anio, d.mes).subscribe({
      next: (lista) => {
        const ahora = this.abierto();
        if (ahora?.anio !== d.anio || ahora?.mes !== d.mes) return;
        this.servicios.set(lista);
        this.errorServicios.set(false);
      },
      error: () => this.errorServicios.set(true),
    });
  }

  /** Recarga la lista y las cifras: la boleta nueva cambia el cálculo. */
  actualizarServicios(): void {
    const d = this.abierto();
    if (d) this.abrir(d);
  }

  pideNumero(): boolean {
    return ['1', '4', '7'].includes(this.servicio.tipoDoc);
  }

  boletaDe(s: ServicioRegistrado): Comprobante | null {
    return [...s.comprobantes].reverse().find((c) => c.tipo === '03') ?? null;
  }

  notaDe(s: ServicioRegistrado): Comprobante | null {
    return s.comprobantes.find((c) => c.tipo === '07') ?? null;
  }

  estadoServicio(s: ServicioRegistrado): { texto: string; clase: string } {
    const boleta = this.boletaDe(s);
    const nota = this.notaDe(s);
    if (nota) return { texto: `Anulada · ${nota.serie}-${nota.numero}`, clase: 'mala' };
    if (!boleta) return { texto: 'Emitiéndose', clase: 'espera' };
    const numero = `${boleta.serie}-${boleta.numero}`;
    if (boleta.estado === 'ACEPTADO' || boleta.estado === 'OBSERVADO') return { texto: `${numero} · Aceptada`, clase: 'buena' };
    if (boleta.estado === 'RECHAZADO') return { texto: `${numero} · Rechazada`, clase: 'mala' };
    if (boleta.estado === 'PENDIENTE') return { texto: `${numero} · Enviándose`, clase: 'espera' };
    return { texto: `${numero} · Revisar en SOL`, clase: 'espera' };
  }

  detalleServicio(s: ServicioRegistrado): string {
    return [s.medio, s.nota].filter((x) => !!x).join(' · ');
  }

  importe(s: ServicioRegistrado): string {
    return s.moneda === 'USD' ? `US$ ${(s.importeCents / 100).toFixed(2)}` : this.soles(s.importeCents);
  }

  sePuedeAnular(s: ServicioRegistrado): boolean {
    const boleta = this.boletaDe(s);
    return !!boleta && !this.notaDe(s) && (boleta.estado === 'ACEPTADO' || boleta.estado === 'OBSERVADO');
  }

  registrarServicio(): void {
    const f = this.servicio;
    const importeCents = aCentimos(f.monto);
    const concepto = (f.concepto === 'otro' ? f.otroConcepto : f.concepto).trim();
    if (importeCents === null || importeCents <= 0) {
      this.error.set('Escribe el monto cobrado.');
      return;
    }
    if (concepto.length < 3) {
      this.error.set('Escribe qué servicio fue.');
      return;
    }
    // Hoy: la hora de ahora. Otro día: el mediodía de Lima de ese día.
    const pagadoEn = f.fecha === hoyEnLima() ? new Date().toISOString() : `${f.fecha}T12:00:00-05:00`;
    this.guardando.set(true);
    this.comprobantes
      .registrarServicio({
        concepto,
        importeCents,
        moneda: f.moneda,
        pagadoEn,
        medio: f.medio || undefined,
        clienteTipoDoc: f.tipoDoc,
        clienteNumDoc: this.pideNumero() ? f.numDoc.trim().toUpperCase() : undefined,
        clienteNombre: f.nombre.trim(),
        clientePais: f.tipoDoc === '0' ? f.pais.trim().toUpperCase() : undefined,
        clienteEmail: f.email.trim() || undefined,
        nota: f.nota.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.guardando.set(false);
          this.ventana.set(null);
          this.servicio = this.servicioVacio();
          this.aviso.set('Servicio registrado. Su boleta sale en unos minutos.');
          const d = this.abierto();
          if (d) this.cargarServicios(d);
        },
        error: (e) => this.fallo(e),
      });
  }

  async quitarServicio(s: ServicioRegistrado): Promise<void> {
    const si = await this.dialogo.confirmar({
      titulo: 'Quitar este servicio',
      mensaje: 'Solo se puede mientras aún no tiene boleta.',
      confirmar: 'Quitar',
      tono: 'peligro',
    });
    if (!si) return;
    this.comprobantes.quitarServicio(s.id).subscribe({
      next: () => {
        this.aviso.set('Servicio quitado.');
        const d = this.abierto();
        if (d) this.cargarServicios(d);
      },
      error: (e) => this.error.set(mensajeDeError(e)),
    });
  }

  descargarBoleta(s: ServicioRegistrado): void {
    const boleta = this.boletaDe(s);
    if (!boleta) return;
    this.comprobantes.archivo(boleta.id, 'pdf').subscribe({
      next: (r) => guardarArchivo(r, `${boleta.serie}-${boleta.numero}.pdf`),
      error: (e) => this.error.set(mensajeDeError(e)),
    });
  }

  async anularServicio(s: ServicioRegistrado): Promise<void> {
    const boleta = this.boletaDe(s);
    if (!boleta) return;
    const motivo = await this.dialogo.pedirTexto({
      titulo: `Anular la boleta ${boleta.serie}-${boleta.numero}`,
      mensaje:
        'Se emite una nota de crédito que la anula ante SUNAT y el servicio queda anulado. Una nota ' +
        'aceptada no se puede deshacer. Si solo había un dato mal, después registra el servicio de nuevo.',
      nota: 'El motivo va en la nota y en el correo al cliente.',
      campo: { etiqueta: 'Motivo', placeholder: 'Ej.: monto equivocado', obligatorio: true, maxlength: 200 },
      confirmar: 'Anular',
      tono: 'peligro',
    });
    if (!motivo?.trim()) return;
    this.guardando.set(true);
    this.comprobantes.anular(boleta.id, motivo.trim(), false).subscribe({
      next: (r) => {
        this.guardando.set(false);
        this.aviso.set(
          r.estado === 'ACEPTADO' || r.estado === 'OBSERVADO'
            ? `Boleta anulada con la nota ${r.nota}.`
            : `Nota ${r.nota} creada; SUNAT aún no la acepta (se reintenta sola).`,
        );
        this.actualizarServicios();
      },
      error: (e) => this.fallo(e),
    });
  }

  async declarar(): Promise<void> {
    const d = this.abierto();
    if (!d) return;
    this.guardando.set(true);
    this.api
      .declarar(d.anio, d.mes, {
        numeroOrden: this.numeroOrden.trim() || undefined,
        igvPagadoCents: aCentimos(this.igvPagado),
        rentaPagadaCents: aCentimos(this.rentaPagada),
      })
      .subscribe({ next: (r) => this.trasGuardar(r, `${d.nombre} quedó como declarado.`), error: (e) => this.fallo(e) });
  }

  async reabrir(): Promise<void> {
    const d = this.abierto();
    if (!d) return;
    const si = await this.dialogo.confirmar({
      titulo: `Reabrir ${d.nombre}`,
      mensaje: 'El cálculo vuelve a hacerse con los datos de hoy (por ejemplo, para una rectificatoria).',
      confirmar: 'Reabrir',
    });
    if (!si) return;
    this.guardando.set(true);
    this.api.reabrir(d.anio, d.mes).subscribe({ next: (r) => this.trasGuardar(r, 'Reabierto.'), error: (e) => this.fallo(e) });
  }
}
