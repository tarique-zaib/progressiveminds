using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProgressiveMinds.Api.Data;
using ProgressiveMinds.Api.Models;

namespace ProgressiveMinds.Api.Controllers;

[ApiController]
[Authorize(Roles = "Parent")]
[Route("api/parent-portal")]
public sealed class ParentPortalController : ControllerBase
{
    private readonly AppDbContext _db;
    public ParentPortalController(AppDbContext db) => _db = db;

    public sealed record ChildResponse(Guid StudentId, Guid InstituteId, string InstituteName,
        string FullName, string AdmissionNumber, string CourseName, string? ParentName, string? ParentPhone,
        Guid? CurrentSessionId, string? CurrentSessionName);
    public sealed record AttendanceSummary(int Total, int Present, int Absent, int Late, int Excused, decimal AttendancePercentage);
    public sealed record AttendanceResponse(Guid Id, DateOnly AttendanceDate, string Status, string? Notes);
    public sealed record AssessmentResponse(Guid AssessmentId, string Title, string AssessmentType,
        DateOnly AssessmentDate, string Subject, decimal MaxMarks, decimal? MarksObtained, string? Remarks);
    public sealed record PaymentResponse(Guid Id, decimal Amount, string Method, string? ReferenceNumber,
        string ReceiptNumber, DateTime PaidAtUtc);
    public sealed record FeeResponse(Guid FeeId, string Title, decimal Amount, decimal PaidAmount,
        decimal Balance, DateOnly DueDate, string Status, IReadOnlyList<PaymentResponse> Payments);

    [HttpGet("children")]
    public async Task<ActionResult<IReadOnlyList<ChildResponse>>> Children(CancellationToken ct)
    {
        if (!TryUserId(out var userId)) return Unauthorized();
        var rows = await (from link in _db.ParentStudentLinks.AsNoTracking()
                          join student in _db.Students.AsNoTracking() on link.StudentId equals student.Id
                          join institute in _db.Institutes.AsNoTracking() on link.InstituteId equals institute.Id
                          join course in _db.Courses.AsNoTracking() on student.CourseId equals course.Id
                          where link.ParentUserId == userId && link.IsActive && student.IsActive
                          select new { link, student, institute, course })
            .OrderBy(x => x.student.FullName).ToListAsync(ct);
        var result = new List<ChildResponse>();
        foreach (var x in rows)
        {
            var session = await _db.AcademicSessions.AsNoTracking()
                .Where(s => s.InstituteId == x.link.InstituteId && s.IsCurrent)
                .Select(s => new { s.Id, s.Name }).FirstOrDefaultAsync(ct);
            result.Add(new ChildResponse(x.student.Id, x.link.InstituteId, x.institute.Name,
                x.student.FullName, x.student.AdmissionNumber, x.course.Name, x.student.ParentName,
                x.student.ParentPhone, session?.Id, session?.Name));
        }
        return Ok(result);
    }

    [HttpGet("children/{studentId:guid}/attendance")]
    public async Task<IActionResult> Attendance(Guid studentId, DateOnly? fromDate, DateOnly? toDate, CancellationToken ct)
    {
        if (!TryUserId(out var userId)) return Unauthorized();
        var link = await GetLink(userId, studentId, ct);
        if (link is null) return NotFound();
        var query = _db.AttendanceRecords.AsNoTracking().Where(x => x.StudentId == studentId && x.InstituteId == link.InstituteId);
        if (fromDate.HasValue) query = query.Where(x => x.AttendanceDate >= fromDate.Value);
        if (toDate.HasValue) query = query.Where(x => x.AttendanceDate <= toDate.Value);
        var rows = await query.OrderByDescending(x => x.AttendanceDate)
            .Select(x => new AttendanceResponse(x.Id, x.AttendanceDate, x.Status, x.Notes)).ToListAsync(ct);
        var total = rows.Count;
        var present = rows.Count(x => x.Status == "Present");
        var summary = new AttendanceSummary(total, present, rows.Count(x => x.Status == "Absent"),
            rows.Count(x => x.Status == "Late"), rows.Count(x => x.Status == "Excused"),
            total == 0 ? 0 : decimal.Round((decimal)present * 100 / total, 2));
        return Ok(new { summary, records = rows });
    }

    [HttpGet("children/{studentId:guid}/assessments")]
    public async Task<IActionResult> Assessments(Guid studentId, CancellationToken ct)
    {
        if (!TryUserId(out var userId)) return Unauthorized();
        var link = await GetLink(userId, studentId, ct);
        if (link is null) return NotFound();
        var rows = await (from mark in _db.AssessmentMarks.AsNoTracking()
                          join section in _db.AssessmentSections.AsNoTracking() on mark.AssessmentSectionId equals section.Id
                          join assessment in _db.Assessments.AsNoTracking() on section.AssessmentId equals assessment.Id
                          join subject in _db.Subjects.AsNoTracking() on section.SubjectId equals subject.Id
                          where mark.StudentId == studentId && assessment.InstituteId == link.InstituteId
                          orderby assessment.AssessmentDate descending
                          select new AssessmentResponse(assessment.Id, assessment.Title, assessment.AssessmentType,
                              assessment.AssessmentDate, subject.Name, section.MaxMarks, mark.MarksObtained, mark.Remarks))
            .ToListAsync(ct);
        return Ok(rows);
    }

    [HttpGet("children/{studentId:guid}/fees")]
    public async Task<IActionResult> Fees(Guid studentId, CancellationToken ct)
    {
        if (!TryUserId(out var userId)) return Unauthorized();
        var link = await GetLink(userId, studentId, ct);
        if (link is null) return NotFound();
        var fees = await _db.StudentFees.AsNoTracking()
            .Where(x => x.StudentId == studentId && x.InstituteId == link.InstituteId)
            .OrderBy(x => x.DueDate).ToListAsync(ct);
        var ids = fees.Select(x => x.Id).ToArray();
        var payments = await _db.FeePayments.AsNoTracking().Where(x => x.InstituteId == link.InstituteId && ids.Contains(x.StudentFeeId))
            .OrderByDescending(x => x.PaidAtUtc).ToListAsync(ct);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var result = fees.Select(f =>
        {
            var p = payments.Where(x => x.StudentFeeId == f.Id).ToArray();
            var paid = p.Sum(x => x.Amount); var balance = f.Amount - paid;
            var status = balance <= 0 ? "Paid" : f.DueDate < today ? "Overdue" : paid > 0 ? "Partial" : "Pending";
            return new FeeResponse(f.Id, f.Title, f.Amount, paid, balance, f.DueDate, status,
                p.Select(x => new PaymentResponse(x.Id, x.Amount, x.Method, x.ReferenceNumber, x.ReceiptNumber, x.PaidAtUtc)).ToArray());
        }).ToArray();
        return Ok(result);
    }

    private Task<ParentStudentLink?> GetLink(Guid userId, Guid studentId, CancellationToken ct) =>
        _db.ParentStudentLinks.AsNoTracking().FirstOrDefaultAsync(x => x.ParentUserId == userId && x.StudentId == studentId && x.IsActive, ct);

    private bool TryUserId(out Guid id) => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out id);
}
