import React, { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bcfService } from '../../api/bcf.service';
import { getApiErrorMessage } from '../../api/client';
import { projectsService } from '../../api/projects.service';
import { useAuth } from '../../auth/AuthProvider';
import { useProjectRole } from '../../hooks/useProjectRole';
import { useViewerStore } from '../../store/useViewerStore';
import type { CreateViewpointPayload } from '../../types/bcf.types';
import {
  BcfSelectionLimitError,
  type CapturedViewpointDraft,
} from '../../viewer/BcfViewerBridge';
import { useEngine } from '../../viewer/EngineContext';
import { SnapshotRedlineModal } from './SnapshotRedlineModal';
import { TopicDetailPanel } from './TopicDetailPanel';
import { TopicListPanel, type TopicListFilters } from './TopicListPanel';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('No se pudo convertir la captura a imagen.'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export const BcfIssuesPanel: React.FC = () => {
  const { user } = useAuth();
  const { canEditBcf } = useProjectRole();
  const {
    currentProject,
    activeBcfTopicId,
    setActiveBcfTopicId,
    setViewerToastError,
    localViewpoints,
    addLocalViewpoint,
    removeLocalViewpoint,
  } = useViewerStore();

  const {
    isEngineReady,
    getCameraViewpoint,
    setCameraViewpoint,
    captureSnapshotBlob,
    captureBcfViewpointDraft,
    applyBcfViewpoint,
  } = useEngine();

  const projectId = currentProject?.id || '';
  const isRemoteReady = Boolean(user && projectId);

  const [isCreating, setIsCreating] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [localViewTitle, setLocalViewTitle] = useState('');
  const [capturingLocal, setCapturingLocal] = useState(false);

  const [filters, setFilters] = useState<TopicListFilters>({
    search: '',
    statuses: [],
    topicType: '',
    assignedTo: '',
    label: '',
    orderBy: 'modified_date desc',
  });

  // Redline capture modal state & promise resolver
  const [redlineDraft, setRedlineDraft] = useState<{
    draft: CapturedViewpointDraft;
    title?: string;
  } | null>(null);
  const redlineResolverRef = useRef<
    ((payload: CreateViewpointPayload | null) => void) | null
  >(null);

  const extensionsQuery = useQuery({
    queryKey: ['bcf-extensions', projectId],
    queryFn: () => bcfService.getExtensions(projectId),
    enabled: isRemoteReady,
  });

  const membersQuery = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => projectsService.listMembers(projectId),
    enabled: isRemoteReady,
    staleTime: 1000 * 60 * 2,
  });

  const topicsQuery = useQuery({
    queryKey: [
      'bcf-topics',
      projectId,
      filters.search,
      filters.statuses.join(','),
      filters.topicType,
      filters.assignedTo,
      filters.label,
      filters.orderBy,
    ],
    queryFn: () => {
      const trimmedSearch = filters.search.trim();
      const looksLikeCode = /^TOP-\d+$/i.test(trimmedSearch);
      return bcfService.getTopics(projectId, {
        ...(looksLikeCode
          ? { server_assigned_id: trimmedSearch.toUpperCase() }
          : trimmedSearch
            ? { search: trimmedSearch }
            : {}),
        ...(filters.statuses.length > 0
          ? { topic_status: filters.statuses.join(',') }
          : {}),
        ...(filters.topicType ? { topic_type: filters.topicType } : {}),
        ...(filters.assignedTo ? { assigned_to: filters.assignedTo } : {}),
        ...(filters.label ? { labels: filters.label } : {}),
        $orderby: filters.orderBy,
        $top: 100,
      });
    },
    enabled: isRemoteReady,
  });

  const requestCaptureViewpoint = useCallback(
    async (modalTitle?: string): Promise<CreateViewpointPayload | null> => {
      try {
        setBannerError(null);
        const draft = await captureBcfViewpointDraft();

        if (!draft.rawSnapshotDataUrl) {
          return draft.payload;
        }

        return await new Promise<CreateViewpointPayload | null>((resolve) => {
          redlineResolverRef.current = resolve;
          setRedlineDraft({ draft, title: modalTitle });
        });
      } catch (err) {
        if (err instanceof BcfSelectionLimitError) {
          setBannerError(err.message);
          setViewerToastError(err.message);
          window.alert(err.message);
          return null;
        }
        const msg = getApiErrorMessage(err);
        setBannerError(msg);
        return null;
      }
    },
    [captureBcfViewpointDraft, setViewerToastError],
  );

  const handleCancelRedline = () => {
    const resolver = redlineResolverRef.current;
    redlineResolverRef.current = null;
    setRedlineDraft(null);
    resolver?.(null);
  };

  const handleConfirmRedline = (finalSnapshotDataUrl: string) => {
    const current = redlineDraft;
    const resolver = redlineResolverRef.current;
    redlineResolverRef.current = null;
    setRedlineDraft(null);

    if (!current) {
      resolver?.(null);
      return;
    }

    const updatedPayload: CreateViewpointPayload = {
      ...current.draft.payload,
      snapshot: {
        snapshot_type: 'png',
        snapshot_data: finalSnapshotDataUrl,
      },
    };
    resolver?.(updatedPayload);
  };

  const handleQuickApplyViewpoint = async (topic: {
    guid: string;
    default_viewpoint_guid?: string | null;
  }) => {
    try {
      setBannerError(null);
      let vp = null;
      if (topic.default_viewpoint_guid) {
        vp = await bcfService.getViewpoint(
          projectId,
          topic.guid,
          topic.default_viewpoint_guid,
        );
      } else {
        const list = await bcfService.getViewpoints(projectId, topic.guid);
        vp = list[0] ?? null;
      }
      if (vp) {
        await applyBcfViewpoint(vp);
      }
    } catch (err) {
      setBannerError(getApiErrorMessage(err));
    }
  };

  const handleExportBcf = async (selectedGuids?: string[]) => {
    try {
      setBannerError(null);
      await bcfService.exportBcfArchive(
        projectId,
        selectedGuids,
        currentProject?.name,
      );
    } catch (err) {
      setBannerError(getApiErrorMessage(err));
    }
  };

  const handleCaptureLocalViewpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEngineReady) return;
    const cam = getCameraViewpoint();
    if (!cam) return;

    setCapturingLocal(true);
    try {
      const blob = await captureSnapshotBlob();
      const snapshotDataUrl = blob ? await blobToDataUrl(blob) : undefined;
      addLocalViewpoint({
        id: `local-vp-${Date.now()}`,
        title:
          localViewTitle.trim() || `Vista #${localViewpoints.length + 1}`,
        createdAt: new Date().toLocaleTimeString(),
        camera: cam,
        snapshotDataUrl,
      });
      setLocalViewTitle('');
    } finally {
      setCapturingLocal(false);
    }
  };

  // Standalone / No Project Mode
  if (!isRemoteReady) {
    return (
      <div className="space-y-4 text-xs">
        <div className="rounded border border-asphalt-700 bg-asphalt-950/70 p-3 space-y-1">
          <p className="font-semibold text-pavasal-400">
            Vistas y Capturas Locales
          </p>
          <p className="text-[11px] text-asphalt-300 leading-relaxed">
            Sin proyecto activo puedes guardar puntos de vista 3D y descargar
            capturas PNG de tus modelos locales. Selecciona un proyecto en la
            barra superior para gestionar tópicos colaborativos{' '}
            <strong className="text-pavasal-400">BCF 3.0</strong>.
          </p>
        </div>

        <form onSubmit={handleCaptureLocalViewpoint} className="space-y-2">
          <input
            value={localViewTitle}
            onChange={(e) => setLocalViewTitle(e.target.value)}
            placeholder="Nombre de la vista (opcional)"
            className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-2.5 py-1.5 text-asphalt-50 placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!isEngineReady || capturingLocal}
            className="w-full rounded bg-pavasal-500 py-1.5 font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-40 transition-colors"
          >
            {capturingLocal ? 'Capturando...' : '+ Capturar vista 3D local'}
          </button>
        </form>

        {localViewpoints.length === 0 ? (
          <p className="rounded border border-dashed border-asphalt-700 p-4 text-center text-asphalt-400 text-[11px]">
            Aún no hay vistas locales guardadas en esta sesión.
          </p>
        ) : (
          <div className="space-y-2">
            {localViewpoints.map((vp) => (
              <div
                key={vp.id}
                className="rounded border border-asphalt-700 bg-asphalt-800/70 overflow-hidden"
              >
                {vp.snapshotDataUrl && (
                  <button
                    type="button"
                    onClick={() => void setCameraViewpoint(vp.camera)}
                    className="block w-full"
                    title="Restaurar cámara en escena 3D"
                  >
                    <img
                      src={vp.snapshotDataUrl}
                      alt={vp.title}
                      className="w-full h-28 object-cover"
                    />
                  </button>
                )}
                <div className="p-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => void setCameraViewpoint(vp.camera)}
                    className="text-left min-w-0 flex-1"
                  >
                    <div className="font-medium text-asphalt-100 truncate hover:text-pavasal-400">
                      {vp.title}
                    </div>
                    <div className="text-[10px] text-asphalt-400">
                      {vp.createdAt}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {vp.snapshotDataUrl && (
                      <a
                        href={vp.snapshotDataUrl}
                        download={`${vp.title.replace(/\s+/g, '_')}.png`}
                        className="text-[11px] text-pavasal-400 hover:text-pavasal-300"
                        title="Descargar captura PNG"
                      >
                        PNG
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => removeLocalViewpoint(vp.id)}
                      className="text-[11px] text-red-400 hover:text-red-300"
                      title="Eliminar vista"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {isCreating ? (
        <TopicDetailPanel
          mode="create"
          projectId={projectId}
          topicGuid={null}
          extensions={extensionsQuery.data}
          members={membersQuery.data ?? []}
          onBack={() => setIsCreating(false)}
          onTopicCreated={(created) => {
            setIsCreating(false);
            setActiveBcfTopicId(created.guid);
          }}
          onTopicDeleted={() => setIsCreating(false)}
          onRequestCaptureViewpoint={requestCaptureViewpoint}
        />
      ) : activeBcfTopicId ? (
        <TopicDetailPanel
          mode="detail"
          projectId={projectId}
          topicGuid={activeBcfTopicId}
          extensions={extensionsQuery.data}
          members={membersQuery.data ?? []}
          onBack={() => setActiveBcfTopicId(null)}
          onTopicCreated={(created) => setActiveBcfTopicId(created.guid)}
          onTopicDeleted={() => setActiveBcfTopicId(null)}
          onRequestCaptureViewpoint={requestCaptureViewpoint}
        />
      ) : (
        <TopicListPanel
          projectId={projectId}
          topics={topicsQuery.data ?? []}
          isLoading={topicsQuery.isLoading}
          errorMessage={
            bannerError ||
            (topicsQuery.isError ? getApiErrorMessage(topicsQuery.error) : null)
          }
          canEditBcf={canEditBcf}
          isEngineReady={isEngineReady}
          extensions={extensionsQuery.data}
          members={membersQuery.data ?? []}
          filters={filters}
          onChangeFilters={setFilters}
          onOpenCreate={() => {
            setBannerError(null);
            setIsCreating(true);
          }}
          onSelectTopic={(guid) => {
            setBannerError(null);
            setActiveBcfTopicId(guid);
          }}
          onQuickApplyViewpoint={handleQuickApplyViewpoint}
          onExportBcf={handleExportBcf}
        />
      )}

      <SnapshotRedlineModal
        isOpen={Boolean(redlineDraft)}
        rawSnapshotDataUrl={redlineDraft?.draft.rawSnapshotDataUrl ?? ''}
        snapshotWidth={redlineDraft?.draft.snapshotWidth ?? 1280}
        snapshotHeight={redlineDraft?.draft.snapshotHeight ?? 720}
        title={redlineDraft?.title}
        onCancel={handleCancelRedline}
        onConfirm={handleConfirmRedline}
      />
    </>
  );
};

export default BcfIssuesPanel;
