import React from 'react';
import { useAutoConvertProjectModels } from '../../hooks/useAutoConvertProjectModels';
import { useBcfScenePins } from '../../hooks/useBcfScenePins';
import { useColorByParameterSync } from '../../hooks/useColorByParameterSync';
import { RibbonToolbar } from './RibbonToolbar';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { ViewerCanvas } from '../../viewer/ViewerCanvas';

export const MainLayout: React.FC = () => {
  useAutoConvertProjectModels();
  useColorByParameterSync();
  useBcfScenePins();

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-asphalt-950 text-asphalt-50">
      {/* Top Ribbon Toolbar */}
      <RibbonToolbar />

      {/* Main Workspace: Left Sidebar + Center 3D Viewer Canvas + Right Sidebar */}
      <div className="flex-1 flex overflow-hidden relative">
        <LeftSidebar />

        <main className="flex-1 min-w-0 relative h-full overflow-hidden">
          <ViewerCanvas />
        </main>

        <RightSidebar />
      </div>
    </div>
  );
};

export default MainLayout;
