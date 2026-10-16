using Confluent.Kafka;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ProgressiveMinds.Api.Data;

namespace ProgressiveMinds.Api.Services;

public sealed class KafkaEventConsumerService : BackgroundService
{
    private const string ConsumerName = "progressiveminds-phase1-logger";
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly KafkaOptions _options;
    private readonly ILogger<KafkaEventConsumerService> _logger;

    public KafkaEventConsumerService(
        IServiceScopeFactory scopeFactory,
        IOptions<KafkaOptions> options,
        ILogger<KafkaEventConsumerService> logger)
    {
        _scopeFactory = scopeFactory;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var config = new ConsumerConfig
        {
            BootstrapServers = _options.BootstrapServers,
            GroupId = _options.ConsumerGroup,
            ClientId = "progressiveminds-event-consumer",
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = false,
            EnablePartitionEof = false
        };

        using var consumer = new ConsumerBuilder<string, string>(config).Build();
        try
        {
            consumer.Subscribe(_options.EventsTopic);
            _logger.LogInformation("Kafka consumer subscribed to {Topic}", _options.EventsTopic);

            while (!stoppingToken.IsCancellationRequested)
            {
                ConsumeResult<string, string>? result;
                try
                {
                    result = consumer.Consume(TimeSpan.FromMilliseconds(500));
                }
                catch (ConsumeException ex)
                {
                    _logger.LogError(ex, "Kafka consume error.");
                    continue;
                }

                if (result is null)
                    continue;

                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                    var eventId = ReadEventId(result.Message.Value);

                    if (eventId.HasValue)
                    {
                        var alreadyProcessed = await db.ProcessedEvents
                            .AnyAsync(x => x.ConsumerName == ConsumerName && x.EventId == eventId.Value, stoppingToken);

                        if (!alreadyProcessed)
                        {
                            db.ProcessedEvents.Add(new ProcessedEvent
                            {
                                ConsumerName = ConsumerName,
                                EventId = eventId.Value,
                                ProcessedAtUtc = DateTime.UtcNow
                            });
                            await db.SaveChangesAsync(stoppingToken);
                            _logger.LogInformation("Consumed event {EventId}; key={Key}; payload={Payload}", eventId, result.Message.Key, result.Message.Value);
                        }
                        else
                        {
                            _logger.LogInformation("Skipping already processed event {EventId}", eventId);
                        }
                    }
                    else
                    {
                        _logger.LogWarning("Received event without a valid eventId; payload={Payload}", result.Message.Value);
                    }

                    consumer.Commit(result);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Event processing failed. Offset will not be committed; message may be retried.");
                    await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal shutdown.
        }
        catch (KafkaException ex)
        {
            _logger.LogError(ex, "Kafka consumer stopped. Restart the API after fixing Kafka connectivity.");
        }
        finally
        {
            consumer.Close();
        }
    }

    private static Guid? ReadEventId(string payload)
    {
        try
        {
            using var document = System.Text.Json.JsonDocument.Parse(payload);
            if (document.RootElement.TryGetProperty("eventId", out var property) &&
                Guid.TryParse(property.GetString(), out var id))
                return id;
        }
        catch (System.Text.Json.JsonException)
        {
            // Invalid payload.
        }

        return null;
    }
}
