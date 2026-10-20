import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { Guia, GuiaService } from '../../core/services/guia.service';
import { Tutorial, TutorialService } from '../../core/services/tutorial.service';
import { loQueLeToca } from '../contenido/productos-de-ayuda';

/** Una guía como se pinta en la lista: su nombre, su peso y dónde se baja. */
interface GuiaEnLista {
  titulo: string;
  peso: string | null;
  enlace: string;
  /** A qué productos sirve. Vacía = a todos. */
  productos: string[];
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
 * Los videos y las guías son los mismos de /tutoriales y /guias-de-instalacion,
 * con el mismo filtro: con algo comprado, solo los de lo suyo más los de todos.
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

  /** Las guías solo con acceso vigente: ver `MiConector.tieneAccesoVigente`. */
  readonly conGuias = input(true);

  /** Pidió el recorrido del panel. Lo arranca quien sabe cómo: `MiConector`. */
  readonly recorrido = output<void>();

  readonly whatsappUrl = environment.whatsappUrl;
  readonly whatsappTexto = Videocurso.telefonoDe(environment.whatsappUrl);

  readonly cargando = signal(true);
  readonly videos = signal<Tutorial[]>([]);
  private readonly todasLasGuias = signal<GuiaEnLista[]>([]);

  /** Las cuatro primeras: el resto está en «Ver todas». */
  readonly guias = computed(() => this.todasLasGuias().slice(0, 4));

  private readonly vistos = signal<string[]>(Videocurso.leerVistos());

  /** El que se eligió en la lista de abajo. Null = el que le toca. */
  private readonly elegido = signal<string | null>(null);

  readonly reproduciendo = signal(false);

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

  /** Los tres que vienen después del de arriba, con su número en la lista. */
  readonly despues = computed(() =>
    this.videos()
      .map((video, i) => ({ video, numero: i + 1 }))
      .slice(this.indice() + 1, this.indice() + 4),
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
      this.videos.set(loQueLeToca(videos, mios));
      this.todasLasGuias.set(loQueLeToca(guias, mios));
      this.cargando.set(false);
    });
  }

  reproducir(): void {
    const video = this.actual();
    if (!video || !this.embed()) return;
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
    };
  }

  /** La de antes del panel, si el build la encontró. Ver `Guias.deSiempre`. */
  private guiaDeSiempre(): GuiaEnLista[] {
    return environment.guiaUrl
      ? [{ titulo: 'Guía de instalación', peso: null, enlace: environment.guiaUrl, productos: [] }]
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
