import Image from "next/image";
import type { ReactNode } from "react";

const inlineToken = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;

function safeHref(value: string) {
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function allowedImage(value: string) {
  if (value.startsWith("/")) return true;
  try {
    return new URL(value).hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

function inlineContent(value: string): ReactNode[] {
  return value.split(inlineToken).filter(Boolean).map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={`${index}-${token}`}>{token.slice(2, -2)}</strong>;
    if (token.startsWith("*") && token.endsWith("*")) return <em key={`${index}-${token}`}>{token.slice(1, -1)}</em>;
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = safeHref(link[2]);
      return href ? <a href={href} key={`${index}-${token}`} target={href.startsWith("/") ? undefined : "_blank"} rel={href.startsWith("/") ? undefined : "noopener noreferrer"}>{link[1]}</a> : link[1];
    }
    return token;
  });
}

function tableCells(line: string) {
  return line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, "|").trim());
}

export function ResearchBody({ body }: { body: string }) {
  const blocks = body.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return (
    <div className="research-article-body">
      {blocks.map((block, index) => {
        const image = block.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (image && allowedImage(image[2])) {
          return (
            <figure className="research-body-image" key={`${index}-${image[2]}`}>
              <Image src={image[2]} alt={image[1] || "研究文章配图"} width={1600} height={900} sizes="(max-width: 980px) 100vw, 920px" />
              {image[1] ? <figcaption>{image[1]}</figcaption> : null}
            </figure>
          );
        }
        if (block.startsWith("#### ")) return <h4 key={`${index}-${block}`}>{inlineContent(block.slice(5))}</h4>;
        if (block.startsWith("### ")) return <h3 key={`${index}-${block}`}>{inlineContent(block.slice(4))}</h3>;
        if (block.startsWith("## ")) return <h2 key={`${index}-${block}`}>{inlineContent(block.slice(3))}</h2>;
        if (block.startsWith("> ")) return <blockquote key={`${index}-${block}`}>{inlineContent(block.slice(2))}</blockquote>;
        const lines = block.split("\n");
        if (lines.length >= 2 && lines.every((line) => /^\|.*\|$/.test(line.trim())) && tableCells(lines[1]).every((cell) => /^:?-{3,}:?$/.test(cell))) {
          const headers = tableCells(lines[0]);
          const rows = lines.slice(2).map(tableCells);
          return <div className="research-body-table" key={`${index}-${headers.join("-")}`}><table><thead><tr>{headers.map((cell, cellIndex) => <th key={`${cellIndex}-${cell}`}>{inlineContent(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={`${rowIndex}-${row.join("-")}`}>{row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{inlineContent(cell)}</td>)}</tr>)}</tbody></table></div>;
        }
        if (lines.every((line) => /^[-*] /.test(line))) {
          return <ul key={`${index}-${block}`}>{lines.map((line) => <li key={line}>{inlineContent(line.slice(2))}</li>)}</ul>;
        }
        if (lines.every((line) => /^\d+\. /.test(line))) {
          return <ol key={`${index}-${block}`}>{lines.map((line) => <li key={line}>{inlineContent(line.replace(/^\d+\. /, ""))}</li>)}</ol>;
        }
        if (block.startsWith("```")) return <pre key={`${index}-${block.slice(0, 16)}`}><code>{block.replace(/^```\w*\n?/, "").replace(/\n?```$/, "")}</code></pre>;
        if (block === "---") return <hr key={`${index}-divider`} />;
        return <p key={`${index}-${block.slice(0, 16)}`}>{inlineContent(block.replace(/\n/g, " "))}</p>;
      })}
    </div>
  );
}
