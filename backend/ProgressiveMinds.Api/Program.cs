using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using ProgressiveMinds.Api.Data;
using ProgressiveMinds.Api.Models;
using ProgressiveMinds.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = Microsoft.OpenApi.SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = Microsoft.OpenApi.ParameterLocation.Header,
        Description = "Paste your JWT access token here."
    });

    options.AddSecurityRequirement(document => new Microsoft.OpenApi.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.OpenApiSecuritySchemeReference("Bearer", document),
            new List<string>()
        }
    });
});

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Set ConnectionStrings:DefaultConnection using User Secrets.");

var jwtSigningKey = builder.Configuration["Jwt:SigningKey"];
if (string.IsNullOrWhiteSpace(jwtSigningKey) || Encoding.UTF8.GetByteCount(jwtSigningKey) < 64)
{
    throw new InvalidOperationException("Set Jwt:SigningKey to a random secret at least 64 bytes long using User Secrets.");
}

var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "ProgressiveMinds";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "ProgressiveMinds.Web";

builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));

builder.Services
    .AddIdentityCore<AppUser>(options =>
    {
        options.User.RequireUniqueEmail = true;
        options.Password.RequiredLength = 12;
        options.Password.RequireDigit = true;
        options.Password.RequireLowercase = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireNonAlphanumeric = true;
        options.Lockout.AllowedForNewUsers = true;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    })
    .AddRoles<IdentityRole<Guid>>()
    .AddEntityFrameworkStores<AppDbContext>()
    .AddSignInManager();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtAudience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSigningKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy => policy
        .WithOrigins("http://localhost:5173")
        .AllowAnyHeader()
        .AllowAnyMethod());
});

builder.Services.AddScoped<JwtTokenService>();
builder.Services.Configure<KafkaOptions>(builder.Configuration.GetSection("Kafka"));
builder.Services.Configure<JwtOptions>(options =>
{
    options.Issuer = jwtIssuer;
    options.Audience = jwtAudience;
    options.SigningKey = jwtSigningKey;
});

builder.Services.AddSingleton<IKafkaProducer, KafkaProducer>();
builder.Services.AddHostedService<OutboxPublisherService>();
builder.Services.AddHostedService<KafkaEventConsumerService>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "Healthy", application = "ProgressiveMinds" }));
app.MapControllers();

await SeedIdentityAsync(app);

app.Run();


static async Task SeedIdentityAsync(WebApplication app)
{
    using var scope = app.Services.CreateScope();

    var services = scope.ServiceProvider;
    var logger = services.GetRequiredService<ILoggerFactory>()
        .CreateLogger("IdentitySeeder");
    var roleManager = services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
    var userManager = services.GetRequiredService<UserManager<AppUser>>();
    var configuration = services.GetRequiredService<IConfiguration>();

    // Ensure both roles exist, regardless of whether bootstrap accounts are configured.
    foreach (var roleName in new[] { "Admin", "Parent" })
    {
        if (!await roleManager.RoleExistsAsync(roleName))
        {
            var roleResult = await roleManager.CreateAsync(
                new IdentityRole<Guid>(roleName));

            if (!roleResult.Succeeded)
            {
                throw new InvalidOperationException(
                    $"Could not create {roleName} role: " +
                    string.Join("; ", roleResult.Errors.Select(e => e.Description)));
            }

            logger.LogInformation("Created Identity role {RoleName}.", roleName);
        }
    }

    // Preserve the existing bootstrap Admin behavior.
    var adminEmail = configuration["BootstrapAdmin:Email"];
    var adminPassword = configuration["BootstrapAdmin:Password"];

    if (!string.IsNullOrWhiteSpace(adminEmail) &&
        !string.IsNullOrWhiteSpace(adminPassword))
    {
        var admin = await userManager.FindByEmailAsync(adminEmail);

        if (admin is null)
        {
            admin = new AppUser
            {
                UserName = adminEmail,
                Email = adminEmail,
                EmailConfirmed = true,
                FirstName = configuration["BootstrapAdmin:FirstName"] ?? "Progressive",
                LastName = configuration["BootstrapAdmin:LastName"] ?? "Admin",
                CreatedAtUtc = DateTime.UtcNow
            };

            var createResult = await userManager.CreateAsync(admin, adminPassword);

            if (!createResult.Succeeded)
            {
                throw new InvalidOperationException(
                    "Could not create bootstrap admin: " +
                    string.Join("; ", createResult.Errors.Select(e => e.Description)));
            }
        }

        if (!await userManager.IsInRoleAsync(admin, "Admin"))
        {
            var roleResult = await userManager.AddToRoleAsync(admin, "Admin");

            if (!roleResult.Succeeded)
            {
                throw new InvalidOperationException(
                    "Could not assign Admin role: " +
                    string.Join("; ", roleResult.Errors.Select(e => e.Description)));
            }
        }
    }
    else
    {
        logger.LogWarning(
            "Bootstrap admin was not seeded because BootstrapAdmin:Email or BootstrapAdmin:Password is missing.");
    }

    // Optional dedicated test Parent account. Configure credentials through User Secrets.
    var parentEmail = configuration["BootstrapParent:Email"];
    var parentPassword = configuration["BootstrapParent:Password"];

    if (!string.IsNullOrWhiteSpace(parentEmail) &&
        !string.IsNullOrWhiteSpace(parentPassword))
    {
        var parent = await userManager.FindByEmailAsync(parentEmail);

        if (parent is null)
        {
            parent = new AppUser
            {
                UserName = parentEmail,
                Email = parentEmail,
                EmailConfirmed = true,
                FirstName = configuration["BootstrapParent:FirstName"] ?? "Test",
                LastName = configuration["BootstrapParent:LastName"] ?? "Parent",
                CreatedAtUtc = DateTime.UtcNow
            };

            var createResult = await userManager.CreateAsync(parent, parentPassword);

            if (!createResult.Succeeded)
            {
                throw new InvalidOperationException(
                    "Could not create bootstrap parent: " +
                    string.Join("; ", createResult.Errors.Select(e => e.Description)));
            }
        }

        if (!await userManager.IsInRoleAsync(parent, "Parent"))
        {
            var roleResult = await userManager.AddToRoleAsync(parent, "Parent");

            if (!roleResult.Succeeded)
            {
                throw new InvalidOperationException(
                    "Could not assign Parent role: " +
                    string.Join("; ", roleResult.Errors.Select(e => e.Description)));
            }
        }

        logger.LogInformation(
            "Bootstrap Parent account is ready for {ParentEmail}.", parentEmail);
    }
    else
    {
        logger.LogInformation(
            "No Bootstrap Parent account configured; only the Parent role was ensured.");
    }
}
