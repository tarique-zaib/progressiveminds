import { FormEvent, useEffect, useState } from "react";

const API_BASE = "http://localhost:5080";

type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
};
type LoginResponse = { accessToken: string; expiresAtUtc: string; user: User };
type Institute = {
  id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  timeZoneId: string;
  isActive: boolean;
  createdAtUtc: string;
  membershipRole: string;
};
type Course = {
  id: string; instituteId: string; code: string; name: string; description: string | null;
  durationMonths: number; isActive: boolean; createdAtUtc: string; updatedAtUtc: string;
};
type Student = {
  id: string;
  instituteId: string;
  courseId: string;
  admissionNumber: string;
  fullName: string;
  email: string | null;
  phone: string;
  parentName: string | null;
  parentPhone: string | null;
  dateOfBirth: string | null;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
};
type Subject = {
  id: string;
  instituteId: string;
  courseId: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
};
type AcademicSession = {
  id: string;
  instituteId: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  createdAtUtc: string;
};

export default function App() {
  const [email, setEmail] = useState("admin@progressiveminds.local");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(() =>
    sessionStorage.getItem("pm_access_token"),
  );
  const [user, setUser] = useState<User | null>(null);
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [selectedInstituteId, setSelectedInstituteId] = useState("");
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentForm, setStudentForm] = useState({
    admissionNumber: "", fullName: "", email: "", phone: "",
    parentName: "", parentPhone: "", dateOfBirth: "", courseId: "", isActive: true
  });
  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [subjectForm, setSubjectForm] = useState({ code: "", name: "", description: "", isActive: true });
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [courseForm, setCourseForm] = useState({ code: "", name: "", description: "", durationMonths: 12, isActive: true });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showInstituteForm, setShowInstituteForm] = useState(false);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [instituteForm, setInstituteForm] = useState({
    name: "",
    code: "",
    email: "",
    phone: "",
    address: "",
    timeZoneId: "Asia/Kolkata",
  });
  const [sessionForm, setSessionForm] = useState({
    name: "2026-2027",
    startDate: "2026-04-01",
    endDate: "2027-03-31",
    isCurrent: true,
  });

  async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!token) throw new Error("Please sign in again.");
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
    const body =
      response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        body?.message ?? body?.title ?? `Request failed (${response.status}).`,
      );
    return body as T;
  }

  async function loadMe(accessToken: string) {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      sessionStorage.removeItem("pm_access_token");
      setToken(null);
      setUser(null);
      return;
    }
    setUser((await response.json()) as User);
  }

  async function loadInstitutes() {
    try {
      const rows = await api<Institute[]>("/api/institutes");
      setInstitutes(rows);
      const active = rows.some((x) => x.id === selectedInstituteId)
        ? selectedInstituteId
        : (rows[0]?.id ?? "");
      setSelectedInstituteId(active);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load institutes.");
    }
  }

  async function loadCourses(instituteId: string) {
    if (!instituteId) { setCourses([]); return; }
    try { setCourses(await api<Course[]>(`/api/institutes/${instituteId}/courses`)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load courses."); }
  }

  async function loadStudents(instituteId: string) {
    if (!instituteId) {
      setStudents([]);
      return;
    }
    try {
      setStudents(await api<Student[]>(`/api/institutes/${instituteId}/students`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load students.");
    }
  }

  async function loadSubjects(instituteId: string, courseId: string) {
    if (!instituteId || !courseId) {
      setSubjects([]);
      return;
    }
    try {
      setSubjects(await api<Subject[]>(`/api/institutes/${instituteId}/courses/${courseId}/subjects`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load subjects.");
    }
  }

  async function loadSessions(instituteId: string) {
    if (!instituteId) {
      setSessions([]);
      return;
    }
    try {
      setSessions(
        await api<AcademicSession[]>(`/api/institutes/${instituteId}/sessions`),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load academic sessions.",
      );
    }
  }

  useEffect(() => {
    if (token) void loadMe(token);
  }, [token]);
  useEffect(() => {
    if (token && user) void loadInstitutes();
  }, [token, user]);
  useEffect(() => {
    if (token && selectedInstituteId) void loadSessions(selectedInstituteId);
  }, [token, selectedInstituteId]);
  useEffect(() => {
    if (token && selectedInstituteId) void loadCourses(selectedInstituteId);
    else setCourses([]);
  }, [token, selectedInstituteId]);

  useEffect(() => {
    if (token && selectedInstituteId) void loadStudents(selectedInstituteId);
    else setStudents([]);
  }, [token, selectedInstituteId]);

  useEffect(() => {
    if (!courses.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId(courses[0]?.id ?? "");
    }
  }, [courses, selectedCourseId]);

  useEffect(() => {
    if (token && selectedInstituteId && selectedCourseId) {
      void loadSubjects(selectedInstituteId, selectedCourseId);
    } else {
      setSubjects([]);
    }
  }, [token, selectedInstituteId, selectedCourseId]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Sign-in failed.");
      const result = body as LoginResponse;
      sessionStorage.setItem("pm_access_token", result.accessToken);
      setToken(result.accessToken);
      setUser(result.user);
      setPassword("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to sign in. Check that the API is running.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createInstitute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const created = await api<Institute>("/api/institutes", {
        method: "POST",
        body: JSON.stringify({
          ...instituteForm,
          name: instituteForm.name.trim(),
          code: instituteForm.code.trim().toUpperCase(),
          email: instituteForm.email.trim() || null,
          phone: instituteForm.phone.trim() || null,
          address: instituteForm.address.trim() || null,
          timeZoneId: instituteForm.timeZoneId.trim() || "Asia/Kolkata",
        }),
      });

      setMessage(
        `Institute "${created.name}" created. InstituteCreated event queued for Kafka.`,
      );

      setInstituteForm({
        name: "",
        code: "",
        email: "",
        phone: "",
        address: "",
        timeZoneId: "Asia/Kolkata",
      });

      setShowInstituteForm(false);
      await loadInstitutes();
      setSelectedInstituteId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create institute.");
    } finally {
      setBusy(false);
    }
  }

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInstituteId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const created = await api<AcademicSession>(
        `/api/institutes/${selectedInstituteId}/sessions`,
        {
          method: "POST",
          body: JSON.stringify(sessionForm),
        },
      );
      setMessage(
        `Academic session "${created.name}" created. Event queued for Kafka.`,
      );
      setShowSessionForm(false);
      await loadSessions(selectedInstituteId);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not create academic session.",
      );
    } finally {
      setBusy(false);
    }
  }

  function resetCourseForm() {
    setCourseForm({ code: "", name: "", description: "", durationMonths: 12, isActive: true });
    setEditingCourseId(null);
    setShowCourseForm(false);
  }

  function beginEditCourse(course: Course) {
    setCourseForm({ code: course.code, name: course.name, description: course.description ?? "", durationMonths: course.durationMonths, isActive: course.isActive });
    setEditingCourseId(course.id);
    setShowCourseForm(true);
  }

  async function saveCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInstituteId) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const path = `/api/institutes/${selectedInstituteId}/courses${editingCourseId ? `/${editingCourseId}` : ""}`;
      const saved = await api<Course>(path, {
        method: editingCourseId ? "PUT" : "POST",
        body: JSON.stringify({ ...courseForm, code: courseForm.code.trim().toUpperCase(), name: courseForm.name.trim(), description: courseForm.description.trim() || null })
      });
      setMessage(`Course "${saved.name}" ${editingCourseId ? "updated" : "created"}. Event queued for Kafka.`);
      resetCourseForm();
      await loadCourses(selectedInstituteId);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save course."); }
    finally { setBusy(false); }
  }

  function resetSubjectForm() {
    setSubjectForm({ code: "", name: "", description: "", isActive: true });
    setEditingSubjectId(null);
    setShowSubjectForm(false);
  }

  function beginEditSubject(subject: Subject) {
    setSubjectForm({
      code: subject.code,
      name: subject.name,
      description: subject.description ?? "",
      isActive: subject.isActive,
    });
    setEditingSubjectId(subject.id);
    setShowSubjectForm(true);
  }

  async function saveSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInstituteId || !selectedCourseId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const basePath = `/api/institutes/${selectedInstituteId}/courses/${selectedCourseId}/subjects`;
      const path = editingSubjectId ? `${basePath}/${editingSubjectId}` : basePath;
      const saved = await api<Subject>(path, {
        method: editingSubjectId ? "PUT" : "POST",
        body: JSON.stringify({
          ...subjectForm,
          code: subjectForm.code.trim().toUpperCase(),
          name: subjectForm.name.trim(),
          description: subjectForm.description.trim() || null,
        }),
      });
      setMessage(`Subject "${saved.name}" ${editingSubjectId ? "updated" : "created"}. Event queued for Kafka.`);
      resetSubjectForm();
      await loadSubjects(selectedInstituteId, selectedCourseId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save subject.");
    } finally {
      setBusy(false);
    }
  }

  function resetStudentForm() {
    setStudentForm({
      admissionNumber: "", fullName: "", email: "", phone: "",
      parentName: "", parentPhone: "", dateOfBirth: "", courseId: courses[0]?.id ?? "", isActive: true
    });
    setEditingStudentId(null);
    setShowStudentForm(false);
  }

  function beginEditStudent(student: Student) {
    setStudentForm({
      admissionNumber: student.admissionNumber,
      fullName: student.fullName,
      email: student.email ?? "",
      phone: student.phone,
      parentName: student.parentName ?? "",
      parentPhone: student.parentPhone ?? "",
      dateOfBirth: student.dateOfBirth ? student.dateOfBirth.slice(0, 10) : "",
      courseId: student.courseId,
      isActive: student.isActive,
    });
    setEditingStudentId(student.id);
    setShowStudentForm(true);
  }

  async function saveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInstituteId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const basePath = `/api/institutes/${selectedInstituteId}/students`;
      const path = editingStudentId ? `${basePath}/${editingStudentId}` : basePath;
      const saved = await api<Student>(path, {
        method: editingStudentId ? "PUT" : "POST",
        body: JSON.stringify({
          ...studentForm,
          admissionNumber: studentForm.admissionNumber.trim().toUpperCase(),
          fullName: studentForm.fullName.trim(),
          email: studentForm.email.trim() || null,
          phone: studentForm.phone.trim(),
          parentName: studentForm.parentName.trim() || null,
          parentPhone: studentForm.parentPhone.trim() || null,
          dateOfBirth: studentForm.dateOfBirth || null,
        }),
      });
      setMessage(`Student "${saved.fullName}" ${editingStudentId ? "updated" : "admitted"}. Event queued for Kafka.`);
      resetStudentForm();
      await loadStudents(selectedInstituteId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save student.");
    } finally {
      setBusy(false);
    }
  }

  async function publishTestEvent() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = await api<{ eventId: string }>("/api/events/test", {
        method: "POST",
      });
      setMessage(
        `Test event queued: ${body.eventId}. Check the API terminal for Kafka publish/consume logs.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Event request failed.");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    sessionStorage.removeItem("pm_access_token");
    setToken(null);
    setUser(null);
    setInstitutes([]);
    setSessions([]);
    setSelectedInstituteId("");
    setMessage("");
    setError("");
  }

  if (token && user) {
    const selected = institutes.find((x) => x.id === selectedInstituteId);
    return (
      <main className="app-shell">
        <header className="topbar">
          <a className="brand" href="#">
            <span className="brand-mark">P</span>
            <span>
              Progressive<span className="brand-accent">Minds</span>
            </span>
          </a>
          <div className="topbar-actions">
            <span className="user-label">
              {user.firstName} {user.lastName}
            </span>
            <button className="button button-ghost" onClick={logout}>
              Sign out
            </button>
          </div>
        </header>
        <section className="dashboard">
          <div className="eyebrow">PHASE 1 · INSTITUTE MANAGEMENT</div>
          <h1>Institute setup</h1>
          <p className="lead">
            Manage your institute profile and academic sessions. Each institute
            is visible only to its authorized members.
          </p>
          <div className="status-grid">
            <article className="status-card">
              <span className="status-dot" />
              <div>
                <strong>Authentication</strong>
                <p>Signed in securely</p>
              </div>
            </article>
            <article className="status-card">
              <span className="status-dot status-dot-blue" />
              <div>
                <strong>PostgreSQL</strong>
                <p>Institute data is persisted</p>
              </div>
            </article>
            <article className="status-card">
              <span className="status-dot status-dot-purple" />
              <div>
                <strong>Kafka</strong>
                <p>Domain events use the outbox</p>
              </div>
            </article>
          </div>
          <section className="panel section-panel">
            <div>
              <div className="eyebrow">INSTITUTES</div>
              <h2>Your institutes</h2>
              <p>
                Create and manage institute profiles. The creator becomes that
                institute's administrator.
              </p>
            </div>
            <button
              className="button button-primary"
              onClick={() => setShowInstituteForm((v) => !v)}
            >
              {showInstituteForm ? "Cancel" : "Add institute"}
            </button>
          </section>
          {showInstituteForm && (
            <form className="form-card" onSubmit={createInstitute}>
              <h3>New institute</h3>
              <div className="form-grid">
                <label>
                  Institute name *
                  <input
                    required
                    minLength={2}
                    maxLength={160}
                    value={instituteForm.name}
                    onChange={(e) =>
                      setInstituteForm({
                        ...instituteForm,
                        name: e.target.value,
                      })
                    }
                    placeholder="ProgressiveMinds Coaching Centre"
                  />
                </label>
                <label>
                  Unique code *
                  <input
                    required
                    pattern="[A-Za-z0-9][A-Za-z0-9-]{1,29}"
                    value={instituteForm.code}
                    onChange={(e) =>
                      setInstituteForm({
                        ...instituteForm,
                        code: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="PM-GZB-01"
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={instituteForm.email}
                    onChange={(e) =>
                      setInstituteForm({
                        ...instituteForm,
                        email: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Phone
                  <input
                    maxLength={40}
                    value={instituteForm.phone}
                    onChange={(e) =>
                      setInstituteForm({
                        ...instituteForm,
                        phone: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="span-two">
                  Address
                  <input
                    maxLength={500}
                    value={instituteForm.address}
                    onChange={(e) =>
                      setInstituteForm({
                        ...instituteForm,
                        address: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Time zone
                  <select
                    value={instituteForm.timeZoneId}
                    onChange={(e) =>
                      setInstituteForm({
                        ...instituteForm,
                        timeZoneId: e.target.value,
                      })
                    }
                  >
                    <option value="Asia/Kolkata">India — Asia/Kolkata</option>
                    <option value="UTC">UTC</option>
                  </select>
                </label>
              </div>
              <button
                className="button button-primary"
                disabled={busy}
                type="submit"
              >
                {busy ? "Saving…" : "Create institute"}
              </button>
            </form>
          )}
          <div className="institute-layout">
            <section className="panel list-panel">
              {institutes.length === 0 ? (
                <div className="empty-state">
                  <h3>No institutes yet</h3>
                  <p>
                    Create your first institute to begin configuring academic
                    sessions.
                  </p>
                </div>
              ) : (
                <div className="institute-list">
                  {institutes.map((i) => (
                    <button
                      key={i.id}
                      className={`institute-item ${i.id === selectedInstituteId ? "selected" : ""}`}
                      onClick={() => setSelectedInstituteId(i.id)}
                    >
                      <span className="institute-avatar">
                        {i.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="institute-item-copy">
                        <strong>{i.name}</strong>
                        <small>
                          {i.code} · {i.membershipRole}
                        </small>
                      </span>
                      <span className="chevron">›</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
            <section className="panel sessions-panel">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">ACADEMIC CALENDAR</div>
                  <h2>{selected ? selected.name : "Academic sessions"}</h2>
                  <p>
                    {selected
                      ? `Manage sessions for ${selected.name}.`
                      : "Select or create an institute first."}
                  </p>
                </div>
                <button
                  className="button button-primary"
                  disabled={!selectedInstituteId}
                  onClick={() => setShowSessionForm((v) => !v)}
                >
                  {showSessionForm ? "Cancel" : "Add session"}
                </button>
              </div>
              {showSessionForm && (
                <form className="inline-form" onSubmit={createSession}>
                  <label>
                    Session name *
                    <input
                      required
                      maxLength={80}
                      value={sessionForm.name}
                      onChange={(e) =>
                        setSessionForm({ ...sessionForm, name: e.target.value })
                      }
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Start date *
                      <input
                        required
                        type="date"
                        value={sessionForm.startDate}
                        onChange={(e) =>
                          setSessionForm({
                            ...sessionForm,
                            startDate: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      End date *
                      <input
                        required
                        type="date"
                        min={sessionForm.startDate}
                        value={sessionForm.endDate}
                        onChange={(e) =>
                          setSessionForm({
                            ...sessionForm,
                            endDate: e.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={sessionForm.isCurrent}
                      onChange={(e) =>
                        setSessionForm({
                          ...sessionForm,
                          isCurrent: e.target.checked,
                        })
                      }
                    />{" "}
                    Set as current academic session
                  </label>
                  <button
                    className="button button-primary"
                    disabled={busy}
                    type="submit"
                  >
                    {busy ? "Saving…" : "Save session"}
                  </button>
                </form>
              )}
              {!selectedInstituteId ? (
                <div className="empty-state">
                  Choose an institute to see its academic sessions.
                </div>
              ) : sessions.length === 0 ? (
                <div className="empty-state">
                  <h3>No academic sessions</h3>
                  <p>Add an academic session, for example 2026–2027.</p>
                </div>
              ) : (
                <div className="session-list">
                  {sessions.map((s) => (
                    <article className="session-item" key={s.id}>
                      <div className="session-icon">▦</div>
                      <div className="session-copy">
                        <strong>{s.name}</strong>
                        <small>
                          {s.startDate} → {s.endDate}
                        </small>
                      </div>
                      {s.isCurrent && (
                        <span className="current-badge">Current</span>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
          <section className="panel courses-panel">
            <div className="section-heading">
              <div>
                <div className="eyebrow">STUDENT OPERATIONS</div>
                <h2>Student Management</h2>
                <p>Admissions, student profiles, parent contacts, and course enrolments.</p>
              </div>
              <button className="button button-primary" disabled={!selectedInstituteId || courses.length === 0} onClick={() => {
                if (showStudentForm) resetStudentForm();
                else {
                  setEditingStudentId(null);
                  setStudentForm({ admissionNumber: "", fullName: "", email: "", phone: "", parentName: "", parentPhone: "", dateOfBirth: "", courseId: courses[0]?.id ?? "", isActive: true });
                  setShowStudentForm(true);
                }
              }}>{showStudentForm ? "Cancel" : "Admit student"}</button>
            </div>
            <div className="form-grid">
              <label className="span-two">Search students
                <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search name, admission number, or phone" />
              </label>
            </div>
            {showStudentForm && (
              <form className="inline-form" onSubmit={saveStudent}>
                <h3>{editingStudentId ? "Edit student" : "New admission"}</h3>
                <div className="form-grid">
                  <label>Admission number *
                    <input required minLength={2} maxLength={30} value={studentForm.admissionNumber} onChange={(e) => setStudentForm({ ...studentForm, admissionNumber: e.target.value.toUpperCase() })} placeholder="PM-2026-001" />
                  </label>
                  <label>Full name *
                    <input required minLength={2} maxLength={120} value={studentForm.fullName} onChange={(e) => setStudentForm({ ...studentForm, fullName: e.target.value })} placeholder="Student full name" />
                  </label>
                  <label>Phone number *
                    <input required type="tel" minLength={7} maxLength={20} value={studentForm.phone} onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })} placeholder="+91..." />
                  </label>
                  <label>Email
                    <input type="email" maxLength={254} value={studentForm.email} onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })} placeholder="student@example.com" />
                  </label>
                  <label>Parent / guardian name
                    <input maxLength={120} value={studentForm.parentName} onChange={(e) => setStudentForm({ ...studentForm, parentName: e.target.value })} />
                  </label>
                  <label>Parent / guardian phone
                    <input type="tel" maxLength={20} value={studentForm.parentPhone} onChange={(e) => setStudentForm({ ...studentForm, parentPhone: e.target.value })} />
                  </label>
                  <label>Date of birth
                    <input type="date" value={studentForm.dateOfBirth} onChange={(e) => setStudentForm({ ...studentForm, dateOfBirth: e.target.value })} />
                  </label>
                  <label>Course *
                    <select required value={studentForm.courseId} onChange={(e) => setStudentForm({ ...studentForm, courseId: e.target.value })}>
                      {courses.map((course) => <option key={course.id} value={course.id}>{course.code} — {course.name}</option>)}
                    </select>
                  </label>
                  {editingStudentId && <label className="checkbox-label"><input type="checkbox" checked={studentForm.isActive} onChange={(e) => setStudentForm({ ...studentForm, isActive: e.target.checked })} /> Active student</label>}
                </div>
                <button className="button button-primary" disabled={busy} type="submit">{busy ? "Saving…" : editingStudentId ? "Save changes" : "Complete admission"}</button>
              </form>
            )}
            {!selectedInstituteId ? (
              <div className="empty-state">Choose an institute to manage students.</div>
            ) : courses.length === 0 ? (
              <div className="empty-state"><h3>Create a course first</h3><p>Students must be enrolled in a course.</p></div>
            ) : students.filter((student) => {
              const q = studentSearch.trim().toLowerCase();
              return !q || student.fullName.toLowerCase().includes(q) || student.admissionNumber.toLowerCase().includes(q) || student.phone.toLowerCase().includes(q);
            }).length === 0 ? (
              <div className="empty-state"><h3>No students found</h3><p>Admit a student or change your search.</p></div>
            ) : (
              <div className="session-list">
                {students.filter((student) => {
                  const q = studentSearch.trim().toLowerCase();
                  return !q || student.fullName.toLowerCase().includes(q) || student.admissionNumber.toLowerCase().includes(q) || student.phone.toLowerCase().includes(q);
                }).map((student) => (
                  <article className="session-item" key={student.id}>
                    <div className="session-icon">{student.fullName.trim().charAt(0).toUpperCase()}</div>
                    <div className="session-copy">
                      <strong>{student.fullName}</strong>
                      <small>{student.admissionNumber} · {student.phone} · {courses.find((course) => course.id === student.courseId)?.name ?? "Course"}</small>
                      {student.parentName && <small>Guardian: {student.parentName}{student.parentPhone ? ` · ${student.parentPhone}` : ""}</small>}
                    </div>
                    <span className={student.isActive ? "current-badge" : "status-badge"}>{student.isActive ? "Active" : "Inactive"}</span>
                    <button className="button button-ghost" type="button" onClick={() => beginEditStudent(student)}>Edit</button>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="panel courses-panel">
            <div className="section-heading">
              <div>
                <div className="eyebrow">ACADEMIC CATALOGUE</div>
                <h2>Courses</h2>
                <p>{selected ? `Manage courses for ${selected.name}.` : "Select an institute first."}</p>
              </div>
              <button className="button button-primary" disabled={!selectedInstituteId} onClick={() => { if (showCourseForm) resetCourseForm(); else { setEditingCourseId(null); setCourseForm({ code: "", name: "", description: "", durationMonths: 12, isActive: true }); setShowCourseForm(true); } }}>
                {showCourseForm ? "Cancel" : "Add course"}
              </button>
            </div>
            {showCourseForm && <form className="inline-form" onSubmit={saveCourse}>
              <h3>{editingCourseId ? "Edit course" : "New course"}</h3>
              <div className="form-grid">
                <label>Course code *<input required minLength={2} maxLength={30} pattern="[A-Za-z0-9][A-Za-z0-9-]{1,29}" value={courseForm.code} onChange={e => setCourseForm({ ...courseForm, code: e.target.value.toUpperCase() })} placeholder="JEE-ADV" /></label>
                <label>Course name *<input required minLength={2} maxLength={120} value={courseForm.name} onChange={e => setCourseForm({ ...courseForm, name: e.target.value })} placeholder="IIT-JEE Advanced" /></label>
                <label>Duration (months) *<input required type="number" min={1} max={120} value={courseForm.durationMonths} onChange={e => setCourseForm({ ...courseForm, durationMonths: Number(e.target.value) })} /></label>
                <label className="span-two">Description<textarea maxLength={1000} rows={3} value={courseForm.description} onChange={e => setCourseForm({ ...courseForm, description: e.target.value })} placeholder="Course overview (optional)" /></label>
                {editingCourseId && <label className="checkbox-label"><input type="checkbox" checked={courseForm.isActive} onChange={e => setCourseForm({ ...courseForm, isActive: e.target.checked })} /> Active course</label>}
              </div>
              <button className="button button-primary" disabled={busy} type="submit">{busy ? "Saving…" : editingCourseId ? "Save changes" : "Create course"}</button>
            </form>}
            {!selectedInstituteId ? <div className="empty-state">Choose an institute to manage courses.</div> : courses.length === 0 ? <div className="empty-state"><h3>No courses yet</h3><p>Create your first course, such as IIT-JEE, NEET or Foundation.</p></div> : <div className="session-list">{courses.map(course => <article className="session-item" key={course.id}><div className="session-icon">▣</div><div className="session-copy"><strong>{course.name}</strong><small>{course.code} · {course.durationMonths} months{course.description ? ` · ${course.description}` : ""}</small></div><span className={course.isActive ? "current-badge" : "status-badge"}>{course.isActive ? "Active" : "Inactive"}</span><button className="button button-ghost" type="button" onClick={() => beginEditCourse(course)}>Edit</button></article>)}</div>}
          </section>
          <section className="panel courses-panel">
            <div className="section-heading">
              <div>
                <div className="eyebrow">ACADEMIC CATALOGUE</div>
                <h2>Subjects</h2>
                <p>
                  {selectedCourseId
                    ? `Manage subjects for ${courses.find((course) => course.id === selectedCourseId)?.name ?? "the selected course"}.`
                    : "Select an institute and create a course first."}
                </p>
              </div>
              <button
                className="button button-primary"
                disabled={!selectedInstituteId || !selectedCourseId}
                onClick={() => {
                  if (showSubjectForm) resetSubjectForm();
                  else {
                    setEditingSubjectId(null);
                    setSubjectForm({ code: "", name: "", description: "", isActive: true });
                    setShowSubjectForm(true);
                  }
                }}
              >
                {showSubjectForm ? "Cancel" : "Add subject"}
              </button>
            </div>
            <div className="form-grid">
              <label>
                Course *
                <select
                  value={selectedCourseId}
                  disabled={courses.length === 0}
                  onChange={(e) => {
                    setSelectedCourseId(e.target.value);
                    resetSubjectForm();
                  }}
                >
                  {courses.length === 0 && <option value="">No courses available</option>}
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>{course.code} — {course.name}</option>
                  ))}
                </select>
              </label>
            </div>
            {showSubjectForm && (
              <form className="inline-form" onSubmit={saveSubject}>
                <h3>{editingSubjectId ? "Edit subject" : "New subject"}</h3>
                <div className="form-grid">
                  <label>
                    Subject code *
                    <input
                      required
                      minLength={2}
                      maxLength={30}
                      pattern="[A-Za-z0-9][A-Za-z0-9-]{1,29}"
                      value={subjectForm.code}
                      onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value.toUpperCase() })}
                      placeholder="PHYSICS"
                    />
                  </label>
                  <label>
                    Subject name *
                    <input
                      required
                      minLength={2}
                      maxLength={120}
                      value={subjectForm.name}
                      onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                      placeholder="Physics"
                    />
                  </label>
                  <label className="span-two">
                    Description
                    <textarea
                      maxLength={1000}
                      rows={3}
                      value={subjectForm.description}
                      onChange={(e) => setSubjectForm({ ...subjectForm, description: e.target.value })}
                      placeholder="Subject overview (optional)"
                    />
                  </label>
                  {editingSubjectId && (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={subjectForm.isActive}
                        onChange={(e) => setSubjectForm({ ...subjectForm, isActive: e.target.checked })}
                      /> Active subject
                    </label>
                  )}
                </div>
                <button className="button button-primary" disabled={busy} type="submit">
                  {busy ? "Saving…" : editingSubjectId ? "Save changes" : "Create subject"}
                </button>
              </form>
            )}
            {!selectedInstituteId ? (
              <div className="empty-state">Choose an institute to manage subjects.</div>
            ) : courses.length === 0 ? (
              <div className="empty-state"><h3>No courses available</h3><p>Create a course before adding subjects.</p></div>
            ) : subjects.length === 0 ? (
              <div className="empty-state"><h3>No subjects yet</h3><p>Add subjects such as Physics, Chemistry, Mathematics or Biology.</p></div>
            ) : (
              <div className="session-list">
                {subjects.map((subject) => (
                  <article className="session-item" key={subject.id}>
                    <div className="session-icon">▤</div>
                    <div className="session-copy">
                      <strong>{subject.name}</strong>
                      <small>{subject.code}{subject.description ? ` · ${subject.description}` : ""}</small>
                    </div>
                    <span className={subject.isActive ? "current-badge" : "status-badge"}>
                      {subject.isActive ? "Active" : "Inactive"}
                    </span>
                    <button className="button button-ghost" type="button" onClick={() => beginEditSubject(subject)}>Edit</button>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="panel event-panel">
            <div>
              <div className="eyebrow">DIAGNOSTICS</div>
              <h2>Kafka pipeline</h2>
              <p>
                Publish a test event to verify the PostgreSQL outbox, Kafka
                producer and consumer.
              </p>
            </div>
            <button
              className="button button-ghost"
              disabled={busy}
              onClick={() => void publishTestEvent()}
            >
              Publish test event
            </button>
          </section>
          {message && <div className="notice notice-success">{message}</div>}
          {error && <div className="notice notice-error">{error}</div>}
          <footer>
            Signed in as {user.email} · {user.roles.join(", ") || "User"} ·
            ProgressiveMinds
          </footer>
        </section>
      </main>
    );
  }

  return (
    <main className="login-layout">
      <section className="hero-panel">
        <div className="brand brand-large">
          <span className="brand-mark">P</span>
          <span>
            Progressive<span className="brand-accent">Minds</span>
          </span>
        </div>
        <div className="hero-copy">
          <div className="eyebrow">COACHING INSTITUTE MANAGEMENT</div>
          <h1>
            Every learner.
            <br />
            <span>One clear path forward.</span>
          </h1>
          <p>
            Bring admissions, batches, attendance, examinations and student
            progress into one connected workspace.
          </p>
        </div>
        <div className="hero-bottom">
          <span className="mini-line" /> Built for JEE · NEET · UPSC · SSC
        </div>
      </section>
      <section className="form-panel">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="eyebrow">WELCOME BACK</div>
          <h2>Sign in to your institute</h2>
          <p className="form-description">
            Use the administrator credentials configured in .NET User Secrets.
          </p>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="notice notice-error">{error}</div>}
          <button
            className="button button-primary button-full"
            type="submit"
            disabled={busy}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="security-note">
            Protected access · Local development environment
          </p>
        </form>
        <div className="form-footer">ProgressiveMinds © 2026</div>
      </section>
    </main>
  );
}
