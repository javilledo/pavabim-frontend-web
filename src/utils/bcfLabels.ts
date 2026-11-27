export const PAVABIM_DISCIPLINE_LABELS: readonly string[] = [
  'Existente',
  'Cimentaciones',
  'Estructura Prefabricada',
  'Estructura de Hormigón in Situ',
  'Estructura Metálica',
  'Arquitectura',
  'Cubierta',
  'Muros',
  'Clima',
  'Electricidad',
  'Estanterías',
  'Pluviales',
  'Saneamiento',
  'PCI',
  'Solera',
  'Señalización',
  'Agua Potable',
  'CCTV',
  'Teleco',
  'Urbanización',
  'Otros',
];

const TOPIC_TYPE_LABELS: Record<string, string> = {
  clash: 'Interferencia',
  error: 'Error',
  request: 'Solicitud',
  issue: 'Incidencia',
  inquiry: 'Consulta',
  warning: 'Advertencia',
  info: 'Información',
  remark: 'Comentario',
};

const TOPIC_STATUS_LABELS: Record<string, string> = {
  open: 'Abierto',
  'in progress': 'En proceso',
  in_progress: 'En proceso',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};

const TOPIC_STAGE_LABELS: Record<string, string> = {
  design: 'Diseño',
  'pre-construction': 'Preconstrucción',
  preconstruction: 'Preconstrucción',
  coordination: 'Coordinación',
  construction: 'Construcción',
  handover: 'Entrega',
  'as-built': 'As-Built',
  asbuilt: 'As-Built',
};

const TOPIC_PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja',
  normal: 'Normal',
  medium: 'Normal',
  high: 'Alta',
  critical: 'Crítica',
};

export function translateTopicType(value?: string | null): string {
  if (!value) return '';
  const key = value.trim().toLowerCase();
  return TOPIC_TYPE_LABELS[key] ?? value;
}

export function isForbiddenTopicStatus(value?: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  return normalized === 'reopen' || normalized === 'reopened';
}

export function filterAllowedTopicStatuses(statuses: string[]): string[] {
  return statuses.filter((s) => !isForbiddenTopicStatus(s));
}

export function translateTopicStatus(value?: string | null): string {
  if (!value) return '';
  const key = value.trim().toLowerCase();
  return TOPIC_STATUS_LABELS[key] ?? value;
}

export function translateTopicStage(value?: string | null): string {
  if (!value) return '';
  const key = value.trim().toLowerCase();
  return TOPIC_STAGE_LABELS[key] ?? value;
}

export function translateTopicPriority(value?: string | null): string {
  if (!value) return '';
  const key = value.trim().toLowerCase();
  return TOPIC_PRIORITY_LABELS[key] ?? value;
}

export function hasAllPavabimDisciplines(currentLabels?: string[]): boolean {
  if (!currentLabels || currentLabels.length !== PAVABIM_DISCIPLINE_LABELS.length) {
    return false;
  }
  const set = new Set(currentLabels);
  return PAVABIM_DISCIPLINE_LABELS.every((lbl) => set.has(lbl));
}
