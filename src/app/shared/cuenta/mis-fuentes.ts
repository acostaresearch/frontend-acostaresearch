import { DatePipe, UpperCasePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';

import { toApiError } from '../../core/http/api-error';
import {
  MisFuentes,
  MisFuentesService,
  ResultadoDeImportacion,
} from '../../core/services/mis-fuentes.service';
import { DialogoService } from '../../core/services/dialogo.service';

/** Lo que el navegador ofrece al abrir el diálogo. El servidor lo recomprueba. */
const ACEPTA = '.csv,.ris,.bib,.bibtex,.txt';

/** Techo local, para no subir ocho megas y que el servidor los rechace. */
const MAXIMO_BYTES = 8 * 1024 * 1024;

/**
 * Las fuentes que el tesista sube de su propio export.
 *
 * POR QUÉ ESTO Y NO CONECTAR SCOPUS
 * ---------------------------------
 * La API de Elsevier exige que la institución esté suscrita y su acceso
 * gratuito es solo para uso no comercial, así que este producto no puede
 * consultarla. Pero el tesista SÍ tiene Scopus, por su universidad: el método
 * ya le arma la ecuación de búsqueda para que la pegue allí, y lo único que
 * faltaba era por dónde subir lo que exporta.
 *
 * Un archivo no necesita credenciales de terceros ni claves que caducan. Y es
 * lo que ya prometía la web: «el marco teórico se redacta únicamente con los
 * artículos que tú subes de Scopus, SciELO o Google Académico».
 */
@Component({
  selector: 'app-mis-fuentes',
  imports: [DatePipe, UpperCasePipe],
  templateUrl: './mis-fuentes.html',
  styleUrl: './mis-fuentes.css',
})
export class MisFuentesPanel implements OnInit {
  private readonly fuentes = inject(MisFuentesService);
  private readonly dialogos = inject(DialogoService);

  readonly acepta = ACEPTA;

  readonly resumen = signal<MisFuentes | null>(null);
  readonly subiendo = signal(false);
  readonly vaciando = signal(false);
  readonly error = signal<string | null>(null);
  /** El parte de la última subida. Se enseña hasta que suba otra cosa. */
  readonly resultado = signal<ResultadoDeImportacion | null>(null);
  /** Para el resaltado al arrastrar un archivo encima. */
  readonly encima = signal(false);

  ngOnInit(): void {
    this.cargar();
  }

  private cargar(): void {
    this.fuentes.resumen().subscribe({
      next: (datos) => this.resumen.set(datos),
      error: () => this.resumen.set(null),
    });
  }

  elegir(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    // El campo se limpia siempre: sin esto, volver a elegir el MISMO archivo no
    // dispara ningún evento y parece que la página se quedó colgada.
    entrada.value = '';
    if (archivo) this.subir(archivo);
  }

  soltar(evento: DragEvent): void {
    evento.preventDefault();
    this.encima.set(false);
    const archivo = evento.dataTransfer?.files?.[0];
    if (archivo) this.subir(archivo);
  }

  arrastraEncima(evento: DragEvent): void {
    evento.preventDefault();
    this.encima.set(true);
  }

  private subir(archivo: File): void {
    if (this.subiendo()) return;

    if (archivo.size > MAXIMO_BYTES) {
      this.error.set(
        'Ese archivo pesa más de 8 MB. Exporta una selección más ajustada a tu tema: una tesis ' +
          'no se sostiene sobre miles de fuentes, y las que sobran solo dificultan encontrar ' +
          'las buenas.',
      );
      return;
    }

    this.subiendo.set(true);
    this.error.set(null);
    this.resultado.set(null);

    this.fuentes.importar(archivo).subscribe({
      next: (resultado) => {
        this.resultado.set(resultado);
        this.subiendo.set(false);
        this.cargar();
      },
      error: (error: unknown) => {
        this.error.set(toApiError(error).message);
        this.subiendo.set(false);
      },
    });
  }

  /**
   * Vacía la biblioteca. Es el deshacer de una importación.
   *
   * Se pregunta antes porque no hay vuelta atrás: recuperarlas significa volver
   * a Scopus, repetir la búsqueda y exportar otra vez.
   */
  async vaciar(): Promise<void> {
    const total = this.resumen()?.total ?? 0;
    if (total === 0 || this.vaciando()) return;

    const seguro = await this.dialogos.confirmar({
      titulo: 'Borrar tus fuentes',
      mensaje: `Se borrarán las ${total} fuentes que subiste.`,
      nota: 'La biblioteca de Acosta no se toca. Para recuperar las tuyas tendrías que volver a exportarlas.',
      confirmar: 'Borrar mis fuentes',
      tono: 'peligro',
    });
    if (!seguro || this.vaciando()) return;

    this.vaciando.set(true);
    this.error.set(null);
    this.resultado.set(null);

    this.fuentes.vaciar().subscribe({
      next: () => {
        this.vaciando.set(false);
        this.cargar();
      },
      error: (error: unknown) => {
        this.error.set(toApiError(error).message);
        this.vaciando.set(false);
      },
    });
  }
}
