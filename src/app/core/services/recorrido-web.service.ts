import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { QuienMira, TOUR_WEB, recorridoDeLaWeb } from '../../shared/contenido/tour-de-la-web';
import { TOUR_PANEL } from '../../shared/contenido/tour-del-panel';
import { PasoDelTour, TourService } from './tour.service';
import { AuthService } from './auth.service';
import { LicenseService } from './license.service';

/** El nombre con el que se guarda el recorrido corto, el de una sola página. */
export const TOUR_PAGINA = 'pagina';

/** Cuánto se le da a la portada para pintarse antes de empezar a señalarla. */
const ESPERA_DE_LA_PORTADA = 800;

/**
 * Quién arranca el recorrido de la web, y por dónde.
 *
 * EMPIEZA DONDE ESTÁ QUIEN LO PIDE. Quien pulsa la brújula en «Preguntas»
 * quiere saber qué es lo que está viendo, no que se lo lleven a la portada a
 * empezar por el principio: eso es perder su sitio para contarle algo que no ha
 * pedido. Así que se le enseña esa página, y AL ACABARLA se le ofrece el
 * recorrido entero desde el inicio. Quien lo quiera, lo tiene a un botón; quien
 * no, se queda donde estaba.
 *
 * Vive aparte de `TourService` porque aquel no sabe de este sitio: pinta pasos
 * vengan de donde vengan. Este es quien sabe qué pasos hay, cuáles le tocan a
 * cada persona y desde qué página se empieza.
 */
@Injectable({ providedIn: 'root' })
export class RecorridoWeb {
  private readonly tour = inject(TourService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly licencias = inject(LicenseService);

  /**
   * Si ha comprado alguna vez. Nulo mientras no se ha preguntado.
   *
   * Se pregunta una sola vez por sesión y solo cuando hace falta: decide si el
   * recorrido lleva los pasos del panel o no.
   */
  private readonly conector = signal<boolean | null>(null);

  /** Lo llaman la cabecera y el pie. Ver la nota de la clase. */
  empezarAqui(): void {
    // En la portada, «aquí» y «desde el inicio» son lo mismo: se hace el
    // completo y no se ofrece al final ir a donde ya se está.
    if (this.tour.enLaRuta('/')) {
      this.empezarDesdeElInicio();
      return;
    }

    this.conQuienMira((quien) => {
      const todos = recorridoDeLaWeb(quien);
      const aqui = todos.filter((paso) => paso.ruta && this.tour.enLaRuta(paso.ruta));

      // Esta página no sale en el recorrido —los términos, el libro de
      // reclamaciones, entrar a la cuenta—. Ahí no hay nada que enseñar, así
      // que se va al principio directamente.
      if (aqui.length === 0) {
        this.empezarDesdeElInicio();
        return;
      }

      this.tour.empezar(TOUR_PAGINA, [...aqui, this.ofertaDelSitio(aqui)], {
        alAceptar: () => this.empezarDesdeElInicio(),
      });
    });
  }

  /** El recorrido completo, desde la portada. */
  empezarDesdeElInicio(): void {
    this.conQuienMira((quien) => {
      const arrancar = () =>
        this.tour.empezar(TOUR_WEB, recorridoDeLaWeb(quien), { tambien: this.yaVistos(quien) });

      if (this.tour.enLaRuta('/')) {
        arrancar();
        return;
      }

      // Media portada la pinta el servidor —las dos rutas, la banda de arriba—
      // y los pasos que señalan algo ausente se caen al empezar.
      void this.router.navigate(['/']).then(() => setTimeout(arrancar, ESPERA_DE_LA_PORTADA));
    });
  }

  /** El de la primera visita, que sí empieza por el principio. Lo pide la portada. */
  ofrecerElCompleto(quien: QuienMira): void {
    this.conector.set(quien.tieneConector);
    this.tour.ofrecer(TOUR_WEB, recorridoDeLaWeb(quien), { tambien: this.yaVistos(quien) });
  }

  /**
   * El último paso del recorrido corto: la oferta de verlo entero.
   *
   * No es una pregunta suelta en mitad de la nada: llega cuando ya se ha visto
   * lo de esta página, que es cuando se sabe de qué va esto y se puede decidir
   * si se quiere el resto.
   */
  private ofertaDelSitio(aqui: PasoDelTour[]): PasoDelTour {
    return {
      seccion: aqui[aqui.length - 1].seccion,
      titulo: 'Eso es todo lo de esta página',
      texto:
        'Si quieres, seguimos desde el inicio y recorremos el sitio entero, página por página. Y ' +
        'si no, aquí lo dejamos.',
      oferta: { texto: 'Ver el sitio entero' },
    };
  }

  /**
   * Lo que el recorrido completo da por visto de paso: si lleva dentro los
   * pasos del panel, no hay que repetirlos al entrar en el perfil.
   */
  private yaVistos(quien: QuienMira): string[] {
    return quien.tieneConector ? [TOUR_PANEL] : [];
  }

  /**
   * Quién está mirando, preguntando al servidor solo si hace falta.
   *
   * Al administrador no se le pregunta: sus pasos son los del panel de
   * administración, no los del perfil de un comprador.
   */
  private conQuienMira(seguir: (quien: QuienMira) => void): void {
    const conSesion = this.auth.isAuthenticated();
    const esAdmin = this.auth.hasRole('ADMIN');

    if (!conSesion || esAdmin) {
      seguir({ conSesion, esAdmin, tieneConector: false });
      return;
    }

    const sabido = this.conector();
    if (sabido !== null) {
      seguir({ conSesion, esAdmin, tieneConector: sabido });
      return;
    }

    this.licencias.mine().subscribe({
      next: ({ licencias }) => {
        this.conector.set(licencias.length > 0);
        seguir({ conSesion, esAdmin, tieneConector: licencias.length > 0 });
      },
      // Si no se sabe, se enseña el sitio sin el panel: es lo que se puede
      // garantizar que está ahí.
      error: () => seguir({ conSesion, esAdmin, tieneConector: false }),
    });
  }
}
