import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AsesorService } from '../../core/services/asesor.service';
import { PedidoService } from '../../core/services/pedido.service';
import { ReclamoService } from '../../core/services/reclamo.service';
import { ResenaService } from '../../core/services/resena.service';
import { SeguimientoAdmin } from './seguimiento';

describe('Seguimiento de atención del administrador', () => {
  let seguimiento: SeguimientoAdmin;
  let reclamos: { listar: ReturnType<typeof vi.fn> };
  let resenas: { listar: ReturnType<typeof vi.fn> };
  let asesores: { listar: ReturnType<typeof vi.fn> };
  let pedidos: { listar: ReturnType<typeof vi.fn> };
  const error = signal<string | null>(null);
  const aviso = signal<string | null>(null);

  beforeEach(() => {
    TestBed.resetTestingModule();
    error.set(null);
    aviso.set(null);
    reclamos = { listar: vi.fn(() => of([{ respondido: false }, { respondido: true }])) };
    resenas = { listar: vi.fn(() => of({ resenas: [{ estado: 'PENDIENTE' }, { estado: 'APROBADA' }] })) };
    asesores = { listar: vi.fn(() => of([{ estado: 'PENDIENTE' }, { estado: 'APROBADO' }])) };
    pedidos = { listar: vi.fn(() => of([{ estado: 'ESPERANDO' }, { estado: 'ENTREGADO' }])) };
    TestBed.configureTestingModule({ providers: [
      { provide: ReclamoService, useValue: reclamos },
      { provide: ResenaService, useValue: resenas },
      { provide: AsesorService, useValue: asesores },
      { provide: PedidoService, useValue: pedidos },
    ] });
    seguimiento = TestBed.runInInjectionContext(() => new SeguimientoAdmin(error, aviso));
  });

  afterEach(() => TestBed.resetTestingModule());

  const areas = ['Reclamos', 'Resenas', 'Asesores', 'Pedidos'] as const;

  function apiDe(area: typeof areas[number]) {
    return { Reclamos: reclamos, Resenas: resenas, Asesores: asesores, Pedidos: pedidos }[area];
  }

  it.each(areas)('un fallo del contador de %s no tapa un error existente del panel', (area) => {
    apiDe(area).listar.mockReturnValue(throwError(() => new Error('Sin conexión')));
    error.set('Error de la sección abierta');
    seguimiento[`cargar${area}`](false);
    expect(error()).toBe('Error de la sección abierta');
  });

  it.each(areas)('al abrir %s un fallo sí se comunica al usuario', (area) => {
    apiDe(area).listar.mockReturnValue(throwError(() => new Error('Sin conexión')));
    seguimiento[`cargar${area}`]();
    expect(error()).not.toBeNull();
  });

  it('los contadores incluyen solo lo que espera atención en cada área', () => {
    for (const area of areas) seguimiento[`cargar${area}`](false);
    expect(seguimiento.reclamosPendientes()).toBe(1);
    expect(seguimiento.resenasPendientes()).toBe(1);
    expect(seguimiento.asesoresPendientes()).toBe(1);
    expect(seguimiento.pedidosEsperando()).toBe(1);
    expect(resenas.listar).toHaveBeenCalledWith('TODAS');
  });

  it('al recibir una decisión del componente muestra el aviso y actualiza su lista', () => {
    const acciones = [
      () => seguimiento.reclamoRespondido('Reclamo respondido'),
      () => seguimiento.resenaCambiada('Reseña aprobada'),
      () => seguimiento.asesorCambiado('Asesor aprobado'),
      () => seguimiento.pedidoCambiado('Revisión entregada'),
    ];
    const mensajes = ['Reclamo respondido', 'Reseña aprobada', 'Asesor aprobado', 'Revisión entregada'];
    acciones.forEach((accion, i) => {
      accion();
      expect(aviso()).toBe(mensajes[i]);
      expect(apiDe(areas[i]).listar).toHaveBeenCalledTimes(1);
    });
  });
});
