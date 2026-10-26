import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthService, VistaDeActivacion } from '../../../core/services/auth.service';
import { BienvenidaService } from '../../../core/services/bienvenida.service';
import { LicenseService } from '../../../core/services/license.service';
import { Activar } from './activar';

/**
 * «Activar mi acceso» (26-oct): abrir la página no gasta el código, la cuenta
 * nueva activa en un paso y lleva al panel, y quien entra por el acceso de
 * siempre vuelve a /planes con el código recordado.
 */
const CODIGO = 'ACR-AB12-CD34-EF56';

function crear(vista: VistaDeActivacion, api: Record<string, unknown> = {}) {
  const llamadas = { activar: [] as unknown[], redeem: [] as unknown[] };
  const conSesion = signal(false);

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { fragment: encodeURIComponent(CODIGO) } } },
      {
        provide: AuthService,
        useValue: {
          isAuthenticated: conSesion,
          user: signal(null),
          hasRole: () => false,
          verActivacion: () => of(vista),
          activar: (datos: unknown) => {
            llamadas.activar.push(datos);
            return of({ license: { productName: 'Método de tesis', expiresAt: null }, connectorUrl: 'https://u' });
          },
          ...api,
        },
      },
      {
        provide: LicenseService,
        useValue: {
          redeem: (codigo: string) => {
            llamadas.redeem.push(codigo);
            return of({ license: null, connectorUrl: null });
          },
        },
      },
    ],
  });
  TestBed.overrideComponent(Activar, {
    set: { imports: [ReactiveFormsModule, RouterLink], schemas: [CUSTOM_ELEMENTS_SCHEMA] },
  });

  const router = TestBed.inject(Router);
  const rutas: string[] = [];
  vi.spyOn(router, 'navigateByUrl').mockImplementation((url) => {
    rutas.push(String(url));
    return Promise.resolve(true);
  });

  const fixture = TestBed.createComponent(Activar);
  fixture.detectChanges();
  return { pagina: fixture.componentInstance, llamadas, rutas, conSesion };
}

const NUEVA: VistaDeActivacion = {
  email: 'maria@gmail.com',
  producto: 'Método de tesis',
  conector: true,
  tieneCuenta: false,
};

describe('Activar mi acceso', () => {
  it('abrir la página no gasta el código', () => {
    const { pagina, llamadas } = crear(NUEVA);
    expect(pagina.codigo()).toBe(CODIGO);
    expect(pagina.vista()?.email).toBe('maria@gmail.com');
    expect(llamadas.activar.length).toBe(0);
    expect(llamadas.redeem.length).toBe(0);
  });

  it('cuenta nueva: activa con nombre y contraseña y lleva al panel con la URL', () => {
    const { pagina, llamadas, rutas } = crear(NUEVA);
    pagina.formulario.setValue({
      firstName: 'María',
      lastName: 'Quispe',
      password: 'Clave12345',
      confirmPassword: 'Clave12345',
    });
    pagina.activar();

    expect(llamadas.activar).toEqual([
      { codigo: CODIGO, firstName: 'María', lastName: 'Quispe', password: 'Clave12345' },
    ]);
    expect(TestBed.inject(BienvenidaService).pendiente()?.url).toBe('https://u');
    expect(rutas).toEqual(['/perfil/ayuda']);
  });

  it('con contraseñas distintas no manda nada', () => {
    const { pagina, llamadas } = crear(NUEVA);
    pagina.formulario.setValue({
      firstName: 'María',
      lastName: 'Quispe',
      password: 'Clave12345',
      confirmPassword: 'Otra12345A',
    });
    pagina.activar();
    expect(llamadas.activar.length).toBe(0);
  });

  it('quien entra por el acceso de siempre vuelve a /planes y allí se canjea solo', () => {
    const { pagina } = crear({ ...NUEVA, tieneCuenta: true });
    expect(pagina.vuelta()).toBe(`/planes?codigo=${encodeURIComponent(CODIGO)}`);
    expect(TestBed.inject(BienvenidaService).tomarCanje(CODIGO)).toBe(true);
  });
});
