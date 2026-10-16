namespace ProgressiveMinds.Api.Models;

public sealed class Institute
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public string TimeZoneId { get; set; } = "Asia/Kolkata";
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public ICollection<InstituteMembership> Memberships { get; set; } = new List<InstituteMembership>();
    public ICollection<AcademicSession> AcademicSessions { get; set; } = new List<AcademicSession>();
}

public sealed class InstituteMembership
{
    public Guid InstituteId { get; set; }
    public Institute Institute { get; set; } = null!;
    public Guid UserId { get; set; }
    public string Role { get; set; } = "InstituteAdmin";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
