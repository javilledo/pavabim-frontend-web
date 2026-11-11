import React, { useEffect, useRef, useState } from 'react';
import type * as FRAGS from '@thatopen/fragments';
import { useLocalFragUpload } from '../../hooks/useLocalFragUpload';
import { useViewerStore } from '../../store/useViewerStore';
import { useEngine } from '../../viewer/EngineContext';

interface TreeNodeProps {
  node: FRAGS.SpatialTreeItem;
  modelId: string;
  depth?: number;
  onSelectNode: (modelId: string, localId: number) => void;
  selectedElementId: string | null;
  selectedModelId: string | null;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  modelId,
  depth = 0,
  onSelectNode,
  selectedElementId,
  selectedModelId,
}) => {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isSelected =
    node.localId !== null &&
    selectedModelId === modelId &&
    selectedElementId === String(node.localId);

  const label = node.category || 'Item';
  const idLabel = node.localId !== null ? `#${node.localId}` : '';

  const handleClick = () => {
    if (node.localId !== null) {
      onSelectNode(modelId, node.localId);
    } else if (hasChildren) {
      setIsExpanded((prev) => !prev);
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
        className={`flex items-center py-1 pr-2 text-xs rounded cursor-pointer transition-colors ${
          isSelected
            ? 'bg-pavasal-500/20 text-pavasal-400 border border-pavasal-500/50 font-medium'
            : 'text-asphalt-200 hover:bg-asphalt-800'
        }`}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((prev) => !prev);
            }}
            className="w-4 h-4 flex items-center justify-center text-asphalt-400 hover:text-pavasal-400 mr-1"
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4 h-4 inline-block mr-1" />
        )}
        <span className="truncate flex-1">{label}</span>
        {idLabel && (
          <span className="text-[10px] text-asphalt-400 ml-1 font-mono">
            {idLabel}
          </span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child, idx) => (
            <TreeNode
              key={`${modelId}-${child.localId ?? 'group'}-${idx}`}
              node={child}
              modelId={modelId}
              depth={depth + 1}
              onSelectNode={onSelectNode}
              selectedElementId={selectedElementId}
              selectedModelId={selectedModelId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const SpatialTreePanel: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { loadedModels, isLoadingModel, selectedElementId, selectedModelId } =
    useViewerStore();
  const { fragments, focusElement } = useEngine();
  const { isEngineReady, loadLocalFragFiles } = useLocalFragUpload();
  const [trees, setTrees] = useState<
    Array<{ modelId: string; name: string; tree: FRAGS.SpatialTreeItem }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const loadTrees = async () => {
      if (!fragments || !fragments.initialized || loadedModels.length === 0) {
        setTrees([]);
        return;
      }

      setIsLoading(true);
      const result: Array<{
        modelId: string;
        name: string;
        tree: FRAGS.SpatialTreeItem;
      }> = [];

      for (const info of loadedModels) {
        const model = fragments.list.get(info.id);
        if (model) {
          try {
            const spatialTree = await model.getSpatialStructure();
            if (spatialTree) {
              result.push({
                modelId: info.id,
                name: info.name,
                tree: spatialTree,
              });
            }
          } catch (err) {
            console.warn(
              `[SpatialTreePanel] Could not read tree for ${info.name}:`,
              err,
            );
          }
        }
      }

      if (active) {
        setTrees(result);
        setIsLoading(false);
      }
    };

    loadTrees();

    return () => {
      active = false;
    };
  }, [fragments, loadedModels]);

  if (loadedModels.length === 0) {
    return (
      <div className="text-center text-xs text-asphalt-300 mt-8 px-4 space-y-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".frag,.ifc"
          multiple
          onChange={async (e) => {
            await loadLocalFragFiles(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
        />
        <div>
          <p className="font-semibold text-asphalt-100">Jerarquía del Modelo</p>
          <p className="mt-1 text-asphalt-400 leading-relaxed">
            Carga un archivo <code className="text-pavasal-400">.frag</code> o{' '}
            <code className="text-pavasal-400">.ifc</code> en local (sin proyecto)
            para explorar su estructura espacial IFC.
          </p>
        </div>
        <button
          type="button"
          disabled={!isEngineReady || isLoadingModel}
          onClick={() => fileInputRef.current?.click()}
          className="rounded bg-pavasal-500 px-3 py-1.5 text-xs font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-40 transition-colors"
        >
          {isLoadingModel ? 'Procesando modelo...' : '+ Subir .frag o .ifc'}
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center text-xs text-asphalt-300 mt-8">
        <p>Procesando estructura espacial...</p>
      </div>
    );
  }

  if (trees.length === 0) {
    return (
      <div className="text-center text-xs text-asphalt-300 mt-8 px-4">
        <p className="font-semibold text-asphalt-100">Sin estructura espacial</p>
        <p className="mt-1 text-asphalt-400">
          Este archivo <code className="text-pavasal-400">.frag</code> no
          contiene metadatos de árbol espacial.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {trees.map((item) => (
        <div key={item.modelId}>
          <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-pavasal-400 bg-asphalt-950 border-l-2 border-l-pavasal-500 rounded-r mb-1 truncate">
            {item.name}
          </div>
          <TreeNode
            node={item.tree}
            modelId={item.modelId}
            onSelectNode={(mId, lId) => focusElement(mId, lId)}
            selectedElementId={selectedElementId}
            selectedModelId={selectedModelId}
          />
        </div>
      ))}
    </div>
  );
};

export default SpatialTreePanel;
