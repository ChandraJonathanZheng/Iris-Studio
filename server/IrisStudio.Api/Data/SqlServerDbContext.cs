using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace IrisStudio.Api.Data;

// A distinct context type keeps SQL Server migrations separate from PostgreSQL's history.
public sealed class SqlServerDbContext(DbContextOptions<SqlServerDbContext> options) : AppDbContext(options)
{
    protected override void ConfigureConventions(ModelConfigurationBuilder builder)
    {
        base.ConfigureConventions(builder);
        // SQL Server datetime2 does not preserve Kind; all persisted timestamps are UTC.
        builder.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
    }
}

internal sealed class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
    value => value,
    value => DateTime.SpecifyKind(value, DateTimeKind.Utc));
