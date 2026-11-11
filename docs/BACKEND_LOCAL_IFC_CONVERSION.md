# Instrucciones para `pavabim-backend`: Conversión local `.ifc` → `.frag` con usuario autenticado (sin proyecto ni Drive)

Este documento describe exactamente lo que necesita `pavabim-frontend-web` en el repositorio `pavabim-backend` para convertir archivos `.ifc` subidos desde el ordenador del usuario a formato binario `.frag` en memoria, **exigiendo sesión Firebase válida**, pero **sin asociar la petición a ningún proyecto ni guardar archivos en Google Drive ni Firestore**.

---

## Resumen del contrato HTTP esperado por el frontend

- **Método y ruta**: `POST /api/models/convert-local`
- **Autenticación obligatoria**: `Authorization: Bearer <firebase_id_token>`
  - El interceptor de Axios (`src/api/client.ts`) adjunta automáticamente el token JWT de Firebase del usuario autenticado y lo refresca si recibe `401`.
  - En el frontend el usuario está autenticado mediante Firebase Auth, pero puede estar en la opción `"Sin proyecto (visor local)"`, por lo que **no existe `projectId`**.
- **Request (`multipart/form-data`)**:
  - Campo binario único: `file` (archivo `.ifc`).
  - Cliente configurado en `src/api/models.service.ts` (`convertLocalIfcToFrag`) y proxy Vite (`vite.config.ts`) con `timeout: 300000` ms (5 minutos).
- **Response exitosa (`200 OK`)**:
  - Cuerpo binario directo (`Buffer` del `.frag`), esperado como `ArrayBuffer`.
  - `Content-Type: application/octet-stream`
  - `Content-Disposition: attachment; filename="<nombre>.frag"`
  - `Cache-Control: no-store`
- **Errores**:
  - Respuestas JSON estándar de NestJS (`{ statusCode, message, error }`). El frontend decodifica `ArrayBuffer` a UTF-8 para mostrar el `message` de error (incluidos `400` y `401`).

---

## Cambios requeridos en `pavabim-backend`

### 1. Crear un controlador independiente sin `:projectId`

Actualmente `IfcProcessorController` (`src/modules/ifc-processor/ifc-processor.controller.ts`) está definido así:

```ts
@UseGuards(FirebaseAuthGuard, ProjectRoleGuard)
@Controller('api/projects/:projectId/models')
export class IfcProcessorController { ... }
```

**No** metas esta ruta dentro de `IfcProcessorController`, porque `ProjectRoleGuard` exige un parámetro `:projectId` y membresía en Firestore.

Crea un nuevo controlador (por ejemplo `src/modules/ifc-processor/local-models.controller.ts`) bajo `@Controller('api/models')` protegido **únicamente** con `FirebaseAuthGuard`:

- `FirebaseModule` (`src/modules/firebase/firebase.module.ts`) está marcado con `@Global()`, por lo que `FirebaseAuthGuard` ya puede usarse directamente en `IfcProcessorModule` sin importar módulos adicionales.
- `@UseGuards(FirebaseAuthGuard)` valida el `Bearer <token>` (`src/common/guards/firebase-auth.guard.ts`), rellena `request.user` y devuelve `401 Unauthorized` si el usuario no ha iniciado sesión o el token es inválido/expirado.
- Usa `FileInterceptor('file', ...)` de `@nestjs/platform-express` (paquete y `@types/multer` ya presentes en `package.json`, siguiendo el mismo patrón que `BcfController`).
- Mantén el almacenamiento por defecto de Multer (`memoryStorage`) sin escribir en disco ni subir nada a Google Drive.

#### Código de referencia para `src/modules/ifc-processor/local-models.controller.ts`

```ts
import {
  BadRequestException,
  Controller,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { AuthenticatedUser } from '../../common/types/project.types';
import { IfcProcessorService } from './ifc-processor.service';

@ApiTags('IFC & Fragments (.frag) Engine')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('api/models')
export class LocalModelsController {
  constructor(private readonly ifcService: IfcProcessorService) {}

  @Post('convert-local')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 200 * 1024 * 1024, // Ajustar límite máximo de IFC según entorno
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo IFC local a convertir en .frag sin persistir en Drive',
        },
      },
    },
  })
  @ApiProduces('application/octet-stream')
  @ApiOperation({
    summary:
      'Convertir un .ifc local en memoria a .frag (requiere sesión Firebase, sin proyecto ni Drive)',
  })
  async convertLocalIfc(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Alinear timeout HTTP con el timeout de 300000 ms del frontend y proxy Vite
    req.setTimeout(300000);
    res.setTimeout(300000);

    if (!file || !file.buffer?.length) {
      throw new BadRequestException(
        'Debes adjuntar un archivo .ifc válido en el campo "file".',
      );
    }

    if (!file.originalname.toLowerCase().endsWith('.ifc')) {
      throw new BadRequestException(
        'Solo se admiten archivos con extensión .ifc.',
      );
    }

    const fragBuffer = await this.ifcService.convertIfcBufferToFrag(
      file.buffer,
      file.originalname,
      user.uid,
    );

    const baseName = file.originalname.replace(/\.ifc$/i, '') || 'model';

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(baseName)}.frag"`,
    );
    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).send(fragBuffer);
  }
}
```

---

### 2. Registrar el controlador en `IfcProcessorModule`

En `src/modules/ifc-processor/ifc-processor.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { IfcProcessorService } from './ifc-processor.service';
import { IfcProcessorController } from './ifc-processor.controller';
import { LocalModelsController } from './local-models.controller';
import { DriveModule } from '../drive/drive.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [DriveModule, ProjectsModule],
  controllers: [IfcProcessorController, LocalModelsController],
  providers: [IfcProcessorService],
  exports: [IfcProcessorService],
})
export class IfcProcessorModule {}
```

---

### 3. Añadir el método de conversión en memoria en `IfcProcessorService`

En `src/modules/ifc-processor/ifc-processor.service.ts`, ya existe la lógica de conversión con `@thatopen/fragments` y `web-ifc@0.0.79` dentro de `startBackgroundConversion`.

Extrae un helper reutilizable (por ejemplo `convertBufferToFrag` privado y `convertIfcBufferToFrag` público) para no duplicar código y **no invocar** `driveAuthService`, `driveService`, `projectsService` ni `extractIfcMetadata` en la conversión local:

```ts
async convertIfcBufferToFrag(
  ifcBuffer: Buffer,
  fileName = 'local.ifc',
  userId?: string,
): Promise<Buffer> {
  this.logger.log(
    `[LocalConvert] Converting '${fileName}' (${ifcBuffer.length} bytes) for user=${userId ?? 'unknown'}`,
  );

  const importer = new IfcImporter();
  importer.wasm = {
    path: 'https://unpkg.com/web-ifc@0.0.79/',
    absolute: true,
  };

  const fragBinary = await importer.process({
    bytes: new Uint8Array(ifcBuffer),
  });

  if (!fragBinary || fragBinary.byteLength === 0) {
    throw new BadRequestException(
      'No se pudo generar geometría .frag a partir del IFC proporcionado.',
    );
  }

  return Buffer.from(fragBinary);
}
```

> Puedes reutilizar este mismo bloque dentro de `startBackgroundConversion` para mantener una única ruta de conversión IFC → `.frag`.

---

### 4. Comprobaciones adicionales recomendadas

1. **CORS y cabeceras en `src/main.ts`**: `app.enableCors` ya habilita `POST` y `credentials: true`; si el frontend llama directamente al dominio del backend sin proxy en producción y quiere leer `Content-Disposition`, incluye `exposedHeaders: ['Content-Disposition']` en `enableCors`.
2. **Sin persistencia**: esta ruta no debe crear documentos en Firestore ni carpetas/ficheros en Google Drive.
3. **Verificación rápida**:
   - Sin token (`POST /api/models/convert-local`): debe devolver `401 Unauthorized`.
   - Con `Authorization: Bearer <firebase_id_token>` y archivo no `.ifc` o vacío: debe devolver `400 Bad Request` con JSON `{ message, error, statusCode }`.
   - Con token Firebase válido y archivo `.ifc`: debe devolver `200 OK`, `Content-Type: application/octet-stream` y el binario `.frag` sin haber escrito nada en Google Drive ni Firestore.

