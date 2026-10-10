import { computed, signal, Signal } from '@angular/core';
import { BusquedaDeScopus, ResultadoDeScopus } from '../../core/services/scopus.service';
import { FORMATOS, FormatoDeExportacion, contenido, nombreDelArchivo } from './scopus-exportar';

export class ExportacionScopus {
constructor(readonly busqueda: Signal<BusquedaDeScopus | null>,
readonly marcados: Signal<ReadonlySet<string>>, readonly mostrarError: (texto: string) => void) {}
  /** Los formatos del menú de exportar. Ver `scopus-exportar`. */
  readonly formatos = FORMATOS;
  readonly menuExportar = signal(false);

  /**
   * El DOI que se acaba de copiar, para decirlo en el botón.
   *
   * Un botón que no contesta nada deja al tesista sin saber si funcionó, y lo
   * pulsa tres veces. Se borra solo a los dos segundos.
   */
  readonly doiCopiado = signal<string | null>(null);

  /**
   * Lo que se va a exportar: lo marcado, o la página entera si no marcó nada.
   *
   * La misma regla que se lee en el botón. Exportar solo lo marcado cuando no
   * hay nada marcado daría un archivo vacío, y exportar siempre la página
   * ignoraría las casillas que acaba de pulsar.
   */
  readonly aExportar = computed<ResultadoDeScopus[]>(() => {
    const resultados = this.busqueda()?.resultados ?? [];
    const marcados = this.marcados();
    return marcados.size > 0 ? resultados.filter((r) => marcados.has(r.eid)) : resultados;
  });

  /**
   * Descarga los resultados en el formato elegido.
   *
   * No pasa por el servidor: los datos ya están en el navegador y volver a
   * pedírselos a Elsevier gastaría cuota de la casa por un archivo que a menudo
   * se pide por curiosidad. Ver `scopus-exportar`.
   */
  exportar(formato: FormatoDeExportacion): void {
    this.menuExportar.set(false);
    const resultados = this.aExportar();
    if (resultados.length === 0) return;

    const tipo = this.formatos.find((f) => f.valor === formato);
    const blob = new Blob([contenido(formato, resultados)], { type: tipo?.mime ?? 'text/plain' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreDelArchivo(formato);
    enlace.click();
    // Se suelta después: algunos navegadores aún no empezaron a guardar.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /**
   * Copia el DOI al portapapeles.
   *
   * El DOI se enseña entero porque es lo que se pega en la matriz de
   * antecedentes, en el correo al asesor o en la caja de búsqueda de otra base;
   * y lo que se enseña para copiar tiene que poder copiarse de un clic, sin
   * seleccionar a mano catorce caracteres que se cortan mal.
   */
  copiarDoi(doi: string): void {
    void navigator.clipboard.writeText(doi).then(
      () => {
        this.doiCopiado.set(doi);
        setTimeout(() => {
          if (this.doiCopiado() === doi) this.doiCopiado.set(null);
        }, 2000);
      },
      () => this.mostrarError('Tu navegador no nos dejó copiar. Selecciónalo y cópialo a mano.'),
    );
  }

}
