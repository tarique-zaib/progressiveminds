
namespace ProgressiveMinds.Api.Models;

public sealed class Subject
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid InstituteId { get; set; }

    public Guid CourseId { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public Course? Course { get; set; }
}
