/**
 * Los países a los que se puede asignar un administrador de país, con el código
 * ISO de dos letras que guarda el servidor. Perú no está: es la casa, y lo suyo
 * va sin etiqueta.
 */
export const PAISES: { codigo: string; nombre: string }[] = [
  { codigo: 'AR', nombre: 'Argentina' },
  { codigo: 'BO', nombre: 'Bolivia' },
  { codigo: 'CL', nombre: 'Chile' },
  { codigo: 'CO', nombre: 'Colombia' },
  { codigo: 'CR', nombre: 'Costa Rica' },
  { codigo: 'EC', nombre: 'Ecuador' },
  { codigo: 'SV', nombre: 'El Salvador' },
  { codigo: 'ES', nombre: 'España' },
  { codigo: 'GT', nombre: 'Guatemala' },
  { codigo: 'HN', nombre: 'Honduras' },
  { codigo: 'MX', nombre: 'México' },
  { codigo: 'NI', nombre: 'Nicaragua' },
  { codigo: 'PA', nombre: 'Panamá' },
  { codigo: 'PY', nombre: 'Paraguay' },
  { codigo: 'DO', nombre: 'República Dominicana' },
  { codigo: 'UY', nombre: 'Uruguay' },
  { codigo: 'VE', nombre: 'Venezuela' },
];

/** El nombre de un país por su código; el propio código si no está en la lista. */
export function nombreDePais(codigo: string | null | undefined): string {
  if (!codigo) return '';
  return PAISES.find((pais) => pais.codigo === codigo)?.nombre ?? codigo;
}
