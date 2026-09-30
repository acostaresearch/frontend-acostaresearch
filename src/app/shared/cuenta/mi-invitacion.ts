import { DatePipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';

import { MisReferidos } from '../../core/services/retencion.service';

const ESTADO: Record<string, string> = {
  PENDIENTE: 'Aún no empieza',
  PREMIADO: 'Ya empezó',
  ANULADO: 'Anulado',
};

/**
 * «Invita y gana días», en el perfil de quien ya tiene el método.
 *
 * Su código, el enlace listo para WhatsApp y a quién invitó. Los días se suman
 * solos cuando el invitado paga su primer acceso; aquí solo se cuenta.
 */
@Component({
  selector: 'app-mi-invitacion',
  imports: [DatePipe],
  template: `
    @let r = datos();
    <h2>Invita a un compañero</h2>
    <p class="nota">
      Cuando alguien empieza el método con tu código, tú ganas
      <strong>{{ r.diasPorInvitado }} días</strong> más de acceso y él o ella recibe
      <strong>{{ r.diasParaElInvitado }} días</strong> extra. Sin límite de invitados.
    </p>

    <div class="codigo">
      <div>
        <span class="etiqueta-codigo">Tu código</span>
        <strong class="valor">{{ r.codigo }}</strong>
      </div>
      <div class="acciones">
        <button type="button" class="boton secundario" (click)="copiar(r.enlace!, 'enlace')">
          {{ copiado() === 'enlace' ? '¡Copiado!' : 'Copiar enlace' }}
        </button>
        <a class="boton" [href]="whatsapp()" target="_blank" rel="noopener">Enviar por WhatsApp</a>
      </div>
    </div>

    @if (r.diasGanados > 0 || r.diasPorAplicar > 0) {
      <p class="ganado">
        Llevas <strong>{{ r.diasGanados }} días</strong> ganados.
        @if (r.diasPorAplicar > 0) {
          Otros {{ r.diasPorAplicar }} se suman en cuanto vuelvas a tener el método activo.
        }
      </p>
    }

    @if (r.invitados.length > 0) {
      <ul class="invitados">
        @for (i of r.invitados; track $index) {
          <li>
            <span>{{ i.nombre }}</span>
            <span class="tenue">{{ i.createdAt | date: 'd MMM y' }}</span>
            <span class="etiqueta" [class.buena]="i.estado === 'PREMIADO'">{{ estado[i.estado] }}</span>
          </li>
        }
      </ul>
    } @else {
      <p class="nota">Todavía no ha entrado nadie con tu código.</p>
    }
  `,
  styles: `
    h2 { margin: 0 0 8px; }
    .codigo {
      display: flex; flex-wrap: wrap; gap: 14px 20px; align-items: center; justify-content: space-between;
      margin: 16px 0; padding: 16px 18px; background: var(--color-primario-suave); border-radius: var(--radio);
    }
    .etiqueta-codigo { display: block; font-size: 12.5px; color: var(--color-texto-suave); }
    .valor { font-family: ui-monospace, Consolas, monospace; font-size: 22px; letter-spacing: 0.06em; color: var(--color-texto); }
    .acciones { display: flex; flex-wrap: wrap; gap: 8px; }
    .acciones .boton { width: auto; text-decoration: none; }
    .ganado { margin: 0 0 12px; font-size: 14.5px; }
    .invitados { margin: 0; padding: 0; list-style: none; }
    .invitados li {
      display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; padding: 10px 0;
      border-top: 1px solid var(--color-borde); font-size: 14px;
    }
    .invitados li > span:first-child { flex: 1 1 140px; font-weight: 600; }
    .tenue { color: var(--color-texto-tenue); font-size: 13px; }
    .etiqueta {
      padding: 2px 10px; font-size: 12px; font-weight: 600; border-radius: 999px;
      color: var(--color-aviso); background: var(--color-aviso-suave);
    }
    .etiqueta.buena { color: var(--color-exito); background: var(--color-exito-suave); }
    @media (max-width: 600px) { .acciones, .acciones .boton { width: 100%; } }
  `,
})
export class MiInvitacion {
  readonly datos = input.required<MisReferidos>();
  readonly estado = ESTADO;
  readonly copiado = signal<string | null>(null);

  /** El mensaje ya escrito: lo único que tiene que hacer es elegir a quién. */
  readonly whatsapp = computed(() => {
    const r = this.datos();
    const texto =
      `Estoy haciendo mi tesis con el método de Acosta Research y me está sirviendo. ` +
      `Si entras con mi enlace recibes ${r.diasParaElInvitado} días extra: ${r.enlace}`;
    return `https://wa.me/?text=${encodeURIComponent(texto)}`;
  });

  async copiar(texto: string, que: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.copiado.set(que);
      setTimeout(() => this.copiado.set(null), 2500);
    } catch {
      // Sin portapapeles (http, permisos): el código está a la vista.
    }
  }
}
