namespace ProgressiveMinds.Api.Models;

public sealed class AssessmentMark
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AssessmentSectionId { get; set; }
    public Guid StudentId { get; set; }
    public decimal? MarksObtained { get; set; }
    public string? Remarks { get; set; }
    public Guid MarkedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public AssessmentSection AssessmentSection { get; set; } = null!;
    public Student Student { get; set; } = null!;
}
