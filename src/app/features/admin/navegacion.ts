/** Configuración de las secciones, direcciones y menú del administrador. */
export type Seccion =
  | 'resumen'
  | 'embudo'
  | 'instituciones'
  | 'accesos'
  | 'grupos'
  | 'descuentos'
  | 'pruebas'
  | 'licencias'
  | 'alertas'
  | 'reclamos'
  | 'resenas'
  | 'asesores'
  | 'pedidos'
  | 'whatsapp'
  | 'sorteos'
  | 'corpus'
  | 'tutoriales'
  | 'guias'
  | 'admins'
  | 'usuarios'
  | 'perfil';

/**
 * El nombre y el para qué de cada sección, tal y como salen en la cabecera.
 *
 * Vivían dentro de las tarjetas —repetidos en unas, ausentes en otras—, así que
 * la pantalla no decía qué era hasta que se leía la primera tabla. Aquí están
 * todos en una sola lista, que es donde se ve si uno desentona.
 */
export const PAGINAS: Record<Seccion, { titulo: string; nota: string }> = {
  resumen: {
    titulo: 'Resumen',
    nota: 'Cómo va el negocio: lo cobrado, lo que espera revisión y lo que está por vencer.',
  },
  embudo: {
    titulo: 'Avance de clientes',
    nota:
      'De ver los precios a cerrar la primera fase: dónde se queda la gente. Y lo que se hace ' +
      'para moverlo: los correos de avance que salen solos y los referidos.',
  },
  instituciones: {
    titulo: 'Universidades y asesores',
    nota:
      'Cupos del método vendidos a un grupo. Cada alumno se une con su cuenta por el enlace del ' +
      'grupo; el coordinador ve el avance de todos desde su perfil.',
  },
  accesos: {
    titulo: 'Accesos',
    nota: 'Lo que entra, lo que falta revisar y todo lo emitido o cobrado.',
  },
  descuentos: {
    titulo: 'Descuentos',
    nota: 'Códigos promocionales que rebajan el precio de un producto.',
  },
  pruebas: {
    titulo: 'Enlaces de prueba',
    nota:
      'Un enlace para un grupo: cada persona que lo abre recibe su propio conector, sin ' +
      'registrarse ni pagar, hasta agotar los cupos. Apagarlo corta todos sus conectores a la vez.',
  },
  grupos: {
    titulo: 'Productos',
    nota:
      'Un grupo es un producto: sus capítulos, su precio y cuánto dura. «Método de tesis» es ' +
      'uno; «humanizar texto» puede ser otro, con otros capítulos y otro precio. Cada licencia ' +
      'solo ve los capítulos de su grupo.',
  },
  licencias: {
    titulo: 'Licencias',
    nota: 'Quién tiene el conector encendido, con qué producto y cuánto lo está usando.',
  },
  alertas: {
    titulo: 'Alertas, reseñas y reclamos',
    nota:
      'Sospechas de uso compartido. A la primera alta se avisa al comprador por correo; solo si ' +
      'vuelve a saltar pasadas 12 horas se revoca sola. Aquí puedes adelantarte o descartarla.',
  },
  reclamos: {
    titulo: 'Alertas, reseñas y reclamos',
    nota:
      'Las hojas que llegan desde la web. Hay que responder cada una en 15 días hábiles: el plazo ' +
      'es improrrogable y no responder es sancionable.',
  },
  resenas: {
    titulo: 'Alertas, reseñas y reclamos',
    nota:
      'Lo que opinan los clientes del método, escrito desde su perfil. Ninguna se publica sola: ' +
      'aprobarla la deja leer en /resenas, y destacarla la sube además a la portada.',
  },
  pedidos: {
    titulo: 'Revisiones',
    nota:
      'Los capítulos que mandan los tesistas. Bájate el Word, asígnalo a un asesor aprobado y, ' +
      'cuando vuelva con sus observaciones, pega el enlace del documento y dale por entregado: ' +
      'el tesista lo ve al momento en su seguimiento. Durante el piloto no se cobra aquí.',
  },
  asesores: {
    titulo: 'Asesores',
    nota:
      'Quién se ofrece a revisar tesis. El enlace de la convocatoria se reparte a mano: mientras ' +
      'no la marques como pública, el formulario funciona pero no lo encuentra nadie. Ninguna ' +
      'ficha se publica sola: se aprueba aquí, después de comprobar el grado en SUNEDU.',
  },
  whatsapp: {
    titulo: 'WhatsApp',
    nota:
      'El bot que contesta las consultas del WhatsApp de atención con Gemini, los precios del ' +
      'panel y la ficha de la web. Aquí lees las conversaciones, tomas las que piden una ' +
      'persona, lo pruebas y le das indicaciones.',
  },
  sorteos: {
    titulo: 'Sorteos',
    nota:
      'Sortea una matrícula del método. Crea el sorteo, comparte su enlace para que cada persona ' +
      'se apunte con su correo (una vez, sin verificarlo) y, cuando quieras, gira la ruleta: el ' +
      'ganador recibe por correo su código de activación.',
  },
  corpus: {
    titulo: 'Bibliografía',
    nota: 'El corpus que citan las Skills. Se cura en Zotero; aquí solo se trae y se comprueba.',
  },
  tutoriales: {
    titulo: 'Tutoriales y guías',
    nota:
      'Los videos de acostaresearch.com/tutoriales y los PDF de ' +
      'acostaresearch.com/guias-de-instalacion. Se publican al instante, sin desplegar.',
  },
  guias: {
    titulo: 'Tutoriales y guías',
    nota:
      'Los videos de acostaresearch.com/tutoriales y los PDF de ' +
      'acostaresearch.com/guias-de-instalacion. Se publican al instante, sin desplegar.',
  },
  admins: {
    titulo: 'Usuarios',
    nota:
      'Da acceso al panel a otra persona. Solo se crean administradores: los usuarios normales ' +
      'se registran solos desde la web.',
  },
  usuarios: {
    titulo: 'Usuarios',
    nota: 'Todo el que tiene cuenta en la web. Esta lista solo la ve un administrador.',
  },
  perfil: {
    titulo: 'Mi perfil',
    nota: 'Tus datos, tu contraseña y tu propio conector.',
  },
};

/**
 * El nombre de cada sección en la dirección: /admin/<nombre>. Cambiar uno de
 * aquí rompe los enlaces guardados a esa sección (llevan al resumen).
 */
export const DIRECCIONES: Record<Seccion, string> = {
  resumen: 'resumen',
  embudo: 'avance-de-clientes',
  instituciones: 'universidades-y-asesores',
  accesos: 'accesos',
  descuentos: 'descuentos',
  pruebas: 'enlaces-de-prueba',
  grupos: 'productos',
  licencias: 'licencias',
  corpus: 'bibliografia',
  tutoriales: 'tutoriales',
  guias: 'guias',
  alertas: 'alertas',
  resenas: 'resenas',
  reclamos: 'reclamaciones',
  usuarios: 'usuarios',
  admins: 'administradores',
  perfil: 'perfil',
  pedidos: 'revisiones',
  asesores: 'asesores',
  whatsapp: 'whatsapp',
  sorteos: 'sorteos',
};

/** Al revés: de la dirección a la sección. */
export function seccionDe(direccion: string): Seccion | undefined {
  return (Object.keys(DIRECCIONES) as Seccion[]).find(
    (seccion) => DIRECCIONES[seccion] === direccion,
  );
}

/** Un destino de la barra lateral. */
interface EntradaDelMenu {
  seccion: Seccion;
  texto: string;
  /** Trazo SVG del icono, en una caja de 24×24. */
  icono: string;
  /** Las secciones que la encienden: las pestañas de una misma página. */
  enciende: Seccion[];
}

/**
 * La barra lateral, agrupada por lo que se viene a hacer. «Revisiones» y
 * «Asesores» no salen —el piloto está parado—, pero sus direcciones siguen
 * funcionando.
 */
export const MENU: { grupo: string | null; entradas: EntradaDelMenu[] }[] = [
  {
    grupo: null,
    entradas: [
      {
        seccion: 'resumen',
        texto: 'Resumen',
        icono: 'M3 10.5 12 3l9 7.5 M5 9.5V21h14V9.5',
        enciende: ['resumen'],
      },
      {
        seccion: 'embudo',
        texto: 'Avance de clientes',
        icono: 'M3 4h18l-7 8.5V19l-4 2v-8.5z',
        enciende: ['embudo'],
      },
    ],
  },
  {
    grupo: 'Ventas',
    entradas: [
      {
        seccion: 'accesos',
        texto: 'Accesos',
        icono: 'M3 6h18v12H3z M3 10h18',
        enciende: ['accesos'],
      },
      {
        seccion: 'instituciones',
        texto: 'Universidades y asesores',
        icono: 'M3 10 12 4l9 6 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 20h18',
        enciende: ['instituciones'],
      },
      {
        seccion: 'descuentos',
        texto: 'Descuentos',
        icono: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z M7.5 7.5h.01',
        enciende: ['descuentos'],
      },
      {
        seccion: 'pruebas',
        texto: 'Enlaces de prueba',
        icono:
          'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7 M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
        enciende: ['pruebas'],
      },
      {
        seccion: 'sorteos',
        texto: 'Sorteos',
        icono: 'M20 12v9H4v-9 M2 7h20v5H2z M12 21V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
        enciende: ['sorteos'],
      },
    ],
  },
  {
    grupo: 'Atención',
    entradas: [
      {
        seccion: 'whatsapp',
        texto: 'WhatsApp',
        icono: 'M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.5A8.4 8.4 0 1 1 21 11.5z M8.5 9.5h7 M8.5 13h4.5',
        enciende: ['whatsapp'],
      },
    ],
  },
  {
    grupo: 'Catálogo',
    entradas: [
      {
        seccion: 'grupos',
        texto: 'Productos',
        icono: 'M21 8 12 3 3 8v8l9 5 9-5z M3 8l9 5 9-5 M12 13v8',
        enciende: ['grupos'],
      },
      {
        seccion: 'licencias',
        texto: 'Licencias',
        icono: 'M14.5 9.5 21 3 M18 6l3 3 M9 21a5 5 0 1 1 0-10 5 5 0 0 1 0 10z M12.5 12.5 14.5 9.5',
        enciende: ['licencias'],
      },
    ],
  },
  {
    grupo: 'Contenido',
    entradas: [
      {
        seccion: 'corpus',
        texto: 'Bibliografía',
        icono: 'M5 4h13v16H5z M5 16h13 M9 4v12',
        enciende: ['corpus'],
      },
      {
        seccion: 'tutoriales',
        texto: 'Tutoriales y guías',
        icono: 'M8 5v14l11-7z',
        enciende: ['tutoriales', 'guias'],
      },
    ],
  },
  {
    grupo: 'Vigilancia',
    entradas: [
      {
        seccion: 'alertas',
        texto: 'Alertas, reseñas y reclamos',
        icono: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z',
        enciende: ['alertas', 'resenas', 'reclamos'],
      },
    ],
  },
  {
    grupo: 'Cuenta',
    entradas: [
      {
        seccion: 'usuarios',
        texto: 'Usuarios',
        icono:
          'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
        enciende: ['usuarios', 'admins'],
      },
    ],
  },
];

