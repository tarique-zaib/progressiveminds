# ProgressiveMinds — Phase 1 Starter

A no-Docker Windows starter for React + TypeScript, ASP.NET Core .NET 10, PostgreSQL, and Apache Kafka.

## What this starter includes

- ASP.NET Core API with ASP.NET Core Identity, roles, password hashing, and JWT bearer authentication.
- PostgreSQL persistence through EF Core/Npgsql.
- One-time bootstrap admin created from environment variables.
- Transactional outbox table and background publisher.
- Kafka consumer that logs received events.
- Protected demo endpoint to publish a test event through the outbox.
- React + TypeScript login screen and protected dashboard.

> This is a development foundation, not a production-hardened release. Before production, add refresh-token/session revocation strategy, rate limiting, password reset/email verification, stronger audit policies, secret management, TLS, backup/restore drills, and dedicated worker deployments.

## 0. Prerequisites

Use Windows PowerShell. Docker Desktop is not required.

Check tools already installed:

```powershell
dotnet --list-sdks
node --version
npm --version
java -version
$env:JAVA_HOME
```

You need:
- .NET 10 SDK (official download: https://dotnet.microsoft.com/en-us/download/dotnet/10.0)
- Node.js 22 or another supported current LTS release
- PostgreSQL server running locally
- Java 17+ for Kafka (the previously reported Java 25 should work if `java -version` succeeds)

Do not reinstall tools that already work.

## 1. PostgreSQL

Check the PostgreSQL Windows service:

```powershell
Get-Service *postgres*
```

If it is installed but stopped, start the matching service from an elevated PowerShell, e.g.:

```powershell
Start-Service postgresql-x64-17
```

Replace the service name with the exact one returned by `Get-Service`.

Create the database in pgAdmin Query Tool or `psql`:

```sql
CREATE DATABASE progressiveminds;
```

The starter uses local connection defaults `localhost:5432`, database `progressiveminds`, username `postgres`. Set the actual username/password as environment variables (see step 4); do not commit passwords.

## 2. Install and start Kafka without Docker

Official Kafka quickstart: https://kafka.apache.org/quickstart/

1. Download the current Kafka binary release from https://kafka.apache.org/downloads/
2. Extract it to a simple path, for example `C:\Kafka`. The extracted directory should contain `bin`, `config`, and `libs`.
3. Open PowerShell and set a user-level environment variable. Adjust the path to the extracted Kafka folder:

```powershell
[Environment]::SetEnvironmentVariable("KAFKA_HOME", "C:\Kafka", "User")
$env:KAFKA_HOME = "C:\Kafka"
```

4. Check Java:

```powershell
java -version
```

If Java works but `JAVA_HOME` is blank, set it to the actual JDK/JBR directory that contains `bin\java.exe`. Example only:

```powershell
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
```

Open a new PowerShell after changing user environment variables.

5. Create a data directory and edit Kafka's `config\server.properties`. Set its `log.dirs` property to a Windows path:

```properties
log.dirs=C:/Kafka/data
```

Keep the other settings from the Kafka release's default `server.properties`. Do not replace the whole Kafka config with this one line.

6. Format the local KRaft storage once. Run from a new PowerShell window:

```powershell
$env:KAFKA_HOME = "C:\Kafka"
$clusterId = & "$env:KAFKA_HOME\bin\windows\kafka-storage.bat" random-uuid
& "$env:KAFKA_HOME\bin\windows\kafka-storage.bat" format --standalone -t $clusterId -c "$env:KAFKA_HOME\config\server.properties"
```

If Kafka reports that the storage directory is already formatted, do not format it again; continue to start the broker. Formatting an existing data directory can destroy data if you delete/recreate it.

7. Start Kafka in its own PowerShell window and leave it running:

```powershell
$env:KAFKA_HOME = "C:\Kafka"
& "$env:KAFKA_HOME\bin\windows\kafka-server-start.bat" "$env:KAFKA_HOME\config\server.properties"
```

Kafka should listen on `localhost:9092` with the default local configuration. Keep this terminal open.

8. Optional smoke test in another PowerShell window:

```powershell
$env:KAFKA_HOME = "C:\Kafka"
& "$env:KAFKA_HOME\bin\windows\kafka-topics.bat" --bootstrap-server localhost:9092 --create --if-not-exists --topic progressiveminds.events.v1
& "$env:KAFKA_HOME\bin\windows\kafka-topics.bat" --bootstrap-server localhost:9092 --list
```

If your extracted folder is versioned (for example `C:\kafka_2.13-4.x.y`), use that exact path instead of `C:\Kafka`.

## 3. Create the API project

Extract this ZIP. In PowerShell, change into `ProgressiveMinds_Phase1\backend\ProgressiveMinds.Api`.

```powershell
dotnet --list-sdks
dotnet restore
dotnet user-secrets init
```

Set development secrets. Replace the database password with your actual PostgreSQL password. Use a long random JWT signing key; this is a local development value, not a production secret.

```powershell
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=localhost;Port=5432;Database=progressiveminds;Username=postgres;Password=REPLACE_WITH_YOUR_POSTGRES_PASSWORD"
dotnet user-secrets set "Jwt:SigningKey" "REPLACE_WITH_A_RANDOM_SECRET_AT_LEAST_64_CHARACTERS_LONG"
dotnet user-secrets set "BootstrapAdmin:Email" "admin@progressiveminds.local"
dotnet user-secrets set "BootstrapAdmin:Password" "REPLACE_WITH_A_STRONG_LOCAL_ADMIN_PASSWORD"
dotnet user-secrets set "BootstrapAdmin:FirstName" "Progressive"
dotnet user-secrets set "BootstrapAdmin:LastName" "Admin"
```

If `dotnet user-secrets init` says a UserSecretsId already exists, continue.

Install EF tooling only if you don't already have it:

```powershell
dotnet tool list --global
```

If `dotnet-ef` is absent:

```powershell
dotnet tool install --global dotnet-ef --version 10.0.0
```

Create and apply the initial migration:

```powershell
dotnet ef migrations add InitialCreate
dotnet ef database update
```

Run the API:

```powershell
dotnet run --urls http://localhost:5080
```

Keep this terminal open. Test health in a browser at http://localhost:5080/health.

## 4. Run the frontend

Open a second PowerShell window in `frontend`:

```powershell
npm install
npm run dev
```

Open the local URL Vite prints (normally http://localhost:5173). Sign in with the bootstrap admin email and password configured in User Secrets.

## 5. Test the Kafka event path

1. Keep Kafka running.
2. Keep the API running.
3. Sign in to the frontend.
4. Click **Publish test event**.
5. Check the API terminal for the outbox publisher and consumer log messages.

The API writes the outbox row to PostgreSQL first. The background publisher sends it to Kafka and marks it published. The consumer logs the event and commits its Kafka offset.

## Useful commands

```powershell
# API build
dotnet build

# Frontend build
npm run build

# PostgreSQL service status
Get-Service *postgres*

# Kafka topic list
& "$env:KAFKA_HOME\bin\windows\kafka-topics.bat" --bootstrap-server localhost:9092 --list
```

## Troubleshooting

- **`dotnet` not recognized:** install .NET 10 SDK and reopen PowerShell.
- **No .NET 10 SDK:** use the official .NET 10 download above; do not target .NET 11 preview for this project.
- **PostgreSQL connection refused:** confirm the service is running and port 5432 is listening.
- **Password authentication failed:** update the User Secret connection string.
- **Kafka connection refused:** confirm the Kafka terminal is running and listening on 9092.
- **`JAVA_HOME` invalid:** point it to a JDK/JBR folder containing `bin\java.exe`, not to the `java.exe` file itself.
- **Frontend CORS:** the API allows `http://localhost:5173`; use that exact Vite origin for this starter.
- **JWT secret error:** set `Jwt:SigningKey` with User Secrets; don't commit it into `appsettings.json`.
- **Migration tool mismatch:** use EF tooling 10.x with the EF Core 10 packages in this project.

## Next phase

After Phase 1 runs, add institute setup, courses, subjects, academic sessions, batches, admissions, and student/guardian records. Then implement attendance as the first real business workflow using the same outbox pipeline.
