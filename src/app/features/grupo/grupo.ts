import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { mensajeDeError } from '../../core/http/api-error';
import { GrupoPublico, GruposService, Union } from '../../core/services/grupos.service';
import { AuthService } from '../../core/services/auth.service';
import { PrivadaPipe } from '../../core/router/privada.pipe';
import { SiteHeader } from '../../shared/layout/site-header';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

/**
 * La página del enlace de un grupo (/grupo/<slug>): una universidad o un
 * asesor compró cupos y reparte este enlace a sus alumnos.
 *
 * Al revés que el enlace de prueba, aquí SÍ hace falta cuenta: lo que recibe
 * el alumno es una licencia de verdad, con su tesis y sus correos, y eso cuelga
 * de su cuenta. Sin sesión se le manda a entrar o registrarse y vuelve aquí.
 *
 * La URL del conector no se guarda en el navegador (en la prueba sí): es una
 * licencia completa, le llega por correo y en su perfil puede sacar otra.
 */
@Component({
  selector: 'app-grupo',
  imports: [AvisoFlotante, DatePipe, RouterLink, SiteHeader, PrivadaPipe],
  templateUrl: './grupo.html',
  styleUrl: '../prueba/prueba.css',
})
export class GrupoPagina implements OnInit {
  private readonly api = inject(GruposService);
  protected readonly auth = inject(AuthService);
  readonly slug = inject(ActivatedRoute).snapshot.paramMap.get('slug') ?? '';

  readonly grupo = signal<GrupoPublico | null>(null);
  readonly union = signal<Union | null>(null);
  readonly cargando = signal(true);
  readonly uniendo = signal(false);
  readonly error = signal<string | null>(null);
  readonly noExiste = signal<string | null>(null);
  readonly copiada = signal(false);

  /** Para volver aquí después de entrar o registrarse. */
  get vuelta(): string {
    return `/grupo/${this.slug}`;
  }

  ngOnInit(): void {
    this.api.ver(this.slug).subscribe({
      next: (grupo) => {
        this.grupo.set(grupo);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.noExiste.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  unirme(): void {
    if (this.uniendo()) return;
    this.uniendo.set(true);
    this.error.set(null);

    this.api.unirse(this.slug).subscribe({
      next: (union) => {
        this.union.set(union);
        this.uniendo.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.uniendo.set(false);
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
}
