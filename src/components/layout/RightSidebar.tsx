import React, { useState } from 'react';
import { BcfIssuesPanel } from '../bcf/BcfIssuesPanel';
import { MeasurementsPanel } from '../inspector/MeasurementsPanel';
import { PropertiesInspector } from '../inspector/PropertiesInspector';
import { ResizableSidebar } from './ResizableSidebar';

export const RightSidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'inspector' | 'measurements' | 'bcf'
  >('inspector');

  const tabButtonClass = (isActive: boolean) =>
    `flex-1 py-1.5 px-1.5 text-[11px] font-medium text-center rounded transition-colors truncate ${
      isActive
        ? 'bg-pavasal-500 text-asphalt-950 font-semibold shadow-sm'
        : 'text-asphalt-300 hover:text-white hover:bg-asphalt-800'
    }`;

  return (
    <ResizableSidebar
      side="right"
      storageKey="pavabim_right_sidebar_width"
      ariaLabel="Ajustar ancho del panel derecho"
    >
      <div className="h-10 border-b border-asphalt-700 flex items-center px-2 bg-asphalt-950 space-x-1">
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
        >
          Incidencias
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
