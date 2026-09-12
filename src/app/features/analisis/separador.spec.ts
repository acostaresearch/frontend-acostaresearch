import { lectorPara, separadorDe } from './analisis';

/**
 * Con qué viene separado el CSV que sube el tesista.
 *
 * POR QUÉ ESTA PRUEBA EXISTE
 * --------------------------
 * Porque el fallo que arregla no se ve: `read.csv()` sobre un archivo de punto
 * y coma NO da error. Devuelve una matriz de UNA columna llamada
 * `id.sexo.edad`, con las 60 filas dentro, y el tesista sigue adelante y monta
 * su capítulo IV encima. La página parecía funcionar.
 *
 * Y no es un caso raro: es lo que hace el Excel en español al «Guardar como
 * CSV», que es exactamente por donde entra un tesista peruano.
 */
describe('separadorDe', () => {
  it('la coma, que es lo que escribe R y el Excel en inglés', () => {
    expect(separadorDe('id,"sexo","edad","ciclo","cd1"')).toBe(',');
  });

  it('el punto y coma, que es lo que escribe el Excel en español', () => {
    expect(separadorDe('id;"sexo";"edad";"ciclo";"cd1"')).toBe(';');
  });

  it('las comas de dentro de las comillas no cuentan', () => {
    // Una columna «Apellidos, nombre» tiene comas que no separan nada. Contadas
    // a lo bruto ganarían al punto y coma, y este archivo —el más enredado de
    // todos— se leería mal.
    expect(separadorDe('"Apellidos, nombre";"Sección, turno";edad')).toBe(';');
  });

  it('una sola columna, sin ningún separador, se lee como siempre', () => {
    expect(separadorDe('puntaje')).toBe(',');
  });

  it('un archivo vacío no rompe nada', () => {
    expect(separadorDe('')).toBe(',');
  });

  it('cada separador con su orden de R', () => {
    expect(lectorPara(',')).toBe('read.csv');
    expect(lectorPara(';')).toBe('read.csv2');
  });
});
