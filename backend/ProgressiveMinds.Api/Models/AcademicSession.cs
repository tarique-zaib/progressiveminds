namespace ProgressiveMinds.Api.Models;

public sealed class AcademicSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InstituteId { get; set; }
    public Institute Institute { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public bool IsCurrent { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
