import { useEffect, useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { bcfService } from '../api/bcf.service';
import { useAuth } from '../auth/AuthProvider';
import { useViewerStore } from '../store/useViewerStore';
import type { BcfTopic, BcfViewpoint } from '../types/bcf.types';
import { translateTopicStatus } from '../utils/bcfLabels';
import { useEngine } from '../viewer/EngineContext';

function getPinAccentColor(topic: BcfTopic): string {
  const status = (topic.topic_status || '').toLowerCase();
  const priority = (topic.priority || '').toLowerCase();

  if (priority.includes('crit') || priority.includes('alta') || priority === 'high') {
    return '#ef4444';
  }
  if (status.includes('progress') || status.includes('curso')) {
    return '#3b82f6';
  }
  if (status.includes('resolv') || status.includes('resuel')) {
    return '#10b981';
  }
  return '#f59e0b';
}

function isTopicOpenForPin(topic: BcfTopic): boolean {
  if (topic.deleted) return false;
  const status = (topic.topic_status || '').trim().toLowerCase();
  return status !== 'closed' && status !== 'cerrado' && status !== 'cerrada';
}

export function useBcfScenePins(): void {
  const { user } = useAuth();
  const {
    currentProjectId,
    loadedModels,
    areBcfPinsVisible,
    activeBcfTopicId,
    setActiveBcfTopicId,
    setRightSidebarTab,
  } = useViewerStore();

  const {
    isEngineReady,
    world,
    applyBcfViewpoint,
    resolveBcfViewpointPinPosition,
  } = useEngine();

  const visibleModelsKey = useMemo(
    () =>
      loadedModels
        .filter((m) => m.visible)
        .map((m) => m.id)
        .join('|'),
    [loadedModels],
  );

  const shouldFetch = Boolean(
    user && currentProjectId && isEngineReady && areBcfPinsVisible,
  );

  const topicsQuery = useQuery({
    queryKey: ['bcf-topics-pins', currentProjectId],
    queryFn: () =>
      bcfService.getTopics(currentProjectId!, {
        $top: 100,
        $orderby: 'modified_date desc',
      }),
    enabled: shouldFetch,
    staleTime: 1000 * 30,
  });

  const openTopics = useMemo(
    () => (topicsQuery.data ?? []).filter(isTopicOpenForPin),
    [topicsQuery.data],
  );

  const viewpointQueries = useQueries({
    queries: openTopics.map((topic) => ({
      queryKey: [
        'bcf-pin-viewpoint',
        currentProjectId,
        topic.guid,
        topic.default_viewpoint_guid ?? 'first',
      ],
      queryFn: async (): Promise<BcfViewpoint | null> => {
        if (!currentProjectId) return null;
        if (topic.default_viewpoint_guid) {
          return bcfService
            .getViewpoint(
              currentProjectId,
              topic.guid,
              topic.default_viewpoint_guid,
            )
            .catch(() => null);
        }
        const list = await bcfService
          .getViewpoints(currentProjectId, topic.guid)
          .catch(() => []);
        return list[0] ?? null;
      },
      enabled: shouldFetch,
      staleTime: 1000 * 60 * 2,
    })),
  });

  const resolvedViewpoints = useMemo(() => {
    const pairs: Array<{ topic: BcfTopic; viewpoint: BcfViewpoint }> = [];
    for (let i = 0; i < openTopics.length; i++) {
      const vp = viewpointQueries[i]?.data;
      if (vp) {
        pairs.push({ topic: openTopics[i], viewpoint: vp });
      }
    }
    return pairs;
  }, [openTopics, viewpointQueries]);

  useEffect(() => {
    if (
      !isEngineReady ||
      !world ||
      !areBcfPinsVisible ||
      !currentProjectId ||
      visibleModelsKey.length === 0 ||
      resolvedViewpoints.length === 0
    ) {
      return;
    }

    let cancelled = false;
    const pinsGroup = new THREE.Group();
    pinsGroup.name = 'pavabim-bcf-scene-pins';
    world.scene.three.add(pinsGroup);

    if (world.renderer?.three2D?.domElement) {
      world.renderer.three2D.domElement.style.pointerEvents = 'none';
    }

    const createdDomHandlers: Array<{
      el: HTMLButtonElement;
      handler: (e: MouseEvent) => void;
    }> = [];

    const mountPins = async () => {
      for (const { topic, viewpoint } of resolvedViewpoints) {
        if (cancelled) return;
        const pos = await resolveBcfViewpointPinPosition(viewpoint);
        if (cancelled || !pos) continue;

        const accent = getPinAccentColor(topic);
        const isCurrent = activeBcfTopicId === topic.guid;
        const code = topic.server_assigned_id || topic.guid.slice(0, 6).toUpperCase();

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.pointerEvents = 'auto';
        btn.style.cursor = 'pointer';
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.gap = '5px';
        btn.style.padding = '3px 8px 3px 6px';
        btn.style.borderRadius = '9999px';
        btn.style.border = isCurrent
          ? '2px solid #ffc72c'
          : `1.5px solid ${accent}`;
        btn.style.background = isCurrent
          ? 'rgba(18, 18, 18, 0.96)'
          : 'rgba(15, 23, 42, 0.92)';
        btn.style.color = '#f8fafc';
        btn.style.fontSize = '11px';
        btn.style.fontWeight = '700';
        btn.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
        btn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.55)';
        btn.style.userSelect = 'none';
        btn.style.whiteSpace = 'nowrap';
        btn.title = `${code} · ${topic.title} (${translateTopicStatus(topic.topic_status)})`;

        const dot = document.createElement('span');
        dot.style.width = '8px';
        dot.style.height = '8px';
        dot.style.borderRadius = '9999px';
        dot.style.backgroundColor = accent;
        dot.style.flexShrink = '0';

        const textSpan = document.createElement('span');
        textSpan.textContent = code;

        btn.appendChild(dot);
        btn.appendChild(textSpan);

        const onClick = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setRightSidebarTab('bcf');
          setActiveBcfTopicId(topic.guid);
          void applyBcfViewpoint(viewpoint);
        };

        btn.addEventListener('click', onClick);
        createdDomHandlers.push({ el: btn, handler: onClick });

        const pinLabel = new CSS2DObject(btn);
        pinLabel.position.copy(pos);
        pinsGroup.add(pinLabel);
      }

      world.renderer?.update();
    };

    void mountPins();

    return () => {
      cancelled = true;
      for (const { el, handler } of createdDomHandlers) {
        el.removeEventListener('click', handler);
        el.remove();
      }
      pinsGroup.clear();
      world.scene.three.remove(pinsGroup);
      world.renderer?.update();
    };
  }, [
    activeBcfTopicId,
    applyBcfViewpoint,
    areBcfPinsVisible,
    currentProjectId,
    isEngineReady,
    resolveBcfViewpointPinPosition,
    resolvedViewpoints,
    setActiveBcfTopicId,
    setRightSidebarTab,
    visibleModelsKey,
    world,
  ]);
}
