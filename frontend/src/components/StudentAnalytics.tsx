
import { useEffect, useMemo, useState } from "react";
import "./StudentAnalytics.css";

type Course = {
  id: string;
  code: string;
  name: string;
};

type AcademicSession = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

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
  title: string;
  assessmentType: "WeeklyTest" | "JeeMock" | "NeetMock";
  assessmentDate: string;
  totalMaxMarks: number;
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

type AttendanceRecord = {
  studentId: string;
  attendanceDate: string;
  status: "Present" | "Absent" | "Late" | "Excused";
};

type StudentAggregate = {
  studentId: string;
  admissionNumber: string;
  studentName: string;
  earnedMarks: number;
  possibleMarks: number;
  completedSections: number;
  assessmentIds: Set<string>;
  present: number;
  absent: number;
  late: number;
  excused: number;
};

type SubjectAggregate = {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  earnedMarks: number;
  possibleMarks: number;
  gradedEntries: number;
};

type AnalyticsRow = {
  studentId: string;
  admissionNumber: string;
  studentName: string;
  averagePercentage: number | null;
  earnedMarks: number;
  possibleMarks: number;
  completedAssessments: number;
  attendancePercentage: number | null;
  attendanceRecorded: number;
};

type Props = {
  token: string;
  instituteId: string;
  selectedCourseId: string;
  selectedSessionId: string;
  courses: Course[];
  sessions: AcademicSession[];
  students: Student[];
};

const API_BASE = "http://localhost:5080";

function percentage(earned: number, possible: number): number | null {
  return possible > 0 ? (earned / possible) * 100 : null;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function formatMarks(earned: number, possible: number): string {
  if (possible <= 0) return "—";
  return `${earned.toFixed(2).replace(/\.00$/, "")} / ${possible}`;
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export default function StudentAnalytics({
  token,
  instituteId,
  selectedCourseId,
  selectedSessionId,
  courses,
  sessions,
  students,
}: Props) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [markRowsBySection, setMarkRowsBySection] = useState<
    Record<string, MarkRow[]>
  >({});
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"rank" | "attendance" | "name">("rank");
  const [selectedStudentId, setSelectedStudentId] = useState("");

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId);

  useEffect(() => {
    if (!token || !instituteId || !selectedCourseId || !selectedSessionId) {
      setAssessments([]);
      setMarkRowsBySection({});
      setAttendanceRows([]);
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function getJson<T>(path: string): Promise<T> {
      const response = await fetch(`${API_BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          body || `Request failed (${response.status}) for ${path}`,
        );
      }

      return (await response.json()) as T;
    }

    async function loadAnalytics() {
      setLoading(true);
      setError("");
      setAssessments([]);
      setMarkRowsBySection({});
      setAttendanceRows([]);

      try {
        const [assessmentData, attendanceData] = await Promise.all([
          getJson<Assessment[]>(
            `/api/institutes/${encodeURIComponent(instituteId)}/assessments?courseId=${encodeURIComponent(selectedCourseId)}&academicSessionId=${encodeURIComponent(selectedSessionId)}`,
          ),
          getJson<AttendanceRecord[]>(
            `/api/institutes/${encodeURIComponent(instituteId)}/attendance/reports?courseId=${encodeURIComponent(selectedCourseId)}&academicSessionId=${encodeURIComponent(selectedSessionId)}&fromDate=${encodeURIComponent(selectedSession!.startDate.slice(0, 10))}&toDate=${encodeURIComponent(selectedSession!.endDate.slice(0, 10))}`,
          ),
        ]);

        if (cancelled) return;

        setAssessments(assessmentData);
        setAttendanceRows(attendanceData);

        const sectionRequests = assessmentData.flatMap((assessment) =>
          (assessment.sections ?? []).map(async (section) => {
            const rows = await getJson<MarkRow[]>(
              `/api/institutes/${encodeURIComponent(instituteId)}/assessments/${encodeURIComponent(assessment.id)}/sections/${encodeURIComponent(section.id)}/marks`,
            );

            return {
              key: `${assessment.id}:${section.id}`,
              rows,
            };
          }),
        );

        const results = await Promise.all(sectionRequests);

        if (cancelled) return;

        const next: Record<string, MarkRow[]> = {};
        for (const result of results) {
          next[result.key] = result.rows;
        }
        setMarkRowsBySection(next);
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load student analytics.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (!selectedSession) {
      setError("The selected academic session could not be found.");
      setLoading(false);
      return;
    }

    void loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, [token, instituteId, selectedCourseId, selectedSessionId, selectedSession]);

  const activeStudents = useMemo(
    () =>
      students.filter(
        (student) =>
          student.courseId === selectedCourseId && student.isActive,
      ),
    [students, selectedCourseId],
  );

  const aggregates = useMemo(() => {
    const byStudent = new Map<string, StudentAggregate>();

    for (const student of activeStudents) {
      byStudent.set(student.id, {
        studentId: student.id,
        admissionNumber: student.admissionNumber,
        studentName: student.fullName,
        earnedMarks: 0,
        possibleMarks: 0,
        completedSections: 0,
        assessmentIds: new Set<string>(),
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      });
    }

    const subjects = new Map<string, SubjectAggregate>();
    let gradedSectionCount = 0;

    for (const assessment of assessments) {
      for (const section of assessment.sections ?? []) {
        const key = `${assessment.id}:${section.id}`;
        const markRows = markRowsBySection[key] ?? [];
        const subjectKey = section.subjectId || section.subjectName;

        if (!subjects.has(subjectKey)) {
          subjects.set(subjectKey, {
            subjectId: section.subjectId,
            subjectName: section.subjectName,
            subjectCode: section.subjectCode,
            earnedMarks: 0,
            possibleMarks: 0,
            gradedEntries: 0,
          });
        }

        const subject = subjects.get(subjectKey)!;
        const sectionMax = Number(section.maxMarks);

        for (const mark of markRows) {
          const student = byStudent.get(mark.studentId);
          if (!student || mark.marksObtained === null || mark.marksObtained === undefined) {
            continue;
          }

          const earned = Number(mark.marksObtained);
          const possible = Number(mark.maxMarks || sectionMax);

          if (!Number.isFinite(earned) || !Number.isFinite(possible) || possible <= 0) {
            continue;
          }

          student.earnedMarks += earned;
          student.possibleMarks += possible;
          student.completedSections += 1;
          student.assessmentIds.add(assessment.id);

          subject.earnedMarks += earned;
          subject.possibleMarks += possible;
          subject.gradedEntries += 1;
          gradedSectionCount += 1;
        }
      }
    }

    for (const record of attendanceRows) {
      const student = byStudent.get(record.studentId);
      if (!student) continue;

      switch (record.status) {
        case "Present":
          student.present += 1;
          break;
        case "Absent":
          student.absent += 1;
          break;
        case "Late":
          student.late += 1;
          break;
        case "Excused":
          student.excused += 1;
          break;
      }
    }

    const rows: AnalyticsRow[] = Array.from(byStudent.values()).map((student) => {
      const attendanceRecorded = student.present + student.absent + student.late;
      const attendanceAttended = student.present + student.late;

      return {
        studentId: student.studentId,
        admissionNumber: student.admissionNumber,
        studentName: student.studentName,
        averagePercentage: percentage(student.earnedMarks, student.possibleMarks),
        earnedMarks: student.earnedMarks,
        possibleMarks: student.possibleMarks,
        completedAssessments: student.assessmentIds.size,
        attendancePercentage:
          attendanceRecorded > 0
            ? (attendanceAttended / attendanceRecorded) * 100
            : null,
        attendanceRecorded,
      };
    });

    const ranked = [...rows].sort((a, b) => {
      if (a.averagePercentage === null && b.averagePercentage === null) {
        return a.studentName.localeCompare(b.studentName);
      }
      if (a.averagePercentage === null) return 1;
      if (b.averagePercentage === null) return -1;
      return (
        b.averagePercentage - a.averagePercentage ||
        a.studentName.localeCompare(b.studentName)
      );
    });

    const subjectRows = Array.from(subjects.values()).sort(
      (a, b) => a.subjectName.localeCompare(b.subjectName),
    );

    const scoredRows = rows.filter((row) => row.averagePercentage !== null);
    const totalEarned = scoredRows.reduce((sum, row) => sum + row.earnedMarks, 0);
    const totalPossible = scoredRows.reduce((sum, row) => sum + row.possibleMarks, 0);
    const averagePercentage =
      scoredRows.length > 0
        ? scoredRows.reduce((sum, row) => sum + (row.averagePercentage ?? 0), 0) /
          scoredRows.length
        : null;
    const highestPercentage =
      ranked.find((row) => row.averagePercentage !== null)?.averagePercentage ?? null;

    return {
      byStudent,
      rows,
      ranked,
      subjectRows,
      scoredStudents: scoredRows.length,
      averagePercentage,
      highestPercentage,
      totalEarned,
      totalPossible,
      gradedSectionCount,
    };
  }, [activeStudents, assessments, markRowsBySection, attendanceRows]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = aggregates.ranked.filter(
      (row) =>
        !query ||
        row.studentName.toLowerCase().includes(query) ||
        row.admissionNumber.toLowerCase().includes(query),
    );

    if (sortBy === "name") {
      return [...filtered].sort((a, b) =>
        a.studentName.localeCompare(b.studentName),
      );
    }

    if (sortBy === "attendance") {
      return [...filtered].sort((a, b) => {
        if (a.attendancePercentage === null && b.attendancePercentage === null) return 0;
        if (a.attendancePercentage === null) return 1;
        if (b.attendancePercentage === null) return -1;
        return b.attendancePercentage - a.attendancePercentage;
      });
    }

    return filtered;
  }, [aggregates.ranked, search, sortBy]);

  const selectedStudent = aggregates.rows.find(
    (row) => row.studentId === selectedStudentId,
  );
  const selectedStudentAggregate = aggregates.byStudent.get(selectedStudentId);

  function exportCsv() {
    if (visibleRows.length === 0) {
      setError("There are no student rows to export.");
      return;
    }

    const headers = [
      "Rank",
      "Admission Number",
      "Student Name",
      "Marks Obtained",
      "Maximum Marks",
      "Performance Percentage",
      "Assessments With Marks",
      "Attendance Percentage",
      "Attendance Records Counted",
    ];

    const data = visibleRows.map((row) => {
      const rank =
        row.averagePercentage === null
          ? ""
          : aggregates.ranked.findIndex((item) => item.studentId === row.studentId) + 1;

      return [
        rank,
        row.admissionNumber,
        row.studentName,
        row.possibleMarks > 0 ? row.earnedMarks.toFixed(2) : "",
        row.possibleMarks > 0 ? row.possibleMarks : "",
        row.averagePercentage === null ? "" : row.averagePercentage.toFixed(2),
        row.completedAssessments,
        row.attendancePercentage === null ? "" : row.attendancePercentage.toFixed(2),
        row.attendanceRecorded,
      ];
    });

    const csv = [headers, ...data]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `progressiveminds-student-analytics-${selectedCourse?.code ?? "course"}-${selectedSession?.name ?? "session"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel student-analytics">
      <div className="section-heading student-analytics-heading">
        <div>
          <div className="eyebrow">ACADEMIC INSIGHTS</div>
          <h2>Student Performance Analytics</h2>
          <p>
            Assessment results and recorded attendance for the selected course
            and academic session.
          </p>
          <small className="analytics-context">
            {selectedCourse
              ? `${selectedCourse.code} - ${selectedCourse.name}`
              : "No course selected"}
            {selectedSession ? ` · ${selectedSession.name}` : ""}
          </small>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={exportCsv}
          disabled={loading || visibleRows.length === 0}
        >
          Export CSV
        </button>
      </div>

      {!instituteId || !selectedCourseId || !selectedSessionId ? (
        <div className="empty-state">
          Select an institute, course, and academic session to view analytics.
        </div>
      ) : loading ? (
        <div className="analytics-loading">
          <span className="analytics-spinner" />
          <div>
            <strong>Calculating student performance</strong>
            <p>Loading assessment marks and attendance records…</p>
          </div>
        </div>
      ) : error ? (
        <div className="analytics-error" role="alert">
          <strong>Analytics could not be loaded</strong>
          <p>{error}</p>
          <button
            className="button button-ghost"
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      ) : (
        <>
          <div className="analytics-kpi-grid">
            <article className="analytics-kpi">
              <span>Active students</span>
              <strong>{activeStudents.length}</strong>
              <small>In selected course</small>
            </article>
            <article className="analytics-kpi">
              <span>Average performance</span>
              <strong>{formatPercent(aggregates.averagePercentage)}</strong>
              <small>Mean of students with marks</small>
            </article>
            <article className="analytics-kpi">
              <span>Highest performance</span>
              <strong>{formatPercent(aggregates.highestPercentage)}</strong>
              <small>Top recorded aggregate</small>
            </article>
            <article className="analytics-kpi">
              <span>Assessments</span>
              <strong>{assessments.length}</strong>
              <small>{aggregates.gradedSectionCount} graded student-section entries</small>
            </article>
          </div>

          <div className="analytics-section-title">
            <div>
              <h3>Subject performance</h3>
              <p>Weighted by marks earned and maximum marks for recorded results.</p>
            </div>
          </div>

          {aggregates.subjectRows.length === 0 ? (
            <div className="analytics-empty">
              No marks have been entered for this course and session yet.
            </div>
          ) : (
            <div className="analytics-subject-grid">
              {aggregates.subjectRows.map((subject) => {
                const value = percentage(subject.earnedMarks, subject.possibleMarks);
                const safeValue = Math.max(0, Math.min(100, value ?? 0));

                return (
                  <article className="analytics-subject" key={subject.subjectId || subject.subjectName}>
                    <div className="analytics-subject-top">
                      <div>
                        <strong>{subject.subjectName}</strong>
                        <small>{subject.subjectCode || "Subject"}</small>
                      </div>
                      <b>{formatPercent(value)}</b>
                    </div>
                    <div
                      className="analytics-progress-track"
                      role="progressbar"
                      aria-label={`${subject.subjectName} performance`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={safeValue}
                    >
                      <span style={{ width: `${safeValue}%` }} />
                    </div>
                    <small>
                      {formatMarks(subject.earnedMarks, subject.possibleMarks)} ·{" "}
                      {subject.gradedEntries} recorded results
                    </small>
                  </article>
                );
              })}
            </div>
          )}

          <div className="analytics-section-title analytics-table-heading">
            <div>
              <h3>Student rankings</h3>
              <p>
                Students without recorded marks are shown as unranked. Missing
                marks are never treated as zero.
              </p>
            </div>
            <div className="analytics-table-controls">
              <input
                aria-label="Search students"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name or admission no."
              />
              <select
                aria-label="Sort student analytics"
                value={sortBy}
                onChange={(event) =>
                  setSortBy(event.target.value as "rank" | "attendance" | "name")
                }
              >
                <option value="rank">Sort by performance</option>
                <option value="attendance">Sort by attendance</option>
                <option value="name">Sort by student name</option>
              </select>
            </div>
          </div>

          {visibleRows.length === 0 ? (
            <div className="analytics-empty">No students match this search.</div>
          ) : (
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Student</th>
                    <th>Marks</th>
                    <th>Performance</th>
                    <th>Assessments</th>
                    <th>Attendance</th>
                    <th>Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const rank =
                      row.averagePercentage === null
                        ? null
                        : aggregates.ranked.findIndex(
                            (item) => item.studentId === row.studentId,
                          ) + 1;

                    return (
                      <tr key={row.studentId}>
                        <td>
                          {rank === null ? (
                            <span className="analytics-unranked">—</span>
                          ) : (
                            <span className={`analytics-rank ${rank <= 3 ? "analytics-rank-top" : ""}`}>
                              {rank}
                            </span>
                          )}
                        </td>
                        <td>
                          <strong>{row.studentName}</strong>
                          <small>{row.admissionNumber}</small>
                        </td>
                        <td>{formatMarks(row.earnedMarks, row.possibleMarks)}</td>
                        <td>
                          <span
                            className={`analytics-score ${row.averagePercentage !== null && row.averagePercentage >= 75 ? "analytics-score-high" : row.averagePercentage !== null && row.averagePercentage < 40 ? "analytics-score-low" : ""}`}
                          >
                            {formatPercent(row.averagePercentage)}
                          </span>
                        </td>
                        <td>{row.completedAssessments}</td>
                        <td>
                          <span
                            className={`analytics-attendance ${row.attendancePercentage !== null && row.attendancePercentage < 75 ? "analytics-attendance-low" : ""}`}
                          >
                            {formatPercent(row.attendancePercentage)}
                          </span>
                          <small>
                            {row.attendanceRecorded > 0
                              ? `${row.attendanceRecorded} records`
                              : "No records"}
                          </small>
                        </td>
                        <td>
                          <button
                            className="analytics-view-button"
                            type="button"
                            onClick={() =>
                              setSelectedStudentId((current) =>
                                current === row.studentId ? "" : row.studentId,
                              )
                            }
                          >
                            {selectedStudentId === row.studentId ? "Close" : "View"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {selectedStudent && selectedStudentAggregate && (
            <div className="analytics-student-detail">
              <div className="analytics-section-title">
                <div>
                  <h3>{selectedStudent.studentName}</h3>
                  <p>{selectedStudent.admissionNumber} · Student performance profile</p>
                </div>
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={() => setSelectedStudentId("")}
                >
                  Close profile
                </button>
              </div>

              <div className="analytics-detail-grid">
                <div>
                  <span>Aggregate performance</span>
                  <strong>{formatPercent(selectedStudent.averagePercentage)}</strong>
                </div>
                <div>
                  <span>Total recorded marks</span>
                  <strong>
                    {formatMarks(
                      selectedStudent.earnedMarks,
                      selectedStudent.possibleMarks,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Assessments with marks</span>
                  <strong>{selectedStudent.completedAssessments}</strong>
                </div>
                <div>
                  <span>Attendance</span>
                  <strong>{formatPercent(selectedStudent.attendancePercentage)}</strong>
                </div>
                <div>
                  <span>Present</span>
                  <strong>{selectedStudentAggregate.present}</strong>
                </div>
                <div>
                  <span>Late</span>
                  <strong>{selectedStudentAggregate.late}</strong>
                </div>
                <div>
                  <span>Absent</span>
                  <strong>{selectedStudentAggregate.absent}</strong>
                </div>
                <div>
                  <span>Excused</span>
                  <strong>{selectedStudentAggregate.excused}</strong>
                </div>
              </div>

              <div className="analytics-detail-subjects">
                <h4>Subject marks</h4>
                {aggregates.subjectRows.map((subject) => {
                  let earned = 0;
                  let possible = 0;

                  for (const assessment of assessments) {
                    for (const section of assessment.sections ?? []) {
                      if (
                        section.subjectId !== subject.subjectId &&
                        section.subjectName !== subject.subjectName
                      ) {
                        continue;
                      }

                      const key = `${assessment.id}:${section.id}`;
                      const row = (markRowsBySection[key] ?? []).find(
                        (mark) => mark.studentId === selectedStudentId,
                      );

                      if (row?.marksObtained === null || row?.marksObtained === undefined) {
                        continue;
                      }

                      const max = Number(row.maxMarks || section.maxMarks);
                      const mark = Number(row.marksObtained);

                      if (Number.isFinite(max) && max > 0 && Number.isFinite(mark)) {
                        earned += mark;
                        possible += max;
                      }
                    }
                  }

                  return (
                    <div
                      className="analytics-detail-subject-row"
                      key={subject.subjectId || subject.subjectName}
                    >
                      <span>{subject.subjectName}</span>
                      <strong>{formatMarks(earned, possible)}</strong>
                      <span>{formatPercent(percentage(earned, possible))}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
