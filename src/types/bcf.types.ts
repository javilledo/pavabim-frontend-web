export interface CameraViewpointData {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
}

export interface BcfPoint3D {
  x: number;
  y: number;
  z: number;
}

export interface BcfDirection3D {
  x: number;
  y: number;
  z: number;
}

export interface BcfOrthogonalCamera {
  camera_view_point: BcfPoint3D;
  camera_direction: BcfDirection3D;
  camera_up_vector: BcfDirection3D;
  view_to_world_scale: number;
  aspect_ratio?: number;
}

export interface BcfPerspectiveCamera {
  camera_view_point: BcfPoint3D;
  camera_direction: BcfDirection3D;
  camera_up_vector: BcfDirection3D;
  field_of_view: number;
  aspect_ratio?: number;
}

export interface BcfLegacyCamera {
  position: BcfPoint3D;
  target: BcfPoint3D;
  up?: BcfDirection3D;
  fov?: number;
  isPerspective?: boolean;
}

export interface BcfLine {
  start_point: BcfPoint3D;
  end_point: BcfPoint3D;
}

export interface BcfClippingPlane {
  location: BcfPoint3D;
  direction: BcfDirection3D;
}

export type BcfBitmapFormat = 'png' | 'jpg' | 'PNG' | 'JPG' | string;

export interface BcfBitmap {
  guid?: string;
  bitmap_type: BcfBitmapFormat;
  bitmap_data?: string;
  snapshot_file_id?: string;
  location: BcfPoint3D;
  normal: BcfDirection3D;
  up: BcfDirection3D;
  height: number;
}

export interface BcfComponent {
  ifc_guid?: string;
  originating_system?: string;
  authoring_tool_id?: string;
}

export interface BcfComponentColoring {
  color: string;
  components: BcfComponent[];
}

export interface BcfViewSetupHints {
  spaces_visible?: boolean;
  space_boundaries_visible?: boolean;
  openings_visible?: boolean;
}

export interface BcfComponentVisibility {
  default_visibility?: boolean;
  exceptions?: BcfComponent[];
  view_setup_hints?: BcfViewSetupHints;
}

export interface BcfComponents {
  selection?: BcfComponent[];
  coloring?: BcfComponentColoring[];
  visibility?: BcfComponentVisibility;
}

export interface BcfSnapshot {
  snapshot_type?: BcfBitmapFormat;
  snapshot_data?: string;
  snapshot_file_id?: string;
  snapshot_url?: string;
  snapshotFileId?: string;
}

export interface BcfViewpointAuthorization {
  viewpoint_actions?: string[];
}

export interface BcfViewpoint {
  guid: string;
  index?: number;
  orthogonal_camera?: BcfOrthogonalCamera | null;
  perspective_camera?: BcfPerspectiveCamera | null;
  camera?: BcfLegacyCamera;
  lines?: BcfLine[];
  clipping_planes?: BcfClippingPlane[];
  bitmaps?: BcfBitmap[];
  snapshot?: BcfSnapshot;
  snapshot_file_id?: string;
  snapshot_url?: string;
  snapshotFileId?: string;
  snapshotUrl?: string;
  components?: BcfComponents;
  creation_date?: string;
  creation_author?: string;
  creation_author_uid?: string;
  authorization?: BcfViewpointAuthorization;
}

export interface BcfCommentAuthorization {
  comment_actions?: string[];
}

export interface BcfComment {
  guid: string;
  topic_guid: string;
  date: string;
  author: string;
  author_uid?: string;
  comment: string;
  viewpoint_guid?: string;
  modified_date?: string;
  modified_author?: string;
  modified_author_uid?: string;
  deleted?: boolean;
  authorization?: BcfCommentAuthorization;
}

export interface BcfBimSnippet {
  snippet_type: string;
  is_external: boolean;
  reference: string;
  reference_schema: string;
}

export interface BcfDocumentReference {
  guid: string;
  document_guid?: string;
  url?: string;
  description?: string;
}

export interface BcfRelatedTopic {
  related_topic_guid: string;
}

export interface BcfHeaderFile {
  ifc_project?: string;
  ifc_spatial_structure_element?: string;
  filename?: string;
  date?: string;
  reference?: string;
  is_external?: boolean;
}

export interface BcfEventAction {
  type: string;
  value?: string;
}

export interface BcfTopicEvent {
  topic_guid: string;
  date: string;
  author: string;
  events: BcfEventAction[];
  comment_guid?: string;
  comment?: string;
}

export interface BcfTopicAuthorization {
  topic_actions?: string[];
  topic_status?: string[];
}

export interface BcfTopic {
  guid: string;
  server_assigned_id?: string;
  topic_type: string;
  topic_status: string;
  title: string;
  priority?: string;
  index?: number;
  labels?: string[];
  creation_date: string;
  creation_author: string;
  creation_author_uid?: string;
  modified_date?: string;
  modified_author?: string;
  assigned_to?: string;
  stage?: string;
  description?: string;
  due_date?: string;
  reference_links?: string[];
  bim_snippet?: BcfBimSnippet;
  header_files?: BcfHeaderFile[];
  related_topics?: BcfRelatedTopic[];
  document_references?: BcfDocumentReference[];
  deleted?: boolean;
  deleted_date?: string;
  deleted_at?: string;
  deleted_by?: string;
  default_viewpoint_guid?: string;
  default_snapshot_file_id?: string;
  comments_count?: number;
  viewpoints_count?: number;
  comments?: BcfComment[];
  viewpoints?: BcfViewpoint[];
  authorization?: BcfTopicAuthorization;
}

export interface DeleteTopicResponse {
  success: boolean;
  guid: string;
  mode: 'soft-delete' | 'permanent-delete';
  note?: string;
}

export interface DeleteViewpointResponse {
  success: boolean;
  removedViewpointGuid: string;
}

export interface DeleteBimSnippetResponse {
  success: boolean;
  deleted?: boolean;
}

export interface BcfTopicStats {
  projectId: string;
  total: number;
  overdueCount: number;
  unassignedCount: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
  byStage: Record<string, number>;
  byAssignee: Record<string, number>;
  byLabel: Record<string, number>;
}

export interface BcfProjectExtensions {
  topic_type: string[];
  topic_status: string[];
  topic_label: string[];
  snippet_type: string[];
  priority: string[];
  user_id_type: string[];
  stage: string[];
  project_actions?: string[];
  topic_actions?: string[];
  comment_actions?: string[];
  enforce_extensions?: boolean;
}

export type UpdateExtensionsPayload = Partial<
  Pick<
    BcfProjectExtensions,
    | 'topic_type'
    | 'topic_status'
    | 'topic_label'
    | 'snippet_type'
    | 'priority'
    | 'stage'
    | 'enforce_extensions'
  >
>;

export type BcfTopicSortField =
  | 'creation_date'
  | 'modified_date'
  | 'due_date'
  | 'index'
  | 'server_assigned_id'
  | 'title'
  | 'priority';

export interface QueryTopicsParams {
  search?: string;
  topic_status?: string;
  topic_type?: string;
  priority?: string;
  assigned_to?: string;
  stage?: string;
  labels?: string | string[];
  creation_author?: string;
  include_deleted?: boolean | 'true' | 'false';
  overdue?: boolean | 'true' | 'false';
  due_before?: string;
  due_after?: string;
  server_assigned_id?: string;
  includeAuthorization?: boolean | 'true' | 'false';
  includeDetails?: boolean | 'true' | 'false';
  sortBy?: BcfTopicSortField;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface QueryEventsParams {
  limit?: number;
  since?: string;
}

export interface CreateTopicPayload {
  title: string;
  topic_type?: string;
  topic_status?: string;
  priority?: string;
  index?: number;
  labels?: string[];
  assigned_to?: string;
  stage?: string;
  description?: string;
  due_date?: string;
  reference_links?: string[];
  bim_snippet?: BcfBimSnippet;
  header_files?: BcfHeaderFile[];
}

export interface PutTopicPayload {
  title: string;
  topic_type: string;
  topic_status: string;
  priority?: string;
  index?: number;
  labels?: string[];
  assigned_to?: string;
  stage?: string;
  description?: string;
  due_date?: string;
  reference_links?: string[];
  bim_snippet?: BcfBimSnippet;
  header_files?: BcfHeaderFile[];
}

export type PatchTopicPayload = Partial<PutTopicPayload>;

export interface UpdateTopicStatusPayload {
  topic_status: string;
  comment?: string;
}

export interface AssignTopicPayload {
  assigned_to?: string | null;
  comment?: string;
}

export interface BulkUpdateTopicsPayload {
  topic_guids: string[];
  topic_status?: string;
  priority?: string;
  assigned_to?: string;
  stage?: string;
  add_labels?: string[];
  remove_labels?: string[];
}

export interface BulkUpdateTopicsResponse {
  updated: number;
  failed?: Array<{ guid: string; error: string }>;
  topics?: BcfTopic[];
}

export interface CreateCommentPayload {
  comment: string;
  viewpoint_guid?: string;
}

export interface UpdateCommentPayload {
  comment?: string;
  viewpoint_guid?: string | null;
}

export interface CreateViewpointPayload {
  index?: number;
  orthogonal_camera?: BcfOrthogonalCamera | null;
  perspective_camera?: BcfPerspectiveCamera | null;
  camera?: BcfLegacyCamera;
  lines?: BcfLine[];
  clipping_planes?: BcfClippingPlane[];
  bitmaps?: BcfBitmap[];
  components?: BcfComponents;
  snapshot?: {
    snapshot_type?: BcfBitmapFormat;
    snapshot_data?: string;
  };
  snapshotFile?: File | Blob;
}

export interface CreateDocumentReferencePayload {
  document_guid?: string;
  url?: string;
  description?: string;
}

export type UpdateDocumentReferencePayload = CreateDocumentReferencePayload;
