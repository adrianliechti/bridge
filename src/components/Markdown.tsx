import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import type { PluggableList } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

const components: Partial<Components> = {
  pre: ({ children }) => {
    return <>{children}</>;
  },
  li: ({ children, ...props }) => {
    return (
      <li className="py-0.5 ml-0" {...props}>
        {children}
      </li>
    );
  },
  ul: ({ children, ...props }) => {
    return (
      <ul className="list-disc list-outside ml-5 pl-0 my-2" {...props}>
        {children}
      </ul>
    );
  },
  ol: ({ children, ...props }) => {
    return (
      <ol className="list-decimal list-outside ml-5 pl-0 my-2" {...props}>
        {children}
      </ol>
    );
  },
  strong: ({ children, ...props }) => {
    return (
      <span className="font-semibold" {...props}>
        {children}
      </span>
    );
  },
  a: ({ children, href, ...props }) => {
    let url = href || '';

    if (url && !url.startsWith('http') && !url.startsWith('#')) {
      url = `https://${url}`;
    }

    return (
      <a
        className="text-sky-400 hover:underline"
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        {...props}
      >
        {children}
      </a>
    );
  },
  h1: ({ children, ...props }) => {
    return (
      <h1 className="text-xl font-semibold mt-4 mb-2" {...props}>
        {children}
      </h1>
    );
  },
  h2: ({ children, ...props }) => {
    return (
      <h2 className="text-lg font-semibold mt-4 mb-2" {...props}>
        {children}
      </h2>
    );
  },
  h3: ({ children, ...props }) => {
    return (
      <h3 className="text-base font-semibold mt-3 mb-1" {...props}>
        {children}
      </h3>
    );
  },
  h4: ({ children, ...props }) => {
    return (
      <h4 className="text-sm font-semibold mt-3 mb-1" {...props}>
        {children}
      </h4>
    );
  },
  h5: ({ children, ...props }) => {
    return (
      <h5 className="text-sm font-semibold mt-2 mb-1" {...props}>
        {children}
      </h5>
    );
  },
  h6: ({ children, ...props }) => {
    return (
      <h6 className="text-xs font-semibold mt-2 mb-1" {...props}>
        {children}
      </h6>
    );
  },
  p: ({ children, ...props }) => {
    return (
      <p className="my-2 leading-relaxed" {...props}>
        {children}
      </p>
    );
  },
  table: ({ children, ...props }) => {
    return (
      <div className="overflow-x-auto my-3">
        <table
          className="w-full border-collapse border border-neutral-600 text-xs"
          {...props}
        >
          {children}
        </table>
      </div>
    );
  },
  thead: ({ children, ...props }) => {
    return (
      <thead className="bg-neutral-700" {...props}>
        {children}
      </thead>
    );
  },
  tbody: ({ children, ...props }) => {
    return <tbody {...props}>{children}</tbody>;
  },
  tr: ({ children, ...props }) => {
    return (
      <tr className="border-b border-neutral-600" {...props}>
        {children}
      </tr>
    );
  },
  th: ({ children, ...props }) => {
    return (
      <th
        className="p-2 text-left font-semibold border-r last:border-r-0 border-neutral-600"
        {...props}
      >
        {children}
      </th>
    );
  },
  td: ({ children, ...props }) => {
    return (
      <td
        className="p-2 border-r last:border-r-0 border-neutral-600"
        {...props}
      >
        {children}
      </td>
    );
  },
  blockquote: ({ children, ...props }) => {
    return (
      <blockquote
        className="border-l-4 border-neutral-500 pl-3 py-1 my-2 italic text-neutral-300"
        {...props}
      >
        {children}
      </blockquote>
    );
  },
  hr: ({ ...props }) => {
    return <hr className="my-4 border-neutral-600" {...props} />;
  },
  code({ children, className, ...rest }) {
    const match = /language-(\w+)/.exec(className || '');
    const text = String(children).replace(/\n$/, '');
    const isMultiLine = text.includes('\n');

    // Inline code (no language specified and single line)
    if (!match && !isMultiLine) {
      return (
        <code
          {...rest}
          className={`${className || ''} bg-neutral-700 px-1.5 py-0.5 rounded text-xs font-mono text-sky-300`}
        >
          {children}
        </code>
      );
    }

    const language = match?.[1] || 'text';

    // Code block
    return (
      <div className="my-3">
        <div className="flex items-center justify-between bg-neutral-700 px-3 py-1 rounded-t text-xs text-neutral-400">
          <span>{language}</span>
        </div>
        <pre className="bg-neutral-800 p-3 rounded-b overflow-x-auto">
          <code className="text-xs font-mono text-neutral-200">{text}</code>
        </pre>
      </div>
    );
  },
};

const remarkPlugins: PluggableList = [remarkGfm, remarkBreaks];

const NonMemoizedMarkdown = ({ children }: { children: string }) => {
  if (!children) return null;

  // Preprocess markdown to fix common formatting issues
  let processedContent = children;

  // Ensure blank line before code blocks that come after headings
  processedContent = processedContent.replace(
    /^(#{1,6}\s+.+)\n```/gm,
    '$1\n\n```'
  );

  // Ensure blank line after code blocks before headings
  processedContent = processedContent.replace(
    /```\n(#{1,6}\s+)/gm,
    '```\n\n$1'
  );

  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
      {processedContent}
    </ReactMarkdown>
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => prevProps.children === nextProps.children
);
