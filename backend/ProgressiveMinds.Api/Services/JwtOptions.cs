namespace ProgressiveMinds.Api.Services;

public sealed class JwtOptions
{
    public string Issuer { get; set; } = "ProgressiveMinds";
    public string Audience { get; set; } = "ProgressiveMinds.Web";
    public string SigningKey { get; set; } = string.Empty;
}
