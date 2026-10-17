import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import "./FeeManagement.css";

const API_BASE = "http://localhost:5080";
type Student = { id: string; fullName: string; admissionNumber: string; courseId: string };
type Session = { id: string; name: string };
type Payment = { id: string; amount: number; method: string; referenceNumber: string | null; receiptNumber: string; paidAtUtc: string; notes: string | null };
type Fee = { id: string; studentId: string; studentName: string; admissionNumber: string; academicSessionId: string; sessionName: string; title: string; amount: number; paidAmount: number; balance: number; dueDate: string; status: string; notes: string | null; payments: Payment[] };
type Props = { token: string | null; instituteId: string; selectedSessionId: string; students: Student[]; sessions: Session[] };
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);

export default function FeeManagement({ token, instituteId, selectedSessionId, students, sessions }: Props) {
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [sessionId, setSessionId] = useState(selectedSessionId);
  const [title, setTitle] = useState("Tuition Fee");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [notes, setNotes] = useState("");
  const [payingFee, setPayingFee] = useState<Fee | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [method, setMethod] = useState("UPI");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    if (!token) throw new Error("Please sign in again.");
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message ?? body?.title ?? `Request failed (${response.status}).`);
    return body;
  }, [token]);

  const loadFees = useCallback(async () => {
    if (!instituteId || !token) { setFees([]); return; }
    setLoading(true); setError("");
    try {
      const query = selectedSessionId ? `?academicSessionId=${encodeURIComponent(selectedSessionId)}` : "";
      setFees(await api(`/api/institutes/${instituteId}/fees${query}`) as Fee[]);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load fees."); }
    finally { setLoading(false); }
  }, [api, instituteId, selectedSessionId, token]);
  useEffect(() => { void loadFees(); }, [loadFees]);
  useEffect(() => { setSessionId(selectedSessionId); }, [selectedSessionId]);

  const filtered = useMemo(() => statusFilter === "All" ? fees : fees.filter(f => f.status === statusFilter), [fees, statusFilter]);
  const totals = useMemo(() => ({ billed: fees.reduce((s, f) => s + f.amount, 0), collected: fees.reduce((s, f) => s + f.paidAmount, 0), outstanding: fees.reduce((s, f) => s + f.balance, 0), overdue: fees.filter(f => f.status === "Overdue").reduce((s, f) => s + f.balance, 0) }), [fees]);

  async function createFee(e: FormEvent) {
    e.preventDefault(); setError(""); setNotice("");
    try {
      await api(`/api/institutes/${instituteId}/fees`, { method: "POST", body: JSON.stringify({ studentId, academicSessionId: sessionId, title, amount: Number(amount), dueDate, notes }) });
      setShowForm(false); setAmount(""); setNotes(""); setNotice("Fee assigned successfully."); await loadFees();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not assign fee."); }
  }
  async function recordPayment(e: FormEvent) {
    e.preventDefault(); if (!payingFee) return;
    setError(""); setNotice("");
    try {
      const result = await api(`/api/institutes/${instituteId}/fees/${payingFee.id}/payments`, { method: "POST", body: JSON.stringify({ amount: Number(paymentAmount), method, referenceNumber, notes: paymentNotes }) }) as Payment;
      setPayingFee(null); setPaymentAmount(""); setReferenceNumber(""); setPaymentNotes(""); setNotice(`Payment recorded. Receipt: ${result.receiptNumber}`); await loadFees();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not record payment."); }
  }
  function printReceipt(fee: Fee, payment: Payment) {
    const win = window.open("", "_blank", "width=720,height=800");
    if (!win) { setError("Allow pop-ups to print receipts."); return; }
    win.document.write(`<!doctype html><html><head><title>Receipt ${payment.receiptNumber}</title><style>body{font:16px Arial,sans-serif;padding:40px;color:#222}h1{margin-bottom:4px}.muted{color:#666}.line{border-top:1px solid #ddd;margin:24px 0}.amount{font-size:28px;font-weight:bold}</style></head><body><h1>ProgressiveMinds</h1><div class="muted">Fee payment receipt</div><div class="line"></div><p><b>Receipt:</b> ${payment.receiptNumber}</p><p><b>Student:</b> ${fee.studentName} (${fee.admissionNumber})</p><p><b>Fee:</b> ${fee.title}</p><p><b>Date:</b> ${new Date(payment.paidAtUtc).toLocaleString("en-IN")}</p><p><b>Payment method:</b> ${payment.method}</p><p><b>Reference:</b> ${payment.referenceNumber || "—"}</p><div class="line"></div><div class="muted">Amount received</div><div class="amount">${money(payment.amount)}</div><p>Outstanding balance after this payment: ${money(Math.max(0, fee.balance - payment.amount))}</p><div class="line"></div><p class="muted">This receipt records a payment entered by the institute.</p><script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  }

  return <div className="fee-management">
    <div className="fee-toolbar"><div><div className="eyebrow">FINANCE</div><h2>Fee Management</h2><p>Assign student fees, record instalments and issue receipts.</p></div><button className="button button-primary" disabled={!instituteId || students.length === 0 || sessions.length === 0} onClick={() => setShowForm(v => !v)}>{showForm ? "Cancel" : "+ Assign fee"}</button></div>
    {error && <div className="fee-alert error">{error}</div>}{notice && <div className="fee-alert success">{notice}</div>}
    <div className="fee-metrics"><article><span>Total billed</span><strong>{money(totals.billed)}</strong></article><article><span>Collected</span><strong>{money(totals.collected)}</strong></article><article><span>Outstanding</span><strong>{money(totals.outstanding)}</strong></article><article><span>Overdue balance</span><strong>{money(totals.overdue)}</strong></article></div>
    {showForm && <form className="panel fee-form" onSubmit={createFee}><h3>Assign fee to student</h3><div className="fee-form-grid"><label>Student<select required value={studentId} onChange={e => setStudentId(e.target.value)}><option value="">Select student</option>{students.map(s => <option key={s.id} value={s.id}>{s.fullName} — {s.admissionNumber}</option>)}</select></label><label>Academic session<select required value={sessionId} onChange={e => setSessionId(e.target.value)}><option value="">Select session</option>{sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Fee title<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></label><label>Amount (INR)<input required type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label><label>Due date<input required type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label><label>Notes (optional)<input maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} /></label></div><button className="button button-primary" type="submit">Save fee</button></form>}
    {payingFee && <form className="panel fee-form" onSubmit={recordPayment}><h3>Record payment · {payingFee.studentName}</h3><p>Outstanding: <b>{money(payingFee.balance)}</b></p><div className="fee-form-grid"><label>Payment amount<input required type="number" min="0.01" max={payingFee.balance} step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} /></label><label>Method<select value={method} onChange={e => setMethod(e.target.value)}><option>UPI</option><option>Cash</option><option>Bank Transfer</option></select></label><label>Transaction/reference number<input maxLength={100} value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} /></label><label>Notes<input maxLength={500} value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} /></label></div><button className="button button-primary" type="submit">Record payment</button> <button className="button button-ghost" type="button" onClick={() => setPayingFee(null)}>Cancel</button></form>}
    <section className="panel fee-table-panel"><div className="fee-list-heading"><div><h3>Student fee ledger</h3><p>{filtered.length} fee record(s)</p></div><div className="fee-list-actions"><select aria-label="Filter fee status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option>All</option><option>Pending</option><option>Partial</option><option>Paid</option><option>Overdue</option></select><button className="button button-ghost" onClick={() => void loadFees()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div></div>
      {!instituteId ? <div className="empty-state">Choose an institute to view fees.</div> : loading ? <p>Loading fee records…</p> : filtered.length === 0 ? <div className="empty-state"><h3>No fee records</h3><p>Assign a fee to a student to start tracking collections.</p></div> : <div className="fee-table-scroll"><table className="fee-table"><thead><tr><th>Student</th><th>Fee</th><th>Due date</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map(f => <tr key={f.id}><td><b>{f.studentName}</b><small>{f.admissionNumber}</small></td><td>{f.title}<small>{f.sessionName}</small></td><td>{f.dueDate}</td><td>{money(f.amount)}</td><td>{money(f.paidAmount)}</td><td><b>{money(f.balance)}</b></td><td><span className={`fee-status ${f.status.toLowerCase()}`}>{f.status}</span></td><td><div className="fee-actions">{f.balance > 0 && <button className="button button-primary button-small" onClick={() => { setPayingFee(f); setPaymentAmount(String(f.balance)); }}>Payment</button>}{f.payments.map(p => <button key={p.id} className="button button-ghost button-small" onClick={() => printReceipt(f,p)} title={`Print ${p.receiptNumber}`}>Receipt</button>)}</div></td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
