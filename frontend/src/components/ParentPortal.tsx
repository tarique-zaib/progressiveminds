import { useCallback, useEffect, useState } from "react";
import "./ParentPortal.css";

type User = { id: string; email: string; firstName: string; lastName: string; roles: string[] };
type Child = {
  studentId: string; instituteId: string; instituteName: string; fullName: string;
  admissionNumber: string; courseName: string; parentName: string | null; parentPhone: string | null;
  academicSessionId: string | null; academicSessionName: string | null;
};
type Attendance = {
  summary: { total: number; present: number; absent: number; late: number; excused: number; percentage: number };
  records: { id: string; attendanceDate: string; status: string; notes: string | null }[];
};
type Assessment = { assessmentId: string; title: string; assessmentType: string; assessmentDate: string; subjectName: string; maxMarks: number; marksObtained: number; remarks: string | null };
type Fee = { id: string; title: string; amount: number; paid: number; balance: number; dueDate: string; status: string; payments: { id: string; amount: number; method: string; referenceNumber: string | null; receiptNumber: string | null; paidAtUtc: string }[] };

export default function ParentPortal({ token, user, onSignOut, apiBase }: { token: string; user: User; onSignOut: () => void; apiBase: string }) {
  const [children, setChildren] = useState<Child[]>([]);
  const [studentId, setStudentId] = useState("");
  const [tab, setTab] = useState<"overview" | "attendance" | "assessments" | "fees">("overview");
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  const request = useCallback(async <T,>(path: string): Promise<T> => {
    const response = await fetch(`${apiBase}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message ?? body?.title ?? `Request failed (${response.status})`);
    return body as T;
  }, [apiBase, token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    request<Child[]>("/api/parent-portal/children").then(rows => {
      if (cancelled) return;
      setChildren(rows);
      setStudentId(current => rows.some(x => x.studentId === current) ? current : (rows[0]?.studentId ?? ""));
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load linked children."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [request]);

  useEffect(() => {
    if (!studentId) { setAttendance(null); setAssessments([]); setFees([]); return; }
    let cancelled = false;
    setDetailLoading(true); setError("");
    Promise.all([
      request<Attendance>(`/api/parent-portal/children/${studentId}/attendance`),
      request<Assessment[]>(`/api/parent-portal/children/${studentId}/assessments`),
      request<Fee[]>(`/api/parent-portal/children/${studentId}/fees`),
    ]).then(([a, b, f]) => { if (!cancelled) { setAttendance(a); setAssessments(b); setFees(f); } })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load student details."); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [request, studentId]);

  const child = children.find(x => x.studentId === studentId);
  const totalFees = fees.reduce((sum, f) => sum + f.amount, 0);
  const totalPaid = fees.reduce((sum, f) => sum + f.paid, 0);
  const balance = fees.reduce((sum, f) => sum + f.balance, 0);
  const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
  const date = (value: string) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return <main className="parent-portal">
    <header className="pp-header"><div className="pp-brand"><div className="pp-logo">P</div><div><strong>ProgressiveMinds</strong><small>PARENT PORTAL</small></div></div><div className="pp-account"><span>{user.firstName} {user.lastName}<small>{user.email}</small></span><button onClick={onSignOut} className="pp-button pp-quiet">Sign out</button></div></header>
    <section className="pp-welcome"><div><div className="pp-eyebrow">FAMILY ACADEMIC OVERVIEW</div><h1>Your child's progress, <span>all in one place.</span></h1><p>View attendance, assessment results and fee information securely.</p></div>{children.length > 0 && <label className="pp-child-picker">Select child<select value={studentId} onChange={e => setStudentId(e.target.value)}>{children.map(c => <option key={c.studentId} value={c.studentId}>{c.fullName} · {c.admissionNumber}</option>)}</select></label>}</section>
    {error && <div className="pp-alert" role="alert">{error}</div>}
    {loading ? <div className="pp-empty">Loading your linked children…</div> : children.length === 0 ? <div className="pp-empty"><h2>No linked child yet</h2><p>Your institute administrator must create a verified parent link before student information can be shown.</p></div> : child && <>
      <section className="pp-child-card"><div className="pp-avatar">{child.fullName.charAt(0).toUpperCase()}</div><div><h2>{child.fullName}</h2><p>{child.admissionNumber} · {child.courseName}</p><small>{child.instituteName}{child.academicSessionName ? ` · ${child.academicSessionName}` : ""}</small></div><span className="pp-secure">Linked student</span></section>
      <nav className="pp-tabs" aria-label="Parent portal sections">{([ ["overview","Overview"], ["attendance","Attendance"], ["assessments","Assessments"], ["fees","Fees & payments"] ] as const).map(([key,label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</nav>
      {detailLoading && <div className="pp-loading">Refreshing student information…</div>}
      {tab === "overview" && <><section className="pp-stats"><article><span>Attendance</span><strong>{attendance?.summary.percentage ?? 0}%</strong><small>{attendance?.summary.present ?? 0} present out of {attendance?.summary.total ?? 0} recorded days</small></article><article><span>Assessment records</span><strong>{assessments.length}</strong><small>Published marks available</small></article><article><span>Total fees</span><strong>{money(totalFees)}</strong><small>Recorded fee obligations</small></article><article><span>Outstanding</span><strong>{money(balance)}</strong><small>Paid so far: {money(totalPaid)}</small></article></section><div className="pp-columns"><section className="pp-panel"><div className="pp-panel-heading"><h3>Recent attendance</h3><button onClick={() => setTab("attendance")}>View all</button></div>{(attendance?.records ?? []).slice(0,5).map(r => <div className="pp-row" key={r.id}><span>{date(r.attendanceDate)}</span><span className={`pp-status ${r.status.toLowerCase()}`}>{r.status}</span></div>)}{!attendance?.records.length && <p className="pp-muted">No attendance records available.</p>}</section><section className="pp-panel"><div className="pp-panel-heading"><h3>Recent assessments</h3><button onClick={() => setTab("assessments")}>View all</button></div>{assessments.slice(0,5).map((a,i) => <div className="pp-row" key={`${a.assessmentId}-${a.subjectName}-${i}`}><span><strong>{a.title}</strong><small>{a.subjectName} · {date(a.assessmentDate)}</small></span><strong>{a.marksObtained} / {a.maxMarks}</strong></div>)}{!assessments.length && <p className="pp-muted">No assessment results available.</p>}</section></div></>}
      {tab === "attendance" && <section className="pp-panel"><div className="pp-panel-heading"><h3>Attendance history</h3><span>{attendance?.summary.percentage ?? 0}% attendance</span></div><div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>Date</th><th>Status</th><th>Notes</th></tr></thead><tbody>{(attendance?.records ?? []).map(r => <tr key={r.id}><td>{date(r.attendanceDate)}</td><td><span className={`pp-status ${r.status.toLowerCase()}`}>{r.status}</span></td><td>{r.notes || "—"}</td></tr>)}</tbody></table></div>{!attendance?.records.length && <p className="pp-muted">No attendance records available.</p>}</section>}
      {tab === "assessments" && <section className="pp-panel"><div className="pp-panel-heading"><h3>Assessment results</h3><span>{assessments.length} records</span></div><div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>Assessment</th><th>Subject</th><th>Date</th><th>Marks</th><th>Remarks</th></tr></thead><tbody>{assessments.map((a,i) => <tr key={`${a.assessmentId}-${a.subjectName}-${i}`}><td>{a.title}<small>{a.assessmentType}</small></td><td>{a.subjectName}</td><td>{date(a.assessmentDate)}</td><td><strong>{a.marksObtained} / {a.maxMarks}</strong></td><td>{a.remarks || "—"}</td></tr>)}</tbody></table></div>{!assessments.length && <p className="pp-muted">No assessment results available.</p>}</section>}
      {tab === "fees" && <><section className="pp-stats pp-fee-stats"><article><span>Total billed</span><strong>{money(totalFees)}</strong></article><article><span>Paid</span><strong>{money(totalPaid)}</strong></article><article><span>Outstanding</span><strong>{money(balance)}</strong></article></section>{fees.map(f => <section className="pp-panel pp-fee-card" key={f.id}><div className="pp-panel-heading"><div><h3>{f.title}</h3><small>Due {date(f.dueDate)}</small></div><span className={`pp-status ${f.status.toLowerCase()}`}>{f.status}</span></div><div className="pp-fee-numbers"><span>Fee <strong>{money(f.amount)}</strong></span><span>Paid <strong>{money(f.paid)}</strong></span><span>Balance <strong>{money(f.balance)}</strong></span></div>{f.payments.length > 0 && <div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>Payment date</th><th>Amount</th><th>Method</th><th>Receipt / reference</th></tr></thead><tbody>{f.payments.map(p => <tr key={p.id}><td>{date(p.paidAtUtc)}</td><td>{money(p.amount)}</td><td>{p.method}</td><td>{p.receiptNumber || p.referenceNumber || "—"}</td></tr>)}</tbody></table></div>}{f.payments.length === 0 && <p className="pp-muted">No payments recorded.</p>}</section>)}{!fees.length && <section className="pp-panel"><p className="pp-muted">No fee records available.</p></section>}</>}
    </>}
    <footer className="pp-footer">ProgressiveMinds · Parent access is read-only. Contact your institute for corrections or account-linking requests.</footer>
  </main>;
}
