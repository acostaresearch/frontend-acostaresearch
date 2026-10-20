import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ActivationCode, PagoAdmin } from '../../core/models/admin.model';
import { Billetera, MedioDeLaCasa, PagoPorRevisar, PagoRevisado } from '../../core/models/payment.model';
import { DialogoService } from '../../core/services/dialogo.service';
import { PaymentService } from '../../core/services/payment.service';
import { unirAccesos } from './accesos';
import { BilleterasAdmin } from './billeteras';

const deuna: Billetera = {
  id: 'b1',
  nombre: 'Deuna',
  pais: 'EC',
  moneda: 'USD',
  titular: 'Ana Paz',
  numero: '0991234567',
  instrucciones: null,
  active: true,
};

const yape: MedioDeLaCasa = {
  codigo: 'YAPE', nombre: 'Yape', pais: 'PE', moneda: 'PEN', active: true, editable: true,
  titular: 'Benicio Acosta', numero: '999111222', ciudad: null, tieneQr: false, qrVersion: null,
};
const westernUnion: MedioDeLaCasa = {
  codigo: 'WESTERN_UNION', nombre: 'Western Union', pais: null, moneda: 'USD', active: true, editable: true,
  titular: 'Benicio Acosta', numero: '12345678', ciudad: 'Trujillo', tieneQr: false, qrVersion: null,
};
const hotmart: MedioDeLaCasa = {
  codigo: 'HOTMART', nombre: 'Hotmart', pais: null, moneda: 'USD', active: true, editable: false,
  titular: null, numero: null, ciudad: null, tieneQr: false, qrVersion: null,
};

describe('Billeteras de país en el panel', () => {
  let dialogos: { confirmar: ReturnType<typeof vi.fn> };
  let api: {
    mediosDeLaCasa: ReturnType<typeof vi.fn>;
    cambiarMedio: ReturnType<typeof vi.fn>;
    subirQrDeMedio: ReturnType<typeof vi.fn>;
    urlDelQrDeYape: ReturnType<typeof vi.fn>;
    billeteras: ReturnType<typeof vi.fn>;
    crearBilletera: ReturnType<typeof vi.fn>;
    cambiarBilletera: ReturnType<typeof vi.fn>;
    subirQrDeBilletera: ReturnType<typeof vi.fn>;
    urlDelQr: ReturnType<typeof vi.fn>;
  };
  let panel: BilleterasAdmin;

  beforeEach(() => {
    TestBed.resetTestingModule();
    api = {
      mediosDeLaCasa: vi.fn(() => of([yape, westernUnion, hotmart])),
      cambiarMedio: vi.fn(),
      subirQrDeMedio: vi.fn(),
      urlDelQrDeYape: vi.fn((version: number | null) => (version ? `/qr-subido?v=${version}` : '/qr-pago/qr-code.jpeg')),
      billeteras: vi.fn(() => of([deuna])),
      crearBilletera: vi.fn(),
      cambiarBilletera: vi.fn(),
      subirQrDeBilletera: vi.fn(),
      urlDelQr: vi.fn(),
    };
    dialogos = { confirmar: vi.fn(async () => true) };
    TestBed.configureTestingModule({
      providers: [
        { provide: PaymentService, useValue: api },
        { provide: DialogoService, useValue: dialogos },
      ],
    });
    panel = TestBed.runInInjectionContext(() => new BilleterasAdmin());
    panel.ngOnInit();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('carga las que hay al abrirse', () => {
    expect(panel.billeteras()).toEqual([deuna]);
    expect(panel.cargando()).toBe(false);
  });

  it('delante salen los medios de la casa, cada uno con dónde se ofrece', () => {
    expect(panel.deLaCasa().map((m) => `${panel.paisDeMedio(m)} · ${m.nombre}`)).toEqual([
      'Perú · Yape',
      'Fuera de Perú · Western Union',
      'Todos los países · Hotmart',
    ]);
    // No son billeteras de país: van en su propia lista.
    expect(panel.billeteras()).toEqual([deuna]);
  });

  it('el QR de Yape es el de la web hasta que se sube otro; los demás no llevan', () => {
    expect(panel.qrDeMedio(yape)).toBe('/qr-pago/qr-code.jpeg');
    expect(panel.qrDeMedio({ ...yape, tieneQr: true, qrVersion: 7 })).toBe('/qr-subido?v=7');
    expect(panel.qrDeMedio(hotmart)).toBeNull();
  });

  it('apagar un medio de la casa pregunta antes; sin confirmar no cambia nada', async () => {
    dialogos.confirmar.mockResolvedValue(false);
    await panel.encenderMedio(yape);
    expect(dialogos.confirmar).toHaveBeenCalledTimes(1);
    expect(api.cambiarMedio).not.toHaveBeenCalled();
  });

  it('al confirmar lo apaga, y encenderlo de nuevo no pregunta', async () => {
    api.cambiarMedio.mockReturnValue(of({ ...hotmart, active: false }));
    await panel.encenderMedio(hotmart);
    expect(api.cambiarMedio).toHaveBeenCalledWith('HOTMART', { active: false });
    expect(panel.deLaCasa()[2].active).toBe(false);

    dialogos.confirmar.mockClear();
    api.cambiarMedio.mockReturnValue(of(hotmart));
    await panel.encenderMedio(panel.deLaCasa()[2]);
    expect(dialogos.confirmar).not.toHaveBeenCalled();
    expect(api.cambiarMedio).toHaveBeenLastCalledWith('HOTMART', { active: true });
    expect(panel.deLaCasa()[2].active).toBe(true);
  });

  it('editar Western Union guarda beneficiario, DNI y ciudad, y cambia su fila', () => {
    const cambiado = { ...westernUnion, ciudad: 'Trujillo, Perú' };
    api.cambiarMedio.mockReturnValue(of(cambiado));

    panel.editarMedio(westernUnion);
    expect(panel.formMedio.getRawValue()).toEqual({ titular: 'Benicio Acosta', numero: '12345678', ciudad: 'Trujillo' });
    panel.formMedio.patchValue({ ciudad: ' Trujillo, Perú ' });
    panel.guardarMedio();

    expect(api.cambiarMedio).toHaveBeenCalledWith('WESTERN_UNION', {
      titular: 'Benicio Acosta', numero: '12345678', ciudad: 'Trujillo, Perú',
    });
    expect(panel.deLaCasa()[1].ciudad).toBe('Trujillo, Perú');
    expect(panel.editandoMedio()).toBeNull();
  });

  it('editar Yape no manda ciudad, y sin titular o número no guarda', () => {
    panel.editarMedio(yape);
    panel.formMedio.patchValue({ titular: '' });
    panel.guardarMedio();
    expect(api.cambiarMedio).not.toHaveBeenCalled();

    api.cambiarMedio.mockReturnValue(of({ ...yape, titular: 'Otro' }));
    panel.formMedio.patchValue({ titular: 'Otro' });
    panel.guardarMedio();
    expect(api.cambiarMedio).toHaveBeenCalledWith('YAPE', { titular: 'Otro', numero: '999111222' });
  });

  it('subir el QR de Yape cambia su fila; si falla, se dice', () => {
    const archivo = new File([new Uint8Array(10)], 'qr.png', { type: 'image/png' });
    const eleccion = { target: { files: [archivo], value: 'x' } } as unknown as Event;

    api.subirQrDeMedio.mockReturnValue(of({ ...yape, tieneQr: true, qrVersion: 9 }));
    panel.cambiarQrDeMedio(yape, eleccion);
    expect(api.subirQrDeMedio).toHaveBeenCalledWith('YAPE', archivo);
    expect(panel.deLaCasa()[0].qrVersion).toBe(9);
    expect(panel.subiendoQrDeMedio()).toBeNull();

    api.subirQrDeMedio.mockReturnValue(throwError(() => new Error('No se pudo guardar.')));
    panel.cambiarQrDeMedio(yape, { target: { files: [archivo], value: 'x' } } as unknown as Event);
    expect(panel.error()).not.toBeNull();
    expect(panel.subiendoQrDeMedio()).toBeNull();
  });

  it('sin país, titular o número no se crea nada', () => {
    panel.form.patchValue({ nombre: 'Nequi' });
    panel.crear();
    expect(api.crearBilletera).not.toHaveBeenCalled();
  });

  it('crea la billetera con su país y su moneda, y la añade a la lista', () => {
    const nequi = { ...deuna, id: 'b2', nombre: 'Nequi', pais: 'CO' };
    api.crearBilletera.mockReturnValue(of(nequi));
    panel.form.setValue({
      nombre: ' Nequi ',
      pais: 'CO',
      moneda: 'USD',
      titular: 'Luis Rey',
      numero: '3001234567',
      instrucciones: '',
    });

    panel.crear();

    expect(api.crearBilletera).toHaveBeenCalledWith({
      nombre: 'Nequi',
      pais: 'CO',
      moneda: 'USD',
      titular: 'Luis Rey',
      numero: '3001234567',
      instrucciones: undefined,
    });
    expect(panel.billeteras().map((b) => b.nombre)).toEqual(['Deuna', 'Nequi']);
    expect(panel.aviso()).toContain('Colombia');
    expect(panel.abierto()).toBe(false);
  });

  const imagen = (tipo = 'image/png', bytes = 10) => new File([new Uint8Array(bytes)], 'qr.png', { type: tipo });
  const eleccion = (archivo: File) => ({ target: { files: [archivo], value: 'x' } }) as unknown as Event;

  it('subir el QR de una billetera cambia su fila y lo dice', () => {
    api.subirQrDeBilletera.mockReturnValue(of({ ...deuna, tieneQr: true, qrVersion: 5 }));
    const archivo = imagen();

    panel.cambiarQr(deuna, eleccion(archivo));

    expect(api.subirQrDeBilletera).toHaveBeenCalledWith('b1', archivo);
    expect(panel.billeteras()[0].tieneQr).toBe(true);
    expect(panel.aviso()).toContain('QR');
    expect(panel.subiendoQr()).toBeNull();
  });

  it('lo que no es una imagen, o pesa de más, no se sube', () => {
    panel.cambiarQr(deuna, eleccion(imagen('application/pdf')));
    expect(panel.error()).toContain('PNG');
    panel.cambiarQr(deuna, eleccion(imagen('image/png', 6 * 1024 * 1024 + 1)));
    expect(panel.error()).toContain('6 MB');
    expect(api.subirQrDeBilletera).not.toHaveBeenCalled();
  });

  it('al crear con un QR elegido, se sube detrás de la billetera', () => {
    const nequi = { ...deuna, id: 'b2', nombre: 'Nequi', pais: 'CO' };
    api.crearBilletera.mockReturnValue(of(nequi));
    api.subirQrDeBilletera.mockReturnValue(of({ ...nequi, tieneQr: true, qrVersion: 7 }));
    const archivo = imagen();
    panel.elegirQrDelAlta(eleccion(archivo));
    panel.form.setValue({
      nombre: 'Nequi', pais: 'CO', moneda: 'USD', titular: 'Luis Rey', numero: '3001234567', instrucciones: '',
    });

    panel.crear();

    expect(api.subirQrDeBilletera).toHaveBeenCalledWith('b2', archivo);
    expect(panel.billeteras().find((b) => b.id === 'b2')?.tieneQr).toBe(true);
    expect(panel.aviso()).toContain('con su QR');
    expect(panel.qrDelAlta()).toBeNull();
  });

  it('si el QR falla, la billetera queda creada y se dice que hay que subirlo otra vez', () => {
    const nequi = { ...deuna, id: 'b2', nombre: 'Nequi', pais: 'CO' };
    api.crearBilletera.mockReturnValue(of(nequi));
    api.subirQrDeBilletera.mockReturnValue(throwError(() => new Error('caído')));
    panel.elegirQrDelAlta(eleccion(imagen()));
    panel.form.setValue({
      nombre: 'Nequi', pais: 'CO', moneda: 'USD', titular: 'Luis Rey', numero: '3001234567', instrucciones: '',
    });

    panel.crear();

    expect(panel.billeteras().some((b) => b.id === 'b2')).toBe(true);
    expect(panel.error()).toContain('su QR no se guardó');
  });

  it('una fila se despliega para editarla, de una en una; «Nueva billetera» las cierra', () => {
    panel.alternarBilletera(deuna);
    expect(panel.desplegada()).toBe('billetera:b1');
    expect(panel.formBilletera.getRawValue().titular).toBe('Ana Paz');

    panel.alternarMedio(yape);
    expect(panel.desplegada()).toBe('medio:YAPE');
    expect(panel.editandoBilletera()).toBeNull();
    expect(panel.editandoMedio()).toEqual(yape);

    panel.alternarMedio(hotmart);
    expect(panel.desplegada()).toBe('medio:HOTMART');
    expect(panel.editandoMedio()).toBeNull();

    panel.alternarAlta();
    expect(panel.abierto()).toBe(true);
    expect(panel.desplegada()).toBeNull();
  });

  it('editar una billetera guarda nombre, titular, número e instrucciones y cierra la fila', () => {
    api.cambiarBilletera.mockReturnValue(of({ ...deuna, titular: 'Luis Ruiz', instrucciones: 'Desde la app' }));
    panel.alternarBilletera(deuna);
    panel.formBilletera.patchValue({ titular: ' Luis Ruiz ', instrucciones: 'Desde la app' });
    panel.guardarBilletera();
    expect(api.cambiarBilletera).toHaveBeenCalledWith('b1', {
      nombre: 'Deuna',
      titular: 'Luis Ruiz',
      numero: '0991234567',
      instrucciones: 'Desde la app',
    });
    expect(panel.billeteras()[0].titular).toBe('Luis Ruiz');
    expect(panel.desplegada()).toBeNull();

    panel.alternarBilletera(deuna);
    panel.formBilletera.patchValue({ numero: '' });
    api.cambiarBilletera.mockClear();
    panel.guardarBilletera();
    expect(api.cambiarBilletera).not.toHaveBeenCalled();
  });

  it('apagar manda lo contrario de como estaba y cambia la fila', () => {
    api.cambiarBilletera.mockReturnValue(of({ ...deuna, active: false }));
    panel.encender(deuna);
    expect(api.cambiarBilletera).toHaveBeenCalledWith('b1', { active: false });
    expect(panel.billeteras()[0].active).toBe(false);
    expect(panel.cambiando()).toBeNull();
  });

  it('si el servidor falla, la fila se queda como estaba y se dice', () => {
    api.cambiarBilletera.mockReturnValue(throwError(() => new Error('caído')));
    panel.encender(deuna);
    expect(panel.billeteras()[0].active).toBe(true);
    expect(panel.error()).not.toBeNull();
  });
});

describe('Un pago por billetera en la lista de accesos', () => {
  const base = {
    providerOrderId: 'BW-ABCD1234',
    amountCents: 4900,
    discountCents: 0,
    currency: 'USD',
    createdAt: '2026-10-12T15:00:00Z',
    operationCode: 'AB1234',
    plan: { code: 'TESIS', productCode: 'TESIS', name: 'Método de Tesis', words: 0, durationDays: 90 },
    user: { id: 'u1', email: 'ana@example.com', firstName: 'Ana', lastName: 'Paz' },
  };
  const billetera = { id: 'b1', nombre: 'Deuna', pais: 'EC' };

  it('se llama como la billetera, esté esperando o ya resuelto', () => {
    const pendiente = {
      ...base, id: 'p1', provider: 'BILLETERA', status: 'IN_REVIEW', proofMime: 'image/png', billetera,
    } as unknown as PagoPorRevisar;
    const resuelto = {
      ...base, id: 'p2', provider: 'BILLETERA', status: 'PAID', paidAt: null, reviewedAt: null,
      tieneComprobante: true, billetera,
    } as unknown as PagoRevisado;

    const accesos = unirAccesos([] as ActivationCode[], [pendiente], [resuelto], [] as PagoAdmin[], new Map());

    expect(accesos.map((a) => a.canalNombre)).toEqual(['Deuna', 'Deuna']);
    expect(accesos.every((a) => a.canal === 'yape')).toBe(true);
    expect(accesos.every((a) => a.moneda === 'USD')).toBe(true);
  });

  it('no sale dos veces: el de la lista de cobros se descarta, como un Yape', () => {
    const resuelto = {
      ...base, id: 'p2', provider: 'BILLETERA', status: 'PAID', paidAt: null, reviewedAt: null,
      tieneComprobante: true, billetera,
    } as unknown as PagoRevisado;
    const cobro = { ...base, id: 'p2', provider: 'BILLETERA', status: 'PAID' } as unknown as PagoAdmin;

    const accesos = unirAccesos([] as ActivationCode[], [], [resuelto], [cobro], new Map());

    expect(accesos.length).toBe(1);
  });
});
