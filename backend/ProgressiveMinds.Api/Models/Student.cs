namespace ProgressiveMinds.Api.Models;

public sealed class Student
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InstituteId { get; set; }
    public Guid CourseId { get; set; }
    public string AdmissionNumber { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string Phone { get; set; } = string.Empty;
    public string? ParentName { get; set; }
    public string? ParentPhone { get; set; }
    public DateTime? DateOfBirth { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public Course? Course { get; set; }
}
