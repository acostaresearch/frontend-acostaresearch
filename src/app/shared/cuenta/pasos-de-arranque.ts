import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ProgresoDeArranque } from '../../core/models/payment.model';

/** Un paso de la puesta en marcha, ya resuelto con su estado. */
interface Paso {
  titulo: string;
  texto: string;
  hecho: boolean;
  /** Solo el paso en curso ofrece acción: el resto sería ruido. */
  accion?: { texto: string; ruta: string; params?: Record<string, string> };
}

/**
 * Por dónde va el comprador, en pasos que se marcan solos.
 *
 * NO ES UNA GUÍA, ES UN ESTADO. Cada paso se enciende porque ocurrió de verdad
 * —el servidor oyó a su conector, sirvió un capítulo—, no porque alguien
 * pulsara «entendido». Una lista que hay que tachar a mano se desactualiza el
 * primer día y deja de mirarse.
 *
 * Existe porque tres de cada dieciséis compradores de la primera semana no
 * llegaron a llamar al conector NUNCA, y no había nada en su pantalla que se lo
 * dijera. Veían su URL, su licencia activa y todo en verde, sin saber que les
 * faltaba el paso que importa.
 *
 * DESAPARECE AL TERMINAR. Un panel de puesta en marcha que sigue ahí cuando ya
 * arrancaste es estorbo permanente a cambio de ayuda de una semana.
 */
@Component({
  selector: 'app-pasos-de-arranque',
  imports: [RouterLink],
  templateUrl: './pasos-de-arranque.html',
  styleUrl: './pasos-de-arranque.css',
})
export class PasosDeArranque {
  readonly progreso = input.required<ProgresoDeArranque>();

  readonly pasos = computed<Paso[]>(() => {
    const p = this.progreso();

    return [
      {
        titulo: 'Tu cuenta está lista',
        texto: 'Correo confirmado.',
        hecho: p.cuenta,
        accion: { texto: 'Confirmar mi correo', ruta: '/perfil' },
      },
      {
        titulo: 'Tienes acceso activo',
        texto: 'Una licencia vigente del método.',
        hecho: p.acceso,
        accion: { texto: 'Ver los planes', ruta: '/planes' },
      },
      {
        titulo: 'Conectaste el conector a Claude',
        texto:
          'Copia tu URL de aquí abajo y pégala en Claude: Configuración → Conectores → Añadir ' +
          'personalizado. Se hace una vez.',
        hecho: p.conectado,
        accion: { texto: 'Ver cómo se hace', ruta: '/tutoriales' },
      },
      {
        titulo: 'Trabajaste tu primer capítulo',
        texto:
          'Escríbele a Claude «trabajemos el capítulo I con el método» y respóndele con tu ' +
          'tema. Sale con su entregable en Word.',
        hecho: p.capitulo,
        accion: { texto: 'Ver un capítulo entero', ruta: '/tutoriales' },
      },
    ];
  });

  readonly hechos = computed(() => this.pasos().filter((paso) => paso.hecho).length);
  readonly completo = computed(() => this.hechos() === this.pasos().length);

  /**
   * El primero sin hacer. Es el único que se abre y ofrece su botón.
   *
   * Los de más abajo se enseñan apagados y sin acción a propósito: enseñar
   * cuatro botones a la vez obliga a decidir por dónde empezar, que es
   * exactamente la duda que este panel viene a quitar.
   */
  readonly enCurso = computed(() => this.pasos().findIndex((paso) => !paso.hecho));
}
