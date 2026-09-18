import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { toApiError } from '../../core/http/api-error';
import { DialogoService } from '../../core/services/dialogo.service';
import { MisFuentesService } from '../../core/services/mis-fuentes.service';
import {
  BusquedaDeScopus,
  EstadoDeScopus,
  ImportacionDeScopus,
  ScopusService,
} from '../../core/services/scopus.service';

/**
 * Buscar en Scopus desde aquí y traerse lo que elija.
 *
 * VA JUNTO A LA SUBIDA DE ARCHIVOS, NO EN SU LUGAR
 * ------------------------------------------------
 * Son la misma pregunta —de dónde salen las fuentes que Claude va a citar— por
 * dos puertas, y las dos tienen que seguir abiertas. El archivo funciona
 * siempre: lo exporta el tesista con el acceso de su universidad y no depende
 * de que Elsevier nos deje entrar. Esto es más cómodo cuando está encendido, y
 * cuando no lo está la tarjeta se comporta como se comportaba antes.
 *
 * TRES DECISIONES QUE SE VEN EN LA PANTALLA
 * -----------------------------------------
 * 1. Nunca se le pide su contraseña de Scopus, ni su usuario, ni una clave de
 *    API. O autoriza en Elsevier, o se busca con la credencial de este
 *    servidor. Aquí no se escribe ninguna credencial suya.
 *
 * 2. Se marca lo que ya tiene, pero no se le esconde. Quien busca en Scopus
 *    quiere ver los mismos artículos que ve en Scopus; quitarle los repetidos
 *    de la lista le haría contarlos mal y desconfiar del buscador.
 *
 * 3. No hay paso de «conectar» mientras se busque con la credencial del
 *    servidor: no habría nada que conectar, y era un clic de trámite entre el
 *    tesista y el buscador. Con el OAuth de Elsevier habilitado vuelve a
 *    aparecer, porque ahí sí se autoriza algo.
 *
 * 4. Con el campo vacío se explica CÓMO ESCRIBIR LA ECUACIÓN DE SU TEMA, no
 *    cómo funciona esto por dentro. Quien mira un campo en blanco no necesita
 *    saber de dónde sale el resumen: necesita saber qué teclear.
 */
@Component({
  selector: 'app-mi-scopus',
  templateUrl: './mi-scopus.html',
  styleUrl: './mi-scopus.css',
})
export class MiScopusPanel implements OnInit {
  private readonly scopus = inject(ScopusService);
  private readonly dialogos = inject(DialogoService);
  private readonly misFuentes = inject(MisFuentesService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly estado = signal<EstadoDeScopus | null>(null);
  readonly cargando = signal(true);
  readonly conectando = signal(false);
  readonly buscando = signal(false);
  readonly importando = signal(false);
  readonly error = signal<string | null>(null);

  readonly busqueda = signal<BusquedaDeScopus | null>(null);
  readonly parte = signal<ImportacionDeScopus | null>(null);

  /**
   * Lo que trajo la vuelta desde Elsevier: ok, cancelado, rechazado o error.
   *
   * Llega en la dirección porque quien redirige es Elsevier y no nosotros. Se
   * lee una vez y se limpia de la barra: recargar la página no debería volver
   * a anunciar algo que pasó hace diez minutos.
   */
  readonly vuelta = signal<string | null>(null);

  /**
   * Búsqueda normal o avanzada, como en la web de Scopus.
   *
   * La normal existe porque la mayoría de tesistas no ha escrito una ecuación
   * en su vida y un campo que pide `TITLE-ABS-KEY(…)` los frena en la puerta:
   * escriben palabras, eligen dónde buscarlas, y la ecuación se arma sola. La
   * avanzada es el campo de siempre, para quien trae la ecuación de Claude.
   *
   * Cada modo guarda su propio texto: cambiar de pestaña no borra lo escrito
   * en la otra.
   */
  readonly modo = signal<'normal' | 'avanzada'>('normal');
  readonly texto = signal('');
  readonly campo = signal('TITLE-ABS-KEY');
  readonly ecuacion = signal('');

  /** Dónde se buscan las palabras en la búsqueda normal. Son campos de Scopus. */
  readonly campos = [
    { valor: 'TITLE-ABS-KEY', texto: 'Título, resumen y palabras clave' },
    { valor: 'TITLE', texto: 'Solo el título' },
    { valor: 'AUTHOR-NAME', texto: 'Autor' },
    { valor: 'SRCTITLE', texto: 'Revista' },
    { valor: 'DOI', texto: 'DOI' },
  ];

  /**
   * Lo escrito en la búsqueda normal, convertido en ecuación.
   *
   * Se quitan los paréntesis: aquí nadie los pone a propósito, y uno sin cerrar
   * haría que Scopus rechazara la búsqueda con un error que el tesista no
   * sabría leer. Las comillas se quedan —una frase exacta sigue sirviendo— y
   * las palabras sueltas Scopus las junta con AND dentro del campo.
   */
  readonly ecuacionNormal = computed(() => {
    const limpio = this.texto().replace(/[(){}]/g, ' ').replace(/\s+/g, ' ').trim();
    return limpio ? `${this.campo()}(${limpio})` : '';
  });

  /** La ecuación del modo en el que está, sin filtros. */
  private readonly ecuacionBase = computed(() =>
    this.modo() === 'normal' ? this.ecuacionNormal() : this.ecuacion().trim(),
  );

  cambiarModo(modo: 'normal' | 'avanzada'): void {
    if (modo === this.modo()) return;
    // Pasar a avanzada con palabras escritas se lleva la ecuación ya armada:
    // es la forma natural de aprender a escribirla, partiendo de la suya.
    if (modo === 'avanzada' && !this.ecuacion().trim() && this.ecuacionNormal()) {
      this.ecuacion.set(this.ecuacionNormal());
    }
    this.modo.set(modo);
  }

  /**
   * Lo que tiene marcado, por EID.
   *
   * Se vacía al cambiar de página a propósito. Guardar la selección entre
   * páginas suena mejor de lo que es: el servidor importa como mucho una
   * página de golpe, así que una selección que cruza páginas acabaría en un
   * error justo al final, después de haber marcado treinta cosas.
   */
  readonly marcados = signal<ReadonlySet<string>>(new Set());

  readonly cuantosMarcados = computed(() => this.marcados().size);

  /** El ejemplo que se ofrece. Es el mismo que arma la skill del método. */
  readonly ejemplo = 'TITLE-ABS-KEY("mobile applications" AND education) AND PUBYEAR > 2019';

  /** El de la búsqueda normal: palabras, en inglés, sin sintaxis. */
  readonly ejemploNormal = '"mobile learning" university students';

  /**
   * Los filtros de debajo del campo.
   *
   * NO VIAJAN APARTE: se convierten en cláusulas de la propia ecuación
   * (`PUBYEAR`, `DOCTYPE`, `LANGUAGE`, `OPENACCESS`) y se pegan con AND. Es el
   * mismo lenguaje que usa Scopus en su web, así que el servidor no cambia y lo
   * que se busca es exactamente la ecuación que se enseña debajo: quien la copie
   * y la pegue en Scopus ve los mismos resultados.
   */
  readonly anioDesde = signal('');
  readonly anioHasta = signal('');
  readonly tipo = signal('');
  readonly idioma = signal('');
  readonly soloAbiertos = signal(false);
  readonly area = signal('');

  /**
   * Las áreas temáticas de Scopus, con el código que entiende `SUBJAREA`.
   *
   * Son las 27 de Scopus y ninguna más: el área es de la REVISTA, no del
   * artículo, así que inventar subáreas propias prometería una precisión que
   * Scopus no tiene. Van por orden alfabético en español, que es como se buscan.
   */
  readonly areas = [
    { valor: 'AGRI', texto: 'Agricultura y biología' },
    { valor: 'ARTS', texto: 'Artes y humanidades' },
    { valor: 'BIOC', texto: 'Bioquímica, genética y biología molecular' },
    { valor: 'BUSI', texto: 'Administración, negocios y contabilidad' },
    { valor: 'CENG', texto: 'Ingeniería química' },
    { valor: 'CHEM', texto: 'Química' },
    { valor: 'COMP', texto: 'Ciencias de la computación' },
    { valor: 'DECI', texto: 'Ciencias de la decisión' },
    { valor: 'DENT', texto: 'Odontología' },
    { valor: 'EART', texto: 'Ciencias de la Tierra y planetarias' },
    { valor: 'ECON', texto: 'Economía, econometría y finanzas' },
    { valor: 'ENER', texto: 'Energía' },
    { valor: 'ENGI', texto: 'Ingeniería' },
    { valor: 'ENVI', texto: 'Ciencias ambientales' },
    { valor: 'HEAL', texto: 'Profesiones de la salud' },
    { valor: 'IMMU', texto: 'Inmunología y microbiología' },
    { valor: 'MATE', texto: 'Ciencia de materiales' },
    { valor: 'MATH', texto: 'Matemáticas' },
    { valor: 'MEDI', texto: 'Medicina' },
    { valor: 'MULT', texto: 'Multidisciplinar' },
    { valor: 'NEUR', texto: 'Neurociencia' },
    { valor: 'NURS', texto: 'Enfermería' },
    { valor: 'PHAR', texto: 'Farmacología, toxicología y farmacia' },
    { valor: 'PHYS', texto: 'Física y astronomía' },
    { valor: 'PSYC', texto: 'Psicología' },
    { valor: 'SOCI', texto: 'Ciencias sociales' },
    { valor: 'VETE', texto: 'Veterinaria' },
  ].sort((a, b) => a.texto.localeCompare(b.texto, 'es'));

  readonly tipos = [
    { valor: 'ar', texto: 'Artículo' },
    { valor: 're', texto: 'Revisión' },
    { valor: 'cp', texto: 'Ponencia de congreso' },
    { valor: 'ch', texto: 'Capítulo de libro' },
    { valor: 'bk', texto: 'Libro' },
  ];

  readonly idiomas = [
    { valor: 'english', texto: 'Inglés' },
    { valor: 'spanish', texto: 'Español' },
    { valor: 'portuguese', texto: 'Portugués' },
  ];

  /** Un año que se pueda creer, o nada. Lo demás se ignora sin avisar. */
  private anio(texto: string): number | null {
    const numero = Number(texto);
    const tope = new Date().getFullYear() + 1;
    return Number.isInteger(numero) && numero >= 1900 && numero <= tope ? numero : null;
  }

  /** Las cláusulas que añaden los filtros, ya en el lenguaje de Scopus. */
  readonly clausulas = computed(() => {
    let desde = this.anio(this.anioDesde());
    let hasta = this.anio(this.anioHasta());
    // Escribir los años al revés es un despiste, no una búsqueda vacía.
    if (desde !== null && hasta !== null && desde > hasta) [desde, hasta] = [hasta, desde];

    const partes: string[] = [];
    if (desde !== null && desde === hasta) partes.push(`PUBYEAR = ${desde}`);
    else {
      // Scopus no tiene «mayor o igual»: se corre un año para que el que se
      // escribió entre.
      if (desde !== null) partes.push(`PUBYEAR > ${desde - 1}`);
      if (hasta !== null) partes.push(`PUBYEAR < ${hasta + 1}`);
    }
    if (this.area()) partes.push(`SUBJAREA(${this.area()})`);
    if (this.tipo()) partes.push(`DOCTYPE(${this.tipo()})`);
    if (this.idioma()) partes.push(`LANGUAGE(${this.idioma()})`);
    if (this.soloAbiertos()) partes.push('OPENACCESS(1)');
    return partes;
  });

  readonly hayFiltros = computed(() => this.clausulas().length > 0);

  /**
   * La ecuación escrita con los filtros pegados.
   *
   * La del tesista va entre paréntesis: sin ellos, un `OR` suyo se comería el
   * primer filtro y `a OR b AND PUBYEAR > 2019` filtraría solo la mitad.
   */
  readonly ecuacionCompleta = computed(() => {
    const ecuacion = this.ecuacionBase();
    const clausulas = this.clausulas();
    if (!ecuacion) return '';
    return clausulas.length ? [`(${ecuacion})`, ...clausulas].join(' AND ') : ecuacion;
  });

  ngOnInit(): void {
    const resultado = this.ruta.snapshot.queryParamMap.get('scopus');
    if (resultado) {
      this.vuelta.set(resultado);
      void this.router.navigate([], {
        relativeTo: this.ruta,
        queryParams: { scopus: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }

    this.cargar();
  }

  private cargar(): void {
    this.scopus.estado().subscribe({
      next: (datos) => {
        this.estado.set(datos);
        this.cargando.set(false);
      },
      error: () => {
        this.estado.set(null);
        this.cargando.set(false);
      },
    });
  }

  conectar(): void {
    if (this.conectando()) return;
    this.conectando.set(true);
    this.error.set(null);

    this.scopus.conectar().subscribe({
      next: ({ url }) => {
        if (url) {
          // Navegación completa y en esta misma pestaña: al terminar, Elsevier
          // devuelve al tesista aquí. Una pestaña nueva lo dejaría mirando la
          // vieja, que no se entera de nada.
          window.location.href = url;
          return;
        }
        this.conectando.set(false);
        this.vuelta.set(null);
        this.cargar();
      },
      error: (fallo: unknown) => {
        this.conectando.set(false);
        this.error.set(toApiError(fallo).message);
      },
    });
  }

  buscar(pagina = 1): void {
    const ecuacion = this.ecuacionCompleta();
    if (!ecuacion || this.buscando()) return;

    this.buscando.set(true);
    this.error.set(null);
    this.parte.set(null);
    this.marcados.set(new Set());

    this.scopus.buscar(ecuacion, pagina).subscribe({
      next: (resultado) => {
        this.busqueda.set(resultado);
        this.buscando.set(false);
      },
      error: (fallo: unknown) => {
        this.buscando.set(false);
        this.error.set(toApiError(fallo).message);
        // Una búsqueda que falló no puede dejar en pantalla los resultados de
        // la anterior: parecería que esos son la respuesta a lo que escribió.
        this.busqueda.set(null);
        this.cargar();
      },
    });
  }

  /**
   * Un filtro cambió. Si ya hay resultados en pantalla se vuelve a buscar desde
   * la primera página: dejar la lista vieja debajo de un filtro nuevo haría
   * creer que esa lista ya está filtrada.
   */
  filtrar(): void {
    if (this.busqueda()) this.buscar(1);
  }

  quitarFiltros(): void {
    this.anioDesde.set('');
    this.anioHasta.set('');
    this.tipo.set('');
    this.idioma.set('');
    this.soloAbiertos.set(false);
    this.area.set('');
    this.filtrar();
  }

  usarEjemplo(): void {
    if (this.modo() === 'normal') {
      this.campo.set('TITLE-ABS-KEY');
      this.texto.set(this.ejemploNormal);
    } else {
      this.ecuacion.set(this.ejemplo);
    }
  }

  /**
   * Borra la búsqueda y vuelve al punto de partida.
   *
   * Se puede afinar una ecuación sin esto —el campo sigue ahí y se edita—, así
   * que esto no es para corregir: es para EMPEZAR OTRA. Quien termina con un
   * tema y pasa al siguiente se encontraba la lista del anterior debajo del
   * campo, las marcas a medio poner y el parte de la importación de hace un
   * rato, y tenía que recargar la página para quitarlo.
   *
   * Se lleva TODO lo de la búsqueda anterior, incluido el parte: dejar «3
   * fuentes importadas» en pantalla mientras se busca otra cosa hace dudar de
   * si eso es de ahora o de antes. Lo que no toca son las fuentes, que ya
   * están guardadas y no dependen de esta pantalla.
   */
  limpiar(): void {
    this.texto.set('');
    this.ecuacion.set('');
    this.busqueda.set(null);
    this.marcados.set(new Set());
    this.parte.set(null);
    this.error.set(null);
  }

  pagina(numero: number): void {
    const busqueda = this.busqueda();
    if (!busqueda || numero < 1 || numero > busqueda.paginas) return;
    this.buscar(numero);
  }

  marcar(eid: string): void {
    const copia = new Set(this.marcados());
    if (copia.has(eid)) copia.delete(eid);
    else copia.add(eid);
    this.marcados.set(copia);
  }

  /** Marcar toda la página de una vez, o desmarcarla si ya lo estaba entera. */
  marcarTodo(): void {
    const enPantalla = this.busqueda()?.resultados ?? [];
    if (enPantalla.length === 0) return;

    const todos = enPantalla.every((r) => this.marcados().has(r.eid));
    this.marcados.set(todos ? new Set() : new Set(enPantalla.map((r) => r.eid)));
  }

  importar(): void {
    const eids = [...this.marcados()];
    if (eids.length === 0 || this.importando()) return;

    this.importando.set(true);
    this.error.set(null);
    this.parte.set(null);

    this.scopus.importar(eids).subscribe({
      next: (resultado) => {
        this.importando.set(false);
        this.parte.set(resultado);
        this.marcados.set(new Set());
        // Lo recién importado pasa a estar «ya en tu biblioteca», para que las
        // marcas de la lista cuadren con lo que hay detrás.
        this.marcarComoTuyas(eids);
        this.cargar();
        // Y la cifra de «fuentes tuyas» de la tarjeta de abajo, que es OTRO
        // componente y no se entera de esto por su cuenta. Sin el aviso se
        // queda con el número viejo hasta recargar la página, y lo que parece
        // entonces es que la importación no funcionó.
        this.misFuentes.avisarDeCambio();
      },
      error: (fallo: unknown) => {
        this.importando.set(false);
        this.error.set(toApiError(fallo).message);
      },
    });
  }

  /**
   * Marca en la lista de pantalla lo que se acaba de importar.
   *
   * En vez de repetir la búsqueda, que sería otra petición a Elsevier contra
   * la cuota de la casa por un cambio que ya se sabe cuál es.
   */
  private marcarComoTuyas(eids: string[]): void {
    const traidas = new Set(eids);
    this.busqueda.update((busqueda) =>
      busqueda
        ? {
            ...busqueda,
            resultados: busqueda.resultados.map((resultado) =>
              traidas.has(resultado.eid) ? { ...resultado, yaLaTienes: true } : resultado,
            ),
          }
        : busqueda,
    );
  }

  async desconectar(): Promise<void> {
    const seguro = await this.dialogos.confirmar({
      titulo: 'Desconectar Scopus',
      mensaje: 'Dejaremos de buscar en Scopus a tu nombre.',
      nota: 'Las fuentes que ya importaste se quedan donde están: si las quitáramos, las citas que ya escribiste en tus capítulos dejarían de resolver.',
      confirmar: 'Desconectar',
      tono: 'peligro',
    });
    if (!seguro) return;

    this.error.set(null);
    this.scopus.desconectar().subscribe({
      next: () => {
        this.busqueda.set(null);
        this.parte.set(null);
        this.vuelta.set(null);
        this.marcados.set(new Set());
        this.cargar();
      },
      error: (fallo: unknown) => this.error.set(toApiError(fallo).message),
    });
  }
}
