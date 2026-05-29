import { getDb, type SkillsRow } from "./db.js";

export function getSkills(repoId: number): string {
  const row = getDb().prepare("SELECT * FROM skills WHERE repo_id = ?").get(repoId) as
    | SkillsRow
    | undefined;
  return row?.body ?? "";
}

export function setSkills(repoId: number, body: string): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      INSERT INTO skills (repo_id, body, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(repo_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at
    `,
    )
    .run(repoId, body, now);
}
