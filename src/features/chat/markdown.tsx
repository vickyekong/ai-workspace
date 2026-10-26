import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const components: Components = {
  p: ({ children }) => <p className="my-2.5 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }) => <ul className="my-2.5 list-disc space-y-1 pl-5 marker:text-muted-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="my-2.5 list-decimal space-y-1 pl-5 marker:text-muted-foreground">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  h1: ({ children }) => <h3 className="mt-4 mb-2 text-[15px] font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-4 mb-2 text-[14px] font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 mb-1.5 font-semibold">{children}</h4>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-brand/40 pl-3 text-muted-foreground">{children}</blockquote>
  ),
  code: ({ className, children }) => {
    const block = /language-/.test(className ?? "");
    return block ? (
      <code className={cn("font-mono text-[12px]", className)}>{children}</code>
    ) : (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="scrollbar-thin my-3 overflow-x-auto rounded-lg border border-hairline bg-muted/60 p-3 leading-relaxed">
      {children}
    </pre>
  ),
  // The webview must never navigate away; links are shown but not followed.
  a: ({ children, href }) => (
    <span title={href} className="text-brand underline decoration-brand/40 underline-offset-2">
      {children}
    </span>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border px-2 py-1.5 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-hairline px-2 py-1.5">{children}</td>,
  img: ({ alt }) => <span className="text-muted-foreground">[{alt || "image"}]</span>,
};

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
      {content}
    </ReactMarkdown>
  );
});
