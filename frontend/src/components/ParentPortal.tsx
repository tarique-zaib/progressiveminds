import { useCallback, useEffect, useMemo, useState } from "react";
import "./ParentPortal.css";

type User = { id: string; email: string; firstName: string; lastName: string; roles: string[] };
type Child = {
  studentId: string;
  instituteId: string;
  instituteName: string;
  fullName: string;
  admissionNumber: string;
  courseName: string;
  parentName: string | null;
  parentPhone: string | null;
  currentSessionId: string | null;
  currentSessionName: string | null;
};
type AttendanceRecord = { id: string; attendanceDate: string; status: string; notes: string | null };
type Attendance = {
  summary: {
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    attendancePercentage: number;
  };
  records: AttendanceRecord[];
};
type Assessment = {
  assessmentId: string;
  title: string;
  assessmentType: string;
  assessmentDate: string;
  subject: string;
  maxMarks: number;
  marksObtained: number | null;
  remarks: string | null;
};
type Payment = {
  id: string;
  amount: number;
  method: string;
  referenceNumber: string | null;
  receiptNumber: string;
  paidAtUtc: string;
};
type Fee = {
  feeId: string;
  title: string;
  amount: number;
  paidAmount: number;
  balance: number;
  dueDate: string;
  status: string;
  payments: Payment[];
};
type Tab = "overview" | "attendance" | "assessments" | "fees";

export default function ParentPortal({
  token,
  user,
  onSignOut,
  apiBase,
}: {
  token: string;
  user: User;
  onSignOut: () => void;
  apiBase: string;
}) {
  const [children, setChildren] = useState<Child[]>([]);
  const [studentId, setStudentId] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  const request = useCallback(async <T,>(path: string): Promise<T> => {
    const response = await fetch(`${apiBase}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) throw new Error("Your session has expired. Please sign in again.");
      if (response.status === 403) throw new Error("This account does not have permission to view parent information.");
      throw new Error(body?.message ?? body?.title ?? `Request failed (${response.status}).`);
    }
    return body as T;
  }, [apiBase, token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    request<Child[]>("/api/parent-portal/children")
      .then((rows) => {
        if (cancelled) return;
        setChildren(rows);
        setStudentId((current) => rows.some((x) => x.studentId === current) ? current : (rows[0]?.studentId ?? ""));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load linked children.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [request]);

  useEffect(() => {
    if (!studentId) {
      setAttendance(null);
      setAssessments([]);
      setFees([]);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setError("");
    Promise.all([
      request<Attendance>(`/api/parent-portal/children/${studentId}/attendance`),
      request<Assessment[]>(`/api/parent-portal/children/${studentId}/assessments`),
      request<Fee[]>(`/api/parent-portal/children/${studentId}/fees`),
    ])
      .then(([a, b, f]) => {
        if (!cancelled) {
          setAttendance(a);
          setAssessments(b);
          setFees(f);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load student details.");
      })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [request, studentId]);

  const child = children.find((x) => x.studentId === studentId);
  const totalFees = fees.reduce((sum, fee) => sum + fee.amount, 0);
  const totalPaid = fees.reduce((sum, fee) => sum + fee.paidAmount, 0);
  const balance = fees.reduce((sum, fee) => sum + fee.balance, 0);
  const recentPayments = useMemo(
    () => fees.flatMap((fee) => fee.payments.map((payment) => ({ ...payment, feeTitle: fee.title })))
      .sort((a, b) => new Date(b.paidAtUtc).getTime() - new Date(a.paidAtUtc).getTime())
      .slice(0, 5),
    [fees],
  );
  const money = (value: number) => new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2,
  }).format(value);
  const date = (value: string | null | undefined) => value
    ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
  const percentage = attendance?.summary.attendancePercentage ?? 0;
  const markPercentage = (a: Assessment) => a.marksObtained == null || a.maxMarks <= 0
    ? null : Math.round((a.marksObtained / a.maxMarks) * 100);
  const statusClass = (status: string) => status.toLowerCase().replace(/[^a-z0-9-]/g, "");

  return (
    <main className="parent-portal">
      <header className="pp-header">
        <div className="pp-brand"><div className="pp-logo">P</div><div><strong>ProgressiveMinds</strong><small>PARENT PORTAL</small></div></div>
        <div className="pp-account"><span>{user.firstName} {user.lastName}<small>{user.email}</small></span><button onClick={onSignOut} className="pp-button pp-quiet">Sign out</button></div>
      </header>

      <section className="pp-welcome">
        <div><div className="pp-eyebrow">FAMILY ACADEMIC OVERVIEW</div><h1>Your child's progress, <span>all in one place.</span></h1><p>Track attendance, assessment results and fee information securely.</p></div>
        {children.length > 0 && <label className="pp-child-picker">Select child<select value={studentId} onChange={(e) => setStudentId(e.target.value)}>{children.map((c) => <option key={c.studentId} value={c.studentId}>{c.fullName} · {c.admissionNumber}</option>)}</select></label>}
      </section>

      {error && <div className="pp-alert" role="alert">{error}</div>}
      {loading ? <div className="pp-empty"><span className="pp-loading-dot" /> Loading your linked children…</div> : children.length === 0 ? (
        <div className="pp-empty"><div className="pp-empty-icon">⌂</div><h2>No linked child yet</h2><p>Your institute administrator must create a verified parent link before student information can be shown.</p></div>
      ) : child && <>
        <section className="pp-child-card">
          <div className="pp-avatar">{child.fullName.charAt(0).toUpperCase()}</div>
          <div className="pp-child-info"><h2>{child.fullName}</h2><p>{child.admissionNumber} · {child.courseName}</p><small>{child.instituteName}{child.currentSessionName ? ` · ${child.currentSessionName}` : ""}</small></div>
          <span className="pp-secure"><span aria-hidden="true">✓</span> Verified link</span>
        </section>

        <nav className="pp-tabs" aria-label="Parent portal sections">
          {([ ["overview", "Overview"], ["attendance", "Attendance"], ["assessments", "Assessments"], ["fees", "Fees & payments"] ] as const).map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>{label}</button>)}
        </nav>
        {detailLoading && <div className="pp-loading" role="status">Refreshing student information…</div>}

        {tab === "overview" && <>
          <section className="pp-stats" aria-label="Student summary">
            <article className="pp-stat-attendance"><span>Attendance rate</span><strong>{percentage.toFixed(percentage % 1 === 0 ? 0 : 1)}%</strong><div className="pp-progress" role="progressbar" aria-label="Attendance percentage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, percentage))}><span style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }} /></div><small>{attendance?.summary.present ?? 0} present · {attendance?.summary.total ?? 0} recorded days</small></article>
            <article><span>Assessment results</span><strong>{assessments.length}</strong><small>{assessments.length === 1 ? "Result available" : "Results available"}</small></article>
            <article><span>Total fees</span><strong>{money(totalFees)}</strong><small>Recorded fee obligations</small></article>
            <article className={balance > 0 ? "pp-stat-balance" : "pp-stat-paid"}><span>Outstanding balance</span><strong>{money(balance)}</strong><small>{balance > 0 ? `Paid so far: ${money(totalPaid)}` : "No outstanding fee balance"}</small></article>
          </section>

          <div className="pp-columns">
            <section className="pp-panel"><div className="pp-panel-heading"><div><h3>Recent attendance</h3><small>Latest recorded school days</small></div><button onClick={() => setTab("attendance")}>View all →</button></div>
              {(attendance?.records ?? []).slice(0, 5).map((record) => <div className="pp-row" key={record.id}><span>{date(record.attendanceDate)}{record.notes && <small>{record.notes}</small>}</span><span className={`pp-status ${statusClass(record.status)}`}>{record.status}</span></div>)}
              {!attendance?.records.length && <p className="pp-muted">No attendance records available yet.</p>}
            </section>
            <section className="pp-panel"><div className="pp-panel-heading"><div><h3>Recent assessments</h3><small>Latest recorded results</small></div><button onClick={() => setTab("assessments")}>View all →</button></div>
              {assessments.slice(0, 5).map((a, i) => <div className="pp-row" key={`${a.assessmentId}-${a.subject}-${i}`}><span><strong>{a.title}</strong><small>{a.subject} · {date(a.assessmentDate)}</small></span><strong className="pp-score">{a.marksObtained == null ? "Not graded" : `${a.marksObtained} / ${a.maxMarks}`}{markPercentage(a) !== null && <small>{markPercentage(a)}%</small>}</strong></div>)}
              {!assessments.length && <p className="pp-muted">No assessment results available yet.</p>}
            </section>
          </div>

          <section className="pp-panel pp-recent-payments"><div className="pp-panel-heading"><div><h3>Recent fee payments</h3><small>Receipts recorded by the institute</small></div><button onClick={() => setTab("fees")}>View fees →</button></div>
            {recentPayments.length ? <div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>Payment date</th><th>Fee</th><th>Amount</th><th>Method</th><th>Receipt</th></tr></thead><tbody>{recentPayments.map((p) => <tr key={p.id}><td>{date(p.paidAtUtc)}</td><td>{p.feeTitle}</td><td><strong>{money(p.amount)}</strong></td><td>{p.method}</td><td>{p.receiptNumber || p.referenceNumber || "—"}</td></tr>)}</tbody></table></div> : <p className="pp-muted">No fee payments recorded for this student.</p>}
          </section>
        </>}

        {tab === "attendance" && <section className="pp-panel"><div className="pp-panel-heading"><div><h3>Attendance history</h3><small>{attendance?.summary.total ?? 0} recorded days</small></div><span className="pp-status">{percentage.toFixed(percentage % 1 === 0 ? 0 : 1)}% attendance</span></div>
          <div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>Date</th><th>Status</th><th>Notes</th></tr></thead><tbody>{(attendance?.records ?? []).map((r) => <tr key={r.id}><td>{date(r.attendanceDate)}</td><td><span className={`pp-status ${statusClass(r.status)}`}>{r.status}</span></td><td>{r.notes || "—"}</td></tr>)}</tbody></table></div>
          {!attendance?.records.length && <p className="pp-muted">No attendance records available.</p>}
        </section>}

        {tab === "assessments" && <section className="pp-panel"><div className="pp-panel-heading"><div><h3>Assessment results</h3><small>{assessments.length} records</small></div></div>
          <div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>Assessment</th><th>Subject</th><th>Date</th><th>Marks</th><th>Score</th><th>Remarks</th></tr></thead><tbody>{assessments.map((a, i) => <tr key={`${a.assessmentId}-${a.subject}-${i}`}><td>{a.title}<small>{a.assessmentType}</small></td><td>{a.subject}</td><td>{date(a.assessmentDate)}</td><td><strong>{a.marksObtained == null ? "—" : `${a.marksObtained} / ${a.maxMarks}`}</strong></td><td>{markPercentage(a) === null ? "—" : `${markPercentage(a)}%`}</td><td>{a.remarks || "—"}</td></tr>)}</tbody></table></div>
          {!assessments.length && <p className="pp-muted">No assessment results available.</p>}
        </section>}

        {tab === "fees" && <>
          <section className="pp-stats pp-fee-stats"><article><span>Total billed</span><strong>{money(totalFees)}</strong></article><article className="pp-stat-paid"><span>Total paid</span><strong>{money(totalPaid)}</strong></article><article className={balance > 0 ? "pp-stat-balance" : "pp-stat-paid"}><span>Outstanding</span><strong>{money(balance)}</strong></article></section>
          {fees.map((fee) => <section className="pp-panel pp-fee-card" key={fee.feeId}><div className="pp-panel-heading"><div><h3>{fee.title}</h3><small>Due {date(fee.dueDate)}</small></div><span className={`pp-status ${statusClass(fee.status)}`}>{fee.status}</span></div>
            <div className="pp-fee-numbers"><span>Fee amount<strong>{money(fee.amount)}</strong></span><span>Paid<strong>{money(fee.paidAmount)}</strong></span><span>Balance<strong>{money(fee.balance)}</strong></span></div>
            {fee.payments.length > 0 ? <div className="pp-table-wrap"><table className="pp-table"><thead><tr><th>Payment date</th><th>Amount</th><th>Method</th><th>Receipt / reference</th></tr></thead><tbody>{fee.payments.map((p) => <tr key={p.id}><td>{date(p.paidAtUtc)}</td><td>{money(p.amount)}</td><td>{p.method}</td><td>{p.receiptNumber || p.referenceNumber || "—"}</td></tr>)}</tbody></table></div> : <p className="pp-muted">No payments recorded for this fee.</p>}
          </section>)}
          {!fees.length && <section className="pp-panel pp-no-fees"><div className="pp-empty-icon">₹</div><h3>No fee records available</h3><p className="pp-muted">No fee obligations have been assigned to this student. Contact the institute if you expected a fee to appear.</p></section>}
        </>}
      </>}
      <footer className="pp-footer">ProgressiveMinds · Parent access is read-only. Contact your institute for corrections or account-linking requests.</footer>
    </main>
  );
}
