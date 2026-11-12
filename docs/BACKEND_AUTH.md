# Autenticación Corporativa con Google en `pavabim-backend`

El módulo de autenticación ya está implementado en `pavabim-backend` (`AuthModule` en `/api/auth/*`) y documentado en `PAVABIM_BACKEND_APIS.md` (sección **0. Autenticación Corporativa Google**).

## Flujo activo (OAuth2 Redirect + `authCode` de un solo uso)

1. **`GET /api/auth/google/url`** (público): devuelve `{ url }` para redirigir al usuario en la misma pestaña hacia Google (`accounts.google.com`).
2. **`GET /api/auth/google/callback`** (público): valida el `id_token` de Google y el dominio corporativo autorizado, inicia sesión en Firebase Identity Toolkit (`accounts:signInWithIdp`), genera un código temporal de un solo uso (`authCode`) y redirige (`302`) a:
   - `${FRONTEND_URL}/?authCode=<authCode>` en caso de éxito.
   - `${FRONTEND_URL}/?authError=<mensaje>` en caso de error.
3. **`POST /api/auth/google/exchange`** (público): recibe `{ "code": "<authCode>" }`, lo invalida tras el primer uso y devuelve `{ accessToken, refreshToken, expiresIn, user }`.
4. **`POST /api/auth/refresh`** (público): renueva `accessToken` mediante `{ refreshToken }`.
5. **`GET /api/auth/me`** y **`POST /api/auth/logout`** (`FirebaseAuthGuard`): obtienen el perfil actual (con `isSuperAdmin`) y revocan refresh tokens respectivamente.
