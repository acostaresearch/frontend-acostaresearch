# La guía de instalación en PDF

Suelta aquí el archivo con **este nombre exacto**:

```
guia-instalacion.pdf
```

Nada más. En el siguiente build el enlace de descarga aparece solo en:

- la pantalla de compra confirmada, junto a la URL del conector;
- el apartado del conector en `/perfil`, para cuando el comprador vuelva.

Si el archivo no está, **no se muestra ningún botón**. Es a propósito: Netlify
responde con el `index.html` a cualquier ruta que no exista, así que un enlace a
un PDF ausente no daría un error honesto — le descargaría al comprador la
portada de la web con extensión `.pdf`. Y menos en la pantalla en la que acaba
de pagar.

Para comprobar si se detectó, mira la última línea de `npm run build`:

```
guía PDF      /guias/guia-instalacion.pdf
guía PDF      (no encontrada en public/guias/guia-instalacion.pdf)
```

## Si prefieres alojarlo fuera

Un Drive, un CDN, donde sea. Pon la dirección completa en `.env` (o en las
variables de Netlify) y gana sobre el archivo local:

```
GUIA_URL=https://drive.google.com/…
```

## Qué conviene que diga

El comprador llega aquí con la URL del conector recién copiada. Lo que necesita
es lo que la web ya le resume en tres pasos, pero con capturas:

1. Abrir Claude → Configuración → Conectores.
2. Añadir conector personalizado y pegar su URL.
3. Escribir «trabajemos mi tesis» y pedirle que use el conector.

Y lo que la web no cuenta y a ti te ahorra mensajes de WhatsApp: que funciona
con el plan gratuito de Claude, que la URL es personal y no se comparte, que el
acceso dura tres meses y se renueva, y qué hacer si Claude no ve el conector
(cerrar sesión y volver a entrar suele bastar).
