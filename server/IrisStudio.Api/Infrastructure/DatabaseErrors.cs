using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace IrisStudio.Api.Infrastructure;

public static class DatabaseErrors
{
    public static bool IsUniqueViolation(DbUpdateException exception, string? constraint = null) =>
        exception.InnerException switch
        {
            PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } pg =>
                constraint is null || pg.ConstraintName == constraint,
            SqlException { Number: 2601 or 2627 } sql =>
                constraint is null || sql.Message.Contains($"'{constraint}'", StringComparison.Ordinal),
            _ => false,
        };
}
