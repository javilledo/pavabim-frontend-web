import React, { useState } from 'react';
import { SpatialTreePanel } from '../tree/SpatialTreePanel';
import { ModelsPanel } from '../tree/ModelsPanel';
import { ResizableSidebar } from './ResizableSidebar';

export const LeftSidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'models' | 'tree'>('models');

  return (
    <ResizableSidebar
      side="left"
      storageKey="pavabim_left_sidebar_width"
      ariaLabel="Ajustar ancho del panel izquierdo"
    >
      <div className="h-10 border-b border-asphalt-700 flex items-center px-2 bg-asphalt-950 space-x-1">
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
      </div>

      <div className="flex-1 p-3 overflow-y-auto">
        {activeTab === 'models' ? <ModelsPanel /> : <SpatialTreePanel />}
      </div>
    </ResizableSidebar>
  );
};

export default LeftSidebar;
