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
[Route("api/institutes/{instituteId:guid}/assessments")]
public sealed class AssessmentsController : ControllerBase
{
    private static readonly HashSet<string> SupportedTypes = new(StringComparer.Ordinal)
    {
        "WeeklyTest", "JeeMock", "NeetMock"
    };

    private readonly AppDbContext _db;

    public AssessmentsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AssessmentResponse>>> GetAssessments(
        Guid instituteId,
        [FromQuery] Guid courseId,
        [FromQuery] Guid academicSessionId,
        CancellationToken ct)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        if (!await IsMember(instituteId, userId, ct)) return NotFound();
        if (!await IsValidScope(instituteId, courseId, academicSessionId, ct))
            return BadRequest(new { message = "Select a valid course and academic session for this institute." });

        var assessments = await _db.Assessments.AsNoTracking()
            .Where(x => x.InstituteId == instituteId && x.CourseId == courseId && x.AcademicSessionId == academicSessionId)
            .Include(x => x.Sections).ThenInclude(x => x.Subject)
            .OrderByDescending(x => x.AssessmentDate).ThenBy(x => x.Title)
            .ToListAsync(ct);

        return Ok(assessments.Select(ToResponse).ToList());
    }

    [HttpPost]
    public async Task<ActionResult<AssessmentResponse>> CreateAssessment(
        Guid instituteId, CreateAssessmentRequest request, CancellationToken ct)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        if (!await IsMember(instituteId, userId, ct)) return NotFound();

        var title = request.Title?.Trim() ?? string.Empty;
        if (title.Length is < 3 or > 160)
            return BadRequest(new { message = "Test title must be between 3 and 160 characters." });
        if (!SupportedTypes.Contains(request.AssessmentType))
            return BadRequest(new { message = "Assessment type must be WeeklyTest, JeeMock, or NeetMock." });
        if (request.DurationMinutes is <= 0 or > 600)
            return BadRequest(new { message = "Duration must be between 1 and 600 minutes, or left blank." });
        if (request.Sections is null || request.Sections.Count == 0 || request.Sections.Count > 20)
            return BadRequest(new { message = "Add between 1 and 20 subject sections." });
        if (request.AssessmentType == "WeeklyTest" && request.Sections.Count != 1)
            return BadRequest(new { message = "A weekly test must contain exactly one subject section." });
        if (request.Sections.Select(x => x.SubjectId).Distinct().Count() != request.Sections.Count)
            return BadRequest(new { message = "A subject can appear only once in an assessment." });
        if (request.Sections.Any(x => x.SubjectId == Guid.Empty || x.MaxMarks <= 0 || x.MaxMarks > 10000 || x.NegativeMarksPerWrongAnswer < 0 || x.NegativeMarksPerWrongAnswer > x.MaxMarks))
            return BadRequest(new { message = "Each section needs a valid subject, maximum marks above zero, and valid non-negative marking." });

        var course = await _db.Courses.AsNoTracking()
            .Where(x => x.Id == request.CourseId && x.InstituteId == instituteId && x.IsActive)
            .Select(x => new { x.Id })
            .SingleOrDefaultAsync(ct);
        var session = await _db.AcademicSessions.AsNoTracking()
            .Where(x => x.Id == request.AcademicSessionId && x.InstituteId == instituteId)
            .Select(x => new { x.Id, x.StartDate, x.EndDate })
            .SingleOrDefaultAsync(ct);
        if (course is null || session is null)
            return BadRequest(new { message = "Select an active course and a valid academic session for this institute." });
        if (request.AssessmentDate < session.StartDate || request.AssessmentDate > session.EndDate)
            return BadRequest(new { message = "Assessment date must fall within the selected academic session." });

        var subjectIds = request.Sections.Select(x => x.SubjectId).ToArray();
        var validSubjectIds = await _db.Subjects.AsNoTracking()
            .Where(x => x.InstituteId == instituteId && x.CourseId == request.CourseId && x.IsActive && subjectIds.Contains(x.Id))
            .Select(x => x.Id).ToListAsync(ct);
        if (validSubjectIds.Count != subjectIds.Length)
            return BadRequest(new { message = "Every subject must be active and belong to the selected course and institute." });

        var now = DateTime.UtcNow;
        var assessment = new Assessment
        {
            InstituteId = instituteId,
            AcademicSessionId = request.AcademicSessionId,
            CourseId = request.CourseId,
            Title = title,
            AssessmentType = request.AssessmentType,
            AssessmentDate = request.AssessmentDate,
            DurationMinutes = request.DurationMinutes,
            CreatedByUserId = userId,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
            Sections = request.Sections.Select((section, index) => new AssessmentSection
            {
                SubjectId = section.SubjectId,
                MaxMarks = decimal.Round(section.MaxMarks, 2),
                NegativeMarksPerWrongAnswer = decimal.Round(section.NegativeMarksPerWrongAnswer, 2),
                SortOrder = index + 1
            }).ToList()
        };

        var eventId = Guid.NewGuid();
        const string eventType = "ProgressiveMinds.AssessmentCreated.v1";
        var payload = JsonSerializer.Serialize(new
        {
            eventId,
            eventType,
            eventVersion = 1,
            occurredAtUtc = now,
            aggregateId = assessment.Id,
            data = new
            {
                assessmentId = assessment.Id,
                instituteId,
                academicSessionId = assessment.AcademicSessionId,
                courseId = assessment.CourseId,
                assessmentType = assessment.AssessmentType,
                assessmentDate = assessment.AssessmentDate,
                sectionCount = assessment.Sections.Count,
                totalMaxMarks = assessment.Sections.Sum(x => x.MaxMarks)
            }
        });

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        _db.Assessments.Add(assessment);
        _db.OutboxMessages.Add(new OutboxMessage
        {
            Id = eventId,
            EventType = eventType,
            AggregateKey = $"{instituteId}:{assessment.Id}",
            Payload = payload,
            CreatedAtUtc = now,
            NextAttemptAtUtc = now
        });
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        await _db.Entry(assessment).Collection(x => x.Sections).Query().Include(x => x.Subject).LoadAsync(ct);
        return CreatedAtAction(nameof(GetAssessments), new { instituteId, courseId = assessment.CourseId, academicSessionId = assessment.AcademicSessionId }, ToResponse(assessment));
    }

    [HttpGet("{assessmentId:guid}/sections/{sectionId:guid}/marks")]
    public async Task<ActionResult<IReadOnlyList<AssessmentMarkResponse>>> GetMarks(
        Guid instituteId, Guid assessmentId, Guid sectionId, CancellationToken ct)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        if (!await IsMember(instituteId, userId, ct)) return NotFound();

        var section = await _db.AssessmentSections.AsNoTracking()
            .Where(x => x.Id == sectionId && x.AssessmentId == assessmentId && x.Assessment.InstituteId == instituteId)
            .Select(x => new { x.Id, x.MaxMarks })
            .SingleOrDefaultAsync(ct);
        if (section is null) return NotFound();

        var assessment = await _db.Assessments.AsNoTracking()
            .Where(x => x.Id == assessmentId && x.InstituteId == instituteId)
            .Select(x => new { x.CourseId })
            .SingleAsync(ct);

        var students = await _db.Students.AsNoTracking()
            .Where(x => x.InstituteId == instituteId && x.CourseId == assessment.CourseId && x.IsActive)
            .OrderBy(x => x.FullName)
            .Select(x => new { x.Id, x.AdmissionNumber, x.FullName })
            .ToListAsync(ct);

        var marks = await _db.AssessmentMarks.AsNoTracking()
            .Where(x => x.AssessmentSectionId == sectionId)
            .ToDictionaryAsync(x => x.StudentId, ct);

        return Ok(students.Select(student =>
        {
            marks.TryGetValue(student.Id, out var mark);
            return new AssessmentMarkResponse(
                student.Id, student.AdmissionNumber, student.FullName,
                mark?.MarksObtained, section.MaxMarks, mark?.Remarks, mark?.UpdatedAtUtc);
        }).ToList());
    }

    [HttpPut("{assessmentId:guid}/sections/{sectionId:guid}/marks")]
    public async Task<ActionResult<SaveAssessmentMarksResponse>> SaveMarks(
        Guid instituteId, Guid assessmentId, Guid sectionId,
        SaveAssessmentMarksRequest request, CancellationToken ct)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        if (!await IsMember(instituteId, userId, ct)) return NotFound();
        if (request.Records is null || request.Records.Count == 0 || request.Records.Count > 500)
            return BadRequest(new { message = "Submit between 1 and 500 student mark records." });
        if (request.Records.Select(x => x.StudentId).Distinct().Count() != request.Records.Count)
            return BadRequest(new { message = "A student appears more than once in this marks request." });
        if (request.Records.Any(x => x.Remarks?.Length > 500))
            return BadRequest(new { message = "Remarks cannot exceed 500 characters." });

        var section = await _db.AssessmentSections
            .Include(x => x.Assessment)
            .Where(x => x.Id == sectionId && x.AssessmentId == assessmentId && x.Assessment.InstituteId == instituteId)
            .SingleOrDefaultAsync(ct);
        if (section is null) return NotFound();

        foreach (var item in request.Records)
        {
            if (item.MarksObtained is decimal score)
            {
                if (score > section.MaxMarks || score < -section.MaxMarks || (score < 0 && section.NegativeMarksPerWrongAnswer <= 0))
                    return BadRequest(new { message = $"Marks must be between {(section.NegativeMarksPerWrongAnswer > 0 ? -section.MaxMarks : 0)} and {section.MaxMarks}." });
            }
        }

        var studentIds = request.Records.Select(x => x.StudentId).ToArray();
        var validStudentIds = await _db.Students
            .Where(x => x.InstituteId == instituteId && x.CourseId == section.Assessment.CourseId && x.IsActive && studentIds.Contains(x.Id))
            .Select(x => x.Id).ToListAsync(ct);
        if (validStudentIds.Count != studentIds.Length)
            return BadRequest(new { message = "Every student must be active and enrolled in the assessment course and institute." });

        var existing = await _db.AssessmentMarks
            .Where(x => x.AssessmentSectionId == sectionId && studentIds.Contains(x.StudentId))
            .ToListAsync(ct);
        var byStudent = existing.ToDictionary(x => x.StudentId);
        var now = DateTime.UtcNow;

        foreach (var input in request.Records)
        {
            var remarks = string.IsNullOrWhiteSpace(input.Remarks) ? null : input.Remarks.Trim();
            if (byStudent.TryGetValue(input.StudentId, out var mark))
            {
                mark.MarksObtained = input.MarksObtained;
                mark.Remarks = remarks;
                mark.MarkedByUserId = userId;
                mark.UpdatedAtUtc = now;
            }
            else
            {
                _db.AssessmentMarks.Add(new AssessmentMark
                {
                    AssessmentSectionId = sectionId,
                    StudentId = input.StudentId,
                    MarksObtained = input.MarksObtained,
                    Remarks = remarks,
                    MarkedByUserId = userId,
                    CreatedAtUtc = now,
                    UpdatedAtUtc = now
                });
            }
        }

        var eventId = Guid.NewGuid();
        const string eventType = "ProgressiveMinds.AssessmentMarksRecorded.v1";
        var payload = JsonSerializer.Serialize(new
        {
            eventId,
            eventType,
            eventVersion = 1,
            occurredAtUtc = now,
            aggregateId = assessmentId,
            data = new
            {
                assessmentId,
                sectionId,
                instituteId,
                courseId = section.Assessment.CourseId,
                submittedCount = request.Records.Count,
                markedCount = request.Records.Count(x => x.MarksObtained.HasValue)
            }
        });

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        _db.OutboxMessages.Add(new OutboxMessage
        {
            Id = eventId,
            EventType = eventType,
            AggregateKey = $"{instituteId}:{assessmentId}:{sectionId}",
            Payload = payload,
            CreatedAtUtc = now,
            NextAttemptAtUtc = now
        });
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return Ok(new SaveAssessmentMarksResponse(
            request.Records.Count,
            request.Records.Count(x => x.MarksObtained.HasValue)));
    }

    private Task<bool> IsMember(Guid instituteId, Guid userId, CancellationToken ct) =>
        _db.InstituteMemberships.AnyAsync(x => x.InstituteId == instituteId && x.UserId == userId, ct);

    private async Task<bool> IsValidScope(Guid instituteId, Guid courseId, Guid academicSessionId, CancellationToken ct)
    {
        var courseExists = await _db.Courses.AnyAsync(
            x => x.Id == courseId && x.InstituteId == instituteId, ct);
        if (!courseExists) return false;
        return await _db.AcademicSessions.AnyAsync(
            x => x.Id == academicSessionId && x.InstituteId == instituteId, ct);
    }

    private bool TryGetUserId(out Guid userId) =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);

    private static AssessmentResponse ToResponse(Assessment assessment)
    {
        var sections = assessment.Sections.OrderBy(x => x.SortOrder).Select(x => new AssessmentSectionResponse(
            x.Id, x.SubjectId, x.Subject.Code, x.Subject.Name,
            x.MaxMarks, x.NegativeMarksPerWrongAnswer, x.SortOrder)).ToList();

        return new AssessmentResponse(
            assessment.Id, assessment.InstituteId, assessment.AcademicSessionId,
            assessment.CourseId, assessment.Title, assessment.AssessmentType,
            assessment.AssessmentDate, assessment.DurationMinutes,
            sections.Sum(x => x.MaxMarks), sections.Count,
            assessment.CreatedAtUtc, assessment.UpdatedAtUtc, sections);
    }
}
