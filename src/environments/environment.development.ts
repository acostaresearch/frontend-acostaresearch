export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api/v1',
  // Enlace de contacto para recargar el plan (pago manual por Yape).
  // Formato: https://wa.me/51999999999
  whatsappUrl: '',
  // Client ID de la app de PayPal (developer.paypal.com → Apps & Credentials).
  // Es público por diseño: el secreto vive solo en el backend.
  // Vacío = no se muestra el botón y la recarga sigue siendo manual.
  paypalClientId: 'Aeq9Vzr93h2Hy5WOmGWSvJQcPH8HSeMUcr1bNXAjgUESHVb_GWr_3KSOcZNRYu3uVPimq2CiT3fDWfGS',
};
