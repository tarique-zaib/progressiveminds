
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProgressiveMinds.Api.Data;
using ProgressiveMinds.Api.Models;

namespace ProgressiveMinds.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/institutes/{instituteId:guid}/parent-links")]
public sealed class ParentLinksController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _users;

    public ParentLinksController(AppDbContext db, UserManager<AppUser> users)
    {
        _db = db;
        _users = users;
    }

    public sealed record CreateLinkRequest(Guid StudentId, Guid ParentUserId);

    public sealed record LinkResponse(
        Guid Id,
        Guid StudentId,
        string StudentName,
        Guid ParentUserId,
        string ParentEmail,
        DateTime LinkedAtUtc,
        bool IsActive);

    [HttpGet]
    public async Task<IActionResult> List(
        Guid instituteId,
        CancellationToken ct)
    {
        if (!TryUserId(out var userId))
            return Unauthorized();

        if (!await IsInstituteAdmin(instituteId, userId, ct))
            return NotFound();

        var rows = await (
            from link in _db.ParentStudentLinks.AsNoTracking()
            join student in _db.Students.AsNoTracking()
                on link.StudentId equals student.Id
            join parent in _db.Users.AsNoTracking()
                on link.ParentUserId equals parent.Id
            where link.InstituteId == instituteId
            orderby student.FullName
            select new LinkResponse(
                link.Id,
                student.Id,
                student.FullName,
                parent.Id,
                parent.Email ?? parent.UserName ?? "",
                link.LinkedAtUtc,
                link.IsActive))
            .ToListAsync(ct);

        return Ok(rows);
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        Guid instituteId,
        CreateLinkRequest request,
        CancellationToken ct)
    {
        if (!TryUserId(out var userId))
            return Unauthorized();

        if (!await IsInstituteAdmin(instituteId, userId, ct))
            return NotFound();

        if (request.StudentId == Guid.Empty ||
            request.ParentUserId == Guid.Empty)
        {
            return BadRequest(new
            {
                message = "A valid student ID and parent user ID are required."
            });
        }

        var student = await _db.Students
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.Id == request.StudentId &&
                     x.InstituteId == instituteId,
                ct);

        if (student is null)
        {
            return BadRequest(new
            {
                message = "Student does not belong to this institute."
            });
        }

        var parent = await _users.FindByIdAsync(
            request.ParentUserId.ToString());

        if (parent is null)
        {
            return BadRequest(new
            {
                message = "Parent account does not exist."
            });
        }

        if (!await _users.IsInRoleAsync(parent, "Parent"))
        {
            return BadRequest(new
            {
                message = "The selected account must have the Parent role."
            });
        }

        var existingLink = await _db.ParentStudentLinks
            .FirstOrDefaultAsync(
                x => x.InstituteId == instituteId &&
                     x.StudentId == request.StudentId &&
                     x.ParentUserId == request.ParentUserId,
                ct);

        if (existingLink is not null)
        {
            if (existingLink.IsActive)
            {
                return Conflict(new
                {
                    message = "This parent is already linked to this student."
                });
            }

            // Reactivate an existing link instead of creating a duplicate.
            existingLink.IsActive = true;
            existingLink.LinkedAtUtc = DateTime.UtcNow;
            existingLink.LinkedByUserId = userId;

            await _db.SaveChangesAsync(ct);

            return Ok(new LinkResponse(
                existingLink.Id,
                student.Id,
                student.FullName,
                parent.Id,
                parent.Email ?? parent.UserName ?? "",
                existingLink.LinkedAtUtc,
                existingLink.IsActive));
        }

        var link = new ParentStudentLink
        {
            InstituteId = instituteId,
            StudentId = student.Id,
            ParentUserId = parent.Id,
            LinkedByUserId = userId,
            LinkedAtUtc = DateTime.UtcNow,
            IsActive = true
        };

        _db.ParentStudentLinks.Add(link);
        await _db.SaveChangesAsync(ct);

        return Ok(new LinkResponse(
            link.Id,
            student.Id,
            student.FullName,
            parent.Id,
            parent.Email ?? parent.UserName ?? "",
            link.LinkedAtUtc,
            link.IsActive));
    }

    [HttpPatch("{linkId:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(
        Guid instituteId,
        Guid linkId,
        CancellationToken ct)
    {
        if (!TryUserId(out var userId))
            return Unauthorized();

        if (!await IsInstituteAdmin(instituteId, userId, ct))
            return NotFound();

        var link = await _db.ParentStudentLinks
            .FirstOrDefaultAsync(
                x => x.Id == linkId &&
                     x.InstituteId == instituteId,
                ct);

        if (link is null)
            return NotFound();

        link.IsActive = false;
        await _db.SaveChangesAsync(ct);

        return NoContent();
    }

    private Task<bool> IsInstituteAdmin(
        Guid instituteId,
        Guid userId,
        CancellationToken ct) =>
        _db.InstituteMemberships.AnyAsync(
            m => m.InstituteId == instituteId &&
                 m.UserId == userId &&
                 (m.Role == "InstituteAdmin" ||
                  m.Role == "Admin"),
            ct);

    private bool TryUserId(out Guid id) =>
        Guid.TryParse(
            User.FindFirstValue(ClaimTypes.NameIdentifier),
            out id);
}
