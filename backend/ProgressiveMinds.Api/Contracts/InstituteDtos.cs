using System.ComponentModel.DataAnnotations;

namespace ProgressiveMinds.Api.Contracts;

using System.ComponentModel.DataAnnotations;

public sealed class CreateInstituteRequest
{
    [Required]
    [StringLength(150)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [RegularExpression(@"^[A-Za-z0-9][A-Za-z0-9\-]{1,29}$")]
    public string Code { get; set; } = string.Empty;

    [EmailAddress]
    public string? Email { get; set; }

    [Phone]
    public string? Phone { get; set; }

    public string? Address { get; set; }

    public string TimeZoneId { get; set; } = "Asia/Kolkata";
}

public sealed record InstituteResponse(
    Guid Id, string Name, string Code, string? Email, string? Phone,
    string? Address, string TimeZoneId, bool IsActive, DateTime CreatedAtUtc, string MembershipRole);

public sealed record CreateAcademicSessionRequest(
    [Required, StringLength(80, MinimumLength = 4)] string Name,
    DateOnly StartDate,
    DateOnly EndDate,
    bool IsCurrent);

public sealed record AcademicSessionResponse(
    Guid Id, Guid InstituteId, string Name, DateOnly StartDate, DateOnly EndDate,
    bool IsCurrent, DateTime CreatedAtUtc);
