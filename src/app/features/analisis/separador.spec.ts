import { decimalDe, formatoDe, ordenDeLectura, separadorDe } from './analisis';

/**
 * Cómo está escrito el CSV que sube el tesista.
 *
 * POR QUÉ ESTAS PRUEBAS EXISTEN
 * -----------------------------
 * Porque los dos fallos que cubren NO dan error. Leer con el separador
 * equivocado devuelve una matriz de UNA columna llamada `id.sexo.edad`, y
 * leer con el decimal equivocado mete los números como TEXTO: la pantalla se
 * ve bien, y `mean()` se niega tres pasos más tarde, en mitad de una prueba,
 * donde ya no se parece a su causa.
 *
 * Y no son casos raros: son lo que sale de Excel, que es por donde entra un
 * tesista. Windows en español separa con punto y coma; Windows en Perú escribe
 * los decimales con punto. Las dos cosas a la vez, y hay que acertar las dos.
 */
const bytesDe = (texto: string): Uint8Array => new TextEncoder().encode(texto);

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
});

describe('decimalDe', () => {
  it('con punto y coma y comas entre cifras, el decimal es la coma', () => {
    expect(decimalDe(['1;"F";3,25', '2;"M";2,5'], ';')).toBe(',');
  });

  it('con punto y coma pero puntos, el decimal es el punto', () => {
    // El caso de Perú: Windows en español separa con punto y coma, pero
    // escribe «3.25». Darlo por hecho al revés fue el fallo.
    expect(decimalDe(['1;"F";3.25', '2;"M";2.5'], ';')).toBe('.');
  });

  it('si las columnas se separan por comas, el decimal solo puede ser el punto', () => {
    // Con las dos cosas a la vez el archivo sería imposible de leer, y nadie lo
    // escribe así.
    expect(decimalDe(['1,"F",3.25'], ',')).toBe('.');
  });

  it('una matriz de enteros, sin ningún decimal, se lee con el punto', () => {
    expect(decimalDe(['1;"F";3', '2;"M";4'], ';')).toBe('.');
  });
});

describe('ordenDeLectura', () => {
  it('el caso normal se queda en el read.csv de toda la vida', () => {
    // Que el guion no se llene de parámetros cuando no hacen falta: esta línea
    // la lee alguien que no programa.
    expect(ordenDeLectura(',', '.')).toBe('read.csv("datos.csv")');
  });

  it('lo demás se le dice a R en voz alta', () => {
    expect(ordenDeLectura(';', ',')).toBe('read.csv("datos.csv", sep = ";", dec = ",")');
    expect(ordenDeLectura(';', '.')).toBe('read.csv("datos.csv", sep = ";", dec = ".")');
  });
});

describe('formatoDe', () => {
  it('un CSV de R: comas, puntos y nada que saltar', () => {
    expect(formatoDe(bytesDe('id,sexo,puntaje\n1,F,3.25\n'))).toEqual({
      separador: ',',
      decimal: '.',
      saltar: 0,
    });
  });

  it('un CSV de Excel en Perú: punto y coma, decimales con punto', () => {
    expect(formatoDe(bytesDe('id;sexo;puntaje\n1;F;3.25\n'))).toEqual({
      separador: ';',
      decimal: '.',
      saltar: 0,
    });
  });

  it('un CSV de Excel en España: punto y coma, decimales con coma', () => {
    expect(formatoDe(bytesDe('id;sexo;puntaje\n1;F;3,25\n'))).toEqual({
      separador: ';',
      decimal: ',',
      saltar: 0,
    });
  });

  it('la línea «sep=;» manda, y se salta', () => {
    // Es la que escribimos nosotros al exportar, porque Excel la obedece
    // aunque su configuración diga otra cosa. R no la entiende: se la tragaría
    // como primera fila y dejaría la matriz de una columna.
    const formato = formatoDe(bytesDe('sep=;\nid;sexo;puntaje\n1;F;3.25\n'));

    expect(formato.separador).toBe(';');
    expect(formato.decimal).toBe('.');
    expect(formato.saltar).toBe(6); // «sep=;» y su salto de línea
  });

  it('el salto se mide en bytes, no en letras', () => {
    // Si se contaran letras, una ñ o una tilde en la cabecera correría el corte
    // y R recibiría un archivo partido por la mitad de un carácter.
    const texto = 'sep=;\n"Año";"Sección"\n1;2\n';
    const formato = formatoDe(bytesDe(texto));
    const resto = new TextDecoder('utf-8').decode(bytesDe(texto).subarray(formato.saltar));

    expect(resto.split('\n')[0]).toBe('"Año";"Sección"');
  });

  it('los finales de línea de Windows no se cuelan en la pista', () => {
    const formato = formatoDe(bytesDe('sep=;\r\nid;sexo\r\n1;F\r\n'));

    expect(formato.separador).toBe(';');
    expect(formato.saltar).toBe(7); // «sep=;» y su \r\n
  });
});
