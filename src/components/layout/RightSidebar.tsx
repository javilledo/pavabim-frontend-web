import React, { useState } from 'react';
import { PropertiesInspector } from '../inspector/PropertiesInspector';
import { BcfIssuesPanel } from '../bcf/BcfIssuesPanel';

export const RightSidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inspector' | 'bcf'>('inspector');

  return (
    <aside className="w-[300px] flex-shrink-0 bg-asphalt-900 text-asphalt-100 border-l border-asphalt-700 flex flex-col select-none">
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
    </aside>
  );
};

export default RightSidebar;
