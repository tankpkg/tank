'use client';

import { useState, useEffect, useCallback } from 'react';

interface FileExplorerProps {
  files: string[];
  skillName: string;
  version: string;
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

function FilePreview({ content, isLoading, error, filePath }: {
  content: string | null;
  isLoading: boolean;
  error: string | null;
  filePath: string | null;
}) {
  if (!filePath) {
    return (
      <p className="text-xs text-muted-foreground italic p-2">
        Click a file to preview
      </p>
    );
  }

  if (isLoading) {
    return (
      <p className="text-xs text-muted-foreground italic p-2">
        Loading...
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-destructive italic p-2">
        {error}
      </p>
    );
  }

  if (content) {
    return (
      <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/30 p-2 rounded max-h-64 overflow-y-auto">
        {content}
      </pre>
    );
  }

  return (
    <p className="text-xs text-muted-foreground italic p-2">
      Preview not available.
    </p>
  );
}

export function FileExplorer({ files, skillName, version, readme, manifest }: FileExplorerProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(
    files.includes('SKILL.md') ? 'SKILL.md' : null
  );
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getFileContent = useCallback(async (path: string): Promise<string | null> => {
    if (path === 'SKILL.md' && readme) return readme;
    if (path === 'skills.json' && manifest) return JSON.stringify(manifest, null, 2);

    const response = await fetch(`/api/v1/skills/${encodeURIComponent(skillName)}/${version}/files/${path}`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Failed to load file: ${response.status}`);
    }
    return response.text();
  }, [skillName, version, readme, manifest]);

  useEffect(() => {
    if (!selectedFile) {
      setFileContent(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    getFileContent(selectedFile)
      .then((content) => {
        setFileContent(content);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load file');
        setFileContent(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [selectedFile, getFileContent]);

  if (files.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No files in this package.
      </p>
    );
  }

  const tree = buildTree(files);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      <div className="border rounded-lg p-2">
        <div className="text-xs font-medium text-muted-foreground mb-2 px-1 flex items-center justify-between">
          <span>Preview</span>
          {selectedFile && <span className="font-mono">{selectedFile}</span>}
        </div>
        <FilePreview
          content={fileContent}
          isLoading={isLoading}
          error={error}
          filePath={selectedFile}
        />
      </div>
    </div>
  );
}
