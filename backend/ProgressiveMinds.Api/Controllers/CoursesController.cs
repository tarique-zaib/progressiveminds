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
[Route("api/institutes/{instituteId:guid}/courses")]
public sealed class CoursesController : ControllerBase
{
    private readonly AppDbContext _db;
    public CoursesController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CourseResponse>>> GetCourses(Guid instituteId, CancellationToken ct)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        if (!await IsMember(instituteId, userId, ct)) return NotFound();

        var courses = await _db.Courses.AsNoTracking()
            .Where(x => x.InstituteId == instituteId)
            .OrderBy(x => x.Name)
            .Select(x => new CourseResponse(x.Id, x.InstituteId, x.Code, x.Name, x.Description,
                x.DurationMonths, x.IsActive, x.CreatedAtUtc, x.UpdatedAtUtc))
            .ToListAsync(ct);
        return Ok(courses);
    }

    [HttpPost]
    public async Task<ActionResult<CourseResponse>> CreateCourse(Guid instituteId, CreateCourseRequest request, CancellationToken ct)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        if (!await IsMember(instituteId, userId, ct)) return NotFound();

        var code = request.Code.Trim().ToUpperInvariant();
        if (await _db.Courses.AnyAsync(x => x.InstituteId == instituteId && x.Code == code, ct))
            return Conflict(new { message = "A course with this code already exists for this institute." });

        var now = DateTime.UtcNow;
        var course = new Course
        {
            InstituteId = instituteId,
            Code = code,
            Name = request.Name.Trim(),
            Description = NullIfBlank(request.Description),
            DurationMonths = request.DurationMonths,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };
        var eventId = Guid.NewGuid();
        var eventType = "ProgressiveMinds.CourseCreated.v1";
        var payload = JsonSerializer.Serialize(new
        {
            eventId, eventType, eventVersion = 1, occurredAtUtc = now, aggregateId = course.Id,
            data = new { course.Id, course.InstituteId, course.Code, course.Name, course.DurationMonths, createdByUserId = userId }
        });

        _db.Courses.Add(course);
        _db.OutboxMessages.Add(new OutboxMessage
        {
            Id = eventId, EventType = eventType, AggregateKey = instituteId.ToString(),
            Payload = payload, CreatedAtUtc = now, NextAttemptAtUtc = now
        });
        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateException)
        {
            if (await _db.Courses.AnyAsync(x => x.InstituteId == instituteId && x.Code == code, ct))
                return Conflict(new { message = "A course with this code already exists for this institute." });
            throw;
        }

        return CreatedAtAction(nameof(GetCourses), new { instituteId },
            new CourseResponse(course.Id, course.InstituteId, course.Code, course.Name, course.Description,
                course.DurationMonths, course.IsActive, course.CreatedAtUtc, course.UpdatedAtUtc));
    }

    [HttpPut("{courseId:guid}")]
    public async Task<ActionResult<CourseResponse>> UpdateCourse(Guid instituteId, Guid courseId, UpdateCourseRequest request, CancellationToken ct)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        if (!await IsMember(instituteId, userId, ct)) return NotFound();

        var course = await _db.Courses.FirstOrDefaultAsync(x => x.Id == courseId && x.InstituteId == instituteId, ct);
        if (course is null) return NotFound();
        var code = request.Code.Trim().ToUpperInvariant();
        if (await _db.Courses.AnyAsync(x => x.InstituteId == instituteId && x.Id != courseId && x.Code == code, ct))
            return Conflict(new { message = "A course with this code already exists for this institute." });

        course.Code = code;
        course.Name = request.Name.Trim();
        course.Description = NullIfBlank(request.Description);
        course.DurationMonths = request.DurationMonths;
        course.IsActive = request.IsActive;
        course.UpdatedAtUtc = DateTime.UtcNow;

        var eventId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var eventType = "ProgressiveMinds.CourseUpdated.v1";
        _db.OutboxMessages.Add(new OutboxMessage
        {
            Id = eventId, EventType = eventType, AggregateKey = instituteId.ToString(),
            Payload = JsonSerializer.Serialize(new
            {
                eventId, eventType, eventVersion = 1, occurredAtUtc = now, aggregateId = course.Id,
                data = new { course.Id, course.InstituteId, course.Code, course.Name, course.DurationMonths, course.IsActive, updatedByUserId = userId }
            }),
            CreatedAtUtc = now, NextAttemptAtUtc = now
        });
        await _db.SaveChangesAsync(ct);
        return Ok(new CourseResponse(course.Id, course.InstituteId, course.Code, course.Name, course.Description,
            course.DurationMonths, course.IsActive, course.CreatedAtUtc, course.UpdatedAtUtc));
    }

    private async Task<bool> IsMember(Guid instituteId, Guid userId, CancellationToken ct) =>
        await _db.InstituteMemberships.AnyAsync(m => m.InstituteId == instituteId && m.UserId == userId, ct);

    private bool TryGetUserId(out Guid userId) =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
