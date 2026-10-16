namespace ProgressiveMinds.Api.Models;

public sealed class AttendanceRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InstituteId { get; set; }
    public Guid AcademicSessionId { get; set; }
    public Guid CourseId { get; set; }
    public Guid StudentId { get; set; }
    public DateOnly AttendanceDate { get; set; }
    public string Status { get; set; } = "Present";
    public string? Notes { get; set; }
    public Guid MarkedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
