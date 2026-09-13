import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { mensajeDeError } from '../../core/http/api-error';
import {
  ConectorDePrueba,
  PruebaPublica,
  PruebaService,
} from '../../core/services/prueba.service';
import { SiteHeader } from '../../shared/layout/site-header';
import { environment } from '../../../environments/environment';

/** Dónde se guarda el conector recogido, por enlace. */
const CLAVE = (slug: string) => `prueba-conector:${slug}`;

/**
 * La página del enlace de prueba.
 *
 * El administrador reparte UN enlace a un grupo; cada persona que lo abre pulsa
 * un botón y recibe su propio conector, sin registrarse. No se le da a todos la
 * misma URL de conector porque se colapsaría —el límite de ráfaga va por
 * token— y los treinta escribirían en la misma tesis.
 *
 * EL CONECTOR SE RECUERDA EN ESTE NAVEGADOR
 * -----------------------------------------
 * Es la única copia fuera de la pantalla: el servidor solo guarda el hash. Sin
 * esto, quien recarga la página la pierde y, al volver a pulsar, gasta otro
 * cupo del grupo. Guardarla aquí resuelve las dos cosas. Es un conector de
 * prueba, con caducidad y topes: lo que se arriesga no justifica perderla.
 */
@Component({
  selector: 'app-prueba',
  imports: [DatePipe, RouterLink, SiteHeader],
  templateUrl: './prueba.html',
  styleUrl: './prueba.css',
})
export class Prueba implements OnInit {
  private readonly api = inject(PruebaService);
  private readonly slug = inject(ActivatedRoute).snapshot.paramMap.get('slug') ?? '';

  readonly guiaUrl = environment.guiaUrl;

  readonly prueba = signal<PruebaPublica | null>(null);
  readonly conector = signal<ConectorDePrueba | null>(null);
  readonly cargando = signal(true);
  readonly pidiendo = signal(false);
  readonly error = signal<string | null>(null);
  readonly copiada = signal(false);

  ngOnInit(): void {
    this.conector.set(this.recordado());

    this.api.ver(this.slug).subscribe({
      next: (prueba) => {
        this.prueba.set(prueba);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  pedir(): void {
    if (this.pidiendo()) return;
    this.pidiendo.set(true);
    this.error.set(null);

    this.api.pedirConector(this.slug).subscribe({
      next: (conector) => {
        this.conector.set(conector);
        this.recordar(conector);
        this.pidiendo.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.pidiendo.set(false);
      },
    });
  }

  async copiar(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.copiada.set(true);
      setTimeout(() => this.copiada.set(false), 2500);
    } catch {
      this.error.set('No pudimos copiarla. Selecciónala y cópiala a mano.');
    }
  }

  /** Los topes, dichos con el periodo pegado al número. */
  cupo(p: PruebaPublica): string | null {
    const partes: string[] = [];
    if (p.callsPerDay > 0) partes.push(`${p.callsPerDay} consultas cada día`);
    return partes.length > 0 ? partes.join(' y ') : null;
  }

  private recordado(): ConectorDePrueba | null {
    try {
      const guardado = localStorage.getItem(CLAVE(this.slug));
      return guardado ? (JSON.parse(guardado) as ConectorDePrueba) : null;
    } catch {
      return null;
    }
  }

  private recordar(conector: ConectorDePrueba): void {
    try {
      localStorage.setItem(CLAVE(this.slug), JSON.stringify(conector));
    } catch {
      // Navegador en modo privado o sin almacenamiento: la URL sigue en
      // pantalla, y el aviso de guardarla ya lo dice.
    }
  }
}
