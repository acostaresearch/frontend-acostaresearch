import {
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { GRUPOS_DE_GUIA, GrupoDeGuia, Guia, GuiaService } from '../../core/services/guia.service';
import { Tutorial, TutorialService } from '../../core/services/tutorial.service';
import {
  loQueLeToca,
  pestanaElegida,
  pestanasDeProducto,
  saleEn,
} from '../contenido/productos-de-ayuda';
import { TROPIEZOS } from '../contenido/tutoriales';

/** Una guía como se pinta en la lista: su nombre, su peso y dónde se baja. */
interface GuiaEnLista {
  titulo: string;
  peso: string | null;
  enlace: string;
  /** A qué productos sirve. Vacía = a todos. */
  productos: string[];
  grupo: GrupoDeGuia;
}

/** Dónde se apuntan, en este navegador, los videos que ya se pusieron. */
const CLAVE_VISTOS = 'videocurso-vistos';

/**
 * La sección «Video curso paso a paso» del perfil (rehecha el 20-oct).
 *
 * Antes eran cuatro filas iguales —video, guía, recorrido y WhatsApp— y el
 * video, que es lo primero que hay que hacer, pesaba lo mismo que lo demás.
 * Ahora manda el video que le toca, con su reproductor; debajo, los tres que
 * vienen después y las guías en PDF; y al pie, las dos salidas para cuando algo
 * falla: las soluciones escritas y WhatsApp.
 *
 * «TU SIGUIENTE VIDEO» es el primero que no ha puesto en este navegador. Se
 * apunta en `localStorage` y no en el servidor: es una comodidad, no un
 * registro, y si el navegador no deja guardar se empieza por el primero.
 *
 * Los videos y las guías son los mismos de /guias-de-instalacion y del video
 * al lado, con el mismo filtro: con algo comprado, solo los de lo suyo más los
 * de todos.
 *
 * DESDE EL 20-OCT ES LA ÚNICA PÁGINA DE VIDEOS: /tutoriales se retiró y
 * redirige aquí. Por eso trae lo que tenía aquella: una pestaña por producto
 * (con dos o más; `?producto=tesis` elige una), la lista entera por bloques
 * («Ver los N videos») y los tropiezos por escrito («¿Algo no funciona?»).
 */
@Component({
  selector: 'app-videocurso',
  imports: [RouterLink],
  templateUrl: './videocurso.html',
  styleUrl: './videocurso.css',
})
export class Videocurso implements OnInit {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly tutoriales = inject(TutorialService);
  private readonly guiasApi = inject(GuiaService);
  private readonly auth = inject(AuthService);
  private readonly ruta = inject(ActivatedRoute);

  /** Las guías solo con acceso vigente: ver `MiConector.tieneAccesoVigente`. */
  readonly conGuias = input(true);

  /** Pidió el recorrido del panel. Lo arranca quien sabe cómo: `MiConector`. */
  readonly recorrido = output<void>();

  readonly whatsappUrl = environment.whatsappUrl;
  readonly whatsappTexto = Videocurso.telefonoDe(environment.whatsappUrl);

  readonly cargando = signal(true);
  /** Todo lo que le toca, de todos sus productos. */
  private readonly publicados = signal<Tutorial[]>([]);
  private readonly pedido = signal<string | null>(
    this.ruta.snapshot.queryParamMap.get('producto'),
  );

  /** Las pestañas, igual que en `SalaDeVideos`: solo con dos productos o más. */
  readonly pestanas = computed(() => pestanasDeProducto(this.publicados()));
  readonly producto = computed(() => pestanaElegida(this.pestanas(), this.pedido()));

  /** Los de la pestaña elegida más los que son de todos. */
  readonly videos = computed(() => {
    const producto = this.producto();
    const lista = this.publicados();
    return producto ? lista.filter((v) => saleEn(v.productos, producto)) : lista;
  });

  /**
   * La lista entera, por bloques: los videos seguidos con el mismo grupo van
   * juntos, como en `SalaDeVideos.grupos`.
   */
  readonly bloques = computed(() => {
    const bloques: { nombre: string; videos: { video: Tutorial; numero: number }[] }[] = [];
    this.videos().forEach((video, i) => {
      const ultimo = bloques.at(-1);
      if (ultimo && ultimo.nombre === video.grupo) ultimo.videos.push({ video, numero: i + 1 });
      else bloques.push({ nombre: video.grupo, videos: [{ video, numero: i + 1 }] });
    });
    return bloques;
  });

  private readonly pantalla = viewChild<ElementRef<HTMLElement>>('pantalla');
  private readonly todasLasGuias = signal<GuiaEnLista[]>([]);

  /**
   * Las guías del producto elegido arriba, igual que los videos: el producto
   * decide a quién le sale; el grupo, solo en qué bloque (pedido del 20-oct).
   */
  private readonly guiasDelProducto = computed(() => {
    const producto = this.producto();
    const lista = this.todasLasGuias();
    return producto ? lista.filter((g) => saleEn(g.productos, producto)) : lista;
  });

  /**
   * Por bloques (instalación, herramientas), cada uno en su columna y con
   * cuatro como mucho: el resto está en «Ver todas». Salen siempre los dos,
   * aunque uno esté vacío, para que se vea que existen.
   */
  readonly bloquesDeGuias = computed(() =>
    this.guiasDelProducto().length === 0
      ? []
      : GRUPOS_DE_GUIA.map((g) => ({
          ...g,
          guias: this.guiasDelProducto()
            .filter((guia) => guia.grupo === g.codigo)
            .slice(0, 4),
        })),
  );

  private readonly vistos = signal<string[]>(Videocurso.leerVistos());

  /** El que se eligió en la lista de abajo. Null = el que le toca. */
  private readonly elegido = signal<string | null>(null);

  readonly reproduciendo = signal(false);

  /**
   * «¿Algo no funciona?» se abre aquí mismo y no en /tutoriales#fallas: quien
   * tiene el problema no tiene por qué salir de su panel (pedido del 20-oct).
   * Son los mismos tropiezos de la página de tutoriales.
   */
  readonly tropiezos = TROPIEZOS;
  readonly verFallas = signal(false);
  private readonly fallas = viewChild<ElementRef<HTMLElement>>('fallas');

  /** La posición del video grande en la lista. */
  readonly indice = computed(() => {
    const lista = this.videos();
    const elegido = lista.findIndex((v) => v.id === this.elegido());
    if (elegido >= 0) return elegido;
    const pendiente = lista.findIndex((v) => !this.vistos().includes(v.id));
    return pendiente >= 0 ? pendiente : 0;
  });

  readonly actual = computed(() => this.videos()[this.indice()] ?? null);

  /** Si ya los puso todos: el rótulo deja de decir «siguiente». */
  readonly todosVistos = computed(
    () => this.videos().length > 0 && this.videos().every((v) => this.vistos().includes(v.id)),
  );

  /** Cuántos de esta lista ya se pusieron, para la cabecera de «Tus videos». */
  readonly cuantosVistos = computed(
    () => this.videos().filter((v) => this.vistos().includes(v.id)).length,
  );

  readonly miniatura = computed(() => {
    const id = Videocurso.identificador(this.actual()?.videoUrl ?? '');
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
  });

  /** En un `computed` por lo mismo que en `SalaDeVideos`: si no, el iframe se recarga. */
  readonly embed = computed<SafeResourceUrl | null>(() => {
    const id = Videocurso.identificador(this.actual()?.videoUrl ?? '');
    if (!id) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
    );
  });

  ngOnInit(): void {
    const guias = this.guiasApi.publicas().pipe(
      map((lista) => (lista.length > 0 ? lista.map((g) => this.guiaEnLista(g)) : this.guiaDeSiempre())),
      catchError(() => of(this.guiaDeSiempre())),
    );
    forkJoin({
      videos: this.tutoriales.publicos().pipe(catchError(() => of([] as Tutorial[]))),
      guias,
      mios: this.auth.isAuthenticated() ? this.tutoriales.misProductos() : of(null),
    }).subscribe(({ videos, guias, mios }) => {
      this.publicados.set(loQueLeToca(videos, mios));
      this.todasLasGuias.set(loQueLeToca(guias, mios));
      this.cargando.set(false);
    });
  }

  reproducir(): void {
    const video = this.actual();
    if (!video || !this.embed()) return;
    // Se fija el que suena: si no, al apuntarlo como visto «tu siguiente»
    // pasaría al próximo y el reproductor cambiaría de video a media función.
    this.elegido.set(video.id);
    this.reproduciendo.set(true);
    if (!this.vistos().includes(video.id)) {
      this.vistos.update((lista) => [...lista, video.id]);
      try {
        localStorage.setItem(CLAVE_VISTOS, JSON.stringify(this.vistos()));
      } catch {
        // Sin dónde guardar, la próxima vez vuelve a salir este. No pasa nada.
      }
    }
  }

  /** Las flechas del reproductor. Si estaba sonando, el nuevo arranca solo. */
  anterior(): void {
    this.pasarA(this.indice() - 1);
  }

  siguiente(): void {
    this.pasarA(this.indice() + 1);
  }

  private pasarA(posicion: number): void {
    const video = this.videos()[posicion];
    if (!video) return;
    const sonaba = this.reproduciendo();
    this.elegir(video);
    if (sonaba) this.reproducir();
  }

  /** Repite el que está en pantalla desde el principio: el iframe se vuelve a montar. */
  repetir(): void {
    this.reproduciendo.set(false);
    setTimeout(() => this.reproducir());
  }

  /** Olvida lo visto: «tu siguiente» vuelve a ser el primero. */
  empezarDeCero(): void {
    this.vistos.set([]);
    this.elegido.set(null);
    this.reproduciendo.set(false);
    try {
      localStorage.removeItem(CLAVE_VISTOS);
    } catch {
      // Sin dónde guardar, ya estaba en cero.
    }
  }

  /** Si ese video ya se puso en este navegador. Para la marca de la lista. */
  visto(video: Tutorial): boolean {
    return this.vistos().includes(video.id);
  }

  elegirProducto(codigo: string): void {
    this.pedido.set(codigo);
    this.elegido.set(null);
    this.reproduciendo.set(false);
  }

  /**
   * Desde «Tus videos»: lo pone en el reproductor. En escritorio la lista va
   * al lado y no se mueve nada; en el móvil va debajo y se sube hasta él.
   */
  verDesdeLaLista(video: Tutorial): void {
    this.elegir(video);
    this.pantalla()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  alternarFallas(): void {
    this.verFallas.update((v) => !v);
    if (this.verFallas()) {
      setTimeout(() =>
        this.fallas()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      );
    }
  }

  elegir(video: Tutorial): void {
    this.elegido.set(video.id);
    this.reproduciendo.set(false);
  }

  /** «8:59 min», escrito siempre igual aunque en el panel se escriba «8.59». */
  duracion(texto: string): string {
    const hallado = /(\d+)\s*[:.]\s*(\d{2})/.exec(texto ?? '');
    return hallado ? `${hallado[1]}:${hallado[2]} min` : (texto ?? '');
  }

  private guiaEnLista(guia: Guia): GuiaEnLista {
    return {
      titulo: guia.titulo,
      peso: Videocurso.peso(guia.bytes),
      enlace: this.guiasApi.enlace(guia),
      productos: guia.productos,
      grupo: guia.grupo,
    };
  }

  /** La de antes del panel, si el build la encontró. Ver `Guias.deSiempre`. */
  private guiaDeSiempre(): GuiaEnLista[] {
    return environment.guiaUrl
      ? [{ titulo: 'Guía de instalación', peso: null, enlace: environment.guiaUrl, productos: [], grupo: 'instalacion' }]
      : [];
  }

  private static leerVistos(): string[] {
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE_VISTOS) ?? '[]');
      return Array.isArray(guardado) ? guardado.filter((id) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  private static peso(bytes: number): string | null {
    if (!bytes) return null;
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  }

  /** Igual que en `SalaDeVideos`: null si el enlace no lleva un video. */
  private static identificador(enlace: string): string | null {
    const texto = (enlace ?? '').trim();
    if (/^[\w-]{11}$/.test(texto)) return texto;
    const encontrado = /(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/.exec(texto);
    return encontrado ? encontrado[1] : null;
  }

  /** Movido de `MiConector`: +51 923 095 940, sacado del mismo enlace al que se llama. */
  private static telefonoDe(url: string): string {
    const digitos = url.replace(/\D/g, '');
    if (digitos.length < 8) return '';
    const pais = digitos.slice(0, digitos.length - 9);
    const resto = digitos.slice(-9);
    return `+${pais} ${resto.slice(0, 3)} ${resto.slice(3, 6)} ${resto.slice(6)}`;
  }
}
