import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AvisosService } from '../../core/services/avisos.service';
import { AvisoFlotante } from './aviso-flotante';

@Component({
  imports: [AvisoFlotante],
  template: `<app-aviso-flotante [(error)]="error" [(aviso)]="aviso" />`,
})
class Pagina {
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
}

/**
 * La pila de avisos y su puente con las señales de cada página.
 *
 * Lo delicado es que la señal de la página y la pila digan lo mismo: si el
 * tesista cierra el aviso, la señal vuelve a `null` (y el siguiente error
 * igual se ve); si la página limpia la señal, el aviso se retira.
 */
describe('Avisos', () => {
  let avisos: AvisosService;

  beforeEach(() => {
    vi.useFakeTimers();
    avisos = TestBed.inject(AvisosService);
  });

  afterEach(() => vi.useRealTimers());

  it('los errores se quedan; lo demás se va solo', () => {
    avisos.error('falló');
    avisos.exito('guardado');
    expect(avisos.avisos().map((a) => a.texto)).toEqual(['falló', 'guardado']);

    vi.advanceTimersByTime(6000);
    expect(avisos.avisos().map((a) => a.texto)).toEqual(['falló']);
  });

  it('la señal de la página y la pila van a la par', () => {
    const fixture = TestBed.createComponent(Pagina);
    const pagina = fixture.componentInstance;

    pagina.error.set('Casi ningún artículo cita a otro.');
    fixture.detectChanges();
    expect(avisos.avisos().map((a) => a.tipo)).toEqual(['error']);

    // Lo cierra el tesista: la página se entera.
    avisos.cerrar(avisos.avisos()[0].id);
    fixture.detectChanges();
    expect(pagina.error()).toBeNull();

    // Lo limpia la página al reintentar: el aviso se retira.
    pagina.error.set('Otra vez.');
    fixture.detectChanges();
    pagina.error.set(null);
    fixture.detectChanges();
    expect(avisos.avisos()).toEqual([]);

    // El de éxito se va solo y devuelve la señal a null.
    pagina.aviso.set('Mapa creado.');
    fixture.detectChanges();
    vi.advanceTimersByTime(6000);
    fixture.detectChanges();
    expect(pagina.aviso()).toBeNull();
    expect(avisos.avisos()).toEqual([]);
  });
});
