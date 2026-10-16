namespace ProgressiveMinds.Api.Models;

public sealed class AssessmentSection
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AssessmentId { get; set; }
    public Guid SubjectId { get; set; }
    public decimal MaxMarks { get; set; }
    public decimal NegativeMarksPerWrongAnswer { get; set; }
    public int SortOrder { get; set; }
    public Assessment Assessment { get; set; } = null!;
    public Subject Subject { get; set; } = null!;
}
