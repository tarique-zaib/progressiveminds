using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProgressiveMinds.Api.Contracts;
using ProgressiveMinds.Api.Data;
using ProgressiveMinds.Api.Models;

namespace ProgressiveMinds.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/events")]
public sealed class EventsController : ControllerBase
{
    private readonly AppDbContext _db;

    public EventsController(AppDbContext db) => _db = db;

    [HttpPost("test")]
    public async Task<ActionResult<TestEventResponse>> PublishTestEvent(CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "unknown";
        var eventId = Guid.NewGuid();
        var envelope = new
        {
            eventId,
            eventType = "ProgressiveMinds.TestEvent.v1",
            eventVersion = 1,
            occurredAtUtc = DateTime.UtcNow,
            aggregateId = userId,
            data = new
            {
                message = "ProgressiveMinds Kafka pipeline test",
                triggeredByUserId = userId
            }
        };

        var outbox = new OutboxMessage
        {
            Id = eventId,
            EventType = "ProgressiveMinds.TestEvent.v1",
            AggregateKey = userId,
            Payload = JsonSerializer.Serialize(envelope),
            CreatedAtUtc = DateTime.UtcNow,
            NextAttemptAtUtc = DateTime.UtcNow
        };

        _db.OutboxMessages.Add(outbox);
        await _db.SaveChangesAsync(cancellationToken);

        return Accepted(new TestEventResponse(eventId, "Queued", "Saved to PostgreSQL outbox; Kafka publishing will happen asynchronously."));
    }
}
