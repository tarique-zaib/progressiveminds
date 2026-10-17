namespace ProgressiveMinds.Api.Models;

/// <summary>An explicit, administrator-approved link between a portal account and a student.</summary>
public sealed class ParentStudentLink
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InstituteId { get; set; }
    public Guid StudentId { get; set; }
    public Guid ParentUserId { get; set; }
    public Guid LinkedByUserId { get; set; }
    public DateTime LinkedAtUtc { get; set; } = DateTime.UtcNow;
    public bool IsActive { get; set; } = true;
}
