import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { AdminService } from '../../core/services/admin.service';
import { BillingService, Grupo } from '../../core/services/billing.service';
import { Plan } from '../../core/models/rewrite.model';
import { VentasManualesAdmin } from './ventas-manuales';

describe('Ventas manuales del administrador', () => {
  let ventas: VentasManualesAdmin;
  let api: { generarCodigos: ReturnType<typeof vi.fn>; codigos: ReturnType<typeof vi.fn>;
    subirComprobanteDeCodigo: ReturnType<typeof vi.fn>; revisarCorreos: ReturnType<typeof vi.fn> };
  let billing: { validarDescuento: ReturnType<typeof vi.fn> };
  const respuesta = { codes: ['CODIGO'], ids: ['id'], enviadoA: null, envios: [], cobro: null };

  beforeEach(() => {
    api = { generarCodigos: vi.fn(() => of(respuesta)), codigos: vi.fn(() => of([])),
      subirComprobanteDeCodigo: vi.fn(() => of({})), revisarCorreos: vi.fn(() => of([])) };
    billing = { validarDescuento: vi.fn() };
    TestBed.configureTestingModule({ providers: [
      { provide: AdminService, useValue: api }, { provide: BillingService, useValue: billing },
    ] });
    ventas = TestBed.runInInjectionContext(() => new VentasManualesAdmin(
      signal<string | null>(null), signal<string | null>(null), signal(false), signal(false),
      signal<Plan[]>([]), signal<Grupo[]>([]), signal([]), signal([]),
    ));
  });

  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  it('conserva importe y duración vacíos como valores por resolver en el servidor', () => {
    ventas.generarCodigos();
    expect(api.generarCodigos).toHaveBeenCalledWith(expect.objectContaining({
      importe: undefined, durationDays: undefined, paymentMethod: 'YAPE',
    }));
    expect(ventas.codigosNuevos()).toEqual(['CODIGO']);
    expect(ventas.formularioCodigosAbierto()).toBe(false);
  });

  it('bloquea la doble generación y conserva el formulario si falla', () => {
    const pendiente = new Subject<typeof respuesta>();
    api.generarCodigos.mockReturnValue(pendiente);
    ventas.formCodigos.controls.note.setValue('Venta por transferencia');
    ventas.abrirFormularioCodigos();
    ventas.generarCodigos();
    ventas.generarCodigos();
    expect(api.generarCodigos).toHaveBeenCalledTimes(1);
    pendiente.error(new Error('Fallo del servidor'));
    expect(ventas.trabajando()).toBe(false);
    expect(ventas.formularioCodigosAbierto()).toBe(true);
    expect(ventas.formCodigos.controls.note.value).toBe('Venta por transferencia');
  });

  it('rechaza una tanda que supera cien códigos', () => {
    ventas.cambiarModoCompradores(true);
    ventas.formCodigos.patchValue({ cantidad: 51, buyerEmails: 'ana@example.com\nluis@example.com' });
    ventas.revisionesServidor.set(new Map([
      ['ana@example.com', { correo: 'ana@example.com', problema: null, sugerencia: null }],
      ['luis@example.com', { correo: 'luis@example.com', problema: null, sugerencia: null }],
    ]));
    expect(ventas.resumenLista().codigos).toBe(102);
    ventas.generarCodigos();
    expect(api.generarCodigos).not.toHaveBeenCalled();
    expect(ventas.formCodigos.controls.buyerEmails.touched).toBe(true);
  });

  it('aplica el precio validado y registra el cupón en la nota de la venta', () => {
    billing.validarDescuento.mockReturnValue(of({ code: 'PROMO', finalPriceCents: 15900 }));
    ventas.formCodigos.controls.descuento.setValue(' PROMO ');
    ventas.aplicarDescuento();
    expect(ventas.formCodigos.controls.importe.value).toBe(159);
    ventas.generarCodigos();
    expect(api.generarCodigos).toHaveBeenCalledWith(expect.objectContaining({
      importe: 159, note: 'cupón PROMO',
    }));
    ventas.quitarDescuento();
    expect(ventas.formCodigos.controls.importe.value).toBeNull();
  });

  it('mantiene los códigos generados si falla el comprobante y libera su vista previa', () => {
    const revocar = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    api.generarCodigos.mockReturnValue(of({ ...respuesta, ids: ['uno', 'dos'] }));
    api.subirComprobanteDeCodigo.mockReturnValue(throwError(() => new Error('No se pudo subir')));
    const imagen = new File(['imagen'], 'pago.png');
    ventas.capturaCodigo.set(imagen);
    ventas.capturaCodigoPrevia.set('blob:previa');
    ventas.generarCodigos();
    expect(api.subirComprobanteDeCodigo).toHaveBeenCalledWith('uno', imagen);
    expect(api.subirComprobanteDeCodigo).toHaveBeenCalledWith('dos', imagen);
    expect(ventas.codigosNuevos()).toEqual(['CODIGO']);
    expect(ventas.error()).toContain('El código se generó, pero el comprobante no');
    expect(revocar).toHaveBeenCalledWith('blob:previa');
    expect(ventas.trabajando()).toBe(false);
  });
});
