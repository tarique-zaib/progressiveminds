
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProgressiveMinds.Api.Contracts;
using ProgressiveMinds.Api.Data;
using ProgressiveMinds.Api.Models;

namespace ProgressiveMinds.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/institutes/{instituteId:guid}/attendance")]
public sealed class AttendanceController : ControllerBase
{
    private static readonly HashSet<string> ValidStatuses =
        new(StringComparer.Ordinal) { "Present", "Absent", "Late", "Excused" };

    private readonly AppDbContext _db;

    public AttendanceController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AttendanceResponse>>> Get(
        Guid instituteId,
        [FromQuery] Guid courseId,
        [FromQuery] Guid academicSessionId,
        [FromQuery] DateOnly date,
        CancellationToken ct)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        if (!await IsMember(instituteId, userId, ct))
            return NotFound();

        var validScope = await _db.Courses.AnyAsync(c =>
                c.Id == courseId && c.InstituteId == instituteId, ct)
            && await _db.AcademicSessions.AnyAsync(s =>
                s.Id == academicSessionId && s.InstituteId == instituteId, ct);

        if (!validScope)
        {
            return BadRequest(new
            {
                message = "Select a valid course and academic session for this institute."
            });
        }

        var rows = await (
            from a in _db.AttendanceRecords.AsNoTracking()
            join s in _db.Students.AsNoTracking()
                on a.StudentId equals s.Id
            where a.InstituteId == instituteId
                && a.CourseId == courseId
                && a.AcademicSessionId == academicSessionId
                && a.AttendanceDate == date
            orderby s.FullName
            select new AttendanceResponse(
                a.Id,
                a.InstituteId,
                a.AcademicSessionId,
                a.CourseId,
                a.StudentId,
                s.FullName,
                s.AdmissionNumber,
                a.AttendanceDate,
                a.Status,
                a.Notes,
                a.CreatedAtUtc,
                a.UpdatedAtUtc)
        ).ToListAsync(ct);

        return Ok(rows);
    }

    [HttpGet("reports")]
    public async Task<ActionResult<IReadOnlyList<AttendanceResponse>>> GetReports(
        Guid instituteId,
        [FromQuery] Guid courseId,
        [FromQuery] Guid academicSessionId,
        [FromQuery] DateOnly fromDate,
        [FromQuery] DateOnly toDate,
        CancellationToken ct)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        if (!await IsMember(instituteId, userId, ct))
            return NotFound();

        if (fromDate > toDate)
        {
            return BadRequest(new
            {
                message = "From date must be on or before the to date."
            });
        }

        if (toDate.DayNumber - fromDate.DayNumber > 366)
        {
            return BadRequest(new
            {
                message = "Choose a report period of 367 days or fewer."
            });
        }

        var validScope = await _db.Courses.AnyAsync(c =>
                c.Id == courseId && c.InstituteId == instituteId, ct)
            && await _db.AcademicSessions.AnyAsync(s =>
                s.Id == academicSessionId && s.InstituteId == instituteId, ct);

        if (!validScope)
        {
            return BadRequest(new
            {
                message = "Select a valid course and academic session for this institute."
            });
        }

        var rows = await (
            from a in _db.AttendanceRecords.AsNoTracking()
            join s in _db.Students.AsNoTracking()
                on a.StudentId equals s.Id
            where a.InstituteId == instituteId
                && a.CourseId == courseId
                && a.AcademicSessionId == academicSessionId
                && a.AttendanceDate >= fromDate
                && a.AttendanceDate <= toDate
            orderby a.AttendanceDate, s.FullName
            select new AttendanceResponse(
                a.Id,
                a.InstituteId,
                a.AcademicSessionId,
                a.CourseId,
                a.StudentId,
                s.FullName,
                s.AdmissionNumber,
                a.AttendanceDate,
                a.Status,
                a.Notes,
                a.CreatedAtUtc,
                a.UpdatedAtUtc)
        ).ToListAsync(ct);

        return Ok(rows);
    }

    [HttpPost]
    public async Task<ActionResult<SaveAttendanceResponse>> Save(
        Guid instituteId,
        SaveAttendanceRequest request,
        CancellationToken ct)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        if (!await IsMember(instituteId, userId, ct))
            return NotFound();

        if (request.CourseId == Guid.Empty ||
            request.AcademicSessionId == Guid.Empty)
        {
            return BadRequest(new
            {
                message = "Course and academic session are required."
            });
        }

        if (request.Records is null || request.Records.Count == 0)
        {
            return BadRequest(new
            {
                message = "At least one student attendance record is required."
            });
        }

        if (request.Records.Count > 500)
        {
            return BadRequest(new
            {
                message = "Save attendance in groups of 500 students or fewer."
            });
        }

        if (request.Records.Select(x => x.StudentId).Distinct().Count()
            != request.Records.Count)
        {
            return BadRequest(new
            {
                message = "A student appears more than once in this attendance request."
            });
        }

        if (request.Records.Any(x => !ValidStatuses.Contains(x.Status)))
        {
            return BadRequest(new
            {
                message = "Status must be Present, Absent, Late, or Excused."
            });
        }

        if (request.Records.Any(x => x.Notes?.Length > 500))
        {
            return BadRequest(new
            {
                message = "Attendance notes cannot exceed 500 characters."
            });
        }

        var courseExists = await _db.Courses.AnyAsync(c =>
            c.Id == request.CourseId &&
            c.InstituteId == instituteId, ct);

        var sessionExists = await _db.AcademicSessions.AnyAsync(s =>
            s.Id == request.AcademicSessionId &&
            s.InstituteId == instituteId, ct);

        if (!courseExists || !sessionExists)
        {
            return BadRequest(new
            {
                message = "Select a valid course and academic session for this institute."
            });
        }

        var studentIds = request.Records
            .Select(x => x.StudentId)
            .ToArray();

        var validStudentIds = await _db.Students
            .Where(s =>
                s.InstituteId == instituteId &&
                s.CourseId == request.CourseId &&
                s.IsActive &&
                studentIds.Contains(s.Id))
            .Select(s => s.Id)
            .ToListAsync(ct);

        if (validStudentIds.Count != studentIds.Length)
        {
            return BadRequest(new
            {
                message = "Every student must be active and enrolled in the selected course and institute."
            });
        }

        var now = DateTime.UtcNow;

        var existing = await _db.AttendanceRecords
            .Where(a =>
                a.InstituteId == instituteId &&
                a.AcademicSessionId == request.AcademicSessionId &&
                a.CourseId == request.CourseId &&
                a.AttendanceDate == request.AttendanceDate &&
                studentIds.Contains(a.StudentId))
            .ToListAsync(ct);

        var byStudent = existing.ToDictionary(a => a.StudentId);
        var changed = new List<AttendanceRecord>();
        var newlyAbsent = new List<AttendanceRecord>();

        foreach (var input in request.Records)
        {
            var note = string.IsNullOrWhiteSpace(input.Notes)
                ? null
                : input.Notes.Trim();

            if (byStudent.TryGetValue(input.StudentId, out var existingRecord))
            {
                var wasAbsent = string.Equals(
                    existingRecord.Status, "Absent", StringComparison.Ordinal);

                existingRecord.Status = input.Status;
                existingRecord.Notes = note;
                existingRecord.MarkedByUserId = userId;
                existingRecord.UpdatedAtUtc = now;

                changed.Add(existingRecord);

                if (!wasAbsent &&
                    string.Equals(input.Status, "Absent", StringComparison.Ordinal))
                {
                    newlyAbsent.Add(existingRecord);
                }
            }
            else
            {
                var newRecord = new AttendanceRecord
                {
                    InstituteId = instituteId,
                    AcademicSessionId = request.AcademicSessionId,
                    CourseId = request.CourseId,
                    StudentId = input.StudentId,
                    AttendanceDate = request.AttendanceDate,
                    Status = input.Status,
                    Notes = note,
                    MarkedByUserId = userId,
                    CreatedAtUtc = now,
                    UpdatedAtUtc = now
                };

                _db.AttendanceRecords.Add(newRecord);
                changed.Add(newRecord);

                if (string.Equals(
                    input.Status, "Absent", StringComparison.Ordinal))
                {
                    newlyAbsent.Add(newRecord);
                }
            }
        }

        var aggregateKey =
            $"{instituteId}:{request.CourseId}:{request.AttendanceDate:yyyy-MM-dd}";

        var attendanceEventId = Guid.NewGuid();
        const string attendanceEventType =
            "ProgressiveMinds.AttendanceRecorded.v1";

        var attendancePayload = JsonSerializer.Serialize(new
        {
            eventId = attendanceEventId,
            eventType = attendanceEventType,
            eventVersion = 1,
            occurredAtUtc = now,
            aggregateId =
                $"{instituteId}:{request.AcademicSessionId}:{request.CourseId}:{request.AttendanceDate:yyyy-MM-dd}",
            data = new
            {
                instituteId,
                academicSessionId = request.AcademicSessionId,
                courseId = request.CourseId,
                attendanceDate = request.AttendanceDate,
                savedCount = changed.Count,
                records = changed.Select(a => new
                {
                    a.StudentId,
                    a.Status,
                    a.Notes,
                    a.MarkedByUserId
                })
            }
        });

        var outboxMessages = new List<OutboxMessage>
        {
            new()
            {
                Id = attendanceEventId,
                EventType = attendanceEventType,
                AggregateKey = aggregateKey,
                Payload = attendancePayload,
                CreatedAtUtc = now,
                NextAttemptAtUtc = now
            }
        };

        if (newlyAbsent.Count > 0)
        {
            var absenceEventId = Guid.NewGuid();
            const string absenceEventType =
                "ProgressiveMinds.StudentAbsent.v1";

            var absencePayload = JsonSerializer.Serialize(new
            {
                eventId = absenceEventId,
                eventType = absenceEventType,
                eventVersion = 1,
                occurredAtUtc = now,
                aggregateId =
                    $"{instituteId}:{request.AcademicSessionId}:{request.CourseId}:{request.AttendanceDate:yyyy-MM-dd}",
                data = new
                {
                    instituteId,
                    academicSessionId = request.AcademicSessionId,
                    courseId = request.CourseId,
                    attendanceDate = request.AttendanceDate,
                    absentCount = newlyAbsent.Count,
                    records = newlyAbsent.Select(a => new
                    {
                        a.StudentId,
                        a.Status,
                        a.Notes,
                        a.MarkedByUserId
                    })
                }
            });

            outboxMessages.Add(new OutboxMessage
            {
                Id = absenceEventId,
                EventType = absenceEventType,
                AggregateKey = aggregateKey,
                Payload = absencePayload,
                CreatedAtUtc = now,
                NextAttemptAtUtc = now
            });
        }

        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        _db.OutboxMessages.AddRange(outboxMessages);

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return Ok(new SaveAttendanceResponse(changed.Count));
    }

    private Task<bool> IsMember(
        Guid instituteId,
        Guid userId,
        CancellationToken ct) =>
        _db.InstituteMemberships.AnyAsync(
            m => m.InstituteId == instituteId && m.UserId == userId, ct);

    private bool TryGetUserId(out Guid userId) =>
        Guid.TryParse(
            User.FindFirstValue(ClaimTypes.NameIdentifier),
            out userId);
}
