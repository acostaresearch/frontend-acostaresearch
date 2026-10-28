import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import { rutaDelPerfil } from '../../core/router/rutas-privadas';
import { AuthService } from '../../core/services/auth.service';
import { Tutorial, TutorialService } from '../../core/services/tutorial.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/** Una IA con la que funciona el conector, y lo que hay que hacer en ella. */
interface Asistente {
  codigo: 'claude' | 'chatgpt' | 'grok' | 'gemini';
  nombre: string;
  /** Dónde se hace, una sola vez. Vacío en Gemini: no se puede. */
  sitio: string;
  /** Con esta palabra en el título se reconoce su video en Tutoriales. */
  palabra: string;
  pasos: string[];
  /** Lo que más se equivoca, en una línea. */
  ojo: string;
  pdf: string;
}

/**
 * Los pasos salen de las guías en PDF (documentacion/guias-de-uso y
 * guia-instalacion, 20 y 28-oct). Si Claude, ChatGPT o Grok cambian sus menús,
 * se cambian aquí y en la guía a la vez.
 */
const ASISTENTES: readonly Asistente[] = [
  {
    codigo: 'claude',
    nombre: 'Claude',
    sitio: 'claude.ai',
    palabra: 'claude',
    pasos: [
      'En claude.ai, pulsa «Personalización» en la barra de la izquierda (o tu nombre → Configuración).',
      'Pestaña «Conectores» → botón «Agregar» → «Agregar conector personalizado».',
      'Nombre: Método de tesis. En «URL del servidor MCP» pega tu URL y pulsa «Continuar».',
      'Deja «Sin inicio de sesión» como viene y pulsa «Agregar».',
      'Pulsa «Conectar». Debe aparecer «Desconectar» y la lista de herramientas.',
    ],
    ojo: 'El botón que más se olvida es el último: «Conectar».',
    pdf: '/guias/guia-instalacion.pdf',
  },
  {
    codigo: 'chatgpt',
    nombre: 'ChatGPT',
    sitio: 'chatgpt.com',
    palabra: 'chatgpt',
    pasos: [
      'En chatgpt.com, abre «Complementos» y pulsa «Agregar».',
      'Elige «Agregar servidor MCP personalizado».',
      'Nombre: Método Acosta. En «URL del servidor» pega tu URL.',
      'En «Autenticación» cambia OAuth por «Sin autenticación», marca «Entiendo y quiero continuar» y pulsa «Crear como complemento».',
      'En cada chat nuevo pulsa «+» y elige «Método Acosta».',
    ],
    ojo: 'Si dejas OAuth no conecta: tiene que decir «Sin autenticación».',
    pdf: '/guias/guia-conectar-chatgpt.pdf',
  },
  {
    codigo: 'grok',
    nombre: 'Grok',
    sitio: 'grok.com',
    palabra: 'grok',
    pasos: [
      'En grok.com, abre «Complementos» (abajo a la izquierda).',
      'Pulsa «Nuevo conector» y luego «Personalizado».',
      'Nombre: Método Acosta. Pega tu URL y pulsa «Agregar conector».',
      'En el chat, pulsa «+» → «Conectores» y comprueba que esté encendido en azul.',
    ],
    ojo: 'Si el conector no sale encendido en el chat, Grok contesta por su cuenta sin usar el método.',
    pdf: '/guias/guia-conectar-grok.pdf',
  },
  {
    codigo: 'gemini',
    nombre: 'Gemini',
    sitio: '',
    palabra: 'gemini',
    pasos: [],
    ojo: '',
    pdf: '',
  },
];

/** La primera frase para comprobar que el conector responde. */
const PRIMERA_FRASE =
  'Usa el conector de Acosta Research: llama a «continuar» y dime por dónde empiezo mi tesis.';

/**
 * «Conecta tu método» (28-oct): una página por IA con los pasos, el video y la
 * guía en PDF. La enlazan el correo del código y el panel, para que nadie
 * tenga que preguntar por WhatsApp cómo se pone en ChatGPT.
 *
 * El video sale solo: el primero publicado del apartado «Instalación» cuyo
 * título nombra a esa IA. Mientras no haya, la página manda al PDF. Pública,
 * como las guías: la abre quien acaba de comprar y aún no entró.
 */
@Component({
  selector: 'app-conectar',
  imports: [RouterLink, SiteHeader, SiteFooter],
  templateUrl: './conectar.html',
  styleUrl: './conectar.css',
})
export class Conectar implements OnInit {
  private readonly ruta = inject(ActivatedRoute);
  private readonly tutoriales = inject(TutorialService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly auth = inject(AuthService);

  readonly asistentes = ASISTENTES;
  readonly primeraFrase = PRIMERA_FRASE;
  readonly whatsappUrl = environment.whatsappUrl;
  readonly conSesion = this.auth.isAuthenticated();
  readonly panel = rutaDelPerfil('avance');

  private readonly codigo = toSignal(this.ruta.paramMap.pipe(map((p) => p.get('ia') ?? 'claude')), {
    initialValue: 'claude',
  });

  /** La elegida; una que no existe vuelve a Claude. */
  readonly actual = computed(
    () => ASISTENTES.find((a) => a.codigo === this.codigo()) ?? ASISTENTES[0],
  );

  private readonly videos = signal<Tutorial[]>([]);
  readonly copiada = signal(false);

  readonly video = computed(() => {
    const palabra = this.actual().palabra;
    return (
      this.videos().find(
        (v) => v.apartado === 'instalacion' && v.videoUrl && v.titulo.toLowerCase().includes(palabra),
      ) ?? null
    );
  });

  readonly embed = computed<SafeResourceUrl | null>(() => {
    const id = Conectar.identificador(this.video()?.videoUrl ?? '');
    return id
      ? this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube-nocookie.com/embed/${id}?rel=0`)
      : null;
  });

  ngOnInit(): void {
    this.tutoriales
      .publicos()
      .pipe(catchError(() => of([] as Tutorial[])))
      .subscribe((lista) => this.videos.set(lista));
  }

  copiarFrase(): void {
    navigator.clipboard?.writeText(PRIMERA_FRASE).then(
      () => this.copiada.set(true),
      () => this.copiada.set(false),
    );
  }

  /** El id de YouTube de un enlace, como en el video curso. */
  private static identificador(enlace: string): string | null {
    const texto = (enlace ?? '').trim();
    if (/^[\w-]{11}$/.test(texto)) return texto;
    const encontrado = /(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/.exec(texto);
    return encontrado ? encontrado[1] : null;
  }
}
