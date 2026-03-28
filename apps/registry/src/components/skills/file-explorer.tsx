import Editor from '@monaco-editor/react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  File,
  FileCode,
  FileJson,
  FileText,
  FileType,
  Folder,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { Button } from '~/components/ui/button';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';

function subscribeTheme(cb: () => void) {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function getIsDark() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

function useIsDark() {
  return useSyncExternalStore(subscribeTheme, getIsDark, () => true);
}

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

const EXT_TO_LANG: Record<string, string> = {
  md: 'markdown',
  json: 'json',
  py: 'python',
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  sh: 'shell',
  bash: 'shell',
  css: 'css',
  html: 'html',
  xml: 'xml',
  sql: 'sql',
  rs: 'rust',
  go: 'go',
  rb: 'ruby',
  txt: 'plaintext',
  env: 'plaintext',
  gitignore: 'plaintext',
  dockerfile: 'dockerfile',
  lock: 'plaintext'
};

function getLang(path: string): string {
  const name = path.split('/').pop() ?? '';
  const lower = name.toLowerCase();

  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === 'makefile') return 'makefile';
  if (lower === 'justfile') return 'makefile';

  const ext = name.includes('.') ? (name.split('.').pop()?.toLowerCase() ?? '') : '';
  return EXT_TO_LANG[ext] ?? 'plaintext';
}

function getFileIcon(name: string) {
  const ext = name.includes('.') ? (name.split('.').pop()?.toLowerCase() ?? '') : '';
  switch (ext) {
    case 'json':
      return <FileJson className="size-4 text-yellow-500/80" />;
    case 'md':
      return <FileText className="size-4 text-blue-400/80" />;
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return <FileCode className="size-4 text-emerald-400/80" />;
    case 'py':
      return <FileCode className="size-4 text-sky-400/80" />;
    case 'sh':
    case 'bash':
      return <FileType className="size-4 text-orange-400/80" />;
    case 'yaml':
    case 'yml':
    case 'toml':
      return <FileCode className="size-4 text-purple-400/80" />;
    default:
      return <File className="size-4 text-muted-foreground/60" />;
  }
}

function buildTree(files: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const filePath of files.sort()) {
    const parts = filePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const existing = current.find((n) => n.name === part);

      if (existing) {
        if (!isLast) current = existing.children;
      } else {
        const node: TreeNode = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          isDirectory: !isLast,
          children: []
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

function TreeItem({
  node,
  depth = 0,
  selectedFile,
  onSelect
}: {
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
        type="button"
        onClick={() => {
          if (node.isDirectory) {
            setExpanded(!expanded);
          } else {
            onSelect(node.path);
          }
        }}
        className={`group flex w-full items-center gap-1.5 rounded-sm px-2 py-[5px] text-left text-[13px] transition-colors hover:bg-muted/60 ${
          isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground/80'
        }`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}>
        {node.isDirectory ? (
          expanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {node.isDirectory ? (
          expanded ? (
            <FolderOpen className="size-4 shrink-0 text-sky-400/70" />
          ) : (
            <Folder className="size-4 shrink-0 text-sky-400/70" />
          )
        ) : (
          getFileIcon(node.name)
        )}
        <span className="truncate font-mono text-[13px]">{node.name}</span>
      </button>
      {node.isDirectory &&
        expanded &&
        node.children.map((child) => (
          <TreeItem key={child.path} node={child} depth={depth + 1} selectedFile={selectedFile} onSelect={onSelect} />
        ))}
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex h-[600px] items-center justify-center bg-background rounded-r-lg">
      <div className="flex flex-col items-center gap-3 text-muted-foreground/50">
        <div className="size-8 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60" />
        <span className="text-xs">Loading editor...</span>
      </div>
    </div>
  );
}

export function FileExplorer({ files, skillName, version, readme, manifest }: FileExplorerProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(files.includes('SKILL.md') ? 'SKILL.md' : null);
  const [fileContent, setFileContent] = useState<string | null>(readme ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [treeOpen, setTreeOpen] = useState(false);
  const { copied, copy } = useCopyToClipboard();
  const isDark = useIsDark();

  const tree = useMemo(() => buildTree(files), [files]);

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFile(path);
    setTreeOpen(false);
  }, []);

  const getFileContent = useCallback(
    async (path: string): Promise<string | null> => {
      if (path === 'SKILL.md' && readme) return readme;
      if ((path === 'skills.json' || path === 'tank.json') && manifest) return JSON.stringify(manifest, null, 2);

      const response = await fetch(`/api/v1/skills/${encodeURIComponent(skillName)}/${version}/files/${path}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to load file (${response.status})`);
      }
      return response.text();
    },
    [skillName, version, readme, manifest]
  );

  useEffect(() => {
    if (!selectedFile) {
      setFileContent(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getFileContent(selectedFile)
      .then((content) => {
        if (!cancelled) setFileContent(content);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load file');
          setFileContent(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFile, getFileContent]);

  if (files.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No files in this package.</p>;
  }

  const lang = selectedFile ? getLang(selectedFile) : 'plaintext';

  const treePanel = (
    <div className="overflow-y-auto bg-background/50 py-1" style={{ maxHeight: '600px' }}>
      {tree.map((node) => (
        <TreeItem key={node.path} node={node} selectedFile={selectedFile} onSelect={handleSelectFile} />
      ))}
    </div>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2 gap-2">
        <div className="flex items-center gap-2 text-sm min-w-0">
          {/* Mobile tree toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 lg:hidden shrink-0"
            onClick={() => setTreeOpen(!treeOpen)}
            data-testid="file-tree-toggle">
            {treeOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
          </Button>
          <span className="text-muted-foreground shrink-0">{files.length} files</span>
          {selectedFile && (
            <>
              <span className="text-muted-foreground/40 shrink-0">/</span>
              <span className="font-mono text-[13px] text-foreground truncate">{selectedFile}</span>
            </>
          )}
        </div>
        {selectedFile && fileContent && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => copy(fileContent)}>
            {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy'}</span>
          </Button>
        )}
      </div>

      {/* Mobile: collapsible tree panel */}
      {treeOpen && (
        <div className="border-b border-border lg:hidden" data-testid="mobile-file-tree">
          {treePanel}
        </div>
      )}

      {/* Desktop: side-by-side layout */}
      <div className="flex">
        <div
          className="hidden lg:block w-[260px] shrink-0 overflow-y-auto border-r border-border bg-background/50 py-1"
          style={{ height: '600px' }}
          data-testid="desktop-file-tree">
          {tree.map((node) => (
            <TreeItem key={node.path} node={node} selectedFile={selectedFile} onSelect={setSelectedFile} />
          ))}
        </div>

        <div className="flex-1 min-w-0" data-testid="file-editor-area">
          {!selectedFile && (
            <div className="flex h-[400px] lg:h-[600px] items-center justify-center text-sm text-muted-foreground/50">
              <span className="hidden lg:inline">Select a file to preview</span>
              <span className="lg:hidden">Tap the panel icon to browse files</span>
            </div>
          )}

          {selectedFile && isLoading && <EditorSkeleton />}

          {selectedFile && error && (
            <div className="flex h-[400px] lg:h-[600px] items-center justify-center">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {selectedFile && !isLoading && !error && fileContent !== null && (
            <Editor
              height={typeof window !== 'undefined' && window.innerWidth < 1024 ? '400px' : '600px'}
              language={lang}
              value={fileContent}
              theme={isDark ? 'vs-dark' : 'light'}
              loading={<EditorSkeleton />}
              options={{
                readOnly: true,
                minimap: { enabled: typeof window !== 'undefined' && window.innerWidth >= 1024 },
                fontSize: 13,
                lineHeight: 20,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace",
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                padding: { top: 12, bottom: 12 },
                renderLineHighlight: 'none',
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                scrollbar: {
                  verticalScrollbarSize: 8,
                  horizontalScrollbarSize: 8
                },
                domReadOnly: true,
                contextmenu: false,
                selectionHighlight: false,
                occurrencesHighlight: 'off'
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
