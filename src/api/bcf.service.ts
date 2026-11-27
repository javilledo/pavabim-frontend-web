import apiClient, { fetchAuthenticatedBlobUrl, normalizeApiPath } from './client';
import type {
  AssignTopicPayload,
  BcfBimSnippet,
  BcfComment,
  BcfDocument,
  BcfDocumentReference,
  BcfHeaderFile,
  BcfProjectExtensions,
  BcfRelatedTopic,
  BcfTopic,
  BcfTopicEvent,
  BcfTopicStats,
  BcfViewpoint,
  BulkUpdateTopicsPayload,
  BulkUpdateTopicsResponse,
  CreateCommentPayload,
  CreateDocumentReferencePayload,
  CreateTopicPayload,
  CreateViewpointPayload,
  DeleteBimSnippetResponse,
  DeleteTopicResponse,
  DeleteViewpointResponse,
  PatchTopicPayload,
  PutTopicPayload,
  QueryEventsParams,
  QueryTopicsParams,
  UpdateCommentPayload,
  UpdateDocumentReferencePayload,
  UpdateExtensionsPayload,
  UpdateTopicStatusPayload,
} from '../types/bcf.types';

function projectBcfBase(projectId: string): string {
  return `/bcf/3.0/projects/${encodeURIComponent(projectId)}`;
}

function topicBase(projectId: string, topicId: string): string {
  return `${projectBcfBase(projectId)}/topics/${encodeURIComponent(topicId)}`;
}

function parseContentDispositionFilename(
  headerValue: string | undefined,
  fallback: string,
): string {
  if (!headerValue) return fallback;
  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;\n]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // Fall through to standard filename match
    }
  }
  const simpleMatch = headerValue.match(/filename="?([^";\n]+)"?/i);
  if (simpleMatch?.[1]) {
    return simpleMatch[1].trim();
  }
  return fallback;
}

function dataUrlOrBase64ToBlob(
  rawData: string,
  fallbackType = 'png',
): { blob: Blob; ext: string } {
  let mime = fallbackType.toLowerCase() === 'jpg' ? 'image/jpeg' : 'image/png';
  let base64 = rawData.trim();

  if (base64.startsWith('data:')) {
    const commaIdx = base64.indexOf(',');
    if (commaIdx !== -1) {
      const header = base64.slice(5, commaIdx);
      const mimeMatch = header.match(/^([^;]+)/);
      if (mimeMatch?.[1]) {
        mime = mimeMatch[1];
      }
      base64 = base64.slice(commaIdx + 1);
    }
  }

  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png';
  return { blob: new Blob([bytes], { type: mime }), ext };
}

export const bcfService = {
  // ---------------------------------------------------------------------------
  // Extensions
  // ---------------------------------------------------------------------------
  async getExtensions(projectId: string): Promise<BcfProjectExtensions> {
    const { data } = await apiClient.get<BcfProjectExtensions>(
      `${projectBcfBase(projectId)}/extensions`,
    );
    return data;
  },

  async updateExtensions(
    projectId: string,
    payload: UpdateExtensionsPayload,
  ): Promise<BcfProjectExtensions> {
    const { data } = await apiClient.put<BcfProjectExtensions>(
      `${projectBcfBase(projectId)}/extensions`,
      payload,
    );
    return data;
  },

  // ---------------------------------------------------------------------------
  // Stats, Events, Bulk Update & Native BCF 3.0 Archive Export
  // ---------------------------------------------------------------------------
  async getTopicStats(projectId: string): Promise<BcfTopicStats> {
    const { data } = await apiClient.get<BcfTopicStats>(
      `${projectBcfBase(projectId)}/topics/stats`,
    );
    return data;
  },

  async getProjectTopicEvents(
    projectId: string,
    params?: QueryEventsParams,
  ): Promise<BcfTopicEvent[]> {
    const { data } = await apiClient.get<BcfTopicEvent[]>(
      `${projectBcfBase(projectId)}/topics/events`,
      { params },
    );
    return data;
  },

  async bulkUpdateTopics(
    projectId: string,
    payload: BulkUpdateTopicsPayload,
  ): Promise<BulkUpdateTopicsResponse> {
    const { data } = await apiClient.patch<BulkUpdateTopicsResponse>(
      `${projectBcfBase(projectId)}/topics/bulk`,
      payload,
    );
    return data;
  },

  async exportBcfArchive(
    projectId: string,
    topicGuids?: string[],
    fallbackProjectName?: string,
  ): Promise<void> {
    const params: Record<string, string> = {};
    if (topicGuids && topicGuids.length > 0) {
      params.topic_guids = topicGuids.join(',');
    }

    const response = await apiClient.get<Blob>(
      `${projectBcfBase(projectId)}/export/bcf`,
      {
        params: Object.keys(params).length > 0 ? params : undefined,
        responseType: 'blob',
        timeout: 180000,
      },
    );

    const safeName = (fallbackProjectName || 'proyecto')
      .trim()
      .replace(/[<>:"/\\|?*]+/g, '_');
    const disposition = response.headers['content-disposition'] as
      | string
      | undefined;
    const filename = parseContentDispositionFilename(
      disposition,
      `${safeName}.bcf`,
    );

    const blobUrl = URL.createObjectURL(response.data);
    try {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename.endsWith('.bcf') ? filename : `${filename}.bcf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    }
  },

  // ---------------------------------------------------------------------------
  // Topics CRUD & Actions
  // ---------------------------------------------------------------------------
  async getTopics(
    projectId: string,
    params?: QueryTopicsParams,
  ): Promise<BcfTopic[]> {
    const serializedParams: Record<string, unknown> = { ...(params ?? {}) };
    if (Array.isArray(serializedParams.labels)) {
      serializedParams.labels = serializedParams.labels.join(',');
    }
    const { data } = await apiClient.get<BcfTopic[]>(
      `${projectBcfBase(projectId)}/topics`,
      { params: serializedParams },
    );
    return data;
  },

  async getTopicById(
    projectId: string,
    topicId: string,
    includeAuthorization = false,
  ): Promise<BcfTopic> {
    const { data } = await apiClient.get<BcfTopic>(
      topicBase(projectId, topicId),
      {
        params: includeAuthorization ? { includeAuthorization: 'true' } : undefined,
      },
    );
    return data;
  },

  async exportTopicMarkupXml(
    projectId: string,
    topicId: string,
  ): Promise<string> {
    const { data } = await apiClient.get<string>(
      `${topicBase(projectId, topicId)}/markup`,
      { responseType: 'text' },
    );
    return data;
  },

  async getTopicEvents(
    projectId: string,
    topicId: string,
    params?: QueryEventsParams,
  ): Promise<BcfTopicEvent[]> {
    const { data } = await apiClient.get<BcfTopicEvent[]>(
      `${topicBase(projectId, topicId)}/events`,
      { params },
    );
    return data;
  },

  async createTopic(
    projectId: string,
    payload: CreateTopicPayload,
  ): Promise<BcfTopic> {
    const cleanPayload: Record<string, unknown> = { ...payload };
    delete cleanPayload.server_assigned_id;

    const { data } = await apiClient.post<BcfTopic>(
      `${projectBcfBase(projectId)}/topics`,
      cleanPayload,
    );
    return data;
  },

  async putTopic(
    projectId: string,
    topicId: string,
    payload: PutTopicPayload,
  ): Promise<BcfTopic> {
    const { data } = await apiClient.put<BcfTopic>(
      topicBase(projectId, topicId),
      payload,
    );
    return data;
  },

  async patchTopic(
    projectId: string,
    topicId: string,
    payload: PatchTopicPayload,
  ): Promise<BcfTopic> {
    const { data } = await apiClient.patch<BcfTopic>(
      topicBase(projectId, topicId),
      payload,
    );
    return data;
  },

  async updateTopicStatus(
    projectId: string,
    topicId: string,
    payload: UpdateTopicStatusPayload,
  ): Promise<BcfTopic> {
    const { data } = await apiClient.patch<BcfTopic>(
      topicBase(projectId, topicId),
      { topic_status: payload.topic_status },
    );
    return data;
  },

  async assignTopic(
    projectId: string,
    topicId: string,
    payload: AssignTopicPayload,
  ): Promise<BcfTopic> {
    const { data } = await apiClient.patch<BcfTopic>(
      topicBase(projectId, topicId),
      { assigned_to: payload.assigned_to ?? undefined },
    );
    return data;
  },

  async restoreTopic(projectId: string, topicId: string): Promise<BcfTopic> {
    const { data } = await apiClient.patch<BcfTopic>(
      `${topicBase(projectId, topicId)}/restore`,
    );
    return data;
  },

  async deleteTopic(
    projectId: string,
    topicId: string,
    permanent = false,
  ): Promise<DeleteTopicResponse> {
    const { data } = await apiClient.delete<DeleteTopicResponse>(
      topicBase(projectId, topicId),
      {
        params: permanent ? { permanent: true } : undefined,
      },
    );
    return data;
  },

  // ---------------------------------------------------------------------------
  // Project Documents & Topic Document References (BCF 3.0)
  // ---------------------------------------------------------------------------
  async getDocuments(projectId: string): Promise<BcfDocument[]> {
    const { data } = await apiClient.get<BcfDocument[]>(
      `${projectBcfBase(projectId)}/documents`,
    );
    return data;
  },

  async uploadDocument(
    projectId: string,
    file: File,
    description?: string,
  ): Promise<BcfDocument> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    if (description && description.trim()) {
      formData.append('description', description.trim());
    }

    const { data } = await apiClient.post<BcfDocument>(
      `${projectBcfBase(projectId)}/documents`,
      formData,
      { timeout: 180000 },
    );
    return data;
  },

  async downloadDocument(
    projectId: string,
    documentGuid: string,
    fallbackFilename: string,
    openInNewTab = false,
  ): Promise<void> {
    const response = await apiClient.get<Blob>(
      `${projectBcfBase(projectId)}/documents/${encodeURIComponent(documentGuid)}`,
      {
        responseType: 'blob',
        timeout: 180000,
      },
    );

    const disposition = response.headers['content-disposition'] as
      | string
      | undefined;
    const filename = parseContentDispositionFilename(
      disposition,
      fallbackFilename || `documento-${documentGuid.slice(0, 8)}`,
    );

    const blobUrl = URL.createObjectURL(response.data);
    if (openInNewTab) {
      const opened = window.open(blobUrl, '_blank', 'noopener,noreferrer');
      if (opened) {
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        return;
      }
    }

    try {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    }
  },

  async getTopicFiles(
    projectId: string,
    topicId: string,
  ): Promise<BcfHeaderFile[]> {
    const { data } = await apiClient.get<BcfHeaderFile[]>(
      `${topicBase(projectId, topicId)}/files`,
    );
    return data;
  },

  async putTopicFiles(
    projectId: string,
    topicId: string,
    files: BcfHeaderFile[],
  ): Promise<BcfHeaderFile[]> {
    const { data } = await apiClient.put<BcfHeaderFile[]>(
      `${topicBase(projectId, topicId)}/files`,
      { files },
    );
    return data;
  },

  async getRelatedTopics(
    projectId: string,
    topicId: string,
  ): Promise<BcfRelatedTopic[]> {
    const { data } = await apiClient.get<BcfRelatedTopic[]>(
      `${topicBase(projectId, topicId)}/related_topics`,
    );
    return data;
  },

  async putRelatedTopics(
    projectId: string,
    topicId: string,
    relatedTopics: BcfRelatedTopic[],
  ): Promise<BcfRelatedTopic[]> {
    const { data } = await apiClient.put<BcfRelatedTopic[]>(
      `${topicBase(projectId, topicId)}/related_topics`,
      { related_topics: relatedTopics },
    );
    return data;
  },

  async getDocumentReferences(
    projectId: string,
    topicId: string,
  ): Promise<BcfDocumentReference[]> {
    const { data } = await apiClient.get<BcfDocumentReference[]>(
      `${topicBase(projectId, topicId)}/document_references`,
    );
    return data;
  },

  async createDocumentReference(
    projectId: string,
    topicId: string,
    payload: CreateDocumentReferencePayload,
  ): Promise<BcfDocumentReference> {
    // Enforce BCF 3.0 XOR rule: send document_guid OR url, never both
    const body: Record<string, string> = {};
    if ('document_guid' in payload && payload.document_guid) {
      body.document_guid = payload.document_guid;
    } else if ('url' in payload && payload.url) {
      body.url = payload.url;
    }
    if (payload.description && payload.description.trim()) {
      body.description = payload.description.trim();
    }

    const { data } = await apiClient.post<BcfDocumentReference>(
      `${topicBase(projectId, topicId)}/document_references`,
      body,
    );
    return data;
  },

  async updateDocumentReference(
    projectId: string,
    topicId: string,
    docRefGuid: string,
    payload: UpdateDocumentReferencePayload,
  ): Promise<BcfDocumentReference> {
    const body: Record<string, string> = {};
    if ('document_guid' in payload && payload.document_guid) {
      body.document_guid = payload.document_guid;
    } else if ('url' in payload && payload.url) {
      body.url = payload.url;
    }
    if (payload.description && payload.description.trim()) {
      body.description = payload.description.trim();
    }

    const { data } = await apiClient.put<BcfDocumentReference>(
      `${topicBase(projectId, topicId)}/document_references/${encodeURIComponent(docRefGuid)}`,
      body,
    );
    return data;
  },

  async deleteDocumentReference(
    projectId: string,
    topicId: string,
    docRefGuid: string,
  ): Promise<void> {
    await apiClient.delete(
      `${topicBase(projectId, topicId)}/document_references/${encodeURIComponent(docRefGuid)}`,
    );
  },

  async getBimSnippet(
    projectId: string,
    topicId: string,
  ): Promise<BcfBimSnippet | null> {
    const { data } = await apiClient.get<BcfBimSnippet | null>(
      `${topicBase(projectId, topicId)}/bim_snippet`,
    );
    return data;
  },

  async putBimSnippet(
    projectId: string,
    topicId: string,
    payload: BcfBimSnippet,
  ): Promise<BcfBimSnippet> {
    const { data } = await apiClient.put<BcfBimSnippet>(
      `${topicBase(projectId, topicId)}/bim_snippet`,
      payload,
    );
    return data;
  },

  async deleteBimSnippet(
    projectId: string,
    topicId: string,
  ): Promise<DeleteBimSnippetResponse> {
    const { data } = await apiClient.delete<DeleteBimSnippetResponse>(
      `${topicBase(projectId, topicId)}/bim_snippet`,
    );
    return data;
  },

  // ---------------------------------------------------------------------------
  // Comments CRUD
  // ---------------------------------------------------------------------------
  async getComments(projectId: string, topicId: string): Promise<BcfComment[]> {
    const { data } = await apiClient.get<BcfComment[]>(
      `${topicBase(projectId, topicId)}/comments`,
    );
    return data;
  },

  async getComment(
    projectId: string,
    topicId: string,
    commentId: string,
  ): Promise<BcfComment> {
    const { data } = await apiClient.get<BcfComment>(
      `${topicBase(projectId, topicId)}/comments/${encodeURIComponent(commentId)}`,
    );
    return data;
  },

  async createComment(
    projectId: string,
    topicId: string,
    payload: CreateCommentPayload,
  ): Promise<BcfComment> {
    const body: CreateCommentPayload = {};
    if (payload.comment && payload.comment.trim()) {
      body.comment = payload.comment.trim();
    }
    if (payload.viewpoint_guid) {
      body.viewpoint_guid = payload.viewpoint_guid;
    }

    const { data } = await apiClient.post<BcfComment>(
      `${topicBase(projectId, topicId)}/comments`,
      body,
    );
    return data;
  },

  async putComment(
    projectId: string,
    topicId: string,
    commentId: string,
    payload: UpdateCommentPayload,
  ): Promise<BcfComment> {
    const { data } = await apiClient.put<BcfComment>(
      `${topicBase(projectId, topicId)}/comments/${encodeURIComponent(commentId)}`,
      payload,
    );
    return data;
  },

  async patchComment(
    projectId: string,
    topicId: string,
    commentId: string,
    payload: UpdateCommentPayload,
  ): Promise<BcfComment> {
    const { data } = await apiClient.patch<BcfComment>(
      `${topicBase(projectId, topicId)}/comments/${encodeURIComponent(commentId)}`,
      payload,
    );
    return data;
  },

  async deleteComment(
    projectId: string,
    topicId: string,
    commentId: string,
  ): Promise<void> {
    await apiClient.delete(
      `${topicBase(projectId, topicId)}/comments/${encodeURIComponent(commentId)}`,
    );
  },

  // ---------------------------------------------------------------------------
  // Viewpoints & Authenticated Snapshot Media
  // ---------------------------------------------------------------------------
  async getViewpoints(
    projectId: string,
    topicId: string,
  ): Promise<BcfViewpoint[]> {
    const { data } = await apiClient.get<BcfViewpoint[]>(
      `${topicBase(projectId, topicId)}/viewpoints`,
    );
    return data;
  },

  async getViewpoint(
    projectId: string,
    topicId: string,
    viewpointId: string,
  ): Promise<BcfViewpoint> {
    const { data } = await apiClient.get<BcfViewpoint>(
      `${topicBase(projectId, topicId)}/viewpoints/${encodeURIComponent(viewpointId)}`,
    );
    return data;
  },

  async createViewpoint(
    projectId: string,
    topicId: string,
    payload: CreateViewpointPayload,
  ): Promise<BcfViewpoint> {
    const url = `${topicBase(projectId, topicId)}/viewpoints`;

    // Prefer application/json whenever total serialized payload fits under Express's 100KB default limit,
    // ensuring camera_data / perspective_camera / orthogonal_camera / components are parsed as native objects.
    if (!payload.snapshotFile) {
      const jsonPayload: Omit<CreateViewpointPayload, 'snapshotFile'> & {
        snapshotFile?: File | Blob;
      } = { ...payload };
      delete jsonPayload.snapshotFile;

      const serializedLength = JSON.stringify(jsonPayload).length;
      if (serializedLength <= 96000) {
        const { data } = await apiClient.post<BcfViewpoint>(url, jsonPayload, {
          timeout: 90000,
        });
        return data;
      }

      // If large component exception arrays push JSON over 96KB, trim exceptions to fit JSON first
      if (jsonPayload.components?.visibility?.exceptions) {
        const compactPayload: typeof jsonPayload = {
          ...jsonPayload,
          components: {
            ...jsonPayload.components,
            visibility: {
              default_visibility:
                jsonPayload.components.visibility.default_visibility,
            },
          },
        };
        if (JSON.stringify(compactPayload).length <= 96000) {
          const { data } = await apiClient.post<BcfViewpoint>(
            url,
            compactPayload,
            { timeout: 90000 },
          );
          return data;
        }
      }
    }

    let binarySnapshot: File | Blob | undefined = payload.snapshotFile;
    let snapshotExt = 'jpg';
    if (!binarySnapshot && payload.snapshot?.snapshot_data) {
      try {
        const converted = dataUrlOrBase64ToBlob(
          payload.snapshot.snapshot_data,
          payload.snapshot.snapshot_type || 'jpg',
        );
        binarySnapshot = converted.blob;
        snapshotExt = converted.ext;
      } catch {
        // Fallback to JSON below
      }
    }

    if (binarySnapshot) {
      const formData = new FormData();
      const filename =
        binarySnapshot instanceof File
          ? binarySnapshot.name
          : `snapshot-${Date.now()}.${snapshotExt}`;
      formData.append('snapshot', binarySnapshot, filename);

      if (payload.index !== undefined) {
        formData.append('index', String(payload.index));
      }
      if (payload.camera_type) {
        formData.append('camera_type', payload.camera_type);
      }
      if (payload.camera_data) {
        formData.append('camera_data', JSON.stringify(payload.camera_data));
      }
      if (payload.perspective_camera) {
        formData.append(
          'perspective_camera',
          JSON.stringify(payload.perspective_camera),
        );
      }
      if (payload.orthogonal_camera) {
        formData.append(
          'orthogonal_camera',
          JSON.stringify(payload.orthogonal_camera),
        );
      }
      if (payload.camera) {
        formData.append('camera', JSON.stringify(payload.camera));
      }
      if (payload.components) {
        formData.append('components', JSON.stringify(payload.components));
      }
      if (payload.lines?.length) {
        formData.append('lines', JSON.stringify(payload.lines));
      }
      if (payload.clipping_planes?.length) {
        formData.append(
          'clipping_planes',
          JSON.stringify(payload.clipping_planes),
        );
      }
      if (payload.bitmaps?.length) {
        formData.append('bitmaps', JSON.stringify(payload.bitmaps));
      }

      const { data } = await apiClient.post<BcfViewpoint>(url, formData, {
        timeout: 90000,
      });
      return data;
    }

    const jsonPayload: Omit<CreateViewpointPayload, 'snapshotFile'> & {
      snapshotFile?: File | Blob;
    } = { ...payload };
    delete jsonPayload.snapshotFile;
    const { data } = await apiClient.post<BcfViewpoint>(url, jsonPayload, {
      timeout: 90000,
    });
    return data;
  },

  async deleteViewpoint(
    projectId: string,
    topicId: string,
    viewpointId: string,
  ): Promise<DeleteViewpointResponse> {
    const { data } = await apiClient.delete<DeleteViewpointResponse>(
      `${topicBase(projectId, topicId)}/viewpoints/${encodeURIComponent(viewpointId)}`,
    );
    return data;
  },

  async exportViewpointVisinfoXml(
    projectId: string,
    topicId: string,
    viewpointId: string,
  ): Promise<string> {
    const { data } = await apiClient.get<string>(
      `${topicBase(projectId, topicId)}/viewpoints/${encodeURIComponent(viewpointId)}/visinfo`,
      { responseType: 'text' },
    );
    return data;
  },

  resolveTopicThumbnailPath(
    projectId: string,
    topic: Pick<
      BcfTopic,
      | 'guid'
      | 'thumbnail_url'
      | 'default_viewpoint_guid'
      | 'default_snapshot_file_id'
    >,
  ): string | null {
    if (topic.thumbnail_url) {
      return normalizeApiPath(topic.thumbnail_url);
    }
    if (topic.default_viewpoint_guid) {
      return `${topicBase(projectId, topic.guid)}/viewpoints/${encodeURIComponent(topic.default_viewpoint_guid)}/snapshot`;
    }
    if (topic.default_snapshot_file_id) {
      return `/projects/${encodeURIComponent(projectId)}/bcf/images/${encodeURIComponent(topic.default_snapshot_file_id)}`;
    }
    return null;
  },

  resolveViewpointSnapshotPath(
    projectId: string,
    topicId: string,
    viewpoint: BcfViewpoint,
  ): string | null {
    if (viewpoint.snapshot?.snapshot_data) {
      const fmt = viewpoint.snapshot.snapshot_type || 'png';
      return viewpoint.snapshot.snapshot_data.startsWith('data:')
        ? viewpoint.snapshot.snapshot_data
        : `data:image/${fmt};base64,${viewpoint.snapshot.snapshot_data}`;
    }

    const directUrl =
      viewpoint.snapshotUrl ||
      viewpoint.snapshot_url ||
      viewpoint.snapshot?.snapshot_url;
    if (directUrl) {
      return normalizeApiPath(directUrl);
    }

    if (viewpoint.guid) {
      return `${topicBase(projectId, topicId)}/viewpoints/${encodeURIComponent(viewpoint.guid)}/snapshot`;
    }

    const fileId =
      viewpoint.snapshot?.snapshot_file_id ||
      viewpoint.snapshot?.snapshotFileId ||
      viewpoint.snapshot_file_id ||
      viewpoint.snapshotFileId;
    if (fileId) {
      return `/projects/${encodeURIComponent(projectId)}/bcf/images/${encodeURIComponent(fileId)}`;
    }

    return null;
  },

  async fetchViewpointSnapshotBlobUrl(
    projectId: string,
    topicId: string,
    viewpointId: string,
  ): Promise<string> {
    return fetchAuthenticatedBlobUrl(
      `${topicBase(projectId, topicId)}/viewpoints/${encodeURIComponent(viewpointId)}/snapshot`,
    );
  },
};

export default bcfService;
