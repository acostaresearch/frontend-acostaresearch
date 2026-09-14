import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { mensajeDeError } from '../../core/http/api-error';
import { FormatoPuesto, FormatoService } from '../../core/services/formato.service';
import { SiteHeader } from '../../shared/layout/site-header';

type Paso = 'comprobando' | 'elegir' | 'subiendo' | 'subido' | 'enlace-no-vale';

/**
 * Subir el formato de la universidad, desde el enlace que da Claude.
 *
 * Sustituye al recuadro «Subir formato» del perfil. Claude pregunta si la
 * universidad le dio un formato y, si lo hay, le da el enlace a esta página: el
 * tesista sube el .docx y vuelve a la conversación. Copia la forma de
 * `subir-datos`, que es la misma idea para la matriz de R.
 */
@Component({
  selector: 'app-subir-formato',
  imports: [SiteHeader, DatePipe],
  templateUrl: './subir-formato.html',
  styleUrl: '../subir-datos/subir-datos.css',
})
export class SubirFormato implements OnInit {
  private readonly api = inject(FormatoService);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';

  readonly paso = signal<Paso>('comprobando');
  readonly error = signal<string | null>(null);
  /** El que ya tenía puesto al abrir el enlace, si había uno. */
  readonly anterior = signal<FormatoPuesto | null>(null);
  readonly mensaje = signal<string | null>(null);
  readonly nombre = signal<string | null>(null);
  readonly encima = signal(false);

  ngOnInit(): void {
    this.api.comprobar(this.token).subscribe({
      next: (enlace) => {
        this.anterior.set(enlace.formato);
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
    this.mensaje.set(null);
    this.nombre.set(archivo.name);
    this.paso.set('subiendo');

    this.api.subir(this.token, archivo).subscribe({
      next: (subido) => {
        this.mensaje.set(subido.mensaje);
        this.anterior.set(subido.formato);
        this.paso.set('subido');
      },
      error: (e: unknown) => {
        // Los mensajes del servidor están escritos para el tesista: «eso es un
        // .doc antiguo, guárdalo como .docx».
        this.error.set(mensajeDeError(e));
        this.paso.set('elegir');
      },
    });
  }
}
