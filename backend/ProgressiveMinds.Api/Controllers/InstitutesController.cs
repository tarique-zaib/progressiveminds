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
[Route("api/institutes")]
public sealed class InstitutesController : ControllerBase
{
    private readonly AppDbContext _db;
    public InstitutesController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<InstituteResponse>>> GetMine(CancellationToken ct)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        var results = await _db.InstituteMemberships.AsNoTracking()
            .Where(m => m.UserId == userId && m.Institute.IsActive)
            .OrderBy(m => m.Institute.Name)
            .Select(m => new InstituteResponse(m.Institute.Id, m.Institute.Name, m.Institute.Code,
                m.Institute.Email, m.Institute.Phone, m.Institute.Address, m.Institute.TimeZoneId,
                m.Institute.IsActive, m.Institute.CreatedAtUtc, m.Role))
            .ToListAsync(ct);
        return Ok(results);
    }

    [HttpPost]
    public async Task<ActionResult<InstituteResponse>> Create(CreateInstituteRequest request, CancellationToken ct)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        var code = request.Code.Trim().ToUpperInvariant();
        if (await _db.Institutes.AnyAsync(i => i.Code == code, ct))
            return Conflict(new { message = "An institute with this code already exists." });

        var timezone = string.IsNullOrWhiteSpace(request.TimeZoneId) ? "Asia/Kolkata" : request.TimeZoneId.Trim();
        try { _ = TimeZoneInfo.FindSystemTimeZoneById(timezone); }
        catch (TimeZoneNotFoundException) { return BadRequest(new { message = "The time zone ID is not recognized on this server." }); }
        catch (InvalidTimeZoneException) { return BadRequest(new { message = "The time zone ID is invalid." }); }

        var institute = new Institute
        {
            Name = request.Name.Trim(),
            Code = code,
            Email = NullIfBlank(request.Email),
            Phone = NullIfBlank(request.Phone),
            Address = NullIfBlank(request.Address),
            TimeZoneId = timezone
        };
        var membership = new InstituteMembership
        {
            InstituteId = institute.Id,
            UserId = userId,
            Role = "InstituteAdmin"
        };

        var eventId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var payload = JsonSerializer.Serialize(new
        {
            eventId, eventType = "ProgressiveMinds.InstituteCreated.v1", eventVersion = 1,
            occurredAtUtc = now, aggregateId = institute.Id,
            data = new { institute.Id, institute.Name, institute.Code, createdByUserId = userId }
        });

        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        _db.Institutes.Add(institute);
        _db.InstituteMemberships.Add(membership);
        _db.OutboxMessages.Add(new OutboxMessage
        {
            Id = eventId, EventType = "ProgressiveMinds.InstituteCreated.v1",
            AggregateKey = institute.Id.ToString(), Payload = payload,
            CreatedAtUtc = now, NextAttemptAtUtc = now
        });
        try
        {
            await _db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }
        catch (DbUpdateException)
        {
            await transaction.RollbackAsync(ct);
            if (await _db.Institutes.AnyAsync(i => i.Code == code, ct))
                return Conflict(new { message = "An institute with this code already exists." });
            throw;
        }

        return CreatedAtAction(nameof(GetMine), null,
            new InstituteResponse(institute.Id, institute.Name, institute.Code, institute.Email,
                institute.Phone, institute.Address, institute.TimeZoneId, institute.IsActive,
                institute.CreatedAtUtc, membership.Role));
    }

    [HttpGet("{instituteId:guid}/sessions")]
    public async Task<ActionResult<IReadOnlyList<AcademicSessionResponse>>> GetSessions(Guid instituteId, CancellationToken ct)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        if (!await IsMember(instituteId, userId, ct)) return NotFound();

        var sessions = await _db.AcademicSessions.AsNoTracking()
            .Where(x => x.InstituteId == instituteId)
            .OrderByDescending(x => x.IsCurrent).ThenByDescending(x => x.StartDate)
            .Select(x => new AcademicSessionResponse(x.Id, x.InstituteId, x.Name, x.StartDate,
                x.EndDate, x.IsCurrent, x.CreatedAtUtc))
            .ToListAsync(ct);
        return Ok(sessions);
    }

    [HttpPost("{instituteId:guid}/sessions")]
    public async Task<ActionResult<AcademicSessionResponse>> CreateSession(
        Guid instituteId, CreateAcademicSessionRequest request, CancellationToken ct)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        if (!await IsMember(instituteId, userId, ct)) return NotFound();
        if (request.EndDate < request.StartDate)
            return BadRequest(new { message = "End date must be on or after start date." });

        var name = request.Name.Trim();
        if (await _db.AcademicSessions.AnyAsync(x => x.InstituteId == instituteId && x.Name == name, ct))
            return Conflict(new { message = "This academic session name already exists for the institute." });

        var session = new AcademicSession
        {
            InstituteId = instituteId, Name = name, StartDate = request.StartDate,
            EndDate = request.EndDate, IsCurrent = request.IsCurrent
        };
        var eventId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var payload = JsonSerializer.Serialize(new
        {
            eventId, eventType = "ProgressiveMinds.AcademicSessionCreated.v1", eventVersion = 1,
            occurredAtUtc = now, aggregateId = session.Id,
            data = new { session.Id, session.InstituteId, session.Name, session.StartDate, session.EndDate, session.IsCurrent, createdByUserId = userId }
        });

        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        if (session.IsCurrent)
        {
            var currentSessions = await _db.AcademicSessions
                .Where(x => x.InstituteId == instituteId && x.IsCurrent).ToListAsync(ct);
            foreach (var current in currentSessions) current.IsCurrent = false;
        }
        _db.AcademicSessions.Add(session);
        _db.OutboxMessages.Add(new OutboxMessage
        {
            Id = eventId, EventType = "ProgressiveMinds.AcademicSessionCreated.v1",
            AggregateKey = instituteId.ToString(), Payload = payload,
            CreatedAtUtc = now, NextAttemptAtUtc = now
        });
        try
        {
            await _db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }
        catch (DbUpdateException)
        {
            await transaction.RollbackAsync(ct);
            if (await _db.AcademicSessions.AnyAsync(x => x.InstituteId == instituteId && x.Name == name, ct))
                return Conflict(new { message = "This academic session name already exists for the institute." });
            throw;
        }

        return CreatedAtAction(nameof(GetSessions), new { instituteId },
            new AcademicSessionResponse(session.Id, session.InstituteId, session.Name, session.StartDate,
                session.EndDate, session.IsCurrent, session.CreatedAtUtc));
    }

    private async Task<bool> IsMember(Guid instituteId, Guid userId, CancellationToken ct) =>
        await _db.InstituteMemberships.AnyAsync(m => m.InstituteId == instituteId && m.UserId == userId, ct);

    private bool TryGetUserId(out Guid userId) =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
