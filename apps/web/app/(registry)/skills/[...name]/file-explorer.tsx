'use client';

import { useState } from 'react';

interface FileExplorerProps {
  files: string[];
  readme?: string | null;
  manifest?: Record<string, unknown>;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: TreeNode[];
}

function buildTree(files: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const filePath of files.sort()) {
    const parts = filePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const existingNode = current.find((n) => n.name === part);

      if (existingNode) {
        if (!isLast) current = existingNode.children;
      } else {
        const node: TreeNode = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          isDirectory: !isLast,
          children: [],
        };
        current.push(node);
        if (!isLast) current = node.children;
      }
    }
  }

  function sortTree(nodes: TreeNode[]): TreeNode[] {
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children.length > 0) sortTree(node.children);
    }
    return nodes;
  }

  return sortTree(root);
}

function TreeItem({ node, depth = 0, selectedFile, onSelect }: {
  node: TreeNode;
  depth?: number;
  selectedFile: string | null;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isSelected = selectedFile === node.path;

  return (
    <div>
      <button
        onClick={() => {
          if (node.isDirectory) {
            setExpanded(!expanded);
          } else {
            onSelect(node.path);
          }
        }}
        className={`flex items-center gap-1.5 w-full text-left py-0.5 px-1 rounded text-sm hover:bg-muted/50 ${
          node.isDirectory ? 'cursor-pointer' : 'cursor-pointer'
        } ${isSelected ? 'bg-primary/10 text-primary' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        <span className="text-muted-foreground text-xs w-4 shrink-0">
          {node.isDirectory ? (expanded ? '▼' : '▶') : '📄'}
        </span>
        <span className="truncate font-mono text-xs">{node.name}</span>
      </button>
      {node.isDirectory &&
        expanded &&
        node.children.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

export function FileExplorer({ files, readme, manifest }: FileExplorerProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(
    files.includes('SKILL.md') ? 'SKILL.md' : null
  );

  if (files.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No files in this package.
      </p>
    );
  }

  const tree = buildTree(files);

  const getFileContent = (path: string): string | null => {
    if (path === 'SKILL.md' && readme) return readme;
    if (path === 'skills.json' && manifest) return JSON.stringify(manifest, null, 2);
    return null;
  };

  const selectedContent = selectedFile ? getFileContent(selectedFile) : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* File Tree */}
      <div className="border rounded-lg p-2">
        <div className="text-xs font-medium text-muted-foreground mb-2 px-1">
          {files.length} file{files.length !== 1 ? 's' : ''}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {tree.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              selectedFile={selectedFile}
              onSelect={setSelectedFile}
            />
          ))}
        </div>
      </div>

      {/* File Preview */}
      <div className="border rounded-lg p-2">
        <div className="text-xs font-medium text-muted-foreground mb-2 px-1 flex items-center justify-between">
          <span>Preview</span>
          {selectedFile && <span className="font-mono">{selectedFile}</span>}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {selectedContent ? (
            <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/30 p-2 rounded">
              {selectedContent}
            </pre>
          ) : selectedFile ? (
            <p className="text-xs text-muted-foreground italic p-2">
              Preview not available. Download the package to view this file.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic p-2">
              Click a file to preview (SKILL.md and skills.json available)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
