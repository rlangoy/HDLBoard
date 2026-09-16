import { useRef, type UIEvent } from 'react';
import { cx } from '../board';
import { tokenizeVhdlLine, type Token } from './vhdlHighlight';
import './CodeEditor.css';

export interface EditorTab {
  id: string;
  name: string;
  content: string;
}

export interface CodeEditorProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onAddTab: () => void;
  onChange: (id: string, content: string) => void;
}

const TOKEN_CLASS: Partial<Record<Token['type'], string>> = {
  keyword: 'wb-tok-keyword',
  type: 'wb-tok-type',
  comment: 'wb-tok-comment',
  string: 'wb-tok-string',
  number: 'wb-tok-number',
  punctuation: 'wb-tok-punct',
};

function HighlightedLine({ line }: { line: string }) {
  const tokens = tokenizeVhdlLine(line);
  return (
    <div className="wb-editor__line">
      {line.length === 0 ? (
        ' '
      ) : (
        tokens.map((token, i) => {
          const className = TOKEN_CLASS[token.type];
          return className ? (
            <span key={i} className={className}>
              {token.text}
            </span>
          ) : (
            token.text
          );
        })
      )}
    </div>
  );
}

/**
 * The tabbed VHDL editor. A transparent `<textarea>` sits over a
 * highlighted `<pre>` with identical font metrics — the standard
 * overlay technique, so typing, selection and the caret are all native
 * while the visible text is coloured.
 */
export function CodeEditor({ tabs, activeTabId, onSelectTab, onCloseTab, onAddTab, onChange }: CodeEditorProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const active = tabs.find((t) => t.id === activeTabId) ?? null;
  const lines = active ? active.content.split('\n') : [];

  const handleScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = scrollTop;
    }
  };

  return (
    <div className="wb-editor">
      <div className="wb-editor__tabs" role="tablist">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={tab.id === activeTabId}
            className={cx('wb-editor__tab', tab.id === activeTabId && 'is-active')}
            onClick={() => onSelectTab(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectTab(tab.id);
            }}
          >
            <span className="wb-editor__tab-name">{tab.name}</span>
            <button
              type="button"
              className="wb-editor__tab-close"
              aria-label={`Close ${tab.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="wb-editor__tab-add" aria-label="New file" onClick={onAddTab}>
          +
        </button>
      </div>

      {active ? (
        <div className="wb-editor__body">
          <div className="wb-editor__gutter" ref={gutterRef} aria-hidden="true">
            {lines.map((_, i) => (
              <div className="wb-editor__gutter-line" key={i}>
                {i + 1}
              </div>
            ))}
          </div>
          <div className="wb-editor__surface">
            <pre className="wb-editor__highlight" ref={preRef} aria-hidden="true">
              {lines.map((line, i) => (
                <HighlightedLine line={line} key={i} />
              ))}
            </pre>
            <textarea
              className="wb-editor__textarea"
              value={active.content}
              spellCheck={false}
              wrap="off"
              onScroll={handleScroll}
              onChange={(e) => onChange(active.id, e.target.value)}
              aria-label={`${active.name} source`}
            />
          </div>
        </div>
      ) : (
        <div className="wb-editor__empty">
          <p>No file open</p>
          <p className="wb-editor__empty-hint">Select a file from the Files panel to start editing.</p>
        </div>
      )}
    </div>
  );
}

export default CodeEditor;
