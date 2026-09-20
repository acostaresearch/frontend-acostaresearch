import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { mensajeDeError } from '../../core/http/api-error';
import { ArchivoDeMaterial, MaterialService } from '../../core/services/material.service';
import { SiteHeader } from '../../shared/layout/site-header';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

type Paso = 'comprobando' | 'elegir' | 'subiendo' | 'subido' | 'enlace-no-vale';

/**
 * Subir el material del encargo —la consigna, la rúbrica o el índice en un
 * informe de curso; los términos de referencia en uno de empresa— desde el
 * enlace que da Claude.
 *
 * Misma forma que `subir-formato`: el estudiante sube el archivo y vuelve a la
 * conversación, donde Claude lo lee. No toca el formato del Word. Se aceptan
 * Word, PDF, Excel y texto: lo único que no se lee aquí es una foto o un PDF
 * escaneado, que van adjuntos en el chat.
 */
@Component({
  selector: 'app-subir-material',
  imports: [AvisoFlotante, SiteHeader, DatePipe],
  templateUrl: './subir-material.html',
  styleUrl: '../subir-datos/subir-datos.css',
})
export class SubirMaterial implements OnInit {
  private readonly api = inject(MaterialService);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';

  readonly paso = signal<Paso>('comprobando');
  readonly error = signal<string | null>(null);
  readonly material = signal<ArchivoDeMaterial[]>([]);
  readonly mensaje = signal<string | null>(null);
  readonly nombre = signal<string | null>(null);
  readonly encima = signal(false);
  /** Un informe de empresa: se suben los términos de referencia o los documentos del encargo. */
  readonly deEmpresa = signal(false);

  ngOnInit(): void {
    this.api.comprobar(this.token).subscribe({
      next: (enlace) => {
        this.material.set(enlace.material);
        this.deEmpresa.set(enlace.ambito === 'empresa');
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
        this.material.set(subido.material);
        this.paso.set('subido');
      },
      error: (e: unknown) => {
        // Los mensajes del servidor están escritos para el estudiante: «es una
        // imagen, adjúntala en el chat de tu asistente».
        this.error.set(mensajeDeError(e));
        this.paso.set('elegir');
      },
    });
  }
}
