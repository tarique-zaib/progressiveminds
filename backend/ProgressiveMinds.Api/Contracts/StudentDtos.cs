using System.ComponentModel.DataAnnotations;

namespace ProgressiveMinds.Api.Contracts;

public sealed class CreateStudentRequest
{
    [Required, RegularExpression(@"^[A-Za-z0-9][A-Za-z0-9\-/]{1,29}$")]
    public string AdmissionNumber { get; set; } = string.Empty;

    [Required, StringLength(120, MinimumLength = 2)]
    public string FullName { get; set; } = string.Empty;

    [EmailAddress, StringLength(254)]
    public string? Email { get; set; }

    [Required, Phone, StringLength(20, MinimumLength = 7)]
    public string Phone { get; set; } = string.Empty;

    [StringLength(120)]
    public string? ParentName { get; set; }

    [Phone, StringLength(20)]
    public string? ParentPhone { get; set; }

    public DateTime? DateOfBirth { get; set; }

    [Required]
    public Guid CourseId { get; set; }
}

public sealed class UpdateStudentRequest
{
    [Required, RegularExpression(@"^[A-Za-z0-9][A-Za-z0-9\-/]{1,29}$")]
    public string AdmissionNumber { get; set; } = string.Empty;

    [Required, StringLength(120, MinimumLength = 2)]
    public string FullName { get; set; } = string.Empty;

    [EmailAddress, StringLength(254)]
    public string? Email { get; set; }

    [Required, Phone, StringLength(20, MinimumLength = 7)]
    public string Phone { get; set; } = string.Empty;

    [StringLength(120)]
    public string? ParentName { get; set; }

    [Phone, StringLength(20)]
    public string? ParentPhone { get; set; }

    public DateTime? DateOfBirth { get; set; }

    [Required]
    public Guid CourseId { get; set; }

    public bool IsActive { get; set; } = true;
}

public sealed record StudentResponse(
    Guid Id,
    Guid InstituteId,
    Guid CourseId,
    string AdmissionNumber,
    string FullName,
    string? Email,
    string Phone,
    string? ParentName,
    string? ParentPhone,
    DateTime? DateOfBirth,
    bool IsActive,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc);
