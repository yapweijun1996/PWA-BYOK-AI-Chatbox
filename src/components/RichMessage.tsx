import {
  createContext,
  memo,
  useContext,
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import type { ElementContent, RootContent } from "hast";
import { Copy, Image as ImageIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { createLowlight } from "lowlight";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { interpolate, translate } from "../i18n";
import type { Locale } from "../i18n";
import { remarkStreamingTail, safeMessageUrl } from "../rich-markdown";
import "katex/dist/katex.min.css";
import "../rich-message.css";

const highlighter = createLowlight({
  bash,
  css,
  diff,
  go,
  javascript,
  json,
  markdown,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml,
});
const languageNames = new Map(
  Object.entries({
    bash: "Bash",
    sh: "Shell",
    shell: "Shell",
    css: "CSS",
    diff: "Diff",
    go: "Go",
    golang: "Go",
    javascript: "JavaScript",
    js: "JavaScript",
    jsx: "JSX",
    json: "JSON",
    markdown: "Markdown",
    md: "Markdown",
    python: "Python",
    py: "Python",
    rust: "Rust",
    rs: "Rust",
    sql: "SQL",
    typescript: "TypeScript",
    ts: "TypeScript",
    tsx: "TSX",
    xml: "XML",
    html: "HTML",
    svg: "SVG",
    yaml: "YAML",
    yml: "YAML",
  }),
);
const markdownPlugins = [remarkGfm, remarkMath];
const streamingPlugins = [...markdownPlugins, remarkStreamingTail];
const htmlPlugins: NonNullable<
  Parameters<typeof ReactMarkdown>[0]["rehypePlugins"]
> = [
  [
    rehypeKatex,
    { trust: false, maxExpand: 300, maxSize: 24, strict: "ignore" },
  ],
];
const localeContext = createContext<{
  locale: Locale;
  onNotice?: (text: string) => void;
}>({ locale: "en" });

function codeText(node: ElementContent): string {
  return node.type === "text"
    ? node.value
    : node.type === "element"
      ? node.children.map(codeText).join("")
      : "";
}
function highlightedNodes(nodes: RootContent[]) {
  return nodes.map((node, index) =>
    node.type === "text" ? (
      node.value
    ) : node.type === "element" ? (
      <span
        className={
          Array.isArray(node.properties.className)
            ? node.properties.className.join(" ")
            : undefined
        }
        key={index}
      >
        {highlightedNodes(node.children)}
      </span>
    ) : null,
  );
}
function syntax(source: string, language: string) {
  const grammar =
    language === "jsx"
      ? "javascript"
      : language === "tsx"
        ? "typescript"
        : language;
  if (!grammar || source.length > 50_000 || !highlighter.registered(grammar))
    return source;
  try {
    return highlightedNodes(highlighter.highlight(grammar, source).children);
  } catch {
    return source;
  }
}

function CodeBlock({ source, language }: { source: string; language: string }) {
  const { locale, onNotice } = useContext(localeContext);
  const code = useMemo(() => syntax(source, language), [source, language]);
  const label =
    languageNames.get(language) ??
    (language || translate(locale, "Plain text"));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      onNotice?.("Code copied.");
    } catch {
      onNotice?.("Copy unavailable.");
    }
  };
  return (
    <div className="rich-code">
      <div className="rich-code-header">
        <span title={label}>{label}</span>
        <button
          type="button"
          className="rich-code-copy"
          onClick={() => void copy()}
        >
          <Copy size={14} aria-hidden="true" />
          {translate(locale, "Copy code")}
        </button>
      </div>
      <pre
        className="rich-scroll"
        tabIndex={0}
        aria-label={`${label} · ${translate(locale, "Code block")}`}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MessageImage({
  src,
  alt,
  title,
}: {
  src: string;
  alt: string;
  title?: string;
}) {
  const { locale } = useContext(localeContext);
  const [state, setState] = useState<"idle" | "loading" | "loaded" | "failed">(
    "idle",
  );
  if (state === "idle")
    return (
      <button
        className="rich-image-action"
        type="button"
        onClick={() => setState("loading")}
        title={translate(
          locale,
          "Loading an image may contact an external server.",
        )}
      >
        <ImageIcon size={16} aria-hidden="true" />
        {alt
          ? interpolate(translate(locale, "Load image: {name}"), alt)
          : translate(locale, "Load image")}
      </button>
    );
  return (
    <span className="rich-image-box" data-state={state}>
      {state !== "failed" && (
        <img
          src={src}
          alt={alt}
          title={title}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
        />
      )}
      {state !== "loaded" && (
        <span className="rich-image-status" role="status">
          {translate(
            locale,
            state === "failed" ? "Image unavailable." : "Loading image…",
          )}
        </span>
      )}
    </span>
  );
}

const components: Components = {
  pre({ node, children }) {
    const code = node?.children.find(
      (child) => child.type === "element" && child.tagName === "code",
    );
    if (!code || code.type !== "element") return <pre>{children}</pre>;
    const classes = code.properties.className;
    const language = Array.isArray(classes)
      ? classes.find((value) => String(value).startsWith("language-"))
      : undefined;
    // Markdown adds one synthetic newline to <code>; keep deliberate blank lines.
    return (
      <CodeBlock
        source={codeText(code).replace(/\n$/, "")}
        language={language ? String(language).slice(9).toLowerCase() : ""}
      />
    );
  },
  table({ node: _node, children, ...props }) {
    const { locale } = useContext(localeContext);
    return (
      <div
        className="rich-table rich-scroll"
        tabIndex={0}
        role="region"
        aria-label={translate(locale, "Message table")}
      >
        <table {...props}>{children}</table>
      </div>
    );
  },
  img({ src, alt = "", title }) {
    return typeof src === "string" && src ? (
      <MessageImage key={src} src={src} alt={alt} title={title} />
    ) : (
      <span className="rich-image-disabled">{alt}</span>
    );
  },
  a({ href, children, title, node }) {
    const { locale } = useContext(localeContext);
    if (!href) return <span>{children}</span>;
    const external = !href.startsWith("#");
    const props = {
      href,
      title,
      ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}),
    };
    if (
      node?.children.some(
        (child) => child.type === "element" && child.tagName === "img",
      )
    ) {
      return (
        <span>
          {children} <a {...props}>{translate(locale, "Open image link")}</a>
        </span>
      );
    }
    return <a {...props}>{children}</a>;
  },
};

export const RichMessage = memo(function RichMessage({
  text,
  locale,
  streaming = false,
  onNotice,
}: {
  text: string;
  locale: Locale;
  streaming?: boolean;
  onNotice?: (text: string) => void;
}) {
  const deferred = useDeferredValue(text);
  const context = useMemo(() => ({ locale, onNotice }), [locale, onNotice]);
  const shown = streaming ? deferred : text;
  const plugins = streaming ? streamingPlugins : markdownPlugins;
  const markdown = useMemo(
    () => (
      <ReactMarkdown
        skipHtml
        remarkPlugins={plugins}
        rehypePlugins={htmlPlugins}
        components={components}
        urlTransform={(url, attribute) =>
          safeMessageUrl(
            url,
            attribute,
            typeof document === "undefined"
              ? "https://luma.invalid/"
              : document.baseURI,
          )
        }
      >
        {shown}
      </ReactMarkdown>
    ),
    [shown, plugins],
  );
  if (!shown) return null;
  return (
    <localeContext.Provider value={context}>
      <div className="rich-message">{markdown}</div>
    </localeContext.Provider>
  );
});
