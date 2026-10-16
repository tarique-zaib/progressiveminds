using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ProgressiveMinds.Api.Data;

namespace ProgressiveMinds.Api.Services;

public sealed class OutboxPublisherService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IKafkaProducer _producer;
    private readonly KafkaOptions _options;
    private readonly ILogger<OutboxPublisherService> _logger;

    public OutboxPublisherService(
        IServiceScopeFactory scopeFactory,
        IKafkaProducer producer,
        IOptions<KafkaOptions> options,
        ILogger<OutboxPublisherService> logger)
    {
        _scopeFactory = scopeFactory;
        _producer = producer;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var now = DateTime.UtcNow;
                var messages = await db.OutboxMessages
                    .Where(x => x.PublishedAtUtc == null && x.NextAttemptAtUtc <= now)
                    .OrderBy(x => x.CreatedAtUtc)
                    .Take(20)
                    .ToListAsync(stoppingToken);

                foreach (var message in messages)
                {
                    try
                    {
                        await _producer.PublishAsync(_options.EventsTopic, message.AggregateKey, message.Payload, stoppingToken);
                        message.PublishedAtUtc = DateTime.UtcNow;
                        message.LastError = null;
                        _logger.LogInformation("Published outbox event {EventId} ({EventType})", message.Id, message.EventType);
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        message.Attempts++;
                        message.LastError = ex.Message.Length > 2000 ? ex.Message[..2000] : ex.Message;
                        var delaySeconds = Math.Min(300, Math.Pow(2, Math.Min(message.Attempts, 8)));
                        message.NextAttemptAtUtc = DateTime.UtcNow.AddSeconds(delaySeconds);
                        _logger.LogWarning(ex, "Could not publish outbox event {EventId}; retry {Attempt}", message.Id, message.Attempts);
                    }
                }

                if (messages.Count > 0)
                    await db.SaveChangesAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Outbox publisher loop failed.");
            }

            await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }
    }
}
