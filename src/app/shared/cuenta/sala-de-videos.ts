import {
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { Tutorial, TutorialService } from '../../core/services/tutorial.service';
import {
  loQueLeToca,
  nombreDeProducto,
  pestanaElegida,
  pestanasDeProducto,
  saleEn,
} from '../contenido/productos-de-ayuda';

/** Un bloque de la lista: su rótulo y los videos que lleva, con su posición. */
interface Grupo {
  nombre: string;
  videos: { tutorial: Tutorial; indice: number }[];
}

/** Un bloque de la lista de la media pantalla (ver `bloques`). */
interface Bloque {
  nombre: string;
  /** «17 min» o «9 videos», a la derecha del rótulo. */
  resumen: string;
  /** En fichas a dos columnas. Hoy, todos; la plantilla aún sabe pintar filas. */
  enRejilla: boolean;
  videos: { tutorial: Tutorial; indice: number; numero: string; titulo: string }[];
}

/**
 * La sala del video curso: un reproductor y la lista de videos.
 *
 * Vive en `shared` desde el 11-oct porque la usan dos: la página pública
 * `/tutoriales`, a todo el ancho, y el perfil, que la pone a la izquierda de
 * «Por dónde vas» para ver el video y el avance a la vez (`estrecha`).
 *
 * UN REPRODUCTOR, NO UNO POR VIDEO
 * --------------------------------
 * Con ocho videos apilados la página se hacía eterna y cargaba ocho iframes de
 * YouTube. Hay uno solo, con la lista como en un curso, y el iframe no existe
 * hasta que se pulsa play: antes se enseña la miniatura, que es una imagen y
 * no un reproductor entero.
 */
@Component({
  selector: 'app-sala-de-videos',
  templateUrl: './sala-de-videos.html',
  styleUrl: './sala-de-videos.css',
  host: { '[class.estrecha]': 'estrecha()' },
})
export class SalaDeVideos implements OnInit {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly api = inject(TutorialService);
  private readonly auth = inject(AuthService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly reproductor = viewChild<ElementRef<HTMLElement>>('reproductor');

  /**
   * Si la pestaña de producto va en la dirección (`?producto=informe`), para
   * mandar a alguien directo a lo suyo. Solo en `/tutoriales`: en el perfil la
   * dirección es de la sección.
   */
  readonly enDireccion = input(false);

  /** En media pantalla: la lista va debajo del reproductor, no al lado. */
  readonly estrecha = input(false);

  /** Todo lo publicado, de todos los productos. */
  private readonly publicados = signal<Tutorial[]>([]);
  readonly cargando = signal(true);

  /**
   * POR PRODUCTO
   * ------------
   * Quien compró Informes no tiene por qué cruzarse con los videos de la tesis.
   * Cada video dice a qué productos sirve —puede ser a varios— y el que no dice
   * ninguno sale en todos, como el de conectar Claude.
   *
   * CON SESIÓN Y ALGO COMPRADO, SOLO LO SUYO: los videos de otros productos ni
   * aparecen ni tienen pestaña. El visitante, quien aún no compró y el
   * administrador lo ven todo, repartido en pestañas. No es un candado —la
   * lista es pública y los videos están en YouTube—, es orden.
   *
   * Hay pestañas solo con dos productos o más, y siempre una marcada: no existe
   * «Todos», que era la mezcla.
   */
  private readonly mios = signal<string[] | null>(null);
  private readonly pedido = signal<string | null>(null);

  /** Lo que le toca: todo, o solo lo de lo que compró más lo que es de todos. */
  private readonly visibles = computed(() => loQueLeToca(this.publicados(), this.mios()));

  /** Los productos con algún video propio entre los que le tocan. */
  readonly pestanas = computed(() => {
    const mios = this.mios();
    return pestanasDeProducto(this.visibles()).filter((p) => !mios || mios.includes(p.codigo));
  });

  readonly producto = computed(() => pestanaElegida(this.pestanas(), this.pedido()));

  /** Los nombres de lo que compró, para decirle de qué son los videos. Vacío si ve todo. */
  readonly deLoTuyo = computed(() => (this.mios() ?? []).map(nombreDeProducto).join(' · '));

  /** Lo que se ve: lo de la pestaña elegida más lo que es de todos. */
  readonly tutoriales = computed(() => {
    const producto = this.producto();
    const lista = this.visibles();
    return producto ? lista.filter((t) => saleEn(t.productos, producto)) : lista;
  });

  /** El video que está en la pantalla, por su posición en la lista. */
  readonly actual = signal(0);

  /** Si ya se pulsó play. Hasta entonces no hay iframe, solo la miniatura. */
  readonly reproduciendo = signal(false);

  readonly seleccionado = computed(() => this.tutoriales()[this.actual()] ?? null);

  /**
   * Los videos seguidos con el mismo grupo, juntos.
   *
   * Seguidos y no todos los del mismo nombre: el orden manda. Si alguien pone
   * «Para empezar» en el 1 y en el 9, salen dos bloques, que es lo que ve en el
   * panel, en vez de un 9 que salta a la cabeza de la lista sin que nadie lo
   * haya movido.
   */
  readonly grupos = computed<Grupo[]>(() => {
    const grupos: Grupo[] = [];
    this.tutoriales().forEach((tutorial, indice) => {
      const ultimo = grupos.at(-1);
      if (ultimo && ultimo.nombre === tutorial.grupo) {
        ultimo.videos.push({ tutorial, indice });
      } else {
        grupos.push({ nombre: tutorial.grupo, videos: [{ tutorial, indice }] });
      }
    });
    return grupos;
  });

  /**
   * LA LISTA DE LA MEDIA PANTALLA
   * -----------------------------
   * Por bloques, cada uno con su rótulo y cuánto dura. Los bloques son los
   * grupos que se ponen en /admin → Tutoriales. Mientras ningún video tenga
   * grupo, se deducen del título: los «Skill 4: …» van juntos en «Una skill
   * por capítulo», lo de antes es «Empieza aquí» y lo de después, «Además».
   *
   * Todos van en fichas a dos columnas, con un número delante. En un bloque
   * en el que todos son «Skill N» el número es el de la Skill y el nombre va
   * sin el «Skill 4:», que ahí ya lo dice el rótulo; en los demás, el número
   * es el orden dentro del bloque.
   */
  readonly bloques = computed<Bloque[]>(() => {
    const videos = this.tutoriales();
    const sinGrupos = videos.every((t) => !t.grupo);
    let vistaUnaSkill = false;

    const bloques: Bloque[] = [];
    videos.forEach((tutorial, indice) => {
      const corto = this.nombreCorto(tutorial);
      const esSkill = corto.numero !== null;
      if (esSkill) vistaUnaSkill = true;

      const nombre = !sinGrupos
        ? tutorial.grupo || 'Videos'
        : esSkill
          ? 'Una skill por capítulo'
          : vistaUnaSkill
            ? 'Además'
            : 'Empieza aquí';

      let bloque = bloques.at(-1);
      if (!bloque || bloque.nombre !== nombre) {
        bloque = { nombre, resumen: '', enRejilla: true, videos: [] };
        bloques.push(bloque);
      }
      if (!esSkill) bloque.enRejilla = false;
      bloque.videos.push({
        tutorial,
        indice,
        numero: corto.numero ?? this.etiqueta(tutorial, indice),
        titulo: corto.titulo,
      });
    });

    for (const bloque of bloques) {
      // En filas, los minutos del bloque; en fichas, o si alguna duración no
      // se entiende, cuántos videos son.
      const segundos = bloque.videos.map((v) => this.segundos(v.tutorial.duracion));
      const total = segundos.reduce<number>((suma, s) => suma + (s ?? 0), 0);
      const sonSkills = bloque.enRejilla;
      bloque.resumen =
        !sonSkills && segundos.every((s) => s !== null)
          ? `${Math.round(total / 60)} min`
          : `${bloque.videos.length} videos`;

      // Todos los bloques van en fichas (11-oct, más tarde el mismo día). En
      // los que no son de Skills el número es el orden dentro del bloque: 1,
      // 2, 3, que es el orden en que se ven.
      if (!sonSkills) {
        bloque.videos.forEach((video, i) => (video.numero = String(i + 1)));
        bloque.enRejilla = true;
      }
    }
    return bloques;
  });

  /**
   * El título sin el «Skill 4:» de delante, y ese número aparte.
   *
   * Solo para la media pantalla, donde el rótulo del bloque ya dice que son
   * Skills. `numero` es null cuando el título no empieza así.
   */
  nombreCorto(tutorial: Tutorial): { numero: string | null; titulo: string } {
    const hallado = /^Skill\s*(\d+)\s*[:.·–-]?\s*(.+)$/i.exec(tutorial.titulo.trim());
    if (!hallado) return { numero: null, titulo: tutorial.titulo };
    const resto = hallado[2].trim();
    return { numero: hallado[1], titulo: resto.charAt(0).toUpperCase() + resto.slice(1) };
  }

  /**
   * La duración, escrita siempre igual: «8:59».
   *
   * En el panel cada uno la escribe a su manera —«8:59 min», «17.02»,
   * «5.09 min»— y en una columna estrecha, una debajo de otra, se nota.
   */
  corta(duracion: string): string {
    const hallado = /(\d+)\s*[:.]\s*(\d{2})/.exec(duracion ?? '');
    return hallado ? `${hallado[1]}:${hallado[2]}` : (duracion ?? '');
  }

  /** Esa duración en segundos, o null si no se entiende. */
  private segundos(duracion: string): number | null {
    const hallado = /(\d+)\s*[:.]\s*(\d{2})/.exec(duracion ?? '');
    return hallado ? Number(hallado[1]) * 60 + Number(hallado[2]) : null;
  }

  /**
   * La URL del iframe, calculada una vez por video.
   *
   * En un `computed` y no en un método llamado desde la plantilla: cada
   * `bypassSecurityTrust…` devuelve un objeto nuevo, y un objeto nuevo en
   * `[src]` es un iframe que se recarga en cada ciclo de detección de cambios.
   */
  readonly embedActual = computed<SafeResourceUrl | null>(() => {
    const id = this.identificador(this.seleccionado()?.videoUrl ?? '');
    if (!id) return null;

    // Angular bloquea cualquier `src` de iframe sin marcar. Aquí la URL se
    // construye con un identificador ya validado, no con lo que venga. Con
    // autoplay porque solo se pinta después de pulsar play: pedir dos clics
    // para ver un video es uno de más. Por youtube-nocookie, como promete la
    // política de privacidad.
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
    );
  });

  /** La miniatura de YouTube del video en pantalla, o null si no está grabado. */
  readonly miniaturaActual = computed(() => {
    const id = this.identificador(this.seleccionado()?.videoUrl ?? '');
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
  });

  ngOnInit(): void {
    // Las dos cosas a la vez, y se pinta cuando están ambas: si llegara antes
    // la lista, el comprador vería un instante los videos de todos.
    forkJoin({
      lista: this.api.publicos(),
      mios: this.auth.isAuthenticated() ? this.api.misProductos() : of(null),
    }).subscribe({
      next: ({ lista, mios }) => {
        this.mios.set(mios);
        this.publicados.set(lista);
        // El producto de la dirección; si no es de los suyos, `producto` lo ignora.
        if (this.enDireccion()) {
          this.pedido.set(this.ruta.snapshot.queryParamMap.get('producto'));
        }
        this.cargando.set(false);
      },
      // Sin lista no se enseña un error: en `/tutoriales` los tropiezos
      // escritos de más abajo siguen sirviendo.
      error: () => this.cargando.set(false),
    });
  }

  /** Cambia de producto y vuelve al primer video de esa lista. */
  elegirProducto(codigo: string): void {
    if (!this.pestanas().some((p) => p.codigo === codigo)) return;
    this.pedido.set(codigo);
    this.actual.set(0);
    this.reproduciendo.set(false);
    if (!this.enDireccion()) return;

    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { producto: codigo },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Lo que va en el círculo: la etiqueta si la tiene («S4»), si no su número. */
  etiqueta(tutorial: Tutorial, indice: number): string {
    return tutorial.etiqueta || String(indice + 1);
  }

  /** Si ese enlace se puede reproducir. Decide si se pinta el play o el aviso. */
  reproducible(enlace: string): boolean {
    return this.identificador(enlace) !== null;
  }

  elegir(indice: number): void {
    if (indice < 0 || indice >= this.tutoriales().length) return;
    this.actual.set(indice);
    this.reproduciendo.set(false);

    // En pantalla estrecha la lista queda DEBAJO del reproductor y lejos:
    // quien toca el último video cambia algo que ya no ve y cree que no pasó
    // nada, así que se sube hasta la pantalla. En escritorio no: ni en
    // `/tutoriales` (el reproductor va al lado, fijo) ni en la pantalla
    // partida del perfil, donde el video ya está a la vista y subir la página
    // movía también «Por dónde vas», que está al lado.
    const estrecho = this.estrecha() ? '(max-width: 1000px)' : '(max-width: 1100px)';
    if (window.matchMedia(estrecho).matches) {
      this.reproductor()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  reproducir(): void {
    if (this.embedActual()) this.reproduciendo.set(true);
  }

  /**
   * El identificador del video, o null si el enlace no lleva ninguno.
   *
   * El null importa. Antes esto daba por hecho que lo que no encajara con
   * ningún patrón YA era un identificador suelto, y así una URL de Studio de
   * 165 caracteres —la de la barra del navegador, que es la que uno copia sin
   * darse cuenta— pasó por identificador y produjo un reproductor en negro con
   * un error de YouTube que no explicaba nada.
   */
  private identificador(enlace: string): string | null {
    const texto = (enlace ?? '').trim();
    if (/^[\w-]{11}$/.test(texto)) return texto;

    const encontrado = /(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/.exec(texto);
    return encontrado ? encontrado[1] : null;
  }
}
