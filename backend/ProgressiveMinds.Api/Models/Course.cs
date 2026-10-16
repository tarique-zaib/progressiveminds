namespace ProgressiveMinds.Api.Models;

public sealed class Course
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InstituteId { get; set; }
    public Institute Institute { get; set; } = null!;
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int DurationMonths { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
