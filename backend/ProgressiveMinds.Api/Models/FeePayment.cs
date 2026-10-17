namespace ProgressiveMinds.Api.Models;

public sealed class FeePayment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InstituteId { get; set; }
    public Guid StudentFeeId { get; set; }
    public decimal Amount { get; set; }
    public string Method { get; set; } = "Cash";
    public string? ReferenceNumber { get; set; }
    public string ReceiptNumber { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public DateTime PaidAtUtc { get; set; } = DateTime.UtcNow;
    public Guid RecordedByUserId { get; set; }
}
