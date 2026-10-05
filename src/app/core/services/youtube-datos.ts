/**
 * Título y duración de un video de YouTube, sin clave de API.
 *
 * Por qué así: YouTube no deja leer la duración desde nuestro servidor (al VPS
 * le pide iniciar sesión) y la API de datos pide una clave que no tenemos. El
 * reproductor incrustado sí la sabe: se carga uno invisible con `enablejsapi`,
 * se le pide que hable, y él manda por `postMessage` la duración y el título.
 * Va por youtube-nocookie, que es lo que ya permite la CSP (`frame-src`).
 *
 * Nunca rompe nada: si en unos segundos no contesta, devuelve lo que tenga
 * (o null) y el formulario se rellena a mano como siempre.
 */

const ORIGEN_YOUTUBE = 'https://www.youtube-nocookie.com';
const ESPERA_MS = 12_000;

export interface DatosDeVideo {
  titulo: string | null;
  /** Duración en segundos; null si el reproductor no la dio. */
  segundos: number | null;
}

/** El identificador de 11 caracteres, venga como venga el enlace. */
export function idDeYouTube(enlace: string): string | null {
  const texto = enlace.trim();
  if (/^[\w-]{11}$/.test(texto)) return texto;
  return /(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/.exec(texto)?.[1] ?? null;
}

/** 833 → «13:52»; 3725 → «1:02:05». Como lo enseña el propio YouTube. */
export function duracionLegible(segundos: number): string {
  const total = Math.round(segundos);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function leerDatosDeYouTube(id: string): Promise<DatosDeVideo | null> {
  return new Promise((resolver) => {
    let titulo: string | null = null;
    let segundos: number | null = null;
    let terminado = false;

    const marco = document.createElement('iframe');
    const origen = encodeURIComponent(location.origin);
    marco.src = `${ORIGEN_YOUTUBE}/embed/${id}?enablejsapi=1&mute=1&origin=${origen}`;
    marco.setAttribute('aria-hidden', 'true');
    marco.tabIndex = -1;
    // Fuera de la pantalla y no `display: none`: oculto del todo, el
    // reproductor no llega a cargar el video y no sabe cuánto dura.
    marco.style.cssText =
      'position:fixed;left:-10000px;top:0;width:320px;height:180px;border:0;opacity:0;pointer-events:none';

    const terminar = () => {
      if (terminado) return;
      terminado = true;
      window.removeEventListener('message', escuchar);
      clearTimeout(reloj);
      clearInterval(llamada);
      marco.remove();
      resolver(titulo || segundos ? { titulo, segundos } : null);
    };

    const escuchar = (evento: MessageEvent) => {
      if (evento.origin !== ORIGEN_YOUTUBE || evento.source !== marco.contentWindow) return;
      let datos: { info?: { duration?: number; videoData?: { title?: string } } };
      try {
        datos = typeof evento.data === 'string' ? JSON.parse(evento.data) : evento.data;
      } catch {
        return;
      }
      const info = datos?.info;
      if (!info) return;
      if (typeof info.duration === 'number' && info.duration > 0) segundos = info.duration;
      const t = info.videoData?.title?.trim();
      if (t) titulo = t;
      if (titulo && segundos) terminar();
    };

    // El reproductor no habla hasta que se le pide; se le repite por si el
    // primer aviso llega antes de que esté listo.
    const pedir = () =>
      marco.contentWindow?.postMessage(
        JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
        ORIGEN_YOUTUBE,
      );
    const llamada = setInterval(pedir, 500);
    const reloj = setTimeout(terminar, ESPERA_MS);

    window.addEventListener('message', escuchar);
    marco.addEventListener('load', pedir);
    document.body.appendChild(marco);
  });
}
