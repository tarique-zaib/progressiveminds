using Confluent.Kafka;
using Microsoft.Extensions.Options;

namespace ProgressiveMinds.Api.Services;

public sealed class KafkaProducer : IKafkaProducer, IDisposable
{
    private readonly IProducer<string, string> _producer;

    public KafkaProducer(IOptions<KafkaOptions> options)
    {
        var config = new ProducerConfig
        {
            BootstrapServers = options.Value.BootstrapServers,
            ClientId = "progressiveminds-api",
            Acks = Acks.All,
            EnableIdempotence = true,
            MessageTimeoutMs = 10000
        };
        _producer = new ProducerBuilder<string, string>(config).Build();
    }

    public async Task PublishAsync(string topic, string key, string payload, CancellationToken cancellationToken)
    {
        await _producer.ProduceAsync(topic, new Message<string, string>
        {
            Key = key,
            Value = payload,
            Headers = new Headers { { "content-type", System.Text.Encoding.UTF8.GetBytes("application/json") } }
        }, cancellationToken);
    }

    public void Dispose() => _producer.Dispose();
}
