import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PatchDiff, type DiffLineAnnotation } from "@pierre/diffs/react";
import { api, postSse, type PRDetail, type Thread } from "../api.js";
import { splitPatchByFile, type PatchFile } from "../diff.js";
import { getTheme, subscribeTheme, type Theme } from "../theme.js";

type ViewMode = "unified" | "split";

/** Threads anchored to a single diff line, carried as Pierre annotation metadata. */
type LineThreads = DiffLineAnnotation<Thread[]>;

/** Live theme value, so Pierre re-highlights when the user toggles light/dark. */
function useThemeType(): Theme {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  useEffect(() => subscribeTheme(setThemeState), []);
  return theme;
}

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

  const files = useMemo<PatchFile[]>(() => (diff ? splitPatchByFile(diff) : []), [diff]);

  // Group threads for lookup: PR-level, file-level, and inline → Pierre annotations.
  const threadIndex = useMemo(() => {
    const fileLevel = new Map<string, Thread[]>();
    const prLevel: Thread[] = [];
    // file → "line:side" → threads, so several threads on one line collapse to one annotation.
    const inline = new Map<string, Map<string, Thread[]>>();
    if (!detail) return { annByFile: new Map<string, LineThreads[]>(), fileLevel, prLevel };
    for (const t of detail.threads) {
      if (!t.filePath) {
        prLevel.push(t);
        continue;
      }
      if (t.line == null) {
        const arr = fileLevel.get(t.filePath) ?? [];
        arr.push(t);
        fileLevel.set(t.filePath, arr);
        continue;
      }
      const side = t.side === "LEFT" ? "deletions" : "additions";
      const byLine = inline.get(t.filePath) ?? new Map<string, Thread[]>();
      const key = `${t.line}:${side}`;
      const arr = byLine.get(key) ?? [];
      arr.push(t);
      byLine.set(key, arr);
      inline.set(t.filePath, byLine);
    }
    const annByFile = new Map<string, LineThreads[]>();
    for (const [path, byLine] of inline) {
      const anns: LineThreads[] = [];
      for (const [key, threads] of byLine) {
        const [line, side] = key.split(":");
        anns.push({
          side: side as "additions" | "deletions",
          lineNumber: Number(line),
          metadata: threads,
        });
      }
      annByFile.set(path, anns);
    }
    return { annByFile, fileLevel, prLevel };
  }, [detail]);

  const themeType = useThemeType();
  const [viewMode, setViewMode] = useState<ViewMode>("unified");

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
          <Link to="/" className="back-link">
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
        <div className="view-toggle" role="tablist" aria-label="Diff layout">
          <button
            role="tab"
            aria-selected={viewMode === "unified"}
            className={viewMode === "unified" ? "active" : ""}
            onClick={() => setViewMode("unified")}
          >
            Unified
          </button>
          <button
            role="tab"
            aria-selected={viewMode === "split"}
            className={viewMode === "split" ? "active" : ""}
            onClick={() => setViewMode("split")}
          >
            Split
          </button>
        </div>
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
            key={f.path}
            file={f}
            annotations={threadIndex.annByFile.get(f.path) ?? []}
            fileThreads={threadIndex.fileLevel.get(f.path) ?? []}
            themeType={themeType}
            viewMode={viewMode}
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

const PIERRE_THEME = { dark: "pierre-dark", light: "pierre-light" } as const;

function FileBlock({
  file,
  annotations,
  fileThreads,
  themeType,
  viewMode,
  onChange,
}: {
  file: PatchFile;
  annotations: LineThreads[];
  fileThreads: Thread[];
  themeType: Theme;
  viewMode: ViewMode;
  onChange: () => void;
}) {
  const openCount = annotations.reduce(
    (n, a) => n + a.metadata.filter((t) => t.status === "open").length,
    0,
  );
  return (
    <div className="file-block">
      {fileThreads.length > 0 && (
        <div className="file-threads">
          {fileThreads.map((t) => (
            <ThreadCard key={t.id} thread={t} onChange={onChange} />
          ))}
        </div>
      )}
      <PatchDiff<Thread[]>
        patch={file.patch}
        className="pierre-diff"
        options={{
          theme: PIERRE_THEME,
          themeType,
          diffStyle: viewMode,
          diffIndicators: "bars",
          lineDiffType: "word",
          stickyHeader: true,
        }}
        lineAnnotations={annotations}
        renderHeaderMetadata={() =>
          openCount > 0 ? <span className="file-badge">{openCount} open</span> : null
        }
        renderAnnotation={(a) => (
          <div className="pierre-annotation">
            {a.metadata.map((t) => (
              <ThreadCard key={t.id} thread={t} onChange={onChange} />
            ))}
          </div>
        )}
      />
    </div>
  );
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
