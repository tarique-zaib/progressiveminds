import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import "./ParentManagement.css";

const API_BASE = "http://localhost:5080";
type Student = { id: string; fullName: string; admissionNumber: string; isActive?: boolean };
type LinkRow = { id: string; studentId: string; studentName: string; parentUserId: string; parentEmail: string; linkedAtUtc: string; isActive: boolean };
type Parent = { id: string; firstName: string; lastName: string; email: string; phoneNumber: string | null; roles: string[] };
type Props = { token: string | null; instituteId: string; students: Student[] };

export default function ParentManagement({ token, instituteId, students }: Props) {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"create" | "existing">("create");
  const [parentAccounts, setParentAccounts] = useState<Parent[]>([]);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phoneNumber: "", password: "" });
  const [studentId, setStudentId] = useState("");
  const [existingParentId, setExistingParentId] = useState("");

  const api = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    if (!token) throw new Error("Please sign in again.");
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message ?? body?.title ?? `Request failed (${response.status}).`);
    return body as T;
  }, [token]);

  const load = useCallback(async () => {
    if (!token || !instituteId) { setLinks([]); setParentAccounts([]); return; }
    setLoading(true); setError("");
    try {
      const rows = await api<LinkRow[]>(`/api/institutes/${instituteId}/parent-links`);
      setLinks(rows);
      const unique = new Map<string, Parent>();
      rows.forEach(row => unique.set(row.parentUserId, { id: row.parentUserId, firstName: "", lastName: "", email: row.parentEmail, phoneNumber: null, roles: ["Parent"] }));
      setParentAccounts([...unique.values()]);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load parent links."); }
    finally { setLoading(false); }
  }, [api, instituteId, token]);
  useEffect(() => { void load(); }, [load]);

  const filteredLinks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return links.filter(x => !q || `${x.studentName} ${x.parentEmail}`.toLowerCase().includes(q));
  }, [links, search]);
  const activeStudents = useMemo(() => students.filter(s => s.isActive !== false), [students]);

  async function createAndLink(e: FormEvent) {
    e.preventDefault(); setError(""); setNotice(""); setSaving(true);
    try {
      let parentId = existingParentId;
      if (mode === "create") {
        const parent = await api<Parent>(`/api/institutes/${instituteId}/parent-accounts`, { method: "POST", body: JSON.stringify(form) });
        parentId = parent.id;
      }
      if (!parentId || !studentId) throw new Error("Select a student and parent account.");
      await api(`/api/institutes/${instituteId}/parent-links`, { method: "POST", body: JSON.stringify({ studentId, parentUserId: parentId }) });
      setNotice("Parent account created and student linked successfully. Share the login email and initial password with the parent securely.");
      setForm({ firstName: "", lastName: "", email: "", phoneNumber: "", password: "" });
      setStudentId(""); setExistingParentId(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create parent link."); }
    finally { setSaving(false); }
  }

  async function deactivate(row: LinkRow) {
    if (!window.confirm(`Deactivate ${row.parentEmail}'s link to ${row.studentName}?`)) return;
    setError(""); setNotice("");
    try { await api(`/api/institutes/${instituteId}/parent-links/${row.id}/deactivate`, { method: "PATCH" }); setNotice("Parent-student link deactivated."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not deactivate link."); }
  }

  return <div className="parent-management">
    <div className="pm-toolbar"><div><div className="eyebrow">FAMILY ACCESS</div><h2>Parent Accounts</h2><p>Create parent logins and securely link them to students.</p></div><button className="button button-secondary" type="button" onClick={() => void load()} disabled={loading}>Refresh</button></div>
    {error && <div className="pm-alert pm-error">{error}</div>}{notice && <div className="pm-alert pm-success">{notice}</div>}
    <section className="pm-card">
      <h3>Create login and link student</h3>
      <div className="pm-mode"><button type="button" className={mode === "create" ? "selected" : ""} onClick={() => setMode("create")}>Create new parent</button><button type="button" className={mode === "existing" ? "selected" : ""} onClick={() => setMode("existing")}>Use listed parent</button></div>
      <form onSubmit={createAndLink}>
        {mode === "create" ? <div className="pm-grid">
          <label>First name<input required maxLength={100} value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} /></label>
          <label>Last name<input required maxLength={100} value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} /></label>
          <label>Email / login ID<input required type="email" maxLength={254} autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
          <label>Mobile number (optional)<input type="tel" maxLength={40} value={form.phoneNumber} onChange={e => setForm({ ...form, phoneNumber: e.target.value })} /></label>
          <label className="pm-wide">Initial password<input required type="password" minLength={8} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /><small>Use a strong temporary password and share it privately. Password reset/activation email is not configured yet.</small></label>
        </div> : <label>Existing parent account<select required value={existingParentId} onChange={e => setExistingParentId(e.target.value)}><option value="">Select a parent already linked in this institute</option>{parentAccounts.map(p => <option key={p.id} value={p.id}>{p.email}</option>)}</select><small>This list contains parent accounts already represented in the current institute's link list.</small></label>}
        <div className="pm-grid pm-link-grid"><label>Student<select required value={studentId} onChange={e => setStudentId(e.target.value)}><option value="">Select student</option>{activeStudents.map(s => <option key={s.id} value={s.id}>{s.fullName} — {s.admissionNumber}</option>)}</select></label><div className="pm-submit"><button className="button button-primary" type="submit" disabled={saving || !instituteId || activeStudents.length === 0}>{saving ? "Saving…" : mode === "create" ? "Create login & link student" : "Link student"}</button></div></div>
      </form>
    </section>
    <section className="pm-card"><div className="pm-list-header"><div><h3>Parent-student links</h3><p>{links.filter(x => x.isActive).length} active · {links.length} total</p></div><input aria-label="Search links" placeholder="Search student or parent email" value={search} onChange={e => setSearch(e.target.value)} /></div>
      {loading ? <p>Loading parent links…</p> : filteredLinks.length === 0 ? <div className="pm-empty">No parent links found for this institute.</div> : <div className="pm-table-wrap"><table><thead><tr><th>Student</th><th>Parent login</th><th>Linked</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredLinks.map(row => <tr key={row.id}><td>{row.studentName}</td><td>{row.parentEmail}</td><td>{new Date(row.linkedAtUtc).toLocaleDateString("en-IN")}</td><td><span className={`pm-status ${row.isActive ? "active" : "inactive"}`}>{row.isActive ? "Active" : "Inactive"}</span></td><td>{row.isActive && <button className="pm-danger" type="button" onClick={() => void deactivate(row)}>Deactivate</button>}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
