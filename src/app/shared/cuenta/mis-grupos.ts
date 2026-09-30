import { DatePipe } from '@angular/common';
import { Component, input, signal } from '@angular/core';

import { GrupoQueCoordino } from '../../core/services/grupos.service';

/**
 * «Mis grupos», en el perfil de un coordinador: la universidad o el asesor que
 * compró cupos.
 *
 * Por grupo: el enlace que reparte, cuántos cupos quedan y una fila por
 * alumno con lo que le sirve para acompañarlo —si ya conectó Claude, cuántas
 * fases cerró, en cuál está, si subió el formato—. Nada del texto de nadie:
 * eso es del alumno.
 */
@Component({
  selector: 'app-mis-grupos',
  imports: [DatePipe],
  template: `
    <h2>Mis grupos</h2>
    <p class="nota">
      Reparte el enlace de cada grupo a tus alumnos: cada uno entra con su cuenta y recibe su propio
      método. Aquí ves cómo avanzan; nunca el texto de su tesis.
    </p>

    @for (g of grupos(); track g.id) {
      <article class="grupo">
        <header>
          <div>
            <h3>{{ g.nombre }}</h3>
            <p class="tenue">
              {{ g.productName }} · {{ g.ocupados }} de {{ g.cupos }} cupos usados
              @if (g.cierraAt) {
                · se puede unir hasta el {{ g.cierraAt | date: 'd MMM y' }}
              }
            </p>
          </div>
          <span class="etiqueta" [class.buena]="g.estado === 'ABIERTO'">{{ estados[g.estado] }}</span>
        </header>

        <div class="enlace">
          <input type="text" [value]="g.url" readonly aria-label="Enlace del grupo" />
          <button type="button" class="boton secundario" (click)="copiar(g.url, g.id)">
            {{ copiado() === g.id ? '¡Copiado!' : 'Copiar enlace' }}
          </button>
        </div>

        @if (g.alumnos.length === 0) {
          <p class="nota">Todavía no se ha unido nadie.</p>
        } @else {
          <div class="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Alumno</th>
                  <th>Claude</th>
                  <th class="derecha">Fases</th>
                  <th>Ahora en</th>
                  <th>Formato</th>
                  <th>Último uso</th>
                </tr>
              </thead>
              <tbody>
                @for (a of g.alumnos; track a.email) {
                  <tr [class.apagado]="!a.activo">
                    <td>
                      <strong>{{ a.nombre }}</strong>
                      <span class="tenue">{{ a.email }}</span>
                      @if (a.tema) {
                        <span class="tenue tema">{{ a.tema }}</span>
                      }
                    </td>
                    <td>
                      <span class="etiqueta" [class.buena]="a.conecto">{{ a.conecto ? 'Conectado' : 'Sin conectar' }}</span>
                    </td>
                    <td class="derecha">{{ a.fasesTerminadas }}</td>
                    <td>{{ a.faseActual ?? '—' }}</td>
                    <td>{{ a.formatoSubido ? 'Subido' : 'Falta' }}</td>
                    <td class="tenue">{{ a.ultimoUso ? (a.ultimoUso | date: 'd MMM') : '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </article>
    }
  `,
  styles: `
    h2 { margin: 0 0 8px; }
    .grupo { margin: 18px 0 0; padding: 18px 0 0; border-top: 1px solid var(--color-borde); }
    header { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: flex-start; justify-content: space-between; }
    h3 { margin: 0 0 2px; font-size: 16px; }
    .tenue { display: block; font-size: 13px; color: var(--color-texto-tenue); }
    header .tenue { margin: 0; }
    .tema { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .enlace { display: flex; gap: 8px; margin: 12px 0; }
    .enlace input {
      flex: 1; min-width: 0; padding: 9px 12px; font: inherit; font-size: 13.5px; color: var(--color-texto);
      background: var(--color-fondo); border: 1px solid var(--color-borde); border-radius: var(--radio-sm);
    }
    .enlace .boton { width: auto; }
    .tabla-envoltura { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    th {
      padding: 8px 10px; text-align: left; font-size: 12px; font-weight: 600;
      color: var(--color-texto-suave); border-bottom: 1px solid var(--color-borde);
    }
    td { padding: 10px; vertical-align: top; border-bottom: 1px solid var(--color-borde); }
    .derecha { text-align: right; }
    tr.apagado { opacity: 0.55; }
    .etiqueta {
      display: inline-block; padding: 2px 10px; font-size: 12px; font-weight: 600; border-radius: 999px;
      color: var(--color-aviso); background: var(--color-aviso-suave); white-space: nowrap;
    }
    .etiqueta.buena { color: var(--color-exito); background: var(--color-exito-suave); }
  `,
})
export class MisGrupos {
  readonly grupos = input.required<GrupoQueCoordino[]>();
  readonly copiado = signal<string | null>(null);
  readonly estados: Record<string, string> = {
    ABIERTO: 'Abierto',
    LLENO: 'Sin cupos',
    CERRADO: 'Plazo cerrado',
    APAGADO: 'Cerrado',
  };

  async copiar(texto: string, id: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.copiado.set(id);
      setTimeout(() => this.copiado.set(null), 2500);
    } catch {
      // El enlace está a la vista para copiarlo a mano.
    }
  }
}
