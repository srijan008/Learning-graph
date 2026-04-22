/**
 * RichText — Robust markdown + LaTeX renderer.
 *
 * Strategy (avoids remark-gfm vs remark-math conflict):
 * 1. Extract all math regions ($...$ and $$...$$) and replace with unique placeholders
 * 2. Run the placeholder-replaced text through react-markdown (tables, bold, lists)
 * 3. In the `code` component renderer, detect placeholders and render them with KaTeX
 *
 * This ensures backslashes in math (\frac, \pi, \text) are NEVER touched by
 * the markdown parser, which would mangle them.
 */
import { useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import katex from 'katex';

const PLACEHOLDER_PREFIX = 'MATHPLACEHOLDER';

interface MathEntry { src: string; display: boolean }

/** 
 * Pre-process text: protect LaTeX backslash sequences and fix scrapers' escape corruptions.
 */
function preprocess(text: string): string {
  if (!text) return '';
  
  // 1. Fix common scraper/JSON corruptions at runtime
  // \x0c (form feed) -> \f, \x08 (backspace) -> \b, \x0b (vertical tab) -> \v, etc.
  let cleaned = text
    .replace(/\x0c/g, '\\f') // Form Feed -> \f
    .replace(/\x08/g, '\\b') // Backspace -> \b
    .replace(/\x07/g, '\\a') // Bell -> \a
    .replace(/\x0b/g, '\\v') // Vertical Tab -> \v
    // If we have literal tabs or carriage returns that break LaTeX
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r');

  // 2. Convert \\( \\) → $…$ and \\[ \\] → $$…$$ (some datasets use these)
  return cleaned
    .replace(/\\\\\(/g, '$').replace(/\\\\\)/g, '$')
    .replace(/\\\\\[/g, '$$').replace(/\\\\\]/g, '$$');
}

/** Extract $...$ and $$...$$ from text. Replace with code-span placeholders. */
function extractMath(raw: string): { processed: string; mathMap: Map<string, MathEntry> } {
  const mathMap = new Map<string, MathEntry>();
  let idx = 0;

  let text = preprocess(raw);

  // Step 1: extract $$...$$ (block) first
  let processed = text.replace(/\$\$([\s\S]+?)\$\$/g, (_match, src) => {
    const key = `${PLACEHOLDER_PREFIX}${idx++}`;
    mathMap.set(key, { src: src, display: true });
    return `\`${key}\``;
  });

  // Step 2: extract $...$ (inline, single line)
  processed = processed.replace(/\$([^\$\n]+?)\$/g, (_match, src) => {
    const key = `${PLACEHOLDER_PREFIX}${idx++}`;
    mathMap.set(key, { src: src, display: false });
    return `\`${key}\``;
  });

  return { processed, mathMap };
}

/** Render LaTeX src string using KaTeX. Returns HTML string. */
function renderMath(src: string, display: boolean): string {
  try {
    return katex.renderToString(src, {
      displayMode: display,
      throwOnError: false,
      strict: 'ignore',
      trust: true,
      macros: {
        '\\text': '\\textrm', // fallback
      },
    });
  } catch {
    return `<span style="color:#fca5a5;font-family:monospace">[Math Error: ${src.slice(0, 40)}]</span>`;
  }
}

interface Props {
  text: string;
  inline?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default memo(function RichText({ text, inline, className, style }: Props) {
  if (!text) return null;

  const { processed, mathMap } = useMemo(() => extractMath(text), [text]);

  const components: any = useMemo(() => ({
    // Handling Images
    img: ({ src, alt }: any) => (
      <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <img 
          src={src} 
          alt={alt} 
          loading="lazy"
          style={{ 
            maxWidth: '100%', 
            maxHeight: '450px', 
            borderRadius: '12px', 
            boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'block'
          }} 
        />
        {alt && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px' }}>{alt}</span>}
      </div>
    ),

    // When react-markdown encounters a `code` span, check if it's our placeholder
    code: ({ children, inline: isInline }: any) => {
      const raw = String(children || '').trim();
      if (raw.startsWith(PLACEHOLDER_PREFIX) && mathMap.has(raw)) {
        const entry = mathMap.get(raw)!;
        const html = renderMath(entry.src, entry.display);
        if (entry.display) {
          return (
            <span
              style={{ display: 'block', textAlign: 'center', margin: '10px 0', overflowX: 'auto' }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }
        return <span dangerouslySetInnerHTML={{ __html: html }} />;
      }
      // Real code span
      return (
        <code style={{
          fontFamily: 'monospace', background: 'rgba(255,255,255,0.08)',
          padding: '1px 5px', borderRadius: '4px', fontSize: '0.85em'
        }}>
          {children}
        </code>
      );
    },

    // Table styling
    table: ({ children }: any) => (
      <div style={{ overflowX: 'auto', margin: '14px 0' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.88rem' }}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead style={{ background: 'rgba(99,102,241,0.15)' }}>{children}</thead>
    ),
    th: ({ children }: any) => (
      <th style={{
        padding: '9px 14px', borderBottom: '2px solid rgba(99,102,241,0.3)',
        textAlign: 'left', color: '#a5b4fc', fontWeight: 700, whiteSpace: 'nowrap'
      }}>
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td style={{
        padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.85)', verticalAlign: 'top', lineHeight: 1.6
      }}>
        {children}
      </td>
    ),
    tr: ({ children }: any) => (
      <tr
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
      >
        {children}
      </tr>
    ),

    // Paragraph
    p: ({ children }: any) => (
      <span style={{ display: 'block', marginBottom: '6px', color: 'inherit', lineHeight: 1.85 }}>
        {children}
      </span>
    ),

    // Text formatting
    strong: ({ children }: any) => <strong style={{ color: 'white', fontWeight: 700 }}>{children}</strong>,
    em: ({ children }: any) => <em style={{ color: 'rgba(255,255,255,0.8)' }}>{children}</em>,

    // Lists
    ul: ({ children }: any) => (
      <ul style={{ paddingLeft: '20px', margin: '6px 0', color: 'rgba(255,255,255,0.8)', lineHeight: 1.8 }}>
        {children}
      </ul>
    ),
    ol: ({ children }: any) => (
      <ol style={{ paddingLeft: '20px', margin: '6px 0', color: 'rgba(255,255,255,0.8)', lineHeight: 1.8 }}>
        {children}
      </ol>
    ),
    li: ({ children }: any) => <li style={{ marginBottom: '3px' }}>{children}</li>,

    // Headings
    h1: ({ children }: any) => <h3 style={{ color: 'white', margin: '8px 0 4px' }}>{children}</h3>,
    h2: ({ children }: any) => <h4 style={{ color: 'white', margin: '8px 0 4px' }}>{children}</h4>,
    h3: ({ children }: any) => <h5 style={{ color: 'white', margin: '6px 0 4px' }}>{children}</h5>,
  }), [mathMap]);

  const content = (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {processed}
    </ReactMarkdown>
  );

  if (inline) {
    return (
      <span className={`rich-text ${className || ''}`} style={{ lineHeight: 1.85, ...style }}>
        {content}
      </span>
    );
  }

  return (
    <div className={`rich-text ${className || ''}`} style={style}>
      {content}
    </div>
  );
});
