namespace ProgressiveMinds.Api.Models;

public sealed class Assessment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InstituteId { get; set; }
    public Guid AcademicSessionId { get; set; }
    public Guid CourseId { get; set; }
    public string Title { get; set; } = string.Empty;
    // Supported values: WeeklyTest, JeeMock, NeetMock.
    public string AssessmentType { get; set; } = "WeeklyTest";
    public DateOnly AssessmentDate { get; set; }
    public int? DurationMinutes { get; set; }
    public Guid CreatedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public ICollection<AssessmentSection> Sections { get; set; } = new List<AssessmentSection>();
}
