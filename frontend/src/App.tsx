import { FormEvent, useEffect, useState } from "react";
import AssessmentManagement from "./components/AssessmentManagement";
import StudentAnalytics from "./components/StudentAnalytics";
import FeeManagement from "./components/FeeManagement";
import "./admin-navigation.css";

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

type AttendanceStatus = "Present" | "Absent" | "Late" | "Excused";
type AttendanceRecord = {
  id: string;
  instituteId: string;
  academicSessionId: string;
  courseId: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  attendanceDate: string;
  status: AttendanceStatus;
  notes: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
};
type AttendanceDraft = { status: AttendanceStatus; notes: string };


type AdminPage = "dashboard" | "institute" | "students" | "courses" | "subjects" | "attendance" | "attendanceReports" | "analytics" | "assessments" | "fees" | "diagnostics";

const ADMIN_MENU: { id: AdminPage; label: string; icon: string; group: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "⌂", group: "OVERVIEW" },
  { id: "institute", label: "Institute & Sessions", icon: "▦", group: "ACADEMICS" },
  { id: "courses", label: "Courses", icon: "▣", group: "ACADEMICS" },
  { id: "subjects", label: "Subjects", icon: "▤", group: "ACADEMICS" },
  { id: "students", label: "Student Management", icon: "♙", group: "ACADEMICS" },
  { id: "attendance", label: "Attendance Management", icon: "✓", group: "ATTENDANCE" },
  { id: "attendanceReports", label: "Attendance Reports", icon: "▥", group: "ATTENDANCE" },
  { id: "assessments", label: "Exams & Assessments", icon: "✎", group: "PERFORMANCE" },
  { id: "fees", label: "Fee Management", icon: "₹", group: "FINANCE" },
  { id: "analytics", label: "Student Analytics", icon: "↗", group: "PERFORMANCE" },
  { id: "diagnostics", label: "System Diagnostics", icon: "⚙", group: "SYSTEM" },
];

export default function App() {
  const [activePage, setActivePage] = useState<AdminPage>("dashboard");
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
  const [attendanceDate, setAttendanceDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [attendanceSessionId, setAttendanceSessionId] = useState("");
  const [attendanceDrafts, setAttendanceDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [reportFromDate, setReportFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString("en-CA"));
  const [reportToDate, setReportToDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [reportRows, setReportRows] = useState<AttendanceRecord[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [lowAttendanceThreshold, setLowAttendanceThreshold] = useState(75);
  const [expandedAttendanceProfileId, setExpandedAttendanceProfileId] = useState<string | null>(null);

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


  async function loadAttendance() {
    if (!selectedInstituteId || !selectedCourseId || !attendanceSessionId || !attendanceDate) {
      setAttendanceDrafts({});
      return;
    }
    setAttendanceLoading(true);
    setError("");
    try {
      const rows = await api<AttendanceRecord[]>(
        `/api/institutes/${selectedInstituteId}/attendance?courseId=${encodeURIComponent(selectedCourseId)}&academicSessionId=${encodeURIComponent(attendanceSessionId)}&date=${encodeURIComponent(attendanceDate)}`
      );
      const next: Record<string, AttendanceDraft> = {};
      for (const student of students.filter(s => s.courseId === selectedCourseId && s.isActive)) {
        const existing = rows.find(r => r.studentId === student.id);
        next[student.id] = {
          status: existing?.status ?? "Present",
          notes: existing?.notes ?? ""
        };
      }
      setAttendanceDrafts(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load attendance.");
    } finally {
      setAttendanceLoading(false);
    }
  }

  useEffect(() => {
    if (token && selectedInstituteId && selectedCourseId && attendanceSessionId && attendanceDate) {
      void loadAttendance();
    } else {
      setAttendanceDrafts({});
    }
    // loadAttendance intentionally runs when register selectors change.
  }, [token, selectedInstituteId, selectedCourseId, attendanceSessionId, attendanceDate, students]);

  useEffect(() => {
    if (!attendanceSessionId || !sessions.some(s => s.id === attendanceSessionId)) {
      setAttendanceSessionId(sessions.find(s => s.isCurrent)?.id ?? sessions[0]?.id ?? "");
    }
  }, [sessions, attendanceSessionId]);

  async function saveAttendance() {
    if (!selectedInstituteId || !selectedCourseId || !attendanceSessionId || !attendanceDate) {
      setError("Select an institute, course, academic session and date.");
      return;
    }
    const enrolled = students.filter(s => s.courseId === selectedCourseId && s.isActive);
    if (enrolled.length === 0) {
      setError("There are no active students enrolled in this course.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await api<{ savedCount: number }>(
        `/api/institutes/${selectedInstituteId}/attendance`,
        {
          method: "POST",
          body: JSON.stringify({
            academicSessionId: attendanceSessionId,
            courseId: selectedCourseId,
            attendanceDate,
            records: enrolled.map(student => ({
              studentId: student.id,
              status: attendanceDrafts[student.id]?.status ?? "Present",
              notes: attendanceDrafts[student.id]?.notes?.trim() || null
            }))
          })
        }
      );
      setMessage(`${saved.savedCount} attendance records saved. Attendance event queued for Kafka.`);
      await loadAttendance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save attendance.");
    } finally {
      setBusy(false);
    }
  }

  async function generateAttendanceReport() {
    if (!selectedInstituteId || !selectedCourseId || !attendanceSessionId || !reportFromDate || !reportToDate) {
      setError("Select an institute, course, academic session and report date range.");
      return;
    }
    if (reportFromDate > reportToDate) {
      setError("From date must be on or before the to date.");
      return;
    }
    setReportLoading(true);
    setError("");
    setMessage("");
    try {
      const rows = await api<AttendanceRecord[]>(
        `/api/institutes/${selectedInstituteId}/attendance/reports?courseId=${encodeURIComponent(selectedCourseId)}&academicSessionId=${encodeURIComponent(attendanceSessionId)}&fromDate=${encodeURIComponent(reportFromDate)}&toDate=${encodeURIComponent(reportToDate)}`
      );
      setReportRows(rows);
      setReportGenerated(true);
      setMessage(`Attendance report generated: ${rows.length} recorded entries.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate attendance report.");
    } finally {
      setReportLoading(false);
    }
  }

  const dailyReport = Object.values(reportRows.reduce<Record<string, { date: string; present: number; absent: number; late: number; excused: number; total: number }>>((acc, row) => {
    const date = row.attendanceDate.slice(0, 10);
    acc[date] ??= { date, present: 0, absent: 0, late: 0, excused: 0, total: 0 };
    acc[date].total += 1;
    if (row.status === "Present") acc[date].present += 1;
    else if (row.status === "Absent") acc[date].absent += 1;
    else if (row.status === "Late") acc[date].late += 1;
    else if (row.status === "Excused") acc[date].excused += 1;
    return acc;
  }, {})).sort((a, b) => a.date.localeCompare(b.date));

  const studentReport = Object.values(reportRows.reduce<Record<string, { studentId: string; studentName: string; admissionNumber: string; present: number; absent: number; late: number; excused: number; total: number }>>((acc, row) => {
    acc[row.studentId] ??= { studentId: row.studentId, studentName: row.studentName, admissionNumber: row.admissionNumber, present: 0, absent: 0, late: 0, excused: 0, total: 0 };
    const item = acc[row.studentId];
    item.total += 1;
    if (row.status === "Present") item.present += 1;
    else if (row.status === "Absent") item.absent += 1;
    else if (row.status === "Late") item.late += 1;
    else if (row.status === "Excused") item.excused += 1;
    return acc;
  }, {})).sort((a, b) => a.studentName.localeCompare(b.studentName));

  const monthlyReport = Object.values(dailyReport.reduce<Record<string, { month: string; present: number; absent: number; late: number; excused: number; total: number }>>((acc, row) => {
    const month = row.date.slice(0, 7);
    acc[month] ??= { month, present: 0, absent: 0, late: 0, excused: 0, total: 0 };
    acc[month].present += row.present;
    acc[month].absent += row.absent;
    acc[month].late += row.late;
    acc[month].excused += row.excused;
    acc[month].total += row.total;
    return acc;
  }, {})).sort((a, b) => a.month.localeCompare(b.month));

  function exportAttendanceReportCsv() {
    if (reportRows.length === 0) {
      setError("Generate a report containing attendance records before exporting.");
      return;
    }

    const escapeCsv = (value: unknown) => {
      const text = value == null ? "" : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };

    const headers = ["Attendance Date", "Admission Number", "Student Name", "Status", "Notes", "Student ID"];
    const rows = reportRows.map((row) => [row.attendanceDate.slice(0, 10), row.admissionNumber, row.studentName, row.status, row.notes ?? "", row.studentId]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `progressiveminds-attendance-${reportFromDate}-to-${reportToDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${reportRows.length} attendance records to CSV.`);
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
          <a className="brand" href="#" aria-label="Progressive Minds home">
            <img className="brand-logo" src="https://progressiveminds.in/images/logo.png" alt="Progressive Minds" />
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
        <div className="admin-layout">
          <aside className="admin-sidebar">
            <div className="sidebar-brand"><span className="sidebar-brand-mark">P</span><span><strong>ProgressiveMinds</strong><small>INSTITUTE ADMIN</small></span></div>
            {(["OVERVIEW", "ACADEMICS", "ATTENDANCE", "PERFORMANCE", "FINANCE", "SYSTEM"] as const).map((group) => (
              <div className="menu-group" key={group}>
                <div className="menu-group-label">{group}</div>
                {ADMIN_MENU.filter((item) => item.group === group).map((item) => (
                  <button key={item.id} type="button" className={`menu-item ${activePage === item.id ? "active" : ""}`} onClick={() => setActivePage(item.id)}>
                    <span className="menu-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
            <div className="sidebar-footer"><span className="sidebar-status-dot" /> API connected locally</div>
          </aside>
          <section className="dashboard admin-content">
            {activePage === "dashboard" && <>
              <div className="eyebrow">INSTITUTE OVERVIEW</div>
              <h1>Dashboard</h1>
              <p className="lead">Welcome back, {user.firstName}. Choose a module from the menu to manage your institute.</p>
              <div className="overview-cards">
                <button type="button" className="overview-card" onClick={() => setActivePage("students")}><span className="overview-card-icon">♙</span><span><strong>Students</strong><small>Admissions and student profiles</small></span><b>{students.length}</b></button>
                <button type="button" className="overview-card" onClick={() => setActivePage("courses")}><span className="overview-card-icon">▣</span><span><strong>Courses</strong><small>Active academic programmes</small></span><b>{courses.length}</b></button>
                <button type="button" className="overview-card" onClick={() => setActivePage("subjects")}><span className="overview-card-icon">▤</span><span><strong>Subjects</strong><small>Subjects for selected course</small></span><b>{subjects.length}</b></button>
                <button type="button" className="overview-card" onClick={() => setActivePage("institute")}><span className="overview-card-icon">▦</span><span><strong>Academic sessions</strong><small>Sessions configured</small></span><b>{sessions.length}</b></button>
              </div>
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
            </>}
            {activePage === "institute" && <>
          <div className="eyebrow">ACADEMIC CONFIGURATION</div>
          <h1>Institute & Sessions</h1>
          <p className="lead">Manage institute profiles and academic sessions. Each institute is visible only to its authorized members.</p>
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
                    <option value="Asia/Kolkata">India - Asia/Kolkata</option>
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
            </>}
            {activePage === "students" && <>
          <div className="eyebrow">ACADEMIC OPERATIONS</div><h1>Student Management</h1><p className="lead">Admissions, student profiles, guardian contacts and course enrolments.</p>
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
                      {courses.map((course) => <option key={course.id} value={course.id}>{course.code} - {course.name}</option>)}
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
            </>}
            {activePage === "courses" && <>
          <div className="eyebrow">ACADEMIC CATALOGUE</div><h1>Courses</h1><p className="lead">Create and maintain the courses offered by your institute.</p>
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
            </>}
            {activePage === "subjects" && <>
          <div className="eyebrow">ACADEMIC CATALOGUE</div><h1>Subjects</h1><p className="lead">Manage subjects by course.</p>
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
                    <option key={course.id} value={course.id}>{course.code} - {course.name}</option>
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
            </>}
            {activePage === "attendance" && <>
          <div className="eyebrow">DAILY REGISTER</div><h1>Attendance Management</h1><p className="lead">Mark attendance for active students enrolled in the selected course.</p>
          <section className="panel courses-panel">
            <div className="section-heading">
              <div>
                <div className="eyebrow">DAILY REGISTER</div>
                <h2>Attendance Management</h2>
                <p>Mark attendance for active students enrolled in the selected course.</p>
              </div>
              <button className="button button-primary" type="button"
                disabled={busy || attendanceLoading || !selectedInstituteId || !selectedCourseId || !attendanceSessionId}
                onClick={() => void saveAttendance()}>
                {busy ? "Saving…" : "Save attendance"}
              </button>
            </div>
            <div className="form-grid">
              <label>Academic session *
                <select value={attendanceSessionId} onChange={e => setAttendanceSessionId(e.target.value)} required>
                  {sessions.length === 0 && <option value="">Create an academic session first</option>}
                  {sessions.map(s => <option key={s.id} value={s.id}>{s.name}{s.isCurrent ? " (Current)" : ""}</option>)}
                </select>
              </label>
              <label>Course *
                <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} required>
                  {courses.length === 0 && <option value="">Create a course first</option>}
                  {courses.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
                </select>
              </label>
              <label>Attendance date *
                <input type="date" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} required />
              </label>
            </div>
            {!selectedInstituteId ? (
              <div className="empty-state">Choose an institute first.</div>
            ) : sessions.length === 0 ? (
              <div className="empty-state"><h3>Academic session required</h3><p>Create an academic session before taking attendance.</p></div>
            ) : courses.length === 0 ? (
              <div className="empty-state">Create a course before taking attendance.</div>
            ) : students.filter(s => s.courseId === selectedCourseId && s.isActive).length === 0 ? (
              <div className="empty-state"><h3>No active students</h3><p>Admit active students into this course first.</p></div>
            ) : attendanceLoading ? (
              <div className="empty-state">Loading attendance…</div>
            ) : (
              <>
                <div className="status-grid">
                  {(["Present", "Absent", "Late", "Excused"] as AttendanceStatus[]).map(status => (
                    <article className="status-card" key={status}>
                      <span className={`status-dot ${status === "Absent" ? "" : status === "Late" ? "status-dot-blue" : status === "Excused" ? "status-dot-purple" : ""}`} />
                      <div><strong>{status}</strong><p>{students.filter(s => s.courseId === selectedCourseId && s.isActive && (attendanceDrafts[s.id]?.status ?? "Present") === status).length} students</p></div>
                    </article>
                  ))}
                </div>
                <div className="session-list">
                  {students.filter(s => s.courseId === selectedCourseId && s.isActive).map(student => (
                    <article className="session-item" key={student.id}>
                      <div className="session-icon">{student.fullName.trim().charAt(0).toUpperCase()}</div>
                      <div className="session-copy">
                        <strong>{student.fullName}</strong>
                        <small>{student.admissionNumber} · {student.phone}</small>
                        <input aria-label={`Notes for ${student.fullName}`} maxLength={500}
                          placeholder="Optional note" value={attendanceDrafts[student.id]?.notes ?? ""}
                          onChange={e => setAttendanceDrafts(old => ({ ...old, [student.id]: { status: old[student.id]?.status ?? "Present", notes: e.target.value } }))} />
                      </div>
                      <select aria-label={`Attendance status for ${student.fullName}`}
                        value={attendanceDrafts[student.id]?.status ?? "Present"}
                        onChange={e => setAttendanceDrafts(old => ({ ...old, [student.id]: { status: e.target.value as AttendanceStatus, notes: old[student.id]?.notes ?? "" } }))}>
                        <option value="Present">Present</option>
                        <option value="Absent">Absent</option>
                        <option value="Late">Late</option>
                        <option value="Excused">Excused</option>
                      </select>
                    </article>
                  ))}
                </div>
                <button className="button button-primary" type="button"
                  disabled={busy || attendanceLoading}
                  onClick={() => void saveAttendance()}>
                  {busy ? "Saving…" : "Save attendance"}
                </button>
              </>
            )}
          </section>
            </>}
            {activePage === "attendanceReports" && <>
          <div className="eyebrow">REPORTING & INSIGHTS</div><h1>Attendance Reports</h1><p className="lead">Review daily totals, monthly summaries and student-wise attendance percentages.</p>
          <section className="panel courses-panel">
            <div className="section-heading">
              <div>
                <div className="eyebrow">REPORTING & INSIGHTS</div>
                <h2>Attendance Reports</h2>
                <p>Review daily totals, monthly summaries and student-wise attendance percentages.</p>
              </div>
              <div className="topbar-actions">
                <button className="button button-ghost" type="button" disabled={!reportGenerated || reportRows.length === 0 || reportLoading} onClick={exportAttendanceReportCsv}>
                  Export CSV
                </button>
                <button className="button button-primary" type="button" disabled={reportLoading || !selectedInstituteId || !selectedCourseId || !attendanceSessionId} onClick={() => void generateAttendanceReport()}>
                  {reportLoading ? "Generating…" : "Generate report"}
                </button>
              </div>
            </div>
            <div className="form-grid">
              <label>From date *
                <input type="date" value={reportFromDate} onChange={e => setReportFromDate(e.target.value)} required />
              </label>
              <label>To date *
                <input type="date" min={reportFromDate} value={reportToDate} onChange={e => setReportToDate(e.target.value)} required />
              </label>
            </div>
            {!reportGenerated ? (
              <div className="empty-state">Choose a date range and generate a report. Reports include saved attendance records only.</div>
            ) : reportRows.length === 0 ? (
              <div className="empty-state"><h3>No attendance records found</h3><p>Try a different date range or save attendance first.</p></div>
            ) : (
              <>
                <div className="status-grid">
                  <article className="status-card"><span className="status-dot" /><div><strong>Recorded entries</strong><p>{reportRows.length}</p></div></article>
                  <article className="status-card"><span className="status-dot status-dot-blue" /><div><strong>Students tracked</strong><p>{studentReport.length}</p></div></article>
                  <article className="status-card"><span className="status-dot status-dot-purple" /><div><strong>Attendance dates</strong><p>{dailyReport.length}</p></div></article>
                  <article className="status-card"><span className="status-dot" /><div><strong>Present</strong><p>{reportRows.filter(row => row.status === "Present").length}</p></div></article>
                  <article className="status-card"><span className="status-dot" /><div><strong>Absent</strong><p>{reportRows.filter(row => row.status === "Absent").length}</p></div></article>
                  <article className="status-card"><span className="status-dot status-dot-blue" /><div><strong>Late</strong><p>{reportRows.filter(row => row.status === "Late").length}</p></div></article>
                  <article className="status-card"><span className="status-dot status-dot-purple" /><div><strong>Excused</strong><p>{reportRows.filter(row => row.status === "Excused").length}</p></div></article>
                </div>
                <h3>Daily summary</h3>
                <div className="session-list">
                  {dailyReport.map(row => (
                    <article className="session-item" key={row.date}>
                      <div className="session-icon">▦</div>
                      <div className="session-copy"><strong>{row.date}</strong><small>Present {row.present} · Absent {row.absent} · Late {row.late} · Excused {row.excused}</small></div>
                      <span className="current-badge">{row.total} records</span>
                    </article>
                  ))}
                </div>
                <h3>Monthly summary</h3>
                <div className="session-list">
                  {monthlyReport.map(row => (
                    <article className="session-item" key={row.month}>
                      <div className="session-icon">▤</div>
                      <div className="session-copy"><strong>{row.month}</strong><small>Present {row.present} · Absent {row.absent} · Late {row.late} · Excused {row.excused}</small></div>
                      <span className="current-badge">{row.total} records</span>
                    </article>
                  ))}
                </div>
                <div className="section-heading">
                  <div>
                    <h3>Student-wise attendance profiles</h3>
                    <p>Set the minimum attendance percentage and open a student profile to review recorded history.</p>
                  </div>
                  <label className="threshold-control">Low-attendance threshold (%)
                    <input aria-label="Low-attendance threshold percentage" type="number" min={1} max={100} step={1} value={lowAttendanceThreshold} onChange={e => setLowAttendanceThreshold(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
                  </label>
                </div>
                <div className="status-grid">
                  <article className="status-card"><span className="status-dot status-dot-purple" /><div><strong>Below threshold</strong><p>{studentReport.filter(row => { const d = row.present + row.absent + row.late; return d > 0 && ((row.present + row.late) / d) * 100 < lowAttendanceThreshold; }).length}</p></div></article>
                  <article className="status-card"><span className="status-dot status-dot-blue" /><div><strong>Threshold setting</strong><p>{lowAttendanceThreshold}%</p></div></article>
                </div>
                {studentReport.some(row => { const d = row.present + row.absent + row.late; return d > 0 && ((row.present + row.late) / d) * 100 < lowAttendanceThreshold; }) && (
                  <div className="empty-state" role="status"><strong>Low-attendance alert:</strong> {studentReport.filter(row => { const d = row.present + row.absent + row.late; return d > 0 && ((row.present + row.late) / d) * 100 < lowAttendanceThreshold; }).length} student(s) are below {lowAttendanceThreshold}% for the selected report period.</div>
                )}
                <div className="session-list">
                  {studentReport.map(row => {
                    const denominator = row.present + row.absent + row.late;
                    const percentage = denominator === 0 ? null : ((row.present + row.late) / denominator) * 100;
                    const isLow = percentage !== null && percentage < lowAttendanceThreshold;
                    const profileOpen = expandedAttendanceProfileId === row.studentId;
                    const history = reportRows.filter(item => item.studentId === row.studentId).sort((a, b) => a.attendanceDate.localeCompare(b.attendanceDate));
                    return (
                      <article className="session-item" key={row.studentId}>
                        <div className="session-icon">{row.studentName.trim().charAt(0).toUpperCase()}</div>
                        <div className="session-copy">
                          <strong>{row.studentName}</strong>
                          <small>{row.admissionNumber} · Present {row.present} · Absent {row.absent} · Late {row.late} · Excused {row.excused}</small>
                          <small>Attendance percentage: {percentage === null ? "N/A (no non-excused records)" : `${percentage.toFixed(1)}%`} · Excused entries are excluded from the denominator; Late counts as attended.</small>
                          {isLow && <small role="alert">Below the configured {lowAttendanceThreshold}% threshold.</small>}
                          <button className="button button-ghost" type="button" onClick={() => setExpandedAttendanceProfileId(profileOpen ? null : row.studentId)}>{profileOpen ? "Hide attendance history" : "View attendance profile"}</button>
                          {profileOpen && <div className="session-list attendance-profile-history"><strong>Recorded history ({history.length})</strong>{history.map((entry, index) => <div className="session-item" key={`${entry.attendanceDate}-${index}`}><div className="session-copy"><strong>{entry.attendanceDate.slice(0, 10)}</strong><small>{entry.status}{entry.notes ? ` · ${entry.notes}` : ""}</small></div><span className={entry.status === "Present" || entry.status === "Late" ? "current-badge" : "status-badge"}>{entry.status}</span></div>)}</div>}
                        </div>
                        <span className={percentage !== null && !isLow ? "current-badge" : "status-badge"}>{percentage === null ? "N/A" : `${percentage.toFixed(1)}%`}</span>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </section>
            </>}
            {activePage === "analytics" && <>
              <div className="eyebrow">PERFORMANCE</div><h1>Student Analytics</h1><p className="lead">Review student performance and progress.</p>
              <StudentAnalytics
            token={token}
            instituteId={selectedInstituteId}
            selectedCourseId={selectedCourseId}
            selectedSessionId={attendanceSessionId}
            courses={courses}
            sessions={sessions}
            students={students}
          />
            </>}
            {activePage === "assessments" && <>
              <div className="eyebrow">EXAMINATIONS</div><h1>Exams & Assessments</h1><p className="lead">Configure assessments, sections and student marks.</p>
              <AssessmentManagement
            token={token}
            instituteId={selectedInstituteId}
            selectedCourseId={selectedCourseId}
            selectedSessionId={attendanceSessionId}
            courses={courses}
            sessions={sessions}
            subjects={subjects}
            students={students}
            onCourseChange={setSelectedCourseId}
            onSessionChange={setAttendanceSessionId}
          />
            </>}
            {activePage === "fees" && <>
              <div className="eyebrow">FINANCE</div><h1>Fee Management</h1><p className="lead">Track student fee obligations, partial payments, outstanding balances and printable receipts.</p>
              <FeeManagement token={token} instituteId={selectedInstituteId} selectedSessionId={attendanceSessionId || sessions.find(s => s.isCurrent)?.id || ""} students={students} sessions={sessions} />
            </>}
            {activePage === "diagnostics" && <>
          <div className="eyebrow">SYSTEM</div><h1>System Diagnostics</h1><p className="lead">Verify the event pipeline and application connectivity.</p>
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
            </>}
          {message && <div className="notice notice-success">{message}</div>}
          {error && <div className="notice notice-error">{error}</div>}
          <footer>
            Signed in as {user.email} · {user.roles.join(", ") || "User"} ·
            ProgressiveMinds
          </footer>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="login-layout">
      <section className="hero-panel">
        <div className="brand brand-large" aria-label="Progressive Minds">
          <img className="brand-logo brand-logo-large" src="https://progressiveminds.in/images/logo.png" alt="Progressive Minds" />
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



