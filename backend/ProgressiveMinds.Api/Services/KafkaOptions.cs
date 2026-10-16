namespace ProgressiveMinds.Api.Services;

public sealed class KafkaOptions
{
    public string BootstrapServers { get; set; } = "localhost:9092";
    public string EventsTopic { get; set; } = "progressiveminds.events.v1";
    public string ConsumerGroup { get; set; } = "progressiveminds-phase1-api";
}
