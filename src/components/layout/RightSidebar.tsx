import React, { useState } from 'react';
import { PropertiesInspector } from '../inspector/PropertiesInspector';
import { BcfIssuesPanel } from '../bcf/BcfIssuesPanel';
import { ResizableSidebar } from './ResizableSidebar';

export const RightSidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inspector' | 'bcf'>('inspector');

  return (
    <ResizableSidebar
      side="right"
      storageKey="pavabim_right_sidebar_width"
      ariaLabel="Ajustar ancho del panel derecho"
    >
      <div className="h-10 border-b border-asphalt-700 flex items-center px-2 bg-asphalt-950 space-x-1">
        <button
          onClick={() => setActiveTab('inspector')}
          className={`flex-1 py-1.5 text-xs font-medium text-center rounded transition-colors ${
            activeTab === 'inspector'
              ? 'bg-pavasal-500 text-asphalt-950 font-semibold shadow-sm'
              : 'text-asphalt-300 hover:text-white hover:bg-asphalt-800'
          }`}
        >
          Propiedades
        </button>
        <button
          onClick={() => setActiveTab('bcf')}
          className={`flex-1 py-1.5 text-xs font-medium text-center rounded transition-colors ${
            activeTab === 'bcf'
              ? 'bg-pavasal-500 text-asphalt-950 font-semibold shadow-sm'
              : 'text-asphalt-300 hover:text-white hover:bg-asphalt-800'
          }`}
        >
          BCF 3.0
        </button>
      </div>

      <div className="flex-1 p-3 overflow-y-auto">
        {activeTab === 'inspector' ? <PropertiesInspector /> : <BcfIssuesPanel />}
      </div>
    </ResizableSidebar>
  );
};

export default RightSidebar;
