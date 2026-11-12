import React, { useState } from 'react';
import { SpatialTreePanel } from '../tree/SpatialTreePanel';
import { ModelsPanel } from '../tree/ModelsPanel';
import { ResizableSidebar } from './ResizableSidebar';

export const LeftSidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tree' | 'models'>('tree');

  return (
    <ResizableSidebar
      side="left"
      storageKey="pavabim_left_sidebar_width"
      ariaLabel="Ajustar ancho del panel izquierdo"
    >
      <div className="h-10 border-b border-asphalt-700 flex items-center px-2 bg-asphalt-950 space-x-1">
        <button
          onClick={() => setActiveTab('tree')}
          className={`flex-1 py-1.5 text-xs font-medium text-center rounded transition-colors ${
            activeTab === 'tree'
              ? 'bg-pavasal-500 text-asphalt-950 font-semibold shadow-sm'
              : 'text-asphalt-300 hover:text-white hover:bg-asphalt-800'
          }`}
        >
          Árbol Espacial
        </button>
        <button
          onClick={() => setActiveTab('models')}
          className={`flex-1 py-1.5 text-xs font-medium text-center rounded transition-colors ${
            activeTab === 'models'
              ? 'bg-pavasal-500 text-asphalt-950 font-semibold shadow-sm'
              : 'text-asphalt-300 hover:text-white hover:bg-asphalt-800'
          }`}
        >
          Modelos
        </button>
      </div>

      <div className="flex-1 p-3 overflow-y-auto">
        {activeTab === 'tree' ? <SpatialTreePanel /> : <ModelsPanel />}
      </div>
    </ResizableSidebar>
  );
};

export default LeftSidebar;
