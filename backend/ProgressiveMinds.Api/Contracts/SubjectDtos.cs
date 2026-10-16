
using System.ComponentModel.DataAnnotations;

namespace ProgressiveMinds.Api.Contracts;

public sealed class CreateSubjectRequest
{
    [Required]
    [RegularExpression(@"^[A-Za-z0-9][A-Za-z0-9\-]{1,29}$")]
    public string Code { get; set; } = string.Empty;

    [Required]
    [StringLength(120, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    [StringLength(1000)]
    public string? Description { get; set; }
}

public sealed class UpdateSubjectRequest
{
    [Required]
    [RegularExpression(@"^[A-Za-z0-9][A-Za-z0-9\-]{1,29}$")]
    public string Code { get; set; } = string.Empty;

    [Required]
    [StringLength(120, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    [StringLength(1000)]
    public string? Description { get; set; }

    public bool IsActive { get; set; } = true;
}

public sealed record SubjectResponse(
    Guid Id,
    Guid InstituteId,
    Guid CourseId,
    string Code,
    string Name,
    string? Description,
    bool IsActive,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc);
