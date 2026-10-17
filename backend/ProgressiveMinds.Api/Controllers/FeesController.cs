using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProgressiveMinds.Api.Data;
using ProgressiveMinds.Api.Models;

namespace ProgressiveMinds.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/institutes/{instituteId:guid}/fees")]
public sealed class FeesController : ControllerBase
{
    private readonly AppDbContext _db;
    public FeesController(AppDbContext db) => _db = db;

    public sealed record CreateFeeRequest(Guid StudentId, Guid AcademicSessionId, string Title, decimal Amount, DateOnly DueDate, string? Notes);
    public sealed record RecordPaymentRequest(decimal Amount, string Method, string? ReferenceNumber, string? Notes);
    public sealed record PaymentResponse(Guid Id, decimal Amount, string Method, string? ReferenceNumber, string ReceiptNumber, string? Notes, DateTime PaidAtUtc);
    public sealed record FeeResponse(Guid Id, Guid StudentId, string StudentName, string AdmissionNumber, Guid AcademicSessionId, string SessionName, string Title, decimal Amount, decimal PaidAmount, decimal Balance, DateOnly DueDate, string Status, string? Notes, IReadOnlyList<PaymentResponse> Payments);

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<FeeResponse>>> Get(Guid instituteId, Guid? studentId, Guid? academicSessionId, string? status, CancellationToken ct)
    {
        if (!await IsMember(instituteId, ct)) return NotFound();
        var query = from fee in _db.StudentFees.AsNoTracking()
                    join student in _db.Students.AsNoTracking() on fee.StudentId equals student.Id
                    join session in _db.AcademicSessions.AsNoTracking() on fee.AcademicSessionId equals session.Id
                    where fee.InstituteId == instituteId
                    select new { fee, student, session };
        if (studentId.HasValue) query = query.Where(x => x.fee.StudentId == studentId.Value);
        if (academicSessionId.HasValue) query = query.Where(x => x.fee.AcademicSessionId == academicSessionId.Value);
        var rows = await query.OrderBy(x => x.fee.DueDate).ThenBy(x => x.student.FullName).ToListAsync(ct);
        var ids = rows.Select(x => x.fee.Id).ToArray();
        var payments = await _db.FeePayments.AsNoTracking().Where(p => p.InstituteId == instituteId && ids.Contains(p.StudentFeeId)).OrderByDescending(p => p.PaidAtUtc).ToListAsync(ct);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var result = rows.Select(x => {
            var feePayments = payments.Where(p => p.StudentFeeId == x.fee.Id).ToArray();
            var paid = feePayments.Sum(p => p.Amount);
            var balance = x.fee.Amount - paid;
            var state = balance <= 0 ? "Paid" : x.fee.DueDate < today ? "Overdue" : paid > 0 ? "Partial" : "Pending";
            return new FeeResponse(x.fee.Id, x.student.Id, x.student.FullName, x.student.AdmissionNumber, x.session.Id, x.session.Name, x.fee.Title, x.fee.Amount, paid, balance, x.fee.DueDate, state, x.fee.Notes,
                feePayments.Select(p => new PaymentResponse(p.Id, p.Amount, p.Method, p.ReferenceNumber, p.ReceiptNumber, p.Notes, p.PaidAtUtc)).ToArray());
        }).ToArray();
        if (!string.IsNullOrWhiteSpace(status)) result = result.Where(x => x.Status.Equals(status, StringComparison.OrdinalIgnoreCase)).ToArray();
        return Ok(result);
    }

    [HttpPost]
    public async Task<ActionResult<FeeResponse>> Create(Guid instituteId, CreateFeeRequest request, CancellationToken ct)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        if (!await IsMember(instituteId, ct)) return NotFound();
        if (request.Amount <= 0 || request.Amount > 100000000m) return BadRequest(new { message = "Fee amount must be greater than zero and within the allowed limit." });
        if (string.IsNullOrWhiteSpace(request.Title) || request.Title.Trim().Length > 160) return BadRequest(new { message = "Enter a fee title up to 160 characters." });
        var student = await _db.Students.AsNoTracking().FirstOrDefaultAsync(s => s.Id == request.StudentId && s.InstituteId == instituteId, ct);
        if (student is null) return BadRequest(new { message = "Select a student belonging to this institute." });
        var session = await _db.AcademicSessions.AsNoTracking().FirstOrDefaultAsync(s => s.Id == request.AcademicSessionId && s.InstituteId == instituteId, ct);
        if (session is null) return BadRequest(new { message = "Select an academic session belonging to this institute." });
        var fee = new StudentFee { InstituteId = instituteId, StudentId = student.Id, AcademicSessionId = session.Id, Title = request.Title.Trim(), Amount = decimal.Round(request.Amount, 2), DueDate = request.DueDate, Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(), CreatedByUserId = userId };
        _db.StudentFees.Add(fee);
        await _db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { instituteId, studentId = student.Id }, new FeeResponse(fee.Id, student.Id, student.FullName, student.AdmissionNumber, session.Id, session.Name, fee.Title, fee.Amount, 0, fee.Amount, fee.DueDate, fee.DueDate < DateOnly.FromDateTime(DateTime.UtcNow) ? "Overdue" : "Pending", fee.Notes, Array.Empty<PaymentResponse>()));
    }

    [HttpPost("{feeId:guid}/payments")]
    public async Task<ActionResult<PaymentResponse>> RecordPayment(Guid instituteId, Guid feeId, RecordPaymentRequest request, CancellationToken ct)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        if (!await IsMember(instituteId, ct)) return NotFound();
        var method = request.Method?.Trim();
        if (method is not ("Cash" or "Bank Transfer" or "UPI")) return BadRequest(new { message = "Payment method must be Cash, Bank Transfer or UPI." });
        if (request.Amount <= 0 || request.Amount > 100000000m) return BadRequest(new { message = "Payment amount must be greater than zero." });
        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        var fee = await _db.StudentFees.FirstOrDefaultAsync(f => f.Id == feeId && f.InstituteId == instituteId, ct);
        if (fee is null) return NotFound();
        var paid = await _db.FeePayments.Where(p => p.StudentFeeId == feeId && p.InstituteId == instituteId).SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;
        var balance = fee.Amount - paid;
        if (balance <= 0) return Conflict(new { message = "This fee is already fully paid." });
        if (request.Amount > balance) return BadRequest(new { message = $"Payment exceeds the outstanding balance of {balance:0.00}." });
        var now = DateTime.UtcNow;
        var payment = new FeePayment { InstituteId = instituteId, StudentFeeId = feeId, Amount = decimal.Round(request.Amount, 2), Method = method!, ReferenceNumber = Clean(request.ReferenceNumber, 100), Notes = Clean(request.Notes, 500), ReceiptNumber = $"PM-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}", PaidAtUtc = now, RecordedByUserId = userId };
        _db.FeePayments.Add(payment);
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Ok(new PaymentResponse(payment.Id, payment.Amount, payment.Method, payment.ReferenceNumber, payment.ReceiptNumber, payment.Notes, payment.PaidAtUtc));
    }

    private async Task<bool> IsMember(Guid instituteId, CancellationToken ct) => TryGetUserId(out var userId) && await _db.InstituteMemberships.AnyAsync(m => m.InstituteId == instituteId && m.UserId == userId, ct);
    private bool TryGetUserId(out Guid userId) => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);
    private static string? Clean(string? value, int max) => string.IsNullOrWhiteSpace(value) ? null : value.Trim()[..Math.Min(value.Trim().Length, max)];
}
