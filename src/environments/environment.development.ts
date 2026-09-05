/** Configuración de desarrollo. */
//
// ARCHIVO GENERADO por scripts/generar-environment.js. No lo edites a mano:
// se reescribe en cada build. Los valores se cambian en .env o en el panel
// de Netlify.

export const environment = {
  production: false,
  apiUrl: "http://localhost:3000/api/v1",
  /** Enlace de contacto para el pago manual por Yape. */
  whatsappUrl: "https://wa.me/51923095940",
  /** Perfiles públicos, en un solo sitio para no buscarlos por las plantillas. */
  redes: {
    whatsapp: "https://wa.me/51923095940",
    tiktok: "https://www.tiktok.com/@benicio.acosta.re",
    youtube: "https://www.youtube.com/@costaIAResearch",
    instagram: "https://www.instagram.com/acostaresearch/",
    facebook: "https://www.facebook.com/bridgeacademicexperts/?locale=es_LA",
    scholar: "https://scholar.google.com/citations?hl=es&user=F3r4v0gAAAAJ",
    ctivitae: "https://ctivitae.concytec.gob.pe/appDirectorioCTI/VerDatosInvestigador.do?id_investigador=0316353",
  },
  /** Client ID de Google. Vacío = no se muestra el botón de «Continuar con Google». */
  googleClientId: "608487070231-s1jres413fgs0i016vfm63c0vvfja580.apps.googleusercontent.com",
  /** Client ID de PayPal. Vacío = no se muestra el botón y la venta sigue siendo manual. */
  paypalClientId: "Aeq9Vzr93h2Hy5WOmGWSvJQcPH8HSeMUcr1bNXAjgUESHVb_GWr_3KSOcZNRYu3uVPimq2CiT3fDWfGS",
};
