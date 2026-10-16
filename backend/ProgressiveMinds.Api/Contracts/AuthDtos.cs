namespace ProgressiveMinds.Api.Contracts;

public sealed record LoginRequest(string Email, string Password);
public sealed record UserDto(string Id, string Email, string FirstName, string LastName, string[] Roles);
public sealed record LoginResponse(string AccessToken, DateTime ExpiresAtUtc, UserDto User);
public sealed record TestEventResponse(Guid EventId, string Status, string Message);
