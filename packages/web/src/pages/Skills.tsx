import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";

export function Skills() {
  const { repoId } = useParams();
  const id = Number(repoId);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string>("");

  useEffect(() => {
    api.skills(id).then((r) => setBody(r.body));
  }, [id]);

  async function save() {
    setSaving(true);
    try {
      await api.saveSkills(id, body);
      setSaved(new Date().toLocaleTimeString());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="skills-page">
      <header className="page-header">
        <Link to="/" className="muted">
          ← All PRs
        </Link>
        <h1>Reviewer rules for this repo</h1>
        <p className="muted">
          Free-form markdown. Injected into the AI's prompt on every review, reply, and revalidate.
        </p>
      </header>
      <textarea
        className="skills-textarea"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`Examples:\n- Flag any new dependency added to package.json.\n- Ignore comments about formatting; prettier handles it.\n- Pay extra attention to authentication code in src/auth/**.`}
      />
      <div className="row">
        <button className="btn primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="muted small">Saved {saved}</span>}
      </div>
    </div>
  );
}
