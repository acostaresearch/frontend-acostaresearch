import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { catchError, concatMap, from, map, of, toArray } from 'rxjs';

import { mensajeDeError } from '../../core/http/api-error';
import { DocumentoEnlaceService, EnlaceDeDocumento } from '../../core/services/documento-enlace.service';
import { SiteHeader } from '../../shared/layout/site-header';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

type Paso = 'comprobando' | 'elegir' | 'subiendo' | 'subido' | 'enlace-no-vale';

const esPdf = (archivo: File) => /\.pdf$/i.test(archivo.name) || archivo.type === 'application/pdf';

/**
 * Subir la tesis o el artículo escrito por su cuenta desde el enlace que da
 * Claude, para citarlo o humanizarlo, y con él el reporte de IA de Turnitin.
 *
 * Misma forma que `subir-material`: sube los archivos y vuelve a la
 * conversación. Si ya había un Word, se reemplaza, y el servidor conserva las
 * citas y lo humanizado de los párrafos que siguen igual. El reporte (PDF) es
 * lo que permite humanizar solo lo que Turnitin marcó.
 */
@Component({
  selector: 'app-subir-documento',
  imports: [AvisoFlotante, SiteHeader, DatePipe],
  templateUrl: './subir-documento.html',
  styleUrl: '../subir-datos/subir-datos.css',
})
export class SubirDocumento implements OnInit {
  private readonly api = inject(DocumentoEnlaceService);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';

  readonly paso = signal<Paso>('comprobando');
  readonly error = signal<string | null>(null);
  readonly actual = signal<EnlaceDeDocumento['documento']>(null);
  readonly mensajes = signal<string[]>([]);
  readonly nombres = signal<string>('');
  readonly encima = signal(false);
  /** Para recordarle el reporte si solo subió el Word. */
  readonly subioReporte = signal(false);

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
    const archivos = [...(entrada.files ?? [])];
    // Se vacía para que volver a elegir el mismo archivo, ya corregido, dispare el cambio.
    entrada.value = '';
    this.subir(archivos);
  }

  arrastrar(evento: DragEvent, dentro: boolean): void {
    evento.preventDefault();
    this.encima.set(dentro);
  }

  soltar(evento: DragEvent): void {
    evento.preventDefault();
    this.encima.set(false);
    this.subir([...(evento.dataTransfer?.files ?? [])]);
  }

  /** El Word primero y el reporte después: así el mensaje del reporte ya dice cuántos párrafos marcó. */
  private subir(archivos: File[]): void {
    if (this.paso() === 'subiendo' || archivos.length === 0) return;
    const enOrden = [...archivos.filter((a) => !esPdf(a)), ...archivos.filter(esPdf)].slice(0, 2);

    this.error.set(null);
    this.mensajes.set([]);
    this.nombres.set(enOrden.map((a) => `«${a.name}»`).join(' y '));
    this.paso.set('subiendo');

    // Cada archivo va por su cuenta: si el Word entra y el PDF no es el reporte,
    // el Word ya está guardado y hay que decírselo.
    from(enOrden)
      .pipe(
        concatMap((archivo) =>
          this.api.subir(this.token, archivo).pipe(
            map((s) => ({ archivo, ok: true, texto: s.mensaje })),
            // Los mensajes del servidor están escritos para el tesista: «eso no es un .docx».
            catchError((e: unknown) => of({ archivo, ok: false, texto: `«${archivo.name}» no se guardó: ${mensajeDeError(e)}` })),
          ),
        ),
        toArray(),
      )
      .subscribe((resultados) => {
        const bien = resultados.filter((r) => r.ok);
        if (bien.length === 0) {
          this.error.set(resultados.map((r) => r.texto).join(' '));
          this.paso.set('elegir');
          return;
        }
        this.mensajes.set(resultados.map((r) => r.texto).filter(Boolean));
        this.subioReporte.update((antes) => antes || bien.some((r) => esPdf(r.archivo)) || Boolean(this.actual()?.reporteIa));
        this.paso.set('subido');
      });
  }
}
