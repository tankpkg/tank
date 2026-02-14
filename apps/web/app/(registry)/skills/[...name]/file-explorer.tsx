'use client';

import { useState } from 'react';

interface FileExplorerProps {
  files: string[];
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

function TreeItem({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        onClick={() => node.isDirectory && setExpanded(!expanded)}
        className={`flex items-center gap-1.5 w-full text-left py-0.5 px-1 rounded text-sm hover:bg-muted/50 ${
          node.isDirectory ? 'cursor-pointer' : 'cursor-default'
        }`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        <span className="text-muted-foreground text-xs w-4 shrink-0">
          {node.isDirectory ? (expanded ? '▼' : '▶') : ' '}
        </span>
        <span className="shrink-0">{node.isDirectory ? '📁' : '📄'}</span>
        <span className="truncate font-mono text-xs">{node.name}</span>
      </button>
      {node.isDirectory &&
        expanded &&
        node.children.map((child) => (
          <TreeItem key={child.path} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}

export function FileExplorer({ files }: FileExplorerProps) {
  if (files.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No files in this package.
      </p>
    );
  }

  const tree = buildTree(files);

  return (
    <div className="border rounded-lg p-2">
      <div className="text-xs font-medium text-muted-foreground mb-2 px-1">
        {files.length} file{files.length !== 1 ? 's' : ''}
      </div>
      {tree.map((node) => (
        <TreeItem key={node.path} node={node} />
      ))}
    </div>
  );
}
