import React, { useState } from 'react';
import { SpatialTreePanel } from '../tree/SpatialTreePanel';
import { ModelsPanel } from '../tree/ModelsPanel';

export const LeftSidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tree' | 'models'>('tree');

  return (
    <aside className="w-[300px] flex-shrink-0 bg-asphalt-900 text-asphalt-100 border-r border-asphalt-700 flex flex-col select-none">
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
    </aside>
  );
};

export default LeftSidebar;
