import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { BillingService, Grupo } from '../../core/services/billing.service';
import { Skill, SkillService } from '../../core/services/skill.service';
import { DialogoService } from '../../core/services/dialogo.service';
import { ProductosAdmin } from './productos-admin';

const grupo = { code: 'TESIS', productCode: 'TESIS', name: 'Tesis', priceCents: 19900,
  durationDays: 90, mcpCallsPerDay: 200, active: true } as Grupo;
const capitulo = { id: 'uno', code: 'tema', displayName: 'Tema y delimitación', summary: 'Resumen del capítulo',
  orden: 1, active: true, productCodes: ['TESIS', 'OTRO'] } as Skill;

describe('Productos del administrador', () => {
  let productos: ProductosAdmin;
  let api: { list: ReturnType<typeof vi.fn>; inspeccionar: ReturnType<typeof vi.fn>;
    subir: ReturnType<typeof vi.fn>; fijarCapitulosDelGrupo: ReturnType<typeof vi.fn> };
  let billing: { actualizarGrupo: ReturnType<typeof vi.fn>; grupos: ReturnType<typeof vi.fn>;
    plans: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = { list: vi.fn(() => of([capitulo])), inspeccionar: vi.fn(), subir: vi.fn(),
      fijarCapitulosDelGrupo: vi.fn(() => of([capitulo])) };
    billing = { actualizarGrupo: vi.fn(() => of(grupo)), grupos: vi.fn(() => of([grupo])),
      plans: vi.fn(() => of([])) };
    TestBed.configureTestingModule({ providers: [
      { provide: SkillService, useValue: api }, { provide: BillingService, useValue: billing },
      { provide: DialogoService, useValue: { confirmar: vi.fn(async () => true) } },
    ] });
    productos = TestBed.runInInjectionContext(() => new ProductosAdmin(
      signal<string | null>(null), signal<string | null>(null), signal(false), signal([]),
    ));
    productos.skills.set([capitulo]);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('crear limpia la cola y el destino anterior y normaliza el código', () => {
    productos.editarGrupo(grupo);
    productos.nuevoGrupo();
    productos.formGrupo.controls.code.setValue('Método tesis');
    expect(productos.formGrupo.controls.code.value).toBe('METODO_TESIS');
    expect(productos.grupoDestino()).toBe('');
    expect(productos.cola()).toEqual([]);
    expect(productos.formGrupo.controls.code.enabled).toBe(true);
  });

  it('guardar aplica los capítulos solo al producto editado y quita la oferta vacía', () => {
    productos.editarGrupo(grupo);
    productos.alternarCapitulo(capitulo.id);
    productos.guardarGrupo();
    expect(billing.actualizarGrupo).toHaveBeenCalledWith('TESIS', expect.objectContaining({
      priceCents: 19900, priceUsdCents: 5790, listPriceCents: null, soloPara: null,
    }));
    expect(api.fijarCapitulosDelGrupo).toHaveBeenCalledWith('TESIS', []);
  });

  it('rechaza el archivo de otro capítulo antes de subirlo', () => {
    api.inspeccionar.mockReturnValue(of({ code: 'ajeno' }));
    const entrada = { files: [new File(['archivo'], 'tema.skill')], value: 'archivo' };
    productos.cambiarArchivoDeCapitulo(capitulo, { target: entrada } as unknown as Event);
    expect(api.subir).not.toHaveBeenCalled();
    expect(productos.error()).toContain('ajeno');
    expect(productos.reemplazando()).toBeNull();
    expect(entrada.value).toBe('');
  });

  it('publica en serie y conserva la ficha del reemplazo', () => {
    const primero = new Subject<unknown>();
    api.subir.mockReturnValueOnce(primero).mockReturnValueOnce(of({}));
    const analisis = { code: 'tema', displayNameSugerido: 'Nuevo', summarySugerido: 'Nuevo resumen',
      skillMdBytes: 1, pasos: 1, archivos: 1, materiales: [], reemplaza: capitulo };
    productos.grupoDestino.set('TESIS');
    productos.cola.set([
      { archivo: new File(['a'], 'uno.skill'), analisis, estado: 'lista', error: null },
      { archivo: new File(['b'], 'dos.skill'), analisis: { ...analisis, reemplaza: null,
        displayNameSugerido: 'Z nuevo' }, estado: 'lista', error: null },
    ]);
    productos.publicarCola();
    productos.publicarCola();
    expect(api.subir).toHaveBeenCalledTimes(1);
    expect(api.subir.mock.calls[0][1]).toEqual(expect.objectContaining({
      displayName: capitulo.displayName, summary: capitulo.summary, orden: 1, active: true,
    }));
    primero.next({});
    primero.complete();
    expect(api.subir).toHaveBeenCalledTimes(2);
    expect(api.subir.mock.calls[1][1].orden).toBe(2);
    expect(productos.publicando()).toBe(false);
    expect(productos.cola()).toEqual([]);
    expect(productos.capitulosElegidos().has('uno')).toBe(false);
  });

  it('recargar capítulos conserva la selección y marca lo publicado en el grupo', () => {
    productos.editarGrupo(grupo);
    productos.capitulosElegidos.set(new Set(['seleccionado']));
    productos.cargarSkills();
    expect([...productos.capitulosElegidos()]).toEqual(['seleccionado', 'uno']);
  });
});
