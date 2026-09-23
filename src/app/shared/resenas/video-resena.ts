import { Component, ElementRef, input, signal, viewChild } from '@angular/core';

/**
 * El video de un testimonio: miniatura, triángulo y cuánto dura.
 *
 * NO EMPIEZA A BAJAR HASTA QUE ALGUIEN LE DA
 * ------------------------------------------
 * Se precarga solo lo justo para sacar el primer fotograma y la duración. Nueve
 * grabaciones de móvil cargándose enteras en la misma pantalla son cientos de
 * megas antes de que nadie haya leído un solo testimonio, y en un teléfono con
 * datos eso se nota en la factura de quien venía a mirar.
 *
 * LA DURACIÓN, ENCIMA
 * -------------------
 * Es la pregunta de quien duda si darle: no es lo mismo un minuto que ocho. Se
 * lee del propio archivo, así que si el navegador no la sabe no se inventa nada
 * y la esquina se queda vacía.
 *
 * LA IMAGEN ENTERA, SIN RECORTAR
 * ------------------------------
 * La mitad se graban con el móvil en vertical. Recortarlas para que llenen la
 * caja le corta la cabeza a quien está hablando, así que van dentro de un fondo
 * oscuro con la imagen completa.
 *
 * Está aquí y no en cada pantalla porque lo enseñan dos —la portada y
 * `/resenas`— y las dos lo quieren igual.
 */
@Component({
  selector: 'app-video-resena',
  template: `
    <video
      #reproductor
      preload="metadata"
      playsinline
      [src]="src()"
      [controls]="sonando()"
      (loadedmetadata)="apuntarDuracion()"
    ></video>

    @if (!sonando()) {
      <button type="button" class="play" [attr.aria-label]="etiqueta()" (click)="reproducir()">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6.5v11l9-5.5z" fill="currentColor" />
        </svg>
      </button>

      @if (duracion(); as cuanto) {
        <span class="duracion">{{ cuanto }}</span>
      }
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      overflow: hidden;
      background: #0b1220;
      border-radius: 12px;
      aspect-ratio: 16 / 9;
    }

    video {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .play {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 0;
      cursor: pointer;
      background: none;
      border: 0;
    }

    .play svg {
      width: 30px;
      height: 30px;
      padding: 12px;
      color: var(--color-primario);
      background: #fff;
      border-radius: 999px;
      box-shadow: 0 6px 20px rgb(0 0 0 / 35%);
      transition: transform 0.15s ease;
    }

    .play:hover svg {
      transform: scale(1.06);
    }

    .duracion {
      position: absolute;
      bottom: 10px;
      left: 10px;
      padding: 2px 7px;
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      pointer-events: none;
      background: rgb(0 0 0 / 65%);
      border-radius: 6px;
    }
  `,
})
export class VideoDeResena {
  /** La dirección del archivo. Sale de `ResenaService.urlDelVideo()`. */
  readonly src = input.required<string>();
  /** Con qué firma la reseña, para que el botón diga de quién es el video. */
  readonly autor = input('');

  private readonly reproductor = viewChild.required<ElementRef<HTMLVideoElement>>('reproductor');

  readonly sonando = signal(false);
  readonly duracion = signal('');

  readonly etiqueta = () => (this.autor() ? `Ver el video de ${this.autor()}` : 'Ver el video');

  reproducir(): void {
    this.sonando.set(true);
    void this.reproductor().nativeElement.play().catch(() => {
      // Si el navegador se niega a reproducir solo, al menos quedan los mandos.
    });
  }

  apuntarDuracion(): void {
    const segundos = Math.round(this.reproductor().nativeElement.duration);
    if (!Number.isFinite(segundos) || segundos <= 0) return;

    const minutos = Math.floor(segundos / 60);
    this.duracion.set(`${minutos}:${String(segundos % 60).padStart(2, '0')}`);
  }
}
