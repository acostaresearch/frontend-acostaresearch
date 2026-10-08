import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import {
  QuienMira,
  TOUR_WEB,
  desdeAqui,
  recorridoDeLaWeb,
} from '../../shared/contenido/tour-de-la-web';
import { TOUR_PANEL } from '../../shared/contenido/tour-del-panel';
import { PasoDelTour, TourService } from './tour.service';
import { AuthService } from './auth.service';
import { LicenseService } from './license.service';
import { VistaDelPerfil } from '../../shared/cuenta/vista-del-perfil';

/** Cuánto se le da a la portada para pintarse antes de empezar a señalarla. */
const ESPERA_DE_LA_PORTADA = 800;

/**
 * Quién arranca el recorrido de la web, y por dónde.
 *
 * EMPIEZA DONDE ESTÁ QUIEN LO PIDE. Quien pulsa la brújula en «Preguntas»
 * quiere saber qué es lo que está viendo, no que se lo lleven a la portada a
 * empezar por el principio: eso es perder su sitio para contarle algo que no ha
 * pedido. Así que se empieza por esa página —en el perfil, por la sección que
 * está mirando— y desde ahí SIGUE por todo lo que le falta ver: las páginas de
 * después, luego las de antes, y el cierre. Nunca lo devuelve al principio
 * (pedido del 8-oct: antes acababa ofreciendo «Ver el sitio entero» y eso lo
 * llevaba a la portada). Ver `desdeAqui`.
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
  private readonly vista = inject(VistaDelPerfil);

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
      // En el perfil sí se saben «Invita» y «Mis grupos»: si no están, sus
      // pasos se caen solos al empezar. En cualquier otra página, no.
      const enElPerfil = this.tour.enLaRuta('/perfil');
      const todos = enElPerfil ? recorridoDeLaWeb(quien) : this.completo(quien);
      const pasos = desdeAqui(
        todos,
        (paso) => Boolean(paso.ruta && this.tour.enLaRuta(paso.ruta)),
        enElPerfil ? (paso) => paso.parte === this.vista.seccion() : undefined,
      );

      // Esta página no sale en el recorrido —los términos, el libro de
      // reclamaciones, entrar a la cuenta—: `desdeAqui` lo devuelve entero y
      // se hace desde la portada.
      if (pasos === todos) {
        this.empezarDesdeElInicio();
        return;
      }

      this.tour.empezar(TOUR_WEB, pasos, { tambien: this.yaVistos(quien) });
    });
  }

  /**
   * El recorrido de todo el sitio, sin «Invita» ni «Mis grupos».
   *
   * Esas dos secciones no las tiene todo el mundo y desde otra página no se
   * puede saber: harían esperar unos segundos a quien no las tiene. Se quedan
   * para el recorrido pedido desde el propio perfil, donde se caen solas si no
   * están.
   */
  private completo(quien: QuienMira): PasoDelTour[] {
    return recorridoDeLaWeb(quien).filter(
      (paso) => paso.parte !== 'invitar' && paso.parte !== 'grupos',
    );
  }

  /** El recorrido completo, desde la portada. */
  empezarDesdeElInicio(): void {
    this.conQuienMira((quien) => {
      const arrancar = () =>
        this.tour.empezar(TOUR_WEB, this.completo(quien), { tambien: this.yaVistos(quien) });

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
    this.tour.ofrecer(TOUR_WEB, this.completo(quien), { tambien: this.yaVistos(quien) });
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
   * Al administrador también se le pregunta: tiene sus propios accesos y su
   * panel de usuario («Ir a mi panel de usuario»). Sin esto, el recorrido
   * pedido desde ahí no encontraba pasos y lo mandaba a la portada (8-oct).
   */
  private conQuienMira(seguir: (quien: QuienMira) => void): void {
    const conSesion = this.auth.isAuthenticated();
    const esAdmin = this.auth.hasRole('ADMIN');

    if (!conSesion) {
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
