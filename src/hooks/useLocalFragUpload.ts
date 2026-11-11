import { useCallback } from 'react';
import axios from 'axios';
import { getApiErrorMessage } from '../api/client';
import { modelsService } from '../api/models.service';
import { useAuth } from '../auth/AuthProvider';
import { useViewerStore } from '../store/useViewerStore';
import { useEngine } from '../viewer/EngineContext';

export function useLocalFragUpload() {
  const { user } = useAuth();
  const { isEngineReady, loadModelFromBuffer } = useEngine();
  const { setModelLoading, setViewerToastError } = useViewerStore();

  const loadLocalFragFiles = useCallback(
    async (files: FileList | File[] | null | undefined) => {
      if (!files || files.length === 0 || !isEngineReady) return;

      if (!user) {
        setViewerToastError(
          'Debes iniciar sesión con Firebase para cargar archivos .frag o .ifc.',
        );
        return;
      }

      const fileArray = Array.from(files);
      const supportedFiles = fileArray.filter((f) => {
        const lower = f.name.toLowerCase();
        return lower.endsWith('.frag') || lower.endsWith('.ifc');
      });

      if (supportedFiles.length === 0) {
        setViewerToastError(
          'Solo se admiten archivos locales con extensión .frag o .ifc.',
        );
        return;
      }

      setViewerToastError(null);

      for (const file of supportedFiles) {
        const lowerName = file.name.toLowerCase();
        const uniqueId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${file.name}`;

        if (lowerName.endsWith('.frag')) {
          try {
            const buffer = await file.arrayBuffer();
            await loadModelFromBuffer(buffer, uniqueId, file.name, 'local');
          } catch (err) {
            console.error('[useLocalFragUpload] Error loading .frag:', err);
            const detail = err instanceof Error ? err.message : '';
            setViewerToastError(
              detail
                ? `No se pudo abrir "${file.name}": ${detail}`
                : `No se pudo abrir el archivo "${file.name}".`,
            );
          }
          continue;
        }

        if (lowerName.endsWith('.ifc')) {
          let downloadUrl: string | undefined;
          try {
            setModelLoading(true, `Subiendo ${file.name} (0%)`);
            const fragBuffer = await modelsService.convertLocalIfcToFrag(
              file,
              (pct) => {
                setModelLoading(
                  true,
                  pct < 100
                    ? `Subiendo ${file.name} (${pct}%)`
                    : `Convirtiendo ${file.name} → .frag en backend...`,
                );
              },
            );

            const fragName = file.name.replace(/\.ifc$/i, '.frag');
            const fragBlob = new Blob([fragBuffer], {
              type: 'application/octet-stream',
            });
            downloadUrl = URL.createObjectURL(fragBlob);

            await loadModelFromBuffer(
              fragBuffer,
              uniqueId,
              fragName,
              'local',
              downloadUrl,
            );
          } catch (err) {
            if (downloadUrl) {
              URL.revokeObjectURL(downloadUrl);
            }
            console.error('[useLocalFragUpload] Error converting .ifc:', err);
            if (axios.isAxiosError(err)) {
              const status = err.response?.status;
              if (status === 404) {
                setViewerToastError(
                  'El endpoint POST /api/models/convert-local no está implementado todavía en el backend.',
                );
                continue;
              }
              if (status === 401) {
                setViewerToastError(
                  'El servidor requiere sesión Firebase para convertir este archivo IFC.',
                );
                continue;
              }
            }
            setViewerToastError(
              getApiErrorMessage(
                err,
                `Error al convertir "${file.name}" a .frag en el servidor.`,
              ),
            );
          } finally {
            setModelLoading(false, null);
          }
        }
      }
    },
    [
      isEngineReady,
      loadModelFromBuffer,
      setModelLoading,
      setViewerToastError,
      user,
    ],
  );

  return { isEngineReady, loadLocalFragFiles };
}
