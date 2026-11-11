# Instrucciones para `pavabim-backend`: Módulo de Autenticación (`/api/auth/*`)

El frontend (`pavabim-frontend-web`) delega **toda la autenticación** en `pavabim-backend` (no utiliza el SDK cliente de Firebase ni requiere variables `VITE_FIREBASE_*` en el navegador).

La estrategia más limpia para mantener 100% compatibles todos los guards existentes (`FirebaseAuthGuard`, `ProjectRoleGuard`, `SuperAdminGuard` y `LocalModelsController`) es crear un módulo `AuthModule` (`/api/auth`) en `pavabim-backend` que intercambie credenciales o OAuth de Google mediante **Firebase Identity Toolkit REST API** usando la clave Web de Firebase en el backend (`FIREBASE_WEB_API_KEY`) y devuelva `idToken` + `refreshToken` reales de Firebase.

> De este modo `FirebaseAuthGuard` (`firebaseService.verifyIdToken(token)`) sigue funcionando exactamente igual en toda la API sin modificar ningún guard existente.

---

## 1. Contrato HTTP esperado por `pavabim-frontend-web`

### 1.1 `POST /api/auth/login` (público)
- **Body JSON**:
  ```json
  {
    "email": "usuario@pavasal.com",
    "password": "********"
  }
  ```
- **Respuesta `200 OK`**:
  ```json
  {
    "accessToken": "<firebase_id_token>",
    "refreshToken": "<firebase_refresh_token>",
    "expiresIn": 3600,
    "user": {
      "uid": "firebase-uid",
      "email": "usuario@pavasal.com",
      "displayName": "Nombre Usuario",
      "photoURL": "https://...",
      "isSuperAdmin": false
    }
  }
  ```
- **Errores**: `401 Unauthorized` si las credenciales son incorrectas o el usuario está deshabilitado.

### 1.2 `GET /api/auth/google/url` (público)
- **Respuesta `200 OK`**:
  ```json
  {
    "url": "https://accounts.google.com/o/oauth2/v2/auth?..."
  }
  ```

### 1.3 `GET /api/auth/google/callback` (público — callback del popup OAuth)
- Recibe `code` (y opcionalmente `error`) desde Google.
- Intercambia `code` por el `id_token` de Google (`googleapis`) y lo canjea en Firebase (`accounts:signInWithIdp`).
- Devuelve HTML ligero que notifica a `window.opener` y cierra la ventana emergente (mismo patrón que `DriveController.handleCallback`):
  - **Éxito**: `type: 'PAVABIM_AUTH_SUCCESS'`, `accessToken`, `refreshToken`, `expiresIn`, `user`.
  - **Error**: `type: 'PAVABIM_AUTH_ERROR'`, `error`.

### 1.4 `GET /api/auth/me` (protegido con `@UseGuards(FirebaseAuthGuard)`)
- Valida `Authorization: Bearer <accessToken>` y devuelve el perfil del usuario actual:
  ```json
  {
    "uid": "firebase-uid",
    "email": "usuario@pavasal.com",
    "displayName": "Nombre Usuario",
    "photoURL": "https://...",
    "isSuperAdmin": false
  }
  ```

### 1.5 `POST /api/auth/refresh` (público)
- **Body JSON**:
  ```json
  {
    "refreshToken": "<firebase_refresh_token>"
  }
  ```
- Canjea el `refreshToken` en `https://securetoken.googleapis.com/v1/token` y devuelve el mismo formato que `POST /api/auth/login` (`accessToken`, `refreshToken`, `expiresIn`, `user`).
- **Errores**: `401 Unauthorized` si el refresh token es inválido o fue revocado.

### 1.6 `POST /api/auth/logout` (protegido con `@UseGuards(FirebaseAuthGuard)`)
- Revoca los refresh tokens del usuario en Firebase (`this.firebaseService.auth.revokeRefreshTokens(user.uid)`) y responde `{ "success": true }`.

---

## 2. Variables de entorno a añadir en `pavabim-backend`

Añade en `.env` (y `.env.example`) y expón en `src/config/configuration.ts`:

```ini
# Clave Web del proyecto Firebase (Configuración del proyecto > General > Clave de API web)
FIREBASE_WEB_API_KEY=AIzaSy...

# Redirect URI para login con Google de usuarios (además de GOOGLE_REDIRECT_URI de Drive)
GOOGLE_AUTH_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

En `src/config/configuration.ts`:

```ts
  firebase: {
    credentialsPath: process.env.FIREBASE_CREDENTIALS_PATH,
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    webApiKey: process.env.FIREBASE_WEB_API_KEY,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/drive/auth/callback',
    authRedirectUri: process.env.GOOGLE_AUTH_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback',
  },
```

> **Google Cloud Console**: registra `http://localhost:3000/api/auth/google/callback` (y la URL de producción) en **URIs de redireccionamiento autorizados** de tu OAuth Client ID.

---

## 3. Implementación sugerida en `pavabim-backend`

### 3.1 `src/modules/auth/dto/auth.dto.ts`

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'usuario@pavasal.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '********' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
```

### 3.2 `src/modules/auth/auth.service.ts`

```ts
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { FirebaseService } from '../firebase/firebase.service';

export interface BackendAuthUser {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  isSuperAdmin: boolean;
}

export interface BackendAuthResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  user: BackendAuthUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly firebaseService: FirebaseService,
  ) {}

  private getFirebaseWebApiKey(): string {
    const key = this.configService.get<string>('firebase.webApiKey')?.trim();
    if (!key) {
      throw new InternalServerErrorException(
        'FIREBASE_WEB_API_KEY no está configurada en el backend.',
      );
    }
    return key;
  }

  private createGoogleAuthClient() {
    const clientId = this.configService.get<string>('google.clientId');
    const clientSecret = this.configService.get<string>('google.clientSecret');
    const redirectUri =
      this.configService.get<string>('google.authRedirectUri') ||
      'http://localhost:3000/api/auth/google/callback';

    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException(
        'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no están configurados.',
      );
    }

    return {
      oauth2Client: new google.auth.OAuth2(clientId, clientSecret, redirectUri),
      redirectUri,
    };
  }

  private async buildSessionFromFirebaseTokens(
    idToken: string,
    refreshToken?: string,
    expiresInRaw?: string | number,
  ): Promise<BackendAuthResult> {
    const decoded = await this.firebaseService.verifyIdToken(idToken);
    const expiresIn = Number(expiresInRaw || 3600) || 3600;

    return {
      accessToken: idToken,
      refreshToken,
      expiresIn,
      user: {
        uid: decoded.uid,
        email: decoded.email || '',
        displayName: decoded.name || decoded.email || 'Usuario BIM',
        photoURL: decoded.picture,
        isSuperAdmin: Boolean(decoded.superadmin),
      },
    };
  }

  async loginWithEmail(email: string, password: string): Promise<BackendAuthResult> {
    const apiKey = this.getFirebaseWebApiKey();
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          returnSecureToken: true,
        }),
      },
    );

    const data = (await res.json()) as {
      idToken?: string;
      refreshToken?: string;
      expiresIn?: string;
      error?: { message?: string };
    };

    if (!res.ok || !data.idToken) {
      this.logger.warn(`Email login rejected for ${email}: ${data.error?.message}`);
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    return this.buildSessionFromFirebaseTokens(
      data.idToken,
      data.refreshToken,
      data.expiresIn,
    );
  }

  getGoogleAuthorizationUrl(): string {
    const { oauth2Client } = this.createGoogleAuthClient();
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'select_account',
      scope: ['openid', 'email', 'profile'],
    });
  }

  async handleGoogleCallback(code: string): Promise<BackendAuthResult> {
    const apiKey = this.getFirebaseWebApiKey();
    const { oauth2Client, redirectUri } = this.createGoogleAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.id_token) {
      throw new UnauthorizedException('Google no devolvió un id_token válido.');
    }

    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postBody: `id_token=${encodeURIComponent(tokens.id_token)}&providerId=google.com`,
          requestUri: redirectUri,
          returnIdpCredential: true,
          returnSecureToken: true,
        }),
      },
    );

    const data = (await res.json()) as {
      idToken?: string;
      refreshToken?: string;
      expiresIn?: string;
      error?: { message?: string };
    };

    if (!res.ok || !data.idToken) {
      throw new UnauthorizedException(
        data.error?.message || 'No se pudo validar el acceso de Google en Firebase.',
      );
    }

    return this.buildSessionFromFirebaseTokens(
      data.idToken,
      data.refreshToken,
      data.expiresIn,
    );
  }

  async refreshSession(refreshToken: string): Promise<BackendAuthResult> {
    const apiKey = this.getFirebaseWebApiKey();
    const res = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }).toString(),
      },
    );

    const data = (await res.json()) as {
      id_token?: string;
      refresh_token?: string;
      expires_in?: string;
      error?: { message?: string };
    };

    if (!res.ok || !data.id_token) {
      throw new UnauthorizedException('Refresh token inválido o expirado.');
    }

    return this.buildSessionFromFirebaseTokens(
      data.id_token,
      data.refresh_token || refreshToken,
      data.expires_in,
    );
  }

  async getCurrentUserProfile(uid: string): Promise<BackendAuthUser> {
    const record = await this.firebaseService.auth.getUser(uid);
    return {
      uid: record.uid,
      email: record.email || '',
      displayName: record.displayName || record.email || 'Usuario BIM',
      photoURL: record.photoURL,
      isSuperAdmin: Boolean(record.customClaims?.superadmin),
    };
  }

  async revokeUserSession(uid: string): Promise<void> {
    await this.firebaseService.auth.revokeRefreshTokens(uid);
  }
}
```

### 3.3 `src/modules/auth/auth.controller.ts`

```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { AuthenticatedUser } from '../../common/types/project.types';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto } from './dto/auth.dto';

@ApiTags('Authentication')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión con correo y contraseña a través del backend' })
  login(@Body() dto: LoginDto) {
    return this.authService.loginWithEmail(dto.email, dto.password);
  }

  @Get('google/url')
  @ApiOperation({ summary: 'Obtener URL de inicio de sesión con Google (OAuth2)' })
  getGoogleUrl() {
    return { url: this.authService.getGoogleAuthorizationUrl() };
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'Callback OAuth2 de Google para autenticar al usuario en el popup' })
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Res() res: Response,
  ) {
    const serialize = (payload: unknown) =>
      JSON.stringify(payload).replace(/</g, '\\u003c');

    if (oauthError || !code) {
      const safePayload = serialize({
        type: 'PAVABIM_AUTH_ERROR',
        error: oauthError || 'Código de autorización no recibido.',
      });
      return res.send(`
        <html><body><script>
          if (window.opener) {
            window.opener.postMessage(${safePayload}, '*');
            window.close();
          }
        </script></body></html>
      `);
    }

    try {
      const session = await this.authService.handleGoogleCallback(code);
      const safePayload = serialize({
        type: 'PAVABIM_AUTH_SUCCESS',
        ...session,
      });

      return res.send(`
        <html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
          <p>Sesión iniciada. Puedes cerrar esta ventana.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage(${safePayload}, '*');
              window.close();
            }
          </script>
        </body></html>
      `);
    } catch (err: any) {
      const safePayload = serialize({
        type: 'PAVABIM_AUTH_ERROR',
        error: err?.message || 'Error al autenticar con Google.',
      });
      return res.status(401).send(`
        <html><body><script>
          if (window.opener) {
            window.opener.postMessage(${safePayload}, '*');
            window.close();
          }
        </script></body></html>
      `);
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar el token de acceso usando refreshToken' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshSession(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener el perfil del usuario autenticado actual' })
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getCurrentUserProfile(user.uid);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar sesión y revocar refresh tokens del usuario' })
  async logout(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.revokeUserSession(user.uid);
    return { success: true };
  }
}
```

> Nota: si en producción configuráis un dominio específico de frontend (`FRONTEND_URL`), sustituid `'*'` en `window.opener.postMessage(..., ...)` por ese origen exacto y aseguraos de no enviar `Cross-Origin-Opener-Policy: same-origin` en `/api/auth/google/callback` para no romper `window.opener`.

### 3.4 Registrar `AuthModule` en `src/app.module.ts`

Crea `src/modules/auth/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
```

Y añádelo al array `imports` de `AppModule` en `src/app.module.ts`.

---

## 4. Ventaja para el frontend

Con estos endpoints activos en `pavabim-backend`:
- `pavabim-frontend-web` **no necesita ninguna variable `VITE_FIREBASE_*`** en `.env`.
- Todos los endpoints actuales (`ProjectsController`, `BcfController`, `IfcProcessorController`, `LocalModelsController`, `DriveController`, `SettingsController`) siguen recibiendo un **Firebase ID Token** válido en `Authorization: Bearer <token>`.

