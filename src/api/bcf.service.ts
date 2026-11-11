import apiClient, { fetchAuthenticatedBlobUrl } from './client';
import type {
  AssignTopicPayload,
  BcfBimSnippet,
  BcfComment,
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
  return `/projects/${encodeURIComponent(projectId)}/bcf`;
}

function topicBase(projectId: string, topicId: string): string {
  return `${projectBcfBase(projectId)}/topics/${encodeURIComponent(topicId)}`;
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
  // Stats, Events, Bulk Update
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

  // ---------------------------------------------------------------------------
  // Topics CRUD & Actions
  // ---------------------------------------------------------------------------
  async getTopics(
    projectId: string,
    params?: QueryTopicsParams,
  ): Promise<BcfTopic[]> {
    const { data } = await apiClient.get<BcfTopic[]>(
      `${projectBcfBase(projectId)}/topics`,
      { params },
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
    const { data } = await apiClient.post<BcfTopic>(
      `${projectBcfBase(projectId)}/topics`,
      payload,
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
      `${topicBase(projectId, topicId)}/status`,
      payload,
    );
    return data;
  },

  async assignTopic(
    projectId: string,
    topicId: string,
    payload: AssignTopicPayload,
  ): Promise<BcfTopic> {
    const { data } = await apiClient.patch<BcfTopic>(
      `${topicBase(projectId, topicId)}/assign`,
      payload,
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
  // Topic Sub-Resources: Files, Related Topics, Document References, BIM Snippet
  // ---------------------------------------------------------------------------
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
    const { data } = await apiClient.post<BcfDocumentReference>(
      `${topicBase(projectId, topicId)}/document_references`,
      payload,
    );
    return data;
  },

  async updateDocumentReference(
    projectId: string,
    topicId: string,
    docRefGuid: string,
    payload: UpdateDocumentReferencePayload,
  ): Promise<BcfDocumentReference> {
    const { data } = await apiClient.put<BcfDocumentReference>(
      `${topicBase(projectId, topicId)}/document_references/${encodeURIComponent(docRefGuid)}`,
      payload,
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
    const { data } = await apiClient.post<BcfComment>(
      `${topicBase(projectId, topicId)}/comments`,
      payload,
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

    if (payload.snapshotFile) {
      const formData = new FormData();
      const file = payload.snapshotFile;
      const filename =
        file instanceof File ? file.name : `snapshot-${Date.now()}.png`;
      formData.append('snapshot', file, filename);

      if (payload.index !== undefined) {
        formData.append('index', String(payload.index));
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
      return directUrl;
    }

    const fileId =
      viewpoint.snapshot?.snapshot_file_id ||
      viewpoint.snapshot?.snapshotFileId ||
      viewpoint.snapshot_file_id ||
      viewpoint.snapshotFileId;
    if (fileId) {
      return `${projectBcfBase(projectId)}/images/${encodeURIComponent(fileId)}`;
    }

    if (viewpoint.guid) {
      return `${topicBase(projectId, topicId)}/viewpoints/${encodeURIComponent(viewpoint.guid)}/snapshot`;
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

  async fetchImageBlobUrl(projectId: string, fileId: string): Promise<string> {
    return fetchAuthenticatedBlobUrl(
      `${projectBcfBase(projectId)}/images/${encodeURIComponent(fileId)}`,
    );
  },
};

export default bcfService;
