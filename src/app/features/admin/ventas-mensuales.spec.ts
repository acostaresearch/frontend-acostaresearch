import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';

import { VentasMensuales } from '../../core/models/admin.model';
import { AdminService } from '../../core/services/admin.service';
import { VentasMensualesAdmin } from './ventas-mensuales';

describe('Ventas mensuales del administrador', () => {
  let ventas: VentasMensualesAdmin;
  let api: { ventasMensuales: ReturnType<typeof vi.fn>; pdfDelMes: ReturnType<typeof vi.fn> };
  let crearUrl: (obj: Blob | MediaSource) => string;
  let liberarUrl: (url: string) => void;
  let descargas: { nombre: string; url: string }[];

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
    crearUrl = vi.fn(() => 'blob:reporte');
    liberarUrl = vi.fn();
    vi.stubGlobal('URL', class extends URL {
      static override createObjectURL(obj: Blob | MediaSource): string { return crearUrl(obj); }
      static override revokeObjectURL(url: string): void { liberarUrl(url); }
    });
    descargas = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      descargas.push({ nombre: this.download, url: this.href });
    });
    api = { ventasMensuales: vi.fn(), pdfDelMes: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: AdminService, useValue: api }] });
    ventas = TestBed.runInInjectionContext(() => new VentasMensualesAdmin((cents) => `S/ ${cents / 100}`));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const respuestaPdf = (nombre?: string) => new HttpResponse({
    body: new Blob(['pdf'], { type: 'application/pdf' }),
    headers: nombre ? new HttpHeaders({ 'Content-Disposition': `attachment; filename="${nombre}"` }) : new HttpHeaders(),
  });

  it('un fallo al leer las ventas permite volver a abrir la ventana e intentarlo', () => {
    const consulta = new Subject<VentasMensuales>();
    api.ventasMensuales.mockReturnValue(consulta);
    ventas.abrirVentas();
    expect(ventas.cargandoVentas()).toBe(true);
    consulta.error(new Error('Sin conexión'));
    expect(ventas.cargandoVentas()).toBe(false);
    expect(ventas.errorVentas()).not.toBeNull();
    ventas.cerrarVentas();
    expect(ventas.ventasAbierto()).toBe(false);
    api.ventasMensuales.mockReturnValue(new Subject<VentasMensuales>());
    ventas.abrirVentas();
    expect(ventas.errorVentas()).toBeNull();
    expect(ventas.cargandoVentas()).toBe(true);
    expect(api.ventasMensuales).toHaveBeenCalledTimes(2);
  });

  it('evita descargas simultáneas y vuelve a permitirlas después de un fallo', () => {
    const descarga = new Subject<HttpResponse<Blob>>();
    api.pdfDelMes.mockReturnValue(descarga);
    ventas.descargarMes(2026, 9);
    ventas.descargarMes(2026, 10);
    expect(api.pdfDelMes).toHaveBeenCalledTimes(1);
    expect(ventas.bajandoMes()).toBe('2026-9');
    descarga.error(new Error('Sin conexión'));
    expect(ventas.bajandoMes()).toBeNull();
    expect(ventas.errorVentas()).not.toBeNull();
    api.pdfDelMes.mockReturnValue(of(respuestaPdf()));
    ventas.descargarMes(2026, 10);
    expect(api.pdfDelMes).toHaveBeenCalledWith(2026, 10);
    expect(ventas.errorVentas()).toBeNull();
    expect(descargas[0].nombre).toBe('ventas-2026-10.pdf');
  });

  it('usa el nombre enviado por el servidor y libera la URL después de iniciar la descarga', () => {
    const respuesta = respuestaPdf('cierre-septiembre.pdf');
    api.pdfDelMes.mockReturnValue(of(respuesta));
    ventas.descargarMes(2026, 9);
    expect(crearUrl).toHaveBeenCalledWith(respuesta.body);
    expect(descargas).toEqual([{ nombre: 'cierre-septiembre.pdf', url: 'blob:reporte' }]);
    expect(ventas.bajandoMes()).toBeNull();
    vi.advanceTimersByTime(9000);
    expect(liberarUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(liberarUrl).toHaveBeenCalledWith('blob:reporte');
  });
});
