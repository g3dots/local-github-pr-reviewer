import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, postSse, type PRDetail, type Thread } from "../api.js";
import { parseUnifiedDiff, type DiffFile, type DiffLine } from "../diff.js";

type StreamState = {
  active: boolean;
  label: string;
  log: string[];
};

export function PRView() {
  const { prId } = useParams();
  const id = Number(prId);
  const [detail, setDetail] = useState<PRDetail | null>(null);
  const [diff, setDiff] = useState<string>("");
  const [stream, setStream] = useState<StreamState>({ active: false, label: "", log: [] });

  const load = useCallback(async () => {
    const [d, df] = await Promise.all([api.pr(id), api.diff(id)]);
    setDetail(d);
    setDiff(df);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const files = useMemo<DiffFile[]>(() => (diff ? parseUnifiedDiff(diff) : []), [diff]);

  // Group threads by file+line for fast lookup.
  const threadIndex = useMemo(() => {
    const idx = new Map<string, Thread[]>();
    const fileLevel = new Map<string, Thread[]>();
    const prLevel: Thread[] = [];
    if (!detail) return { idx, fileLevel, prLevel };
    for (const t of detail.threads) {
      if (!t.filePath) {
        prLevel.push(t);
        continue;
      }
      if (t.line == null) {
        const k = t.filePath;
        const arr = fileLevel.get(k) ?? [];
        arr.push(t);
        fileLevel.set(k, arr);
        continue;
      }
      const k = `${t.filePath}:${t.line}:${t.side ?? "RIGHT"}`;
      const arr = idx.get(k) ?? [];
      arr.push(t);
      idx.set(k, arr);
    }
    return { idx, fileLevel, prLevel };
  }, [detail]);

  const clearReview = useCallback(async () => {
    const ok = window.confirm(
      "Delete all threads, comments, and review history for this PR? The PR stays in the list so you can run a fresh review.",
    );
    if (!ok) return;
    await api.clearReview(id);
    void load();
  }, [id, load]);

  const runReview = useCallback(async () => {
    setStream({ active: true, label: "Reviewing…", log: [] });
    try {
      await postSse(`/api/prs/${id}/review`, {}, (ev) => {
        const data = ev.data as Record<string, unknown> | string | undefined;
        const pick = (key: string): string => {
          if (data && typeof data === "object" && key in data)
            return String((data as Record<string, unknown>)[key] ?? "");
          return "";
        };
        if (ev.event === "log") {
          setStream((s) => ({ ...s, log: [...s.log, pick("message")] }));
        } else if (ev.event === "stderr") {
          setStream((s) => ({ ...s, log: [...s.log, pick("data")] }));
        } else if (ev.event === "done") {
          const d = ev.data as { addedThreads: number; staleMarked: number };
          setStream((s) => ({
            ...s,
            log: [...s.log, `added ${d.addedThreads} threads, ${d.staleMarked} stale`],
          }));
        } else if (ev.event === "error") {
          setStream((s) => ({ ...s, log: [...s.log, `ERROR: ${pick("message")}`] }));
        }
      });
    } finally {
      setStream((s) => ({ ...s, active: false }));
      void load();
    }
  }, [id, load]);

  if (!detail) return <div className="loading">Loading…</div>;

  const resolved = detail.threads.filter((t) => t.status === "resolved");

  return (
    <div className="prview">
      <header className="pr-header">
        <div>
          <Link to="/" className="muted">
            ← All PRs
          </Link>
          <h1>
            #{detail.pr.number} {detail.pr.title}
          </h1>
          <div className="muted small">
            {detail.repo.owner}/{detail.repo.name} · {detail.pr.headRef} → {detail.pr.baseRef} ·{" "}
            {detail.pr.headSha.slice(0, 7)} ·{" "}
            <a href={detail.pr.url} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </div>
        <div className="spacer" />
        {detail.threads.length > 0 && (
          <button className="btn" onClick={clearReview} disabled={stream.active}>
            Clear review
          </button>
        )}
        <button className="btn primary" onClick={runReview} disabled={stream.active}>
          {stream.active ? "Running…" : detail.threads.length ? "Re-run review" : "Run review"}
        </button>
      </header>

      {stream.log.length > 0 && <pre className="stream-log">{stream.log.join("\n")}</pre>}

      {detail.pr.body && (
        <section className="pr-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.pr.body}</ReactMarkdown>
        </section>
      )}

      {threadIndex.prLevel.length > 0 && (
        <section className="pr-level-threads">
          <h3>PR-level threads</h3>
          {threadIndex.prLevel.map((t) => (
            <ThreadCard key={t.id} thread={t} onChange={load} />
          ))}
        </section>
      )}

      <section className="diff">
        {files.map((f) => (
          <FileBlock
            key={f.newPath}
            file={f}
            threadIndex={threadIndex.idx}
            fileThreads={threadIndex.fileLevel.get(f.newPath) ?? []}
            onChange={load}
          />
        ))}
      </section>

      {resolved.length > 0 && (
        <section className="resolved-section">
          <h3>Resolved ({resolved.length})</h3>
          {resolved.map((t) => (
            <ThreadCard key={t.id} thread={t} onChange={load} compact />
          ))}
        </section>
      )}
    </div>
  );
}

function FileBlock({
  file,
  threadIndex,
  fileThreads,
  onChange,
}: {
  file: DiffFile;
  threadIndex: Map<string, Thread[]>;
  fileThreads: Thread[];
  onChange: () => void;
}) {
  return (
    <div className="file-block">
      <div className="file-header">{file.newPath}</div>
      {fileThreads.map((t) => (
        <ThreadCard key={t.id} thread={t} onChange={onChange} />
      ))}
      <table className="diff-table">
        <tbody>
          {file.hunks.flatMap((h, hi) => [
            <tr key={`h${hi}`} className="hunk-row">
              <td colSpan={3}>{h.header}</td>
            </tr>,
            ...h.lines.map((l, li) =>
              renderDiffLine(file.newPath, l, hi, li, threadIndex, onChange),
            ),
          ])}
        </tbody>
      </table>
    </div>
  );
}

function renderDiffLine(
  path: string,
  l: DiffLine,
  hi: number,
  li: number,
  threadIndex: Map<string, Thread[]>,
  onChange: () => void,
): React.ReactNode[] {
  if (l.kind === "hunk") return [];
  if (l.kind === "meta") {
    return [
      <tr key={`${hi}-${li}-m`} className="meta-row">
        <td colSpan={3}>{l.text}</td>
      </tr>,
    ];
  }
  const cls = l.kind === "add" ? "add" : l.kind === "del" ? "del" : "ctx";
  const key = l.kind === "del" ? null : `${path}:${l.newLine}:RIGHT`;
  const threads = key ? (threadIndex.get(key) ?? []) : [];
  const rows: React.ReactNode[] = [
    <tr key={`${hi}-${li}`} className={`diff-line ${cls}`}>
      <td className="ln old">{l.oldLine ?? ""}</td>
      <td className="ln new">{l.newLine ?? ""}</td>
      <td className="code">
        <pre>
          {lineSign(l.kind)}
          {l.text}
        </pre>
      </td>
    </tr>,
  ];
  if (threads.length > 0) {
    rows.push(
      <tr key={`${hi}-${li}-th`} className="thread-row">
        <td colSpan={3}>
          {threads.map((t) => (
            <ThreadCard key={t.id} thread={t} onChange={onChange} />
          ))}
        </td>
      </tr>,
    );
  }
  return rows;
}

function lineSign(k: DiffLine["kind"]): string {
  return k === "add" ? "+ " : k === "del" ? "- " : "  ";
}

function ThreadCard({
  thread,
  onChange,
  compact = false,
}: {
  thread: Thread;
  onChange: () => void;
  compact?: boolean;
}) {
  const [reply, setReply] = useState("");
  const [streaming, setStreaming] = useState<null | "reply" | "revalidate">(null);

  async function sendReply() {
    if (!reply.trim()) return;
    setStreaming("reply");
    try {
      await postSse(`/api/threads/${thread.id}/messages`, { body: reply }, () => {});
      setReply("");
      onChange();
    } finally {
      setStreaming(null);
    }
  }

  async function revalidate() {
    setStreaming("revalidate");
    try {
      await postSse(`/api/threads/${thread.id}/revalidate`, {}, () => {});
      onChange();
    } finally {
      setStreaming(null);
    }
  }

  async function toggleStatus() {
    await api.setStatus(thread.id, thread.status === "open" ? "resolved" : "open");
    onChange();
  }

  const sevClass = thread.severity ? `sev-${thread.severity}` : "";
  return (
    <div className={`thread ${sevClass} ${thread.status} ${compact ? "compact" : ""}`}>
      <div className="thread-meta">
        {thread.severity && <span className={`pill sev ${sevClass}`}>{thread.severity}</span>}
        {thread.stale && <span className="pill warn">stale</span>}
        {thread.status === "resolved" && <span className="pill ok">resolved</span>}
        <div className="spacer" />
        <button className="btn small" onClick={revalidate} disabled={streaming !== null}>
          {streaming === "revalidate" ? "…" : "Revalidate"}
        </button>
        <button className="btn small" onClick={toggleStatus}>
          {thread.status === "open" ? "Mark resolved" : "Reopen"}
        </button>
      </div>
      <div className="thread-comments">
        {thread.comments.map((c) => (
          <div key={c.id} className={`comment ${c.author} ${c.kind}`}>
            <div className="comment-author">
              {c.author === "ai" ? "AI" : "you"}
              {c.kind !== "normal" ? ` · ${c.kind}` : ""}
            </div>
            <div className="comment-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.body}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
      {thread.status === "open" && (
        <div className="thread-reply">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply to the reviewer…"
            disabled={streaming !== null}
          />
          <button
            className="btn primary small"
            onClick={sendReply}
            disabled={streaming !== null || !reply.trim()}
          >
            {streaming === "reply" ? "…" : "Send"}
          </button>
        </div>
      )}
    </div>
  );
}
