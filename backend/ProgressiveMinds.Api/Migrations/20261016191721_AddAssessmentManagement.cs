using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProgressiveMinds.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAssessmentManagement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Assessments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InstituteId = table.Column<Guid>(type: "uuid", nullable: false),
                    AcademicSessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    AssessmentType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    AssessmentDate = table.Column<DateOnly>(type: "date", nullable: false),
                    DurationMinutes = table.Column<int>(type: "integer", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Assessments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Assessments_AcademicSessions_AcademicSessionId",
                        column: x => x.AcademicSessionId,
                        principalTable: "AcademicSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Assessments_Courses_CourseId",
                        column: x => x.CourseId,
                        principalTable: "Courses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Assessments_Institutes_InstituteId",
                        column: x => x.InstituteId,
                        principalTable: "Institutes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AssessmentSections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AssessmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    MaxMarks = table.Column<decimal>(type: "numeric(8,2)", precision: 8, scale: 2, nullable: false),
                    NegativeMarksPerWrongAnswer = table.Column<decimal>(type: "numeric(8,2)", precision: 8, scale: 2, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssessmentSections", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AssessmentSections_Assessments_AssessmentId",
                        column: x => x.AssessmentId,
                        principalTable: "Assessments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AssessmentSections_Subjects_SubjectId",
                        column: x => x.SubjectId,
                        principalTable: "Subjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AssessmentMarks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AssessmentSectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentId = table.Column<Guid>(type: "uuid", nullable: false),
                    MarksObtained = table.Column<decimal>(type: "numeric(8,2)", precision: 8, scale: 2, nullable: true),
                    Remarks = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    MarkedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssessmentMarks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AssessmentMarks_AssessmentSections_AssessmentSectionId",
                        column: x => x.AssessmentSectionId,
                        principalTable: "AssessmentSections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AssessmentMarks_Students_StudentId",
                        column: x => x.StudentId,
                        principalTable: "Students",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentMarks_AssessmentSectionId_StudentId",
                table: "AssessmentMarks",
                columns: new[] { "AssessmentSectionId", "StudentId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentMarks_StudentId",
                table: "AssessmentMarks",
                column: "StudentId");

            migrationBuilder.CreateIndex(
                name: "IX_Assessments_AcademicSessionId",
                table: "Assessments",
                column: "AcademicSessionId");

            migrationBuilder.CreateIndex(
                name: "IX_Assessments_CourseId",
                table: "Assessments",
                column: "CourseId");

            migrationBuilder.CreateIndex(
                name: "IX_Assessments_InstituteId_AcademicSessionId_CourseId_Assessme~",
                table: "Assessments",
                columns: new[] { "InstituteId", "AcademicSessionId", "CourseId", "AssessmentDate" });

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentSections_AssessmentId_SubjectId",
                table: "AssessmentSections",
                columns: new[] { "AssessmentId", "SubjectId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentSections_SubjectId",
                table: "AssessmentSections",
                column: "SubjectId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AssessmentMarks");

            migrationBuilder.DropTable(
                name: "AssessmentSections");

            migrationBuilder.DropTable(
                name: "Assessments");
        }
    }
}
