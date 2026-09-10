/**
 * Los tipos de WebR, declarados aquí porque el paquete no los entrega.
 *
 * `@r-wasm/webr@0.2.0` trae sus `.d.ts` en `dist/webR/`, pero su `package.json`
 * los anuncia como `"types": "webr-main.d.ts"` —una ruta que no existe en la
 * raíz del paquete—. TypeScript no los encuentra y el build falla con TS7016.
 *
 * Tampoco se pueden importar por su ruta real: el campo `exports` solo publica
 * `.`, `./chan/serviceworker` y `./repl`, así que llegar a `dist/webR/...` está
 * cerrado.
 *
 * Se declara SOLO lo que usa `webr.service.ts`, y eso es deliberado: escribir
 * `declare module '@r-wasm/webr'` a secas convierte la biblioteca entera en
 * `any` y el primer cambio de su API pasaría desapercibido. Así, la superficie
 * de la que dependemos está escrita y se rompe a la vista si cambia.
 *
 * Si algún día publican el paquete con sus tipos bien, este archivo se borra.
 */
declare module '@r-wasm/webr' {
  /** Una línea de la consola de R, tal como la devuelve `captureR`. */
  export interface WebRSalida {
    type: 'stdout' | 'stderr' | string;
    data: string;
  }

  /**
   * Un ámbito con vida propia para los objetos de R.
   *
   * Sin `purge()`, cada ejecución deja objetos vivos y la pestaña engorda a lo
   * largo de la sesión.
   */
  export interface WebRShelter {
    captureR(
      code: string,
      options?: {
        withAutoprint?: boolean;
        captureStreams?: boolean;
        captureConditions?: boolean;
      },
    ): Promise<{ output: WebRSalida[] }>;
    purge(): Promise<void>;
  }

  export class WebR {
    init(): Promise<unknown>;
    installPackages(packages: string[], quiet?: boolean): Promise<void>;

    /** El sistema de archivos virtual: donde aterriza la matriz del tesista. */
    FS: {
      writeFile(path: string, data: ArrayBufferView, flags?: string): Promise<void>;
    };

    /** Se instancia con `await new webR.Shelter()`, que devuelve una promesa. */
    Shelter: new () => Promise<WebRShelter>;
  }
}
