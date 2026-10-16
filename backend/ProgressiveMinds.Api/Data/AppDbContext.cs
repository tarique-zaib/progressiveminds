using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using ProgressiveMinds.Api.Models;

namespace ProgressiveMinds.Api.Data;

public sealed class AppDbContext : IdentityDbContext<AppUser, IdentityRole<Guid>, Guid>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();
    public DbSet<ProcessedEvent> ProcessedEvents => Set<ProcessedEvent>();
    public DbSet<Institute> Institutes => Set<Institute>();
    public DbSet<InstituteMembership> InstituteMemberships => Set<InstituteMembership>();
    public DbSet<AcademicSession> AcademicSessions => Set<AcademicSession>();
    public DbSet<Course> Courses => Set<Course>();
    public DbSet<Subject> Subjects => Set<Subject>();
    public DbSet<Student> Students => Set<Student>();
    public DbSet<AttendanceRecord> AttendanceRecords => Set<AttendanceRecord>();
    public DbSet<Assessment> Assessments => Set<Assessment>();
    public DbSet<AssessmentSection> AssessmentSections => Set<AssessmentSection>();
    public DbSet<AssessmentMark> AssessmentMarks => Set<AssessmentMark>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<AppUser>(entity =>
        {
            entity.Property(x => x.FirstName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.LastName).HasMaxLength(100).IsRequired();
        });

        builder.Entity<OutboxMessage>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.EventType).HasMaxLength(200).IsRequired();
            entity.Property(x => x.AggregateKey).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Payload).IsRequired();
            entity.HasIndex(x => new { x.PublishedAtUtc, x.NextAttemptAtUtc, x.CreatedAtUtc });
        });

        builder.Entity<ProcessedEvent>(entity =>
        {
            entity.HasKey(x => new { x.ConsumerName, x.EventId });
            entity.Property(x => x.ConsumerName).HasMaxLength(200);
        });

        builder.Entity<Institute>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(160).IsRequired();
            entity.Property(x => x.Code).HasMaxLength(30).IsRequired();
            entity.Property(x => x.Code).UseCollation("C");
            entity.Property(x => x.Email).HasMaxLength(254);
            entity.Property(x => x.Phone).HasMaxLength(40);
            entity.Property(x => x.Address).HasMaxLength(500);
            entity.Property(x => x.TimeZoneId).HasMaxLength(100).IsRequired();
            entity.HasIndex(x => x.Code).IsUnique();
        });

        builder.Entity<InstituteMembership>(entity =>
        {
            entity.HasKey(x => new { x.InstituteId, x.UserId });
            entity.Property(x => x.Role).HasMaxLength(40).IsRequired();
            entity.HasIndex(x => x.UserId);
            entity.HasOne(x => x.Institute)
                .WithMany(x => x.Memberships)
                .HasForeignKey(x => x.InstituteId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<AppUser>()
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<AcademicSession>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(80).IsRequired();
            entity.HasIndex(x => new { x.InstituteId, x.Name }).IsUnique();
            entity.HasIndex(x => new { x.InstituteId, x.IsCurrent });
            entity.HasOne(x => x.Institute)
                .WithMany(x => x.AcademicSessions)
                .HasForeignKey(x => x.InstituteId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.ToTable(table =>
                table.HasCheckConstraint("CK_AcademicSessions_DateRange", "\"EndDate\" >= \"StartDate\""));
        });

        builder.Entity<Course>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Code).HasMaxLength(30).IsRequired();
            entity.Property(x => x.Code).UseCollation("C");
            entity.Property(x => x.Name).HasMaxLength(120).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(1000);
            entity.HasIndex(x => new { x.InstituteId, x.Code }).IsUnique();
            entity.HasIndex(x => new { x.InstituteId, x.IsActive, x.Name });
            entity.HasOne(x => x.Institute)
                .WithMany()
                .HasForeignKey(x => x.InstituteId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Subject>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Code).HasMaxLength(30).IsRequired();
            entity.Property(x => x.Code).UseCollation("C");
            entity.Property(x => x.Name).HasMaxLength(120).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(1000);
            entity.HasIndex(x => new { x.InstituteId, x.CourseId, x.Code }).IsUnique();
            entity.HasIndex(x => new { x.InstituteId, x.CourseId, x.Name });
            entity.HasOne(x => x.Course)
                .WithMany()
                .HasForeignKey(x => x.CourseId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Student>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.AdmissionNumber).HasMaxLength(30).IsRequired();
            entity.Property(x => x.AdmissionNumber).UseCollation("C");
            entity.Property(x => x.FullName).HasMaxLength(120).IsRequired();
            entity.Property(x => x.Email).HasMaxLength(254);
            entity.Property(x => x.Phone).HasMaxLength(20).IsRequired();
            entity.Property(x => x.ParentName).HasMaxLength(120);
            entity.Property(x => x.ParentPhone).HasMaxLength(20);
            entity.HasIndex(x => new { x.InstituteId, x.AdmissionNumber }).IsUnique();
            entity.HasIndex(x => new { x.InstituteId, x.FullName });
            entity.HasOne(x => x.Course)
                .WithMany()
                .HasForeignKey(x => x.CourseId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<AttendanceRecord>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Status).HasMaxLength(20).IsRequired();
            entity.Property(x => x.Notes).HasMaxLength(500);
            entity.HasIndex(x => new
            {
                x.InstituteId, x.AcademicSessionId, x.CourseId,
                x.AttendanceDate, x.StudentId
            }).IsUnique();
            entity.HasOne<Student>()
                .WithMany()
                .HasForeignKey(x => x.StudentId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<Course>()
                .WithMany()
                .HasForeignKey(x => x.CourseId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<AcademicSession>()
                .WithMany()
                .HasForeignKey(x => x.AcademicSessionId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Assessment>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Title).HasMaxLength(160).IsRequired();
            entity.Property(x => x.AssessmentType).HasMaxLength(20).IsRequired();
            entity.HasIndex(x => new { x.InstituteId, x.AcademicSessionId, x.CourseId, x.AssessmentDate });
            entity.HasOne<Institute>()
                .WithMany()
                .HasForeignKey(x => x.InstituteId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<AcademicSession>()
                .WithMany()
                .HasForeignKey(x => x.AcademicSessionId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<Course>()
                .WithMany()
                .HasForeignKey(x => x.CourseId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<AssessmentSection>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.MaxMarks).HasPrecision(8, 2);
            entity.Property(x => x.NegativeMarksPerWrongAnswer).HasPrecision(8, 2);
            entity.HasIndex(x => new { x.AssessmentId, x.SubjectId }).IsUnique();
            entity.HasOne(x => x.Assessment)
                .WithMany(x => x.Sections)
                .HasForeignKey(x => x.AssessmentId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Subject)
                .WithMany()
                .HasForeignKey(x => x.SubjectId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<AssessmentMark>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.MarksObtained).HasPrecision(8, 2);
            entity.Property(x => x.Remarks).HasMaxLength(500);
            entity.HasIndex(x => new { x.AssessmentSectionId, x.StudentId }).IsUnique();
            entity.HasOne(x => x.AssessmentSection)
                .WithMany()
                .HasForeignKey(x => x.AssessmentSectionId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Student)
                .WithMany()
                .HasForeignKey(x => x.StudentId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}

public sealed class ProcessedEvent
{
    public string ConsumerName { get; set; } = string.Empty;
    public Guid EventId { get; set; }
    public DateTime ProcessedAtUtc { get; set; } = DateTime.UtcNow;
}
