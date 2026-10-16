namespace ProgressiveMinds.Api.Contracts;

public sealed record AttendanceRecordInput(Guid StudentId, string Status, string? Notes);

public sealed record SaveAttendanceRequest(
    Guid AcademicSessionId,
    Guid CourseId,
    DateOnly AttendanceDate,
    List<AttendanceRecordInput> Records);

public sealed record AttendanceResponse(
    Guid Id,
    Guid InstituteId,
    Guid AcademicSessionId,
    Guid CourseId,
    Guid StudentId,
    string StudentName,
    string AdmissionNumber,
    DateOnly AttendanceDate,
    string Status,
    string? Notes,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc);

public sealed record SaveAttendanceResponse(int SavedCount);
