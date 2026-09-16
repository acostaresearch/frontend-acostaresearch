import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { mensajeDeError } from '../../core/http/api-error';
import { DocumentoEnlaceService } from '../../core/services/documento-enlace.service';
import { DocumentoSubido } from '../../core/services/proyecto.service';
import { SiteHeader } from '../../shared/layout/site-header';

type Paso = 'comprobando' | 'elegir' | 'subiendo' | 'subido' | 'enlace-no-vale';

/**
 * Subir la tesis o el artículo escrito por su cuenta desde el enlace que da
 * Claude, para citarlo o humanizarlo.
 *
 * Misma forma que `subir-material`: sube el archivo y vuelve a la conversación.
 * Si ya había uno, se reemplaza, y el servidor conserva las citas y lo
 * humanizado de los párrafos que siguen igual.
 */
@Component({
  selector: 'app-subir-documento',
  imports: [SiteHeader, DatePipe],
  templateUrl: './subir-documento.html',
  styleUrl: '../subir-datos/subir-datos.css',
})
export class SubirDocumento implements OnInit {
  private readonly api = inject(DocumentoEnlaceService);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';

  readonly paso = signal<Paso>('comprobando');
  readonly error = signal<string | null>(null);
  readonly actual = signal<DocumentoSubido | null>(null);
  readonly mensaje = signal<string | null>(null);
  readonly nombre = signal<string | null>(null);
  readonly encima = signal(false);

  ngOnInit(): void {
    this.api.comprobar(this.token).subscribe({
      next: (enlace) => {
        this.actual.set(enlace.documento);
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
    // Se vacía para que volver a elegir el mismo archivo, ya corregido, dispare el cambio.
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
    this.mensaje.set(null);
    this.nombre.set(archivo.name);
    this.paso.set('subiendo');

    this.api.subir(this.token, archivo).subscribe({
      next: (subido) => {
        this.mensaje.set(subido.mensaje);
        this.paso.set('subido');
      },
      error: (e: unknown) => {
        // Los mensajes del servidor están escritos para el tesista: «eso no es un .docx».
        this.error.set(mensajeDeError(e));
        this.paso.set('elegir');
      },
    });
  }
}
