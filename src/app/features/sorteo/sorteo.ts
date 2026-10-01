import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { mensajeDeError } from '../../core/http/api-error';
import { SorteoPublico, SorteoService } from '../../core/services/sorteo.service';
import { SiteHeader } from '../../shared/layout/site-header';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

/** Dónde se recuerda que este navegador ya se apuntó, por sorteo. */
const CLAVE = (slug: string) => `sorteo-inscrito:${slug}`;

/**
 * La página del enlace de un sorteo.
 *
 * Quien la abre deja su correo y queda dentro, sin cuenta y sin código de
 * verificación: así lo pidió el administrador. Que cada correo entre una sola
 * vez lo impone el servidor; aquí solo se recuerda, para que al volver vea que
 * ya está participando en vez del formulario.
 */
@Component({
  selector: 'app-sorteo',
  imports: [AvisoFlotante, FormsModule, RouterLink, SiteHeader],
  templateUrl: './sorteo.html',
  styleUrl: './sorteo.css',
})
export class SorteoPagina implements OnInit {
  private readonly api = inject(SorteoService);
  private readonly slug = inject(ActivatedRoute).snapshot.paramMap.get('slug') ?? '';

  readonly sorteo = signal<SorteoPublico | null>(null);
  readonly cargando = signal(true);
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);
  /** El correo con que se apuntó desde este navegador. */
  readonly inscrito = signal<string | null>(null);

  email = '';
  nombre = '';

  ngOnInit(): void {
    this.inscrito.set(this.recordado());

    this.api.verPublico(this.slug).subscribe({
      next: (sorteo) => {
        this.sorteo.set(sorteo);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  inscribirme(): void {
    if (this.enviando()) return;
    const email = this.email.trim();
    if (!email) {
      this.error.set('Escribe tu correo.');
      return;
    }

    this.enviando.set(true);
    this.error.set(null);
    this.api.inscribirse(this.slug, email, this.nombre.trim()).subscribe({
      next: () => {
        this.inscrito.set(email.toLowerCase());
        this.recordar(email.toLowerCase());
        this.sorteo.update((s) => (s ? { ...s, inscritos: s.inscritos + 1 } : s));
        this.enviando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.enviando.set(false);
      },
    });
  }

  /** «3 meses» si los días son meses justos; si no, los días. */
  duracion(dias: number): string {
    if (dias <= 0) return '';
    if (dias % 30 === 0) {
      const meses = dias / 30;
      return meses === 1 ? '1 mes' : `${meses} meses`;
    }
    return `${dias} días`;
  }

  private recordado(): string | null {
    try {
      return localStorage.getItem(CLAVE(this.slug));
    } catch {
      return null;
    }
  }

  private recordar(email: string): void {
    try {
      localStorage.setItem(CLAVE(this.slug), email);
    } catch {
      // Sin almacenamiento: la inscripción ya está en el servidor.
    }
  }
}
