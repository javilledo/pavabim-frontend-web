import React from 'react';
import { useViewerStore } from '../../store/useViewerStore';
import { BcfIssuesPanel } from '../bcf/BcfIssuesPanel';
import { MeasurementsPanel } from '../inspector/MeasurementsPanel';
import { PropertiesInspector } from '../inspector/PropertiesInspector';
import { ResizableSidebar } from './ResizableSidebar';

export const RightSidebar: React.FC = () => {
  const {
    rightSidebarTab: activeTab,
    isRightSidebarCollapsed,
    setRightSidebarTab: setActiveTab,
    toggleRightSidebarCollapsed,
  } = useViewerStore();

  const tabButtonClass = (isActive: boolean) =>
    `flex-1 py-1.5 px-1.5 text-[11px] font-medium text-center rounded transition-colors truncate ${
      isActive
        ? 'bg-pavasal-500 text-asphalt-950 font-semibold shadow-sm'
        : 'text-asphalt-300 hover:text-white hover:bg-asphalt-800'
    }`;

  if (isRightSidebarCollapsed) {
    return (
      <aside
        aria-label="Panel lateral derecho contraído"
        className="w-9 flex-shrink-0 bg-asphalt-950 border-l border-asphalt-700 flex flex-col items-center py-2 gap-2 select-none"
      >
        <button
          type="button"
          onClick={toggleRightSidebarCollapsed}
          className="p-1.5 rounded text-asphalt-300 hover:text-pavasal-400 hover:bg-asphalt-800 transition-colors"
          title="Expandir panel derecho"
          aria-label="Expandir panel derecho"
        >
          ⇤
        </button>

        <div className="w-5 h-px bg-asphalt-800" />

        <button
          type="button"
          onClick={() => setActiveTab('inspector')}
          className={`p-1.5 rounded text-xs transition-colors ${
            activeTab === 'inspector'
              ? 'bg-pavasal-500/20 text-pavasal-400'
              : 'text-asphalt-400 hover:text-asphalt-100 hover:bg-asphalt-800'
          }`}
          title="Abrir Propiedades"
          aria-label="Propiedades"
        >
          ⓘ
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('measurements')}
          className={`p-1.5 rounded text-xs transition-colors ${
            activeTab === 'measurements'
              ? 'bg-pavasal-500/20 text-pavasal-400'
              : 'text-asphalt-400 hover:text-asphalt-100 hover:bg-asphalt-800'
          }`}
          title="Abrir Mediciones"
          aria-label="Mediciones"
        >
          📏
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('bcf')}
          className={`p-1.5 rounded text-xs transition-colors ${
            activeTab === 'bcf'
              ? 'bg-pavasal-500/20 text-pavasal-400'
              : 'text-asphalt-400 hover:text-asphalt-100 hover:bg-asphalt-800'
          }`}
          title="Abrir Tópicos"
          aria-label="Tópicos"
        >
          📌
        </button>
      </aside>
    );
  }

  return (
    <ResizableSidebar
      side="right"
      storageKey="pavabim_right_sidebar_width"
      defaultWidth={340}
      ariaLabel="Ajustar ancho del panel derecho"
    >
      <div className="h-10 border-b border-asphalt-700 flex items-center px-2 bg-asphalt-950 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('inspector')}
          className={tabButtonClass(activeTab === 'inspector')}
        >
          Propiedades
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('measurements')}
          className={tabButtonClass(activeTab === 'measurements')}
        >
          Mediciones
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('bcf')}
          className={tabButtonClass(activeTab === 'bcf')}
          title="Gestión de Tópicos"
        >
          Tópicos
        </button>

        <button
          type="button"
          onClick={toggleRightSidebarCollapsed}
          className="px-1.5 py-1 rounded text-xs text-asphalt-400 hover:text-pavasal-400 hover:bg-asphalt-800 transition-colors shrink-0"
          title="Colapsar panel lateral derecho"
          aria-label="Colapsar panel derecho"
        >
          ⇥
        </button>
      </div>

      <div className="flex-1 p-3 overflow-y-auto">
        {activeTab === 'inspector' ? (
          <PropertiesInspector />
        ) : activeTab === 'measurements' ? (
          <MeasurementsPanel />
        ) : (
          <BcfIssuesPanel />
        )}
      </div>
    </ResizableSidebar>
  );
};

export default RightSidebar;
