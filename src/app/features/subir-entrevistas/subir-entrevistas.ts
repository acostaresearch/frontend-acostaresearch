import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { mensajeDeError } from '../../core/http/api-error';
import { Entrevista, EntrevistasService } from '../../core/services/entrevistas.service';
import { SiteHeader } from '../../shared/layout/site-header';

type Paso = 'comprobando' | 'elegir' | 'subiendo' | 'subido' | 'enlace-no-vale';

/** Cómo le fue a cada archivo de la tanda. */
interface Resultado {
  nombre: string;
  ok: boolean;
  mensaje: string;
}

/**
 * Subir las entrevistas o grupos focales desde el enlace que da Claude con
 * «analisis_cualitativo».
 *
 * Misma forma que `subir-material`, pero se pueden elegir varios archivos a la
 * vez: se suben de uno en uno y cada uno dice cómo le fue, porque una
 * transcripción que no se lee no tiene por qué tumbar las demás.
 */
@Component({
  selector: 'app-subir-entrevistas',
  imports: [SiteHeader],
  templateUrl: './subir-entrevistas.html',
  styleUrl: '../subir-datos/subir-datos.css',
})
export class SubirEntrevistas implements OnInit {
  private readonly api = inject(EntrevistasService);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';

  readonly paso = signal<Paso>('comprobando');
  readonly error = signal<string | null>(null);
  readonly entrevistas = signal<Entrevista[]>([]);
  readonly resultados = signal<Resultado[]>([]);
  readonly actual = signal<string | null>(null);
  readonly encima = signal(false);

  readonly aceptados =
    '.docx,.pdf,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/plain';

  ngOnInit(): void {
    this.api.comprobar(this.token).subscribe({
      next: (enlace) => {
        this.entrevistas.set(enlace.entrevistas);
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
    const archivos = Array.from(entrada.files ?? []);
    // Se vacía para que volver a elegir los mismos archivos, ya corregidos, dispare el cambio.
    entrada.value = '';
    void this.subir(archivos);
  }

  arrastrar(evento: DragEvent, dentro: boolean): void {
    evento.preventDefault();
    this.encima.set(dentro);
  }

  soltar(evento: DragEvent): void {
    evento.preventDefault();
    this.encima.set(false);
    void this.subir(Array.from(evento.dataTransfer?.files ?? []));
  }

  private async subir(archivos: File[]): Promise<void> {
    if (archivos.length === 0 || this.paso() === 'subiendo') return;

    this.error.set(null);
    this.resultados.set([]);
    this.paso.set('subiendo');

    for (const archivo of archivos) {
      this.actual.set(archivo.name);
      try {
        const subida = await firstValueFrom(this.api.subir(this.token, archivo));
        this.entrevistas.set(subida.entrevistas);
        this.resultados.update((r) => [...r, { nombre: archivo.name, ok: true, mensaje: subida.mensaje }]);
      } catch (e: unknown) {
        // Los mensajes del servidor están escritos para el tesista: «es un PDF escaneado…».
        this.resultados.update((r) => [...r, { nombre: archivo.name, ok: false, mensaje: mensajeDeError(e) }]);
      }
    }

    this.actual.set(null);
    this.paso.set(this.resultados().some((r) => r.ok) ? 'subido' : 'elegir');
  }
}
