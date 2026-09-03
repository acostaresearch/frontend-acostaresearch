# Acosta Research · Frontend

Angular 22 (standalone + signals). Consume la API de [`../backend`](../backend/README.md)
y replica su modelo de sesión: access token en memoria y refresh en cookie `httpOnly`.

## Estructura

```
src/
├── environments/            apiUrl por entorno (fileReplacements en angular.json)
└── app/
    ├── app.config.ts        HttpClient + interceptor, router y restauración de sesión
    ├── app.routes.ts        Rutas raíz con carga diferida
    ├── core/                Todo lo transversal, sin componentes
    │   ├── models/          Espejo del contrato del backend (ApiResponse, User, ErrorCode)
    │   ├── http/            Normalización de errores de la API
    │   ├── services/        AuthService (estado de sesión), UserService
    │   ├── interceptors/    Bearer + cookie + refresh transparente
    │   └── guards/          authGuard, guestGuard, roleGuard
    ├── shared/              Utilidades reutilizables (validadores)
    └── features/
        ├── auth/            login, registro, confirmación de correo
        └── dashboard/       Página protegida de ejemplo
```

## Puesta en marcha

```bash
npm install
npm start           # http://localhost:4200
```

Necesita la API levantada en `http://localhost:3000` (ver el README del backend).
La URL vive en `src/environments/environment.development.ts`; en producción se
usa `/api/v1`, asumiendo que un proxy sirve API y SPA bajo el mismo dominio.

## Cómo se sostiene la sesión

1. **Login** → el backend devuelve `accessToken` en el cuerpo y deja el refresh
   en una cookie `httpOnly`. El access se guarda en una signal, **nunca en
   `localStorage`**: ahí sería robable por XSS.
2. **Al recargar la página** el token en memoria se pierde. `provideAppInitializer`
   llama a `/auth/refresh` antes de arrancar el router: la cookie viaja sola y
   devuelve un access nuevo. Por eso los guards pueden decidir de forma síncrona.
3. **Token caducado a mitad de uso** → el interceptor detecta el código
   `TOKEN_EXPIRED`, renueva y reintenta la petición original. Si varias peticiones
   fallan a la vez comparten un único refresh, porque el backend rota el token y
   dos rotaciones simultáneas se invalidarían entre sí.
4. **Si el refresh falla** se limpia la sesión y se va a `/auth/login?expirada=1`.

## Rutas

| Ruta                    | Acceso    | Pantalla                                  |
|-------------------------|-----------|-------------------------------------------|
| `/auth/login`           | anónimo   | Inicio de sesión y reenvío de confirmación |
| `/auth/registro`        | anónimo   | Alta de cuenta                             |
| `/auth/verificar-email` | público   | Introducir el código de 6 dígitos          |
| `/panel`                | con sesión| Perfil y listado de usuarios (solo ADMIN)  |

## Alta y verificación

El registro **no crea la cuenta todavía**: guarda los datos en el backend y redirige a
`/auth/verificar-email?email=…`, donde el usuario escribe el código de 6 dígitos que
recibió por correo. La cuenta nace al acertar ese código; hasta entonces el login
responde `INVALID_CREDENTIALS`, porque el usuario aún no existe.

Por eso `register` devuelve `{ email, emailSent }` y no un `User`: en ese momento
todavía no hay usuario que devolver.

Detalles de la pantalla del código:

- El campo filtra a dígitos y **se envía solo** al llegar a 6, que es lo que espera
  quien acaba de copiar el código del correo.
- `autocomplete="one-time-code"` deja que el móvil lo ofrezca desde el teclado.
- Reenviar tiene 60 s de espera, para no acumular códigos: emitir uno invalida el anterior.
- Con `TOO_MANY_ATTEMPTS` o `TOKEN_EXPIRED` el código queda quemado y la interfaz
  empuja a pedir otro en vez de dejar reintentar en vano.
- Si el registro devuelve `emailSent: false`, se llega con `?sinCorreo=1` y la pantalla
  avisa de que hay que pedir el código a mano; los datos del formulario no se pierden.

## Errores de formulario

`VALIDATION_ERROR` trae `details` con `field` y `message` por campo. `fieldErrors()`
los indexa por nombre de control para pintarlos bajo cada input, de modo que las
reglas del servidor mandan y las del cliente solo evitan un viaje de ida y vuelta.
