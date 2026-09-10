import { Injectable, signal } from '@angular/core';

/** Una línea de la consola de R, con su origen. */
export interface LineaDeSalida {
  tipo: 'stdout' | 'stderr';
  texto: string;
}

/**
 * R corriendo dentro del navegador del tesista.
 *
 * POR QUÉ AQUÍ Y NO EN UN SERVIDOR
 * --------------------------------
 * Porque no hay servidor, y no lo va a haber. RStudio Server necesita una
 * máquina, y ponerlo en la de la API sería dar a cada comprador algo muy
 * parecido a una consola donde viven los secretos, los capítulos de todos y los
 * comprobantes de pago.
 *
 * WebR es R compilado a WebAssembly: se descarga una vez y se ejecuta en la
 * pestaña. Cero infraestructura, cero cuentas que aprovisionar, y los datos del
 * tesista no salen de su equipo — cosa que ningún servidor puede prometer.
 *
 * LO QUE ESTO NO ES
 * -----------------
 * NO es RStudio. Es R, que es lo que se declara en una tesis, pero no tiene la
 * interfaz de cuatro paneles ni sale en una captura como RStudio. Quien tenga
 * que enseñarle a su asesor la pantalla, tendrá que abrir RStudio y volver a
 * correr el mismo script — sale igual, porque es el mismo R y el mismo código.
 *
 * Eso hay que decirlo en la página, sin letra pequeña.
 *
 * SE CARGA CUANDO SE PIDE, NO AL ARRANCAR
 * ---------------------------------------
 * El paquete son decenas de megas. Cargarlo con la aplicación castigaría a
 * todos los que nunca van a analizar datos, que son la mayoría. Por eso el
 * `import()` va dentro de `arrancar()` y no arriba del archivo.
 */
@Injectable({ providedIn: 'root' })
export class WebrService {
  /** En qué punto va el arranque, para poder contarlo en pantalla. */
  readonly estado = signal<'apagado' | 'arrancando' | 'listo' | 'error'>('apagado');
  readonly paso = signal<string>('');

  /**
   * El arranque en curso, que resuelve en la instancia ya lista.
   *
   * Devuelve la instancia en vez de guardarla en un campo aparte para que quien
   * la use la tenga garantizada: con un campo que puede ser nulo, cada llamada
   * tendría que comprobarlo, y esa comprobación es la que un día se olvida.
   *
   * Dos llamadas a la vez esperan a la misma promesa: no se arrancan dos R.
   */
  private arranque: Promise<import('@r-wasm/webr').WebR> | null = null;

  arrancar(): Promise<import('@r-wasm/webr').WebR> {
    if (this.arranque) return this.arranque;

    this.arranque = this.arrancarDeVerdad().catch((error) => {
      // Se suelta la promesa para que un segundo intento pueda volver a probar:
      // el fallo típico es de red al bajar el paquete, y eso se reintenta.
      this.arranque = null;
      this.estado.set('error');
      throw error;
    });

    return this.arranque;
  }

  private async arrancarDeVerdad(): Promise<import('@r-wasm/webr').WebR> {
    this.estado.set('arrancando');
    this.paso.set('Descargando R… (unos 30 MB, solo la primera vez)');

    const { WebR } = await import('@r-wasm/webr');

    const webR = new WebR();
    await webR.init();

    this.paso.set('Instalando los paquetes de estadística…');
    // `psych` trae el alfa de Cronbach y los descriptivos, que es el 80% de lo
    // que hace una tesis. Se instala al arrancar y no cuando se necesita: son
    // dos segundos aquí y una espera desconcertante a mitad de análisis.
    await webR.installPackages(['psych']);

    this.paso.set('');
    this.estado.set('listo');

    return webR;
  }

  /**
   * Deja un archivo del tesista dentro del sistema de archivos de R.
   *
   * A partir de ahí `read.csv("datos.csv")` funciona igual que en RStudio. El
   * archivo vive en la memoria de la pestaña: al cerrarla desaparece, y no ha
   * viajado a ningún sitio.
   */
  async subirArchivo(nombre: string, contenido: ArrayBuffer): Promise<void> {
    const webR = await this.arrancar();
    await webR.FS.writeFile(`/home/web_user/${nombre}`, new Uint8Array(contenido));
  }

  /**
   * Ejecuta código y devuelve lo que habría salido por la consola.
   *
   * `withAutoprint` es lo que hace que escribir `mean(x)` a secas imprima el
   * resultado, igual que en la consola de R. Sin eso, el tesista escribiría lo
   * mismo que en RStudio y no vería nada.
   *
   * Los errores de R NO se lanzan como excepción: vuelven como líneas de
   * `stderr`, que es como los ve en la consola. Un error de sintaxis es parte
   * del trabajo, no un fallo de la página.
   */
  async ejecutar(codigo: string): Promise<LineaDeSalida[]> {
    const webR = await this.arrancar();
    const shelter = await new webR.Shelter();

    try {
      const resultado = await shelter.captureR(codigo, {
        withAutoprint: true,
        captureStreams: true,
        captureConditions: false,
      });

      return (resultado.output ?? []).map((linea) => ({
        tipo: linea.type === 'stderr' ? ('stderr' as const) : ('stdout' as const),
        texto: String(linea.data),
      }));
    } catch (error) {
      return [{ tipo: 'stderr', texto: error instanceof Error ? error.message : String(error) }];
    } finally {
      // Sin esto, cada ejecución deja objetos de R vivos y la pestaña va
      // engordando durante la sesión.
      await shelter.purge();
    }
  }
}
