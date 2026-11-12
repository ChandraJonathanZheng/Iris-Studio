using IrisStudio.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace IrisStudio.Api.Tests;

public class MigrationModelTests
{
    // These checks need no running database. Startup calls MigrateAsync, which fails
    // if either provider's snapshot falls behind the shared application model.
    [Theory]
    [InlineData("SqlServer")]
    [InlineData("PostgreSql")]
    public void Every_provider_has_a_migration_for_the_current_model(string provider)
    {
        using AppDbContext db = provider == "SqlServer"
            ? new SqlServerDbContext(new DbContextOptionsBuilder<SqlServerDbContext>()
                .UseSqlServer("Server=localhost;Database=iris_migration_model;Integrated Security=True").Options)
            : new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
                .UseNpgsql("Host=localhost;Database=iris_migration_model;Username=unused").Options);

        Assert.False(db.Database.HasPendingModelChanges());
        Assert.EndsWith("_LessonReportsAndPasswordHistory", db.Database.GetMigrations().Last());
    }
}
