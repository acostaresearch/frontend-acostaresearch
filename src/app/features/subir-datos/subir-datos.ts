import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { mensajeDeError } from '../../core/http/api-error';
import { DatosRService, DatosSubidos } from '../../core/services/datos-r.service';
import { ArchivoParaZip, armarZip } from '../../shared/archivos/zip';
import { SiteHeader } from '../../shared/layout/site-header';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

type Paso = 'comprobando' | 'elegir' | 'subiendo' | 'subido' | 'enlace-no-vale';

/** Lo que entra de una vez en informes PDF. Tiene que coincidir con R_SUBIDA_LOTE_MAX_BYTES. */
const TOPE_DEL_LOTE = 60 * 1024 * 1024;
const MAXIMO_PDF = 500;

const esPdf = (nombre: string) => /\.pdf$/i.test(nombre);
const esHoja = (nombre: string) => /\.(xlsx|xls|csv|sav|txt|bib)$/i.test(nombre);
/** Lo que el sistema mete en una carpeta sin que nadie lo pida. */
const esBasura = (ruta: string) => ruta.split('/').some((p) => p.startsWith('.') || p === '__MACOSX');

/**
 * Lo único que el tesista hace con las manos en su análisis: subir el archivo.
 *
 * El resto lo hace Claude en la conversación —preguntar, correr R, explicar—,
 * así que esta página no tiene nada más que enseñar. Llega aquí desde el enlace
 * que le da la herramienta `trabajar_en_r`, sube, y vuelve a Claude.
 *
 * Sube una matriz (Excel, CSV o SPSS), un exporte bibliográfico, o —para quien
 * no tiene matriz sino un PDF por caso— una carpeta o varios PDF a la vez: el
 * navegador los junta en un .zip y el servidor arma la matriz.
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
    // Al elegir una carpeta, cada archivo trae su ruta dentro de ella.
    const archivos = Array.from(entrada.files ?? []).map((archivo) => ({
      ruta: archivo.webkitRelativePath || archivo.name,
      archivo,
    }));
    // Se vacía para que volver a elegir el MISMO archivo, ya corregido, dispare
    // el cambio otra vez.
    entrada.value = '';
    void this.recibir(archivos);
  }

  arrastrar(evento: DragEvent, dentro: boolean): void {
    evento.preventDefault();
    this.encima.set(dentro);
  }

  async soltar(evento: DragEvent): Promise<void> {
    evento.preventDefault();
    this.encima.set(false);
    const datos = evento.dataTransfer;
    if (!datos) return;

    // Una carpeta arrastrada no llega en `files`: hay que recorrerla. Las
    // entradas se piden ANTES del primer await, o el navegador las vacía.
    const entradas = Array.from(datos.items ?? [])
      .map((item) => item.webkitGetAsEntry?.())
      .filter((e): e is FileSystemEntry => !!e);
    const archivos =
      entradas.length > 0 && entradas.some((e) => e.isDirectory)
        ? (await Promise.all(entradas.map((e) => recorrer(e, '')))).flat()
        : Array.from(datos.files).map((archivo) => ({ ruta: archivo.name, archivo }));
    void this.recibir(archivos);
  }

  /** Un archivo suelto va tal cual; varios PDF, juntos en un .zip. */
  private async recibir(todos: ArchivoParaZip[]): Promise<void> {
    if (this.paso() === 'subiendo') return;
    const archivos = todos.filter((a) => !esBasura(a.ruta));
    if (archivos.length === 0) return;

    if (archivos.length === 1) {
      const [{ ruta, archivo }] = archivos;
      this.subir(archivo, ruta.split('/').at(-1) ?? ruta);
      return;
    }

    const pdfs = archivos.filter((a) => esPdf(a.ruta));
    if (pdfs.length === 0) {
      this.error.set(
        archivos.some((a) => esHoja(a.ruta))
          ? 'Elegiste varias hojas de cálculo. Por ahora se sube una sola matriz: júntalas en un Excel, ' +
              'una fila por persona, y súbelo. (Varios PDF sí se pueden subir a la vez.)'
          : 'Ahí no hay ningún PDF ni ninguna hoja de datos.',
      );
      return;
    }
    if (pdfs.length > MAXIMO_PDF) {
      this.error.set(`Son ${pdfs.length} PDF y el máximo es ${MAXIMO_PDF}. Súbelos en dos tandas.`);
      return;
    }
    const peso = pdfs.reduce((suma, a) => suma + a.archivo.size, 0);
    if (peso > TOPE_DEL_LOTE) {
      this.error.set(
        `Tus PDF pesan ${Math.round(peso / 1024 / 1024)} MB juntos y el máximo es ` +
          `${TOPE_DEL_LOTE / 1024 / 1024} MB. Súbelos en dos tandas o pregunta en tu conversación.`,
      );
      return;
    }

    const carpeta = pdfs[0].ruta.includes('/') ? pdfs[0].ruta.split('/')[0] : null;
    const nombre = `${pdfs.length} PDF${carpeta ? ` de la carpeta «${carpeta}»` : ''}`;
    this.paso.set('subiendo');
    this.nombre.set(nombre);
    try {
      const zip = await armarZip(pdfs);
      this.paso.set('elegir');
      this.subir(zip, nombre);
    } catch {
      this.paso.set('elegir');
      this.error.set('No se pudieron leer tus PDF desde el navegador. Vuelve a elegirlos.');
    }
  }

  private subir(archivo: Blob, nombre: string): void {
    if (this.paso() === 'subiendo') return;

    this.error.set(null);
    this.resultado.set(null);
    this.nombre.set(nombre);
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

/** Todos los archivos de una carpeta arrastrada, con su ruta dentro de ella. */
async function recorrer(entrada: FileSystemEntry, prefijo: string): Promise<ArchivoParaZip[]> {
  const ruta = prefijo ? `${prefijo}/${entrada.name}` : entrada.name;
  if (entrada.isFile) {
    const archivo = await new Promise<File>((resolver, fallar) =>
      (entrada as FileSystemFileEntry).file(resolver, fallar),
    );
    return [{ ruta, archivo }];
  }

  const lector = (entrada as FileSystemDirectoryEntry).createReader();
  const hijas: FileSystemEntry[] = [];
  // readEntries devuelve de a 100: se llama hasta que vuelva vacío.
  for (;;) {
    const tanda = await new Promise<FileSystemEntry[]>((resolver, fallar) => lector.readEntries(resolver, fallar));
    if (tanda.length === 0) break;
    hijas.push(...tanda);
  }
  return (await Promise.all(hijas.map((h) => recorrer(h, ruta)))).flat();
}
