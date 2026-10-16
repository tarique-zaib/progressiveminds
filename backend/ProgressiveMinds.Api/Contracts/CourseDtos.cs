using System.ComponentModel.DataAnnotations;

namespace ProgressiveMinds.Api.Contracts;

public sealed class CreateCourseRequest
{
    [Required, StringLength(30, MinimumLength = 2)]
    [RegularExpression(@"^[A-Za-z0-9][A-Za-z0-9-]{1,29}$")]
    public string Code { get; set; } = string.Empty;

    [Required, StringLength(120, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    [StringLength(1000)]
    public string? Description { get; set; }

    [Range(1, 120)]
    public int DurationMonths { get; set; }
}

public sealed class UpdateCourseRequest
{
    [Required, StringLength(30, MinimumLength = 2)]
    [RegularExpression(@"^[A-Za-z0-9][A-Za-z0-9-]{1,29}$")]
    public string Code { get; set; } = string.Empty;

    [Required, StringLength(120, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    [StringLength(1000)]
    public string? Description { get; set; }

    [Range(1, 120)]
    public int DurationMonths { get; set; }

    public bool IsActive { get; set; }
}

public sealed record CourseResponse(
    Guid Id, Guid InstituteId, string Code, string Name, string? Description,
    int DurationMonths, bool IsActive, DateTime CreatedAtUtc, DateTime UpdatedAtUtc);
