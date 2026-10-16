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
[Route("api/institutes/{instituteId:guid}/students")]
public sealed class StudentsController : ControllerBase
{
    private readonly AppDbContext _db;
    public StudentsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<StudentResponse>>> Get(Guid instituteId, CancellationToken ct)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        if (!await IsMember(instituteId, userId, ct)) return NotFound();

        var students = await _db.Set<Student>().AsNoTracking()
            .Where(s => s.InstituteId == instituteId)
            .OrderBy(s => s.FullName)
            .Select(s => ToResponse(s))
            .ToListAsync(ct);
        return Ok(students);
    }

    [HttpPost]
    public async Task<ActionResult<StudentResponse>> Create(
        Guid instituteId, CreateStudentRequest request, CancellationToken ct)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        if (!await IsMember(instituteId, userId, ct)) return NotFound();
        if (!await CourseExists(instituteId, request.CourseId, ct))
            return BadRequest(new { message = "Select a valid course belonging to this institute." });

        var admissionNumber = request.AdmissionNumber.Trim().ToUpperInvariant();
        if (await _db.Set<Student>().AnyAsync(s => s.InstituteId == instituteId && s.AdmissionNumber == admissionNumber, ct))
            return Conflict(new { message = "This admission number already exists for the institute." });

        var now = DateTime.UtcNow;
        var student = new Student {
            InstituteId = instituteId, CourseId = request.CourseId,
            AdmissionNumber = admissionNumber, FullName = request.FullName.Trim(),
            Email = NullIfBlank(request.Email), Phone = request.Phone.Trim(),
            ParentName = NullIfBlank(request.ParentName), ParentPhone = NullIfBlank(request.ParentPhone),
            DateOfBirth = NormalizeDate(request.DateOfBirth), IsActive = true,
            CreatedAtUtc = now, UpdatedAtUtc = now
        };

        var eventId = Guid.NewGuid();
        const string eventType = "ProgressiveMinds.StudentAdmitted.v1";
        var payload = JsonSerializer.Serialize(new {
            eventId, eventType, eventVersion = 1, occurredAtUtc = now, aggregateId = student.Id,
            data = new { student.Id, student.InstituteId, student.CourseId, student.AdmissionNumber,
                student.FullName, student.Email, student.Phone, student.ParentName, student.ParentPhone,
                student.DateOfBirth, student.IsActive, createdByUserId = userId }
        });

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        _db.Set<Student>().Add(student);
        _db.OutboxMessages.Add(new OutboxMessage {
            Id = eventId, EventType = eventType, AggregateKey = student.Id.ToString(),
            Payload = payload, CreatedAtUtc = now, NextAttemptAtUtc = now
        });
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return CreatedAtAction(nameof(Get), new { instituteId }, ToResponse(student));
    }

    [HttpPut("{studentId:guid}")]
    public async Task<ActionResult<StudentResponse>> Update(
        Guid instituteId, Guid studentId, UpdateStudentRequest request, CancellationToken ct)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        if (!await IsMember(instituteId, userId, ct)) return NotFound();
        if (!await CourseExists(instituteId, request.CourseId, ct))
            return BadRequest(new { message = "Select a valid course belonging to this institute." });

        var student = await _db.Set<Student>().FirstOrDefaultAsync(
            s => s.Id == studentId && s.InstituteId == instituteId, ct);
        if (student is null) return NotFound();

        var admissionNumber = request.AdmissionNumber.Trim().ToUpperInvariant();
        if (await _db.Set<Student>().AnyAsync(s =>
            s.InstituteId == instituteId && s.AdmissionNumber == admissionNumber && s.Id != studentId, ct))
            return Conflict(new { message = "This admission number already exists for the institute." });

        var now = DateTime.UtcNow;
        student.CourseId = request.CourseId;
        student.AdmissionNumber = admissionNumber;
        student.FullName = request.FullName.Trim();
        student.Email = NullIfBlank(request.Email);
        student.Phone = request.Phone.Trim();
        student.ParentName = NullIfBlank(request.ParentName);
        student.ParentPhone = NullIfBlank(request.ParentPhone);
        student.DateOfBirth = NormalizeDate(request.DateOfBirth);
        student.IsActive = request.IsActive;
        student.UpdatedAtUtc = now;

        var eventId = Guid.NewGuid();
        const string eventType = "ProgressiveMinds.StudentUpdated.v1";
        var payload = JsonSerializer.Serialize(new {
            eventId, eventType, eventVersion = 1, occurredAtUtc = now, aggregateId = student.Id,
            data = new { student.Id, student.InstituteId, student.CourseId, student.AdmissionNumber,
                student.FullName, student.Email, student.Phone, student.ParentName, student.ParentPhone,
                student.DateOfBirth, student.IsActive, updatedByUserId = userId }
        });

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        _db.OutboxMessages.Add(new OutboxMessage {
            Id = eventId, EventType = eventType, AggregateKey = student.Id.ToString(),
            Payload = payload, CreatedAtUtc = now, NextAttemptAtUtc = now
        });
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Ok(ToResponse(student));
    }

    private Task<bool> IsMember(Guid instituteId, Guid userId, CancellationToken ct) =>
        _db.InstituteMemberships.AnyAsync(m => m.InstituteId == instituteId && m.UserId == userId, ct);

    private Task<bool> CourseExists(Guid instituteId, Guid courseId, CancellationToken ct) =>
        _db.Set<Course>().AnyAsync(c => c.Id == courseId && c.InstituteId == instituteId, ct);

    private bool TryGetUserId(out Guid userId) =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static DateTime? NormalizeDate(DateTime? value) =>
        value is null ? null : DateTime.SpecifyKind(value.Value.Date, DateTimeKind.Utc);

    private static StudentResponse ToResponse(Student s) =>
        new(s.Id, s.InstituteId, s.CourseId, s.AdmissionNumber, s.FullName, s.Email, s.Phone,
            s.ParentName, s.ParentPhone, s.DateOfBirth, s.IsActive, s.CreatedAtUtc, s.UpdatedAtUtc);
}
