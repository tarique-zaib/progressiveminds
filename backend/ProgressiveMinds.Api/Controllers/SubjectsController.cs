
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
[Route("api/institutes/{instituteId:guid}/courses/{courseId:guid}/subjects")]
public sealed class SubjectsController : ControllerBase
{
    private readonly AppDbContext _db;

    public SubjectsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<SubjectResponse>>> Get(
        Guid instituteId,
        Guid courseId,
        CancellationToken ct)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        if (!await IsMember(instituteId, userId, ct))
            return NotFound();

        if (!await CourseExists(instituteId, courseId, ct))
            return NotFound();

        var subjects = await _db.Set<Subject>()
            .AsNoTracking()
            .Where(s => s.InstituteId == instituteId &&
                        s.CourseId == courseId)
            .OrderBy(s => s.Name)
            .Select(s => new SubjectResponse(
                s.Id,
                s.InstituteId,
                s.CourseId,
                s.Code,
                s.Name,
                s.Description,
                s.IsActive,
                s.CreatedAtUtc,
                s.UpdatedAtUtc))
            .ToListAsync(ct);

        return Ok(subjects);
    }

    [HttpPost]
    public async Task<ActionResult<SubjectResponse>> Create(
        Guid instituteId,
        Guid courseId,
        CreateSubjectRequest request,
        CancellationToken ct)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        if (!await IsMember(instituteId, userId, ct))
            return NotFound();

        if (!await CourseExists(instituteId, courseId, ct))
            return NotFound();

        var code = request.Code.Trim().ToUpperInvariant();
        var name = request.Name.Trim();

        if (await _db.Set<Subject>().AnyAsync(
            s => s.InstituteId == instituteId &&
                 s.CourseId == courseId &&
                 s.Code == code, ct))
        {
            return Conflict(new
            {
                message = "This subject code already exists for the course."
            });
        }

        var now = DateTime.UtcNow;

        var subject = new Subject
        {
            InstituteId = instituteId,
            CourseId = courseId,
            Code = code,
            Name = name,
            Description = NullIfBlank(request.Description),
            IsActive = true,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        var eventId = Guid.NewGuid();
        const string eventType = "ProgressiveMinds.SubjectCreated.v1";

        var payload = JsonSerializer.Serialize(new
        {
            eventId,
            eventType,
            eventVersion = 1,
            occurredAtUtc = now,
            aggregateId = subject.Id,
            data = new
            {
                subject.Id,
                subject.InstituteId,
                subject.CourseId,
                subject.Code,
                subject.Name,
                subject.Description,
                subject.IsActive,
                createdByUserId = userId
            }
        });

        await using var transaction =
            await _db.Database.BeginTransactionAsync(ct);

        _db.Set<Subject>().Add(subject);

        _db.OutboxMessages.Add(new OutboxMessage
        {
            Id = eventId,
            EventType = eventType,
            AggregateKey = subject.Id.ToString(),
            Payload = payload,
            CreatedAtUtc = now,
            NextAttemptAtUtc = now
        });

        try
        {
            await _db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }
        catch (DbUpdateException)
        {
            await transaction.RollbackAsync(ct);

            if (await _db.Set<Subject>().AnyAsync(
                s => s.InstituteId == instituteId &&
                     s.CourseId == courseId &&
                     s.Code == code, ct))
            {
                return Conflict(new
                {
                    message = "This subject code already exists for the course."
                });
            }

            throw;
        }

        return CreatedAtAction(
            nameof(Get),
            new { instituteId, courseId },
            ToResponse(subject));
    }

    [HttpPut("{subjectId:guid}")]
    public async Task<ActionResult<SubjectResponse>> Update(
        Guid instituteId,
        Guid courseId,
        Guid subjectId,
        UpdateSubjectRequest request,
        CancellationToken ct)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        if (!await IsMember(instituteId, userId, ct))
            return NotFound();

        if (!await CourseExists(instituteId, courseId, ct))
            return NotFound();

        var subject = await _db.Set<Subject>().FirstOrDefaultAsync(
            s => s.Id == subjectId &&
                 s.InstituteId == instituteId &&
                 s.CourseId == courseId, ct);

        if (subject is null)
            return NotFound();

        var code = request.Code.Trim().ToUpperInvariant();

        if (await _db.Set<Subject>().AnyAsync(
            s => s.InstituteId == instituteId &&
                 s.CourseId == courseId &&
                 s.Code == code &&
                 s.Id != subjectId, ct))
        {
            return Conflict(new
            {
                message = "This subject code already exists for the course."
            });
        }

        var now = DateTime.UtcNow;

        subject.Code = code;
        subject.Name = request.Name.Trim();
        subject.Description = NullIfBlank(request.Description);
        subject.IsActive = request.IsActive;
        subject.UpdatedAtUtc = now;

        var eventId = Guid.NewGuid();
        const string eventType = "ProgressiveMinds.SubjectUpdated.v1";

        var payload = JsonSerializer.Serialize(new
        {
            eventId,
            eventType,
            eventVersion = 1,
            occurredAtUtc = now,
            aggregateId = subject.Id,
            data = new
            {
                subject.Id,
                subject.InstituteId,
                subject.CourseId,
                subject.Code,
                subject.Name,
                subject.Description,
                subject.IsActive,
                updatedByUserId = userId
            }
        });

        await using var transaction =
            await _db.Database.BeginTransactionAsync(ct);

        _db.OutboxMessages.Add(new OutboxMessage
        {
            Id = eventId,
            EventType = eventType,
            AggregateKey = subject.Id.ToString(),
            Payload = payload,
            CreatedAtUtc = now,
            NextAttemptAtUtc = now
        });

        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return Ok(ToResponse(subject));
    }

    private Task<bool> IsMember(
        Guid instituteId,
        Guid userId,
        CancellationToken ct) =>
        _db.InstituteMemberships.AnyAsync(
            m => m.InstituteId == instituteId &&
                 m.UserId == userId, ct);

    private Task<bool> CourseExists(
        Guid instituteId,
        Guid courseId,
        CancellationToken ct) =>
        _db.Set<Course>().AnyAsync(
            c => c.Id == courseId &&
                 c.InstituteId == instituteId, ct);

    private bool TryGetUserId(out Guid userId) =>
        Guid.TryParse(
            User.FindFirstValue(ClaimTypes.NameIdentifier),
            out userId);

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static SubjectResponse ToResponse(Subject s) =>
        new(
            s.Id,
            s.InstituteId,
            s.CourseId,
            s.Code,
            s.Name,
            s.Description,
            s.IsActive,
            s.CreatedAtUtc,
            s.UpdatedAtUtc);
}
