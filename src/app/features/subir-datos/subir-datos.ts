import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { mensajeDeError } from '../../core/http/api-error';
import { DatosRService, DatosSubidos } from '../../core/services/datos-r.service';
import { SiteHeader } from '../../shared/layout/site-header';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

type Paso = 'comprobando' | 'elegir' | 'subiendo' | 'subido' | 'enlace-no-vale';

/**
 * Lo único que el tesista hace con las manos en su análisis: subir el archivo.
 *
 * El resto lo hace Claude en la conversación —preguntar, correr R, explicar—,
 * así que esta página no tiene nada más que enseñar. Llega aquí desde el enlace
 * que le da la herramienta `trabajar_en_r`, sube, y vuelve a Claude.
 *
 * Reemplaza a la página de análisis con R en el navegador (`/analisis`), que
 * sigue existiendo pero ya no se enlaza desde ningún sitio.
 */
@Component({
  selector: 'app-subir-datos',
  imports: [AvisoFlotante, SiteHeader],
  templateUrl: './subir-datos.html',
  styleUrl: './subir-datos.css',
})
export class SubirDatos implements OnInit {
  private readonly api = inject(DatosRService);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';

  readonly paso = signal<Paso>('comprobando');
  readonly error = signal<string | null>(null);
  readonly resultado = signal<DatosSubidos | null>(null);
  readonly nombre = signal<string | null>(null);
  readonly encima = signal(false);

  ngOnInit(): void {
    this.api.comprobar(this.token).subscribe({
      next: (enlace) => {
        if (!enlace.disponible) {
          this.error.set('El análisis en R no está disponible ahora mismo. Inténtalo más tarde.');
        }
        this.paso.set('elegir');
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.paso.set('enlace-no-vale');
      },
    });
  }

  elegir(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    // Se vacía para que volver a elegir el MISMO archivo, ya corregido, dispare
    // el cambio otra vez.
    entrada.value = '';
    if (archivo) this.subir(archivo);
  }

  arrastrar(evento: DragEvent, dentro: boolean): void {
    evento.preventDefault();
    this.encima.set(dentro);
  }

  soltar(evento: DragEvent): void {
    evento.preventDefault();
    this.encima.set(false);
    const archivo = evento.dataTransfer?.files?.[0];
    if (archivo) this.subir(archivo);
  }

  private subir(archivo: File): void {
    if (this.paso() === 'subiendo') return;

    this.error.set(null);
    this.resultado.set(null);
    this.nombre.set(archivo.name);
    this.paso.set('subiendo');

    this.api.subir(this.token, archivo).subscribe({
      next: (subido) => {
        this.resultado.set(subido);
        if (subido.leido) {
          this.paso.set('subido');
        } else {
          this.error.set(
            'El archivo llegó, pero no se pudo leer como una tabla. Comprueba que tenga una fila ' +
              'por persona y los nombres de las columnas en la primera fila, y vuelve a subirlo.',
          );
          this.paso.set('elegir');
        }
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.paso.set('elegir');
      },
    });
  }
}
