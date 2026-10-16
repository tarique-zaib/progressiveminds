import { FormEvent, useEffect, useMemo, useState } from "react";
import "./AssessmentManagement.css";

const API_BASE = "http://localhost:5080";

type Course = { id: string; code: string; name: string };
type AcademicSession = { id: string; name: string; isCurrent: boolean };
type Subject = { id: string; code: string; name: string; isActive: boolean };
type Student = {
  id: string;
  courseId: string;
  admissionNumber: string;
  fullName: string;
  isActive: boolean;
};
type AssessmentSection = {
  id: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  maxMarks: number;
  negativeMarksPerWrongAnswer: number;
  sortOrder: number;
};
type Assessment = {
  id: string;
  instituteId: string;
  academicSessionId: string;
  courseId: string;
  title: string;
  assessmentType: "WeeklyTest" | "JeeMock" | "NeetMock";
  assessmentDate: string;
  durationMinutes: number | null;
  totalMaxMarks: number;
  sectionCount: number;
  createdAtUtc: string;
  updatedAtUtc: string;
  sections: AssessmentSection[];
};
type MarkRow = {
  studentId: string;
  admissionNumber: string;
  studentName: string;
  marksObtained: number | null;
  maxMarks: number;
  remarks: string | null;
  updatedAtUtc: string | null;
};
type MarkDraft = { marksObtained: string; remarks: string };

type Props = {
  token: string;
  instituteId: string;
  selectedCourseId: string;
  selectedSessionId: string;
  courses: Course[];
  sessions: AcademicSession[];
  subjects: Subject[];
  students: Student[];
  onCourseChange: (courseId: string) => void;
  onSessionChange: (sessionId: string) => void;
};

const typeLabels: Record<Assessment["assessmentType"], string> = {
  WeeklyTest: "Weekly test",
  JeeMock: "JEE mock test",
  NeetMock: "NEET mock test",
};

export default function AssessmentManagement({
  token,
  instituteId,
  selectedCourseId,
  selectedSessionId,
  courses,
  sessions,
  subjects,
  students,
  onCourseChange,
  onSessionChange,
}: Props) {
  const [courseId, setCourseId] = useState(selectedCourseId);
  const [sessionId, setSessionId] = useState(selectedSessionId);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [markRows, setMarkRows] = useState<MarkRow[]>([]);
  const [markDrafts, setMarkDrafts] = useState<Record<string, MarkDraft>>({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState("");
  const [assessmentType, setAssessmentType] = useState<Assessment["assessmentType"]>("WeeklyTest");
  const [assessmentDate, setAssessmentDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [sectionMarks, setSectionMarks] = useState<Record<string, { maxMarks: string; negative: string }>>({});
  const [loadingAssessments, setLoadingAssessments] = useState(false);
  const [loadingMarks, setLoadingMarks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedAssessment = assessments.find(x => x.id === selectedAssessmentId) ?? null;
  const selectedSection = selectedAssessment?.sections.find(x => x.id === selectedSectionId) ?? null;
  const activeStudents = useMemo(
    () => students.filter(x => x.isActive && x.courseId === courseId).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [students, courseId],
  );

  useEffect(() => { setCourseId(selectedCourseId); }, [selectedCourseId]);
  useEffect(() => { setSessionId(selectedSessionId || sessions.find(x => x.isCurrent)?.id || sessions[0]?.id || ""); }, [selectedSessionId, sessions]);
  useEffect(() => {
    setSelectedSubjectIds(current => {
      const valid = current.filter(id => subjects.some(s => s.id === id && s.isActive));
      if (assessmentType === "WeeklyTest") return valid.slice(0, 1).length ? valid.slice(0, 1) : (subjects.find(s => s.isActive) ? [subjects.find(s => s.isActive)!.id] : []);
      return valid.length ? valid : subjects.filter(s => s.isActive).map(s => s.id);
    });
  }, [subjects, assessmentType]);

  async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message ?? body?.title ?? `Request failed (${response.status}).`);
    return body as T;
  }

  async function loadAssessments() {
    if (!instituteId || !courseId || !sessionId || !token) {
      setAssessments([]);
      setSelectedAssessmentId("");
      setMarkRows([]);
      return;
    }
    setLoadingAssessments(true);
    setError("");
    try {
      const rows = await api<Assessment[]>(`/api/institutes/${instituteId}/assessments?courseId=${encodeURIComponent(courseId)}&academicSessionId=${encodeURIComponent(sessionId)}`);
      setAssessments(rows);
      setSelectedAssessmentId(current => rows.some(x => x.id === current) ? current : (rows[0]?.id ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load assessments.");
    } finally {
      setLoadingAssessments(false);
    }
  }

  useEffect(() => { void loadAssessments(); }, [instituteId, courseId, sessionId, token]);

  useEffect(() => {
    if (!selectedAssessment) {
      setSelectedSectionId("");
      setMarkRows([]);
      setMarkDrafts({});
      return;
    }
    setSelectedSectionId(current => selectedAssessment.sections.some(x => x.id === current) ? current : (selectedAssessment.sections[0]?.id ?? ""));
  }, [selectedAssessmentId, assessments]);

  async function loadMarks(assessment: Assessment, sectionId: string) {
    if (!sectionId || !instituteId) return;
    setLoadingMarks(true);
    setError("");
    try {
      const rows = await api<MarkRow[]>(`/api/institutes/${instituteId}/assessments/${assessment.id}/sections/${sectionId}/marks`);
      setMarkRows(rows);
      const next: Record<string, MarkDraft> = {};
      for (const row of rows) next[row.studentId] = {
        marksObtained: row.marksObtained === null ? "" : String(row.marksObtained),
        remarks: row.remarks ?? "",
      };
      setMarkDrafts(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load student marks.");
    } finally {
      setLoadingMarks(false);
    }
  }

  useEffect(() => {
    if (selectedAssessment && selectedSectionId) void loadMarks(selectedAssessment, selectedSectionId);
    else { setMarkRows([]); setMarkDrafts({}); }
  }, [selectedAssessmentId, selectedSectionId, instituteId, token]);

  function resetCreateForm() {
    setTitle("");
    setAssessmentType("WeeklyTest");
    setAssessmentDate(new Date().toLocaleDateString("en-CA"));
    setDurationMinutes("60");
    setSelectedSubjectIds(subjects.find(x => x.isActive) ? [subjects.find(x => x.isActive)!.id] : []);
    setSectionMarks({});
    setShowCreateForm(false);
  }

  function toggleSubject(subjectId: string) {
    setSelectedSubjectIds(current => {
      if (assessmentType === "WeeklyTest") return [subjectId];
      return current.includes(subjectId) ? current.filter(x => x !== subjectId) : [...current, subjectId];
    });
  }

  function getSectionInput(subjectId: string) {
    return sectionMarks[subjectId] ?? { maxMarks: "100", negative: assessmentType === "WeeklyTest" ? "0" : "1" };
  }

  async function createAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!instituteId || !courseId || !sessionId) { setError("Select an institute, course, and academic session first."); return; }
    if (!selectedSubjectIds.length) { setError("Select at least one subject."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      const created = await api<Assessment>(`/api/institutes/${instituteId}/assessments`, {
        method: "POST",
        body: JSON.stringify({
          academicSessionId: sessionId,
          courseId,
          title: title.trim(),
          assessmentType,
          assessmentDate,
          durationMinutes: durationMinutes.trim() ? Number(durationMinutes) : null,
          sections: selectedSubjectIds.map(subjectId => {
            const values = getSectionInput(subjectId);
            return { subjectId, maxMarks: Number(values.maxMarks), negativeMarksPerWrongAnswer: Number(values.negative || 0) };
          }),
        }),
      });
      setMessage(`Created “${created.title}”. Assessment-created event queued for Kafka.`);
      setShowCreateForm(false);
      await loadAssessments();
      setSelectedAssessmentId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create assessment.");
    } finally { setSaving(false); }
  }

  async function saveMarks() {
    if (!selectedAssessment || !selectedSection) { setError("Select an assessment and subject section first."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await api<{ savedCount: number; markedCount: number }>(
        `/api/institutes/${instituteId}/assessments/${selectedAssessment.id}/sections/${selectedSection.id}/marks`,
        {
          method: "PUT",
          body: JSON.stringify({ records: markRows.map(row => {
            const draft = markDrafts[row.studentId] ?? { marksObtained: "", remarks: "" };
            return {
              studentId: row.studentId,
              marksObtained: draft.marksObtained.trim() === "" ? null : Number(draft.marksObtained),
              remarks: draft.remarks.trim() || null,
            };
          }) }),
        },
      );
      setMessage(`Saved ${response.savedCount} student rows; ${response.markedCount} have marks. Marks-recorded event queued for Kafka.`);
      await loadMarks(selectedAssessment, selectedSection.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save marks.");
    } finally { setSaving(false); }
  }

  function exportMarksCsv() {
    if (!selectedAssessment || !selectedSection || markRows.length === 0) { setError("Load a test and subject section before exporting."); return; }
    const escape = (value: string | number | null) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["Assessment", "Type", "Date", "Subject", "Admission Number", "Student Name", "Marks", "Maximum Marks", "Percentage", "Remarks"],
      ...markRows.map(row => {
        const raw = markDrafts[row.studentId]?.marksObtained ?? "";
        const score = raw.trim() === "" ? null : Number(raw);
        return [selectedAssessment.title, typeLabels[selectedAssessment.assessmentType], selectedAssessment.assessmentDate, selectedSection.subjectName, row.admissionNumber, row.studentName, score, selectedSection.maxMarks, score === null ? "" : ((score / selectedSection.maxMarks) * 100).toFixed(2), markDrafts[row.studentId]?.remarks ?? ""];
      }),
    ];
    const csv = rows.map(row => row.map(escape).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `progressiveminds-${selectedAssessment.assessmentType}-${selectedAssessment.assessmentDate}-${selectedSection.subjectCode}.csv`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    setMessage("Marks report exported to CSV.");
  }

  const scoredCount = markRows.filter(row => (markDrafts[row.studentId]?.marksObtained ?? "").trim() !== "").length;
  const averagePercentage = useMemo(() => {
    const scores = markRows.map(row => {
      const value = (markDrafts[row.studentId]?.marksObtained ?? "").trim();
      return value === "" ? null : (Number(value) / row.maxMarks) * 100;
    }).filter((value): value is number => value !== null && Number.isFinite(value));
    return scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
  }, [markRows, markDrafts]);

  return (
    <section className="panel courses-panel assessment-panel">
      <div className="section-heading">
        <div>
          <div className="eyebrow">ACADEMIC PERFORMANCE</div>
          <h2>Tests & marks</h2>
          <p>Create weekly tests and JEE/NEET mock tests, enter subject-wise marks, and export a staff report. Parent access is not enabled in this phase.</p>
        </div>
        <button className="button button-primary" type="button" disabled={!instituteId || !courseId || !sessionId || subjects.filter(x => x.isActive).length === 0} onClick={() => setShowCreateForm(v => !v)}>
          {showCreateForm ? "Cancel" : "Create test"}
        </button>
      </div>

      <div className="assessment-context form-grid">
        <label>Course
          <select value={courseId} onChange={e => { setCourseId(e.target.value); onCourseChange(e.target.value); }} required>
            <option value="">Select course</option>
            {courses.map(course => <option key={course.id} value={course.id}>{course.code} — {course.name}</option>)}
          </select>
        </label>
        <label>Academic session
          <select value={sessionId} onChange={e => { setSessionId(e.target.value); onSessionChange(e.target.value); }} required>
            <option value="">Select session</option>
            {sessions.map(session => <option key={session.id} value={session.id}>{session.name}{session.isCurrent ? " (Current)" : ""}</option>)}
          </select>
        </label>
      </div>

      {showCreateForm && <form className="inline-form" onSubmit={createAssessment}>
        <h3>New assessment</h3>
        <div className="form-grid">
          <label className="span-two">Test title *
            <input required minLength={3} maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder="Weekly Physics Test 04 or JEE Mock Test 01" />
          </label>
          <label>Assessment type *
            <select value={assessmentType} onChange={e => { setAssessmentType(e.target.value as Assessment["assessmentType"]); setSelectedSubjectIds([]); }}>
              <option value="WeeklyTest">Weekly test</option>
              <option value="JeeMock">JEE mock test</option>
              <option value="NeetMock">NEET mock test</option>
            </select>
          </label>
          <label>Test date *
            <input required type="date" value={assessmentDate} onChange={e => setAssessmentDate(e.target.value)} />
          </label>
          <label>Duration (minutes)
            <input type="number" min={1} max={600} value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} placeholder="60" />
          </label>
        </div>
        <div className="assessment-subjects">
          <h4>{assessmentType === "WeeklyTest" ? "Choose the test subject" : "Choose mock-test subjects"}</h4>
          {subjects.filter(x => x.isActive).length === 0 ? <div className="empty-state">Add active subjects to this course first.</div> : subjects.filter(x => x.isActive).map(subject => {
            const checked = selectedSubjectIds.includes(subject.id);
            const values = getSectionInput(subject.id);
            return <div className="assessment-subject-row" key={subject.id}>
              <label className="checkbox-label"><input type={assessmentType === "WeeklyTest" ? "radio" : "checkbox"} name="assessment-subject" checked={checked} onChange={() => toggleSubject(subject.id)} /> <span>{subject.code} — {subject.name}</span></label>
              {checked && <div className="assessment-marks-config">
                <label>Maximum marks<input required type="number" min={1} max={10000} step="0.25" value={values.maxMarks} onChange={e => setSectionMarks(current => ({ ...current, [subject.id]: { ...getSectionInput(subject.id), maxMarks: e.target.value } }))} /></label>
                <label>Negative marks / wrong answer<input type="number" min={0} max={10000} step="0.25" value={values.negative} onChange={e => setSectionMarks(current => ({ ...current, [subject.id]: { ...getSectionInput(subject.id), negative: e.target.value } }))} /></label>
              </div>}
            </div>;
          })}
        </div>
        <button className="button button-primary" type="submit" disabled={saving || !selectedSubjectIds.length}>{saving ? "Creating…" : "Create assessment"}</button>
      </form>}

      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {message && <div className="notice notice-success" role="status">{message}</div>}

      <div className="assessment-workspace">
        <section className="assessment-list-panel">
          <div className="section-heading compact-heading"><div><h3>Assessments</h3><p>{assessments.length} test(s) in this course and session</p></div></div>
          {!instituteId || !courseId || !sessionId ? <div className="empty-state">Choose an institute, course and academic session.</div> : loadingAssessments ? <div className="empty-state">Loading assessments…</div> : assessments.length === 0 ? <div className="empty-state"><h3>No tests yet</h3><p>Create a weekly test or JEE/NEET mock test to begin entering marks.</p></div> : <div className="session-list">
            {assessments.map(assessment => <button type="button" className={`assessment-list-item ${selectedAssessmentId === assessment.id ? "assessment-list-item-active" : ""}`} key={assessment.id} onClick={() => setSelectedAssessmentId(assessment.id)}>
              <span className="assessment-type-chip">{typeLabels[assessment.assessmentType]}</span>
              <strong>{assessment.title}</strong>
              <small>{assessment.assessmentDate} · {assessment.sectionCount} subject(s) · {assessment.totalMaxMarks} total marks</small>
            </button>)}
          </div>}
        </section>

        <section className="assessment-marks-panel">
          {!selectedAssessment ? <div className="empty-state"><h3>Select a test</h3><p>Student marks entry and staff reports will appear here.</p></div> : <>
            <div className="section-heading compact-heading"><div><span className="assessment-type-chip">{typeLabels[selectedAssessment.assessmentType]}</span><h3>{selectedAssessment.title}</h3><p>{selectedAssessment.assessmentDate} · Maximum total {selectedAssessment.totalMaxMarks} marks</p></div></div>
            <div className="assessment-toolbar">
              <label>Subject section
                <select value={selectedSectionId} onChange={e => setSelectedSectionId(e.target.value)}>
                  {selectedAssessment.sections.map(section => <option key={section.id} value={section.id}>{section.subjectCode} — {section.subjectName} ({section.maxMarks} marks)</option>)}
                </select>
              </label>
              <div className="assessment-stats"><span><strong>{activeStudents.length}</strong> students</span><span><strong>{scoredCount}</strong> scored</span><span><strong>{averagePercentage === null ? "—" : `${averagePercentage.toFixed(1)}%`}</strong> current average</span></div>
            </div>
            {loadingMarks ? <div className="empty-state">Loading marks…</div> : markRows.length === 0 ? <div className="empty-state">No active students are enrolled in this course.</div> : <>
              <div className="assessment-table-wrap"><table className="assessment-table"><thead><tr><th>Admission no.</th><th>Student</th><th>Marks / {selectedSection?.maxMarks ?? "—"}</th><th>Remarks</th></tr></thead><tbody>
                {markRows.map(row => <tr key={row.studentId}><td>{row.admissionNumber}</td><td>{row.studentName}</td><td><input aria-label={`Marks for ${row.studentName}`} type="number" step="0.25" min={selectedSection?.negativeMarksPerWrongAnswer ? -(selectedSection.maxMarks) : 0} max={selectedSection?.maxMarks} value={markDrafts[row.studentId]?.marksObtained ?? ""} onChange={e => setMarkDrafts(current => ({ ...current, [row.studentId]: { ...(current[row.studentId] ?? { marksObtained: "", remarks: "" }), marksObtained: e.target.value } }))} placeholder="Not marked" /></td><td><input aria-label={`Remarks for ${row.studentName}`} maxLength={500} value={markDrafts[row.studentId]?.remarks ?? ""} onChange={e => setMarkDrafts(current => ({ ...current, [row.studentId]: { ...(current[row.studentId] ?? { marksObtained: "", remarks: "" }), remarks: e.target.value } }))} placeholder="Optional feedback" /></td></tr>)}
              </tbody></table></div>
              <div className="assessment-actions"><button className="button button-primary" type="button" disabled={saving || loadingMarks} onClick={() => void saveMarks()}>{saving ? "Saving marks…" : "Save marks"}</button><button className="button button-ghost" type="button" onClick={exportMarksCsv}>Export staff report (CSV)</button></div>
            </>}
          </>}
        </section>
      </div>
      <p className="assessment-footnote">Marks are saved in PostgreSQL. Assessment and marks-recorded events are queued through the existing outbox and Kafka pipeline. CSV exports are generated locally in this staff session; no parent login or report publication is enabled yet.</p>
    </section>
  );
}
