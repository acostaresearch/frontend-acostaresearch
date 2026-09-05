export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api/v1',
  // Enlace de contacto para recargar el plan (pago manual por Yape).
  // Formato: https://wa.me/51999999999
  whatsappUrl: 'https://wa.me/51923095940',
  // Perfiles públicos. Viven aquí y no en la plantilla para que cambiar una
  // cuenta sea tocar un archivo, no buscar por todo el sitio.
  redes: {
    whatsapp: 'https://wa.me/51923095940',
    tiktok: 'https://www.tiktok.com/@benicio.acosta.re',
    youtube: 'https://www.youtube.com/@costaIAResearch',
    instagram: 'https://www.instagram.com/acostaresearch/',
    facebook: 'https://www.facebook.com/bridgeacademicexperts/?locale=es_LA',
    scholar: 'https://scholar.google.com/citations?hl=es&user=F3r4v0gAAAAJ',
    ctivitae:
      'https://ctivitae.concytec.gob.pe/appDirectorioCTI/VerDatosInvestigador.do?id_investigador=0316353',
  },
  // Client ID de la app OAuth de Google (console.cloud.google.com → Credenciales).
  // Es público por diseño: Google valida el origen desde el que se pide.
  // Vacío = no se muestra el botón y solo queda el acceso con contraseña.
  googleClientId: '608487070231-s1jres413fgs0i016vfm63c0vvfja580.apps.googleusercontent.com',
  // Client ID de la app de PayPal (developer.paypal.com → Apps & Credentials).
  // Es público por diseño: el secreto vive solo en el backend.
  // Vacío = no se muestra el botón y la recarga sigue siendo manual.
  paypalClientId: 'Aeq9Vzr93h2Hy5WOmGWSvJQcPH8HSeMUcr1bNXAjgUESHVb_GWr_3KSOcZNRYu3uVPimq2CiT3fDWfGS',
};
