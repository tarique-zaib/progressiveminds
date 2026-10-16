namespace ProgressiveMinds.Api.Contracts;

public sealed record AssessmentSectionInput(
    Guid SubjectId,
    decimal MaxMarks,
    decimal NegativeMarksPerWrongAnswer = 0);

public sealed record CreateAssessmentRequest(
    Guid AcademicSessionId,
    Guid CourseId,
    string Title,
    string AssessmentType,
    DateOnly AssessmentDate,
    int? DurationMinutes,
    List<AssessmentSectionInput> Sections);

public sealed record AssessmentSectionResponse(
    Guid Id,
    Guid SubjectId,
    string SubjectCode,
    string SubjectName,
    decimal MaxMarks,
    decimal NegativeMarksPerWrongAnswer,
    int SortOrder);

public sealed record AssessmentResponse(
    Guid Id,
    Guid InstituteId,
    Guid AcademicSessionId,
    Guid CourseId,
    string Title,
    string AssessmentType,
    DateOnly AssessmentDate,
    int? DurationMinutes,
    decimal TotalMaxMarks,
    int SectionCount,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    IReadOnlyList<AssessmentSectionResponse> Sections);

public sealed record AssessmentMarkInput(
    Guid StudentId,
    decimal? MarksObtained,
    string? Remarks);

public sealed record SaveAssessmentMarksRequest(
    List<AssessmentMarkInput> Records);

public sealed record AssessmentMarkResponse(
    Guid StudentId,
    string AdmissionNumber,
    string StudentName,
    decimal? MarksObtained,
    decimal MaxMarks,
    string? Remarks,
    DateTime? UpdatedAtUtc);

public sealed record SaveAssessmentMarksResponse(int SavedCount, int MarkedCount);
