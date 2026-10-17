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
[Route("api/institutes/{instituteId:guid}/parent-accounts")]
public sealed class ParentAccountsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _users;
    private readonly RoleManager<IdentityRole<Guid>> _roles;

    public ParentAccountsController(AppDbContext db, UserManager<AppUser> users, RoleManager<IdentityRole<Guid>> roles)
    { _db = db; _users = users; _roles = roles; }

    public sealed record CreateParentRequest(string FirstName, string LastName, string Email, string? PhoneNumber, string Password);
    public sealed record ParentAccountResponse(Guid Id, string FirstName, string LastName, string Email, string? PhoneNumber, string[] Roles);

    [HttpGet]
    public async Task<IActionResult> List(Guid instituteId, CancellationToken ct)
    {
        if (!await IsInstituteAdmin(instituteId, ct)) return Forbid();
        var links = await _db.ParentStudentLinks.AsNoTracking()
            .Where(x => x.InstituteId == instituteId)
            .Select(x => x.ParentUserId).Distinct().ToListAsync(ct);
        var parents = await _db.Users.AsNoTracking().Where(x => links.Contains(x.Id))
            .OrderBy(x => x.LastName).ThenBy(x => x.FirstName).ToListAsync(ct);
        var result = new List<ParentAccountResponse>();
        foreach (var parent in parents)
            result.Add(new(parent.Id, parent.FirstName, parent.LastName, parent.Email ?? "", parent.PhoneNumber,
                (await _users.GetRolesAsync(parent)).ToArray()));
        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> Create(Guid instituteId, [FromBody] CreateParentRequest request, CancellationToken ct)
    {
        if (!await IsInstituteAdmin(instituteId, ct)) return Forbid();
        var first = request.FirstName?.Trim() ?? "";
        var last = request.LastName?.Trim() ?? "";
        var email = request.Email?.Trim() ?? "";
        if (first.Length == 0 || last.Length == 0 || email.Length == 0 || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "First name, last name, email and an initial password are required." });
        if (await _users.FindByEmailAsync(email) is not null)
            return Conflict(new { message = "An account with this email already exists. Use the existing parent account instead." });

        if (!await _roles.RoleExistsAsync("Parent"))
        {
            var roleResult = await _roles.CreateAsync(new IdentityRole<Guid>("Parent"));
            if (!roleResult.Succeeded) return Problem("Could not prepare the Parent role.");
        }

        var parent = new AppUser
        {
            Id = Guid.NewGuid(), UserName = email, Email = email, EmailConfirmed = true,
            FirstName = first, LastName = last, PhoneNumber = string.IsNullOrWhiteSpace(request.PhoneNumber) ? null : request.PhoneNumber.Trim(),
            CreatedAtUtc = DateTime.UtcNow
        };
        var created = await _users.CreateAsync(parent, request.Password);
        if (!created.Succeeded)
            return BadRequest(new { message = "Parent account could not be created.", errors = created.Errors.Select(x => x.Description) });

        var roleAdded = await _users.AddToRoleAsync(parent, "Parent");
        if (!roleAdded.Succeeded)
        {
            await _users.DeleteAsync(parent);
            return Problem("Parent account was rolled back because the Parent role could not be assigned.");
        }
        return Created($"/api/institutes/{instituteId}/parent-accounts/{parent.Id}",
            new ParentAccountResponse(parent.Id, parent.FirstName, parent.LastName, parent.Email!, parent.PhoneNumber, new[] { "Parent" }));
    }

    private async Task<bool> IsInstituteAdmin(Guid instituteId, CancellationToken ct)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return false;
        if (User.IsInRole("Admin")) return true;
        return await _db.InstituteMemberships.AnyAsync(m => m.InstituteId == instituteId && m.UserId == userId &&
            (m.Role == "InstituteAdmin" || m.Role == "Admin"), ct);
    }
}
